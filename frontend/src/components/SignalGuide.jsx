import { useEffect } from 'react'
import { X, BookOpen, TrendingUp, TrendingDown, Target, Shield, Zap, Clock, AlertTriangle, Info } from 'lucide-react'
import { getStrategyMeta } from '../lib/strategyMeta'

const STRATEGIES_TO_SHOW = [
  'RSI Signal',
  'MACD Crossover',
  'EMA Crossover',
  'Bollinger Oversold',
  'Volume Spike',
  'Support Bounce',
  'RSI Overbought',
  'MACD Bearish',
]

const ACTION_STYLE = {
  AL:  { color: 'var(--jade)',  bg: 'rgba(16, 185, 129, 0.12)',  border: 'rgba(16, 185, 129, 0.30)' },
  SAT: { color: 'var(--ember)', bg: 'rgba(225, 29, 72, 0.12)',  border: 'rgba(225, 29, 72, 0.30)' },
  TUT: { color: 'var(--gold-400)', bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.30)' },
}

function ConceptCard({ icon: Icon, title, color, children }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-main)',
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${color}1f`, color, border: `1px solid ${color}40` }}
        >
          <Icon className="w-4 h-4" />
        </div>
        <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
      </div>
      <div className="text-[12.5px] leading-relaxed space-y-1.5" style={{ color: 'var(--text-secondary)' }}>
        {children}
      </div>
    </div>
  )
}

function StrategyEntry({ name }) {
  const m = getStrategyMeta(name)
  const style = ACTION_STYLE[m.action] || ACTION_STYLE.TUT
  return (
    <div
      className="rounded-xl p-3.5"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded"
              style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}
            >
              {m.action}
            </span>
            <span className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>{m.label}</span>
          </div>
          <div className="flex items-center gap-2 mt-1.5 text-[10.5px]" style={{ color: 'var(--text-faint)' }}>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Vade: {m.validity}</span>
            <span>·</span>
            <span>Periyod: {m.timeframe}</span>
            {m.rrRatio && (<><span>·</span><span>R/R: 1:{m.rrRatio}</span></>)}
          </div>
        </div>
      </div>

      <p className="text-[12.5px] mb-2" style={{ color: 'var(--text-secondary)' }}>{m.summary}</p>

      <div className="space-y-1.5 mb-2">
        <div className="flex gap-2 text-[12px]">
          <span className="font-bold flex-shrink-0" style={{ color: 'var(--jade)' }}>Giriş:</span>
          <span style={{ color: 'var(--text-secondary)' }}>{m.entryRule}</span>
        </div>
        <div className="flex gap-2 text-[12px]">
          <span className="font-bold flex-shrink-0" style={{ color: 'var(--ember)' }}>Çıkış:</span>
          <span style={{ color: 'var(--text-secondary)' }}>{m.exitRule}</span>
        </div>
      </div>

      <details className="group">
        <summary className="text-[11px] font-semibold cursor-pointer select-none flex items-center gap-1"
          style={{ color: 'var(--gold-400)' }}
        >
          <span className="group-open:rotate-90 inline-block transition-transform">▸</span>
          Detaylı açıklama & formül
        </summary>
        <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border-main)' }}>
          <p className="text-[11.5px] mb-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {m.explanation}
          </p>
          {m.formula && (
            <div
              className="rounded-md p-2 font-mono text-[11px] whitespace-pre-wrap"
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-main)',
                color: 'var(--text-secondary)',
              }}
            >
              {m.formula}
            </div>
          )}
        </div>
      </details>
    </div>
  )
}

export default function SignalGuide({ open, onClose }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sinyal Rehberi"
      className="cmdk-backdrop fixed inset-0 z-[200] flex items-start justify-center pt-[6vh] px-3 pb-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="cmdk-panel w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '88vh' }}
      >
        {/* Header */}
        <div
          className="px-4 py-3.5 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border-main)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{
                background: 'rgba(16, 185, 129, 0.15)',
                color: 'var(--gold-400)',
                border: '1px solid var(--border-gold)',
              }}
            >
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>Sinyal Rehberi</h2>
              <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Sinyalleri nasıl okurum, nasıl uygularım?</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-5">
          {/* Disclaimer */}
          <div
            className="rounded-xl p-3 flex items-start gap-2.5"
            style={{
              background: 'rgba(225, 29, 72, 0.07)',
              border: '1px solid rgba(225, 29, 72, 0.25)',
            }}
          >
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--ember)' }} />
            <div className="text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--ember)' }}>Önemli:</strong> Aşağıdaki sinyaller eğitim ve bilgilendirme amaçlıdır,
              yatırım tavsiyesi <strong>değildir</strong>. Sinyaller geçmiş veriye dayalı algoritmik tespitlerdir; gerçek
              piyasa koşulları sinyali geçersiz kılabilir. Pozisyon açmadan önce <strong>kendi analizinizi</strong> yapın
              ve <strong>risk yönetimi</strong> uygulayın.
            </div>
          </div>

          {/* Action types */}
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-faint)' }}>
              Sinyal Türleri
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <ConceptCard icon={TrendingUp} title="AL (Buy)" color="#10b981">
                <p>Algoritma <strong>alım fırsatı</strong> tespit etti. Genelde teknik göstergeler aşırı satım, momentum yukarı dönüş, destek sıçraması gibi durumlarda gelir.</p>
              </ConceptCard>
              <ConceptCard icon={TrendingDown} title="SAT (Sell)" color="#e11d48">
                <p>Algoritma <strong>satım sinyali</strong> üretti. Aşırı alım, momentum kaybı, direnç teması veya negatif kesişimde gelir. Kâr alımı veya açığa satış için.</p>
              </ConceptCard>
              <ConceptCard icon={Info} title="TUT (Hold)" color="#10b981">
                <p>Net yön yok — pozisyon koruyun, yeni işlem önerilmez. "İşlem yapmamak" da bir karardır; sinyal beklemeye geçin.</p>
              </ConceptCard>
            </div>
          </section>

          {/* Trade plan terms */}
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-faint)' }}>
              İşlem Planı Terimleri
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <ConceptCard icon={Target} title="Giriş" color="#3b82f6">
                <p>İşleme başlama fiyatı. Sinyalin tespit edildiği fiyat veya ona çok yakın bir limit emir.</p>
                <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Varsayılan: tespit fiyatı.</p>
              </ConceptCard>
              <ConceptCard icon={Shield} title="Zarar Durdur" color="#e11d48">
                <p>Fiyat çok düşerse sistem burada çıkış yapar. <strong>Sermayeni korur</strong>; sınırı sabit tut.</p>
                <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Varsayılan: girişin %3 altı.</p>
              </ConceptCard>
              <ConceptCard icon={Zap} title="Kâr Al" color="#22c55e">
                <p>Hedefe ulaşınca <strong>satış yapılır</strong>. Standart hedef: kazanç ihtimali zarardan ~2 kat fazla.</p>
                <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Varsayılan: girişin %6 üstü.</p>
              </ConceptCard>
            </div>
          </section>

          {/* When to enter / exit */}
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-faint)' }}>
              Ne Zaman Girmeli, Ne Zaman Çıkmalı?
            </h3>
            <div
              className="rounded-xl p-4 space-y-2.5 text-[12.5px] leading-relaxed"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)', color: 'var(--text-secondary)' }}
            >
              <div className="flex gap-2">
                <span className="font-bold flex-shrink-0" style={{ color: 'var(--jade)', minWidth: 100 }}>Giriş zamanı:</span>
                <span>Sinyal tespit edildiğinde + günlük mum kapanışı teyit ederse. Aceleyle girme — bir gün bekleyip teyidi gör.</span>
              </div>
              <div className="flex gap-2">
                <span className="font-bold flex-shrink-0" style={{ color: 'var(--gold-400)', minWidth: 100 }}>Vade:</span>
                <span>Her sinyalin <strong>geçerlilik süresi</strong> vardır (bkz. her stratejinin altındaki "Vade" satırı). Süre dolduktan sonra sinyal "soğur" — yeni bir sinyal beklemek gerekir.</span>
              </div>
              <div className="flex gap-2">
                <span className="font-bold flex-shrink-0" style={{ color: 'var(--ember)', minWidth: 100 }}>Çıkış 1:</span>
                <span><strong>Stop tetiklendi</strong> — zarar kabul edilir, pozisyon kapatılır. Asla SL\'i gevşetme.</span>
              </div>
              <div className="flex gap-2">
                <span className="font-bold flex-shrink-0" style={{ color: 'var(--jade)', minWidth: 100 }}>Çıkış 2:</span>
                <span><strong>TP tetiklendi</strong> — kâr alınır. Yarısını kapatıp diğer yarıya trailing stop koymak da seçenek.</span>
              </div>
              <div className="flex gap-2">
                <span className="font-bold flex-shrink-0" style={{ color: 'var(--text-muted)', minWidth: 100 }}>Çıkış 3:</span>
                <span><strong>Sinyal geçersizleşti</strong> — örn. RSI alımı için RSI hızla 50+ üstüne çıkmadıysa veya MACD tekrar negatif kesişim verirse.</span>
              </div>
            </div>
          </section>

          {/* Per-strategy explanations */}
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-faint)' }}>
              Stratejilerin Anlamı
            </h3>
            <div className="space-y-2.5">
              {STRATEGIES_TO_SHOW.map(s => <StrategyEntry key={s} name={s} />)}
            </div>
          </section>

          {/* Risk management */}
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-faint)' }}>
              Risk Yönetimi (Altın Kurallar)
            </h3>
            <div
              className="rounded-xl p-4 space-y-2 text-[12.5px] leading-relaxed"
              style={{
                background: 'rgba(16, 185, 129, 0.06)',
                border: '1px solid var(--border-gold)',
                color: 'var(--text-secondary)',
              }}
            >
              <div>• <strong>Tek işlem riski</strong>: Toplam sermayenin %1-2\'sini geçmesin.</div>
              <div>• <strong>R/R minimum 1:2</strong>: Aldığın risk kadar değil, en az iki katı kâr hedefi koy.</div>
              <div>• <strong>Stop\'u her zaman koy</strong>: Stop\'suz pozisyon = duygusal karar zinciri.</div>
              <div>• <strong>Ortalama düşürme yapma</strong>: Sinyal yanlışsa zararı kabul et, yenisini bekle.</div>
              <div>• <strong>3 ardışık zarar</strong> = bir gün ara ver. Soğukkanlı dönüş için.</div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div
          className="px-4 py-2.5 flex items-center justify-between text-[11px] flex-shrink-0"
          style={{ borderTop: '1px solid var(--border-main)', color: 'var(--text-faint)' }}
        >
          <span>Veri: Yahoo Finance · Borsa Kralı algoritması</span>
          <button
            onClick={onClose}
            className="font-semibold flex items-center gap-1.5 hover:opacity-80"
            style={{ color: 'var(--gold-400)' }}
          >
            Anladım, kapat
            <span className="kbd">esc</span>
          </button>
        </div>
      </div>
    </div>
  )
}
