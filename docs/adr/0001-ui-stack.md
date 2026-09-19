# ADR 0001: UI stack — React + Zustand + shadcn

- Status: Accepted
- Date: 2026-09-19
- Deciders: Andreas Gerlach

## Context
Greenfield mobile-first language word-guess PWA. Need a stack that supports offline install, fun UX, and a clickable prototype via UX Uma before implementation.

## Decision
Use Vite + TypeScript + React + Zustand + shadcn/ui + Tailwind.

## Consequences
- Aligns with UX Uma (shadcn default when no design system given).
- Larger client than Svelte/Solid; acceptable for familiarity and prototype handoff.
- Rejected: Svelte/Solid lean path; Next/Remix/SSR; Redux/React Query for v1.
