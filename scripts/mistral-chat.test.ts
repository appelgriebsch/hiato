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
  test('posts MISTRAL_MODEL to api.mistral.ai and returns the first choice', async () => {
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
      expect('top_p' in sent).toBe(false)
    } finally {
      restoreGlobals()
    }
  })

  test('greedy sampling (temperature 0) sends top_p 1 — API error 3054 otherwise', async () => {
    try {
      const { bodies } = stubFetch([OK])
      await mistralChat('k', 'sys', 'prompt', 0)
      const sent = JSON.parse(bodies[0]) as { temperature: number; top_p?: number }
      expect(sent.temperature).toBe(0)
      expect(sent.top_p).toBe(1)
    } finally {
      restoreGlobals()
    }
  })

  test('content returned as an array of blocks is joined to a string (run 43104173938)', async () => {
    try {
      stubFetch([
        {
          status: 200,
          body: {
            choices: [
              {
                message: {
                  content: [
                    { type: 'text', text: 'PASS' },
                    { type: 'text', text: ' — A1 ok.' },
                  ],
                },
              },
            ],
          },
        },
      ])
      const content = await mistralChat('k', 'sys', 'prompt', 0)
      expect(content).toBe('PASS — A1 ok.')
      expect(typeof content).toBe('string')
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

  test('backs off and retries when fetch rejects (e.g. AbortSignal TimeoutError, run 43198026054)', async () => {
    try {
      stubSleep()
      const timeout = new DOMException('The operation timed out.', 'TimeoutError')
      let calls = 0
      globalThis.fetch = (async () => {
        calls++
        if (calls < 3) throw timeout
        return new Response(JSON.stringify(OK.body), { status: 200 })
      }) as typeof fetch
      const content = await mistralChat('k', 'sys', 'prompt', 0.2)
      expect(content).toBe('{"A": ["b"]}')
      expect(calls).toBe(3)
    } finally {
      restoreGlobals()
    }
  })

  test('rethrows a fetch rejection after 5 exhausted attempts', async () => {
    try {
      stubSleep()
      const timeout = new DOMException('The operation timed out.', 'TimeoutError')
      let calls = 0
      globalThis.fetch = (async () => {
        calls++
        throw timeout
      }) as typeof fetch
      let err: unknown
      try {
        await mistralChat('k', 'sys', 'prompt', 0.2)
      } catch (e) {
        err = e
      }
      expect(err).toBe(timeout)
      expect(calls).toBe(5)
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

  test('backs off and retries on transient 5xx (run 43222663925 answered 502)', async () => {
    try {
      stubSleep()
      const { calls } = stubFetch([{ status: 502 }, { status: 503 }, OK])
      const content = await mistralChat('k', 'sys', 'prompt', 0.2)
      expect(content).toBe('{"A": ["b"]}')
      expect(calls.length).toBe(3)
    } finally {
      restoreGlobals()
    }
  })

  test('throws after 5 exhausted 5xx retries', async () => {
    try {
      stubSleep()
      const { calls } = stubFetch(Array(5).fill({ status: 502, body: { error: 'upstream' } }))
      let err: unknown
      try {
        await mistralChat('k', 'sys', 'prompt', 0.2)
      } catch (e) {
        err = e
      }
      expect((err as Error).message).toBe('Mistral API 502: retries exhausted')
      expect(calls.length).toBe(5)
    } finally {
      restoreGlobals()
    }
  })

  test('throws on deliberate 4xx errors without retrying', async () => {
    try {
      const { calls } = stubFetch([{ status: 400, body: { error: 'boom' } }])
      let err: unknown
      try {
        await mistralChat('k', 'sys', 'prompt', 0.2)
      } catch (e) {
        err = e
      }
      expect((err as Error).message).toContain('Mistral API 400')
      expect(calls.length).toBe(1)
    } finally {
      restoreGlobals()
    }
  })
})
