# Third-party bill of materials

Direct dependencies declared by this repository. Rows returned by the PR #40 review were checked against public advisories on 2026-09-22. Rows no matched expert returned are marked `unknown` / `not checked`. The PR #128 review re-checked `bun` 1.4.2 on 2026-10-04 (MIT, no critical update, no CVE in 1.4.2). The PR #177 review re-checked `dictionary-it` 2.0.0 and `nspell` 2.1.5 on 2026-10-11 (no critical update, no CVE). The PR #213 review checked `@playwright/test` 1.64.1 on 2026-10-18 (Apache-2.0, no known vulnerabilities; CVE-2025-59288 was fixed in 1.55.1). The PR #217 review checked `bun` 1.4.4, `license-checker-rseidelsohn` 4.4.2, `oxlint` 1.90.0 and `wrangler` 4.136.2 against OSV on 2026-10-27 (no advisories); `undici`/`sharp` are overridden under wrangler to clear miniflare's pinned versions. Other rows were not re-checked.

| Name | Version | License | Critical update | CVEs |
| --- | --- | --- | --- | --- |
| @playwright/test | 1.64.1 | Apache-2.0 | | none found |
| @tailwindcss/vite | 4.3.3 | MIT | | none found |
| @types/node | 24.13.6 | unknown | | not checked |
| @types/react | 19.3.0 | unknown | | not checked |
| @types/react-dom | 19.3.0 | unknown | | not checked |
| @vitejs/plugin-react | 6.1.1 | MIT | | none found |
| bun | 1.4.4 | MIT | | none found |
| class-variance-authority | 0.7.1 | Apache-2.0 | | none found |
| clsx | 2.1.1 | MIT | | none found |
| dictionary-de | 3.0.0 | unknown | | not checked |
| dictionary-en | 4.0.0 | unknown | | not checked |
| dictionary-es | 4.0.0 | unknown | | not checked |
| dictionary-fr | 3.0.0 | MPL-2.0 | | not checked |
| dictionary-it | 2.0.0 | GPL-3.0 | | none found |
| dictionary-pt | 4.0.0 | unknown | | not checked |
| dictionary-pt-pt | 2.0.0 | unknown | | not checked |
| license-checker-rseidelsohn | 4.4.2 | BSD-3-Clause | | none found |
| nspell | 2.1.5 | MIT | | none found |
| oxlint | 1.90.0 | MIT | | none found |
| react | 19.3.0 | MIT | | none found |
| react-dom | 19.3.0 | MIT | | none found |
| react-router-dom | 7.18.4 | MIT | | none found |
| tailwind-merge | 3.7.0 | MIT | | none found |
| tailwindcss | 4.3.3 | MIT | | none found |
| typescript | 6.0.3 | unknown | | not checked |
| vite | 8.3.0 | MIT | | none found |
| vite-plugin-pwa | 1.3.0 | MIT | | none found |
| wrangler | 4.136.2 | MIT OR Apache-2.0 | | none found; miniflare pins undici 7.29.0 / sharp 0.35.4, lifted by package.json overrides to undici 7.30.1 / sharp 0.35.5 |
| zustand | 5.0.15 | MIT | | none found |
