import { create } from 'zustand'

type ShellState = {
  healthOk: boolean | null
  setHealthOk: (ok: boolean | null) => void
}

export const useShellStore = create<ShellState>((set) => ({
  healthOk: null,
  setHealthOk: (ok) => set({ healthOk: ok }),
}))
