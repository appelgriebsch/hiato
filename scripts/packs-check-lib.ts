/**
 * Pack completeness, exclusive bands, floors, license matrix (ADR 0026–0029),
 * #24 name/Hunspell/chip gates, and pack-language gloss (ADR 0030).
 * Pure helpers so bun:test can cover exclusive/license without walking disk twice.
 */
import {
  PACK_CEFR_LEVELS,
  PACK_CEFRS,
  PACK_LANGS,
  isPackCefr,
  isPackLang,
  type PackCefr,
  type PackLang,
  type WordPack,
} from '../src/packs/schema'
import { spoilerContains } from '../src/packs/spoilers'
import { isDeniedLemma, loadDenylist } from './lemma-denylist'
import { loadNameList, onNameList } from './lemma-names'
import { isPersonNameGloss } from './name-gloss'
import { isTemplateGloss, isWrongLanguageGloss, TEMPLATE_GLOSS_RE } from './gloss-quality'
import { dictsReady, isWordOfLang, membershipCacheArmed } from './lang-membership'
import {
  SYNONYM_CHIP_CAP,
  SYNONYM_COVERAGE_FLOOR,
  invalidSynonymChipReason,
  synonymCoverageRatio,
} from './synonym-chips'
import { EXISTING_CEFRS, foldKey, hangmanOk } from './pack-select'
import {
  buildLemmaEasiestByLang,
  hintCeilingViolations,
  isHintCeilingEnforcedRel,
  type PackBandSnapshot,
} from './hint-ceiling'

/** Hunspell, or a committed verdict cache that can answer without loading it. */
function membershipActive(): boolean {
  return dictsReady() || membershipCacheArmed()
}

export const PACK_MIN = 350
export const C2_MIN = 200
/** Warn (do not fail) when B2, C1, or C2 synonym coverage is under 70%. */
export const SYNONYM_WARN = 0.7
/** Fail C1/C2 only if synonym coverage is ~0 (pipeline broken). Not applied to B2. */
export const SYNONYM_BROKEN = 0.05

const DENY = loadDenylist()
const NAMES = loadNameList()

export type PackSnapshot = {
  rel: string
  pack: WordPack
}

export function expectedPackCount(): number {
  return PACK_LANGS.length * PACK_CEFRS.length
}

export function expectedPackRels(): string[] {
  return PACK_LANGS.flatMap((lang) =>
    PACK_CEFRS.map((cefr) => `${lang}/${cefr}.json`),
  )
}

export function packPathPattern(): RegExp {
  return new RegExp(
    `^(${PACK_LANGS.join('|')})/(${PACK_CEFR_LEVELS.join('|')})\\.json$`,
  )
}

export function lemmaFloor(cefr: PackCefr): number {
  return cefr === 'c2' ? C2_MIN : PACK_MIN
}

export function licenseBlob(pack: Pick<WordPack, 'license' | 'attribution'>): string {
  return [pack.license, ...pack.attribution].join('\n')
}

function hasCcBySa(blob: string): boolean {
  return /cc-by-sa/i.test(blob)
}

function hasCc0(blob: string): boolean {
  return /cc0/i.test(blob)
}

/** EN A1–B2 are CEFR-J citation / CC0; every other pack is SA (ADR 0029, #169). */
export function requiresCcBySa(lang: PackLang, cefr: PackCefr): boolean {
  return lang !== 'en' || cefr === 'c1' || cefr === 'c2'
}

export function requiresCc0Style(lang: PackLang, cefr: PackCefr): boolean {
  return lang === 'en' && (cefr === 'a1' || cefr === 'a2' || cefr === 'b1')
}

export function checkPackLicense(rel: string, pack: WordPack): string | null {
  const blob = licenseBlob(pack)
  const sa = hasCcBySa(blob)
  const cc0 = hasCc0(blob)

  if (requiresCcBySa(pack.lang, pack.cefr)) {
    if (cc0) {
      return `${rel}: ${pack.lang.toUpperCase()} ${pack.cefr.toUpperCase()} must not be labelled CC0 (ADR 0029 requires CC-BY-SA)`
    }
    if (!sa) {
      return `${rel}: ${pack.lang.toUpperCase()} ${pack.cefr.toUpperCase()} license/attribution must mention CC-BY-SA`
    }
    return null
  }

  if (pack.lang === 'pt' && !sa) {
    return `${rel}: PT pack license/attribution must mention CC-BY-SA`
  }

  if (requiresCc0Style(pack.lang, pack.cefr) && !cc0) {
    return `${rel}: ${pack.lang.toUpperCase()} ${pack.cefr.toUpperCase()} must keep CC0-style labelling`
  }

  if (pack.lang === 'en' && pack.cefr === 'b2') {
    if (sa) return `${rel}: EN B2 must not be labelled CC-BY-SA (ADR 0029)`
    if (!cc0) return `${rel}: EN B2 must keep CC0-style labelling`
    if (!/cefr-j|tono/i.test(blob)) {
      return `${rel}: EN B2 must cite CEFR-J / Tono Lab`
    }
    return null
  }

  return null
}

/** GitHub Actions and Cloudflare Pages set CI. A verdict-cache miss must fail there without loading Hunspell. */
export function failClosedOnHunspellMiss(env: { CI?: string } = process.env): boolean {
  return env.CI === 'true' || env.CI === '1'
}

export function checkLemmaFloor(rel: string, pack: WordPack): string | null {
  const floor = lemmaFloor(pack.cefr)
  if (pack.lemmas.length < floor) {
    return `${rel}: lemma count ${pack.lemmas.length} is below floor ${floor} (ADR 0026/0028)`
  }
  return null
}

export function synonymCoverage(pack: WordPack): number {
  if (pack.lemmas.length === 0) return 0
  const withSyn = pack.lemmas.filter(
    (L) => Array.isArray(L.synonyms) && L.synonyms.length > 0,
  ).length
  return withSyn / pack.lemmas.length
}

export function checkSynonymCoverage(
  rel: string,
  pack: WordPack,
): { error: string | null; warn: string | null } {
  if ((EXISTING_CEFRS as readonly string[]).includes(pack.cefr)) {
    const pct = synonymCoverageRatio(pack.lemmas, DENY)
    if (pct < SYNONYM_COVERAGE_FLOOR) {
      return {
        error: `${rel}: synonym chip coverage ${(pct * 100).toFixed(1)}% is below ${(SYNONYM_COVERAGE_FLOOR * 100).toFixed(0)}%`,
        warn: null,
      }
    }
    return { error: null, warn: null }
  }
  const scored = pack.cefr === 'b2' || pack.cefr === 'c1' || pack.cefr === 'c2'
  if (!scored) return { error: null, warn: null }
  const pct = synonymCoverage(pack)
  if ((pack.cefr === 'c1' || pack.cefr === 'c2') && pct < SYNONYM_BROKEN) {
    return {
      error: `${rel}: C1/C2 synonym coverage ${(pct * 100).toFixed(0)}% looks broken (pipeline ~0)`,
      warn: null,
    }
  }
  if (pct < SYNONYM_WARN) {
    return {
      error: null,
      warn: `${rel}: synonym coverage ${(pct * 100).toFixed(0)}% < ${(SYNONYM_WARN * 100).toFixed(0)}% (unique referents allowed; not failing)`,
    }
  }
  return { error: null, warn: null }
}

function cefrFromRel(rel: string): string {
  const base = rel.split(/[/\\]/).pop() ?? ''
  return base.replace(/\.json$/i, '').toLowerCase()
}

function isFrozenExistingPair(relA: string, relB: string): boolean {
  const a = cefrFromRel(relA)
  const b = cefrFromRel(relB)
  return (
    (EXISTING_CEFRS as readonly string[]).includes(a) &&
    (EXISTING_CEFRS as readonly string[]).includes(b)
  )
}

/**
 * A lemma may appear in at most one pack per language (ADR 0028).
 * A1–B1 files are frozen, so historical A1↔A2↔B1 duplicates are grandfathered;
 * B2–C2 must still be exclusive against every other pack (including A1–B1).
 */
export function exclusiveConflicts(files: PackSnapshot[]): string[] {
  const first = new Map<string, string>()
  const errors: string[] = []
  for (const { rel, pack } of files) {
    for (const L of pack.lemmas) {
      const key = `${pack.lang}:${foldKey(pack.lang, L.word)}`
      const prev = first.get(key)
      if (prev && prev !== rel) {
        if (isFrozenExistingPair(prev, rel)) continue
        errors.push(
          `lemma "${L.word}" in ${prev} and ${rel} (exclusive bands; DE ß/SS fold)`,
        )
      } else if (!prev) {
        first.set(key, rel)
      }
    }
  }
  return errors
}

export function checkCompleteness(rels: string[]): string[] {
  const errors: string[] = []
  const expected = expectedPackRels()
  const want = expectedPackCount()
  const pathRe = packPathPattern()
  const seen = new Set<string>()

  for (const rel of rels) {
    const posix = rel.split('\\').join('/')
    if (!pathRe.test(posix)) {
      errors.push(`${rel}: stray JSON (expected packs/{lang}/{cefr}.json)`)
      continue
    }
    seen.add(posix)
  }

  if (rels.length !== want) {
    errors.push(
      `expected exactly ${want} pack files (PACK_LANGS × PACK_CEFRS), found ${rels.length}`,
    )
  }

  for (const rel of expected) {
    if (!seen.has(rel)) {
      errors.push(`missing shipped pack public/packs/${rel}`)
    }
  }

  return errors
}

function assertString(v: unknown, label: string): string {
  if (typeof v !== 'string' || !v.trim()) {
    throw new Error(`${label} must be a non-empty string`)
  }
  return v
}

export function validatePack(raw: unknown, file: string): WordPack {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${file}: root must be an object`)
  }
  const o = raw as Record<string, unknown>

  if (typeof o.version !== 'number' || !Number.isFinite(o.version)) {
    throw new Error(`${file}: version must be a number`)
  }
  if (!isPackLang(o.lang)) {
    throw new Error(`${file}: lang must be en|de|es|pt`)
  }
  if (!isPackCefr(o.cefr)) {
    throw new Error(`${file}: cefr must be ${PACK_CEFR_LEVELS.join('|')}`)
  }
  assertString(o.license, `${file}: license`)
  if (!Array.isArray(o.attribution) || o.attribution.length === 0) {
    throw new Error(`${file}: attribution must be a non-empty string[]`)
  }
  for (const [i, a] of o.attribution.entries()) {
    assertString(a, `${file}: attribution[${i}]`)
  }
  if (!Array.isArray(o.lemmas) || o.lemmas.length === 0) {
    throw new Error(`${file}: lemmas must be a non-empty array`)
  }

  const seenFold = new Set<string>()
  const lemmas = o.lemmas.map((entry, i) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`${file}: lemmas[${i}] must be an object`)
    }
    const e = entry as Record<string, unknown>
    const word = assertString(e.word, `${file}: lemmas[${i}].word`).normalize('NFC')
    if (!hangmanOk(o.lang as PackLang, word)) {
      throw new Error(
        `${file}: lemmas[${i}] hangman — "${word}" must be 3–10 letters of ${o.lang}`,
      )
    }
    const fold = foldKey(o.lang as PackLang, word)
    if (seenFold.has(fold)) {
      throw new Error(`${file}: lemmas[${i}] duplicate fold-key "${word}"`)
    }
    seenFold.add(fold)
    const gloss = assertString(e.gloss, `${file}: lemmas[${i}].gloss`).normalize(
      'NFC',
    )
    let synonyms: string[] | undefined
    if (e.synonyms !== undefined) {
      if (!Array.isArray(e.synonyms)) {
        throw new Error(`${file}: lemmas[${i}].synonyms must be an array`)
      }
      if (e.synonyms.length > SYNONYM_CHIP_CAP) {
        throw new Error(
          `${file}: lemmas[${i}] synonyms length ${e.synonyms.length} exceeds cap ${SYNONYM_CHIP_CAP}`,
        )
      }
      synonyms = e.synonyms.map((s, j) => {
        const raw = assertString(s, `${file}: lemmas[${i}].synonyms[${j}]`)
        const reason = invalidSynonymChipReason(word, raw, DENY)
        if (reason) {
          throw new Error(
            `${file}: lemmas[${i}] synonyms[${j}] ${reason} — "${raw}"`,
          )
        }
        return raw.normalize('NFC')
      })
    }

    if (isDeniedLemma(word, DENY)) {
      throw new Error(`${file}: lemmas[${i}] denylist — lemma "${word}"`)
    }
    if (membershipActive() && !isWordOfLang(o.lang as PackLang, word)) {
      throw new Error(
        `${file}: lemmas[${i}] not a word of ${o.lang} — "${word}"`,
      )
    }
    if (isTemplateGloss(gloss)) {
      throw new Error(
        `${file}: lemmas[${i}] template gloss — "${word}" matches ${TEMPLATE_GLOSS_RE}`,
      )
    }
    if (
      isWrongLanguageGloss(
        o.lang as string,
        gloss,
        membershipActive() ? isWordOfLang : undefined,
      )
    ) {
      throw new Error(
        `${file}: lemmas[${i}] gloss not in pack language ${o.lang} — "${word}" / "${gloss}"`,
      )
    }
    if (onNameList(word, NAMES) && isPersonNameGloss(gloss, o.lang as string)) {
      throw new Error(
        `${file}: lemmas[${i}] person-name gloss — "${word}" / "${gloss}"`,
      )
    }
    if (gloss && spoilerContains(gloss, word)) {
      throw new Error(
        `${file}: lemmas[${i}] spoiler — gloss contains lemma "${word}"`,
      )
    }
    if (synonyms) {
      for (const [j, s] of synonyms.entries()) {
        if (spoilerContains(s, word)) {
          throw new Error(
            `${file}: lemmas[${i}] spoiler — synonyms[${j}] contains lemma "${word}"`,
          )
        }
      }
    }

    return { word, gloss, synonyms }
  })

  return {
    version: o.version,
    lang: o.lang,
    cefr: o.cefr,
    license: o.license as string,
    attribution: o.attribution as string[],
    lemmas,
  }
}

export { buildLemmaEasiestByLang, isHintCeilingEnforcedRel }

/**
 * Enforce hint ceiling for pack-lang A1–C2 rels (all twenty-four).
 * lemmaEasiestByLang must be built from the full snapshot AFTER every pack is parsed.
 */
export function checkHintCeiling(
  rel: string,
  pack: WordPack,
  lemmaEasiestByLang: Map<string, Map<string, string>>,
  stemCache: Record<string, Map<string, string[]>>,
  enTags: Map<string, string> | null,
): string[] {
  if (!isHintCeilingEnforcedRel(rel)) return []
  const easiest = lemmaEasiestByLang.get(pack.lang) ?? new Map()
  const stems = stemCache[pack.lang] ?? new Map()
  const errors: string[] = []
  for (const L of pack.lemmas) {
    const hits = hintCeilingViolations({
      lang: pack.lang,
      packBand: pack.cefr,
      gloss: L.gloss ?? '',
      synonyms: L.synonyms ?? [],
      lemmaEasiestBand: easiest,
      stemCache: stems,
      enEasiestTag: pack.lang === 'en' ? enTags : null,
    })
    for (const h of hits) {
      const where = h.kind === 'gloss' ? 'gloss' : 'synonym'
      const via = h.via === 'cefr-tag' ? 'CEFR tag' : h.via === 'stem' ? 'stem' : 'pack lemma'
      errors.push(
        `${rel}: hint ceiling — lemma "${L.word}" ${where} token "${h.token}" is ${h.band.toUpperCase()} (${via}${h.lemma ? `→${h.lemma}` : ''}); pack is ${pack.cefr.toUpperCase()}`,
      )
    }
  }
  return errors
}

export type { PackBandSnapshot }

