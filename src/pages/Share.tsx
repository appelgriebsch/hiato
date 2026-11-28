import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useT } from '@/i18n/use-ui-locale'
import type { UiKey } from '@/i18n'
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
  const [toastTone, setToastTone] = useState<'neutral' | 'error'>('neutral')
  const [busy, setBusy] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  // Play navigates here with state. A cold /share link does not.
  const invite = loc.state == null && payload ? dailyInviteTarget(payload) : null
  const t = useT()
  const [copyLabel, setCopyLabel] = useState<UiKey>('share.copyText')
  const alive = useRef(true)
  const copyReset = useRef(0)

  useEffect(
    () => () => {
      alive.current = false
      window.clearTimeout(copyReset.current)
    },
    [],
  )

  const show = useCallback(
    (message: string, tone: 'neutral' | 'error' = 'neutral') => {
      setToastTone(tone)
      setToast(message)
    },
    [setToast, setToastTone],
  )

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
      show(t(result.messageKey, result.messageParams))
    } catch {
      show(t('share.couldNotShare'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function onCopyText(): Promise<void> {
    if (!payload || busy) return
    setBusy(true)
    try {
      const result = await copyShareText(payload)
      if (result.ok && result.method === 'clipboard') {
        setCopyLabel('share.copied')
        window.clearTimeout(copyReset.current)
        copyReset.current = window.setTimeout(() => setCopyLabel('share.copyText'), 3000)
      } else if (result.method !== 'cancelled') {
        // Failed retry while the Copied timer is open: drop the label now.
        window.clearTimeout(copyReset.current)
        copyReset.current = 0
        setCopyLabel('share.copyText')
      }
      if (result.method === 'cancelled') return
      show(t(result.messageKey, result.messageParams))
    } catch {
      window.clearTimeout(copyReset.current)
      copyReset.current = 0
      setCopyLabel('share.copyText')
      show(t('share.couldNotShare'), 'error')
    } finally {
      setBusy(false)
    }
  }

  /** Tap runs precache. Prefs and /play run only on success, and only if still mounted. */
  async function onPlayDaily(): Promise<void> {
    if (!invite || busy || preparing) return
    setPreparing(true)
    setInviteError(null)
    const fail = t('share.inviteFail', {
      lang: LANG_CODES[invite.lang],
      cefr: CEFR_CODES[invite.cefr],
    })
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
    const emptyCopy = fromToken ? t('share.emptyToken') : t('share.empty')
    return (
      <Layout>
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <p className="text-ink-muted" role="status">
            {emptyCopy}
          </p>
          <Button fullWidth onClick={() => nav('/play?mode=daily')}>
            {t('share.backToPlay')}
          </Button>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <TopBar
        left={
          <button
            type="button"
            className="motion-press inline-flex min-h-11 min-w-11 items-center text-sm text-ink-muted"
            onClick={goBack}
          >
            {t('common.back')}
          </button>
        }
        center={<span className="text-pixel-title text-ink">{t('share.title')}</span>}
      />

      <p className="mb-4 text-center text-xs leading-[1.4] tracking-wide text-ink-muted">
        {t('share.caption')}
      </p>

      <ShareCard {...payload} />

      <div data-share-actions className="mt-4 space-y-2 pb-6">
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
                ? t('common.preparing')
                : t('share.playDailyInvite', {
                    lang: LANG_CODES[invite.lang],
                    cefr: CEFR_CODES[invite.cefr],
                  })}
            </Button>
          </>
        ) : null}
        <Button
          fullWidth
          variant={invite ? 'secondary' : undefined}
          disabled={busy}
          onClick={() => run(() => shareResult(payload))}
        >
          {t('common.share')}
        </Button>
        <Button
          fullWidth
          variant="secondary"
          disabled={busy}
          onClick={() => run(() => downloadShareCard(payload))}
        >
          {t('share.saveImage')}
        </Button>
        <Button
          fullWidth
          variant="outline"
          disabled={busy}
          aria-live="polite"
          onClick={() => void onCopyText()}
        >
          {t(copyLabel)}
        </Button>
        {fromToken ? (
          <Button fullWidth variant="outline" onClick={() => nav('/')}>
            {t('share.home')}
          </Button>
        ) : null}
      </div>

      {toast ? <Toast message={toast} tone={toastTone} onDone={() => setToast(null)} /> : null}
    </Layout>
  )
}
