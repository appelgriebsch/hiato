/**
 * Italian membership checker for dictionary-it.
 *
 * nspell expands every affix form into a hash at init. dictionary-it flags
 * about 22k stems with prefix rules whose adds are elisions (`l'`, `dell'`,
 * `un'`, …) and those prefixes cross-product with verb suffixes, so init
 * stores tens of millions of keys and climbs past 3 GB without finishing.
 * Hunspell itself checks affixes at lookup. This checker does the same with
 * nspell's parsed rules: a surface is good when it is a stem, a suffix of a
 * flagged stem, or (only if the surface contains `'`) a prefix / pair.
 * Every dictionary-it prefix add contains `'`. Apostrophe-free lemmas, which
 * is the whole hangman set, never take the prefix path. If a future affix
 * adds a prefix without `'`, that fast path turns off.
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const parseAffix = require('nspell/lib/util/affix.js') as (buf: Buffer) => {
  rules: Record<
    string,
    {
      type: 'PFX' | 'SFX'
      combineable: boolean
      entries: {
        add: string
        remove: RegExp | string
        match: RegExp | string
      }[]
    }
  >
}

type Kind = 'PFX' | 'SFX'

type Entry = {
  flag: string
  type: Kind
  combineable: boolean
  add: string
  removeLiteral: string
  removeRe: RegExp | null
  match: RegExp | null
}

export type ItalianSpell = { correct(word: string): boolean }

function removeLiteral(remove: RegExp | string, type: Kind): string {
  if (!remove) return ''
  if (typeof remove === 'string') return remove
  if (type !== 'SFX' || !remove.source.endsWith('$')) {
    throw new Error(`unexpected affix remove ${String(remove)}`)
  }
  return remove.source.slice(0, -1)
}

function applyEntry(entry: Entry, input: string): string | null {
  if (entry.match && !entry.match.test(input)) return null
  if (entry.type === 'SFX') {
    const stripped = entry.removeRe ? input.replace(entry.removeRe, '') : input
    return stripped + entry.add
  }
  const stripped = entry.removeLiteral
    ? input.replace(entry.removeLiteral, '')
    : input
  return entry.add + stripped
}

function hasFlag(flags: string, flag: string): boolean {
  return flags.includes(flag)
}

/** Skip the dic count line, same as nspell's dictionary parser. */
function parseStems(dic: string): Map<string, string> {
  const stems = new Map<string, string>()
  let start = dic.indexOf('\n') + 1
  while (start > 0 && start <= dic.length) {
    let end = dic.indexOf('\n', start)
    if (end < 0) end = dic.length
    const line = dic.slice(start, end)
    start = end + 1
    if (!line || line.charCodeAt(0) === 9) continue
    const word = stemWord(line)
    if (!word) continue
    const codes = stemCodes(line)
    const prev = stems.get(word.word)
    stems.set(word.word, prev === undefined ? codes : prev + codes)
  }
  return stems
}

function stemWord(line: string): { word: string } | null {
  let slash = line.indexOf('/')
  while (slash > 0 && line.charCodeAt(slash - 1) === 92) {
    line = line.slice(0, slash - 1) + line.slice(slash)
    slash = line.indexOf('/', slash)
  }
  const hash = line.indexOf('#')
  let word: string
  if (hash > -1 && (slash < 0 || hash < slash)) word = line.slice(0, hash)
  else if (slash > -1) word = line.slice(0, slash)
  else word = line
  word = word.trim()
  return word ? { word } : null
}

function stemCodes(line: string): string {
  let slash = line.indexOf('/')
  while (slash > 0 && line.charCodeAt(slash - 1) === 92) {
    line = line.slice(0, slash - 1) + line.slice(slash)
    slash = line.indexOf('/', slash)
  }
  if (slash < 0) return ''
  const hash = line.indexOf('#')
  if (hash > -1 && hash < slash) return ''
  const rest = line.slice(slash + 1)
  const ws = rest.search(/\s/)
  return (ws < 0 ? rest : rest.slice(0, ws)).trim()
}

export function italianSpell(
  aff: Uint8Array | string,
  dic: Uint8Array | string,
): ItalianSpell {
  const affBuf = typeof aff === 'string' ? Buffer.from(aff) : Buffer.from(aff)
  const dicText = typeof dic === 'string' ? dic : Buffer.from(dic).toString('utf8')
  const parsed = parseAffix(affBuf)
  const sfxByAdd = new Map<string, Entry[]>()
  const pfxByAdd = new Map<string, Entry[]>()
  let apostropheOnlyPrefixes = true

  for (const [flag, rule] of Object.entries(parsed.rules)) {
    for (const raw of rule.entries) {
      const entry: Entry = {
        flag,
        type: rule.type,
        combineable: rule.combineable,
        add: raw.add || '',
        removeLiteral: removeLiteral(raw.remove, rule.type),
        removeRe: raw.remove instanceof RegExp ? raw.remove : null,
        match: raw.match instanceof RegExp ? raw.match : null,
      }
      const bucket = rule.type === 'SFX' ? sfxByAdd : pfxByAdd
      const list = bucket.get(entry.add)
      if (list) list.push(entry)
      else bucket.set(entry.add, [entry])
      if (rule.type === 'PFX' && !entry.add.includes("'")) apostropheOnlyPrefixes = false
    }
  }

  const stems = parseStems(dicText)
  const sfxAdds = [...sfxByAdd.keys()]
  const pfxAdds = [...pfxByAdd.keys()]

  function listsFor(adds: string[], bucket: Map<string, Entry[]>, word: string, type: Kind): Entry[][] {
    const out: Entry[][] = []
    for (const add of adds) {
      if (!add) {
        const list = bucket.get(add)
        if (list) out.push(list)
        continue
      }
      if (type === 'SFX' ? word.endsWith(add) : word.startsWith(add)) {
        const list = bucket.get(add)
        if (list) out.push(list)
      }
    }
    return out
  }

  function suffixHit(word: string): boolean {
    for (const list of listsFor(sfxAdds, sfxByAdd, word, 'SFX')) {
      for (const entry of list) {
        const stem = word.slice(0, word.length - entry.add.length) + entry.removeLiteral
        const flags = stems.get(stem)
        if (!flags || !hasFlag(flags, entry.flag)) continue
        if (applyEntry(entry, stem) === word) return true
      }
    }
    return false
  }

  function prefixHit(word: string): boolean {
    for (const list of listsFor(pfxAdds, pfxByAdd, word, 'PFX')) {
      for (const entry of list) {
        const stem = entry.removeLiteral + word.slice(entry.add.length)
        const flags = stems.get(stem)
        if (!flags || !hasFlag(flags, entry.flag)) continue
        if (applyEntry(entry, stem) === word) return true
      }
    }
    return false
  }

  function pairHit(word: string, first: Kind): boolean {
    const outerAdds = first === 'SFX' ? pfxAdds : sfxAdds
    const outerBucket = first === 'SFX' ? pfxByAdd : sfxByAdd
    const innerAdds = first === 'SFX' ? sfxAdds : pfxAdds
    const innerBucket = first === 'SFX' ? sfxByAdd : pfxByAdd
    const outerType: Kind = first === 'SFX' ? 'PFX' : 'SFX'
    const innerType: Kind = first
    for (const outerList of listsFor(outerAdds, outerBucket, word, outerType)) {
      for (const outer of outerList) {
        if (!outer.combineable) continue
        const mid =
          outerType === 'SFX'
            ? word.slice(0, word.length - outer.add.length) + outer.removeLiteral
            : outer.removeLiteral + word.slice(outer.add.length)
        for (const innerList of listsFor(innerAdds, innerBucket, mid, innerType)) {
          for (const inner of innerList) {
            if (!inner.combineable) continue
            const stem =
              innerType === 'SFX'
                ? mid.slice(0, mid.length - inner.add.length) + inner.removeLiteral
                : inner.removeLiteral + mid.slice(inner.add.length)
            const flags = stems.get(stem)
            if (!flags) continue
            const innerAt = flags.indexOf(inner.flag)
            if (innerAt < 0) continue
            if (flags.indexOf(outer.flag, innerAt + inner.flag.length) < 0) continue
            const midForm = applyEntry(inner, stem)
            if (midForm == null || applyEntry(outer, midForm) !== word) continue
            return true
          }
        }
      }
    }
    return false
  }

  return {
    correct(word: string): boolean {
      if (!word) return false
      if (stems.has(word)) return true
      if (suffixHit(word)) return true
      if (apostropheOnlyPrefixes && !word.includes("'")) return false
      if (prefixHit(word)) return true
      return pairHit(word, 'PFX') || pairHit(word, 'SFX')
    },
  }
}
