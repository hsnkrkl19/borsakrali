/**
 * MTF Coin Detay Modal — Borsa Krali
 *
 * Tek bir coin için 7 timeframe full detay görünümü:
 *   - Confluence verdict + breakdown (TF mini grid)
 *   - Her TF için long + short skor + R/R seviyeleri
 *   - Win probability (Bayesian) her TF + her yön için
 *   - Pattern + divergence + volatility (AI katmanı)
 *   - 24h fiyat hareketi · market cap rank
 *   - Binance trade quick-link
 *
 * Trigger: SignalCard ya da ConfluenceRow'dan "Detay" butonu.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  X, Coins, TrendingUp, TrendingDown, Minus, Target, Shield, Sparkles,
  Activity, Layers, ExternalLink, RefreshCw, AlertTriangle, CheckCircle2,
  BarChart3, Zap, Clock, Wallet, LineChart,
} from 'lucide-react'
import api from '../services/api'
import MTFCoinChart from './MTFCoinChart'

const TF_LIST = [
  { key: '1m',  label: '1 dk' },
  { key: '5m',  label: '5 dk' },
  { key: '15m', label: '15 dk' },
  { key: '1h',  label: '1 saat' },
  { key: '4h',  label: '4 saat' },
  { key: '1d',  label: 'Günlük' },
  { key: '1w',  label: 'Haftalık' },
]

const VERDICT_STYLES = {
  STRONG_LONG:  { label: '⇈ GÜÇLÜ AL',     color: 'text-emerald-300', bg: 'bg-emerald-500/15', border: 'border-emerald-500/40' },
  LONG:         { label: '↑ AL',           color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  WEAK_LONG:    { label: '↗ Zayıf AL',     color: 'text-emerald-200', bg: 'bg-emerald-500/5',  border: 'border-emerald-500/20' },
  NEUTRAL:      { label: '— BEKLE',        color: 'text-gray-400',    bg: 'bg-gray-500/10',    border: 'border-gray-500/30' },
  WEAK_SHORT:   { label: '↘ Zayıf SAT',    color: 'text-rose-200',    bg: 'bg-rose-500/5',     border: 'border-rose-500/20' },
  SHORT:        { label: '↓ SAT',          color: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30' },
  STRONG_SHORT: { label: '⇊ GÜÇLÜ SAT',    color: 'text-rose-300',    bg: 'bg-rose-500/15',    border: 'border-rose-500/40' },
}

function formatUsd(v) {
  if (v == null) return '—'
  const n = Number(v)
  if (!isFinite(n)) return '—'
  if (n >= 1000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
  if (n >= 10) return `$${n.toFixed(3)}`
  if (n >= 1) return `$${n.toFixed(4)}`
  if (n >= 0.01) return `$${n.toFixed(5)}`
  return `$${n.toFixed(8)}`
}

// Parça 2: TF grupları — uzun / orta / kısa vade. SimpleView bu 3 grubun
// ✓/✗ özetini gösterir. Detay modunda eski 4-tab × 7-TF görünümü açılır.
const TF_GROUPS = [
  { id: 'long',  label: 'Uzun vade',  tfs: ['1w', '1d'] },
  { id: 'mid',   label: 'Orta vade',  tfs: ['4h', '1h'] },
  { id: 'short', label: 'Kısa vade',  tfs: ['15m', '5m', '1m'] },
]

// confluence.tfDirections içinden grup yönünü çıkar.
// majority long ⇒ ✓ AL, majority short ⇒ ✗ SAT, dengeli ⇒ – BEKLE
function groupDirection(tfDirections = {}, tfs = []) {
  let long = 0, short = 0
  for (const tf of tfs) {
    const d = tfDirections[tf]
    if (d === 'long') long++
    else if (d === 'short') short++
  }
  if (long > short && long >= 1) return 'long'
  if (short > long && short >= 1) return 'short'
  return 'neutral'
}

const GROUP_SENTENCES = {
  long:  { sentence: 'aynı yönde güçlü.', icon: '✓', color: 'var(--jade)' },
  short: { sentence: 'aksi yönde — dikkat.', icon: '✗', color: 'var(--ember)' },
  neutral: { sentence: 'net yön yok.', icon: '–', color: 'var(--text-faint)' },
}

export default function MTFCoinDetailModal({ symbol, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('simple')      // 'simple' | 'detailed' (Parça 2)
  const [activeTab, setActiveTab] = useState('chart') // detaylı modda kullanılır

  useEffect(() => {
    if (!symbol) return
    let active = true
    setLoading(true)
    api.get(`/market/crypto/mtf/coin/${symbol}`)
      .then(r => { if (active) setData(r.data) })
      .catch(e => { if (active) setData({ error: e.response?.data?.error || e.message }) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [symbol])

  // ESC ile kapat
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!symbol) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="card w-full max-w-4xl my-4 sm:my-0 max-h-[95vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <ModalHeader data={data} loading={loading} symbol={symbol} onClose={onClose} />

        {loading ? (
          <div className="p-8 text-center">
            <RefreshCw className="w-6 h-6 text-gold-400 animate-spin mx-auto mb-2" />
            <p className="text-sm text-gray-400">Tüm timeframe'ler analiz ediliyor...</p>
          </div>
        ) : data?.error ? (
          <div className="p-6 text-center">
            <AlertTriangle className="w-6 h-6 text-red-400 mx-auto mb-2" />
            <p className="text-sm text-red-300">{data.error}</p>
          </div>
        ) : (
          <>
            {/* Basit / Detaylı toggle (Parça 2) */}
            <div className="flex items-center gap-1 px-3 pt-3">
              <ModeBtn active={mode === 'simple'}   onClick={() => setMode('simple')}>Basit</ModeBtn>
              <ModeBtn active={mode === 'detailed'} onClick={() => setMode('detailed')}>Detaylı</ModeBtn>
            </div>

            {mode === 'simple' ? (
              <SimpleView confluence={data.confluence} symbol={symbol} onClose={onClose} />
            ) : (
              <>
                {/* Confluence top panel */}
                <ConfluencePanel confluence={data.confluence} />

                {/* Tab selector */}
                <div className="flex gap-1 px-3 pt-3 border-b border-dark-700 overflow-x-auto scrollbar-thin">
                  <TabBtn active={activeTab === 'chart'} onClick={() => setActiveTab('chart')} icon={LineChart}>Grafik</TabBtn>
                  <TabBtn active={activeTab === 'signals'} onClick={() => setActiveTab('signals')} icon={Layers}>Sinyaller</TabBtn>
                  <TabBtn active={activeTab === 'indicators'} onClick={() => setActiveTab('indicators')} icon={BarChart3}>İndikatörler</TabBtn>
                  <TabBtn active={activeTab === 'ai'} onClick={() => setActiveTab('ai')} icon={Activity}>AI / Math</TabBtn>
                </div>

                {/* Tab content */}
                <div className="p-3">
                  {activeTab === 'chart'      && <ChartTab      timeframes={data.timeframes} symbol={symbol} />}
                  {activeTab === 'signals'    && <SignalsTab    timeframes={data.timeframes} symbol={symbol} />}
                  {activeTab === 'indicators' && <IndicatorsTab timeframes={data.timeframes} />}
                  {activeTab === 'ai'         && <AITab         timeframes={data.timeframes} />}
                </div>
              </>
            )}

            {/* Footer */}
            <div className="px-3 pb-3 pt-2 border-t border-dark-700/50 flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[10px] text-gray-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {data.generatedAt ? new Date(data.generatedAt).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—'}
              </span>
              <a
                href={`https://www.binance.com/en/trade/${symbol}_USDT`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] text-gold-400 hover:text-gold-300"
              >
                <ExternalLink className="w-3 h-3" />
                Binance'te {symbol}/USDT
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ModalHeader({ data, loading, symbol, onClose }) {
  return (
    <div className="flex items-center gap-3 p-3 border-b border-dark-700">
      {data?.image ? (
        <img src={data.image} alt={symbol} className="w-10 h-10 rounded-full"
          onError={(e) => { e.currentTarget.style.display = 'none' }} />
      ) : (
        <div className="w-10 h-10 rounded-full bg-dark-700 flex items-center justify-center">
          <Coins className="w-5 h-5 text-gold-400" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-white">{symbol}</h2>
          {data?.name && data.name !== symbol && (
            <span className="text-xs text-gray-500 truncate">{data.name}</span>
          )}
        </div>
        <p className="text-[10px] text-gray-500 mt-0.5">7 timeframe Bayesian-kalibre detay</p>
      </div>
      <button
        onClick={onClose}
        className="p-1.5 rounded-lg hover:bg-dark-700 text-gray-400 hover:text-white"
        aria-label="Kapat"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

function ConfluencePanel({ confluence }) {
  if (!confluence) return null
  const verdict = VERDICT_STYLES[confluence.verdict] || VERDICT_STYLES.NEUTRAL

  return (
    <div className="p-3 bg-dark-800/40 border-b border-dark-700">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-gray-500">Confluence</span>
          <span className={`text-xs px-2 py-0.5 rounded-full border font-bold ${verdict.bg} ${verdict.border} ${verdict.color}`}>
            {verdict.label}
          </span>
          <span className="text-[11px] text-gray-400">
            net: <span className="text-white font-mono font-bold">{confluence.net > 0 ? '+' : ''}{confluence.net?.toFixed(1)}</span>
            <span className="mx-1.5 text-gray-600">·</span>
            güven: <span className="text-gold-400 font-mono font-bold">%{((confluence.confidence || 0) * 100).toFixed(0)}</span>
          </span>
        </div>
        <span className="text-[10px] text-gray-400">
          <span className="text-emerald-400 font-mono">{confluence.alignedLong}L</span>
          <span className="mx-1 text-gray-600">/</span>
          <span className="text-rose-400 font-mono">{confluence.alignedShort}S</span>
          <span className="text-gray-500"> hizalı</span>
        </span>
      </div>

      {/* TF mini grid */}
      <div className="flex items-center gap-1 mt-2 flex-wrap">
        {TF_LIST.map(tf => {
          const dir = confluence.tfDirections?.[tf.key]
          const cls = dir === 'long'    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : dir === 'short'   ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                    : dir === 'no_data' ? 'bg-gray-700/30 text-gray-600 border-gray-700/40'
                    : 'bg-gray-500/10 text-gray-400 border-gray-500/20'
          const icon = dir === 'long'  ? <TrendingUp className="w-2.5 h-2.5" />
                     : dir === 'short' ? <TrendingDown className="w-2.5 h-2.5" />
                     : <Minus className="w-2.5 h-2.5" />
          return (
            <span key={tf.key} className={`text-[10px] px-2 py-0.5 rounded border inline-flex items-center gap-1 ${cls}`}
              title={`${tf.label}: ${dir || 'no_data'}`}>
              {icon} {tf.key}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function ModeBtn({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-colors"
      style={{
        background: active ? 'rgba(212, 175, 55, 0.15)' : 'transparent',
        color: active ? 'var(--gold-400)' : 'var(--text-faint)',
        border: `1px solid ${active ? 'var(--border-gold)' : 'transparent'}`,
      }}
    >
      {children}
    </button>
  )
}

// Parça 2 — Basit Mod görünümü
// Büyük etiket + 3 vade satırı + 2 CTA. Hiç ham sayı yok.
function SimpleView({ confluence, symbol, onClose }) {
  if (!confluence) {
    return (
      <div className="p-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
        Henüz yeterli veri yok. Birkaç dakika sonra tekrar bak.
      </div>
    )
  }
  const verdict = VERDICT_STYLES[confluence.verdict] || VERDICT_STYLES.NEUTRAL
  const directions = confluence.tfDirections || {}

  // Üst başlık cümlesi
  const headline = (() => {
    const groups = TF_GROUPS.map(g => ({ ...g, dir: groupDirection(directions, g.tfs) }))
    const longCount = groups.filter(g => g.dir === 'long').length
    const shortCount = groups.filter(g => g.dir === 'short').length
    if (longCount === 3) return 'Hem kısa, hem uzun vade aynı yönde — güçlü AL.'
    if (shortCount === 3) return 'Hem kısa, hem uzun vade aynı yönde — sert düşüş.'
    if (longCount >= 2) return 'Birden fazla vade aynı yönde — yükseliş.'
    if (shortCount >= 2) return 'Birden fazla vade aksi yönde — dikkat.'
    return 'Vadeler arasında uyum yok, beklemede kal.'
  })()

  return (
    <div className="p-4 sm:p-5 space-y-4">
      {/* Büyük etiket */}
      <div
        className="rounded-2xl border p-4 sm:p-5 text-center"
        style={{
          background: 'var(--bg-card)',
          borderColor: 'var(--border-main)',
        }}
      >
        <span
          className={`inline-block text-2xl sm:text-3xl font-extrabold tracking-tight ${verdict.color}`}
        >
          {verdict.label}
        </span>
        <p
          className="text-sm sm:text-base mt-2"
          style={{ color: 'var(--text-secondary)' }}
        >
          {headline}
        </p>
      </div>

      {/* 3 vade satırı */}
      <div className="space-y-2">
        {TF_GROUPS.map(g => {
          const dir = groupDirection(directions, g.tfs)
          const meta = GROUP_SENTENCES[dir]
          return (
            <div
              key={g.id}
              className="flex items-center gap-3 rounded-xl border p-3"
              style={{
                background: 'var(--bg-card)',
                borderColor: 'var(--border-main)',
              }}
            >
              <span
                className="text-xl font-bold w-6 text-center flex-shrink-0"
                style={{ color: meta.color }}
              >
                {meta.icon}
              </span>
              <div className="flex-1 min-w-0">
                <p
                  className="text-[13px] sm:text-sm font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {g.label}
                </p>
                <p
                  className="text-[12px]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {meta.sentence}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* CTA */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
        <button
          type="button"
          onClick={() => { onClose?.(); window.location.href = '/botlar' }}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"
          style={{
            background: 'rgba(212, 175, 55, 0.15)',
            color: 'var(--gold-400)',
            border: '1px solid var(--border-gold)',
          }}
        >
          Bot ile takip et
        </button>
        <button
          type="button"
          onClick={() => { onClose?.(); window.location.href = `/hesabim?tab=takip&add=${encodeURIComponent(symbol)}` }}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"
          style={{
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-main)',
          }}
        >
          Takip listeme ekle
        </button>
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, icon: Icon, children }) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] px-3 py-1.5 rounded-t-lg flex items-center gap-1.5 transition-colors ${
        active ? 'bg-dark-700 text-white border-x border-t border-dark-600' : 'text-gray-400 hover:text-white'
      }`}
    >
      <Icon className="w-3 h-3" />
      {children}
    </button>
  )
}

function ChartTab({ timeframes, symbol }) {
  // En güçlü sinyali bul — score'a göre — default chart için onu kullan
  const bestSignal = useMemo(() => {
    if (!timeframes) return null
    let best = null
    for (const tf of ['1h', '4h', '1d', '1w', '15m', '5m', '1m']) {
      const data = timeframes[tf]
      if (!data) continue
      const candidates = [
        data.long  ? { ...data.long,  tf, dir: 'long'  } : null,
        data.short ? { ...data.short, tf, dir: 'short' } : null,
      ].filter(Boolean)
      for (const c of candidates) {
        if (!best || (c.totalScore || 0) > (best.totalScore || 0)) best = c
      }
    }
    return best
  }, [timeframes])

  const defaultTF = bestSignal?.tf || '4h'
  const levels = bestSignal
    ? { entry: bestSignal.entry, stop: bestSignal.stop, target1: bestSignal.target1, target2: bestSignal.target2 }
    : {}
  const direction = bestSignal?.dir || 'long'

  return (
    <div className="space-y-2">
      {bestSignal ? (
        <div className="flex items-center gap-2 flex-wrap text-[10px]">
          <span className="text-gray-500 uppercase">En güçlü sinyal:</span>
          <span className={`px-2 py-0.5 rounded-full border font-bold ${
            direction === 'long'
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
              : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
          }`}>
            {bestSignal.tf} · {direction === 'long' ? '↑ LONG' : '↓ SHORT'} · {bestSignal.totalScore}/{bestSignal.applicableMax} {bestSignal.grade}
          </span>
          {bestSignal.winProbability && (
            <span className="px-2 py-0.5 rounded-full bg-gold-400/15 text-gold-400 border border-gold-400/30">
              %{(bestSignal.winProbability.probability * 100).toFixed(0)} kazanma
            </span>
          )}
        </div>
      ) : (
        <div className="text-[10px] text-gray-500 italic">Sinyal yok — sadece chart</div>
      )}
      <MTFCoinChart
        symbol={symbol}
        timeframe={defaultTF}
        levels={levels}
        direction={direction}
        height={380}
      />
      <p className="text-[10px] text-gray-500 leading-relaxed">
        Veri kaynağı: Binance public API · TF seçici sağ üstte · Sinyal seviyeleri (Giriş/Stop/T1/T2)
        en güçlü TF'den çizilir, TF değiştirince aynı seviyeler kalır.
      </p>
    </div>
  )
}

function SignalsTab({ timeframes, symbol }) {
  return (
    <div className="space-y-2">
      {TF_LIST.map(tf => {
        const data = timeframes?.[tf.key]
        const long  = data?.long
        const short = data?.short

        if (!data && !long && !short) {
          return (
            <div key={tf.key} className="p-2 rounded-lg bg-dark-800 border border-dark-700 opacity-50">
              <div className="text-[11px] font-mono font-semibold text-gray-500">
                {tf.label} — veri yok
              </div>
            </div>
          )
        }

        // Signal payload'una symbol enjekte et — paper-trading API symbol gerektiriyor
        const longWithSym  = long  ? { ...long,  symbol } : null
        const shortWithSym = short ? { ...short, symbol } : null

        return (
          <div key={tf.key} className="p-2.5 rounded-lg bg-dark-800/40 border border-dark-700">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-mono font-semibold text-white px-2 py-0.5 rounded bg-dark-700">{tf.label}</span>
              <span className="text-[9px] text-gray-500 uppercase">→ üst TF: {data?.higherTimeframe || '—'}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <DirectionPanel direction="long"  signal={longWithSym}  />
              <DirectionPanel direction="short" signal={shortWithSym} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DirectionPanel({ direction, signal }) {
  const [paperState, setPaperState] = useState('idle') // 'idle' | 'opening' | 'opened' | 'error'
  const [paperMsg, setPaperMsg] = useState(null)

  const dirLabel = direction === 'long' ? '↑ LONG' : '↓ SHORT'
  const dirColor = direction === 'long' ? 'text-emerald-300' : 'text-rose-300'
  const cls = direction === 'long' ? 'border-emerald-500/30 bg-emerald-500/5'
                                  : 'border-rose-500/30 bg-rose-500/5'

  const openPaperTrade = async () => {
    if (!signal) return
    setPaperState('opening')
    setPaperMsg(null)
    try {
      const r = await api.post('/paper-trading/open', { signal })
      if (r.data?.success) {
        setPaperState('opened')
        setPaperMsg(`Pozisyon açıldı (${signal.symbol || ''} ${direction})`)
      } else {
        setPaperState('error')
        setPaperMsg(r.data?.error || 'Açılamadı')
      }
    } catch (e) {
      setPaperState('error')
      setPaperMsg(e.response?.data?.error || e.message)
    }
  }

  if (!signal) {
    return (
      <div className="p-2 rounded border border-dark-700 bg-dark-800 opacity-60">
        <div className="flex items-center justify-between text-[11px]">
          <span className={`font-bold ${dirColor}`}>{dirLabel}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/40 text-gray-500" title="Zorunlu koşullar geçmedi">
            skor yetersiz
          </span>
        </div>
        <p className="text-[10px] text-gray-600 mt-1">Bu yön için zorunlu koşullar karşılanmadı</p>
      </div>
    )
  }

  const wp = signal.winProbability
  return (
    <div className={`p-2 rounded border ${cls}`}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className={`text-[11px] font-bold ${dirColor}`}>{dirLabel}</span>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${direction === 'long' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
            {signal.totalScore}/{signal.applicableMax}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gold-500/10 text-gold-300 border border-gold-500/30">
            {signal.grade}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1 text-[10px] text-gray-400">
        <div>Giriş: <span className="text-white font-mono">{formatUsd(signal.entry)}</span></div>
        <div className="text-rose-300">Stop: <span className="font-mono">{formatUsd(signal.stop)}</span></div>
        <div className="text-emerald-300">T1: <span className="font-mono">{formatUsd(signal.target1)}</span></div>
        <div className="text-emerald-200">T2: <span className="font-mono">{formatUsd(signal.target2)}</span></div>
      </div>
      {(wp || signal.leverage_suggest > 1) && (
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          {wp && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gold-400/15 text-gold-400 border border-gold-400/30"
              title={`Bayesian — bucket ${wp.bucket}, prior %${(wp.prior * 100).toFixed(0)}, n=${wp.samples}`}>
              %{(wp.probability * 100).toFixed(0)} kazanma
              {wp.samples >= 30 ? ' ★' : wp.samples > 0 ? ` ·n${wp.samples}` : ' prior'}
            </span>
          )}
          {signal.leverage_suggest > 1 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
              {signal.leverage_suggest}x
            </span>
          )}
        </div>
      )}

      {/* Paper trade aç butonu */}
      <button
        onClick={openPaperTrade}
        disabled={paperState === 'opening' || paperState === 'opened'}
        className={`mt-2 w-full text-[10px] px-2 py-1 rounded-lg border inline-flex items-center justify-center gap-1.5 ${
          paperState === 'opened'
            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 cursor-default'
            : paperState === 'error'
            ? 'bg-rose-500/15 text-rose-300 border-rose-500/40'
            : 'bg-gold-400/10 text-gold-400 border-gold-400/30 hover:bg-gold-400/20'
        } disabled:opacity-70`}
        title={paperMsg || `$1,000 paper trade — ${direction} ${signal.symbol || ''}`}
      >
        {paperState === 'opening' ? (
          <><RefreshCw className="w-2.5 h-2.5 animate-spin" /> Açılıyor...</>
        ) : paperState === 'opened' ? (
          <><CheckCircle2 className="w-2.5 h-2.5" /> Paper Trade Açıldı</>
        ) : paperState === 'error' ? (
          <><AlertTriangle className="w-2.5 h-2.5" /> {paperMsg || 'Hata'}</>
        ) : (
          <><Wallet className="w-2.5 h-2.5" /> Paper Trade Aç ($1,000)</>
        )}
      </button>
    </div>
  )
}

function IndicatorsTab({ timeframes }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]" style={{ minWidth: 540 }}>
        <thead className="text-gray-500">
          <tr>
            <th className="text-left py-1.5 px-2">TF</th>
            <th className="text-right py-1.5 px-2">Cur RSI</th>
            <th className="text-right py-1.5 px-2">Cur MACD</th>
            <th className="text-right py-1.5 px-2">Higher RSI</th>
            <th className="text-right py-1.5 px-2">Higher MACD</th>
            <th className="text-right py-1.5 px-2">ATR (last)</th>
          </tr>
        </thead>
        <tbody>
          {TF_LIST.map(tf => {
            const data = timeframes?.[tf.key]
            const ind = data?.long?.indicators || data?.short?.indicators
            const atr = data?.long?.atr || data?.short?.atr
            return (
              <tr key={tf.key} className="border-t border-dark-700/40">
                <td className="py-1.5 px-2 font-mono font-semibold text-white">{tf.label}</td>
                <td className="py-1.5 px-2 text-right font-mono text-gray-300">{ind?.current_rsi != null ? ind.current_rsi.toFixed(0) : '—'}</td>
                <td className="py-1.5 px-2 text-right font-mono text-gray-300">{ind?.current_macdHist != null ? ind.current_macdHist.toFixed(3) : '—'}</td>
                <td className="py-1.5 px-2 text-right font-mono text-gray-300">{ind?.higher_rsi != null ? ind.higher_rsi.toFixed(0) : '—'}</td>
                <td className="py-1.5 px-2 text-right font-mono text-gray-300">{ind?.higher_macdHist != null ? ind.higher_macdHist.toFixed(3) : '—'}</td>
                <td className="py-1.5 px-2 text-right font-mono text-gray-400">{atr != null ? formatUsd(atr) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function AITab({ timeframes }) {
  return (
    <div className="space-y-2">
      {TF_LIST.map(tf => {
        const data = timeframes?.[tf.key]
        const longSig = data?.long
        const shortSig = data?.short
        // Pattern/divergence/volatility her iki sinyalde de aynı (current TF analizi)
        const sample = longSig || shortSig
        if (!sample) {
          return (
            <div key={tf.key} className="p-2 rounded-lg bg-dark-800 border border-dark-700 opacity-50">
              <div className="text-[11px] font-mono font-semibold text-gray-500">{tf.label} — veri yok</div>
            </div>
          )
        }
        const p = sample.patterns || {}
        const div = sample.divergence
        const vol = sample.volatility
        const mom = sample.momentum

        const tags = []
        if (p.engulfing) tags.push({ label: p.engulfing.type === 'bullish_engulfing' ? 'Boğa Yutması' : 'Ayı Yutması', color: p.engulfing.type.startsWith('bullish') ? 'emerald' : 'rose' })
        if (p.pinBar?.type === 'hammer') tags.push({ label: 'Çekiç', color: 'emerald' })
        if (p.pinBar?.type === 'shooting_star') tags.push({ label: 'Vurulan Yıldız', color: 'rose' })
        if (p.harami?.type === 'bullish_harami') tags.push({ label: 'Boğa Harami', color: 'emerald' })
        if (p.harami?.type === 'bearish_harami') tags.push({ label: 'Ayı Harami', color: 'rose' })
        if (p.doji?.type === 'long_legged_doji') tags.push({ label: 'Uzun Doji', color: 'amber' })
        if (div) tags.push({
          label: div.type === 'regular_bullish' ? 'Bullish Diverj.' :
                 div.type === 'regular_bearish' ? 'Bearish Diverj.' :
                 div.type === 'hidden_bullish'  ? 'Hidden Bull. Div.' :
                 div.type === 'hidden_bearish'  ? 'Hidden Bear. Div.' : div.type,
          color: div.type.includes('bullish') ? 'emerald' : 'rose',
        })

        return (
          <div key={tf.key} className="p-2 rounded-lg bg-dark-800/40 border border-dark-700">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-mono font-semibold text-white px-2 py-0.5 rounded bg-dark-700">{tf.label}</span>
              {vol && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                  vol.regime === 'high'   ? 'bg-amber-500/15 text-amber-300' :
                  vol.regime === 'low'    ? 'bg-sky-500/15 text-sky-300' :
                                            'bg-emerald-500/15 text-emerald-300'
                }`}>
                  Vol: {vol.regime?.toUpperCase()} ({vol.atrPct?.toFixed(2)}%)
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1 text-[10px]">
              {tags.length === 0 && <span className="text-gray-500 italic">— anlamlı pattern/divergence yok</span>}
              {tags.map((t, i) => (
                <span key={i} className={`px-2 py-0.5 rounded-full bg-${t.color}-500/10 text-${t.color}-300 border border-${t.color}-500/30`}>
                  {t.label}
                </span>
              ))}
              {mom && (
                <span className={`px-2 py-0.5 rounded-full ${
                  mom.type?.includes('bullish_acc') ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30' :
                  mom.type?.includes('bearish_acc') ? 'bg-rose-500/10 text-rose-300 border border-rose-500/30' :
                  'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                }`}>
                  Momentum: {mom.type?.replace(/_/g, ' ')}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
