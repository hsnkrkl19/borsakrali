import { useState, useEffect } from 'react'
import { X, Sparkles, Crown, ArrowRight, Flame } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'

const VERSION = '4.3.0'
const HOLD_SECONDS = 4

const NEW_FEATURES = [
  {
    icon: '👑',
    title: 'Yeni Amblem',
    desc: 'Hanedan tarzı boğa + altın taç + yükseliş mumları — favicon, app icon, Google Play tek seferde yenilendi',
    tone: 'amber',
    hot: true,
  },
  {
    icon: '🤖',
    title: 'Trading Bot',
    desc: 'Freqtrade port edilmiş otomatik strateji motoru — backtest + canlı sınama katmanı',
    tone: 'orange',
    hot: true,
  },
  {
    icon: '💥',
    title: 'Likidasyon Haritası',
    desc: 'Coinglass benzeri likidasyon yoğunluk haritası — heatmap + uzun/kısa cluster\'lar',
    tone: 'orange',
    hot: true,
  },
  {
    icon: '🎯',
    title: 'SMC Tarayıcı',
    desc: 'Smart Money Concepts — order block, FVG, BOS/CHOCH otomatik tespiti',
    tone: 'cyan',
  },
  {
    icon: '⏱️',
    title: 'MTF + Ses Uyarısı',
    desc: '7 timeframe kripto konfluans + STRONG sinyal ping sesi + Bayesian win probability',
    tone: 'blue',
  },
  {
    icon: '🌊',
    title: 'EMA34 Wave',
    desc: 'BIST + kripto için EMA34 dalga tarayıcı — pullback ve trend dönüş yakalama',
    tone: 'green',
  },
  {
    icon: '🛢️',
    title: 'Emtia Sinyalleri',
    desc: 'Altın, gümüş, brent, doğal gaz — günlük teknik sinyaller + ekonomik takvim entegre',
    tone: 'amber',
  },
  {
    icon: '📱',
    title: 'Yeni Mobil Deneyim',
    desc: 'Bottom nav yenilendi + sayfa geçişlerinde smooth animasyon + tema değişim ripple efekti',
    tone: 'cyan',
  },
]

const POPUP_KEY = 'bk-update-popup-v4.3'
const MAX_SHOWS = 2
const INTERVAL_MS = 10 * 60 * 1000

const TONE_BORDERS = {
  amber:  'rgba(245, 158, 11, 0.40)',
  orange: 'rgba(249, 115, 22, 0.40)',
  cyan:   'rgba(6, 182, 212, 0.40)',
  blue:   'rgba(59, 130, 246, 0.40)',
  green:  'rgba(34, 197, 94, 0.40)',
}
const TONE_GLOWS = {
  amber:  'rgba(245, 158, 11, 0.10)',
  orange: 'rgba(249, 115, 22, 0.10)',
  cyan:   'rgba(6, 182, 212, 0.10)',
  blue:   'rgba(59, 130, 246, 0.10)',
  green:  'rgba(34, 197, 94, 0.10)',
}

// Confetti renkleri (rastgele dağılım)
const CONFETTI_COLORS = ['#f59e0b', '#fbbf24', '#fde68a', '#f97316', '#22c55e', '#06b6d4']

// 14 confetti dot — pozisyon + delay'i deterministik üret
const CONFETTI_DOTS = Array.from({ length: 14 }, (_, i) => ({
  left: `${(i * 7.3) % 100}%`,
  delay: `${(i * 0.13) % 1.6}s`,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  size: 4 + (i % 3) * 2,
}))

export default function UpdatePopup() {
  const navigate = useNavigate()
  const [visible, setVisible]     = useState(false)
  const [canClose, setCanClose]   = useState(false)
  const [countdown, setCountdown] = useState(HOLD_SECONDS)

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
    setCountdown(HOLD_SECONDS)
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
        className="absolute inset-0 backdrop-blur-md popup-backdrop"
        style={{ background: 'rgba(0, 0, 0, 0.62)' }}
        onClick={canClose ? () => setVisible(false) : undefined}
      />

      {/* Modal — TEMA UYUMLU + ENTRANCE + GOLD PULSE */}
      <div
        className="popup-modal relative w-full max-w-md rounded-3xl overflow-hidden border"
        style={{
          background: 'var(--bg-card)',
          borderColor: 'rgba(245, 158, 11, 0.55)',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        {/* Confetti tepe — modal içinde, banner ile aynı seviyede */}
        <div className="absolute top-0 left-0 right-0 h-12 pointer-events-none overflow-hidden">
          {CONFETTI_DOTS.map((d, i) => (
            <span
              key={i}
              className="popup-confetti-dot"
              style={{
                left: d.left,
                animationDelay: d.delay,
                background: d.color,
                width: `${d.size}px`,
                height: `${d.size}px`,
                top: `${4 + (i % 4) * 2}px`,
              }}
            />
          ))}
        </div>

        {/* Altın üst çizgi — kalınlaştırıldı */}
        <div className="h-1.5 w-full bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500" />

        <div className="p-5 sm:p-6 relative">
          {/* Hero — Crown + version */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="popup-crown w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center shadow-lg shadow-amber-500/40 origin-center ring-2 ring-amber-400/60">
                  <img
                    src="/icon-master.png?v=4.3.0"
                    alt="Borsa Kralı"
                    className="w-full h-full object-cover"
                    loading="eager"
                  />
                </div>
                <Sparkles className="popup-sparkle absolute -top-1.5 -right-1.5 w-5 h-5 text-amber-300" />
                <Sparkles className="popup-sparkle absolute -bottom-1 -left-1 w-3.5 h-3.5 text-amber-400" style={{ animationDelay: '1.2s' }} />
              </div>
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className="text-[10px] font-bold uppercase tracking-[0.18em]"
                    style={{ color: 'var(--gold-400)' }}
                  >Borsa Kralı</span>
                  <span className="popup-version px-2 py-0.5 text-[10px] font-bold rounded text-dark-950">
                    v{VERSION}
                  </span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 text-red-500 border border-red-500/40 flex items-center gap-1">
                    <Flame className="w-2.5 h-2.5" /> HOT
                  </span>
                </div>
                <h2
                  className="font-bold text-xl leading-tight mt-1"
                  style={{ color: 'var(--text-primary)' }}
                >Tahta yenilendi 👑</h2>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>
                  Yeni amblem + 7 yeni özellik tek güncellemede
                </p>
              </div>
            </div>

            {/* Kapat */}
            <button
              onClick={() => canClose && setVisible(false)}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
                canClose ? 'cursor-pointer hover:opacity-80 hover:rotate-90' : 'cursor-not-allowed opacity-60'
              }`}
              style={{
                background: 'var(--bg-elevated)',
                color: canClose ? 'var(--text-primary)' : 'var(--text-faint)',
                border: '1px solid var(--border-subtle)',
                transition: 'transform 250ms ease, opacity 200ms ease',
              }}
            >
              {canClose ? <X className="w-4 h-4" /> : <span className="text-xs font-bold">{countdown}</span>}
            </button>
          </div>

          {/* Hook metin — v4.3 launch */}
          <div
            className="text-sm mb-4 leading-relaxed p-3 rounded-xl border"
            style={{
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.10), rgba(249, 115, 22, 0.05))',
              borderColor: 'rgba(245, 158, 11, 0.30)',
              color: 'var(--text-secondary)',
            }}
          >
            Yeni hanedan amblemi · <span className="font-bold" style={{ color: 'var(--gold-400)' }}>Trading Bot</span> · <span className="font-bold" style={{ color: 'var(--gold-400)' }}>Likidasyon Haritası</span> · <span className="font-bold" style={{ color: 'var(--gold-400)' }}>SMC</span> · MTF + ses uyarısı · EMA34 Wave · Emtia · yeni mobil deneyim.
            <div className="text-[11px] mt-1.5 opacity-80">
              22 Faz kripto sistemi · 8+ yeni sayfa · sıfırdan amblem · v4.3.0 🚀
            </div>
          </div>

          {/* Yeni Özellikler — stagger animasyonlu */}
          <div className="space-y-2 mb-4">
            {NEW_FEATURES.map((f, i) => (
              <div
                key={i}
                className="popup-card flex items-start gap-3 p-2.5 rounded-xl border relative"
                style={{
                  background: 'var(--bg-elevated)',
                  borderColor: TONE_BORDERS[f.tone] || 'var(--border-main)',
                  animationDelay: `${300 + i * 90}ms`,
                  boxShadow: f.hot ? `0 0 18px ${TONE_GLOWS[f.tone]}` : 'none',
                }}
              >
                <div className="text-2xl leading-none flex-shrink-0">{f.icon}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <div
                      className="text-sm font-bold leading-tight"
                      style={{ color: 'var(--text-primary)' }}
                    >{f.title}</div>
                    {f.hot && (
                      <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-red-500/15 text-red-500 border border-red-500/40 leading-none">
                        ⚡ HOT
                      </span>
                    )}
                  </div>
                  <div
                    className="text-[11px] mt-1 leading-snug"
                    style={{ color: 'var(--text-muted)' }}
                  >{f.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* "Tüm sayfalar / site haritası" linki */}
          <button
            onClick={() => {
              if (!canClose) return
              setVisible(false)
              navigate('/site-haritasi')
            }}
            disabled={!canClose}
            className={`popup-card w-full py-2.5 mb-2 rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-1.5 border ${
              canClose ? 'cursor-pointer hover:bg-amber-500/10' : 'cursor-not-allowed opacity-60'
            }`}
            style={{
              background: 'transparent',
              borderColor: 'rgba(245, 158, 11, 0.5)',
              color: 'var(--gold-400)',
              animationDelay: '900ms',
            }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Site haritasını gör
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          {/* CTA Buton */}
          <button
            onClick={() => canClose && setVisible(false)}
            disabled={!canClose}
            className={`popup-card w-full py-3 rounded-xl font-bold text-sm transition-all ${
              canClose ? 'cursor-pointer hover:opacity-90 hover:scale-[1.01] active:scale-[0.98] shadow-lg shadow-amber-500/40' : 'cursor-not-allowed opacity-60'
            }`}
            style={canClose
              ? { background: 'linear-gradient(135deg, #f59e0b, #fbbf24, #f59e0b)', color: '#0a0a0f', animationDelay: '1000ms' }
              : { background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)', animationDelay: '1000ms' }
            }
          >
            {canClose ? 'Hemen keşfetmeye başla 🚀' : `Hazırlanıyor... (${countdown}s)`}
          </button>

          <div
            className="text-[10px] text-center mt-3"
            style={{ color: 'var(--text-faint)' }}
          >
            Borsa Kralı v{VERSION} · Premium Edition · {new Date().getFullYear()}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
