import type { PackLang } from './schema'

/** One CEFR license band on a language card (ADR 0029). */
export interface PackLicenseBand {
  levels: string
  license: string
  notes: string[]
}

export interface PackLicenseInfo {
  lang: PackLang
  title: string
  /** Flattened band summary so About still compiles (copy ticket is separate). */
  license: string
  attribution: string[]
  bands: PackLicenseBand[]
}

function fromBands(
  lang: PackLang,
  title: string,
  bands: PackLicenseBand[],
): PackLicenseInfo {
  return {
    lang,
    title,
    license: bands.map((b) => `${b.levels}: ${b.license}`).join(' · '),
    attribution: bands.flatMap((b) => [`${b.levels} — ${b.license}`, ...b.notes]),
    bands,
  }
}

/** Static About copy — do not fetch every pack (ADR 0006). */
export const PACK_LICENSES: PackLicenseInfo[] = [
  fromBands('en', 'English', [
    {
      levels: 'A1–B2',
      license: 'CC0-1.0 / CEFR-J citation (Tono Lab)',
      notes: [
        'A1–B1: curated learner lemmas; glosses original to Hiato.',
        'B2 lemmas selected from the CEFR-J Vocabulary Profile (Tono Laboratory, Tokyo University of Foreign Studies). Cite Tono Lab / CEFR-J; not a verbatim dump.',
      ],
    },
    {
      levels: 'C1–C2',
      license: 'CC-BY-SA-4.0 (Octanove Vocabulary Profile)',
      notes: [
        'English C1/C2 lemmas selected from the Octanove Vocabulary Profile (olp-en-cefrj, CC-BY-SA-4.0) as a tagged add-on above CEFR-J.',
        'Share-alike applies to the redistributed lemma list. Glosses and synonym chips are original Hiato learner copy.',
      ],
    },
  ]),
  fromBands('pt', 'Português', [
    {
      levels: 'A1–C2',
      license: 'CC-BY-SA-4.0 (Wiktionary / OpenSubtitles frequency)',
      notes: [
        'All PT levels: lemmas curated from Wiktionary-derived / OpenSubtitles frequency lists (CC-BY-SA path, ADR 0009).',
        'C-levels are frequency-rank slices, not CAPLE lists (ADR 0029).',
        'Frequency selection aided by hermitdave/FrequencyWords (MIT); glosses and synonym chips are original Hiato learner copy.',
      ],
    },
  ]),
  fromBands('de', 'Deutsch', [
    {
      levels: 'A1–B1',
      license: 'CC0-1.0 (curated learner lemmas; glosses original to Hiato)',
      notes: [
        'Lemmas selected for CEFR classroom frequency from open frequency resources (FrequencyWords MIT; wordhoard samples where used).',
        'Not a verbatim dump of any proprietary list (ADR 0026).',
      ],
    },
    {
      levels: 'B2–C2',
      license: 'CC-BY-SA-4.0 (wordhoard-full frequency-rank bands)',
      notes: [
        'DE B2–C2 lemmas are frequency-rank bands from wordhoard v0.1.0 (CC-BY-SA-4.0), not Goethe lists (ADR 0029).',
        'Share-alike applies to the redistributed lemma list. Glosses and synonym chips are original Hiato learner copy.',
      ],
    },
  ]),
  fromBands('es', 'Español', [
    {
      levels: 'A1–B1',
      license: 'CC0-1.0 (curated learner lemmas; glosses original to Hiato)',
      notes: [
        'Lemmas selected for CEFR classroom frequency from open frequency resources (FrequencyWords MIT; wordhoard samples where used).',
        'Not a verbatim dump of any proprietary list (ADR 0026).',
      ],
    },
    {
      levels: 'B2–C2',
      license: 'CC-BY-SA-4.0 (wordhoard-full frequency-rank bands)',
      notes: [
        'ES B2–C2 lemmas are frequency-rank bands from wordhoard v0.1.0 (CC-BY-SA-4.0), not Instituto Cervantes lists (ADR 0029).',
        'Share-alike applies to the redistributed lemma list. Glosses and synonym chips are original Hiato learner copy.',
      ],
    },
  ]),
]
