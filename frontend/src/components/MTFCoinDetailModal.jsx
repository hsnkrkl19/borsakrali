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

import { useEffect, useState } from 'react'
import {
  X, Coins, TrendingUp, TrendingDown, Minus, Target, Shield, Sparkles,
  Activity, Layers, ExternalLink, RefreshCw, AlertTriangle, CheckCircle2,
  BarChart3, Zap, Clock,
} from 'lucide-react'
import api from '../services/api'

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
  STRONG_LONG:  { label: '⇈ STRONG LONG',  color: 'text-emerald-300', bg: 'bg-emerald-500/15', border: 'border-emerald-500/40' },
  LONG:         { label: '↑ LONG',         color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  WEAK_LONG:    { label: '↗ Zayıf Long',   color: 'text-emerald-200', bg: 'bg-emerald-500/5',  border: 'border-emerald-500/20' },
  NEUTRAL:      { label: '— NÖTR',         color: 'text-gray-400',    bg: 'bg-gray-500/10',    border: 'border-gray-500/30' },
  WEAK_SHORT:   { label: '↘ Zayıf Short',  color: 'text-rose-200',    bg: 'bg-rose-500/5',     border: 'border-rose-500/20' },
  SHORT:        { label: '↓ SHORT',        color: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30' },
  STRONG_SHORT: { label: '⇊ STRONG SHORT', color: 'text-rose-300',    bg: 'bg-rose-500/15',    border: 'border-rose-500/40' },
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

export default function MTFCoinDetailModal({ symbol, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('signals') // 'signals' | 'indicators' | 'ai'

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
            {/* Confluence top panel */}
            <ConfluencePanel confluence={data.confluence} />

            {/* Tab selector */}
            <div className="flex gap-1 px-3 pt-3 border-b border-dark-700">
              <TabBtn active={activeTab === 'signals'} onClick={() => setActiveTab('signals')} icon={Layers}>Sinyaller</TabBtn>
              <TabBtn active={activeTab === 'indicators'} onClick={() => setActiveTab('indicators')} icon={BarChart3}>İndikatörler</TabBtn>
              <TabBtn active={activeTab === 'ai'} onClick={() => setActiveTab('ai')} icon={Activity}>AI / Math</TabBtn>
            </div>

            {/* Tab content */}
            <div className="p-3">
              {activeTab === 'signals'    && <SignalsTab    timeframes={data.timeframes} />}
              {activeTab === 'indicators' && <IndicatorsTab timeframes={data.timeframes} />}
              {activeTab === 'ai'         && <AITab         timeframes={data.timeframes} />}
            </div>

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
            güven: <span className="text-purple-300 font-mono font-bold">%{((confluence.confidence || 0) * 100).toFixed(0)}</span>
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

function SignalsTab({ timeframes }) {
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

        return (
          <div key={tf.key} className="p-2.5 rounded-lg bg-dark-800/40 border border-dark-700">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-mono font-semibold text-white px-2 py-0.5 rounded bg-dark-700">{tf.label}</span>
              <span className="text-[9px] text-gray-500 uppercase">→ üst TF: {data?.higherTimeframe || '—'}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <DirectionPanel direction="long"  signal={long}  />
              <DirectionPanel direction="short" signal={short} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DirectionPanel({ direction, signal }) {
  const dirLabel = direction === 'long' ? '↑ LONG' : '↓ SHORT'
  const dirColor = direction === 'long' ? 'text-emerald-300' : 'text-rose-300'
  const cls = direction === 'long' ? 'border-emerald-500/30 bg-emerald-500/5'
                                  : 'border-rose-500/30 bg-rose-500/5'

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
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30"
              title={`Bayesian — bucket ${wp.bucket}, prior %${(wp.prior * 100).toFixed(0)}, n=${wp.samples}`}>
              %{(wp.probability * 100).toFixed(0)} kazanma
              {wp.samples >= 30 ? ' ★' : wp.samples > 0 ? ` ·n${wp.samples}` : ' prior'}
            </span>
          )}
          {signal.leverage_suggest > 1 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/30">
              {signal.leverage_suggest}x
            </span>
          )}
        </div>
      )}
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
