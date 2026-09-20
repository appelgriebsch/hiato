import type { PackLang } from './schema'

export interface PackLicenseInfo {
  lang: PackLang
  title: string
  license: string
  attribution: string[]
}

/** Static About copy — do not fetch every pack (ADR 0006). */
export const PACK_LICENSES: PackLicenseInfo[] = [
  {
    lang: 'en',
    title: 'English',
    license: 'CC0-1.0 (curated learner lemmas; glosses original to Hiato)',
    attribution: [
      'Hiato EN learner packs — original glosses and synonym chips (2026).',
      'Lemmas selected for CEFR A1–B1 classroom frequency; not a verbatim dump of any proprietary list.',
    ],
  },
  {
    lang: 'pt',
    title: 'Português',
    license:
      'CC-BY-SA-4.0 (lemmas curated from Wiktionary frequency + CEFR banding; glosses original to Hiato)',
    attribution: [
      'Portuguese lemmas curated from Wiktionary-derived frequency lists (CC-BY-SA).',
      'Glosses and synonym chips are original Hiato learner copy (2026).',
      'Share-alike applies to redistributed lemma lists derived from Wiktionary (ADR 0009).',
    ],
  },
  {
    lang: 'de',
    title: 'Deutsch',
    license: 'CC0-1.0 (curated learner lemmas; glosses original to Hiato)',
    attribution: [
      'Hiato DE learner packs — original German glosses and synonym chips (2026).',
      'Lemmas selected for CEFR A1–B1 classroom frequency; not a verbatim dump of any proprietary list.',
    ],
  },
  {
    lang: 'es',
    title: 'Español',
    license: 'CC0-1.0 (curated learner lemmas; glosses original to Hiato)',
    attribution: [
      'Hiato ES learner packs — original Spanish glosses and synonym chips (2026).',
      'Lemmas selected for CEFR A1–B1 classroom frequency; not a verbatim dump of any proprietary list.',
    ],
  },
]
