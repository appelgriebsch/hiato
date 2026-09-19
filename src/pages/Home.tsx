import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getHealth } from '@/api'
import { Layout, TopBar } from '@/components/Layout'
import { OfflineChip } from '@/components/OfflineChip'
import { Card } from '@/components/ui/card'
import { useShellStore } from '@/store/shell'
import { T2_CEFR, T2_LANG, loadPack } from '@/packs/load'

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

  // Warm EN A1 pack into localStorage cache on first visit
  useEffect(() => {
    void loadPack(T2_LANG, T2_CEFR).catch(() => {})
  }, [])

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
        <h1 className="mb-2 text-xl font-semibold text-ink">Daily EN A1</h1>
        <p className="mb-4 text-[15px] leading-relaxed text-ink-muted">
          Guess today’s word with soft vowel help, six lives, and learner hints.
          Offline after the pack is cached.
        </p>
        <Link
          to="/play"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-accent px-5 text-[15px] font-medium text-white shadow-sm hover:bg-accent-mid active:scale-[0.98]"
        >
          Play today
        </Link>
      </Card>

      <p className="text-center text-xs text-ink-faint">
        API health:{' '}
        {healthOk === null
          ? '…'
          : healthOk
            ? 'ok'
            : 'unreachable (expected in local vite)'}
      </p>
    </Layout>
  )
}
