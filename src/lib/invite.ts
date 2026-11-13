/**
 * Invite-to-play on daily share links (ADR 0036 amendment 2026-11-13, #226).
 * Consent is the tap, never the open: prefs are written only after the tap,
 * only once the pack precache succeeds, and only if the caller is still mounted.
 * Practice shares never invite (ADR 0018).
 */
import { precacheSelectedLanguage } from '../packs/cache'
import { setPrefs, type Prefs } from './prefs'
import type { ShareCardPayload } from './share-card'

/**
 * Non-null only for `mode: 'daily'` payloads. lang/cefr are already validated
 * by pickShareCardPayload, so the invite can only set a valid lang×CEFR pair.
 */
export function dailyInviteTarget(payload: ShareCardPayload): Prefs | null {
  if (payload.mode !== 'daily') return null
  return { lang: payload.lang, cefr: payload.cefr }
}

/**
 * Precache first. Write `hiato.prefs` only when that succeeds and `alive`
 * is still true, so an unmounted Share screen never stores the invite.
 */
export async function acceptDailyInvite(
  invite: Prefs,
  alive: () => boolean = () => true,
): Promise<boolean> {
  const ok = await precacheSelectedLanguage(invite.lang, invite.cefr)
  if (!ok || !alive()) return false
  setPrefs(invite)
  return true
}
