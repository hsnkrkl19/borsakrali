/**
 * Parça 4 — Toast renderer.
 *
 * window 'bk-toast' eventlerini dinler, sağ-alt köşede stack olarak gösterir.
 * Yeşil = success, kırmızı = error, sarı = info. Otomatik 4 saniye sonra kaybolur.
 */

import { useEffect, useState, useRef } from 'react'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'
import { TOAST_EVENT } from '../utils/toast'

const VISIBLE_MS = 4000

const STYLE = {
  success: { color: 'var(--jade)',     bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.45)',  Icon: CheckCircle2 },
  error:   { color: 'var(--ember)',    bg: 'rgba(225, 29, 72, 0.12)', border: 'rgba(225, 29, 72, 0.45)',  Icon: AlertTriangle },
  info:    { color: 'var(--gold-400)', bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.45)', Icon: Info },
}

export default function ToastHost() {
  const [items, setItems] = useState([])
  const timeouts = useRef(new Map())

  useEffect(() => {
    const onToast = (e) => {
      const t = e?.detail
      if (!t || !t.message) return
      setItems((prev) => [...prev, t])
      const handle = setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== t.id))
        timeouts.current.delete(t.id)
      }, VISIBLE_MS)
      timeouts.current.set(t.id, handle)
    }
    window.addEventListener(TOAST_EVENT, onToast)
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast)
      timeouts.current.forEach((h) => clearTimeout(h))
      timeouts.current.clear()
    }
  }, [])

  const dismiss = (id) => {
    setItems((prev) => prev.filter((x) => x.id !== id))
    const h = timeouts.current.get(id)
    if (h) { clearTimeout(h); timeouts.current.delete(id) }
  }

  if (items.length === 0) return null

  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 88,
        zIndex: 80,
        display: 'flex',
        flexDirection: 'column-reverse',
        gap: 8,
        pointerEvents: 'none',
        maxWidth: 'calc(100vw - 32px)',
        width: 360,
      }}
    >
      {items.map((t) => {
        const s = STYLE[t.kind] || STYLE.info
        const { Icon } = s
        return (
          <div
            key={t.id}
            role="alert"
            style={{
              pointerEvents: 'auto',
              background: 'var(--bg-card)',
              border: `1px solid ${s.border}`,
              borderLeft: `4px solid ${s.color}`,
              borderRadius: 12,
              padding: '10px 12px',
              boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              color: 'var(--text-primary)',
              animation: 'bk-toast-in 180ms ease',
            }}
          >
            <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: s.color }} />
            <p className="flex-1 text-[13px] leading-snug">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Kapat"
              style={{ color: 'var(--text-faint)' }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
