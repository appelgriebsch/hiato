import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Keyboard } from '@/components/play/Keyboard'
import { PACK_LANGS, type PackLang } from '@/packs/schema'

const empty = new Set<string>()

function renderPad(lang: PackLang): string {
  return renderToStaticMarkup(
    <Keyboard
      lang={lang}
      usedWrong={empty}
      usedCorrect={empty}
      onKey={() => {}}
    />,
  )
}

describe('Keyboard render (#138 Avery W4)', () => {
  test('DE ß span uses normal-case, not uppercase', () => {
    const html = renderPad('de')
    // Face is an inset <span>…ß</span>; class must keep ß (Chrome uppercase→SS).
    const m = html.match(/<span[^>]*>ß<\/span>/)
    expect(m).not.toBeNull()
    expect(m![0]).toContain('normal-case')
    expect(m![0]).not.toContain('uppercase')
  })

  test('ES/PT/FR render data-accent-strip; DE/EN do not', () => {
    expect(renderPad('es')).toContain('data-accent-strip')
    expect(renderPad('pt')).toContain('data-accent-strip')
    const fr = renderPad('fr')
    expect(fr).toContain('data-accent-strip')
    expect(fr).toContain('Accents')
    expect(fr).toContain('flex-nowrap')
    expect(fr).toContain('overflow-hidden')
    expect(fr).toContain('>Ç<')
    expect(fr).toContain('>Œ<')
    expect(renderPad('de')).not.toContain('data-accent-strip')
    expect(renderPad('en')).not.toContain('data-accent-strip')
    const it = renderPad('it')
    expect(it).toContain('data-accent-strip')
    expect(it).toContain('Accents')
    expect(it).toContain('flex-nowrap')
    expect(it).toContain('overflow-hidden')
    expect(it).toContain('data-pad-cols="10"')
    expect(it).toContain('>À<')
    expect(it).toContain('>È<')
    expect(it).toContain('>É<')
    expect(it).toContain('>Ì<')
    expect(it).toContain('>Ò<')
    expect(it).toContain('>Ù<')
    expect(it).not.toContain('overflow-x-auto')
    expect(it).not.toContain('overflow-x-scroll')
  })

  test('each language renders 3 letter data-pad-row rows', () => {
    for (const lang of PACK_LANGS) {
      const html = renderPad(lang)
      const rows = html.match(/data-pad-row/g)?.length ?? 0
      // Letter rows are always 3; PT/ES add one more row inside the accent strip.
      if (lang === 'pt' || lang === 'es' || lang === 'fr' || lang === 'it') {
        expect(rows).toBe(4)
      } else {
        expect(rows).toBe(3)
      }
    }
  })

  test('tap height floor marker and solid focus ring are present', () => {
    const html = renderPad('en')
    expect(html).toContain('data-tap-min-h="44"')
    expect(html).toContain('data-hit-slop')
    // className string is rendered; solid ring (no /60 opacity)
    expect(html).toContain('ring-accent-fg')
    expect(html).not.toContain('ring-accent-fg/')
  })
})
