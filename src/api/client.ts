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

export type HealthResponse = { ok: boolean }

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/api/health')
}
