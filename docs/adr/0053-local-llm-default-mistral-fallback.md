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
8. **Allowed families and starter model.** Every entry in `local-models.json` has a `family` field. `ALLOWED_FAMILIES = ['mistral', 'apple']`. The pre-flight rejects a `LOCAL_LLM_MODEL` that is not listed or has a disallowed family. `packs:check` fails on disallowed families in `local-models.json` and on any shipped `'local'` entry from such a model. The starter model is TBD, pending Andreas's pick, and it is listed with `approved: false` until he gives his OK.
9. **CI is unchanged.** CI runs no pack scripts, and `packs:check` makes no model calls. Tests stub `fetch`.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| Local default, Mistral opt-in fallback (chosen) | No API cost; uses the M4; spending money is explicit | Local quality must be calibrated; Andreas needs Ollama or LM Studio running |
| Mistral default (status quo) | Proven quality | API cost for every run |
| SuperGrok via Grok Build headless (`grok -p`) | Uses the subscription login | Beta CLI ("not for production"); shared weekly quota with Chat and Build; xAI output terms unchecked; dropped by Andreas on 2026-11-13 |
| SuperGrok token read from `~/.grok/auth.json` | Fast | Unofficial client against a private proxy; Acceptable Use Policy risk |
| `XAI_API_KEY` on `api.x.ai` | Official API | Paid Console credits; reverted in #266 |
| Automatic Mistral fallback | Runs finish unattended | Spends money without notice; mixes providers in one pack |
| Any other open-weight model family | Wider choice | Andreas allows only Mistral and Apple models; more licence variety to review |
| Local gate without calibration | Simplest | A wrong PASS ships a bad sentence |
| Separate `local-chat.ts` client | Isolated | Duplicates the backoff code; the Mistral client is already OpenAI-shaped |

## Consequences

- There are new modules `scripts/llm/provider.ts` and `scripts/llm/openai-compat.ts`, which replaces `mistral-chat.ts` with unchanged Mistral behaviour and tests. There is a new data file, `scripts/data/local-models.json`.
- Determinism comes from the existing caches. Cache keys do not change, so switching provider does not re-spend. The guards do not change: `example-skip.txt`, the stock-name rule, `aunAsiMismatch`, `reuseCachedPass` and `packs:check`.
- Glosses and synonyms have no automatic quality check. Andreas spot-checks one dry run per language before the first shipped local update.
- No local output ships until Andreas approves a model in `local-models.json`.
