import { describe, expect, test } from 'bun:test'
import { MISTRAL_MODEL, mistralChat, readMistralKey } from './mistral-chat'

const originalFetch = globalThis.fetch
const originalSleep = Bun.sleep

type StubResponse = { status: number; body?: unknown }

function stubFetch(responses: StubResponse[]): { calls: string[]; bodies: string[] } {
  const calls: string[] = []
  const bodies: string[] = []
  globalThis.fetch = (async (input: unknown, init?: { body?: unknown }) => {
    calls.push(String(input))
    bodies.push(String(init?.body ?? ''))
    const r = responses.shift()
    if (!r) throw new Error('unexpected extra fetch call')
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status })
  }) as typeof fetch
  return { calls, bodies }
}

function stubSleep(): void {
  ;(Bun as unknown as { sleep: unknown }).sleep = async () => {}
}

function restoreGlobals(): void {
  globalThis.fetch = originalFetch
  ;(Bun as unknown as { sleep: unknown }).sleep = originalSleep
  delete process.env.MISTRAL_API_KEY
}

const OK = {
  status: 200,
  body: { choices: [{ message: { content: '{"A": ["b"]}' } }] },
}

describe('readMistralKey', () => {
  test('returns MISTRAL_API_KEY when set, null otherwise', () => {
    try {
      expect(readMistralKey()).toBeNull()
      process.env.MISTRAL_API_KEY = 'test-key'
      expect(readMistralKey()).toBe('test-key')
    } finally {
      restoreGlobals()
    }
  })
})

describe('mistralChat', () => {
  test('posts mistral-large-4-0 to api.mistral.ai and returns the first choice', async () => {
    try {
      const { calls, bodies } = stubFetch([OK])
      const content = await mistralChat('k', 'sys', 'prompt', 0.2)
      expect(content).toBe('{"A": ["b"]}')
      expect(calls).toEqual(['https://api.mistral.ai/v1/chat/completions'])
      const sent = JSON.parse(bodies[0]) as {
        model: string
        temperature: number
        messages: unknown
      }
      expect(sent.model).toBe(MISTRAL_MODEL)
      expect(sent.temperature).toBe(0.2)
      expect(sent.messages).toEqual([
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'prompt' },
      ])
    } finally {
      restoreGlobals()
    }
  })

  test('backs off and retries on 429', async () => {
    try {
      stubSleep()
      const { calls } = stubFetch([{ status: 429 }, { status: 429 }, OK])
      const content = await mistralChat('k', 'sys', 'prompt', 0.2)
      expect(content).toBe('{"A": ["b"]}')
      expect(calls.length).toBe(3)
    } finally {
      restoreGlobals()
    }
  })

  test('throws after 5 exhausted 429 retries', async () => {
    try {
      stubSleep()
      const { calls } = stubFetch(Array(5).fill({ status: 429 }))
      let err: unknown
      try {
        await mistralChat('k', 'sys', 'prompt', 0.2)
      } catch (e) {
        err = e
      }
      expect((err as Error).message).toBe('Mistral API 429: retries exhausted')
      expect(calls.length).toBe(5)
    } finally {
      restoreGlobals()
    }
  })

  test('throws on non-429 errors without retrying', async () => {
    try {
      const { calls } = stubFetch([{ status: 500, body: { error: 'boom' } }])
      let err: unknown
      try {
        await mistralChat('k', 'sys', 'prompt', 0.2)
      } catch (e) {
        err = e
      }
      expect((err as Error).message).toContain('Mistral API 500')
      expect(calls.length).toBe(1)
    } finally {
      restoreGlobals()
    }
  })
})
