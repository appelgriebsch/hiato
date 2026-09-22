import { isPagesStage } from '../../src/deploy/harden'

type HealthEnv = {
  HIATO_STAGE?: string
}

/** Cloudflare Pages Function — GET /api/health */
export async function onRequestGet(context: {
  env?: HealthEnv
}): Promise<Response> {
  const stage = context.env?.HIATO_STAGE
  if (!isPagesStage(stage)) {
    return Response.json({ ok: false }, { status: 503 })
  }
  return Response.json({ ok: true, stage }, { status: 200 })
}
