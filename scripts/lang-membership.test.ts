import { beforeAll, describe, expect, test } from 'bun:test'
import {
  caseProbes,
  installFixtureSpellersFromDir,
  isWordOfLang,
  membershipProbes,
} from './lang-membership'

describe('lang membership (fixture dictionaries)', () => {
  beforeAll(() => {
    installFixtureSpellersFromDir()
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
})
