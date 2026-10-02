import { useCallback, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Layout, TopBar } from '@/components/Layout'
import { ShareCard } from '@/components/ShareCard'
import { Button } from '@/components/ui/button'
import { Toast } from '@/components/ui/toast'
import {
  copyShareText,
  downloadShareCard,
  shareResult,
} from '@/lib/share-actions'
import { resolveSharePayload } from '@/lib/share-url'

export function Share() {
  const nav = useNavigate()
  const loc = useLocation()
  const [searchParams] = useSearchParams()
  const fromToken = searchParams.has('p')
  const payload = resolveSharePayload(searchParams, loc.state)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const show = useCallback((message: string) => {
    setToast(message)
  }, [])

  /** Cold-open `/share?p=` has no useful history — prefer absolute Home. */
  const goBack = useCallback(() => {
    if (fromToken) {
      if (typeof window !== 'undefined' && window.history.length > 1) {
        nav(-1)
      } else {
        nav('/')
      }
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
          <Button
            fullWidth
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
            onClick={() => run(() => copyShareText(payload))}
          >
            Copy text
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
