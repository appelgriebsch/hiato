/** Cloudflare Pages Function — GET /api/health */
export async function onRequestGet(): Promise<Response> {
  return Response.json({ ok: true }, { status: 200 })
}
