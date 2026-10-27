# ADR 0042: CI-gated build-once deploy

- Status: Accepted
- Date: 2026-10-27
- Deciders: Andreas Gerlach
- Updates: ADR 0038, ADR 0013, ADR 0002

## Context

ADR 0038 builds on a push to `main` and promotes that artifact after approval. A `workflow_run` deploy sees the default-branch tip as `github.sha`, not the commit CI tested. Pages compiles `functions/` from the deploy checkout, not from `dist`. Wrangler was installed with npm outside the lockfile. Bun 1.4.2 dropped an empty `trustedDependencies` list and ran lifecycle scripts.

## Decision

Deploy runs only after the `CI` workflow completes successfully for a push to `main` of this repository. The build job checks out `workflow_run.head_sha`, sets `HIATO_BUILD_SHA`, and uploads one digest-checked artifact (`dist` and `functions/_generated`). Staging and Production deploy that artifact. They do not rebuild and do not run tests. Rollback stays the native Pages rollback `hiato-production`. There is no redeploy workflow.

Bun is 1.4.4, with `ignoreScripts` and an empty `trustedDependencies`. Wrangler 4.136.2 is an exact devDependency, installed with `bun install --frozen-lockfile --ignore-scripts`, and run as `node node_modules/wrangler/bin/wrangler.js`. `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are environment secrets on `staging` and `production`, set only on the pages deploy step.

`/api/health` returns `{"ok":true,"stage","sha"}` for a valid stage.

## Consequences

- A red CI run does not publish.
- Production and Staging serve the bytes CI tested, including the health sha.
- `bunx wrangler` stays forbidden in this checkout.
- Preview deployments are still not rollback targets (ADR 0038).
- ponytail: the package.json overrides undici 7.30.1 and sharp 0.35.5 lift miniflare's exact pins (undici 7.29.0, sharp 0.35.4) to the advisory floors. Drop them once wrangler's miniflare pins those versions or newer; re-check `bun audit` on every wrangler bump (an exact override silently downgrades a newer pin).
