import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import {
  caseProbes,
  installFixtureSpellersFromDir,
  installMembershipCacheForTests,
  isAllowlistedLemma,
  isWordOfLang,
  MembershipDictsNeeded,
  membershipCacheKey,
  membershipProbes,
  resetDicts,
} from './lang-membership'

describe('lang membership (fixture dictionaries)', () => {
  beforeAll(() => {
    installFixtureSpellersFromDir()
  })

  afterAll(() => {
    resetDicts()
  })

  test('accepts in-dict words and rejects unknown tokens', () => {
    expect(isWordOfLang('en', 'HELLO')).toBe(true)
    expect(isWordOfLang('en', 'hello')).toBe(true)
    expect(isWordOfLang('en', 'XYZZY')).toBe(false)
    expect(isWordOfLang('es', 'CASA')).toBe(true)
    expect(isWordOfLang('es', 'XYZZY')).toBe(false)
  })

  test('PT accepts if either pt-PT or pt-BR lists the form', () => {
    expect(isWordOfLang('pt', 'FOR')).toBe(true)
    expect(isWordOfLang('pt', 'COME')).toBe(true)
    expect(isWordOfLang('pt', 'CASA')).toBe(true)
    expect(isWordOfLang('pt', 'XYZZY')).toBe(false)
  })

  test('DE probes ß and SS plus case variants', () => {
    expect(isWordOfLang('de', 'STRAßE')).toBe(true)
    expect(isWordOfLang('de', 'STRASSE')).toBe(true)
    expect(isWordOfLang('de', 'Straße')).toBe(true)
    expect(isWordOfLang('de', 'HAND')).toBe(true)
    expect(isWordOfLang('de', 'Hand')).toBe(true)
    expect(isWordOfLang('de', 'HAUSHOTEL')).toBe(true)
    expect(isWordOfLang('de', 'FLUGHAUS')).toBe(true)
    expect(membershipProbes('de', 'STRASSE').some((p) => p.includes('ß'))).toBe(
      true,
    )
  })

  test('case probes cover lower / title / upper', () => {
    const probes = caseProbes('HoTeL')
    expect(probes).toContain('hotel')
    expect(probes).toContain('Hotel')
    expect(probes).toContain('HOTEL')
  })

  test('English-only kinship is rejected in non-EN even if the dict lists it', () => {
    expect(isWordOfLang('de', 'DAD')).toBe(false)
    expect(isWordOfLang('de', 'MOM')).toBe(false)
    expect(isWordOfLang('en', 'DAD')).toBe(true)
  })

  test('does not kinship-stop Portuguese homographs FOR/COME', () => {
    expect(isWordOfLang('pt', 'FOR')).toBe(true)
    expect(isWordOfLang('pt', 'COME')).toBe(true)
  })

  test('loanword allowlist bypasses missing dict entries', () => {
    expect(isWordOfLang('de', 'EMAIL')).toBe(true)
    expect(isWordOfLang('es', 'INTERNET')).toBe(true)
    expect(isWordOfLang('pt', 'COMPUTER')).toBe(true)
  })

  test('loanword allowlist is keyed by language', () => {
    expect(isAllowlistedLemma('en', 'CASHPOINT')).toBe(true)
    expect(isAllowlistedLemma('de', 'CASHPOINT')).toBe(false)
    expect(isWordOfLang('de', 'CASHPOINT')).toBe(false)
    expect(isAllowlistedLemma('pt', 'CONNOSCO')).toBe(true)
    expect(isAllowlistedLemma('en', 'CONNOSCO')).toBe(false)
    expect(isWordOfLang('en', 'CONNOSCO')).toBe(false)
    expect(isAllowlistedLemma('es', 'ADN')).toBe(true)
    expect(isAllowlistedLemma('en', 'ADN')).toBe(false)
  })
})

describe('membership verdict cache', () => {
  afterAll(() => {
    resetDicts()
  })

  test('answers from an installed cache without dictionaries', () => {
    resetDicts()
    installMembershipCacheForTests(
      new Map([
        [membershipCacheKey('en', 'HELLO'), true],
        [membershipCacheKey('en', 'ZZZCACHEWORD'), false],
      ]),
    )
    expect(isWordOfLang('en', 'HELLO')).toBe(true)
    expect(isWordOfLang('en', 'ZZZCACHEWORD')).toBe(false)
  })

  test('a cache miss is not treated as a hit', () => {
    resetDicts()
    installMembershipCacheForTests(new Map())
    expect(isWordOfLang('de', 'DAD')).toBe(false)
    expect(isWordOfLang('de', 'EMAIL')).toBe(true)
    expect(() => isWordOfLang('de', 'HAUS')).toThrow(MembershipDictsNeeded)
  })

  test('fixture spellers outrank a cached verdict', () => {
    resetDicts()
    installMembershipCacheForTests(
      new Map([[membershipCacheKey('en', 'HELLO'), false]]),
    )
    installFixtureSpellersFromDir()
    expect(isWordOfLang('en', 'HELLO')).toBe(true)
  })
})
