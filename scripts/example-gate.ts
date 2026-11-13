/** Shared gate version for the generator and packs:check (#247). */
export const GATE_VERSION = 2

/** A pass stamped with the current gate prompt. Missing or older versions are stale. */
export function isCurrentPass(
  entry: { verdict?: string; gate?: number } | null | undefined,
): boolean {
  return entry?.verdict === 'pass' && entry.gate === GATE_VERSION
}
