/**
 * GET /packs/* — serve shipped JSON, 404 anything else.
 * Cloudflare Pages `_redirects` does not support 404 rewrites; Functions skip
 * `_redirects`, so this prevents the SPA `/* /index.html 200` fallback from
 * poisoning the hiato-packs runtime cache.
 */
export async function onRequest({
  next,
}: {
  next: () => Promise<Response>
}): Promise<Response> {
  const res = await next()
  const ct = res.headers.get('content-type') ?? ''
  if (res.ok && !ct.includes('text/html')) {
    return res
  }
  return new Response('Not Found', {
    status: 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}
