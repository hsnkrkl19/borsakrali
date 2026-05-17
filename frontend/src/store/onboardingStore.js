/**
 * Parça 4 — Onboarding store.
 *
 * 5 adımlı ilk-giriş turunun state'ini tutar.
 *  - step: 1..5
 *  - completed: tur bittiğinde true (localStorage'a yazılır)
 *  - skipped: kullanıcı "Geç" derse true (farklı bayrak — telemetri için)
 *
 * "Tanıtım turunu tekrar göster" → restart() çağrısı her iki bayrağı sıfırlar
 * + step'i 1'e çeker.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

const STORAGE_KEY = 'bk-onboarding-v1'

export const useOnboardingStore = create(
  persist(
    (set, get) => ({
      step: 1,
      completed: false,
      skipped: false,

      next: () => {
        const s = get().step
        if (s >= 5) {
          set({ step: 5, completed: true })
        } else {
          set({ step: s + 1 })
        }
      },
      prev: () => {
        const s = get().step
        set({ step: Math.max(1, s - 1) })
      },
      goTo: (n) => set({ step: Math.max(1, Math.min(5, n)) }),
      complete: () => set({ completed: true }),
      skip: () => set({ skipped: true, completed: true }),
      restart: () => set({ step: 1, completed: false, skipped: false }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      version: 1,
      // Eski (v0) localStorage flag'leri varsa onları da say:
      // bk-onboarding-completed / bk-onboarding-skipped — geriye dönük dokunma,
      // yeni store kendi key'inde yaşar.
    }
  )
)

// Tur açılmalı mı? (ilk render'da App.jsx kullanır)
export function shouldShowTour(state) {
  if (typeof window === 'undefined') return false
  if (state?.completed) return false
  // Eski v0 flag'i de kabul edelim — kullanıcı zaten geçtiyse tekrar açma
  try {
    if (localStorage.getItem('bk-onboarding-completed')) return false
    if (localStorage.getItem('bk-onboarding-skipped')) return false
  } catch { /* ignore */ }
  return true
}
