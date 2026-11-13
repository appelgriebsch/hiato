import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Layout, TopBar } from '@/components/Layout'
import { ShareCard } from '@/components/ShareCard'
import { Button } from '@/components/ui/button'
import { Toast } from '@/components/ui/toast'
import { acceptDailyInvite, dailyInviteTarget } from '@/lib/invite'
import {
  copyShareText,
  downloadShareCard,
  shareResult,
} from '@/lib/share-actions'
import { resolveSharePayload } from '@/lib/share-url'
import { CEFR_CODES, LANG_CODES } from '@/packs/labels'

export function Share() {
  const nav = useNavigate()
  const loc = useLocation()
  const [searchParams] = useSearchParams()
  const fromToken = searchParams.has('p')
  const payload = resolveSharePayload(searchParams, loc.state)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  // Play navigates here with state. A cold /share link does not.
  const invite = loc.state == null && payload ? dailyInviteTarget(payload) : null
  const [copyLabel, setCopyLabel] = useState('Copy text')
  const alive = useRef(true)
  const copyReset = useRef(0)

  useEffect(
    () => () => {
      alive.current = false
      window.clearTimeout(copyReset.current)
    },
    [],
  )

  const show = useCallback((message: string) => {
    setToast(message)
  }, [setToast])

  /** A shared link (`?p=`) opens Home. In-app share uses browser history. */
  const goBack = useCallback(() => {
    if (fromToken) {
      nav('/')
      return
    }
    nav(-1)
  }, [fromToken, nav])

  async function run(
    action: () => ReturnType<typeof shareResult>,
  ): Promise<void> {
    if (!payload || busy) return
    setBusy(true)
    try {
      const result = await action()
      if (result.method === 'cancelled') return
      show(result.message)
    } catch {
      show('Couldn’t share')
    } finally {
      setBusy(false)
    }
  }

  async function onCopyText(): Promise<void> {
    if (!payload || busy) return
    setBusy(true)
    try {
      const result = await copyShareText(payload)
      if (result.ok && result.message === 'Copied') {
        setCopyLabel('Copied')
        window.clearTimeout(copyReset.current)
        copyReset.current = window.setTimeout(() => setCopyLabel('Copy text'), 3000)
      } else if (result.method !== 'cancelled') {
        // Failed retry while the Copied timer is open: drop the label now.
        window.clearTimeout(copyReset.current)
        copyReset.current = 0
        setCopyLabel('Copy text')
      }
      if (result.method === 'cancelled') return
      show(result.message)
    } catch {
      window.clearTimeout(copyReset.current)
      copyReset.current = 0
      setCopyLabel('Copy text')
      show('Couldn’t share')
    } finally {
      setBusy(false)
    }
  }

  /** Tap runs precache. Prefs and /play run only on success, and only if still mounted. */
  async function onPlayDaily(): Promise<void> {
    if (!invite || busy || preparing) return
    setPreparing(true)
    setInviteError(null)
    const fail = `Could not load the ${LANG_CODES[invite.lang]} ${CEFR_CODES[invite.cefr]} pack. Check your connection and try again.`
    try {
      const ok = await acceptDailyInvite(invite, () => alive.current)
      if (!alive.current) return
      if (!ok) {
        setInviteError(fail)
        return
      }
      nav('/play?mode=daily')
    } catch {
      if (!alive.current) return
      setInviteError(fail)
    } finally {
      if (alive.current) setPreparing(false)
    }
  }

  if (!payload) {
    const emptyCopy = fromToken
      ? 'This share link can’t be opened.'
      : 'Nothing to share yet.'
    return (
      <Layout>
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <p className="text-ink-muted" role="status">
            {emptyCopy}
          </p>
          <Button fullWidth onClick={() => nav('/play?mode=daily')}>
            Back to play
          </Button>
        </div>
      </Layout>
    )
  }

  return (
    <Layout
      footer={
        <div className="space-y-2 pt-4 pb-6">
          {invite ? (
            <>
              {inviteError ? (
                <p role="alert" className="text-sm text-accent-fg">
                  {inviteError}
                </p>
              ) : null}
              <Button
                fullWidth
                disabled={busy || preparing}
                aria-busy={preparing}
                onClick={() => void onPlayDaily()}
              >
                {preparing
                  ? 'Preparing packs…'
                  : `Play today’s Daily · ${LANG_CODES[invite.lang]} ${CEFR_CODES[invite.cefr]}`}
              </Button>
            </>
          ) : null}
          <Button
            fullWidth
            variant={invite ? 'secondary' : undefined}
            disabled={busy}
            onClick={() => run(() => shareResult(payload))}
          >
            Share
          </Button>
          <Button
            fullWidth
            variant="secondary"
            disabled={busy}
            onClick={() => run(() => downloadShareCard(payload))}
          >
            Save image
          </Button>
          <Button
            fullWidth
            variant="outline"
            disabled={busy}
            aria-live="polite"
            onClick={() => void onCopyText()}
          >
            {copyLabel}
          </Button>
          {fromToken ? (
            <Button fullWidth variant="outline" onClick={() => nav('/')}>
              Home
            </Button>
          ) : null}
        </div>
      }
    >
      <TopBar
        left={
          <button
            type="button"
            className="motion-press inline-flex min-h-11 min-w-11 items-center text-sm text-ink-muted"
            onClick={goBack}
          >
            ← Back
          </button>
        }
        center={<span className="text-sm font-semibold tracking-tight">Share card</span>}
      />

      <p className="mb-4 text-center text-xs leading-[1.4] tracking-wide text-ink-muted">
        Answer never appears on the card. The saved image stays cream.
      </p>

      <ShareCard {...payload} />

      {toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null}
    </Layout>
  )
}
