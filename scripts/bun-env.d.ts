/** Local Bun types so `tsc -b` typechecks scripts without `@types/bun` in CI. */

interface ImportMeta {
  dir: string
  file: string
}

declare module 'bun:sqlite' {
  export class Database {
    constructor(filename?: string, options?: { readonly?: boolean })
    query(sql: string): { all: (...params: unknown[]) => unknown[] }
    close(): void
  }
}

declare module 'bun:test' {
  export function describe(name: string, fn: () => void): void
  export function test(
    name: string,
    fn: (() => void | Promise<void>) | ((done: (err?: unknown) => void) => void),
  ): void
  export function beforeAll(fn: () => void | Promise<void>): void
  export function afterAll(fn: () => void | Promise<void>): void
  export function expect(actual: unknown): {
    toBe(expected: unknown): void
    toEqual(expected: unknown): void
    toContain(expected: unknown): void
    toBeNull(): void
    toBeUndefined(): void
    toBeTruthy(): void
    toBeFalsy(): void
    toBeGreaterThan(n: number): void
    toBeGreaterThanOrEqual(n: number): void
    toBeLessThan(n: number): void
    toBeLessThanOrEqual(n: number): void
    toBeCloseTo(n: number, digits?: number): void
    toMatch(re: RegExp | string): void
    toThrow(re?: RegExp | string): void
    not: {
      toBe(expected: unknown): void
      toEqual(expected: unknown): void
      toContain(expected: unknown): void
      toMatch(re: RegExp | string): void
      toThrow(re?: RegExp | string): void
    }
  }
}

declare const Bun: {
  write(path: string, data: string | ArrayBuffer): Promise<number>
  sleep(ms: number): Promise<void>
  file(
    path: string | URL,
  ): {
    text(): Promise<string>
  }
  /** bun.lock is JSONC (trailing commas). */
  JSONC: {
    parse(text: string): unknown
  }
}
