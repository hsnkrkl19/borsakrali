/**
 * 🤖 YENİ ROBOT — Derin Konfluans Sinyalleri (Borsa Krali)
 *
 * Eski Forex/Parite sekmesinden BAĞIMSIZ ayrı bir sinyal sistemi. 4 enstrüman
 * (BTC / Ons Altın / S&P 500 / EUR-USD) × 4 zaman dilimi (15m/1h/4h/1d). Tüm
 * site teknikleri (Genel Tarama, EMA34, TEMA34, SNR, SMC, Elliott, Harmonik,
 * Mum, Uyumsuzluk, Momentum, ta4j) tek bir "derin konfluans" oyunda birleşir;
 * çıktısı backtest + kendi kendini-sınama (self-test) ile doğrulanır.
 *
 * 3 alt-görünüm:
 *   1) Sinyaller  — GET /pro-signals/signals?equity=
 *   2) Performans — GET /pro-signals/performance
 *   3) Log        — GET /pro-signals/log?limit=
 *
 * Backend: /api/pro-signals (proSignals.routes.js). "Az ama net" felsefesi.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  RefreshCw, ChevronDown, ChevronUp, Target, Shield, Bot, Info, AlertCircle,
  CheckCircle2, ExternalLink, Clock, Copy, Check, Gauge, BarChart3, ScrollText, Sparkles,
} from 'lucide-react'
import api from '../services/api'

const PORTFOLIO_KEY = 'bk-yenirobot-portfolio'

const GRADE_STYLES = {
  MUKEMMEL: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  GUCLU:    'bg-sky-500/20    text-sky-300    border-sky-500/40',
  ORTA:     'bg-amber-500/20  text-amber-300  border-amber-500/40',
  ZAYIF:    'bg-gray-500/20   text-gray-300   border-gray-500/40',
}
const CLASS_META = {
  crypto: { label: 'Kripto', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  metal:  { label: 'Emtia',  cls: 'bg-yellow-500/15 text-yellow-200 border-yellow-500/30' },
  fx:     { label: 'Forex',  cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  index:  { label: 'Endeks', cls: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30' },
}
// 11 teknik (proConfluence BASE_WEIGHTS anahtarlarıyla birebir)
const TECH_LABELS = {
  genel: 'Genel Tarama', smc: 'SMC', snr: 'Malaysian SNR', ema34: 'EMA34', tema34: 'TEMA34',
  elliott: 'Elliott Dalga', harmonic: 'Harmonik Patern', ta4j: 'ta4j Bileşik',
  candlestick: 'Mum Formasyonu', divergence: 'Uyumsuzluk', momentum: 'Momentum İvmesi',
}

function fmtPrice(v, p = 4) { return v == null ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: p, maximumFractionDigits: p }) }
function fmtUsd(v, d = 0) { return v == null ? '—' : '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: d }) }
function readPortfolio() { const v = Number(localStorage.getItem(PORTFOLIO_KEY)); return v > 0 ? v : 10000 }
function confColor(c) { return c >= 75 ? 'text-emerald-300' : c >= 60 ? 'text-sky-300' : c >= 45 ? 'text-amber-300' : 'text-gray-400' }
function confBar(c) { return c >= 75 ? 'bg-emerald-500' : c >= 60 ? 'bg-sky-500' : c >= 45 ? 'bg-amber-500' : 'bg-gray-500' }

const SUBVIEWS = [
  { id: 'sinyaller', label: 'Sinyaller', icon: Sparkles },
  { id: 'performans', label: 'Performans', icon: BarChart3 },
  { id: 'log', label: 'Log', icon: ScrollText },
]

export default function YeniRobotSinyalleri() {
  const [view, setView] = useState('sinyaller')
  const [equity, setEquity] = useState(readPortfolio)
  const [equityInput, setEquityInput] = useState(String(readPortfolio()))
  const equityRef = useRef(equity)
  equityRef.current = equity

  const applyEquity = (reloadFns) => {
    const v = Math.max(100, Math.min(10_000_000, Number(equityInput) || 10000))
    setEquity(v); equityRef.current = v
    setEquityInput(String(v))
    localStorage.setItem(PORTFOLIO_KEY, String(v))
    reloadFns?.()
  }

  return (
    <div className="space-y-4">
      {/* ── Başlık ─────────────────────────────────────────────────────── */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Bot className="w-6 h-6 text-gold-400" />
          <div>
            <h3 className="text-white font-bold flex items-center gap-2 flex-wrap">
              🤖 Yeni Robot — Derin Konfluans
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">4 enstrüman · 15m–1d</span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">BTC · Ons Altın · S&amp;P 500 · EUR-USD · backtest + self-test doğrulamalı</p>
          </div>
        </div>

        <div className="flex items-start gap-2 p-2.5 bg-blue-500/5 border border-blue-500/20 rounded-lg text-[11px]">
          <Info className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
          <p className="text-gray-400 leading-relaxed">
            Forex sekmesinden <span className="text-white">ayrı</span> bir sistemdir. Tüm teknikler (Genel Tarama, EMA34, TEMA34, SNR, SMC, Elliott, Harmonik, Mum, Uyumsuzluk, Momentum, ta4j)
            <span className="text-white"> 15m / 1h / 4h / 1d</span> üzerinde birleştirilip <span className="text-white">derin konfluans</span> oyu ve 0-100 güven notu üretir.
            Robot kendi geçmiş sonuçlarına göre teknik ağırlıklarını ve eşiğini sürekli ayarlar — <span className="text-white">az ama net</span> felsefesi.
          </p>
        </div>

        {/* Alt-görünüm seçici */}
        <div className="grid grid-cols-3 gap-1.5">
          {SUBVIEWS.map(s => (
            <button key={s.id} onClick={() => setView(s.id)}
              className={`py-2 rounded-lg border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${view === s.id ? 'bg-gold-500/15 border-gold-500/50 text-white' : 'bg-dark-800 border-dark-700 text-gray-400 hover:border-dark-600'}`}>
              <s.icon className="w-3.5 h-3.5" /> {s.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'sinyaller' && <SignalsView equityRef={equityRef} equityInput={equityInput} setEquityInput={setEquityInput} applyEquity={applyEquity} />}
      {view === 'performans' && <PerformanceView />}
      {view === 'log' && <LogView />}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// 1) SİNYALLER  — GET /pro-signals/signals  ·  POST /pro-signals/generate
// ════════════════════════════════════════════════════════════════════════════
function SignalsView({ equityRef, equityInput, setEquityInput, applyEquity }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expanded, setExpanded] = useState(null)

  const load = useCallback(async () => {
    try {
      const r = await api.get('/pro-signals/signals', { params: { equity: equityRef.current } })
      setData(r.data)
    } catch (e) {
      const status = e.response?.status
      if (status === 503) setData({ pending: true })
      else setData({ error: e.response?.data?.error || e.message })
    } finally { setLoading(false) }
  }, [equityRef])

  useEffect(() => {
    load()
    const t = setInterval(load, 60000) // her dk güncellenir
    return () => clearInterval(t)
  }, [load])

  const refresh = async () => {
    setRefreshing(true)
    try { await api.post('/pro-signals/generate', { equity: equityRef.current }); await load() }
    catch (_) {} finally { setRefreshing(false) }
  }

  if (loading) return (
    <div className="card p-8 text-center"><RefreshCw className="w-6 h-6 text-gold-400 animate-spin mx-auto mb-2" /><p className="text-sm text-gray-400">Yeni robot sinyalleri yükleniyor...</p></div>
  )
  if (data?.pending) return (
    <div className="card p-8 text-center space-y-3">
      <Clock className="w-8 h-8 text-amber-400 mx-auto" /><h3 className="text-white font-bold">Yeni robot hazırlanıyor</h3>
      <p className="text-xs text-gray-400 max-w-md mx-auto">İlk üretim Yahoo verilerini topluyor (4 TF × 4 enstrüman), birkaç saniye sürer.</p>
      <button onClick={refresh} disabled={refreshing} className="btn-primary inline-flex items-center gap-2 text-sm disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Şimdi üret</button>
    </div>
  )
  if (data?.error) return (
    <div className="card p-6 text-center"><AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-2" /><p className="text-sm text-red-300">{data.error}</p><button onClick={load} className="btn-secondary text-xs mt-3">Tekrar dene</button></div>
  )

  const all = (data?.signals || []).slice().sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
  const c = data?.counts || {}

  return (
    <div className="space-y-4">
      {/* Portföy + sayım + yenile */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-xs text-gray-500">
            {data?.generatedAt ? `Güncellendi: ${new Date(data.generatedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : '—'}
            {data?.counts && ` · ${c.signal ?? all.length} sinyal · ${c.open ?? 0} açık enstrüman`}
          </p>
          <button onClick={refresh} disabled={refreshing} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1 disabled:opacity-50"><RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} /> Yenile</button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Portföy ($)</label>
            <div className="flex items-center gap-1">
              <input type="number" value={equityInput} onChange={e => setEquityInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && applyEquity(load)}
                className="w-28 bg-dark-800 border border-dark-700 rounded-lg px-2 py-1.5 text-sm text-white font-mono focus:border-gold-500 outline-none" />
              <button onClick={() => applyEquity(load)} className="btn-primary text-xs px-3 py-1.5">Uygula</button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 flex-1 min-w-[220px]">
            <MiniStat label="Tarandı" value={c.scanned ?? '—'} />
            <MiniStat label="Sinyal" value={c.signal ?? all.length} tone="emerald" />
            <MiniStat label="Long" value={c.long ?? '—'} tone="emerald" />
            <MiniStat label="Short" value={c.short ?? '—'} tone="rose" />
          </div>
        </div>
      </div>

      {/* Sinyal listesi */}
      {all.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-sm text-gray-400">Şu an konfluans kriterini geçen net sinyal yok (az ama net felsefesi).</p>
          <p className="text-xs text-gray-500 mt-1">Robot her 3 dk yeniden tarar; eşiği geçen sinyaller burada listelenir.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {all.map((s) => {
            const key = `${s.id}-${s.tf}`
            return <RobotCard key={key} sig={s} expanded={expanded === key} onToggle={() => setExpanded(expanded === key ? null : key)} />
          })}
        </div>
      )}

      {/* Enstrüman durum şeridi */}
      {data?.instruments?.length > 0 && (
        <div className="card p-3">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Enstrümanlar</div>
          <div className="flex flex-wrap gap-1.5">
            {data.instruments.map(i => {
              const conf = i.confluence
              return (
                <span key={i.id} className="text-[10px] px-2 py-0.5 rounded-full bg-dark-800 border border-dark-700">
                  <span className="text-gray-300">{i.symbol}</span>{' '}
                  {conf ? (
                    <span className={conf.direction === 'long' ? 'text-emerald-400' : 'text-rose-400'}>{conf.direction === 'long' ? '↑' : '↓'} {(conf.tfs || []).join(',')}</span>
                  ) : <span className="text-gray-500">nötr</span>}
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function MiniStat({ label, value, tone }) {
  return (<div className="p-2 rounded-lg bg-dark-800 border border-dark-700 text-center"><div className="text-[9px] text-gray-500 uppercase tracking-wider">{label}</div><div className={`text-sm font-bold ${tone === 'amber' ? 'text-amber-300' : tone === 'emerald' ? 'text-emerald-300' : tone === 'rose' ? 'text-rose-300' : 'text-white'}`}>{value}</div></div>)
}

// ─── Sinyal kartı ─────────────────────────────────────────────────────────
function RobotCard({ sig, expanded, onToggle }) {
  const [copied, setCopied] = useState(false)
  const isLong = sig.direction === 'long'
  const p = sig.precision ?? 4
  const dir = isLong ? { label: '↑ LONG', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' } : { label: '↓ SHORT', cls: 'text-rose-400 bg-rose-500/10 border-rose-500/30' }
  const classMeta = CLASS_META[sig.class] || CLASS_META.fx
  const z = sig.sizing || {}, pnl = sig.pnl || {}
  const conf = Math.round((sig.confluence || 0) * 100)

  const copyMt5 = (e) => {
    e.stopPropagation()
    const txt = sig.mt5?.summary || ''
    try { navigator.clipboard.writeText(txt); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch (_) {}
  }

  return (
    <div className={`card border-2 ${expanded ? 'border-gold-500/40' : 'border-dark-700'} transition-colors`}>
      <div className="cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-bold text-white">{sig.symbol}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-dark-700 text-gray-300 font-mono">{sig.tf}</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${classMeta.cls}`}>{classMeta.label}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${dir.cls}`}>{sig.action || dir.label}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${GRADE_STYLES[sig.grade] || GRADE_STYLES.ZAYIF}`}>{sig.grade}</span>
              {sig.historicalWinRate != null && (
                <span title={`Backtest geçmiş başarı: %${sig.historicalWinRate}${sig.profitFactor != null ? ` · PF ${sig.profitFactor}` : ''} (${sig.sampleSize} örnek)`} className="text-[10px] px-2 py-0.5 rounded-full border bg-violet-500/10 text-violet-300 border-violet-500/30">
                  📊 %{sig.historicalWinRate}{sig.sampleSize != null ? ` · n${sig.sampleSize}` : ''}{sig.profitFactor != null ? ` · PF${sig.profitFactor}` : ''}
                </span>
              )}
            </div>
            <p className="text-[10px] text-gray-500 truncate mt-0.5">
              {sig.name} · R/R {sig.rr1} · {sig.horizon}
              {sig.sameTfCount != null && ` · ${sig.sameTfCount} TF uyum`}
            </p>
          </div>
          {/* Güven notu */}
          <div className="flex flex-col items-end flex-shrink-0 w-16">
            <div className="flex items-center gap-1"><Gauge className="w-3 h-3 text-gray-500" /><span className={`text-xl font-bold leading-none ${confColor(sig.confidence)}`}>{sig.confidence}</span></div>
            <div className="text-[8px] text-gray-500 mt-0.5">GÜVEN /100</div>
            <div className="w-14 h-1 bg-dark-700 rounded-full mt-1 overflow-hidden"><div className={`h-full ${confBar(sig.confidence)}`} style={{ width: `${sig.confidence}%` }} /></div>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>

        {/* Konfluans şeridi */}
        <div className="mt-2 text-[11px] text-gray-400">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-sky-500/5 border border-sky-500/20">
            <span className="text-sky-300 font-semibold">Konfluans {conf}%</span>
            {sig.sameTfCount != null && <span className="text-gray-500">·</span>}
            {sig.confluenceTfs?.length > 0 && <span className="text-gray-400">{sig.confluenceTfs.length}/4 TF: {sig.confluenceTfs.join(', ')}</span>}
            {!sig.confluenceTfs && sig.sameTfCount != null && <span className="text-gray-400">{sig.sameTfCount}/4 TF</span>}
          </span>
        </div>

        {/* Seviyeler */}
        <div className="flex items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-gray-400 flex-wrap">
          <span className="flex items-center gap-1"><Target className="w-3 h-3" />Giriş: <span className="text-white font-mono">{fmtPrice(sig.entry, p)}</span></span>
          <span className="text-rose-300">SL: <span className="font-mono">{fmtPrice(sig.stop, p)}</span></span>
          <span className="text-emerald-300">TP1: <span className="font-mono">{fmtPrice(sig.target1, p)}</span></span>
          <span className="text-emerald-200">TP2: <span className="font-mono">{fmtPrice(sig.target2, p)}</span></span>
        </div>

        {/* Plan özeti */}
        <div className="mt-2 flex items-center gap-x-3 gap-y-1 text-[11px] flex-wrap">
          {z.marginUsd != null && <span className="text-gray-400">Marj: {fmtUsd(z.marginUsd)} ({z.marginPct}%)</span>}
          {z.riskUsd != null && <span className="text-rose-300 flex items-center gap-1"><Shield className="w-3 h-3" />Risk: {fmtUsd(z.riskUsd, 0)}</span>}
          {pnl.tp1ProfitUsd != null && <span className="text-emerald-300">TP1: +{fmtUsd(pnl.tp1ProfitUsd)}</span>}
        </div>
      </div>

      {/* Açılır panel */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-dark-700 space-y-3">
          {/* MT5 emir bloğu */}
          {sig.mt5 && (
          <div className="rounded-lg p-3 border border-gold-500/30 bg-gold-500/5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-gold-300"><span>🤖</span> MetaTrader5 Emri</div>
              <button onClick={copyMt5} className="text-[10px] flex items-center gap-1 px-2 py-1 rounded bg-dark-800 hover:bg-dark-700 text-gray-300">{copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}{copied ? 'Kopyalandı' : 'Kopyala'}</button>
            </div>
            <div className="font-mono text-[11px] text-white bg-dark-900/60 rounded p-2 leading-relaxed whitespace-pre-wrap">
              {sig.mt5?.summary || (
                <>
                  <div><span className={isLong ? 'text-emerald-400' : 'text-rose-400'}>{sig.mt5?.type || (isLong ? 'BUY' : 'SELL')}</span> {sig.mt5?.symbol || sig.symbol} @ PİYASA</div>
                  <div className="text-gray-400">SL {fmtPrice(sig.stop, p)} · TP1 {fmtPrice(sig.target1, p)} · TP2 {fmtPrice(sig.target2, p)}</div>
                </>
              )}
            </div>
          </div>
          )}

          {/* Trade planı */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <PlanCell label="Giriş" value={fmtPrice(sig.entry, p)} color="emerald" />
            <PlanCell label="Stop" value={fmtPrice(sig.stop, p)} color="rose" />
            <PlanCell label={`TP1 (R/R ${sig.rr1})`} value={fmtPrice(sig.target1, p)} color="sky" />
            <PlanCell label={`TP2 (R/R ${sig.rr2})`} value={fmtPrice(sig.target2, p)} color="emerald" />
          </div>

          {/* Risk / kâr-zarar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
            {z.lots != null && <KV label="Lot" value={z.lots} />}
            {z.units != null && <KV label="Miktar" value={Number(z.units).toLocaleString('en-US')} />}
            {z.marginUsd != null && <KV label="Gerekli marj" value={`${fmtUsd(z.marginUsd)} (${z.marginPct}%)`} />}
            {pnl.slLossUsd != null && <KV label="Max zarar (SL)" value={`-${fmtUsd(pnl.slLossUsd, 0)}`} tone="rose" />}
            {(pnl.tp1ProfitUsd != null || pnl.tp2ProfitUsd != null) && <KV label="Kâr TP1 / TP2" value={`+${fmtUsd(pnl.tp1ProfitUsd)} / +${fmtUsd(pnl.tp2ProfitUsd)}`} tone="emerald" />}
          </div>

          {/* Güven kırılımı */}
          <div className="rounded-lg p-2.5 border border-sky-500/20 bg-sky-500/5 text-[11px] space-y-1.5">
            <div className="flex items-center justify-between"><span className="text-gray-300 font-semibold flex items-center gap-1"><Gauge className="w-3.5 h-3.5 text-sky-400" />Güven Notu: <span className={confColor(sig.confidence)}>{sig.confidence}/100</span> ({sig.grade})</span></div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-gray-400">
              <span>Konfluans: <span className="text-white">{conf}%</span></span>
              {sig.rawConfidence != null && <span>Ham güven: <span className="text-white">{sig.rawConfidence}</span></span>}
              {sig.confidenceCalibration?.empirical != null && <span title={`Güven: ${sig.confidenceCalibration.trust}`}>Kalibre: <span className="text-white">%{sig.confidenceCalibration.empirical}</span>{sig.confidenceCalibration.delta != null ? ` (${sig.confidenceCalibration.delta > 0 ? '+' : ''}${sig.confidenceCalibration.delta})` : ''}</span>}
              {sig.historicalWinRate != null
                ? <span>📊 Geçmiş: <span className="text-white">%{sig.historicalWinRate}</span> ({sig.sampleSize} örnek{sig.profitFactor != null ? `, PF ${sig.profitFactor}` : ''})</span>
                : <span className="text-gray-500">📊 Geçmiş başarı: veri toplanıyor</span>}
            </div>
            {/* Teknik oyları (kırılım) */}
            <div className="flex flex-wrap gap-1 pt-1">
              {(sig.votes || []).map((v, i) => (
                <span key={(v.technique || i) + '-' + i} title={`${TECH_LABELS[v.technique] || v.label || v.technique}${v.score != null ? `: ${v.score}` : ''}`}
                  className={`text-[9px] px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${v.vote === 'long' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : v.vote === 'short' ? 'bg-rose-500/10 text-rose-300 border-rose-500/30' : 'bg-gray-500/10 text-gray-500 border-gray-500/20'}`}>
                  {v.vote === 'long' ? '▲' : v.vote === 'short' ? '▼' : '–'} {TECH_LABELS[v.technique] || v.label || v.technique}
                </span>
              ))}
            </div>
          </div>

          {/* Geçen koşullar */}
          {(sig.conditions || []).length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">Geçen Koşullar</div>
              <div className="flex flex-wrap gap-1">
                {sig.conditions.map((c, i) => (
                  <span key={(c.id || c.label || i) + '-' + i} className="text-[10px] px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-300 border-emerald-500/30 inline-flex items-center gap-1"><CheckCircle2 className="w-2.5 h-2.5" />{c.label}</span>
                ))}
              </div>
            </div>
          )}

          {sig.tvSymbol && (
            <a href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(sig.tvSymbol)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[11px] text-gold-400 hover:text-gold-300"><ExternalLink className="w-3 h-3" /> {sig.symbol} grafiği (TradingView)</a>
          )}
        </div>
      )}
    </div>
  )
}

function PlanCell({ label, value, color }) {
  const map = { emerald: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/5', rose: 'text-rose-300 border-rose-500/30 bg-rose-500/5', sky: 'text-sky-300 border-sky-500/30 bg-sky-500/5' }
  return (<div className={`p-2 rounded-lg border ${map[color] || map.sky}`}><div className="text-[10px] uppercase tracking-wider opacity-70 mb-0.5">{label}</div><div className="text-xs font-mono font-bold">{value}</div></div>)
}
function KV({ label, value, tone }) {
  return (<div className="p-1.5 rounded bg-dark-800/60"><div className="text-[9px] text-gray-500 uppercase tracking-wider">{label}</div><div className={`text-xs font-mono font-bold ${tone === 'rose' ? 'text-rose-300' : tone === 'emerald' ? 'text-emerald-300' : 'text-white'}`}>{value}</div></div>)
}

// ════════════════════════════════════════════════════════════════════════════
// 2) PERFORMANS  — GET /pro-signals/performance
// ════════════════════════════════════════════════════════════════════════════
function PerformanceView() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await api.get('/pro-signals/performance')
      setData(r.data)
    } catch (e) { setError(e.response?.data?.error || e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="card p-8 text-center"><RefreshCw className="w-6 h-6 text-gold-400 animate-spin mx-auto mb-2" /><p className="text-sm text-gray-400">Performans yükleniyor...</p></div>
  if (error) return <div className="card p-6 text-center"><AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-2" /><p className="text-sm text-red-300">{error}</p><button onClick={load} className="btn-secondary text-xs mt-3">Tekrar dene</button></div>

  const stats = data?.stats || {}
  const byPair = stats.byPair || {}
  const selfTest = data?.selfTest || null
  const weights = data?.weights || selfTest?.weights || {}
  const pushThreshold = data?.pushThreshold ?? selfTest?.pushThreshold
  const history = selfTest?.history || []

  const pairRows = Object.entries(byPair)
  const fmtRate = (r) => (!r || !r.n ? '—' : `%${Math.round((r.win / r.n) * 100)} (${r.win}/${r.n})`)
  const fmtAvg = (r) => (!r || !r.n ? '' : ` · ort ${(r.sumPnl / r.n).toFixed(2)}%`)

  return (
    <div className="space-y-4">
      {/* Üst özet */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h4 className="text-white font-bold flex items-center gap-2"><BarChart3 className="w-4 h-4 text-gold-400" /> Canlı Performans</h4>
          <button onClick={load} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Yenile</button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MiniStat label="Sinyal (açılan)" value={stats.totalOpened ?? 0} />
          <MiniStat label="Kapanan" value={stats.totalClosed ?? 0} />
          <MiniStat label="Push eşiği" value={pushThreshold != null ? pushThreshold : '—'} tone="amber" />
          <MiniStat label="Self-test WR" value={selfTest?.overall?.n ? `%${Math.round((selfTest.overall.winRate || 0) * 100)}` : '—'} tone="emerald" />
        </div>
        {stats.since && <p className="text-[10px] text-gray-500">Kayıt başlangıcı: {new Date(stats.since).toLocaleDateString('tr-TR')}{selfTest?.updatedAt ? ` · self-test güncel: ${new Date(selfTest.updatedAt).toLocaleString('tr-TR')}` : ''}</p>}
      </div>

      {/* Parite başına başarı */}
      <div className="card p-4 space-y-2">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider">Enstrüman Başına Başarı (LONG / SHORT)</div>
        {pairRows.length === 0 ? (
          <p className="text-xs text-gray-500">Henüz kapanan sinyal yok — istatistik birikiyor.</p>
        ) : (
          <div className="space-y-1.5">
            {pairRows.map(([id, pr]) => (
              <div key={id} className="flex items-center justify-between gap-2 text-[11px] p-2 rounded-lg bg-dark-800/60 border border-dark-700">
                <span className="font-bold text-white">{id}</span>
                <div className="flex items-center gap-3 flex-wrap justify-end">
                  <span className="text-emerald-300">LONG <span className="font-mono">{fmtRate(pr.long)}</span><span className="text-gray-500">{fmtAvg(pr.long)}</span></span>
                  <span className="text-rose-300">SHORT <span className="font-mono">{fmtRate(pr.short)}</span><span className="text-gray-500">{fmtAvg(pr.short)}</span></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ayarlanmış teknik ağırlıkları */}
      <div className="card p-4 space-y-2">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider">Ayarlanmış Teknik Ağırlıkları (self-test ile)</div>
        {Object.keys(weights).length === 0 ? (
          <p className="text-xs text-gray-500">Ağırlık verisi yok.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(weights).sort((a, b) => b[1] - a[1]).map(([k, w]) => {
              const techPerf = selfTest?.perTechnique?.[k]
              return (
                <div key={k} className="p-2 rounded-lg bg-dark-800/60 border border-dark-700">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-300">{TECH_LABELS[k] || k}</span>
                    <span className="text-xs font-mono font-bold text-gold-300">{Number(w).toFixed(2)}</span>
                  </div>
                  {/* Ağırlık çubuğu (0.5–4.0 bandı) */}
                  <div className="w-full h-1 bg-dark-700 rounded-full mt-1 overflow-hidden"><div className="h-full bg-gold-500" style={{ width: `${Math.min(100, (Number(w) / 4) * 100)}%` }} /></div>
                  {techPerf?.n > 0 && <div className="text-[9px] text-gray-500 mt-0.5">WR %{Math.round((techPerf.winRate || 0) * 100)} (n{techPerf.n})</div>}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Self-test geçmişi (son değişiklikler) */}
      {history.length > 0 && (
        <div className="card p-4 space-y-2">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Self-Test Son Ayarlamaları</div>
          <div className="space-y-2">
            {history.slice().reverse().slice(0, 6).map((h, i) => (
              <div key={(h.ts || i) + '-' + i} className="text-[11px] p-2 rounded-lg bg-dark-800/60 border border-dark-700">
                <div className="flex items-center justify-between text-gray-400">
                  <span>{h.ts ? new Date(h.ts).toLocaleString('tr-TR') : '—'}</span>
                  <span>Genel WR <span className="text-white">%{Math.round((h.overallWinRate || 0) * 100)}</span> (n{h.n})</span>
                </div>
                {(h.changes || []).length > 0 ? (
                  <div className="mt-1 space-y-0.5">
                    {h.changes.map((ch, j) => (
                      <div key={j} className="text-[10px] text-gray-500 flex items-center gap-1 flex-wrap">
                        <span className="text-gray-300">{ch.type === 'threshold' ? 'Eşik' : (TECH_LABELS[ch.key] || ch.key)}</span>
                        <span className="font-mono">{Number(ch.before).toFixed(2)} → {Number(ch.after).toFixed(2)}</span>
                        {ch.reason && <span className="text-gray-600">· {ch.reason}</span>}
                      </div>
                    ))}
                  </div>
                ) : <div className="text-[10px] text-gray-600 mt-1">Değişiklik yok (kararlı).</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Açık pozisyonlar */}
      {data?.open?.length > 0 && (
        <div className="card p-4 space-y-2">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Açık Pozisyonlar ({data.open.length})</div>
          <div className="flex flex-wrap gap-1.5">
            {data.open.map((o, i) => (
              <span key={(o.code || i) + '-' + i} className="text-[10px] px-2 py-0.5 rounded-full bg-dark-800 border border-dark-700">
                <span className="text-gray-300">{o.symbol || o.instrumentId}</span>{' '}
                <span className={o.direction === 'long' ? 'text-emerald-400' : 'text-rose-400'}>{o.direction === 'long' ? 'LONG' : 'SHORT'}</span>
                {o.code && <span className="text-gray-500"> · {o.code}</span>}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// 3) LOG  — GET /pro-signals/log?limit=100
// ════════════════════════════════════════════════════════════════════════════
const OUTCOME_META = {
  TP1:    { label: 'TP1', cls: 'text-emerald-300' },
  TRAIL:  { label: 'İz-süren', cls: 'text-emerald-300' },
  SL:     { label: 'SL', cls: 'text-rose-300' },
  EXPIRE: { label: 'Süre doldu', cls: 'text-gray-400' },
}

function LogView() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await api.get('/pro-signals/log', { params: { limit: 100 } })
      setData(r.data)
    } catch (e) { setError(e.response?.data?.error || e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="card p-8 text-center"><RefreshCw className="w-6 h-6 text-gold-400 animate-spin mx-auto mb-2" /><p className="text-sm text-gray-400">Log yükleniyor...</p></div>
  if (error) return <div className="card p-6 text-center"><AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-2" /><p className="text-sm text-red-300">{error}</p><button onClick={load} className="btn-secondary text-xs mt-3">Tekrar dene</button></div>

  const records = data?.records || []

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="text-white font-bold flex items-center gap-2"><ScrollText className="w-4 h-4 text-gold-400" /> Sinyal Logu <span className="text-xs text-gray-500 font-normal">({data?.count ?? records.length})</span></h4>
        <button onClick={load} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Yenile</button>
      </div>

      {records.length === 0 ? (
        <p className="text-xs text-gray-500 py-4 text-center">Henüz log kaydı yok — robot sinyal ürettikçe burada listelenir.</p>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-gray-500 uppercase tracking-wider text-[9px] border-b border-dark-700">
                <th className="text-left py-1.5 px-2 font-medium">Zaman</th>
                <th className="text-left py-1.5 px-2 font-medium">Kod</th>
                <th className="text-left py-1.5 px-2 font-medium">Sembol</th>
                <th className="text-left py-1.5 px-2 font-medium">Yön</th>
                <th className="text-right py-1.5 px-2 font-medium">Güven</th>
                <th className="text-left py-1.5 px-2 font-medium">Sonuç</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => {
                const isLong = r.direction === 'long'
                const o = r.outcome
                const om = o ? (OUTCOME_META[o.result] || { label: o.result, cls: 'text-gray-400' }) : null
                const pnl = o?.pnlPct
                const pnlCls = pnl > 0 ? 'text-emerald-300' : pnl < 0 ? 'text-rose-300' : 'text-gray-400'
                return (
                  <tr key={(r.code || i) + '-' + i} className="border-b border-dark-800 hover:bg-dark-800/40">
                    <td className="py-1.5 px-2 text-gray-400 whitespace-nowrap">{r.ts ? new Date(r.ts).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td className="py-1.5 px-2 font-mono text-gray-300">{r.code || '—'}</td>
                    <td className="py-1.5 px-2">
                      <span className="text-white font-semibold">{r.symbol}</span>
                      {r.tfs?.length > 0 && <span className="text-gray-600 ml-1">{r.tfs.join(',')}</span>}
                    </td>
                    <td className="py-1.5 px-2"><span className={isLong ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>{isLong ? 'LONG' : 'SHORT'}</span></td>
                    <td className={`py-1.5 px-2 text-right font-mono font-bold ${confColor(r.confidence)}`}>{r.confidence ?? '—'}</td>
                    <td className="py-1.5 px-2">
                      {o ? (
                        <span className={om.cls}>{om.label}{pnl != null && <span className={`ml-1 font-mono ${pnlCls}`}>{pnl > 0 ? '+' : ''}{Number(pnl).toFixed(2)}%</span>}</span>
                      ) : <span className="text-amber-300">açık</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
