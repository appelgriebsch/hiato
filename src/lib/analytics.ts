/** Cookieless Cloudflare Web Analytics, Production only (ADR 0047, #224). */
import { getHealth, type HealthResponse } from '../api/client'

export const CF_BEACON_HOST = 'https://static.cloudflareinsights.com'
export const CF_BEACON_SRC = `${CF_BEACON_HOST}/beacon.min.js`
export const CF_RUM_HOST = 'https://cloudflareinsights.com'

/**
 * Web Analytics site token, baked at build time from the `WEB_ANALYTICS_TOKEN`
 * environment variable via the Vite define (ADR 0047). Public by design, but
 * kept out of the repo. Unset/empty keeps the beacon off on every environment.
 * The `typeof` guard lets `bun test` run without the define.
 */
export const WEB_ANALYTICS_TOKEN: string =
  typeof __HIATO_WEB_ANALYTICS_TOKEN__ === 'string' ? __HIATO_WEB_ANALYTICS_TOKEN__ : ''

export type AnalyticsDeps = {
  token?: string
  health?: () => Promise<HealthResponse>
  doc?: Document
}

type BeaconDocument = Pick<Document, 'querySelector' | 'createElement' | 'head'>

let started = false

/** Inject the beacon script once per document. Returns false if already present. */
export function loadBeacon(doc: BeaconDocument, token: string): boolean {
  if (doc.querySelector('script[data-cf-beacon]')) return false
  const script = doc.createElement('script')
  script.defer = true
  script.src = CF_BEACON_SRC
  script.setAttribute('data-cf-beacon', JSON.stringify({ token }))
  doc.head.appendChild(script)
  return true
}

/**
 * Load the beacon only when the deployment reports `stage: "production"`.
 * Any health failure (offline, staging) leaves analytics off, so offline
 * plays are never counted. Runs at most once per page load.
 */
export async function initAnalytics(deps: AnalyticsDeps = {}): Promise<void> {
  if (started) return
  started = true
  const token = (deps.token ?? WEB_ANALYTICS_TOKEN).trim()
  if (token === '') return
  try {
    const health = await (deps.health ?? getHealth)()
    if (health.stage !== 'production') return
    loadBeacon(deps.doc ?? document, token)
  } catch {
    // Offline or staging: no beacon, nothing counted.
  }
}

/** Test seam: reset the once-per-load guard. */
export function resetAnalyticsForTest(): void {
  started = false
}
