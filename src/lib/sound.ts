/**
 * Arcade sound cues (ADR 0052 decision 3 / §6). Off by default, stored in the
 * guest-local key `hiato.sound` = { "v": 1, "on": boolean } — separate from
 * `hiato.prefs`. Missing, invalid or unreadable storage means Off; a failed
 * write keeps the in-memory session state. A `storage` event updates other tabs.
 *
 * Web Audio only: one lazy AudioContext created/resumed on a user gesture,
 * oscillators + gain, master gain 0.08, 5ms attack/release, every cue ≤ 600ms.
 * No audio files, no autoplay, never the only carrier of meaning: every cue
 * repeats a state that is already on screen and announced.
 */

export const SOUND_STORAGE_KEY = 'hiato.sound'

export type CueName =
  | 'key-correct'
  | 'key-miss'
  | 'life-lost'
  | 'hint'
  | 'win'
  | 'loss'
  | 'streak'
  | 'freeze'
  | 'coin'

const MASTER_GAIN = 0.08
const ATTACK_RELEASE_S = 0.005

let sessionOn: boolean | null = null

function readStored(): boolean {
  try {
    const raw = localStorage.getItem(SOUND_STORAGE_KEY)
    if (!raw) return false
    const parsed: unknown = JSON.parse(raw)
    return (
      !!parsed &&
      typeof parsed === 'object' &&
      (parsed as { v?: unknown }).v === 1 &&
      (parsed as { on?: unknown }).on === true
    )
  } catch {
    return false
  }
}

export function getSoundOn(): boolean {
  if (sessionOn === null) sessionOn = readStored()
  return sessionOn
}

export function setSoundOn(on: boolean): void {
  sessionOn = on
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, JSON.stringify({ v: 1, on }))
  } catch {
    // Private mode / quota: the session state above still applies.
  }
}

/** Other tabs: a storage event on `hiato.sound` re-reads the stored value. */
export function subscribeSoundChange(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (event: StorageEvent) => {
    if (event.key && event.key !== SOUND_STORAGE_KEY) return
    sessionOn = null
    listener()
  }
  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
}

type Note = {
  freq: number
  freqEnd?: number
  type: OscillatorType
  at: number
  dur: number
}

const N = {
  A3: 220,
  C4: 261.63,
  E4: 329.63,
  G4: 392,
  A4: 440,
  C5: 523.25,
  E5: 659.25,
  G5: 783.99,
  B5: 987.77,
  C6: 1046.5,
  E6: 1318.51,
  A6: 1760,
} as const

const CUES: Record<CueName, Note[]> = {
  'key-correct': [
    { freq: N.C6, freqEnd: N.E6, type: 'square', at: 0, dur: 0.05 },
    { freq: N.E6, type: 'square', at: 0.05, dur: 0.05 },
  ],
  'key-miss': [
    { freq: N.A3, freqEnd: N.A3 * Math.pow(2, -60 / 1200), type: 'triangle', at: 0, dur: 0.12 },
  ],
  'life-lost': [N.E5, N.C5, N.A4].map((freq, i) => ({
    freq,
    type: 'square' as const,
    at: i * 0.06,
    dur: 0.06,
  })),
  hint: [{ freq: N.G5, type: 'triangle', at: 0, dur: 0.14 }],
  win: [N.C5, N.E5, N.G5, N.C6, N.E6].map((freq, i) => ({
    freq,
    type: 'square' as const,
    at: i * 0.09,
    dur: 0.09,
  })),
  loss: [N.G4, N.E4, N.C4].map((freq, i) => ({
    freq,
    type: 'triangle' as const,
    at: i * 0.14,
    dur: 0.14,
  })),
  streak: [
    { freq: N.B5, freqEnd: N.E6, type: 'square', at: 0, dur: 0.06 },
    { freq: N.E6, type: 'square', at: 0.06, dur: 0.06 },
  ],
  freeze: [
    { freq: N.A6, type: 'sine', at: 0, dur: 0.05 },
    { freq: N.A6, type: 'sine', at: 0.05, dur: 0.05 },
  ],
  coin: [
    { freq: N.B5, freqEnd: N.E6, type: 'square', at: 0, dur: 0.06 },
    { freq: N.E6, type: 'square', at: 0.06, dur: 0.06 },
  ],
}

type AudioContextLike = {
  state: string
  currentTime: number
  destination: unknown
  resume: () => Promise<void>
  createGain: () => GainNodeLike
  createOscillator: () => OscillatorNodeLike
}

type GainNodeLike = {
  gain: { value: number; setValueAtTime: (v: number, t: number) => void; linearRampToValueAtTime: (v: number, t: number) => void }
  connect: (dest: unknown) => void
}

type OscillatorNodeLike = {
  type: OscillatorType
  frequency: { value: number; setValueAtTime: (v: number, t: number) => void; linearRampToValueAtTime: (v: number, t: number) => void }
  connect: (dest: unknown) => void
  start: (t?: number) => void
  stop: (t?: number) => void
}

let audioCtx: AudioContextLike | null = null
let masterGain: GainNodeLike | null = null
let liveNodes: { stop: () => void }[] = []

function getContext(): AudioContextLike | null {
  const g = globalThis as unknown as {
    AudioContext?: new () => AudioContextLike
    webkitAudioContext?: new () => AudioContextLike
  }
  const Ctor = g.AudioContext ?? g.webkitAudioContext
  if (!Ctor) return null
  if (!audioCtx) {
    audioCtx = new Ctor()
    masterGain = audioCtx.createGain()
    masterGain.gain.value = MASTER_GAIN
    masterGain.connect(audioCtx.destination)
    // Respect the device silent switch where supported (Safari 16.4+).
    // Never 'playback' and never a silent <audio> element.
    const nav = navigator as Navigator & { audioSession?: { type?: string } }
    if (nav.audioSession && typeof nav.audioSession.type === 'string') {
      try {
        nav.audioSession.type = 'ambient'
      } catch {
        /* unsupported */
      }
    }
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume()
  }
  return audioCtx
}

/**
 * Play a cue — only when sound is on, the page is visible and speech is not
 * speaking. Call sites are user gestures (key tap, hint, round end, switch).
 * A new cue cuts the previous one.
 */
export function playCue(name: CueName): void {
  if (!getSoundOn()) return
  if (typeof document !== 'undefined' && document.hidden) return
  try {
    if (typeof speechSynthesis !== 'undefined' && speechSynthesis.speaking) return
  } catch {
    /* no speech API — cues may play */
  }
  const ctx = getContext()
  if (!ctx || !masterGain) return
  for (const node of liveNodes) {
    try {
      node.stop()
    } catch {
      /* already stopped */
    }
  }
  liveNodes = []
  const t0 = ctx.currentTime
  for (const note of CUES[name]) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = note.type
    const start = t0 + note.at
    const end = start + note.dur
    osc.frequency.setValueAtTime(note.freq, start)
    if (note.freqEnd) osc.frequency.linearRampToValueAtTime(note.freqEnd, end)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.linearRampToValueAtTime(1, start + ATTACK_RELEASE_S)
    gain.gain.setValueAtTime(1, Math.max(start + ATTACK_RELEASE_S, end - ATTACK_RELEASE_S))
    gain.gain.linearRampToValueAtTime(0.0001, end)
    osc.connect(gain)
    gain.connect(masterGain)
    osc.start(start)
    osc.stop(end + ATTACK_RELEASE_S)
    liveNodes.push(osc)
  }
}
