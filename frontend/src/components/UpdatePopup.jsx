import { useState, useEffect } from 'react'
import { X, ArrowRight, Sparkles } from 'lucide-react'
import { createPortal } from 'react-dom'

const VERSION = '4.4.0'

// Kısa, etkileyici "siteyi tanıt" karşılama popup'ı. Eski uzun changelog
// (8 kart + 4sn zorunlu bekleme) yerine tek bakışta etki bırakan vitrin.
// Renkler tema token'larından gelir → açık temada emerald, koyu temada altın.
const STATS = [
  { icon: '📈', value: '510+', label: 'Canlı BIST hissesi' },
  { icon: '₿',  value: '100+', label: 'Kripto · 7 zaman dilimi' },
  { icon: '🤖', value: '3',    label: 'Otomatik trading botu' },
  { icon: '🧠', value: 'AI',   label: '14 göstergeli hisse skoru' },
]

const POPUP_KEY = 'bk-welcome-popup-v4.4'
const MAX_SHOWS = 2
const INTERVAL_MS = 10 * 60 * 1000

export default function UpdatePopup() {
  const [visible, setVisible] = useState(false)

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
      if (count > 0 && Date.now() - lastShown < INTERVAL_MS) return

      const timer = setTimeout(() => {
        setVisible(true)
        localStorage.setItem(POPUP_KEY, JSON.stringify({
          count: count + 1,
          lastShown: Date.now(),
        }))
      }, 1200)
      return () => clearTimeout(timer)
    } catch (_) {}
  }, [])

  if (!visible) return null

  const close = () => setVisible(false)

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 backdrop-blur-md popup-backdrop"
        style={{ background: 'rgba(2, 6, 23, 0.55)' }}
        onClick={close}
      />

      {/* Modal — kompakt, tema uyumlu, premium */}
      <div
        className="popup-modal relative w-full max-w-sm rounded-3xl overflow-hidden border text-center"
        style={{
          background: 'var(--bg-card)',
          borderColor: 'var(--border-gold-strong)',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        {/* Üstte yumuşak emerald/altın aydınlatma */}
        <div
          className="absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-44 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.30), transparent 70%)', filter: 'blur(10px)' }}
          aria-hidden="true"
        />
        {/* Marka şeridi */}
        <div className="h-1.5 w-full" style={{ background: 'var(--grad-gold-rich)' }} />

        {/* Kapat — her zaman erişilebilir (zorunlu bekleme YOK) */}
        <button
          onClick={close}
          aria-label="Kapat"
          className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:rotate-90 z-10"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}
        >
          <X className="w-4 h-4" />
        </button>

        <div className="px-6 pt-6 pb-7 sm:px-7 relative">
          {/* Logo + parıltı */}
          <div className="relative inline-flex mb-4">
            <div
              className="popup-crown w-20 h-20 rounded-2xl overflow-hidden flex items-center justify-center"
              style={{ boxShadow: 'var(--glow-gold)' }}
            >
              <img
                src="/icon-master.png?v=4.4.0"
                alt="Borsa Kralı"
                className="w-full h-full object-cover"
                loading="eager"
              />
            </div>
            <Sparkles className="popup-sparkle absolute -top-1.5 -right-1.5 w-5 h-5" style={{ color: 'var(--gold-400)' }} />
          </div>

          {/* Marka + sürüm */}
          <div className="flex items-center justify-center gap-2 mb-2">
            <span
              className="text-[11px] font-bold uppercase tracking-[0.2em]"
              style={{ color: 'var(--gold-500)' }}
            >Borsa Kralı</span>
            <span className="popup-version px-2 py-0.5 text-[10px] font-bold rounded" style={{ color: '#fff' }}>
              v{VERSION}
            </span>
          </div>

          {/* Çarpıcı başlık */}
          <h2 className="font-black text-2xl leading-tight mb-2" style={{ color: 'var(--text-primary)' }}>
            Tahtın seni bekliyor 👑
          </h2>
          <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--text-secondary)' }}>
            BIST ve kriptonun tek komuta merkezi. Canlı veri,{' '}
            <b style={{ color: 'var(--gold-500)' }}>AI sinyaller</b> ve otomatik botlarla
            profesyonel analiz artık avucunun içinde.
          </p>

          {/* Etkileyici sayılar — 2x2 kompakt vitrin */}
          <div className="grid grid-cols-2 gap-2 mb-6">
            {STATS.map((s, i) => (
              <div
                key={i}
                className="popup-card flex items-center gap-2.5 p-2.5 rounded-xl border text-left"
                style={{
                  background: 'var(--bg-elevated)',
                  borderColor: 'var(--border-gold)',
                  animationDelay: `${200 + i * 80}ms`,
                }}
              >
                <span className="text-xl leading-none flex-shrink-0">{s.icon}</span>
                <div className="min-w-0">
                  <div className="text-sm font-extrabold leading-none" style={{ color: 'var(--gold-500)' }}>{s.value}</div>
                  <div className="text-[10px] leading-tight mt-1" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Tek net CTA */}
          <button
            onClick={close}
            className="w-full py-3 rounded-xl font-bold text-sm transition-transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
            style={{ background: 'var(--grad-gold-rich)', color: '#fff', boxShadow: 'var(--glow-gold)' }}
          >
            Keşfetmeye başla
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
