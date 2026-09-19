# ADR 0014: Unit tests — bun:test

- Status: Accepted
- Date: 2026-09-19
- Deciders: Andreas Gerlach

## Context
Need a test runner aligned with Bun as package manager.

## Decision
Use `bun:test` for unit tests (especially pure `src/engine/`).

## Consequences
- No Vitest in v1.
- Engine tests run with `bun test`.
