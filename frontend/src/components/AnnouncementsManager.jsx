import { useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import apiClient from '../services/api'
import { useAnnouncementsStore } from '../store/announcementsStore'
import { getSocketBase } from '../config'

/**
 * Tüm uygulama için tek noktada:
 *  • Backend'ten son duyuruları yükler (mount sonrası)
 *  • Global socket bağlantısı kurar ve "admin_broadcast" event'lerini
 *    dinleyip store'a yeni duyuruları ekler.
 *  • Yeni duyuru geldiğinde küçük bir browser notification gösterir
 *    (kullanıcı izin verdiyse).
 *
 * Bu bileşen UI render etmez — yalnızca side effect içerir.
 */
export default function AnnouncementsManager() {
  const setAnnouncements = useAnnouncementsStore((s) => s.setAnnouncements)
  const pushAnnouncement = useAnnouncementsStore((s) => s.pushAnnouncement)
  const socketRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    const fetchInitial = async () => {
      try {
        const res = await apiClient.get('/notifications/announcements?limit=20')
        if (!cancelled && res.data?.success) {
          setAnnouncements(res.data.announcements || [])
        }
      } catch {
        /* sessizce yut — duyuru yokken boş liste yeterli */
      }
    }
    fetchInitial()
    return () => { cancelled = true }
  }, [setAnnouncements])

  useEffect(() => {
    socketRef.current = io(getSocketBase(), {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1500,
    })

    socketRef.current.on('admin_broadcast', (entry) => {
      if (!entry) return
      pushAnnouncement(entry)

      // Browser notification (izin varsa)
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification(entry.title || 'Yeni duyuru', {
            body: entry.body || '',
            icon: '/icon-192.png',
            tag: entry.id || `bk-${Date.now()}`,
          })
        } catch { /* permission may be revoked */ }
      }
    })

    return () => {
      socketRef.current?.disconnect()
      socketRef.current = null
    }
  }, [pushAnnouncement])

  return null
}
