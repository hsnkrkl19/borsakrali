import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Bildirim kategorileri — broadcast.category alanından gelir.
 * Backend payload'a category göndermezse frontend infer eder (inferCategory).
 */
export const NOTIF_CATEGORIES = {
  crypto:   { id: 'crypto',   label: 'Kripto Sinyalleri',   icon: '🪙', color: '#f7931a' },
  market:   { id: 'market',   label: 'Borsa Açılış/Kapanış', icon: '📈', color: '#10b981' },
  calendar: { id: 'calendar', label: 'Ekonomik Takvim',     icon: '⚠️', color: '#f59e0b' },
  signal:   { id: 'signal',   label: 'Hisse Sinyalleri',    icon: '📊', color: '#d4af37' },
  performance: { id: 'performance', label: 'Performans Raporu', icon: '🏆', color: '#a78bfa' },
  general:  { id: 'general',  label: 'Genel Duyuru',        icon: '📢', color: '#94a3b8' },
}

const CATEGORY_IDS = Object.keys(NOTIF_CATEGORIES)

/**
 * Backend category göndermediyse içerikten infer et.
 * Heuristic — başlık/yol/içerik anahtar kelimelerine göre.
 */
export function inferCategory(entry) {
  if (entry?.category && NOTIF_CATEGORIES[entry.category]) return entry.category
  const txt = `${entry?.title || ''} ${entry?.body || ''} ${entry?.path || ''}`.toLowerCase()
  if (/krypto|kripto|crypto|btc|eth|long.*short|futures|spot/.test(txt)) return 'crypto'
  if (/borsa açıl|borsa kapan|seans baş|seans bit|market open|market close/.test(txt)) return 'market'
  if (/ekonomik takvim|kritik veri|nfp|fomc|cpi|tcmb|enflasyon|faiz/.test(txt)) return 'calendar'
  if (/performans|gün sonu|10k girseydin|backtest sonuç/.test(txt)) return 'performance'
  if (/sinyal|signal|alış|satış|trend takip|reversion|açılış sinyalleri/.test(txt)) return 'signal'
  return 'general'
}

/**
 * Admin tarafından gönderilen duyuruları (broadcast bildirimlerini)
 * tutar. Backend'ten ilk yüklemede çekilir, sonra socket "admin_broadcast"
 * event'leriyle canlı eklenir.
 *
 * Read state ve kategori tercihleri localStorage'da persist edilir.
 */
export const useAnnouncementsStore = create(
  persist(
    (set, get) => ({
      announcements: [],
      readIds: [],
      hiddenIds: [],
      // Kategori muteleme — true = bildir, false = sustur (toast/ses atılmaz, listede gizlenir)
      preferences: CATEGORY_IDS.reduce((acc, id) => ({ ...acc, [id]: true }), {}),

      setAnnouncements: (list) => {
        set({ announcements: Array.isArray(list) ? list : [] })
      },

      pushAnnouncement: (entry) => {
        if (!entry?.id) return
        set((state) => {
          if (state.announcements.find((a) => a.id === entry.id)) return state
          return { announcements: [entry, ...state.announcements].slice(0, 200) }
        })
      },

      markRead: (id) => {
        set((state) => state.readIds.includes(id) ? state : { readIds: [...state.readIds, id].slice(-500) })
      },

      markUnread: (id) => {
        set((state) => ({ readIds: state.readIds.filter((rid) => rid !== id) }))
      },

      markAllRead: () => {
        const ids = get().announcements.map((a) => a.id).filter(Boolean)
        set((state) => ({ readIds: Array.from(new Set([...state.readIds, ...ids])).slice(-1000) }))
      },

      hideAnnouncement: (id) => {
        set((state) => state.hiddenIds.includes(id) ? state : { hiddenIds: [...state.hiddenIds, id].slice(-500) })
      },

      restoreAll: () => set({ hiddenIds: [] }),

      setPreference: (categoryId, enabled) => {
        set((state) => ({ preferences: { ...state.preferences, [categoryId]: !!enabled } }))
      },

      isCategoryEnabled: (categoryId) => {
        const prefs = get().preferences || {}
        return prefs[categoryId] !== false
      },

      getUnreadCount: () => {
        const { announcements, readIds, hiddenIds, preferences } = get()
        const readSet = new Set(readIds)
        const hiddenSet = new Set(hiddenIds)
        return announcements.filter((a) => {
          if (!a.id) return false
          if (readSet.has(a.id)) return false
          if (hiddenSet.has(a.id)) return false
          const cat = inferCategory(a)
          if (preferences && preferences[cat] === false) return false
          return true
        }).length
      },

      getVisibleAnnouncements: () => {
        const { announcements, hiddenIds, preferences } = get()
        const hiddenSet = new Set(hiddenIds)
        return announcements.filter((a) => {
          if (a.id && hiddenSet.has(a.id)) return false
          const cat = inferCategory(a)
          if (preferences && preferences[cat] === false) return false
          return true
        })
      },
    }),
    {
      name: 'bk-announcements-v1',
      partialize: (state) => ({
        readIds: state.readIds,
        hiddenIds: state.hiddenIds,
        preferences: state.preferences,
      }),
      version: 2,
      migrate: (persisted, version) => {
        if (!persisted) return persisted
        if (version < 2) {
          persisted.hiddenIds = persisted.hiddenIds || []
          persisted.preferences = persisted.preferences || CATEGORY_IDS.reduce((acc, id) => ({ ...acc, [id]: true }), {})
        }
        return persisted
      },
    }
  )
)
