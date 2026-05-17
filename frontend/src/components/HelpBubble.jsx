/**
 * Parça 4 — HelpBubble.
 *
 * Sayfa başlığının yanına yerleşen küçük "?" ikonu. Tıklanırsa veya
 * üzerine gelindiğinde tek cümlelik bir popover gösterir (maks. ~12 kelime).
 *
 * Kullanım:
 *   <h1>Fırsatlar <HelpBubble text="Sistemin bulduğu güçlü hisseleri burada görürsün." /></h1>
 *
 * `placement` öne çıkarmak için "top" | "bottom" | "right" değer alır.
 */

import { useEffect, useRef, useState } from 'react'
import { HelpCircle } from 'lucide-react'

export default function HelpBubble({ text, placement = 'bottom', className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const positionStyle = (() => {
    switch (placement) {
      case 'top':    return { bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' }
      case 'right':  return { left: 'calc(100% + 8px)', top: '50%', transform: 'translateY(-50%)' }
      case 'bottom':
      default:       return { top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' }
    }
  })()

  return (
    <span ref={ref} className={`relative inline-flex align-middle ml-1.5 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={(e) => {
          // popover'ın üstüne gidiyorsa kapatma
          const next = e.relatedTarget
          if (next && ref.current?.contains(next)) return
          setOpen(false)
        }}
        aria-label="Yardım"
        aria-expanded={open}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full transition-colors"
        style={{
          background: open ? 'rgba(212, 175, 55, 0.18)' : 'transparent',
          color: 'var(--gold-400)',
        }}
      >
        <HelpCircle className="w-4 h-4" />
      </button>

      {open && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            ...positionStyle,
            zIndex: 60,
            width: 'max-content',
            maxWidth: 260,
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-gold)',
            borderRadius: 10,
            padding: '8px 10px',
            fontSize: 12.5,
            lineHeight: 1.4,
            fontWeight: 500,
            boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
            whiteSpace: 'normal',
          }}
        >
          {text}
        </span>
      )}
    </span>
  )
}
