# Pack size report — EndCard enrichment (EPIC #313 / #299, M5 #319)

Measured 2026-11-21 on the rebased stack top (`vibe/319-m5-size-hardening-rollout-2cfd86`)
against `origin/main`, recorded against ADR 0026 per ADR 0055 decision 5 (packs are
runtime-cached per selected language via NetworkFirst `hiato-packs`, not precached —
ADR 0006). Raw JSON bytes on disk; the wire cost is lower (gzip).

| Pack | main | stack | delta | delta % | version main → stack |
| --- | ---: | ---: | ---: | ---: | --- |
| `public/packs/de/a1.json` | 65.2 KB | 118.6 KB | +53.5 KB | +82.1% | 19 → 24 |
| `public/packs/de/a2.json` | 67.3 KB | 129.3 KB | +62.0 KB | +92.0% | 24 → 30 |
| `public/packs/de/b1.json` | 72.4 KB | 133.9 KB | +61.5 KB | +84.9% | 21 → 27 |
| `public/packs/de/b2.json` | 77.3 KB | 129.0 KB | +51.7 KB | +66.9% | 16 → 21 |
| `public/packs/de/c1.json` | 55.8 KB | 137.9 KB | +82.1 KB | +147.0% | 10 → 16 |
| `public/packs/de/c2.json` | 52.7 KB | 139.5 KB | +86.8 KB | +164.8% | 10 → 17 |
| `public/packs/en/a1.json` | 65.9 KB | 121.0 KB | +55.0 KB | +83.5% | 14 → 20 |
| `public/packs/en/a2.json` | 70.1 KB | 119.8 KB | +49.7 KB | +71.0% | 15 → 20 |
| `public/packs/en/b1.json` | 75.3 KB | 125.8 KB | +50.5 KB | +67.0% | 18 → 23 |
| `public/packs/en/b2.json` | 84.2 KB | 133.5 KB | +49.3 KB | +58.6% | 10 → 15 |
| `public/packs/en/c1.json` | 66.6 KB | 143.1 KB | +76.4 KB | +114.7% | 6 → 12 |
| `public/packs/en/c2.json` | 67.0 KB | 149.3 KB | +82.2 KB | +122.6% | 7 → 13 |
| `public/packs/es/a1.json` | 66.0 KB | 112.4 KB | +46.4 KB | +70.3% | 21 → 26 |
| `public/packs/es/a2.json` | 68.9 KB | 116.9 KB | +47.9 KB | +69.5% | 23 → 28 |
| `public/packs/es/b1.json` | 71.8 KB | 126.8 KB | +55.0 KB | +76.6% | 26 → 32 |
| `public/packs/es/b2.json` | 82.5 KB | 136.8 KB | +54.3 KB | +65.8% | 13 → 19 |
| `public/packs/es/c1.json` | 54.6 KB | 130.6 KB | +76.1 KB | +139.5% | 15 → 22 |
| `public/packs/es/c2.json` | 58.3 KB | 139.8 KB | +81.5 KB | +139.8% | 14 → 21 |
| `public/packs/fr/a1.json` | 67.8 KB | 123.1 KB | +55.3 KB | +81.6% | 9 → 14 |
| `public/packs/fr/a2.json` | 73.3 KB | 122.3 KB | +49.0 KB | +66.8% | 11 → 15 |
| `public/packs/fr/b1.json` | 73.1 KB | 130.3 KB | +57.2 KB | +78.2% | 13 → 18 |
| `public/packs/fr/b2.json` | 77.9 KB | 131.8 KB | +53.9 KB | +69.2% | 13 → 18 |
| `public/packs/fr/c1.json` | 61.3 KB | 138.8 KB | +77.5 KB | +126.5% | 8 → 13 |
| `public/packs/fr/c2.json` | 54.2 KB | 130.0 KB | +75.7 KB | +139.6% | 9 → 14 |
| `public/packs/it/a1.json` | 64.1 KB | 114.0 KB | +49.9 KB | +77.8% | 8 → 13 |
| `public/packs/it/a2.json` | 65.3 KB | 114.8 KB | +49.5 KB | +75.7% | 13 → 17 |
| `public/packs/it/b1.json` | 72.7 KB | 121.9 KB | +49.2 KB | +67.6% | 14 → 18 |
| `public/packs/it/b2.json` | 75.8 KB | 121.7 KB | +45.9 KB | +60.5% | 14 → 18 |
| `public/packs/it/c1.json` | 57.2 KB | 129.6 KB | +72.4 KB | +126.6% | 6 → 12 |
| `public/packs/it/c2.json` | 55.9 KB | 133.0 KB | +77.0 KB | +137.7% | 7 → 13 |
| `public/packs/pt/a1.json` | 66.2 KB | 113.7 KB | +47.5 KB | +71.8% | 20 → 116 |
| `public/packs/pt/a2.json` | 70.1 KB | 119.5 KB | +49.4 KB | +70.5% | 16 → 111 |
| `public/packs/pt/b1.json` | 69.4 KB | 119.0 KB | +49.6 KB | +71.5% | 20 → 117 |
| `public/packs/pt/b2.json` | 75.3 KB | 123.9 KB | +48.7 KB | +64.7% | 19 → 115 |
| `public/packs/pt/c1.json` | 56.8 KB | 138.6 KB | +81.8 KB | +143.8% | 16 → 113 |
| `public/packs/pt/c2.json` | 56.4 KB | 139.3 KB | +82.9 KB | +147.0% | 16 → 112 |

**Totals:** 2.36 MB → 4.50 MB (+2194 KB, +90.9%), average +94.3% per pack.

ADR 0055 estimated ~+30–40% per pack. The actual average is higher because C1/C2 packs
gained example sentences in M3 (ADR 0056) and every pack gained pos/ipa/family in M1/M2
(incl. the wiktextract + gated Mistral fills); A1–B2 packs sit lower than C1/C2. All 36
packs bumped `version` (enforced against `scripts/data/pack-pin.json` by `packs:check`),
so `load.ts` discards stale caches on the next online load; stale caches keep working
without the optional fields (no migration — covered by `load.test.ts`).
