import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

function icon(name: string, size: number, cls = ''): string {
  const svg = readFileSync(`proto/icons/${name}.svg`, 'utf8')
  const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true" focusable="false" class="${cls}">${inner}</svg>`
}

const CSS = readFileSync('proto/style.css', 'utf8')

type Lemma = {
  lang: string
  langCode: string
  cefr: string
  word: string
  gloss: string
  synonyms: string[]
  example?: string
  pos?: string
  ipa?: string
  family?: string[]
}

const PT_A2: Lemma = {
  lang: 'pt', langCode: 'PT', cefr: 'A2',
  word: 'CARTÃO',
  gloss: 'peça retangular de plástico.',
  synonyms: ['bilhete', 'ficha'],
  example: 'Você tem cartão?',
  pos: 'substantivo',
  ipa: '/kaʁˈtɐ̃w̃/',
  family: ['cartões', 'carteiro', 'cartolina'],
}
const EN_C1: Lemma = {
  lang: 'en', langCode: 'EN', cefr: 'C1',
  word: 'EXUDE',
  gloss: 'to give off a feeling or quality',
  synonyms: ['emit', 'radiate', 'ooze'],
  example: 'Her laugh exudes pure joy.',
  pos: 'verb',
  ipa: '/ɪɡˈzjuːd/',
  family: ['exudes', 'exuded', 'exuding'],
}
const EN_C2: Lemma = {
  lang: 'en', langCode: 'EN', cefr: 'C2',
  word: 'ENVISAGE',
  gloss: 'to imagine or expect something in the future',
  synonyms: ['imagine', 'foresee', 'visualize'],
  example: 'The plan envisages a gradual rollout.',
  pos: 'verb',
  ipa: '/ɪnˈvɪzɪdʒ/',
  family: ['envisaged', 'envisaging'],
}

function streakChip(count: number, freezes: number): string {
  if (count <= 0) return ''
  return `<span class="badge badge-raised px-frame" role="img" aria-label="Streak ${count}, ${freezes} freeze${freezes === 1 ? '' : 's'}">${
    icon('flame', 16, 'text-coin') /* --icon-2 set via class below */
  }<span class="text-pixel-title">${count}</span>${
    freezes > 0 ? `${icon('freeze', 16, 'text-ink-muted')}<span class="text-pixel-title">${freezes}</span>` : ''
  }</span>`
}

function topbar(modeBadge: string, streak: number, freezes: number): string {
  return `<header class="topbar">
    <div class="side">${icon('mark', 28, 'brand')}<span class="offline-chip px-frame">Offline ready</span></div>
    <div class="center"><span class="badge badge-accent px-frame">${modeBadge}</span></div>
    <div class="side right">${streakChip(streak, freezes)}</div>
  </header>`
}

function speakBtn(lang: string): string {
  return `<button type="button" lang="${lang}" data-endcard-speak aria-label="Hear the word" class="speak">${icon('speaker', 20)}</button>`
}

/** Enriched LemmaTeach (#299): pos + ipa meta row, example, labeled synonym + family chip groups. */
function lemmaTeachEnriched(l: Lemma, showSpeak: boolean): string {
  const meta = l.pos || l.ipa
    ? `<div class="meta">${l.pos ? `<span class="pos-chip px-frame" lang="${l.lang}">${l.pos}</span>` : ''}${l.ipa ? `<span class="ipa"><span aria-hidden="true">/</span>${l.ipa.replace(/^\//, '').replace(/\/$/, '')}<span aria-hidden="true">/</span></span>` : ''}</div>`
    : ''
  const example = l.example?.trim()
    ? `<p lang="${l.lang}" data-endcard-example class="example">${l.example.trim()}</p>`
    : ''
  const syn = l.synonyms.length
    ? `<div class="chipgroup"><span class="chiplabel" lang="en">Synonyms</span><div class="chips">${l.synonyms.map((s) => `<span lang="${l.lang}" class="chip">${s}</span>`).join('')}</div></div>`
    : ''
  const fam = l.family?.length
    ? `<div class="chipgroup"><span class="chiplabel" lang="en">Word family</span><div class="chips">${l.family.map((s) => `<span lang="${l.lang}" class="chip chip-family px-frame">${s}</span>`).join('')}</div></div>`
    : ''
  return `<div class="teach-inner ${l.gloss ? '' : 'no-gloss'}">
    ${l.gloss ? `<p lang="${l.lang}" class="gloss">${l.gloss}</p>` : ''}
    <p lang="en" class="theword">The word was</p>
    <div class="wordrow"><p lang="${l.lang}" class="word">${l.word}</p>${showSpeak ? speakBtn(l.lang) : ''}</div>
    ${meta}
    ${example}
    ${showSpeak ? `<p lang="en" class="note">If you hear nothing, the phone’s mute switch (Ring/Silent) mutes spoken words.</p>` : ''}
    ${syn}
    ${fam}
  </div>`
}

/** Current production LemmaTeach (no #299 fields). */
function lemmaTeachLegacy(l: Lemma, showSpeak: boolean): string {
  const example = l.example?.trim()
    ? `<p lang="${l.lang}" data-endcard-example class="example">${l.example.trim()}</p>`
    : ''
  const syn = l.synonyms.length
    ? `<div class="chips" style="margin-top:10px">${l.synonyms.map((s) => `<span lang="${l.lang}" class="chip">${s}</span>`).join('')}</div>`
    : ''
  return `<div class="teach-inner ${l.gloss ? '' : 'no-gloss'}">
    ${l.gloss ? `<p lang="${l.lang}" class="gloss">${l.gloss}</p>` : ''}
    <p lang="en" class="theword">The word was</p>
    <div class="wordrow"><p lang="${l.lang}" class="word">${l.word}</p>${showSpeak ? speakBtn(l.lang) : ''}</div>
    ${example}
    ${showSpeak ? `<p lang="en" class="note">If you hear nothing, the phone’s mute switch (Ring/Silent) mutes spoken words.</p>` : ''}
    ${syn}
  </div>`
}

function endcard(o: {
  won: boolean
  revealed?: boolean
  l: Lemma
  streak: number
  freezes: number
  dateKey: string
  enriched: boolean
  showSpeak?: boolean
}): string {
  const { won, l } = o
  const showSpeak = o.showSpeak ?? true
  const badge = won ? 'You got it' : o.revealed ? 'Word revealed' : 'Out of lives'
  const sparks = won
    ? [[-6, -6, 'auto', 'auto'], [-6, 'auto', -6, 'auto'], ['auto', -6, -6, 'auto'], ['auto', -6, 'auto', -6], ['45%', -10, 'auto', 'auto'], ['45%', 'auto', -10, 'auto']]
        .map(([t, lft, b, r]) => `<span class="spark" style="top:${t === 'auto' ? 'auto' : t + 'px'};left:${lft === 'auto' ? 'auto' : lft + 'px'};bottom:${b === 'auto' ? 'auto' : b + 'px'};right:${r === 'auto' ? 'auto' : r + 'px'}">${icon('spark', 16)}</span>`).join('')
    : ''
  const statsNote = won
    ? `<p class="note accent">Streak updated for ${o.dateKey}</p>`
    : `<p class="note">Streak pauses — try again tomorrow</p>`
  const actions = won
    ? `<div class="actions">
        <button class="btn btn-primary px-frame px-drop btn-block">Share</button>
        <button class="btn btn-secondary px-drop-only btn-block">Practice</button>
        <button class="btn btn-ghost btn-block">Back home</button>
      </div>`
    : `<div class="actions">
        <button class="btn btn-secondary px-drop-only btn-block">Practice this word</button>
        <button class="btn btn-primary px-frame px-drop btn-block">Share</button>
        <button class="btn btn-secondary px-drop-only btn-block">Practice</button>
        <button class="btn btn-ghost btn-block">Back home</button>
      </div>`
  return `<div class="endcard">
    <div class="teach-wrap">
      ${sparks}
      <div class="teach px-frame" data-endcard-teach>
        <span class="badge ${won ? 'badge-accent' : 'badge-warm'} px-frame">${badge} · Daily</span>
        <div style="margin-top:12px">${o.enriched ? lemmaTeachEnriched(l, showSpeak) : lemmaTeachLegacy(l, showSpeak)}</div>
      </div>
      <div class="card stats px-flat">
        <div class="row"><span class="muted">${l.langCode} · ${l.cefr}</span>${streakChip(o.streak, o.freezes)}</div>
        ${statsNote}
      </div>
    </div>
    ${actions}
  </div>`
}

function page(inner: string, extra = ''): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>hiato #299</title><style>${CSS}
.brand { color: var(--color-accent); --icon-2: var(--color-raised); opacity: 0.9; flex-shrink: 0; }
.text-coin { color: var(--color-coin); --icon-2: var(--color-danger); }
.text-ink-muted { color: var(--color-ink-muted); }
.col { display: flex; flex-direction: column; flex: 1 1 0%; min-height: 0; min-width: 0; }
${extra}</style></head><body><div class="shell"><div class="scroll">${inner}</div></div></body></html>`
}

function inRound(): string {
  const word = 'CARTÃO'
  const revealed = new Set(['C', 'R', 'T', 'Ã'])
  const tiles = word.split('').map((ch) => {
    const r = revealed.has(ch)
    return `<div lang="${r ? 'pt' : ''}" class="tile ${r ? 'tile-revealed' : 'tile-hidden'}">${r ? ch : '·'}</div>`
  }).join('')
  const lives = Array.from({ length: 6 }, (_, i) => icon(i < 4 ? 'seed' : 'seed-empty', 24, i < 4 ? 'seed-on' : 'seed-off')).join('')
  const rows: string[][] = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ç'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
  ]
  const correct = new Set(['C', 'R', 'T'])
  const wrong = new Set(['Q'])
  const keyRows = rows.map((row) => `<div class="pad-row">${row.map((k) => {
    const cls = correct.has(k) ? 'key key-correct' : wrong.has(k) ? 'key key-wrong' : 'key'
    return `<button type="button" class="${cls}"><span class="key-face">${k}</span></button>`
  }).join('')}</div>`).join('')
  const accents = ['Á', 'À', 'Â', 'Ã', 'É', 'Ê', 'Í', 'Ó', 'Ô', 'Õ', 'Ú']
  const accentRow = `<div class="accent-label">ACCENTS</div><div class="accent-row">${accents.map((k) => `<button type="button" class="key ${k === 'Ã' ? 'key-correct' : ''}"><span class="key-face">${k}</span></button>`).join('')}</div>`
  return page(`<div class="col">
    ${topbar('Daily', 13, 1)}
    <div class="roundrow">
      <div class="lives" role="status" aria-live="polite" aria-label="4 lives remaining">${lives}</div>
      <span class="level">PT · A2</span>
    </div>
    <div class="grid-portrait" role="group" aria-label="Word letters">
      <div class="grid-row" style="grid-template-columns:repeat(6,minmax(0,1fr));max-width:320px">${tiles}</div>
    </div>
    <div class="hintstrip" aria-label="peça retangular de plástico.">
      <p lang="pt" class="g">peça retangular de plástico.</p>
      <div class="chips" style="margin-top:6px"><span lang="pt" class="chip">bilhete</span><span lang="pt" class="chip">ficha</span></div>
    </div>
  </div>
  <div class="footer"><div data-letter-pad>${keyRows}${accentRow}</div></div>`)
}

const scenarios: { file: string; html: string; w: number; h: number; dark?: boolean }[] = [
  { file: '01-win-pt-a2.png', w: 390, h: 844, html: page(`<div class="col">${topbar('Daily', 13, 1)}${endcard({ won: true, l: PT_A2, streak: 13, freezes: 1, dateKey: '2026-11-19', enriched: true })}</div>`) },
  { file: '02-loss-en-c1.png', w: 390, h: 844, html: page(`<div class="col">${topbar('Daily', 4, 0)}${endcard({ won: false, l: EN_C1, streak: 4, freezes: 0, dateKey: '2026-11-19', enriched: true })}</div>`) },
  { file: '03-win-en-c2-dark.png', w: 390, h: 844, dark: true, html: page(`<div class="col">${topbar('Daily', 21, 2)}${endcard({ won: true, l: EN_C2, streak: 21, freezes: 2, dateKey: '2026-11-19', enriched: true })}</div>`) },
  { file: '04-in-round-pt-a2.png', w: 390, h: 844, html: inRound() },
  { file: '05-win-pt-a2-short-land.png', w: 900, h: 420, html: page(`<div class="col">${topbar('Daily', 13, 1)}${endcard({ won: true, l: PT_A2, streak: 13, freezes: 1, dateKey: '2026-11-19', enriched: true })}</div>`) },
  { file: '06-loss-en-c1-legacy.png', w: 390, h: 844, html: page(`<div class="col">${topbar('Daily', 4, 0)}${endcard({ won: false, l: { ...EN_C1, example: undefined, pos: undefined, ipa: undefined, family: undefined }, streak: 4, freezes: 0, dateKey: '2026-11-19', enriched: false })}</div>`) },
]

const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch(req) {
    const u = new URL(req.url)
    let p = u.pathname === '/' ? '/overview.html' : u.pathname
    const f = Bun.file('proto' + p)
    if (p.startsWith('/shots/')) return new Response(Bun.file('.' + p))
    return f.size ? new Response(f) : new Response('nf', { status: 404 })
  },
})
const BASE = `http://127.0.0.1:${server.port}`

const FONT_LOAD = `(${`async () => {
  const files = [
    ['Inter', 400, 'fonts/inter-latin-400-normal.woff2'],
    ['Inter', 500, 'fonts/inter-latin-500-normal.woff2'],
    ['Inter', 600, 'fonts/inter-latin-600-normal.woff2'],
    ['Jersey 10', 400, 'fonts/jersey-10-latin-400-normal.woff2'],
    ['DejaVu Sans', 400, 'fonts/DejaVuSans.ttf'],
  ]
  for (const [fam, w, url] of files) {
    const buf = await (await fetch(url)).arrayBuffer()
    const ff = new FontFace(fam, buf, { weight: String(w) })
    await ff.load()
    document.fonts.add(ff)
  }
  await document.fonts.ready
}`})()`

const browser = await chromium.launch()
for (const s of scenarios) {
  writeFileSync(`proto/${s.file}.html`, s.html)
  const ctx = await browser.newContext({
    viewport: { width: s.w, height: s.h },
    deviceScaleFactor: 2,
    colorScheme: s.dark ? 'dark' : 'light',
    reducedMotion: 'reduce',
  })
  const p = await ctx.newPage()
  await p.goto(`${BASE}/${s.file}.html`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(300)
  const fonts = await p.evaluate(() => ({
    inter: document.fonts.check('600 18px Inter'),
    jersey: document.fonts.check('400 37px "Jersey 10"'),
    dejavu: document.fonts.check('400 14px "DejaVu Sans"'),
    loaded: [...document.fonts].map((f) => f.family + ' ' + f.status),
  }))
  console.log(s.file, JSON.stringify(fonts))
  await p.screenshot({ path: `shots/${s.file}` })
  await ctx.close()
  console.log('shot', s.file)
}

// overview contact sheet
const labels: [string, string][] = [
  ['01-win-pt-a2.png', 'Win · PT A2 · light (POS + IPA + family + example)'],
  ['02-loss-en-c1.png', 'Loss · EN C1 · light (new C1 example)'],
  ['03-win-en-c2-dark.png', 'Win · EN C2 · dark'],
  ['04-in-round-pt-a2.png', 'In-round · anti-spoiler (no POS/IPA/family/example)'],
  ['05-win-pt-a2-short-land.png', 'Win · short-landscape 2-col'],
  ['06-loss-en-c1-legacy.png', 'Loss · EN C1 · today (no new fields yet)'],
]
writeFileSync('proto/overview.html', `<!doctype html><html><head><meta charset="utf-8"><style>
body { margin:0; background:#1b1830; font-family: 'Inter', 'DejaVu Sans', sans-serif; color:#f3ecd8; padding: 16px; }
h1 { font-size: 18px; margin: 0 0 12px; }
.grid { display:grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 16px; }
figure { margin: 0; }
img { width: 100%; display: block; border: 2px solid #77708c; image-rendering: auto; }
figcaption { font-size: 12px; margin-top: 6px; color:#b9b2d2; }
</style></head><body><h1>Hiato #299 — EndCard enrichment: sample screens</h1><div class="grid">${labels.map(([f, c]) => `<figure><img src="/shots/${f}"><figcaption>${c}</figcaption></figure>`).join('')}</div></body></html>`)
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1500 }, deviceScaleFactor: 1 })
const p = await ctx.newPage()
await p.goto(`${BASE}/overview.html`, { waitUntil: 'networkidle' })
await p.evaluate(FONT_LOAD)
await p.waitForTimeout(150)
await p.screenshot({ path: 'shots/overview.png', fullPage: true })
await browser.close()
server.stop()
console.log('done')
process.exit(0)
