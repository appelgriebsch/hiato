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
  /** Flattened band summary (About renders `bands`; this stays for pack-adjacent copy). */
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
      license:
        'CEFR-J Wordlist terms: free use with citation (© Tono Laboratory, TUFS)',
      notes: [
        'The CEFR-J Wordlist Version 1.5. Compiled by Yukio Tono, Tokyo University of Foreign Studies. Retrieved from http://www.cefr-j.org/download.html on 1/20/2020 (via openlanguageprofiles/olp-en-cefrj).',
        'A1–B2 lemmas are selected from that wordlist at the same level. Copyright © Tono Laboratory, TUFS. Free for research and commercial use with that citation. Not a public-domain dedication and not a verbatim dump. Glosses original to Hiato.',
      ],
    },
    {
      levels: 'C1–C2',
      license: 'CC-BY-SA-4.0 (Octanove Vocabulary Profile)',
      notes: [
        'English C1/C2 lemmas selected from the Octanove Vocabulary Profile (CC-BY-SA-4.0) as a tagged add-on above CEFR-J.',
        'Creator: Octanove Labs. Source: https://github.com/openlanguageprofiles/olp-en-cefrj',
        'Share-alike applies to the redistributed lemma list. Glosses and synonym chips are original Hiato learner copy.',
      ],
    },
  ]),
  fromBands('pt', 'Português', [
    {
      levels: 'A1–C2',
      license: 'CC-BY-SA-4.0 (FrequencyWords pt_50k)',
      notes: [
        'Portuguese lemmas, including the original v0 packs and later bands, come from hermitdave/FrequencyWords content/2018/pt/pt_50k.txt (OpenSubtitles frequency). Content CC-BY-SA-4.0; the FrequencyWords code is MIT. Not a Wiktionary dump.',
        'Creator: Hermit Dave. Source: https://github.com/hermitdave/FrequencyWords',
        'C-levels are frequency-rank slices, not CAPLE lists (ADR 0029).',
        'Share-alike applies to the redistributed lemma list. Glosses and synonym chips are original Hiato learner copy.',
      ],
    },
  ]),
  fromBands('de', 'Deutsch', [
    {
      levels: 'A1–B1',
      license: 'CC-BY-SA-4.0 (wordhoard samples; glosses original to Hiato)',
      notes: [
        'DE A1–B1 lemmas come from the wordhoard v0.1.0 samples (CC-BY-SA-4.0). The German CEFR estimate is calibrated against Goethe-Institut A1–B1 lists, not copied from them.',
        'Creator: natema. Source: https://github.com/natema/wordhoard. Also credit Wiktionary contributors and OpenSubtitles via hermitdave/FrequencyWords, as the wordhoard NOTICE requires.',
        'Share-alike applies to the redistributed lemma list. Glosses and synonym chips are original Hiato learner copy (ADR 0026).',
      ],
    },
    {
      levels: 'B2–C2',
      license: 'CC-BY-SA-4.0 (wordhoard-full frequency-rank bands)',
      notes: [
        'DE B2–C2 lemmas are frequency-rank bands from wordhoard v0.1.0 (CC-BY-SA-4.0). German CEFR labels in that dataset are calibrated against Goethe-Institut lists, not copied from them (ADR 0029).',
        'Creator: natema. Source: https://github.com/natema/wordhoard. Also credit Wiktionary contributors and OpenSubtitles via hermitdave/FrequencyWords, as the wordhoard NOTICE requires.',
        'Share-alike applies to the redistributed lemma list. Glosses and synonym chips are original Hiato learner copy.',
      ],
    },
  ]),
  fromBands('es', 'Español', [
    {
      levels: 'A1–B1',
      license: 'CC-BY-SA-4.0 (wordhoard samples; glosses original to Hiato)',
      notes: [
        'ES A1–B1 lemmas come from the wordhoard v0.1.0 samples (CC-BY-SA-4.0), banded by its frequency-calibrated CEFR estimate, not Instituto Cervantes lists.',
        'Creator: natema. Source: https://github.com/natema/wordhoard. Also credit Wiktionary contributors and OpenSubtitles via hermitdave/FrequencyWords, as the wordhoard NOTICE requires.',
        'Share-alike applies to the redistributed lemma list. Glosses and synonym chips are original Hiato learner copy (ADR 0026).',
      ],
    },
    {
      levels: 'B2–C2',
      license: 'CC-BY-SA-4.0 (wordhoard-full frequency-rank bands)',
      notes: [
        'ES B2–C2 lemmas are frequency-rank bands from wordhoard v0.1.0 (CC-BY-SA-4.0), not Instituto Cervantes lists (ADR 0029).',
        'Creator: natema. Source: https://github.com/natema/wordhoard. Also credit Wiktionary contributors and OpenSubtitles via hermitdave/FrequencyWords, as the wordhoard NOTICE requires.',
        'Share-alike applies to the redistributed lemma list. Glosses and synonym chips are original Hiato learner copy.',
      ],
    },
  ]),
]
