# ADR 0039: The repository stays public

- Status: Accepted
- Date: 2026-10-06
- Deciders: Andreas Gerlach
- Supersedes: ADR 0012

## Context

ADR 0012 created a private repository named `hiato`. The repository is public. On a public repository, GitHub required reviewers can gate a deployment. On a private repository, GitHub Free, Pro, and Team do not provide that control.

## Decision

The repository stays public, and its name stays `hiato`. Promote depends on that visibility.

## Consequences

- Making the repository private removes the Promote button on GitHub Free, Pro, and Team.
- The name in the PWA manifest stays Hiato.
