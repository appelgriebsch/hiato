import { withSecurityHeaders } from '../../src/deploy/harden'

// SPA `/* /index.html 200` would otherwise answer unknown /api/* with HTML 200.
// `/api/health` is a more specific Pages Function and still wins.
export function onRequest(): Response {
  return withSecurityHeaders(
    Response.json({ ok: false, error: 'not_found' }, { status: 404 }),
    { 'cache-control': 'no-store' },
  )
}
