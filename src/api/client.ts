/** Thin API client seam — ready for later endpoints (ADR 0011). */

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    throw new ApiError(`Request failed: ${res.status}`, res.status)
  }
  return (await res.json()) as T
}

export type HealthStage = 'production' | 'preview'

export type HealthResponse = {
  ok: true
  stage: HealthStage
}

function isHealthResponse(value: unknown): value is HealthResponse {
  if (typeof value !== 'object' || value === null) return false
  const body = value as { ok?: unknown; stage?: unknown }
  return (
    body.ok === true &&
    (body.stage === 'production' || body.stage === 'preview')
  )
}

export async function getHealth(): Promise<HealthResponse> {
  const body: unknown = await request<unknown>('/api/health')
  if (!isHealthResponse(body)) {
    throw new ApiError('Health response missing stage', 200)
  }
  return body
}
