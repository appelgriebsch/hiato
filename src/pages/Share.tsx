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
import { pickShareCardPayload } from '@/lib/share-card'
import { decodeShareUrlToken } from '@/lib/share-url'

/**
 * Resolve share payload (ADR 0036 / #107).
 * Precedence: when `p=` is present, hydrate from the token (cold open /
 * refresh / shared link). Corrupt or empty `p=` soft-fails to the empty
 * Share UX — does not fall through to location.state. When `p=` is absent,
 * use location.state (in-app Play → Share without a query). Share is not
 * gated by the Language wall (unlike /play).
 */
function resolveSharePayload(
  searchParams: URLSearchParams,
  state: unknown,
) {
  if (searchParams.has('p')) {
    return decodeShareUrlToken(searchParams.get('p'))
  }
  return pickShareCardPayload(state)
}

export function Share() {
  const nav = useNavigate()
  const loc = useLocation()
  const [searchParams] = useSearchParams()
  const payload = resolveSharePayload(searchParams, loc.state)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const show = useCallback((message: string) => {
    setToast(message)
  }, [])

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
    return (
      <Layout>
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <p className="text-ink-muted">Nothing to share yet.</p>
          <Button onClick={() => nav('/play?mode=daily')}>Back to play</Button>
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
        </div>
      }
    >
      <TopBar
        left={
          <button
            type="button"
            className="motion-press text-sm text-ink-muted"
            onClick={() => nav(-1)}
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
