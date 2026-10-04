import { withSecurityHeaders } from '../../src/deploy/harden'

/**
 * GET /packs/* — serve shipped JSON, 404 anything else.
 * Cloudflare Pages `_redirects` does not support 404 rewrites; Functions skip
 * `_redirects`, so this prevents the SPA `/* /index.html 200` fallback from
 * poisoning the hiato-packs runtime cache.
 * Keep `/packs/*` in `public/_routes.json` include (with `/api/*` only).
 * `_headers` is not applied to a Function response, so security headers are set here.
 */
const PACK_JSON_PATH =
  /^\/packs\/(?:en|de|es|pt)\/(?:a1|a2|b1|b2|c1|c2)\.json$/

export function isPackJsonPath(pathname: string): boolean {
  return PACK_JSON_PATH.test(pathname)
}

function notFound(): Response {
  return withSecurityHeaders(
    new Response('Not Found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    }),
    { 'cache-control': 'no-store' },
  )
}

export async function onRequest({
  request,
  next,
}: {
  request: Request
  next: () => Promise<Response>
}): Promise<Response> {
  const res = await next()
  if (res.status >= 500) return withSecurityHeaders(res)
  let pathname = ''
  try {
    pathname = new URL(request.url).pathname
  } catch {
    return notFound()
  }
  if (!isPackJsonPath(pathname)) return notFound()
  if (res.status === 304) return withSecurityHeaders(res)
  const ct = res.headers.get('content-type') ?? ''
  if (res.ok && ct.includes('application/json')) return withSecurityHeaders(res)
  return notFound()
}
