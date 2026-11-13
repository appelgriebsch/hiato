# ADR 0053: Local OpenAI-compatible LLM as pack-script default, Mistral as opt-in fallback

- **Status**: Proposed
- **Date**: 2026-11-13
- **Deciders**: Andreas Gerlach
- **Supersedes**: none
- **Related issues**: #284, #267, #268, #266; related ADR 0048, 0030

## Context

The pack scripts call an LLM for three jobs:

- gate v2 and the generate fallback in `example-sentences.ts`,
- glosses in `expand-packs.ts`,
- synonyms in `synonym-generate.ts`.

Today they call Mistral (`scripts/mistral-chat.ts`, `MISTRAL_API_KEY`). #267/#268 moved them to the paid xAI API, which used up credits fast, and #266 (bf7caed) reverted that.

Andreas runs the pack scripts locally on an Apple M4 Mac with 32 GB or more. He allows only Mistral open-weight models or Apple local models. Local OpenAI-compatible servers (Ollama, LM Studio, llama.cpp server, vLLM) serve `/v1/models` and `/v1/chat/completions`. Support for `response_format` json_schema varies by server and version. A local model may not be a reliable PASS/FAIL judge for gate v2. The licence of a model's output depends on the model. Sentences, glosses and synonyms all ship in the packs.

## Decision

1. **Default provider.** `PACK_LLM` defaults to `local`, and `mistral` stays selectable (`--llm`). All three callers use one `PackLlm` interface. `scripts/mistral-chat.ts` becomes a shared OpenAI-compatible client (`scripts/llm/openai-compat.ts`). Mistral and local are two setups of it, and Mistral behaviour does not change.
2. **Local configuration:**
   - `LOCAL_LLM_BASE_URL` (default `http://localhost:11434/v1`),
   - `LOCAL_LLM_MODEL` (required),
   - `LOCAL_LLM_API_KEY` (optional bearer token, never logged),
   - `LOCAL_LLM_TIMEOUT_MS` (default 300 s),
   - `LOCAL_LLM_CONCURRENCY` (default 1).

   `response_format` is optional, and regex JSON extraction stays as the fallback. `--max-calls` caps every run.
3. **Pre-flight.** `GET /v1/models` must answer and must list the model. Otherwise the run stops with a clear message.
4. **Local gate needs calibration.** `--calibrate` re-gates a fixed, seeded, stratified sample of about 200 cached verdicts from `example-gate.json`, both pass and reject. A result of 95% agreement or more is recorded per model in `scripts/data/local-models.json`, and only then does the model run gate v2. Otherwise the gate runs on `PACK_GATE_LLM`, which defaults to `mistral`.
5. **Mistral fallback is opt-in and used only for early failures.** With `PACK_LLM_FALLBACK=mistral` or `--fallback mistral`, a pre-flight failure switches the whole run to Mistral. Without it, the run stops with a clear message. A failure in the middle of a run never falls back: the run saves its caches and stops, and a re-run continues from the caches. Decision 4 handles the uncalibrated gate.
6. **Labels and logs.** Every entry records the provider that actually produced it (`'local'` or `'mistral'`). A fallback entry is `'mistral'`. New gate-log entries record `provider`, `model` and `fallback`. Each fallback writes one loud log line with the reason, and the run ends with a summary of calls per provider.
7. **Licence gate.** Local output ships only from models listed in `scripts/data/local-models.json` with their licence and `approved: true`, which is Andreas's OK. `packs:check` fails on any shipped `'local'` sentence, gloss or synonym from a model that is not listed and approved. NOTICE and About credit each approved model.
8. **Allowed families and starter model.** Every entry in `local-models.json` has a `family` field. `ALLOWED_FAMILIES = ['mistral', 'apple']`. The pre-flight rejects a `LOCAL_LLM_MODEL` that is not listed or has a disallowed family. `packs:check` fails on disallowed families in `local-models.json` and on any shipped `'local'` entry from such a model. An entry matches `LOCAL_LLM_MODEL` by any value in its `ids` list. The starter model is Mistral Small 3.2 24B Instruct 2506: family `mistral`, Apache-2.0, ids `mistral-small3.2:24b` (Ollama, Q4_K_M, 15 GB) and `mistralai/mistral-small-3.2` (LM Studio). It is listed with `approved: false` until Andreas flips it after a calibration. `apple` stays allowed, with one unapproved entry (Decision 10). OpenELM (research licence, mostly English) is out, and the on-device Apple model needs its own route (Decision 10).
9. **CI is unchanged.** CI runs no pack scripts, and `packs:check` makes no model calls. Tests stub `fetch`.
10. **Apple route is the built-in macOS 27 `fm serve`.** No third-party bridge. The scripts never start fm or run sudo; Andreas runs `fm serve` (default `http://127.0.0.1:1976/v1`, model `system`). Requests always send `Content-Type: application/json`, `stream: false` and `temperature: 0`, and no `tools`, `stop`, `n` or `max_tokens`. The apple pre-flight checks macOS 27 or later, `/usr/bin/fm`, `fm license --status` (exit 69 means "run `sudo fm license`"), `/health` listing `system` as available, and one `json_schema` probe (if it fails, plain JSON prompts are used). It records the macOS build. Batch size follows the entry's `contextTokens` (apple 4096, about 3.7K usable input), with a pre-call estimate and one halving on overflow. Output is labelled `'local'` with model `apple-fm-system@<macOS build>`, and apple approval applies only to the listed builds. Andreas's choices (Q15–Q17):
    - **Q15:** `local-models.json` lists `apple-fm-system` (ids `system`, `contextTokens` 4096) with `approved: false`, empty `builds`, `termsOk: null` and `credit: null`. This amends Q14 by that one entry. Local runs and `--calibrate` work; nothing ships.
    - **Q16:** fm output may ship only after Andreas reads `fm license --show` on his Mac and records a terms OK in an ADR. Until then `packs:check` fails on any shipped apple output, and NOTICE and About have no Apple credit line. Apple's terms forbid programmatic use "except as expressly permitted" and grant no output licence.
    - **Q17:** approval applies per listed macOS build. Calibration is keyed by build and is re-run after each OS update before Andreas adds the new build.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| Local default, Mistral opt-in fallback (chosen) | No API cost; uses the M4; spending money is explicit | Local quality must be calibrated; Andreas needs Ollama or LM Studio running |
| Mistral default (status quo) | Proven quality | API cost for every run |
| SuperGrok via Grok Build headless (`grok -p`) | Uses the subscription login | Beta CLI ("not for production"); shared weekly quota with Chat and Build; xAI output terms unchecked; dropped by Andreas on 2026-11-13 |
| SuperGrok token read from `~/.grok/auth.json` | Fast | Unofficial client against a private proxy; Acceptable Use Policy risk |
| `XAI_API_KEY` on `api.x.ai` | Official API | Paid Console credits; reverted in #266 |
| Automatic Mistral fallback | Runs finish unattended | Spends money without notice; mixes providers in one pack |
| Third-party Apple bridge (e.g. Apfel) | Bearer auth, honoured `max_tokens` | Extra install; Andreas chose Apple's built-in `fm serve` |
| Any other open-weight model family | Wider choice | Andreas allows only Mistral and Apple models; more licence variety to review |
| Local gate without calibration | Simplest | A wrong PASS ships a bad sentence |
| Separate `local-chat.ts` client | Isolated | Duplicates the backoff code; the Mistral client is already OpenAI-shaped |

## Consequences

- There are new modules `scripts/llm/provider.ts` and `scripts/llm/openai-compat.ts`, which replaces `mistral-chat.ts` with unchanged Mistral behaviour and tests. There is a new data file, `scripts/data/local-models.json`.
- Determinism comes from the existing caches. Cache keys do not change, so switching provider does not re-spend. The guards do not change: `example-skip.txt`, the stock-name rule, `aunAsiMismatch`, `reuseCachedPass` and `packs:check`.
- Glosses and synonyms have no automatic quality check. Andreas spot-checks one dry run per language before the first shipped local update.
- No local output ships until Andreas approves a model in `local-models.json`.
