/**
 * Shared Mistral chat client for pack tooling scripts (not run on CI / bun:test).
 * Model and key follow ADR 0048: mistral-large-4-0 via api.mistral.ai, MISTRAL_API_KEY.
 */

export const MISTRAL_MODEL = 'mistral-large-4-0'

export function readMistralKey(): string | null {
  return process.env.MISTRAL_API_KEY || null
}

export async function mistralChat(
  key: string,
  system: string,
  prompt: string,
  temperature: number,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(60_000),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MISTRAL_MODEL,
        temperature,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      }),
    })
    if (res.status === 429) {
      const wait = 1000 * 2 ** attempt
      console.warn(`  Mistral 429, backing off ${wait}ms`)
      await Bun.sleep(wait)
      continue
    }
    if (!res.ok) {
      const t = await res.text()
      throw new Error(`Mistral API ${res.status}: ${t.slice(0, 300)}`)
    }
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    return body.choices?.[0]?.message?.content || ''
  }
  throw new Error('Mistral API 429: retries exhausted')
}
