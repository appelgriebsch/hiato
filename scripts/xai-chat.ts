/**
 * Shared xAI chat client for pack tooling scripts (not run on CI / bun:test).
 * Key: XAI_API_KEY, else ~/.grok/auth.json (pre-#251). Model defaults to
 * grok-4.7 with reasoning_effort medium (#267). Override with XAI_MODEL and
 * XAI_REASONING_EFFORT.
 */
import { existsSync, readFileSync } from 'node:fs'

export function readXaiKey(): string | null {
  if (process.env.XAI_API_KEY) return process.env.XAI_API_KEY
  const authPath = `${process.env.HOME}/.grok/auth.json`
  if (!existsSync(authPath)) return null
  try {
    const auth = JSON.parse(readFileSync(authPath, 'utf8')) as Record<string, { key?: string }>
    for (const v of Object.values(auth)) {
      if (v?.key) return v.key
    }
  } catch {
    /* unreadable auth file: no key */
  }
  return null
}

/**
 * The API returns message.content as a string or as content blocks; join the
 * text blocks so callers always get a string (run 43104173938 crashed on
 * `content.replace` when the API sent blocks).
 */
function messageContentToString(
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

/** Non-transient HTTP status (4xx other than 408/429) — deliberate, never retried. */
class XaiHttpError extends Error {
  readonly status: number
  constructor(status: number, body: string) {
    super(`xAI API ${status}: ${body.slice(0, 300)}`)
    this.status = status
  }
}

/** 408/429/5xx are transient (rate limit, upstream gateway failure) — retried with backoff. */
function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

export async function xaiChat(
  key: string,
  system: string,
  prompt: string,
  temperature: number,
): Promise<string> {
  let lastStatus = 0
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        // shortcut: 120s may be short for a 60-gloss batch at medium reasoning, raise it if a real batch aborts.
        signal: AbortSignal.timeout(120_000),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: process.env.XAI_MODEL || 'grok-4.7',
          reasoning_effort: process.env.XAI_REASONING_EFFORT || 'medium',
          temperature,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt },
          ],
        }),
      })
      if (isTransientStatus(res.status)) {
        lastStatus = res.status
        const wait = 1000 * 2 ** attempt
        console.warn(`  xAI ${res.status}, backing off ${wait}ms`)
        await Bun.sleep(wait)
        continue
      }
      if (!res.ok) {
        throw new XaiHttpError(res.status, await res.text())
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
      if (err instanceof XaiHttpError) throw err
      if (attempt === 4) throw err
      const wait = 1000 * 2 ** attempt
      console.warn(`  xAI request failed (${(err as Error)?.name ?? err}), backing off ${wait}ms`)
      await Bun.sleep(wait)
    }
  }
  throw new Error(`xAI API ${lastStatus}: retries exhausted`)
}
