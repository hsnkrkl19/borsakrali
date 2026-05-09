import { useState, useRef, useEffect, useCallback } from 'react'
import { Megaphone } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import QuickBroadcastModal from './QuickBroadcastModal'

const ADMIN_EMAILS = ['hsnkrkl19@gmail.com']
const STORAGE_KEY = 'bk-admin-fab-pos'
const DRAG_THRESHOLD = 6 // px — bu mesafenin altındaki hareket "tıklama" sayılır

/**
 * Admin için kayan bildirim butonu — sürüklenebilir.
 *
 * - Default sol-alt köşede; kullanıcı sürükleyip istediği yere taşıyabilir.
 * - Pozisyon localStorage'a kaydedilir, ekran tekrar açıldığında orada durur.
 * - Drag eşiği DRAG_THRESHOLD: ufak fare oynamaları "tıklama" olarak yorumlanır.
 * - Touch + mouse + pointer event'leri destekler (mobil + web).
 */
export default function AdminBroadcastFAB() {
  const user = useAuthStore((s) => s.user)
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const [pos, setPos] = useState(null) // { x, y } veya null = default
  const [dragging, setDragging] = useState(false)
  const dragState = useRef(null) // { startX, startY, startPosX, startPosY, moved }

  const isAdmin = user?.role === 'admin'
    || (user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase()))

  // İlk yüklemede kaydedilmiş pozisyonu oku
  useEffect(() => {
    if (!isAdmin || typeof window === 'undefined') return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
          setPos(parsed)
        }
      }
    } catch { /* ignore */ }
  }, [isAdmin])

  // Pozisyonu ekran içinde tut + ortada kalmışsa kenara snap.
  // (Eski sürümde drag bittiğinde snap yoktu, kullanıcılar ortada bırakmış
  // olabilir; init'te otomatik en yakın kenara çekiyoruz.)
  useEffect(() => {
    if (!pos || typeof window === 'undefined') return
    const w = window.innerWidth, h = window.innerHeight
    const btnW = btnRef.current?.getBoundingClientRect().width || 160
    const btnH = btnRef.current?.getBoundingClientRect().height || 44
    const margin = 12
    const centerX = pos.x + btnW / 2
    const snappedX = centerX < w / 2 ? margin : (w - btnW - margin)
    const clampedY = Math.max(margin, Math.min(pos.y, h - btnH - margin))
    if (snappedX !== pos.x || clampedY !== pos.y) {
      setPos({ x: snappedX, y: clampedY })
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ x: snappedX, y: clampedY })) } catch { /* ignore */ }
    }
  }, [pos])

  const onPointerDown = useCallback((e) => {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: rect.left,
      startPosY: rect.top,
      moved: false,
    }
    btnRef.current.setPointerCapture?.(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e) => {
    const ds = dragState.current
    if (!ds) return
    const dx = e.clientX - ds.startX
    const dy = e.clientY - ds.startY
    if (!ds.moved && Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
      ds.moved = true
      setDragging(true)
    }
    if (ds.moved) {
      const newX = ds.startPosX + dx
      const newY = ds.startPosY + dy
      setPos({ x: newX, y: newY })
    }
  }, [])

  const onPointerUp = useCallback(() => {
    const ds = dragState.current
    if (!ds) return
    const wasMoved = ds.moved
    dragState.current = null
    setDragging(false)
    if (wasMoved) {
      // Sürükleme bitti — buton ekranın hangi yarısında? Yakın kenara snap.
      // (Y ekseni serbest, kullanıcı yüksekliği seçer; X ekseni kenara yapışır.)
      setPos((p) => {
        if (!p || typeof window === 'undefined') return p
        const btnW = btnRef.current?.getBoundingClientRect().width || 160
        const btnH = btnRef.current?.getBoundingClientRect().height || 44
        const w = window.innerWidth, h = window.innerHeight
        const centerX = p.x + btnW / 2
        const margin = 12
        const snappedX = centerX < w / 2 ? margin : (w - btnW - margin)
        const clampedY = Math.max(margin, Math.min(p.y, h - btnH - margin))
        const snapped = { x: snappedX, y: clampedY }
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapped)) } catch { /* ignore */ }
        return snapped
      })
    } else {
      // Sadece tıklama (sürükleme değil) → modal aç
      setOpen(true)
    }
  }, [])

  if (!isAdmin) return null

  // Pozisyon stilleri: kullanıcı sürüklediyse left/top, değilse default sağ-alt
  // (sol-alt'ı yenilik ikonu için boş bırakıyoruz; sağ-üst theme/cmdk için meşgul)
  const positionStyle = pos
    ? { left: pos.x, top: pos.y, bottom: 'auto', right: 'auto' }
    : { right: 16, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 110px)', top: 'auto', left: 'auto' }
  // bottom 110px: mobil nav bar (~70px) + safe area + biraz boşluk

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        title="Bildirim Gönder (Admin) — sürükleyerek taşı"
        aria-label="Bildirim Gönder"
        className="fixed z-[60] flex items-center gap-2 px-3 py-2 rounded-full select-none transition-shadow"
        style={{
          ...positionStyle,
          background: 'linear-gradient(135deg, var(--gold-300), var(--gold-500))',
          color: '#1a1208',
          border: '1px solid rgba(255, 255, 255, 0.25)',
          boxShadow: dragging
            ? '0 14px 36px rgba(212, 175, 55, 0.55), inset 0 1px 0 rgba(255,255,255,0.45)'
            : '0 8px 24px rgba(212, 175, 55, 0.40), inset 0 1px 0 rgba(255,255,255,0.45)',
          touchAction: 'none', // mobile scroll yerine drag
          cursor: dragging ? 'grabbing' : 'grab',
          transform: dragging ? 'scale(1.04)' : 'scale(1)',
          transition: 'transform 0.15s, box-shadow 0.15s',
        }}
      >
        <Megaphone className="w-4 h-4" strokeWidth={2.4} />
        <span className="text-[12px] font-bold uppercase tracking-wider hidden sm:inline">Bildirim Gönder</span>
      </button>

      <QuickBroadcastModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
