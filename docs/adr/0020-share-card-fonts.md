# ADR 0020: Share-card fonts — self-hosted OFL/SIL

- Status: Accepted
- Date: 2026-09-19
- Deciders: Andreas Gerlach

## Context
Share cards rendered offscreen need reliable fonts offline; licensing must be clean.

## Decision
Self-host OFL/SIL-licensed fonts only (e.g. Inter or Source Sans) for share-card rendering. Bundle in the app; no remote font CDN on the card path.

## Consequences
- Font files + license text in repo.
- System-UI-only rejected for consistent card look.
