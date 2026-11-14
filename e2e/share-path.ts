/**
 * Token encoding mirrors src/lib/share-url.ts (base64url of the share JSON),
 * as in share-invite.spec.ts. Shared so share specs do not import each other.
 */
function shareToken(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

export function sharePath(payload: Record<string, unknown>): string {
  return `/share?p=${encodeURIComponent(shareToken(payload))}`
}
