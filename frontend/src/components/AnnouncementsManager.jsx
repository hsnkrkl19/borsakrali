import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import apiClient from '../services/api'
import { useAnnouncementsStore, inferCategory } from '../store/announcementsStore'
import { getSocketBase } from '../config'
import { playNotificationChime } from '../utils/notificationSound'
import BroadcastToast from './BroadcastToast'

/**
 * Tüm uygulama için tek noktada:
 *  • Backend'ten son duyuruları yükler (mount sonrası)
 *  • Global socket bağlantısı kurar ve "admin_broadcast" event'lerini
 *    dinleyip store'a yeni duyuruları ekler.
 *  • Yeni duyuru geldiğinde:
 *      - Ekran üst-ortasında 6 sn'lik altın aksanlı toast
 *      - Web Audio API ile iki notalı bildirim sesi
 *      - Tarayıcı izin verdiyse native Notification
 *
 * Initial load'daki eski duyurular toast/ses tetiklemez — yalnızca
 * gerçekten socket'ten gelen yeni broadcast'lerde tetiklenir.
 */
export default function AnnouncementsManager() {
  const setAnnouncements = useAnnouncementsStore((s) => s.setAnnouncements)
  const pushAnnouncement = useAnnouncementsStore((s) => s.pushAnnouncement)
  const socketRef = useRef(null)
  const [activeToast, setActiveToast] = useState(null)
  const seenIdsRef = useRef(new Set())

  useEffect(() => {
    let cancelled = false
    const fetchInitial = async () => {
      try {
        const res = await apiClient.get('/notifications/announcements?limit=20')
        if (!cancelled && res.data?.success) {
          const list = res.data.announcements || []
          setAnnouncements(list)
          // Initial load — zaten eski duyurular, toast tetikleme. ID'lerini "görüldü" işaretle.
          for (const a of list) if (a?.id) seenIdsRef.current.add(a.id)
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

    const handleBroadcast = (entry) => {
      if (!entry) return
      // Aynı duyuruyu yeniden işleme (reconnect senaryosu vb)
      if (entry.id && seenIdsRef.current.has(entry.id)) return
      if (entry.id) seenIdsRef.current.add(entry.id)

      // Store'a her zaman ekle (kullanıcı /bildirimler sayfasında geçmişten geri açabilsin),
      // ama tercihe göre TOAST/SES tetiklemeyi atla.
      pushAnnouncement(entry)

      const category = inferCategory(entry)
      const enabled = useAnnouncementsStore.getState().isCategoryEnabled(category)
      if (!enabled) return

      // Toast — 6 sn sonra kendi kendine kapanacak. Yeni duyuru gelirse
      // eskini değiştirir (üst üste binmesin).
      setActiveToast(entry)

      // Bildirim sesi
      playNotificationChime()

      // Browser native notification (izin varsa)
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification(entry.title || 'Yeni duyuru', {
            body: entry.body || '',
            icon: '/icon-192.png',
            tag: entry.id || `bk-${Date.now()}`,
          })
        } catch { /* permission may be revoked */ }
      }
    }

    socketRef.current.on('admin_broadcast', handleBroadcast)

    // Manuel test/preview için window event hook'u — yan etkisiz, prod'da
    // da zararsız. Devtools'tan: window.dispatchEvent(new CustomEvent('bk-test-broadcast', { detail: { id: 't', title: '...', body: '...' } }))
    const onTestEvent = (e) => handleBroadcast(e?.detail)
    window.addEventListener('bk-test-broadcast', onTestEvent)

    return () => {
      socketRef.current?.disconnect()
      socketRef.current = null
      window.removeEventListener('bk-test-broadcast', onTestEvent)
    }
  }, [pushAnnouncement])

  // Toast permission'ı arka planda nazikçe iste — popup spam yok, sadece bir kez
  useEffect(() => {
    if (typeof Notification === 'undefined') return
    if (Notification.permission !== 'default') return
    const askOnce = () => {
      try { Notification.requestPermission().catch(() => {}) } catch { /* ignore */ }
      window.removeEventListener('click', askOnce)
    }
    window.addEventListener('click', askOnce, { once: true })
    return () => window.removeEventListener('click', askOnce)
  }, [])

  if (!activeToast) return null

  return (
    <BroadcastToast
      key={activeToast.id || activeToast.sentAt}
      entry={activeToast}
      onClose={() => setActiveToast(null)}
    />
  )
}
