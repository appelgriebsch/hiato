import { describe, expect, test } from 'bun:test'
import { loadDenylist } from './lemma-denylist'
import { generateSynonyms } from './synonym-generate'

const originalFetch = globalThis.fetch
const originalKey = process.env.MISTRAL_API_KEY
const DENY = loadDenylist()

function setupEnv(): void {
  process.env.MISTRAL_API_KEY = 'test-key' // generateSynonyms requires a key even with fetch stubbed
}

function teardownEnv(): void {
  globalThis.fetch = originalFetch
  if (originalKey === undefined) delete process.env.MISTRAL_API_KEY
  else process.env.MISTRAL_API_KEY = originalKey
}

/** Stub the Mistral HTTP endpoint; each entry is one response's message content. */
function stubFetch(contents: string[]): { calls: () => number } {
  let calls = 0
  globalThis.fetch = (async () => {
    calls++
    const content = contents.length > 0 ? contents.shift()! : '{}'
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
    })
  }) as typeof fetch
  return { calls: () => calls }
}

describe('generateSynonyms (#330 soft main loop)', () => {
  test('a malformed main-batch response falls through to the retry loop instead of aborting', async () => {
    setupEnv()
    try {
      const { calls } = stubFetch([
        'not json at all', // 60-lemma main batch: unparseable, must not abort the run
        JSON.stringify({ ALPHA: ['primo'], BETA: ['secondo'] }), // 20-lemma retry batch
      ])
      const cache: Record<string, string[]> = {}
      const saves: number[] = []
      await generateSynonyms('it', ['ALPHA', 'BETA'], cache, DENY, (c) =>
        saves.push(Object.keys(c).length),
      )
      expect(cache['ALPHA']).toEqual(['primo'])
      expect(cache['BETA']).toEqual(['secondo'])
      expect(calls()).toBe(2) // one main batch + one retry batch; the run did not abort
      expect(saves.length).toBeGreaterThan(0)
    } finally {
      teardownEnv()
    }
  })

  test('[] settles a key (unique referent) and is not retried', async () => {
    setupEnv()
    try {
      const { calls } = stubFetch([JSON.stringify({ SOLO: [] })])
      const cache: Record<string, string[]> = {}
      await generateSynonyms('it', ['SOLO'], cache, DENY, () => {})
      expect(cache['SOLO']).toEqual([])
      expect(calls()).toBe(1)
    } finally {
      teardownEnv()
    }
  })

  test('already-settled keys are not re-requested', async () => {
    setupEnv()
    try {
      const { calls } = stubFetch([])
      const cache: Record<string, string[]> = { ALPHA: ['primo'] }
      await generateSynonyms('it', ['ALPHA'], cache, DENY, () => {})
      expect(calls()).toBe(0)
      expect(cache['ALPHA']).toEqual(['primo'])
    } finally {
      teardownEnv()
    }
  })
})
