import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { CEFR_LINES } from '@/packs/labels'
import { provenanceCaption } from '@/packs/provenance'
import { PACK_CEFRS, PACK_LANGS, type PackCefr, type PackLang } from '@/packs/schema'
import { Language, SelectionCard, type CachePhase } from './Language'

function card(phase: CachePhase, showSaving = false, lang: PackLang = 'pt', cefr: PackCefr = 'a1') {
  return renderToStaticMarkup(
    <MemoryRouter>
      <SelectionCard lang={lang} cefr={cefr} phase={phase} showSaving={showSaving} />
    </MemoryRouter>,
  )
}

describe('Language & level picker (#182)', () => {
  test('one screen: 3-col language grid, 3×2 level grid, level line, card', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <Language />
      </MemoryRouter>,
    )
    expect(html).toContain('Choose language &amp; level')
    expect(html).not.toContain('Your level')
    expect(html).not.toContain('prefill vowels')
    expect(html.match(/role="radiogroup"/g)?.length).toBe(2)
    expect(html.match(/grid grid-cols-3/g)?.length).toBe(2)
    expect(html.match(/role="radio"/g)?.length).toBe(PACK_LANGS.length + PACK_CEFRS.length)
    expect(html).toContain('Português')
    expect(html).toContain(CEFR_LINES.a1)
    expect(html).toContain('data-selection-card')
    // Back is a 44px target
    expect(html).toMatch(/min-h-11 min-w-11[^"]*"[^>]*>← Back/)
  })

  test('level line copy exists for every level', () => {
    for (const c of PACK_CEFRS) expect(CEFR_LINES[c]).toStartWith(c.toUpperCase())
  })

  test('card: selected pair, provenance, 44px Pack info', () => {
    const html = card('ready')
    expect(html).toContain('Português · A1')
    expect(html).toContain(provenanceCaption('pt', 'a1'))
    expect(html.match(/href="\/about"/g)?.length).toBe(1)
    expect(html).toMatch(/min-h-11 min-w-11[^"]*"[^>]*>Info do pacote/)
  })

  test('status: A2HS hidden unless ready and holds Saving back', () => {
    expect(card('ready')).toContain('✓ Ready offline')
    const fast = card('caching', false)
    expect(fast).not.toContain('Saving')
    expect(fast).not.toContain('data-install-link')
    expect(card('caching', true)).toContain('Saving for offline…')
    const err = card('error')
    expect(err).toContain('Not saved yet — connect and try again.')
    expect(err).not.toContain('data-install-link')
  })

  test('IT caption is Italian ("per frequenza")', () => {
    for (const c of PACK_CEFRS) {
      expect(provenanceCaption('it', c)).toContain('per frequenza')
      expect(provenanceCaption('it', c)).not.toContain('par ')
    }
  })
})
