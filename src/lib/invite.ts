/**
 * Invite-to-play on daily share links (ADR 0036 amendment 2026-11-13, #226).
 * Consent is the tap, never the open: prefs are written only after the tap and
 * only once the pack precache succeeds. Practice shares never invite (ADR 0018).
 */
import { precacheSelectedLanguage } from '../packs/cache'
import type { PackCefr, PackLang } from '../packs/schema'
import { setPrefs } from './prefs'
import type { ShareCardPayload } from './share-card'

export interface DailyInvite {
  lang: PackLang
  cefr: PackCefr
}

/**
 * Non-null only for `mode: 'daily'` payloads. lang/cefr are already validated
 * by pickShareCardPayload, so the invite can only set a valid lang×CEFR pair.
 */
export function dailyInviteTarget(payload: ShareCardPayload): DailyInvite | null {
  if (payload.mode !== 'daily') return null
  return { lang: payload.lang, cefr: payload.cefr }
}

/**
 * Run the precache first; write `hiato.prefs` only when it succeeds.
 * Returns false (prefs untouched) when the pack load fails.
 */
export async function acceptDailyInvite(invite: DailyInvite): Promise<boolean> {
  const ok = await precacheSelectedLanguage(invite.lang, invite.cefr)
  if (!ok) return false
  setPrefs({ lang: invite.lang, cefr: invite.cefr })
  return true
}
