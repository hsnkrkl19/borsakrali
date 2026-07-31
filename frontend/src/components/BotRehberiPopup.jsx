import { useEffect, useState, useCallback } from 'react'

/**
 * Bot Rehberi popup'ı — botların ne yaptığını sade dille anlatan sayfayı
 * site açılışında bir kez öne çıkarır. Rehber statik bir HTML (public/) olduğu
 * için iframe ile gömülür: içerik değişse bile React tarafı dokunulmaz kalır.
 *
 * Sürüm anahtarı: rehber güncellenince VERSION artırılır, popup herkese
 * bir kez daha gösterilir. "Bir daha gösterme" seçimi sürüme bağlıdır.
 */
const VERSION = '2026-07-31'
const SEEN_KEY = `bk-bot-rehberi-seen-${VERSION}`
const GUIDE_URL = '/bot-rehberi.html'

export default function BotRehberiPopup() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let seen = null
    try { seen = localStorage.getItem(SEEN_KEY) } catch { seen = null }
    if (seen === '1') return
    // Açılış yoğunluğunu bozmamak için kısa gecikme.
    const t = setTimeout(() => setOpen(true), 1200)
    return () => clearTimeout(t)
  }, [])

  const close = useCallback((remember) => {
    setOpen(false)
    if (remember) {
      try { localStorage.setItem(SEEN_KEY, '1') } catch { /* özel mod */ }
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') close(false) }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, close])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bot Rehberi"
      onClick={() => close(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(10, 16, 26, .62)',
        backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'clamp(8px, 2vw, 28px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(1100px, 100%)', height: 'min(88vh, 100%)',
          background: 'var(--card, #fff)', borderRadius: 10, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 70px rgba(0,0,0,.45)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border, #e4e7ea)',
          flex: 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
            <strong style={{ fontSize: 15 }}>Bot Rehberi</strong>
            <span style={{ fontSize: 12.5, opacity: .65, whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Botlar nasıl çalışıyor, hangisi ne yapıyor?
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, flex: 'none' }}>
            <a
              href={GUIDE_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 13, padding: '7px 12px', borderRadius: 6,
                border: '1px solid var(--border, #e4e7ea)', textDecoration: 'none',
                color: 'inherit',
              }}
            >
              Yeni sekmede aç
            </a>
            <button
              type="button"
              onClick={() => close(true)}
              style={{
                fontSize: 13, padding: '7px 14px', borderRadius: 6, cursor: 'pointer',
                border: 'none', background: 'var(--primary, #0f8a5f)', color: '#fff',
                fontWeight: 600,
              }}
            >
              Okudum, kapat
            </button>
          </div>
        </div>

        <iframe
          src={GUIDE_URL}
          title="Bot Rehberi"
          style={{ flex: 1, width: '100%', border: 'none', background: '#fff' }}
        />
      </div>
    </div>
  )
}
