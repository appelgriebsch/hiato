/**
 * Lives metaphor — single switch for Impl / product.
 * Andreas pick (T6 / ADR 0025): seeds. Flip LIVES_METAPHOR to try others;
 * changing the constant does not change game rules (TOTAL_LIVES stays 6).
 */
export type LivesMetaphor = 'hearts' | 'stars' | 'ink' | 'seeds' | 'chalk' | 'tiles'

/** Flip this one constant to change the play lives icon set. */
export const LIVES_METAPHOR: LivesMetaphor = 'seeds'

export const LIVES_METAPHOR_LABELS: Record<LivesMetaphor, string> = {
  hearts: 'Hearts',
  stars: 'Stars',
  ink: 'Ink drops',
  seeds: 'Seeds',
  chalk: 'Chalk sticks',
  tiles: 'Letter tiles',
}
