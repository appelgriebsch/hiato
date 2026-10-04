import { isPagesStage, withSecurityHeaders } from '../../src/deploy/harden'

type HealthEnv = {
  HIATO_STAGE?: string
}

/** Cloudflare Pages Function — GET /api/health */
export async function onRequestGet(context: {
  env?: HealthEnv
}): Promise<Response> {
  const stage = context.env?.HIATO_STAGE
  if (!isPagesStage(stage)) {
    return withSecurityHeaders(Response.json({ ok: false }, { status: 503 }), {
      'cache-control': 'no-store',
    })
  }
  return withSecurityHeaders(
    Response.json({ ok: true, stage }, { status: 200 }),
    { 'cache-control': 'no-store' },
  )
}
