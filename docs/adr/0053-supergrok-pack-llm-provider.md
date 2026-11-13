# ADR 0053: Selectable pack-script LLM providers — SuperGrok via Grok Build headless, and local OpenAI-compatible endpoints

- **Status**: Proposed
- **Date**: 2026-11-13
- **Deciders**: Andreas Gerlach
- **Supersedes**: none
- **Related issues**: #284, #267, #268, #266; related ADR 0048, 0030

## Context

The pack scripts use Mistral (`scripts/mistral-chat.ts`, `MISTRAL_API_KEY`) to do three jobs:

- gate v2 and the generate fallback in `example-sentences.ts`,
- glosses in `expand-packs.ts`,
- synonyms in `synonym-generate.ts`.

#267/#268 moved these calls to the xAI API with `XAI_API_KEY`. That billed paid Console credits fast, and #266 (bf7caed) reverted it.

Andreas has a SuperGrok subscription and is logged in to Grok Build (`grok login`, OAuth via auth.x.ai). The token is in `~/.grok/auth.json`, and the CLI refreshes it itself. That token reaches a private proxy (`cli-chat-proxy.grok.com`), not `api.x.ai`.

xAI documents headless mode (`grok -p`) for "scripts, bots, or other machine-friendly tasks", and it uses the cached login (https://docs.x.ai/build/cli/headless-scripting). The Acceptable Use Policy bans "unauthorized automated… script" access, reverse engineering and getting around rate limits (https://x.ai/legal/acceptable-use-policy). SuperGrok usage comes from one shared weekly pool, with no published size (https://docs.x.ai/grok/faq).

Andreas also wants a local mode: an OpenAI-compatible endpoint on his own machine, such as Ollama, LM Studio, a llama.cpp server or vLLM. These servers serve `/v1/models` and `/v1/chat/completions`. Support for `response_format` json_schema varies by server and version. Small local models may not be reliable PASS/FAIL judges for gate v2. The licence of a local model's output depends on the model.

## Decision

1. **Route.** Add Grok as a provider by shelling out to `grok -p --output-format json`. Hiato never reads `~/.grok/auth.json` and never calls the proxy or `api.x.ai` itself.
2. **Missing or expired login.** The run stops with a clear "run `grok login`" message. There is no automatic fallback to Mistral.
3. **Source label.** Add the label `'grok'` next to `'mistral'`. Existing entries do not change.
4. **Scope.** All three callers use one `PackLlm` interface. `PACK_LLM=mistral|grok|local` (or `--llm`) selects the provider, and the default is `mistral`. `scripts/mistral-chat.ts` becomes a shared OpenAI-compatible client (`scripts/llm/openai-compat.ts`). Mistral and local are two setups of this client. Grok has its own CLI adapter.
5. **Quota.** Each run has a `--max-calls` cap, and `grok usage` runs as a pre-flight check. Caches are saved when a run stops.
6. **Credit and licence.** Grok-written sentences may ship, credited "Grok (xAI)" in NOTICE and About. Before any Grok text ships, the output-ownership terms of xAI are checked and the result is recorded here. If the terms do not allow shipping, Grok is used only for the gate and glosses, and Mistral keeps writing the sentences. Andreas then decides again.

7. **Local provider.** `PACK_LLM=local` is configured with:
   - `LOCAL_LLM_BASE_URL` (default `http://localhost:11434/v1`),
   - `LOCAL_LLM_MODEL` (required),
   - `LOCAL_LLM_API_KEY` (optional bearer token, never logged),
   - `LOCAL_LLM_TIMEOUT_MS` (default 300 s),
   - `LOCAL_LLM_CONCURRENCY` (default 1).

   A pre-flight `GET /v1/models` stops the run with a clear message if the endpoint can't be reached or the model is missing. There is no provider fallback for generation. `response_format` is optional, and regex JSON extraction stays as the fallback. The source label is `'local'`, and the gate log records the model.
8. **Local gate needs calibration.** `--calibrate` re-gates a fixed, seeded, stratified sample of about 200 cached verdicts from `example-gate.json`, both pass and reject. With 95% agreement or more, the result is recorded per model in `scripts/data/local-models.json`, and the model may then run gate v2. Without a recorded pass, the gate runs on `PACK_GATE_LLM` (default `mistral`, or `grok`), and the run log says so.
9. **Local output ships only from approved models.** `scripts/data/local-models.json` lists each shippable model with its licence and Andreas's OK (`approved: true`). `packs:check` fails on any shipped `'local'` entry from a model that is not listed and approved. NOTICE and About credit each listed model.
10. **The licence gates cover every shipped output.** Decisions 6 and 9 apply to example sentences, glosses and synonyms, because glosses and synonyms ship in the packs too.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| `grok -p` headless (chosen) | Documented for scripts; uses the subscription login; no token code in Hiato | One process per call; beta CLI; temperature not settable per call |
| ACP `grok agent stdio` | Supported; one process for many calls | More code (JSON-RPC); only worth it if `-p` is too slow |
| Read `auth.json`, call the proxy directly | Fast; no CLI process | Unofficial client (AUP risk); private endpoint; re-implements the refresh |
| Local: separate `local-chat.ts` client | Isolated from Mistral | Duplicates the backoff and timeout code; the Mistral client is already OpenAI-shaped |
| Local gate: never allowed | Safest quality | Rules out fully local runs |
| Local gate: allowed with no check | Simplest | A wrong PASS from a small model ships a bad sentence |
| `XAI_API_KEY` on `api.x.ai` | Official API | Bills paid Console credits, which is why #267/#268 were reverted |

## Consequences

- There are new modules `scripts/llm/provider.ts`, `scripts/llm/openai-compat.ts` (replacing `mistral-chat.ts`, with Mistral behaviour and tests unchanged) and `scripts/llm/grok-cli.ts`. There is a new data file, `scripts/data/local-models.json`, holding licence, approval and calibration per model.
- Build order: shared client, then local, then the Grok adapter. Local can be tested before the live Grok check.
- Use is local only, with no CI job and no cloud secret. The token is never committed or logged. Tests stub `Bun.spawn` and never touch the real `~/.grok`.
- Determinism comes from the existing caches (`example-gate.json`, the gloss and synonym caches). Cache keys do not change, so switching provider does not re-spend. New gate entries record the provider and model.
- The guards do not change: `example-skip.txt`, the stock-name rule, `aunAsiMismatch`, `reuseCachedPass` and `packs:check`.
- Pack runs draw from Andreas's shared weekly SuperGrok pool. The cap limits how much one run can use.
- The Grok Build CLI is beta. The adapter passes `--no-auto-update` and records `grok --version`.

## Open items

- Step 0 live check (#284): per-call usage, throughput, session file location, and the exit-code and message for an auth failure.
- The output-ownership terms of xAI, which gate Decision 6.
- Which local models Andreas approves in `local-models.json` (Decision 9). Until he does, no local output ships.
