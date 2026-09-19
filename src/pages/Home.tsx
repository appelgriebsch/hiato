import { useEffect } from 'react'
import { getHealth } from '@/api'
import { Layout, TopBar } from '@/components/Layout'
import { OfflineChip } from '@/components/OfflineChip'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useShellStore } from '@/store/shell'

export function Home() {
  const healthOk = useShellStore((s) => s.healthOk)
  const setHealthOk = useShellStore((s) => s.setHealthOk)

  useEffect(() => {
    let cancelled = false
    void getHealth()
      .then((r) => {
        if (!cancelled) setHealthOk(r.ok === true)
      })
      .catch(() => {
        if (!cancelled) setHealthOk(false)
      })
    return () => {
      cancelled = true
    }
  }, [setHealthOk])

  return (
    <Layout>
      <TopBar
        left={
          <span className="text-lg font-semibold tracking-tight text-ink">
            Hiato
          </span>
        }
        right={<OfflineChip />}
      />

      <Card className="mb-4">
        <h1 className="mb-2 text-xl font-semibold text-ink">Ready when you are</h1>
        <p className="mb-4 text-[15px] leading-relaxed text-ink-muted">
          Playable daily rounds land in T2. This T1 shell is the installable PWA
          chrome and API seam.
        </p>
        <Button variant="primary" fullWidth disabled>
          Play coming in T2
        </Button>
      </Card>

      <p className="text-center text-xs text-ink-faint">
        API health:{' '}
        {healthOk === null ? '…' : healthOk ? 'ok' : 'unreachable (expected in local vite)'}
      </p>
    </Layout>
  )
}
