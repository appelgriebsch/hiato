import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
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

const OK = {
  status: 200,
  body: { choices: [{ message: { content: '{"A": ["b"]}' } }] },
}

beforeEach(() => {
  ;(Bun as unknown as { sleep: unknown }).sleep = async () => {}
})

afterEach(() => {
  globalThis.fetch = originalFetch
  ;(Bun as unknown as { sleep: unknown }).sleep = originalSleep
  delete process.env.MISTRAL_API_KEY
})

describe('readMistralKey', () => {
  test('returns MISTRAL_API_KEY when set, null otherwise', () => {
    expect(readMistralKey()).toBeNull()
    process.env.MISTRAL_API_KEY = 'test-key'
    expect(readMistralKey()).toBe('test-key')
  })
})

describe('mistralChat', () => {
  test('posts mistral-large-4-0 to api.mistral.ai and returns the first choice', async () => {
    const { calls, bodies } = stubFetch([OK])
    const content = await mistralChat('k', 'sys', 'prompt', 0.2)
    expect(content).toBe('{"A": ["b"]}')
    expect(calls).toEqual(['https://api.mistral.ai/v1/chat/completions'])
    const sent = JSON.parse(bodies[0])
    expect(sent.model).toBe(MISTRAL_MODEL)
    expect(sent.temperature).toBe(0.2)
    expect(sent.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'prompt' },
    ])
  })

  test('backs off and retries on 429', async () => {
    const { calls } = stubFetch([{ status: 429 }, { status: 429 }, OK])
    const content = await mistralChat('k', 'sys', 'prompt', 0.2)
    expect(content).toBe('{"A": ["b"]}')
    expect(calls).toHaveLength(3)
  })

  test('throws after 5 exhausted 429 retries', async () => {
    const { calls } = stubFetch(Array(5).fill({ status: 429 }))
    await expect(mistralChat('k', 'sys', 'prompt', 0.2)).rejects.toThrow(
      'Mistral API 429: retries exhausted',
    )
    expect(calls).toHaveLength(5)
  })

  test('throws on non-429 errors without retrying', async () => {
    const { calls } = stubFetch([{ status: 500, body: { error: 'boom' } }])
    await expect(mistralChat('k', 'sys', 'prompt', 0.2)).rejects.toThrow('Mistral API 500')
    expect(calls).toHaveLength(1)
  })
})
