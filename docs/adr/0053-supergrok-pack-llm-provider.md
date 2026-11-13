# ADR 0053: SuperGrok as a selectable pack-script LLM provider via Grok Build headless mode

- **Status**: Proposed
- **Date**: 2026-11-13
- **Deciders**: Andreas Gerlach
- **Supersedes**: none
- **Related issues**: #284, #267, #268, #266; related ADR 0048

## Context

The pack scripts use Mistral (`scripts/mistral-chat.ts`, `MISTRAL_API_KEY`) to do three jobs:

- gate v2 and the generate fallback in `example-sentences.ts`,
- glosses in `expand-packs.ts`,
- synonyms in `synonym-generate.ts`.

#267/#268 moved these calls to the xAI API with `XAI_API_KEY`. That billed paid Console credits fast, and #266 (bf7caed) reverted it.

Andreas has a SuperGrok subscription and is logged in to Grok Build (`grok login`, OAuth via auth.x.ai). The token is in `~/.grok/auth.json`, and the CLI refreshes it itself. That token reaches a private proxy (`cli-chat-proxy.grok.com`), not `api.x.ai`.

xAI documents headless mode (`grok -p`) for "scripts, bots, or other machine-friendly tasks", and it uses the cached login (https://docs.x.ai/build/cli/headless-scripting). The Acceptable Use Policy bans "unauthorized automated… script" access, reverse engineering and getting around rate limits (https://x.ai/legal/acceptable-use-policy). SuperGrok usage comes from one shared weekly pool, with no published size (https://docs.x.ai/grok/faq).

## Decision

1. **Route.** Add Grok as a provider by shelling out to `grok -p --output-format json`. Hiato never reads `~/.grok/auth.json` and never calls the proxy or `api.x.ai` itself.
2. **Missing or expired login.** The run stops with a clear "run `grok login`" message. There is no automatic fallback to Mistral.
3. **Source label.** Add the label `'grok'` next to `'mistral'`. Existing entries do not change.
4. **Scope.** All three callers use one `PackLlm` interface. `PACK_LLM=mistral|grok` (or `--llm`) selects the provider, and the default is `mistral`.
5. **Quota.** Each run has a `--max-calls` cap, and `grok usage` runs as a pre-flight check. Caches are saved when a run stops.
6. **Credit and licence.** Grok-written sentences may ship, credited "Grok (xAI)" in NOTICE and About. Before any Grok text ships, the output-ownership terms of xAI are checked and the result is recorded here. If the terms do not allow shipping, Grok is used only for the gate and glosses, and Mistral keeps writing the sentences. Andreas then decides again.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| `grok -p` headless (chosen) | Documented for scripts; uses the subscription login; no token code in Hiato | One process per call; beta CLI; temperature not settable per call |
| ACP `grok agent stdio` | Supported; one process for many calls | More code (JSON-RPC); only worth it if `-p` is too slow |
| Read `auth.json`, call the proxy directly | Fast; no CLI process | Unofficial client (AUP risk); private endpoint; re-implements the refresh |
| `XAI_API_KEY` on `api.x.ai` | Official API | Bills paid Console credits, which is why #267/#268 were reverted |

## Consequences

- There are new modules `scripts/llm/provider.ts` and `scripts/llm/grok-cli.ts`. `mistral-chat.ts` keeps its behaviour behind an adapter.
- Use is local only, with no CI job and no cloud secret. The token is never committed or logged. Tests stub `Bun.spawn` and never touch the real `~/.grok`.
- Determinism comes from the existing caches (`example-gate.json`, the gloss and synonym caches). Cache keys do not change, so switching provider does not re-spend. New gate entries record the provider and model.
- The guards do not change: `example-skip.txt`, the stock-name rule, `aunAsiMismatch`, `reuseCachedPass` and `packs:check`.
- Pack runs draw from Andreas's shared weekly SuperGrok pool. The cap limits how much one run can use.
- The Grok Build CLI is beta. The adapter passes `--no-auto-update` and records `grok --version`.

## Open items

- Step 0 live check (#284): per-call usage, throughput, session file location, and the exit-code and message for an auth failure.
- The output-ownership terms of xAI, which gate Decision 6.
