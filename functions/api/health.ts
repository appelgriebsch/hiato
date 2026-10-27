import { isPagesStage, withSecurityHeaders } from '../../src/deploy/harden'
import { BUILD_SHA } from '../_generated/build-sha'

type HealthEnv = {
  HIATO_STAGE?: string
}

/** Cloudflare Pages Function — GET /api/health. `sha` is the stub for tests. */
export async function onRequestGet(
  context: { env?: HealthEnv },
  sha: string = BUILD_SHA,
): Promise<Response> {
  const stage = context.env?.HIATO_STAGE
  if (!isPagesStage(stage)) {
    return withSecurityHeaders(Response.json({ ok: false }, { status: 503 }), {
      'cache-control': 'no-store',
    })
  }
  return withSecurityHeaders(
    Response.json({ ok: true, stage, sha }, { status: 200 }),
    { 'cache-control': 'no-store' },
  )
}
