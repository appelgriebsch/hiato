# ADR 0038: Staging, then a manual Promote

- Status: Accepted
- Date: 2026-10-06
- Deciders: Andreas Gerlach
- Supersedes: ADR 0022

## Context

ADR 0022 publishes Production on every merge to `main`. A bad commit is then already the learner site. The repository is public, so a GitHub Environment can stop the Production job until a person approves or rejects it.

## Decision

A push to `main` publishes Staging only. Production changes only when `appelgriebsch` approves that same built site. Deny leaves Production on the previous deployment. An approval for a commit that is no longer the tip of `main` does not publish.

Automatic production builds on the Pages project stay off. They are already off.

## Consequences

- One workflow builds the site once and uploads those bytes to Staging, then to Production after approval.
- Staging keeps a denied commit until a later push to `main` replaces it.
- Production rollback stays the existing `hiato-production` rollback.
- The approval button exists while the repository stays public (ADR 0039).
