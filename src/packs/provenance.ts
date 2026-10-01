import { PACK_LICENSES, type PackLicenseBand } from './licenses'
import type { PackCefr, PackLang } from './schema'
import { PACK_CEFR_LEVELS } from './schema'

/** Short UI fragments for the language-picker provenance caption (#80 / #100). */
export interface ProvenanceFragments {
  source: string
  license: string
  method: string
}

type SourceKey = 'curated' | 'cefrj' | 'octanove' | 'wiktionary' | 'wordhoard'
type MethodKey = 'curated' | 'tagged-syllabus' | 'tagged-addon' | 'frequency-rank'
type LicenseKey = 'CC0' | 'CC-BY-SA'

/** Honesty slot finer than PACK_LICENSES bands where ADR 0029 splits methods (EN A1–B1 vs B2). */
type ProvenanceSlot =
  | 'en-low'
  | 'en-b2'
  | 'en-high'
  | 'pt-all'
  | 'de-low'
  | 'de-high'
  | 'es-low'
  | 'es-high'

const SOURCE_COPY: Record<PackLang, Record<SourceKey, string>> = {
  en: {
    curated: 'Learner lemmas',
    cefrj: 'CEFR-J',
    octanove: 'Octanove',
    wiktionary: 'Wiktionary',
    wordhoard: 'wordhoard',
  },
  pt: {
    curated: 'Lemmas do aprendiz',
    cefrj: 'CEFR-J',
    octanove: 'Octanove',
    wiktionary: 'Wiktionary',
    wordhoard: 'wordhoard',
  },
  de: {
    curated: 'Lerner-Lemmata',
    cefrj: 'CEFR-J',
    octanove: 'Octanove',
    wiktionary: 'Wiktionary',
    wordhoard: 'wordhoard',
  },
  es: {
    curated: 'Lemas de aprendizaje',
    cefrj: 'CEFR-J',
    octanove: 'Octanove',
    wiktionary: 'Wiktionary',
    wordhoard: 'wordhoard',
  },
}

const METHOD_COPY: Record<PackLang, Record<MethodKey, string>> = {
  en: {
    curated: 'curated',
    'tagged-syllabus': 'tagged syllabus',
    'tagged-addon': 'tagged add-on',
    'frequency-rank': 'frequency-rank',
  },
  pt: {
    curated: 'curado',
    'tagged-syllabus': 'sílabo etiquetado',
    'tagged-addon': 'complemento etiquetado',
    'frequency-rank': 'por frequência',
  },
  de: {
    curated: 'kuratiert',
    'tagged-syllabus': 'Syllabus (getaggt)',
    'tagged-addon': 'Add-on (getaggt)',
    'frequency-rank': 'Frequenzband',
  },
  es: {
    curated: 'curado',
    'tagged-syllabus': 'temario etiquetado',
    'tagged-addon': 'complemento etiquetado',
    'frequency-rank': 'por frecuencia',
  },
}

const PACK_INFO_COPY: Record<PackLang, string> = {
  en: 'Pack info',
  pt: 'Info do pacote',
  de: 'Paket-Info',
  es: 'Info del paquete',
}

/** Slot → short keys (license still verified against the PACK_LICENSES band). */
const SLOT_META: Record<
  ProvenanceSlot,
  { source: SourceKey; method: MethodKey; license: LicenseKey }
> = {
  'en-low': { source: 'curated', method: 'curated', license: 'CC0' },
  'en-b2': { source: 'cefrj', method: 'tagged-syllabus', license: 'CC0' },
  'en-high': { source: 'octanove', method: 'tagged-addon', license: 'CC-BY-SA' },
  'pt-all': {
    source: 'wiktionary',
    method: 'frequency-rank',
    license: 'CC-BY-SA',
  },
  'de-low': { source: 'curated', method: 'curated', license: 'CC0' },
  'de-high': {
    source: 'wordhoard',
    method: 'frequency-rank',
    license: 'CC-BY-SA',
  },
  'es-low': { source: 'curated', method: 'curated', license: 'CC0' },
  'es-high': {
    source: 'wordhoard',
    method: 'frequency-rank',
    license: 'CC-BY-SA',
  },
}

function cefrIndex(cefr: PackCefr): number {
  return PACK_CEFR_LEVELS.indexOf(cefr)
}

/** Whether `cefr` falls in a PACK_LICENSES `levels` range like `A1–B2` or `A1-B2`. */
export function cefrInBandLevels(cefr: PackCefr, levels: string): boolean {
  // Accept en-dash (PACK_LICENSES) and ASCII hyphen (callers / typos).
  const normalized = levels.replace(/[\u2013\u2014]/g, '-')
  const m = normalized.match(/^([A-Ca-c][12])-([A-Ca-c][12])$/)
  if (!m) return false
  const lo = m[1]!.toLowerCase() as PackCefr
  const hi = m[2]!.toLowerCase() as PackCefr
  const i = cefrIndex(cefr)
  const iLo = cefrIndex(lo)
  const iHi = cefrIndex(hi)
  if (i < 0 || iLo < 0 || iHi < 0) return false
  return i >= iLo && i <= iHi
}

/** Matching About band for lang×CEFR (ADR 0029 / PACK_LICENSES). */
export function provenanceBand(
  lang: PackLang,
  cefr: PackCefr,
): PackLicenseBand | undefined {
  const info = PACK_LICENSES.find((p) => p.lang === lang)
  return info?.bands.find((b) => cefrInBandLevels(cefr, b.levels))
}

function provenanceSlot(lang: PackLang, cefr: PackCefr): ProvenanceSlot {
  if (lang === 'pt') return 'pt-all'
  if (lang === 'en') {
    if (cefr === 'c1' || cefr === 'c2') return 'en-high'
    if (cefr === 'b2') return 'en-b2'
    return 'en-low'
  }
  if (lang === 'de') {
    return cefr === 'b2' || cefr === 'c1' || cefr === 'c2' ? 'de-high' : 'de-low'
  }
  return cefr === 'b2' || cefr === 'c1' || cefr === 'c2' ? 'es-high' : 'es-low'
}

/** Short license label derived from the PACK_LICENSES band text.
 * Only known CC0 / CC-BY-SA bands — never default unknown to CC0. */
export function shortLicenseFromBand(band: PackLicenseBand): LicenseKey {
  if (/CC-BY-SA/i.test(band.license) || /BY-SA/i.test(band.license)) {
    return 'CC-BY-SA'
  }
  if (/CC0/i.test(band.license)) return 'CC0'
  throw new Error(
    `Unknown license in PACK_LICENSES band ${band.levels}: ${band.license}`,
  )
}

/**
 * Three short UI fragments for the picker caption.
 * `uiLang` defaults to the selected pack language (#100).
 */
export function provenanceFragments(
  lang: PackLang,
  cefr: PackCefr,
  uiLang: PackLang = lang,
): ProvenanceFragments {
  const slot = provenanceSlot(lang, cefr)
  const meta = SLOT_META[slot]
  const band = provenanceBand(lang, cefr)
  const license = band ? shortLicenseFromBand(band) : meta.license
  return {
    source: SOURCE_COPY[uiLang][meta.source],
    license,
    method: METHOD_COPY[uiLang][meta.method],
  }
}

/** Compose `source · license band · CEFR method` (ellipsis handled by CSS). */
export function provenanceCaption(
  lang: PackLang,
  cefr: PackCefr,
  uiLang?: PackLang,
): string {
  const f = provenanceFragments(lang, cefr, uiLang ?? lang)
  return `${f.source} · ${f.license} · ${f.method}`
}

/** Quiet Pack-info control label (links to About). */
export function packInfoLabel(uiLang: PackLang): string {
  return PACK_INFO_COPY[uiLang]
}
