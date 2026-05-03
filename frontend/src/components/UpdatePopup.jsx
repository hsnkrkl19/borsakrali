import { useState, useEffect } from 'react'
import { X, Sparkles, Crown } from 'lucide-react'
import { createPortal } from 'react-dom'

const VERSION = '3.4.0'

const NEW_FEATURES = [
  { icon: '🏠', title: 'Sade Ana Sayfa',          desc: 'Kalabalık grafikler kaldırıldı, hızlı erişim kartları geldi' },
  { icon: '📈', title: 'Endeks Detay Grafikleri', desc: 'BIST 100/30\'a tıklayınca özel grafik sayfası açılır' },
  { icon: '💼', title: 'Portföyüm — YENİ',         desc: 'Hisse adet + alış fiyatı + tarihi gir, otomatik kar/zarar' },
  { icon: '🪙', title: 'Kripto Piyasası',          desc: 'Top 100 coin · fiyat alarmı · watchlist' },
  { icon: '🔔', title: 'Fiyat Alarm Sistemi',     desc: 'Belirlediğin fiyata ulaşınca anında bildirim' },
  { icon: '🎨', title: 'Premium Tasarım',         desc: 'Yeni ikon · sade arayüz · 11 sade sekme' },
]

const POPUP_KEY = 'bk-update-popup-v3.4'  // Yeni versiyon → herkes bir kez daha görsün
const MAX_SHOWS = 2
const INTERVAL_MS = 10 * 60 * 1000  // 10 dakika

export default function UpdatePopup() {
  const [visible, setVisible]     = useState(false)
  const [canClose, setCanClose]   = useState(false)
  const [countdown, setCountdown] = useState(3)

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get('playstorePreview') === '1') return
    } catch (_) {}

    try {
      const stored = JSON.parse(localStorage.getItem(POPUP_KEY) || '{}')
      const count = stored.count || 0
      const lastShown = stored.lastShown || 0

      if (count >= MAX_SHOWS) return
      const elapsed = Date.now() - lastShown
      if (count > 0 && elapsed < INTERVAL_MS) return

      const timer = setTimeout(() => {
        setVisible(true)
        localStorage.setItem(POPUP_KEY, JSON.stringify({
          count: count + 1,
          lastShown: Date.now()
        }))
      }, 1500)
      return () => clearTimeout(timer)
    } catch (_) {}
  }, [])

  useEffect(() => {
    if (!visible) return
    setCanClose(false)
    setCountdown(3)
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          setCanClose(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [visible])

  if (!visible) return null

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 backdrop-blur-md"
        style={{ background: 'rgba(0, 0, 0, 0.55)' }}
        onClick={canClose ? () => setVisible(false) : undefined}
      />

      {/* Modal — TEMA UYUMLU */}
      <div
        className="relative w-full max-w-md rounded-3xl overflow-hidden shadow-2xl border"
        style={{
          background: 'var(--bg-card)',
          borderColor: 'var(--border-gold-strong)',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        {/* Altın üst çizgi */}
        <div className="h-1.5 w-full bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500" />

        <div className="p-5 sm:p-6">
          {/* Hero — Crown + version */}
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
                  <Crown className="w-6 h-6 text-white" />
                </div>
                <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-amber-400 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[10px] font-bold uppercase tracking-[0.15em]"
                    style={{ color: 'var(--gold-400)' }}
                  >Borsa Kralı</span>
                  <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-gradient-to-r from-amber-400 to-amber-500 text-dark-950">
                    v{VERSION}
                  </span>
                </div>
                <h2
                  className="font-bold text-lg leading-tight mt-0.5"
                  style={{ color: 'var(--text-primary)' }}
                >Yenilikler Geldi! 🎉</h2>
              </div>
            </div>

            {/* Kapat */}
            <button
              onClick={() => canClose && setVisible(false)}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
                canClose ? 'cursor-pointer hover:opacity-80' : 'cursor-not-allowed opacity-60'
              }`}
              style={{
                background: 'var(--bg-elevated)',
                color: canClose ? 'var(--text-primary)' : 'var(--text-faint)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {canClose ? <X className="w-4 h-4" /> : <span className="text-xs font-bold">{countdown}</span>}
            </button>
          </div>

          {/* Alt metin */}
          <p
            className="text-sm mb-4 leading-relaxed"
            style={{ color: 'var(--text-secondary)' }}
          >
            Borsa Kralı'nı baştan tasarladık — daha hızlı, daha sade, daha güçlü.
            <span className="font-semibold" style={{ color: 'var(--gold-400)' }}> Bu sürümde 6 büyük yenilik:</span>
          </p>

          {/* Yeni Özellikler */}
          <div className="space-y-2 mb-5">
            {NEW_FEATURES.map((f, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-2.5 rounded-xl border"
                style={{
                  background: 'var(--bg-elevated)',
                  borderColor: 'var(--border-main)',
                }}
              >
                <div className="text-2xl leading-none flex-shrink-0">{f.icon}</div>
                <div className="min-w-0 flex-1">
                  <div
                    className="text-sm font-semibold leading-tight"
                    style={{ color: 'var(--text-primary)' }}
                  >{f.title}</div>
                  <div
                    className="text-[11px] mt-0.5 leading-snug"
                    style={{ color: 'var(--text-muted)' }}
                  >{f.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* CTA Buton */}
          <button
            onClick={() => canClose && setVisible(false)}
            disabled={!canClose}
            className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${
              canClose ? 'cursor-pointer hover:opacity-90 active:scale-[0.98] shadow-lg shadow-amber-500/30' : 'cursor-not-allowed opacity-60'
            }`}
            style={canClose
              ? { background: 'linear-gradient(135deg, #f59e0b, #fbbf24, #f59e0b)', color: '#0a0a0f' }
              : { background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }
            }
          >
            {canClose ? 'Harika, kullanmaya başla! 🚀' : `Birkaç saniye... (${countdown}s)`}
          </button>

          <div
            className="text-[10px] text-center mt-3"
            style={{ color: 'var(--text-faint)' }}
          >
            Borsa Kralı v{VERSION} · Premium Edition
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
