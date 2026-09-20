import { BrandMark } from '@/components/brand/BrandMark'
import { letterCountLabel } from '@/engine'
import {
  shareCardCefrLabel,
  shareCardKicker,
  shareCardLangLabel,
  shareCardOutcome,
  type ShareCardPayload,
} from '@/lib/share-card'

export function ShareCard(payload: ShareCardPayload) {
  return (
    <div
      id="hiato-share-card"
      className="motion-share-card mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-line bg-gradient-to-b from-white to-accent-soft shadow-md"
    >
      <div className="px-6 pt-6 pb-2 text-center">
        <div className="mb-2.5 flex justify-center">
          <BrandMark size="sm" className="opacity-90" alt="" />
        </div>
        <div className="text-kicker">Hiato</div>
        <p className="mt-1 text-sm text-ink-muted">{shareCardKicker(payload)}</p>
      </div>
      <div className="mx-6 my-4 grid grid-cols-2 gap-3 rounded-xl bg-white/80 p-4 text-left text-sm">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-ink-faint">
            Language
          </div>
          <div className="font-medium text-ink">
            {shareCardLangLabel(payload.lang)}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-ink-faint">
            Level
          </div>
          <div className="font-medium text-ink">
            {shareCardCefrLabel(payload.cefr)}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-ink-faint">
            Streak
          </div>
          <div className="font-medium text-ink">{payload.streak}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-ink-faint">
            Date
          </div>
          <div className="font-medium text-ink">{payload.dateKey}</div>
        </div>
      </div>
      <div className="px-6 pb-6 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-ink shadow-sm">
          {shareCardOutcome(payload)} · {letterCountLabel(payload.wordLength)}
        </div>
        <p className="mt-3 text-xs text-ink-faint">
          Answer hidden — come play yours
        </p>
      </div>
    </div>
  )
}
