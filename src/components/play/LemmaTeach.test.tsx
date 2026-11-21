import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { LemmaTeach } from '@/components/play/LemmaTeach'

function renderTeach(example?: string): string {
  return renderToStaticMarkup(
    <LemmaTeach
      lang="de"
      word="HAUS"
      gloss="Ein Gebäude zum Wohnen."
      synonyms={['Wohnung']}
      example={example}
      showSpeak={false}
    />,
  )
}

function renderTeachExtras(): string {
  return renderToStaticMarkup(
    <LemmaTeach
      lang="pt"
      word="CARTÃO"
      gloss="peça retangular de plástico."
      synonyms={['bilhete', 'ficha']}
      example="Você tem cartão?"
      pos="noun"
      ipa="/kaʁˈtɐ̃w̃/"
      family={['cartões', 'carteiro', 'cartolina']}
      showSpeak={false}
    />,
  )
}

describe('LemmaTeach example sentence (ADR 0049, #246)', () => {
  test('renders exactly one sentence in the pack language when example is set', () => {
    const html = renderTeach('Wir wohnen in einem kleinen Haus.')
    expect(html).toContain('data-endcard-example')
    expect(html).toContain('lang="de"')
    expect(html).toContain('Wir wohnen in einem kleinen Haus.')
    expect(html.split('data-endcard-example').length - 1).toBe(1)
  })

  test('omits the sentence when no example is set', () => {
    expect(renderTeach(undefined)).not.toContain('data-endcard-example')
    expect(renderTeach('   ')).not.toContain('data-endcard-example')
  })
})

describe('LemmaTeach lemma extras (ADR 0055/0057, #314)', () => {
  test('renders the meta row: localized POS chip + slashed IPA under the word', () => {
    const html = renderTeachExtras()
    expect(html).toContain('data-endcard-meta')
    expect(html.split('data-endcard-meta').length - 1).toBe(1)
    expect(html).toContain('data-endcard-pos')
    expect(html).toContain('substantivo')
    expect(html).toContain('data-endcard-ipa')
    expect(html).toContain('kaʁˈtɐ̃w̃')
    // Slashes render aria-hidden so screen readers hear the bare transcription.
    expect(html).toContain('aria-hidden="true">/')
  })

  test('renders labeled Synonyms (filled) and Word family (outlined) chip groups', () => {
    const html = renderTeachExtras()
    expect(html).toContain('data-endcard-synonyms')
    expect(html).toContain('Synonyms')
    expect(html).toContain('data-endcard-family')
    expect(html.split('data-endcard-family').length - 1).toBe(1)
    expect(html).toContain('Word family')
    expect(html).toContain('cartões')
    expect(html).toContain('carteiro')
    expect(html).toContain('cartolina')
  })

  test('degrades when pos/ipa/family are all missing: no meta row, no family group', () => {
    const html = renderTeach(undefined)
    expect(html).not.toContain('data-endcard-meta')
    expect(html).not.toContain('data-endcard-pos')
    expect(html).not.toContain('data-endcard-ipa')
    expect(html).not.toContain('data-endcard-family')
    expect(html).not.toContain('Word family')
    // Synonyms still render (now labeled per ADR 0057).
    expect(html).toContain('data-endcard-synonyms')
    expect(html).toContain('Wohnung')
  })

  test('meta row renders with only ipa set (pos chip omitted)', () => {
    const ipaOnly = renderToStaticMarkup(
      <LemmaTeach
        lang="en"
        word="ACTION"
        gloss="something someone does"
        synonyms={[]}
        ipa="/ˈækʃən/"
        showSpeak={false}
      />,
    )
    expect(ipaOnly).toContain('data-endcard-meta')
    expect(ipaOnly).not.toContain('data-endcard-pos')
    expect(ipaOnly).toContain('data-endcard-ipa')
  })
})

describe('EndCard structural gate (ADR 0049, #246; ADR 0055, #314)', () => {
  test('Play.tsx mounts EndCard only when finished and never feeds the fields in-round', async () => {
    const src = await Bun.file(new URL('../../pages/Play.tsx', import.meta.url)).text()
    const hint = await Bun.file(new URL('./LearnerHint.tsx', import.meta.url)).text()

    // The example flows into EndCard from the finished word entry only.
    expect(src).toContain('{finished ? (')
    const finishedAt = src.indexOf('{finished ? (')
    const endCardAt = src.indexOf('<EndCard')
    expect(endCardAt).toBeGreaterThan(finishedAt)
    expect(src).toContain('example={wordEntry.example}')
    // ADR 0055 extras flow into EndCard from the finished word entry only.
    expect(src).toContain('pos={wordEntry.pos}')
    expect(src).toContain('ipa={wordEntry.ipa}')
    expect(src).toContain('family={wordEntry.family}')
    // EndCard receives and forwards the example + extras to the teach block.
    const endCard = src.slice(src.indexOf('function EndCard('))
    expect(endCard).toContain('example?: string')
    expect(endCard).toContain('example={teachExample}')
    expect(endCard).toContain('pos?: PackPos')
    expect(endCard).toContain('ipa?: string')
    expect(endCard).toContain('family?: string[]')
    expect(endCard).toContain('pos={teachPos}')
    expect(endCard).toContain('ipa={teachIpa}')
    expect(endCard).toContain('family={teachFamily}')
    // Already-played daily replay carries the stored example + extras; the
    // finished round persists them from the pack entry.
    expect(src).toContain('example: rec.example')
    expect(src).toContain('example: entry.example')
    expect(src).toContain('pos: rec.pos')
    expect(src).toContain('pos: entry.pos')
    expect(src).toContain('ipa: rec.ipa')
    expect(src).toContain('ipa: entry.ipa')
    expect(src).toContain('family: rec.family')
    expect(src).toContain('family: entry.family')
    // In-round UI never receives example or the ADR 0055 fields.
    expect(hint).not.toContain('example')
    expect(hint).not.toContain('entry.pos')
    expect(hint).not.toContain('entry.ipa')
    expect(hint).not.toContain('entry.family')
    const inRound = src.slice(0, finishedAt)
    expect(inRound).not.toContain('wordEntry.example')
    expect(inRound).not.toContain('wordEntry.pos')
    expect(inRound).not.toContain('wordEntry.ipa')
    expect(inRound).not.toContain('wordEntry.family')
  })
})
