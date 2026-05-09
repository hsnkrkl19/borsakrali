import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Megaphone, X } from 'lucide-react'

/**
 * Yeni bir admin duyurusu geldiğinde 6 sn süreyle ekranın üst-ortasında
 * görünen toast. AnnouncementsManager tetikler, kart kendisi auto-dismiss
 * eder ve üzerine tıklayınca path'e gider.
 *
 * Kapanma şartları (öncelikli sırasıyla):
 *   - Kullanıcı X'e tıkladıysa
 *   - Karta tıklayıp path'e gittiyse
 *   - 6 saniye doldu (auto)
 */
export default function BroadcastToast({ entry, onClose }) {
  const navigate = useNavigate()
  const [leaving, setLeaving] = useState(false)
  const closeTimerRef = useRef(null)

  useEffect(() => {
    closeTimerRef.current = setTimeout(() => {
      setLeaving(true)
      // Animasyon süresi sonunda gerçekten DOM'dan kaldır
      setTimeout(() => onClose?.(), 320)
    }, 6000)
    return () => clearTimeout(closeTimerRef.current)
  }, [onClose])

  if (!entry) return null

  const handleClose = (e) => {
    e?.stopPropagation?.()
    clearTimeout(closeTimerRef.current)
    setLeaving(true)
    setTimeout(() => onClose?.(), 320)
  }

  const handleClick = () => {
    if (entry.path) {
      if (/^https?:\/\//i.test(entry.path)) window.open(entry.path, '_blank')
      else navigate(entry.path)
    }
    handleClose()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`broadcast-toast ${leaving ? 'is-leaving' : ''}`}
      aria-label={entry.title}
    >
      <div className="broadcast-toast-icon">
        <Megaphone className="w-4 h-4" strokeWidth={2.4} />
      </div>
      <div className="broadcast-toast-body">
        <div className="broadcast-toast-title">{entry.title}</div>
        <div className="broadcast-toast-text">{entry.body}</div>
        {entry.path && (
          <div className="broadcast-toast-cta">Tıkla → {entry.path}</div>
        )}
      </div>
      <span
        role="button"
        tabIndex={0}
        onClick={handleClose}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClose(e) }}
        aria-label="Kapat"
        className="broadcast-toast-close"
      >
        <X className="w-3.5 h-3.5" />
      </span>
      <span className="broadcast-toast-progress" />
    </button>
  )
}
