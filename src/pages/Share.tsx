import { useCallback, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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

export function Share() {
  const nav = useNavigate()
  const loc = useLocation()
  const payload = pickShareCardPayload(loc.state)
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

      <p className="text-caption mb-4 text-center tracking-wide">
        Answer never appears on the card. The saved image stays cream.
      </p>

      <ShareCard {...payload} />

      {toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null}
    </Layout>
  )
}
