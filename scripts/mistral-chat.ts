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

export async function mistralChat(
  key: string,
  system: string,
  prompt: string,
  temperature: number,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
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
          // Mistral rejects greedy sampling (temperature 0) unless top_p is 1
          // (API error 3054 "top_p must be 1 when using greedy sampling").
          ...(temperature === 0 ? { top_p: 1 } : {}),
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
        choices?: {
          message?: {
            /** String, or a list of content blocks ({type:'text', text}) on newer models. */
            content?: string | { type?: string; text?: string }[]
          }
        }[]
      }
      return messageContentToString(body.choices?.[0]?.message?.content)
    } catch (err) {
      // HTTP status errors are deliberate and not retried; anything else
      // (a hung request aborts with a TimeoutError, run 43198026054) is
      // transient — back off and retry instead of crashing the pipeline.
      if (err instanceof Error && err.message.startsWith('Mistral API ')) throw err
      if (attempt === 4) throw err
      const wait = 1000 * 2 ** attempt
      console.warn(`  Mistral request failed (${(err as Error)?.name ?? err}), backing off ${wait}ms`)
      await Bun.sleep(wait)
    }
  }
  throw new Error('Mistral API 429: retries exhausted')
}
