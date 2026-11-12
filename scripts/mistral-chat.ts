/**
 * Shared Mistral chat client for pack tooling scripts (not run on CI / bun:test).
 * Model and key follow ADR 0048: mistral-large-4-0 via api.mistral.ai, MISTRAL_API_KEY.
 */

export const MISTRAL_MODEL = 'mistral-large-4-0'

export function readMistralKey(): string | null {
  return process.env.MISTRAL_API_KEY || null
}

/**
 * Mistral returns message.content either as a string or as an array of
 * content blocks; join the text blocks so callers always get a string
 * (run 43104173938 crashed on `content.replace` when the API sent blocks).
 */
export function messageContentToString(
  content: string | { type?: string; text?: string }[] | null | undefined,
): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((p) => p && (p.type === undefined || p.type === 'text'))
      .map((p) => p.text ?? '')
      .join('')
  }
  return ''
}

/** Non-transient HTTP status from the Mistral API (4xx other than 408/429) — deliberate, never retried. */
export class MistralHttpError extends Error {
  readonly status: number
  constructor(status: number, body: string) {
    super(`Mistral API ${status}: ${body.slice(0, 300)}`)
    this.status = status
  }
}

/** 408/429/5xx are transient (rate limit, upstream gateway failure) — retried with backoff. */
function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

export async function mistralChat(
  key: string,
  system: string,
  prompt: string,
  temperature: number,
): Promise<string> {
  let lastStatus = 0
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        // mistral-large-4-0 (1T-param MoE) can take well over 60s per response
        // under load (run 43222663925: every 60s-capped request aborted with a
        // TimeoutError, then the upstream answered 502) — allow 120s.
        signal: AbortSignal.timeout(120_000),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: MISTRAL_MODEL,
          temperature,
          // Mistral rejects greedy sampling (temperature 0) unless top_p is 1
          // (API error 3054 "top_p must be 1 when using greedy sampling").
          ...(temperature === 0 ? { top_p: 1 } : {}),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt },
          ],
        }),
      })
      if (isTransientStatus(res.status)) {
        lastStatus = res.status
        const wait = 1000 * 2 ** attempt
        console.warn(`  Mistral ${res.status}, backing off ${wait}ms`)
        await Bun.sleep(wait)
        continue
      }
      if (!res.ok) {
        throw new MistralHttpError(res.status, await res.text())
      }
      const body = (await res.json()) as {
        choices?: {
          message?: {
            /** String, or a list of content blocks ({type:'text', text}) on newer models. */
            content?: string | { type?: string; text?: string }[]
          }
        }[]
      }
      return messageContentToString(body.choices?.[0]?.message?.content)
    } catch (err) {
      // Deliberate HTTP errors are not retried; anything else (a hung request
      // aborts with a TimeoutError, run 43198026054; transient 5xx handled
      // above) is transient — back off and retry instead of crashing.
      if (err instanceof MistralHttpError) throw err
      if (attempt === 4) throw err
      const wait = 1000 * 2 ** attempt
      console.warn(`  Mistral request failed (${(err as Error)?.name ?? err}), backing off ${wait}ms`)
      await Bun.sleep(wait)
    }
  }
  throw new Error(`Mistral API ${lastStatus}: retries exhausted`)
}
