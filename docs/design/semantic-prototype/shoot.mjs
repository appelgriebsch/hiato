// Screenshot runner for the semantic-mode prototype (#306).
// Serves the repo root on loopback only, then captures each screen state.
// Usage: bun docs/design/semantic-prototype/shoot.mjs   (from the repo root)
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = fileURLToPath(new URL('../../..', import.meta.url))
const outDir = fileURLToPath(new URL('./shots', import.meta.url))
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2',
}

const server = createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname))
    let file = join(root, path === '/' ? 'docs/design/semantic-prototype/index.html' : path)
    if (!file.startsWith(root)) throw new Error('nope')
    try { await readFile(file) } catch { file = join(root, 'public', path) }
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404); res.end('not found')
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`

const SHOTS = [
  { screen: 'home', name: 'home-mobile-light', width: 390, height: 844, scheme: 'light' },
  { screen: 'home', name: 'home-mobile-dark', width: 390, height: 844, scheme: 'dark' },
  { screen: 'home', name: 'home-desktop-light', width: 1280, height: 800, scheme: 'light' },
  { screen: 'round', name: 'round-mobile-light', width: 390, height: 844, scheme: 'light' },
  { screen: 'round', name: 'round-landscape-light', width: 844, height: 390, scheme: 'light' },
  { screen: 'round', name: 'round-desktop-light', width: 1280, height: 800, scheme: 'light' },
  { screen: 'progress', name: 'progress-mobile-light', width: 390, height: 844, scheme: 'light' },
  { screen: 'progress', name: 'progress-mobile-dark', width: 390, height: 844, scheme: 'dark' },
  { screen: 'endcard', name: 'endcard-mobile-light', width: 390, height: 844, scheme: 'light' },
  { screen: 'share', name: 'share-mobile-light', width: 390, height: 844, scheme: 'light' },
  { screen: 'share', name: 'share-desktop-light', width: 1280, height: 800, scheme: 'light' },
]

const browser = await chromium.launch()
for (const shot of SHOTS) {
  const page = await browser.newPage({
    viewport: { width: shot.width, height: shot.height },
    deviceScaleFactor: 2,
    colorScheme: shot.scheme,
  })
  await page.goto(`${base}/docs/design/semantic-prototype/index.html?s=${shot.screen}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(350)
  await page.screenshot({ path: join(outDir, `${shot.name}.png`), fullPage: shot.screen === 'home' || shot.screen === 'progress' || shot.screen === 'endcard' })
  await page.close()
  console.log(`shot ${shot.name}.png`)
}
await browser.close()
server.close()
