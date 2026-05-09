import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Admin tarafından gönderilen duyuruları (broadcast bildirimlerini)
 * tutar. Backend'ten ilk yüklemede çekilir, sonra socket "admin_broadcast"
 * event'leriyle canlı eklenir.
 *
 * Read state localStorage'da persiste edilir — kullanıcı bildirimi açıp
 * kapattıktan sonra rozeti tekrar görmesin.
 */
export const useAnnouncementsStore = create(
  persist(
    (set, get) => ({
      announcements: [],
      readIds: [],

      setAnnouncements: (list) => {
        set({ announcements: Array.isArray(list) ? list : [] })
      },

      pushAnnouncement: (entry) => {
        if (!entry?.id) return
        set((state) => {
          if (state.announcements.find((a) => a.id === entry.id)) return state
          return { announcements: [entry, ...state.announcements].slice(0, 50) }
        })
      },

      markRead: (id) => {
        set((state) => state.readIds.includes(id) ? state : { readIds: [...state.readIds, id].slice(-100) })
      },

      markAllRead: () => {
        const ids = get().announcements.map((a) => a.id).filter(Boolean)
        set((state) => ({ readIds: Array.from(new Set([...state.readIds, ...ids])).slice(-200) }))
      },

      getUnreadCount: () => {
        const { announcements, readIds } = get()
        const set_ = new Set(readIds)
        return announcements.filter((a) => a.id && !set_.has(a.id)).length
      },
    }),
    {
      name: 'bk-announcements-v1',
      partialize: (state) => ({ readIds: state.readIds }),
    }
  )
)
