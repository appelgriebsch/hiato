/** Minimal types for CJS `nspell` (no bundled declarations). */
declare module 'nspell' {
  interface NSpell {
    correct(word: string): boolean
  }
  function nspell(
    aff:
      | string
      | Uint8Array
      | { aff: string | Uint8Array; dic?: string | Uint8Array },
    dic?: string | Uint8Array,
  ): NSpell
  export = nspell
}
