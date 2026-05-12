/**
 * TradingBot.jsx — Borsa Krali Trading Bot
 *
 * Freqtrade'den portlanmış 7 strateji (5 long + 2 short) + bizim eklediğimiz
 * sınama katmanı (Walk-Forward, Monte Carlo, OOS, Slippage Stress).
 *
 * 5 sekme:
 *   1. Backtest        — tek sembol × tek strateji (custom params + anlık sinyal)
 *   2. Karşılaştır     — tüm stratejilerin aynı sembolde yarışı
 *   3. Sınama          — robustness raporu + verdict
 *   4. Tarama          — universe scan
 *   5. Stratejiler     — strateji kataloğu
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Bot, Play, Activity, ShieldCheck, Search, BookOpen, TrendingUp,
  TrendingDown, AlertTriangle, CheckCircle2, XCircle, BarChart3, Target,
  Zap, RefreshCw, Info, Award, Trophy, Sliders, ArrowDownToLine, ArrowUpFromLine,
} from 'lucide-react'
import { createChart } from 'lightweight-charts'
import api from '../services/api'

const TABS = [
  { id: 'backtest', label: 'Backtest',     icon: Play         },
  { id: 'compare',  label: 'Karşılaştır',  icon: Trophy       },
  { id: 'validate', label: 'Sınama',       icon: ShieldCheck  },
  { id: 'scan',     label: 'Tarama',       icon: Search       },
  { id: 'info',     label: 'Stratejiler',  icon: BookOpen     },
]

const MARKETS = [
  { id: 'crypto', label: 'Kripto (Binance)' },
  { id: 'bist',   label: 'BIST (Yahoo)' },
]

const CRYPTO_DEFAULTS = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA']
const BIST_DEFAULTS   = ['THYAO', 'AKBNK', 'BIMAS', 'EREGL', 'KCHOL', 'KOZAL', 'TUPRS', 'GARAN', 'ASELS']

const TIMEFRAMES_CRYPTO = ['15m', '1h', '4h', '1d']
const TIMEFRAMES_BIST   = ['1d', '1w']

function fmtMoney(v, digits = 2) {
  if (v == null || !isFinite(v)) return '—'
  return Number(v).toLocaleString('tr-TR', { maximumFractionDigits: digits, minimumFractionDigits: digits })
}
function fmtPct(v, digits = 2) {
  if (v == null || !isFinite(v)) return '—'
  const s = v >= 0 ? '+' : ''
  return `${s}${Number(v).toFixed(digits)}%`
}
function fmtNum(v, digits = 2) {
  if (v == null || !isFinite(v)) return '—'
  return Number(v).toFixed(digits)
}
function fmtPF(v) {
  if (v == null || !isFinite(v)) return '—'
  if (v >= 999) return '∞'
  return Number(v).toFixed(2)
}

function MetricCard({ label, value, tone = 'neutral', hint }) {
  const toneClass = {
    pos: 'text-green-500',
    neg: 'text-red-500',
    neutral: 'text-slate-200',
    warn: 'text-amber-400',
  }[tone] || 'text-slate-200'
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
      <div className="text-xs text-slate-400 mb-1 flex items-center gap-1">{label}{hint && <Info className="h-3 w-3 text-slate-600" title={hint} />}</div>
      <div className={`text-lg font-semibold ${toneClass}`}>{value}</div>
    </div>
  )
}

function EquityChart({ equity }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  useEffect(() => {
    if (!containerRef.current || !equity || equity.length === 0) return
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null }
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 280,
      layout: { background: { color: 'transparent' }, textColor: '#cbd5e1' },
      grid:   { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
      timeScale: { timeVisible: true, secondsVisible: false },
      crosshair: { mode: 1 },
    })
    chartRef.current = chart
    const series = chart.addAreaSeries({
      lineColor: '#3b82f6',
      topColor: 'rgba(59,130,246,0.3)',
      bottomColor: 'rgba(59,130,246,0.02)',
      lineWidth: 2,
    })
    const seen = new Set()
    const data = equity
      .filter(p => p && p.time != null)
      .map(p => ({ time: p.time, value: p.equity }))
      .filter(p => { if (seen.has(p.time)) return false; seen.add(p.time); return true })
      .sort((a, b) => a.time - b.time)
    series.setData(data)
    chart.timeScale().fitContent()
    const onResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth })
    }
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); chart.remove(); chartRef.current = null }
  }, [equity])
  return <div ref={containerRef} className="w-full" style={{ minHeight: 280 }} />
}

function VerdictBadge({ score, verdict }) {
  let bg, txt, Icon
  if (score >= 75)      { bg = 'bg-green-500/15 border-green-500/40 text-green-400';   Icon = CheckCircle2 }
  else if (score >= 60) { bg = 'bg-blue-500/15 border-blue-500/40 text-blue-400';      Icon = ShieldCheck }
  else if (score >= 40) { bg = 'bg-amber-500/15 border-amber-500/40 text-amber-400';   Icon = AlertTriangle }
  else                  { bg = 'bg-red-500/15 border-red-500/40 text-red-400';         Icon = XCircle }
  return (
    <div className={`flex items-center gap-2 rounded-lg border ${bg} px-3 py-2`}>
      <Icon className="h-4 w-4" />
      <div className="text-sm font-medium">{verdict || `Skor: ${score}`}</div>
      <div className="ml-auto text-lg font-bold">{score}/100</div>
    </div>
  )
}

function SignalPill({ signal }) {
  if (!signal || signal === 'NONE' || signal === 'no_data') {
    return <span className="px-2 py-0.5 text-xs rounded bg-slate-700 text-slate-400">YOK</span>
  }
  if (signal === 'ENTRY_LONG')  return <span className="px-2 py-0.5 text-xs rounded bg-green-500/20 text-green-300 inline-flex items-center gap-1"><ArrowUpFromLine className="h-3 w-3" />LONG</span>
  if (signal === 'ENTRY_SHORT') return <span className="px-2 py-0.5 text-xs rounded bg-red-500/20 text-red-300 inline-flex items-center gap-1"><ArrowDownToLine className="h-3 w-3" />SHORT</span>
  if (signal === 'EXIT_LONG' || signal === 'EXIT_SHORT') return <span className="px-2 py-0.5 text-xs rounded bg-amber-500/20 text-amber-300">ÇIKIŞ</span>
  return <span className="px-2 py-0.5 text-xs rounded bg-slate-700">{signal}</span>
}

function InstantSignalCard({ signal, loading, error }) {
  if (loading) return (
    <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/50 flex items-center gap-2 text-sm text-slate-400">
      <RefreshCw className="h-4 w-4 animate-spin" />Anlık sinyal yükleniyor...
    </div>
  )
  if (error) return null
  if (!signal) return null
  const hasEntry = signal.signal === 'ENTRY_LONG' || signal.signal === 'ENTRY_SHORT'
  return (
    <div className={`p-3 rounded-lg border ${hasEntry ? 'border-blue-500/40 bg-blue-500/5' : 'border-slate-800 bg-slate-900/50'}`}>
      <div className="flex items-center gap-3 flex-wrap text-sm">
        <span className="font-semibold text-slate-200 flex items-center gap-1"><Zap className="h-4 w-4 text-blue-400" />Anlık Sinyal:</span>
        <SignalPill signal={signal.signal} />
        <span className="text-slate-400">Son fiyat: <span className="font-mono text-slate-200">{fmtMoney(signal.lastClose, 4)}</span></span>
        {signal.suggestedStop != null && <span className="text-slate-400">Stop: <span className="font-mono text-red-300">{fmtMoney(signal.suggestedStop, 4)}</span></span>}
        {signal.suggestedTarget != null && <span className="text-slate-400">Hedef: <span className="font-mono text-green-300">{fmtMoney(signal.suggestedTarget, 4)}</span></span>}
        {signal.expectedRR != null && <span className="text-slate-400">R/R: <span className="font-mono">{fmtNum(signal.expectedRR, 2)}</span></span>}
        <span className="text-slate-500 text-xs ml-auto">Rejim: <span className="uppercase text-slate-300">{signal.regime?.regime || '—'}</span></span>
      </div>
    </div>
  )
}

function ParamEditor({ strategy, values, onChange }) {
  if (!strategy?.params) return null
  const numericKeys = Object.keys(strategy.params).filter(k => typeof strategy.params[k] === 'number')
  return (
    <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/50">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-slate-400 flex items-center gap-1"><Sliders className="h-3 w-3" />Strateji Parametreleri (boş bırak = default)</div>
        <button onClick={() => onChange({})} className="text-xs text-slate-500 hover:text-slate-300">Sıfırla</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {numericKeys.map(k => (
          <div key={k}>
            <label className="block text-[10px] text-slate-500 mb-0.5 truncate" title={k}>{k}</label>
            <input
              type="number"
              step={typeof strategy.params[k] === 'number' && strategy.params[k] < 10 ? 0.1 : 1}
              placeholder={String(strategy.params[k])}
              value={values?.[k] ?? ''}
              onChange={e => {
                const v = e.target.value
                onChange({ ...values, [k]: v === '' ? undefined : +v })
              }}
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function WalkForwardChart({ windows }) {
  if (!windows || windows.length === 0) return null
  const maxAbs = Math.max(1, ...windows.flatMap(w => [Math.abs(w.inSample.ret), Math.abs(w.outSample.ret)]))
  return (
    <div className="mt-2 space-y-1">
      {windows.map(w => (
        <div key={w.window} className="flex items-center gap-2 text-[10px]">
          <span className="w-8 text-slate-500">#{w.window}</span>
          <div className="flex-1 relative h-5 bg-slate-800/30 rounded overflow-hidden">
            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-slate-600" />
            <div
              className={`absolute top-0.5 bottom-2.5 ${w.inSample.ret >= 0 ? 'left-1/2 bg-blue-500/40' : 'right-1/2 bg-blue-500/40'}`}
              style={{ width: `${(Math.abs(w.inSample.ret) / maxAbs) * 50}%` }}
            />
            <div
              className={`absolute top-2.5 bottom-0.5 ${w.outSample.ret >= 0 ? 'left-1/2 bg-purple-500/60' : 'right-1/2 bg-purple-500/60'}`}
              style={{ width: `${(Math.abs(w.outSample.ret) / maxAbs) * 50}%` }}
            />
          </div>
          <span className={`w-12 text-right ${w.inSample.ret >= 0 ? 'text-blue-300' : 'text-red-300'}`}>{fmtPct(w.inSample.ret, 1)}</span>
          <span className={`w-12 text-right ${w.outSample.ret >= 0 ? 'text-purple-300' : 'text-red-300'}`}>{fmtPct(w.outSample.ret, 1)}</span>
          <span className="w-4">{w.consistent ? '✓' : '✗'}</span>
        </div>
      ))}
      <div className="flex gap-3 text-[10px] text-slate-500 pt-1">
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-500/40 inline-block" />In-Sample</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-purple-500/60 inline-block" />Out-Sample</span>
      </div>
    </div>
  )
}

export default function TradingBot() {
  const [tab, setTab] = useState('backtest')
  const [strategies, setStrategies] = useState([])
  const [market, setMarket] = useState('crypto')
  const [symbol, setSymbol] = useState('BTC')
  const [strategyId, setStrategyId] = useState('supertrend')
  const [timeframe, setTimeframe] = useState('4h')
  const [lookback, setLookback] = useState(1000)
  const [customParams, setCustomParams] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [backtest, setBacktest] = useState(null)
  const [validation, setValidation] = useState(null)
  const [scanResults, setScanResults] = useState(null)
  const [compareResults, setCompareResults] = useState(null)
  const [instantSignal, setInstantSignal] = useState(null)
  const [signalLoading, setSignalLoading] = useState(false)

  useEffect(() => {
    let active = true
    api.get('/trading-bot/strategies')
      .then(r => { if (active) setStrategies(r.data.strategies || []) })
      .catch(e => { if (active) setError('Strateji listesi yüklenemedi: ' + e.message) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    setSymbol(market === 'crypto' ? 'BTC' : 'THYAO')
    setTimeframe(market === 'crypto' ? '4h' : '1d')
  }, [market])

  useEffect(() => { setCustomParams({}) }, [strategyId])

  const cleanParams = useMemo(() => {
    const out = {}
    for (const k of Object.keys(customParams || {})) {
      if (customParams[k] !== undefined && customParams[k] !== '' && isFinite(customParams[k])) out[k] = customParams[k]
    }
    return Object.keys(out).length ? out : undefined
  }, [customParams])

  const runBacktest = useCallback(async () => {
    setLoading(true); setError(null); setBacktest(null)
    try {
      const r = await api.post('/trading-bot/backtest', { market, symbol: symbol.toUpperCase(), strategyId, timeframe, lookback: +lookback, params: cleanParams })
      setBacktest(r.data.result)
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    } finally {
      setLoading(false)
    }
  }, [market, symbol, strategyId, timeframe, lookback, cleanParams])

  const runValidate = useCallback(async () => {
    setLoading(true); setError(null); setValidation(null)
    try {
      const r = await api.post('/trading-bot/validate', { market, symbol: symbol.toUpperCase(), strategyId, timeframe, lookback: +lookback, params: cleanParams })
      setValidation(r.data.result)
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    } finally {
      setLoading(false)
    }
  }, [market, symbol, strategyId, timeframe, lookback, cleanParams])

  const runScan = useCallback(async () => {
    setLoading(true); setError(null); setScanResults(null)
    try {
      const r = await api.get(`/trading-bot/scan?market=${market}&strategyId=${strategyId}&timeframe=${timeframe}`)
      setScanResults(r.data.result)
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    } finally {
      setLoading(false)
    }
  }, [market, strategyId, timeframe])

  const runCompare = useCallback(async () => {
    setLoading(true); setError(null); setCompareResults(null)
    try {
      const r = await api.post('/trading-bot/compare-all', { market, symbol: symbol.toUpperCase(), timeframe, lookback: +lookback })
      setCompareResults(r.data.result)
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    } finally {
      setLoading(false)
    }
  }, [market, symbol, timeframe, lookback])

  // Anında sinyal: sembol/strateji/tf değişince auto fetch (Backtest tab'ında görünür)
  useEffect(() => {
    if (tab !== 'backtest' || !symbol || !strategyId) return
    let active = true
    setSignalLoading(true)
    api.get(`/trading-bot/signal?market=${market}&symbol=${symbol.toUpperCase()}&strategyId=${strategyId}&timeframe=${timeframe}`)
      .then(r => { if (active) setInstantSignal(r.data.result) })
      .catch(() => { if (active) setInstantSignal(null) })
      .finally(() => { if (active) setSignalLoading(false) })
    return () => { active = false }
  }, [tab, market, symbol, strategyId, timeframe])

  const tfs = market === 'crypto' ? TIMEFRAMES_CRYPTO : TIMEFRAMES_BIST
  const defaults = market === 'crypto' ? CRYPTO_DEFAULTS : BIST_DEFAULTS
  const activeStrat = strategies.find(s => s.id === strategyId)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <Bot className="h-7 w-7 text-blue-400" />
          <h1 className="text-2xl font-bold">Trading Bot</h1>
          <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">v1.0 — Freqtrade port</span>
        </div>
        <p className="text-sm text-slate-400 mb-5">
          Freqtrade'in en çok kullanılan 5 stratejisi (NostalgiaForInfinity port'u dahil) Node.js'e taşındı +
          Walk-Forward Analysis, Monte Carlo permutation, Out-of-Sample split, Slippage Stress Test ve Regime
          Filter ile sertleştirildi. <span className="text-amber-400">Yatırım tavsiyesi değildir.</span>
        </p>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-5 border-b border-slate-800">
          {TABS.map(t => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 text-sm rounded-t-lg border-b-2 transition ${active
                  ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'}`}
              >
                <Icon className="h-4 w-4" />{t.label}
              </button>
            )
          })}
        </div>

        {/* Controls */}
        {tab !== 'info' && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-5 p-4 rounded-xl bg-slate-900/50 border border-slate-800">
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs text-slate-400 mb-1">Piyasa</label>
              <select value={market} onChange={e => setMarket(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm">
                {MARKETS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            {tab !== 'scan' && (
              <div className="col-span-2 md:col-span-1">
                <label className="block text-xs text-slate-400 mb-1">Sembol</label>
                <input value={symbol} onChange={e => setSymbol(e.target.value)} list="symList"
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm uppercase" />
                <datalist id="symList">
                  {defaults.map(s => <option key={s} value={s} />)}
                </datalist>
              </div>
            )}
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs text-slate-400 mb-1">Strateji</label>
              <select value={strategyId} onChange={e => setStrategyId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm">
                {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="col-span-1 md:col-span-1">
              <label className="block text-xs text-slate-400 mb-1">Timeframe</label>
              <select value={timeframe} onChange={e => setTimeframe(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm">
                {tfs.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {tab !== 'scan' && (
              <div className="col-span-1 md:col-span-1">
                <label className="block text-xs text-slate-400 mb-1">{market === 'crypto' ? 'Mum (max 1000)' : 'Gün (lookback)'}</label>
                <input type="number" value={lookback} onChange={e => setLookback(e.target.value)} min={100} max={market === 'crypto' ? 1000 : 1825}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm" />
              </div>
            )}
            <div className={`col-span-2 ${tab === 'scan' ? 'md:col-span-3' : 'md:col-span-1'} flex items-end`}>
              <button
                onClick={
                  tab === 'backtest' ? runBacktest :
                  tab === 'validate' ? runValidate :
                  tab === 'compare'  ? runCompare  :
                  runScan
                }
                disabled={loading}
                className="w-full px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white text-sm font-medium flex items-center justify-center gap-2 transition"
              >
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {loading ? 'Çalışıyor...' : (
                  tab === 'backtest' ? 'Backtest Çalıştır' :
                  tab === 'validate' ? 'Sınamayı Başlat' :
                  tab === 'compare'  ? 'Stratejileri Karşılaştır' :
                  'Universe Tara'
                )}
              </button>
            </div>
          </div>
        )}

        {tab === 'backtest' && (
          <div className="mb-4 space-y-3">
            <InstantSignalCard signal={instantSignal} loading={signalLoading} />
            <ParamEditor strategy={strategies.find(s => s.id === strategyId)} values={customParams} onChange={setCustomParams} />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 rounded border border-red-500/40 bg-red-500/10 text-red-300 text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />{error}
          </div>
        )}

        {/* === BACKTEST TAB === */}
        {tab === 'backtest' && backtest && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <MetricCard label="Toplam Getiri" value={fmtPct(backtest.metrics.totalReturnPct)} tone={backtest.metrics.totalReturnPct > 0 ? 'pos' : 'neg'} />
              <MetricCard label="Sharpe (yıllık)" value={fmtNum(backtest.metrics.sharpe)} tone={backtest.metrics.sharpe > 1 ? 'pos' : backtest.metrics.sharpe < 0 ? 'neg' : 'warn'} />
              <MetricCard label="Sortino" value={fmtNum(backtest.metrics.sortino)} tone={backtest.metrics.sortino > 1 ? 'pos' : 'neutral'} />
              <MetricCard label="Profit Factor" value={fmtPF(backtest.metrics.profitFactor)} tone={backtest.metrics.profitFactor > 1.5 ? 'pos' : 'neutral'} />
              <MetricCard label="Max DD" value={fmtPct(-backtest.metrics.maxDDPct)} tone="neg" />
              <MetricCard label="Win Rate" value={`${backtest.metrics.winRate}%`} tone={backtest.metrics.winRate > 50 ? 'pos' : 'warn'} />
              <MetricCard label="Toplam İşlem" value={backtest.metrics.totalTrades} />
              <MetricCard label="Expectancy (R)" value={fmtNum(backtest.metrics.expectancyR, 3)} tone={backtest.metrics.expectancyR > 0 ? 'pos' : 'neg'} />
              <MetricCard label="Ort Bar Tutma" value={backtest.metrics.avgTradeBars} />
              <MetricCard label="Brüt Kâr" value={fmtMoney(backtest.metrics.grossProfit)} tone="pos" />
              <MetricCard label="Brüt Zarar" value={fmtMoney(backtest.metrics.grossLoss)} tone="neg" />
              <MetricCard label="Bakiye" value={fmtMoney(backtest.finalBalance)} tone={backtest.finalBalance > backtest.initialBalance ? 'pos' : 'neg'} />
            </div>

            <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2"><BarChart3 className="h-4 w-4 text-blue-400" />Equity Eğrisi</h3>
                <div className="text-xs text-slate-400">{backtest.candlesCount} mum · {backtest.from?.slice(0,10)} → {backtest.to?.slice(0,10)}</div>
              </div>
              <EquityChart equity={backtest.equityCurve} />
            </div>

            <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Activity className="h-4 w-4 text-blue-400" />İşlemler (son 30)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="text-left py-2 pr-2">Giriş</th>
                      <th className="text-right pr-2">Fiyat</th>
                      <th className="text-left pr-2">Çıkış</th>
                      <th className="text-right pr-2">Fiyat</th>
                      <th className="text-right pr-2">PnL %</th>
                      <th className="text-right pr-2">R</th>
                      <th className="text-right pr-2">Bar</th>
                      <th className="text-left">Sebep</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(backtest.trades || []).slice(-30).reverse().map((t, i) => (
                      <tr key={i} className="border-b border-slate-800/40">
                        <td className="py-1.5 pr-2 text-slate-300">{new Date(t.entryTime * 1000).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                        <td className="text-right pr-2 text-slate-400">{fmtMoney(t.entryPrice, 4)}</td>
                        <td className="pr-2 text-slate-300">{new Date(t.exitTime * 1000).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                        <td className="text-right pr-2 text-slate-400">{fmtMoney(t.exitPrice, 4)}</td>
                        <td className={`text-right pr-2 font-medium ${t.pnlPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmtPct(t.pnlPct)}</td>
                        <td className={`text-right pr-2 ${(t.R || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmtNum(t.R, 2)}</td>
                        <td className="text-right pr-2 text-slate-400">{t.barsHeld}</td>
                        <td className="text-slate-400">{t.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(!backtest.trades || backtest.trades.length === 0) && (
                  <div className="text-slate-500 text-sm py-4 text-center">Bu dönemde işlem üretilmedi.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* === VALIDATE TAB === */}
        {tab === 'validate' && validation && (
          <div className="space-y-4">
            <VerdictBadge score={validation.robustnessScore} verdict={validation.verdict} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Walk-forward */}
              <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><Zap className="h-4 w-4 text-blue-400" />Walk-Forward Analysis</h3>
                <p className="text-xs text-slate-400 mb-3">Robert Pardo 1992. Veri 5 pencereye bölünür, her pencerede %70 in-sample → %30 out-of-sample. İşaretler tutarlıysa edge gerçektir.</p>
                {validation.walkForward.error ? (
                  <div className="text-xs text-amber-300">{validation.walkForward.error}</div>
                ) : (
                  <>
                    <WalkForwardChart windows={validation.walkForward.windows} />
                    <div className="mt-3 text-xs text-slate-300">Tutarlılık skoru: <span className="font-semibold">{validation.walkForward.score}%</span> · {validation.walkForward.windows?.filter(w => w.consistent).length || 0}/{validation.walkForward.windows?.length || 0} pencere aynı yönde</div>
                  </>
                )}
              </div>

              {/* Out-of-sample */}
              <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><Target className="h-4 w-4 text-blue-400" />Out-of-Sample (70/30)</h3>
                <p className="text-xs text-slate-400 mb-3">Veri tek seferlik bölünür. In-sample'da edge varsa out-sample'da da olmalı; aksi: overfit.</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded bg-slate-800/50">
                    <div className="text-slate-500">In-Sample</div>
                    <div>Sharpe: <span className="text-slate-200">{fmtNum(validation.outOfSample?.inSample?.sharpe)}</span></div>
                    <div>Getiri: <span className={validation.outOfSample?.inSample?.totalReturnPct > 0 ? 'text-green-400' : 'text-red-400'}>{fmtPct(validation.outOfSample?.inSample?.totalReturnPct)}</span></div>
                    <div>Trade: {validation.outOfSample?.inSample?.totalTrades}</div>
                  </div>
                  <div className="p-2 rounded bg-slate-800/50">
                    <div className="text-slate-500">Out-Sample</div>
                    <div>Sharpe: <span className="text-slate-200">{fmtNum(validation.outOfSample?.outSample?.sharpe)}</span></div>
                    <div>Getiri: <span className={validation.outOfSample?.outSample?.totalReturnPct > 0 ? 'text-green-400' : 'text-red-400'}>{fmtPct(validation.outOfSample?.outSample?.totalReturnPct)}</span></div>
                    <div>Trade: {validation.outOfSample?.outSample?.totalTrades}</div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-slate-300">Sharpe Degradasyonu: <span className="font-semibold text-amber-400">{fmtNum(validation.outOfSample?.sharpeDegradationPct)}%</span></div>
              </div>

              {/* Monte Carlo */}
              <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><Activity className="h-4 w-4 text-blue-400" />Monte Carlo (1000 koşu)</h3>
                <p className="text-xs text-slate-400 mb-3">İşlem sırası 1000 kez bootstrap-permüte edilir. Edge gerçekse %95 senaryoda kârlı kalır.</p>
                {validation.monteCarlo.error ? (
                  <div className="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2">
                    <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                    <div>{validation.monteCarlo.error}<br /><span className="text-slate-500">Daha uzun lookback'te tekrar dene veya farklı bir TF seç.</span></div>
                  </div>
                ) : (
                  <div className="text-xs space-y-1">
                    <div>5%-tile (kötü senaryo): <span className="text-red-400 font-mono">${fmtMoney(validation.monteCarlo.p5Final)}</span></div>
                    <div>Medyan: <span className="text-slate-200 font-mono">${fmtMoney(validation.monteCarlo.medianFinal)}</span></div>
                    <div>95%-tile (iyi senaryo): <span className="text-green-400 font-mono">${fmtMoney(validation.monteCarlo.p95Final)}</span></div>
                    <div className="pt-1 border-t border-slate-800">Medyan max DD: <span className="text-amber-400">{fmtNum(validation.monteCarlo.medianMaxDD)}%</span> · 95%-tile DD: <span className="text-red-400">{fmtNum(validation.monteCarlo.p95MaxDD)}%</span></div>
                    <div>Kârlı koşu oranı: <span className="font-semibold">{validation.monteCarlo.profitableRate}%</span></div>
                  </div>
                )}
              </div>

              {/* Slippage stress */}
              <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-400" />Slippage Stress Test</h3>
                <p className="text-xs text-slate-400 mb-3">Slippage 0 → 50 bps yükseltilir. Sağlam strateji 20 bps'de bile kârlı kalır.</p>
                <div className="text-xs">
                  <div className="flex justify-between border-b border-slate-800 pb-1 mb-1 font-semibold text-slate-400">
                    <span>Slip (bps)</span><span>Sharpe</span><span>Getiri</span><span>OK</span>
                  </div>
                  {(validation.slippageStress.stress || []).map((s, i) => (
                    <div key={i} className="flex justify-between py-1 border-b border-slate-800/40">
                      <span>{s.slippageBps}</span>
                      <span>{fmtNum(s.sharpe)}</span>
                      <span className={s.ret > 0 ? 'text-green-400' : 'text-red-400'}>{fmtPct(s.ret)}</span>
                      <span>{s.profitable ? '✓' : '✗'}</span>
                    </div>
                  ))}
                  <div className="mt-2">Sağlamlık: <span className="font-semibold">{validation.slippageStress.score}%</span></div>
                </div>
              </div>

              {/* Regime */}
              <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 md:col-span-2">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><Award className="h-4 w-4 text-blue-400" />Piyasa Rejimi (son 60 mum)</h3>
                <div className="flex flex-wrap gap-4 text-sm">
                  <div>Rejim: <span className="font-semibold uppercase text-blue-300">{validation.regime?.regime}</span></div>
                  <div>Trend: <span className={validation.regime?.trendPct > 0 ? 'text-green-400' : 'text-red-400'}>{fmtPct(validation.regime?.trendPct)}</span></div>
                  <div>Günlük volatilite: <span className="text-amber-400">{fmtNum(validation.regime?.dailyVolPct)}%</span></div>
                </div>
                <p className="text-xs text-slate-500 mt-2">Trend-takip stratejileri (Supertrend, EMA Ribbon) <b>trending</b> rejimde iyidir; mean-reversion (BBRSI, NostalgiaLite) <b>ranging</b>'de.</p>
              </div>
            </div>
          </div>
        )}

        {/* === COMPARE TAB === */}
        {tab === 'compare' && compareResults && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Trophy className="h-5 w-5 text-yellow-400" />
              <span className="font-semibold">{compareResults.symbol}</span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-400">En iyi (Sharpe):</span>
              {compareResults.bestStrategy ? <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-medium">{compareResults.bestStrategy}</span> : <span className="text-slate-500">—</span>}
              <span className="text-slate-500 text-xs ml-auto">{new Date(compareResults.scannedAt).toLocaleString('tr-TR')}</span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/50">
              <table className="w-full text-xs">
                <thead className="text-slate-400 border-b border-slate-800 bg-slate-900/80">
                  <tr>
                    <th className="text-left p-2">#</th>
                    <th className="text-left p-2">Strateji</th>
                    <th className="text-left p-2">Yön</th>
                    <th className="text-left p-2">TF</th>
                    <th className="text-right p-2">Sharpe</th>
                    <th className="text-right p-2">Getiri</th>
                    <th className="text-right p-2">PF</th>
                    <th className="text-right p-2">Max DD</th>
                    <th className="text-right p-2">Win%</th>
                    <th className="text-right p-2">İşlem</th>
                    <th className="text-right p-2">Beklenen R</th>
                  </tr>
                </thead>
                <tbody>
                  {compareResults.rankedBySharpe.map((s, i) => (
                    <tr key={s.strategyId} className={`border-b border-slate-800/40 hover:bg-slate-800/30 ${i === 0 ? 'bg-yellow-500/5' : ''}`}>
                      <td className="p-2 text-slate-500">{i + 1}{i === 0 && ' 🥇'}</td>
                      <td className="p-2 font-medium text-slate-200">{s.name}</td>
                      <td className="p-2"><span className={`px-1.5 py-0.5 rounded text-[10px] ${s.direction === 'long' ? 'bg-green-500/15 text-green-300' : 'bg-red-500/15 text-red-300'}`}>{s.direction}</span></td>
                      <td className="p-2 text-slate-400">{s.timeframe}</td>
                      <td className={`p-2 text-right font-mono ${s.metrics.sharpe > 1 ? 'text-green-400' : s.metrics.sharpe < 0 ? 'text-red-400' : 'text-slate-300'}`}>{fmtNum(s.metrics.sharpe)}</td>
                      <td className={`p-2 text-right font-mono ${s.metrics.totalReturnPct > 0 ? 'text-green-400' : 'text-red-400'}`}>{fmtPct(s.metrics.totalReturnPct)}</td>
                      <td className="p-2 text-right font-mono text-slate-300">{fmtPF(s.metrics.profitFactor)}</td>
                      <td className="p-2 text-right font-mono text-red-300">{fmtPct(-s.metrics.maxDDPct, 1)}</td>
                      <td className="p-2 text-right font-mono text-slate-300">{s.metrics.winRate}%</td>
                      <td className="p-2 text-right text-slate-400">{s.metrics.totalTrades}</td>
                      <td className={`p-2 text-right font-mono ${s.metrics.expectancyR > 0 ? 'text-green-400' : 'text-red-400'}`}>{fmtNum(s.metrics.expectancyR, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {compareResults.failed.length > 0 && (
              <div className="text-xs text-amber-300 p-2 rounded border border-amber-500/30 bg-amber-500/5">
                Çalıştırılamayan: {compareResults.failed.map(f => `${f.strategyId} (${f.error})`).join(', ')}
              </div>
            )}
            <div className="text-xs text-slate-500">
              Sharpe yüksek = risk-ayarlı getiri yüksek. PF (Profit Factor) {'>'} 1.5 idealdir. Beklenen R = ortalama R-multiple,
              pozitif olması gerekli. Bu karşılaştırma <b>sadece bu zaman aralığı</b> içindir — başka rejimde sıralama değişebilir.
            </div>
          </div>
        )}

        {/* === SCAN TAB === */}
        {tab === 'scan' && scanResults && (
          <div className="space-y-3">
            <div className="text-xs text-slate-400">
              {scanResults.hits.length} sembol giriş sinyali verdi · Universe: <span className="text-slate-200">{scanResults.universe}</span> · {new Date(scanResults.scannedAt).toLocaleString('tr-TR')}
            </div>
            {scanResults.hits.length === 0 ? (
              <div className="p-6 text-center text-slate-500 border border-slate-800 rounded-xl bg-slate-900/30">
                Şu an bu strateji için giriş sinyali yok. Piyasa rejimi uygun olmayabilir — Sınama sekmesinden rejimi kontrol edin.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {scanResults.hits.map(h => (
                  <div key={h.symbol} className="p-3 rounded-lg border border-green-500/30 bg-green-500/5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold text-lg">{h.symbol}</div>
                      <span className="px-2 py-0.5 text-xs rounded bg-green-500/20 text-green-300">{h.signal}</span>
                    </div>
                    <div className="text-xs space-y-1">
                      <div className="flex justify-between"><span className="text-slate-500">Fiyat</span><span className="font-mono">{fmtMoney(h.lastClose, 4)}</span></div>
                      {h.suggestedStop != null && (
                        <div className="flex justify-between"><span className="text-slate-500">Stop</span><span className="font-mono text-red-400">{fmtMoney(h.suggestedStop, 4)}</span></div>
                      )}
                      {h.suggestedTarget != null && (
                        <div className="flex justify-between"><span className="text-slate-500">Hedef</span><span className="font-mono text-green-400">{fmtMoney(h.suggestedTarget, 4)}</span></div>
                      )}
                      {h.expectedRR != null && (
                        <div className="flex justify-between"><span className="text-slate-500">R/R</span><span className="font-mono">{fmtNum(h.expectedRR, 2)}</span></div>
                      )}
                      <div className="flex justify-between"><span className="text-slate-500">Rejim</span><span>{h.regime?.regime}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* === INFO TAB === */}
        {tab === 'info' && (
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 text-sm">
              <div className="flex items-start gap-2">
                <Info className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold mb-1 text-blue-300">Trading Bot v1.0 — Nasıl çalışır?</div>
                  <p className="text-slate-300 mb-2">
                    Freqtrade, GitHub'da 25k+ yıldızlı en olgun açık kaynak crypto trading bot framework'üdür. Bu sayfa
                    onun en çok kullanılan 5 stratejisini Node.js'e port eder ve üstüne <b>bizim sertleştirme katmanımızı</b>
                    ekler. Strateji ham backtest geçse bile, Walk-Forward + Monte Carlo + OOS testlerini geçmiyorsa
                    "overfit" sayılır ve <span className="text-red-400">REJECT</span> alır.
                  </p>
                  <p className="text-slate-400 text-xs">Kaynaklar: <a href="https://github.com/freqtrade/freqtrade" className="text-blue-400 underline" target="_blank" rel="noreferrer">freqtrade</a>, <a href="https://github.com/iterativv/NostalgiaForInfinity" className="text-blue-400 underline" target="_blank" rel="noreferrer">NostalgiaForInfinity</a>, <a href="https://github.com/jesse-ai/jesse" className="text-blue-400 underline" target="_blank" rel="noreferrer">Jesse</a>.</p>
                </div>
              </div>
            </div>

            {strategies.map(s => (
              <div key={s.id} className="p-4 rounded-xl bg-slate-900/50 border border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-blue-400" />{s.name}
                  </h3>
                  <div className="flex gap-2 text-xs">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">TF: {s.timeframe}</span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">Yön: {s.direction}</span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">Warmup: {s.warmup}</span>
                  </div>
                </div>
                <p className="text-sm text-slate-300 mb-2">{s.description}</p>
                <details className="text-xs text-slate-400">
                  <summary className="cursor-pointer hover:text-slate-300">Parametreler</summary>
                  <pre className="mt-1 p-2 rounded bg-slate-800/50 overflow-x-auto">{JSON.stringify(s.params, null, 2)}</pre>
                </details>
              </div>
            ))}

            <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800">
              <h3 className="font-semibold mb-2 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-green-400" />Bizim Eklediğimiz Sınama Katmanı</h3>
              <ul className="text-sm text-slate-300 space-y-1.5 list-disc list-inside">
                <li><b>Walk-Forward Analysis</b>: Veri 5 pencereye bölünür, her birinde %70 in / %30 out backtest yapılır. Trade endüstrisinde "robustness gold standard" — Robert Pardo 1992.</li>
                <li><b>Monte Carlo Permutation (1000×)</b>: İşlem sırası random shuffle ile 1000 kez yeniden simüle edilir. Edge gerçekse %95 dağılım kârlı.</li>
                <li><b>Out-of-Sample Split (70/30)</b>: Tek seferlik in/out bölme, "Sharpe degradation" yüzdesi raporlanır. %30+ degradasyon overfit işareti.</li>
                <li><b>Slippage Stress Test</b>: Slippage 0/5/10/20/50 bps'te tekrar koşulur — strateji slip artarken çöker mi?</li>
                <li><b>Market Regime Filter</b>: Son 60 mumun trend %'si + günlük volatilite ile rejim sınıflandırılır (trending / ranging / volatile / mixed).</li>
              </ul>
              <p className="text-xs text-slate-500 mt-3">
                Bu 5 testin ortalaması <b>Robustness Score</b> üretir: ≥75 STRONG · ≥60 OK · ≥40 WEAK · &lt;40 REJECT.
              </p>
            </div>
          </div>
        )}

        {!loading && !error && !backtest && tab === 'backtest' && (
          <div className="text-center py-12 text-slate-500">
            <Bot className="h-12 w-12 mx-auto mb-3 text-slate-700" />
            <div>Strateji + sembol seç ve <b>Backtest Çalıştır</b>'a bas.</div>
            <div className="text-xs mt-1">Veri Binance/Yahoo'dan canlı çekilir. 5dk cache.</div>
          </div>
        )}
        {!loading && !error && !validation && tab === 'validate' && (
          <div className="text-center py-12 text-slate-500">
            <ShieldCheck className="h-12 w-12 mx-auto mb-3 text-slate-700" />
            <div>Stratejinin gerçek edge'i var mı görmek için <b>Sınamayı Başlat</b>'a bas.</div>
            <div className="text-xs mt-1">5 bağımsız test + robustness skoru (1-2 dakika sürebilir).</div>
          </div>
        )}
        {!loading && !error && !scanResults && tab === 'scan' && (
          <div className="text-center py-12 text-slate-500">
            <Search className="h-12 w-12 mx-auto mb-3 text-slate-700" />
            <div>Strateji + market seç ve <b>Universe Tara</b>'ya bas.</div>
            <div className="text-xs mt-1">{market === 'crypto' ? 'Top 15 kripto' : 'BIST30'} taranır; ENTRY_LONG veya ENTRY_SHORT olanlar listelenir.</div>
          </div>
        )}
        {!loading && !error && !compareResults && tab === 'compare' && (
          <div className="text-center py-12 text-slate-500">
            <Trophy className="h-12 w-12 mx-auto mb-3 text-slate-700" />
            <div>Sembol + TF seç ve <b>Stratejileri Karşılaştır</b>'a bas.</div>
            <div className="text-xs mt-1">7 strateji aynı sembolde paralel çalışır, Sharpe'a göre sıralanır. En üst sıra şampiyondur.</div>
          </div>
        )}
      </div>
    </div>
  )
}
