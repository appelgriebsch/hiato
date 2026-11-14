/**
 * Arcade cues (ADR 0052 §6). Off by default. `hiato.sound` is
 * { "v": 1, "on": boolean }, separate from prefs. getSoundOn() reads storage
 * on each call so another tab's write is heard on the next cue. A failed
 * write keeps this tab's in-memory value. No audio files.
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

const MASTER = 0.08
const EDGE = 0.005

let sessionOn = false
let persistFailed = false

function readStored(): boolean {
  try {
    const raw = localStorage.getItem(SOUND_STORAGE_KEY)
    if (!raw) return false
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return false
    const row = parsed as { v?: unknown; on?: unknown }
    return row.v === 1 && row.on === true
  } catch {
    return false
  }
}

export function getSoundOn(): boolean {
  return persistFailed ? sessionOn : readStored()
}

export function setSoundOn(on: boolean): void {
  sessionOn = on
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, JSON.stringify({ v: 1, on }))
    persistFailed = false
  } catch {
    persistFailed = true
  }
}

/** About switch: re-render when another tab writes `hiato.sound`. */
export function subscribeSoundChange(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (event: StorageEvent) => {
    if (event.key && event.key !== SOUND_STORAGE_KEY) return
    listener()
  }
  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
}

type Note = { f: number; wave: OscillatorType; at: number; d: number; end?: number }

const step = (freqs: number[], wave: OscillatorType, d: number): Note[] =>
  freqs.map((f, i) => ({ f, wave, at: i * d, d }))

const A3 = 220
const C4 = 261.63
const E4 = 329.63
const G4 = 392
const A4 = 440
const C5 = 523.25
const E5 = 659.25
const G5 = 783.99
const B5 = 987.77
const C6 = 1046.5
const E6 = 1318.51
const A6 = 1760

const bling: Note[] = [
  { f: B5, end: E6, wave: 'square', at: 0, d: 0.06 },
  { f: E6, wave: 'square', at: 0.06, d: 0.06 },
]

const CUES: Record<CueName, Note[]> = {
  'key-correct': [
    { f: C6, end: E6, wave: 'square', at: 0, d: 0.05 },
    { f: E6, wave: 'square', at: 0.05, d: 0.05 },
  ],
  'key-miss': [{ f: A3, end: A3 * 2 ** (-60 / 1200), wave: 'triangle', at: 0, d: 0.12 }],
  'life-lost': step([E5, C5, A4], 'square', 0.06),
  hint: [{ f: G5, wave: 'triangle', at: 0, d: 0.14 }],
  win: step([C5, E5, G5, C6, E6], 'square', 0.09),
  loss: step([G4, E4, C4], 'triangle', 0.14),
  streak: bling,
  freeze: [
    { f: A6, wave: 'sine', at: 0, d: 0.05 },
    { f: A6, wave: 'sine', at: 0.05, d: 0.05 },
  ],
  coin: bling,
}

let audioCtx: AudioContext | null = null
let master: GainNode | null = null
let live: OscillatorNode[] = []

function getContext(): AudioContext | null {
  const g = globalThis as unknown as {
    AudioContext?: new () => AudioContext
    webkitAudioContext?: new () => AudioContext
  }
  const Ctor = g.AudioContext ?? g.webkitAudioContext
  if (!Ctor) return null
  if (!audioCtx) {
    audioCtx = new Ctor()
    master = audioCtx.createGain()
    master.gain.value = MASTER
    master.connect(audioCtx.destination)
    const nav = navigator as Navigator & { audioSession?: { type?: string } }
    if (nav.audioSession && typeof nav.audioSession.type === 'string') {
      try {
        nav.audioSession.type = 'ambient'
      } catch {
        /* unsupported */
      }
    }
  }
  if (audioCtx.state === 'suspended') void audioCtx.resume()
  return audioCtx
}

/** Play a cue when sound is on, the page is visible, and speech is idle. A new cue cuts the previous one. */
export function playCue(name: CueName): void {
  if (!getSoundOn()) return
  if (typeof document !== 'undefined' && document.hidden) return
  try {
    if (typeof speechSynthesis !== 'undefined' && speechSynthesis.speaking) return
  } catch {
    /* no speech API */
  }
  const ctx = getContext()
  if (!ctx || !master) return
  for (const node of live) {
    try {
      node.stop()
    } catch {
      /* already stopped */
    }
  }
  live = []
  const t0 = ctx.currentTime
  for (const note of CUES[name]) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = note.wave
    const start = t0 + note.at
    const end = start + note.d
    osc.frequency.setValueAtTime(note.f, start)
    if (note.end) osc.frequency.linearRampToValueAtTime(note.end, end)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.linearRampToValueAtTime(1, start + EDGE)
    gain.gain.setValueAtTime(1, Math.max(start + EDGE, end - EDGE))
    gain.gain.linearRampToValueAtTime(0.0001, end)
    osc.connect(gain)
    gain.connect(master)
    osc.start(start)
    osc.stop(end + EDGE)
    live.push(osc)
  }
}
