/**
 * MT5 Gün-içi Tarayıcı — Borsa Krali (⚡ her dakika, 9 enstrüman × 5 TF)
 *
 * BTC/ETH/XRP/SOL + Altın + Gümüş + EUR/USD + Nasdaq + S&P500 (hepsi forex/CFD
 * fiyatı). Tüm tarama teknikleri + TEMA34 → 0-100 güven notu. Her sinyalde:
 * giriş/SL/TP (MUTLAK, MT5 ile birebir), LOT (broker adımına oturmuş), marj,
 * muhtemel kâr-zarar, MT5 emri. RİSK BÜTÇESİ: günlük %5 / toplam %10 — bütçeyi
 * aşacak işlem verilmez. GÜN-İÇİ: 23:00 sonrası yeni işlem yok, pozisyonlar en
 * geç 23:45'te gün sonu kapanışı; ertesi güne/hafta sonuna taşınmaz.
 * Portföy (vars. 10.000$) KALICI ayardır: değişince backend yeniden tarar,
 * Telegram sinyalleri de yeni portföyle boyutlanır.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  RefreshCw, ChevronDown, ChevronUp, Target, Shield, Info, AlertCircle,
  CheckCircle2, ExternalLink, Clock, Zap, Copy, Check, Gauge, Moon, Lock,
} from 'lucide-react'
import api from '../services/api'

const TFS = ['5m', '15m', '1h', '4h', '1d']
const PORTFOLIO_KEY = 'bk-mt5-portfolio'

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
const TECH_LABELS = { genel: 'Genel Tarama', ema34: 'EMA34', tema34: 'TEMA34', snr: 'Malaysian SNR', smc: 'SMC' }
const STATUS_LABELS = {
  signal: { label: 'Sinyal', cls: 'text-emerald-400' },
  neutral: { label: 'Nötr', cls: 'text-gray-500' },
  low_conf: { label: 'Zayıf', cls: 'text-gray-500' },
  closed: { label: 'Piyasa kapalı', cls: 'text-gray-500' },
  no_data: { label: 'Veri yok', cls: 'text-red-400' },
}
const GATE_LABELS = {
  'window-closed': { label: '⏳ Gün sonu — yeni işlem yok', cls: 'bg-gray-500/10 text-gray-400 border-gray-500/30' },
  'open-exists':   { label: '📌 Pozisyon zaten açık', cls: 'bg-sky-500/10 text-sky-300 border-sky-500/30' },
  conflict:        { label: '🔒 Yön kilidi (ters pozisyon açık)', cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
  cooldown:        { label: '🕒 Bekleme (yeni kapandı)', cls: 'bg-gray-500/10 text-gray-400 border-gray-500/30' },
  'budget-daily':  { label: '🛡 Günlük %5 bütçesi dolu', cls: 'bg-rose-500/10 text-rose-300 border-rose-500/30' },
  'budget-total':  { label: '🛡 Toplam %10 bütçesi dolu', cls: 'bg-rose-500/10 text-rose-300 border-rose-500/30' },
  'no-sizing':     { label: 'Lot hesaplanamadı', cls: 'bg-gray-500/10 text-gray-400 border-gray-500/30' },
}

function fmtPrice(v, p = 4) { return v == null ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: p, maximumFractionDigits: p }) }
function fmtUsd(v, d = 0) { return v == null ? '—' : '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: d }) }
function readPortfolio() { const v = Number(localStorage.getItem(PORTFOLIO_KEY)); return v > 0 ? v : 10000 }

export default function Mt5Sinyalleri() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [tf, setTf] = useState('all')
  const [dirFilter, setDirFilter] = useState('all')
  const [expanded, setExpanded] = useState(null)
  const [equity, setEquity] = useState(readPortfolio)
  const [equityInput, setEquityInput] = useState(String(readPortfolio()))
  const equityRef = useRef(equity)
  equityRef.current = equity

  const load = useCallback(async () => {
    try {
      const r = await api.get('/mt5-scanner/signals')
      setData(r.data)
      // Backend'in KALICI portföyü tek doğru kaynak — inputu senkronla
      if (r.data?.equity > 0) {
        setEquity(r.data.equity); equityRef.current = r.data.equity
        setEquityInput(String(r.data.equity))
        localStorage.setItem(PORTFOLIO_KEY, String(r.data.equity))
      }
    } catch (e) {
      const status = e.response?.status
      if (status === 503) setData({ pending: true })
      else setData({ error: e.response?.data?.error || e.message })
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 60000) // her dk güncellenir (backend cron da her dk)
    return () => clearInterval(t)
  }, [load])

  // Portföy KALICI ayar: backend'e yazılır + sıfırdan tarama tetiklenir →
  // Telegram sinyalleri de yeni portföyle boyutlanır (kullanıcı kuralı).
  const applyEquity = async () => {
    const v = Math.max(100, Math.min(10_000_000, Number(equityInput) || 10000))
    setApplying(true)
    try {
      await api.post('/mt5-scanner/equity', { equity: v })
      setEquity(v); equityRef.current = v
      setEquityInput(String(v))
      localStorage.setItem(PORTFOLIO_KEY, String(v))
      await load()
    } catch (_) {} finally { setApplying(false) }
  }

  const refresh = async () => {
    setRefreshing(true)
    try { await api.post('/mt5-scanner/generate'); await load() }
    catch (_) {} finally { setRefreshing(false) }
  }

  if (loading) return (
    <div className="card p-8 text-center"><RefreshCw className="w-6 h-6 text-gold-400 animate-spin mx-auto mb-2" /><p className="text-sm text-gray-400">MT5 gün-içi sinyalleri yükleniyor...</p></div>
  )
  if (data?.pending) return (
    <div className="card p-8 text-center space-y-3">
      <Clock className="w-8 h-8 text-amber-400 mx-auto" /><h3 className="text-white font-bold">MT5 gün-içi sinyalleri hazırlanıyor</h3>
      <p className="text-xs text-gray-400 max-w-md mx-auto">İlk üretim canlı verileri topluyor (5 TF × 9 enstrüman), birkaç saniye sürer.</p>
      <button onClick={refresh} disabled={refreshing} className="btn-primary inline-flex items-center gap-2 text-sm disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Şimdi üret</button>
    </div>
  )
  if (data?.error) return (
    <div className="card p-6 text-center"><AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-2" /><p className="text-sm text-red-300">{data.error}</p><button onClick={load} className="btn-secondary text-xs mt-3">Tekrar dene</button></div>
  )

  const all = data?.signals || []
  const byTf = tf === 'all' ? all : all.filter(s => s.tf === tf)
  const visible = (dirFilter === 'all' ? byTf : byTf.filter(s => s.direction === dirFilter))
  const tfCount = (t) => (t === 'all' ? all.length : all.filter(s => s.tf === t).length)
  const budget = data?.budget
  const openPositions = data?.openPositions || []

  return (
    <div className="space-y-4">
      {/* ── Başlık + portföy ───────────────────────────────────────────── */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Zap className="w-6 h-6 text-gold-400" />
            <div>
              <h3 className="text-white font-bold flex items-center gap-2 flex-wrap">
                MT5 Gün-içi Tarayıcı
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">⚡ her dk · 9 enstrüman · 5 TF</span>
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {data?.generatedAt ? `Güncellendi: ${new Date(data.generatedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : '—'}
                {data?.counts && ` · ${data.counts.signal} sinyal (${data.counts.executable} verilebilir) · ${openPositions.length} açık pozisyon`}
              </p>
            </div>
          </div>
          <button onClick={refresh} disabled={refreshing} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1 disabled:opacity-50"><RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} /> Yenile</button>
        </div>

        {/* Portföy girişi (KALICI) + kurallar */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Portföy ($) — kalıcı</label>
            <div className="flex items-center gap-1">
              <input type="number" value={equityInput} onChange={e => setEquityInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && applyEquity()}
                className="w-28 bg-dark-800 border border-dark-700 rounded-lg px-2 py-1.5 text-sm text-white font-mono focus:border-gold-500 outline-none" />
              <button onClick={applyEquity} disabled={applying} className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50">{applying ? '...' : 'Uygula'}</button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 flex-1 min-w-[200px]">
            <MiniStat label="Kaldıraç" value="1:100" />
            <MiniStat label="Günlük max" value="%5" tone="amber" />
            <MiniStat label="Toplam max" value="%10" tone="amber" />
          </div>
        </div>

        {/* Risk bütçesi */}
        {budget && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <BudgetBar label="Günlük risk bütçesi" remaining={budget.remainingDailyUsd} cap={budget.dailyCapUsd} />
            <BudgetBar label="Toplam risk bütçesi" remaining={budget.remainingTotalUsd} cap={budget.totalCapUsd} />
          </div>
        )}
        {budget && !budget.windowOpen && (
          <div className="flex items-center gap-2 p-2 bg-gray-500/10 border border-gray-500/30 rounded-lg text-[11px] text-gray-300">
            <Moon className="w-3.5 h-3.5" /> Gün sonu penceresi: 23:00'ten sonra yeni işlem verilmez; açık pozisyonlar 23:45'te kapanış sayılır.
          </div>
        )}

        {/* TF seçici */}
        <div className="grid grid-cols-6 gap-1.5">
          {['all', ...TFS].map(t => (
            <button key={t} onClick={() => { setTf(t); setExpanded(null) }}
              className={`py-2 rounded-lg border text-xs font-bold transition-all ${tf === t ? 'bg-gold-500/15 border-gold-500/50 text-white' : 'bg-dark-800 border-dark-700 text-gray-400 hover:border-dark-600'}`}>
              {t === 'all' ? 'Tümü' : t}<span className="block text-[10px] text-gray-500">{tfCount(t)}</span>
            </button>
          ))}
        </div>

        {/* Yön filtresi */}
        <div className="grid grid-cols-3 gap-2">
          {[{ id: 'all', label: 'Tümü', c: 'gold' }, { id: 'long', label: 'LONG', c: 'emerald' }, { id: 'short', label: 'SHORT', c: 'rose' }].map(f => {
            const n = byTf.filter(s => f.id === 'all' || s.direction === f.id).length
            return (
              <button key={f.id} onClick={() => { setDirFilter(f.id); setExpanded(null) }}
                className={`p-2 rounded-xl border-2 transition-all ${dirFilter === f.id ? `bg-${f.c}-500/15 border-${f.c}-500/50` : 'bg-dark-800 border-dark-700 hover:border-dark-600'}`}>
                <div className="flex items-center justify-between"><span className={`text-sm font-bold ${dirFilter === f.id ? 'text-white' : 'text-gray-300'}`}>{f.label}</span><span className={`text-lg font-bold ${dirFilter === f.id ? `text-${f.c}-300` : 'text-gray-500'}`}>{n}</span></div>
              </button>
            )
          })}
        </div>

        <div className="flex items-start gap-2 p-2.5 bg-blue-500/5 border border-blue-500/20 rounded-lg text-[11px]">
          <Info className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
          <p className="text-gray-400 leading-relaxed">
            <span className="text-white">GÜN-İÇİ kurallar:</span> her pozisyon aynı gün kapanır (en geç <span className="text-white">23:45</span>), hafta sonuna taşınmaz.
            Tüm teknikler (<span className="text-white">Genel Tarama, EMA34, TEMA34, Malaysian SNR, SMC</span>) 5 zaman diliminde ayrı ayrı uygulanır; <span className="text-white">lot</span> broker adımına (0.01) oturur, MT5'te aynen açılır.
            <span className="text-white"> Günlük %5 / toplam %10</span> zarar bütçesini aşacak hiçbir işlem verilmez. Verilen işlemler Telegram + uygulama bildirimi olarak gider.
          </p>
        </div>
      </div>

      {/* ── Açık pozisyonlar ────────────────────────────────────────────── */}
      {openPositions.length > 0 && (
        <div className="card p-3 space-y-2">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Açık Pozisyonlar ({openPositions.length})</div>
          <div className="space-y-1.5">
            {openPositions.map(p => (
              <div key={p.code} className="flex items-center gap-2 flex-wrap text-[11px] p-2 rounded-lg bg-dark-800/60 border border-dark-700">
                <span className="font-bold text-white">#{p.code}</span>
                <span className="text-gray-300">{p.symbol}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-dark-700 text-gray-300 font-mono">{p.tf}</span>
                <span className={`px-1.5 py-0.5 rounded-full border text-[10px] font-bold ${p.direction === 'long' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' : 'text-rose-400 bg-rose-500/10 border-rose-500/30'}`}>{p.direction === 'long' ? '↑ LONG' : '↓ SHORT'}</span>
                <span className="text-gray-400">Lot <span className="text-white font-mono">{p.lots}</span></span>
                <span className="text-gray-400">Giriş <span className="text-white font-mono">{fmtPrice(p.entry, p.precision)}</span></span>
                <span className="text-rose-300 font-mono">SL {fmtPrice(p.stop, p.precision)}</span>
                <span className="text-emerald-300 font-mono">TP1 {fmtPrice(p.target1, p.precision)}</span>
                <span className="text-gray-500 ml-auto">risk {fmtUsd(p.riskUsd)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Sinyal listesi ──────────────────────────────────────────────── */}
      {visible.length === 0 ? (
        <div className="card p-6 text-center"><p className="text-sm text-gray-400">Bu filtrede uygun sinyal yok.</p><p className="text-xs text-gray-500 mt-1">Her dakika yeniden taranır.</p></div>
      ) : (
        <div className="space-y-2">
          {visible.map((s) => (
            <Mt5Card key={`${s.id}-${s.tf}`} sig={s} expanded={expanded === `${s.id}-${s.tf}`} onToggle={() => setExpanded(expanded === `${s.id}-${s.tf}` ? null : `${s.id}-${s.tf}`)} />
          ))}
        </div>
      )}

      {/* ── Durum şeridi ────────────────────────────────────────────────── */}
      {data?.instruments?.length > 0 && (
        <div className="card p-3">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Enstrümanlar (canlı fiyat: {data.instruments.some(i => i.priceSource === 'broker') ? 'broker + Yahoo' : 'Yahoo'})</div>
          <div className="flex flex-wrap gap-1.5">
            {data.instruments.map(i => {
              const st = STATUS_LABELS[i.status] || STATUS_LABELS.neutral
              const sigN = i.perTf ? Object.values(i.perTf).filter(x => x?.status === 'signal').length : 0
              return (
                <span key={i.id} className="text-[10px] px-2 py-0.5 rounded-full bg-dark-800 border border-dark-700">
                  <span className="text-gray-300">{i.symbol}</span>{' '}
                  <span className={st.cls}>{i.status === 'open' ? `${sigN} sinyal` : st.label}</span>
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
  return (<div className="p-2 rounded-lg bg-dark-800 border border-dark-700 text-center"><div className="text-[9px] text-gray-500 uppercase tracking-wider">{label}</div><div className={`text-sm font-bold ${tone === 'amber' ? 'text-amber-300' : 'text-white'}`}>{value}</div></div>)
}

function BudgetBar({ label, remaining, cap }) {
  const pct = cap > 0 ? Math.max(0, Math.min(100, (remaining / cap) * 100)) : 0
  const color = pct > 50 ? 'bg-emerald-500' : pct > 20 ? 'bg-amber-500' : 'bg-rose-500'
  return (
    <div className="p-2 rounded-lg bg-dark-800 border border-dark-700">
      <div className="flex items-center justify-between text-[10px] mb-1">
        <span className="text-gray-500 uppercase tracking-wider">{label}</span>
        <span className="text-gray-300 font-mono">{fmtUsd(remaining)} / {fmtUsd(cap)}</span>
      </div>
      <div className="w-full h-1.5 bg-dark-700 rounded-full overflow-hidden"><div className={`h-full ${color}`} style={{ width: `${pct}%` }} /></div>
    </div>
  )
}

function confColor(c) { return c >= 75 ? 'text-emerald-300' : c >= 60 ? 'text-sky-300' : c >= 45 ? 'text-amber-300' : 'text-gray-400' }
function confBar(c) { return c >= 75 ? 'bg-emerald-500' : c >= 60 ? 'bg-sky-500' : c >= 45 ? 'bg-amber-500' : 'bg-gray-500' }

// ─── Sinyal kartı ─────────────────────────────────────────────────────────
function Mt5Card({ sig, expanded, onToggle }) {
  const [copied, setCopied] = useState(false)
  const isLong = sig.direction === 'long'
  const p = sig.precision ?? 4
  const dir = isLong ? { label: '↑ LONG', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' } : { label: '↓ SHORT', cls: 'text-rose-400 bg-rose-500/10 border-rose-500/30' }
  const classMeta = CLASS_META[sig.class] || CLASS_META.fx
  const z = sig.sizing || {}, pnl = sig.pnl || {}
  const gate = sig.riskGate
  const gateMeta = gate && !gate.ok ? (GATE_LABELS[gate.reason] || { label: gate.reason, cls: 'bg-gray-500/10 text-gray-400 border-gray-500/30' }) : null

  const copyMt5 = (e) => {
    e.stopPropagation()
    const txt = sig.mt5?.summary || ''
    try { navigator.clipboard.writeText(txt); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch (_) {}
  }

  const condsByTech = {}
  for (const c of (sig.conditions || [])) (condsByTech[c.technique] = condsByTech[c.technique] || []).push(c)

  return (
    <div className={`card border-2 ${expanded ? 'border-gold-500/40' : 'border-dark-700'} transition-colors`}>
      <div className="cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-bold text-white">{sig.symbol}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-dark-700 text-gray-300 font-mono">{sig.tf}</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${classMeta.cls}`}>{classMeta.label}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${dir.cls}`}>{dir.label}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${GRADE_STYLES[sig.grade] || GRADE_STYLES.ZAYIF}`}>{sig.grade}</span>
              {gate?.ok
                ? <span className="text-[10px] px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-300 border-emerald-500/30 inline-flex items-center gap-1"><CheckCircle2 className="w-2.5 h-2.5" />verilebilir</span>
                : gateMeta && <span className={`text-[10px] px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${gateMeta.cls}`}><Lock className="w-2.5 h-2.5" />{gateMeta.label}</span>}
              {sig.historicalWinRate != null && (
                <span title={`Backtest geçmiş başarı: %${sig.historicalWinRate} (${sig.sampleSize} örnek)`} className="text-[10px] px-2 py-0.5 rounded-full border bg-violet-500/10 text-violet-300 border-violet-500/30">📊 %{sig.historicalWinRate}</span>
              )}
            </div>
            <p className="text-[10px] text-gray-500 truncate mt-0.5">{sig.name} · R/R {sig.rr1} · GÜN-İÇİ · {sig.sameTfCount}/5 TF uyum</p>
          </div>
          {/* Güven notu */}
          <div className="flex flex-col items-end flex-shrink-0 w-16">
            <div className="flex items-center gap-1"><Gauge className="w-3 h-3 text-gray-500" /><span className={`text-xl font-bold leading-none ${confColor(sig.confidence)}`}>{sig.confidence}</span></div>
            <div className="text-[8px] text-gray-500 mt-0.5">GÜVEN /100</div>
            <div className="w-14 h-1 bg-dark-700 rounded-full mt-1 overflow-hidden"><div className={`h-full ${confBar(sig.confidence)}`} style={{ width: `${sig.confidence}%` }} /></div>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>

        {/* Seviyeler + LOT (ön planda — kullanıcı isteği) */}
        <div className="flex items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-gray-400 flex-wrap">
          <span className="text-gold-300 font-bold">Lot: <span className="font-mono">{z.lots}</span></span>
          <span className="flex items-center gap-1"><Target className="w-3 h-3" />Giriş: <span className="text-white font-mono">{fmtPrice(sig.entry, p)}</span></span>
          <span className="text-rose-300">SL: <span className="font-mono">{fmtPrice(sig.stop, p)}</span></span>
          <span className="text-emerald-300">TP1: <span className="font-mono">{fmtPrice(sig.target1, p)}</span></span>
          <span className="text-emerald-200">TP2: <span className="font-mono">{fmtPrice(sig.target2, p)}</span></span>
        </div>

        {/* Plan + risk */}
        <div className="mt-2 flex items-center gap-x-3 gap-y-1 text-[11px] flex-wrap">
          <span className="text-gray-400">Marj: {fmtUsd(z.requiredMarginUsd)} ({z.marginPct}%)</span>
          <span className="text-rose-300 flex items-center gap-1"><Shield className="w-3 h-3" />Risk: {fmtUsd(z.riskUsd, 0)} ({z.riskPct}%)</span>
          <span className="text-emerald-300">TP1: +{fmtUsd(pnl.tp1ProfitUsd)}</span>
          <span className="text-emerald-200">TP2: +{fmtUsd(pnl.tp2ProfitUsd)}</span>
          <span className="text-rose-300">SL: -{fmtUsd(pnl.slLossUsd)}</span>
        </div>
      </div>

      {/* Açılır panel */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-dark-700 space-y-3">
          {/* MT5 emir bloğu */}
          {sig.mt5 && (
          <div className="rounded-lg p-3 border border-gold-500/30 bg-gold-500/5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-gold-300"><span>🖥</span> MetaTrader5 Emri</div>
              <button onClick={copyMt5} className="text-[10px] flex items-center gap-1 px-2 py-1 rounded bg-dark-800 hover:bg-dark-700 text-gray-300">{copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}{copied ? 'Kopyalandı' : 'Kopyala'}</button>
            </div>
            <div className="font-mono text-[11px] text-white bg-dark-900/60 rounded p-2 leading-relaxed">
              <div><span className={isLong ? 'text-emerald-400' : 'text-rose-400'}>{sig.mt5?.type}</span> {sig.mt5?.symbol} · <span className="text-gold-300">{z.lots} lot</span> @ PİYASA</div>
              <div className="text-gray-400">SL {fmtPrice(sig.stop, p)} · TP1 {fmtPrice(sig.target1, p)} · TP2 {fmtPrice(sig.target2, p)}</div>
            </div>
            <p className="text-[10px] text-gray-500">Gün-içi işlem: en geç 23:45'te kapat (gün sonu kuralı).</p>
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
            <KV label="Lot (MT5)" value={`${z.lots} (kontrat ${Number(z.contractSize || 1).toLocaleString('en-US')})`} />
            <KV label="Miktar" value={`${Number(z.units).toLocaleString('en-US')} ${z.unitLabel || ''}`} />
            <KV label="Notional" value={fmtUsd(z.notionalUsd)} />
            <KV label="Gerekli marj" value={`${fmtUsd(z.requiredMarginUsd)} (${z.marginPct}%)`} />
            <KV label="Max zarar (SL)" value={`-${fmtUsd(pnl.slLossUsd, 0)} (%${z.riskPct})`} tone="rose" />
            <KV label="Kâr TP1 / TP2" value={`+${fmtUsd(pnl.tp1ProfitUsd)} / +${fmtUsd(pnl.tp2ProfitUsd)}`} tone="emerald" />
          </div>

          {/* Güven kırılımı */}
          <div className="rounded-lg p-2.5 border border-sky-500/20 bg-sky-500/5 text-[11px] space-y-1.5">
            <div className="flex items-center justify-between"><span className="text-gray-300 font-semibold flex items-center gap-1"><Gauge className="w-3.5 h-3.5 text-sky-400" />Güven Notu: <span className={confColor(sig.confidence)}>{sig.confidence}/100</span> ({sig.grade})</span></div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-gray-400">
              <span>Uzlaşı: <span className="text-white">{Math.round((sig.consensus || 0) * 100)}%</span></span>
              <span>TF uyum: <span className="text-white">{sig.sameTfCount}/5</span></span>
              <span>Ort. teknik skor: <span className="text-white">{sig.avgVoteScore}</span></span>
              {sig.historicalWinRate != null
                ? <span title={sig.historyBand === 'all' ? 'Tüm güven bantları' : `${sig.historyBand} bandı`}>📊 Geçmiş başarı: <span className="text-white">%{sig.historicalWinRate}</span> ({sig.sampleSize} örnek{sig.historicalAvgReturn != null ? `, ort ${sig.historicalAvgReturn}%` : ''})</span>
                : <span className="text-gray-500">📊 Geçmiş başarı: veri toplanıyor</span>}
            </div>
            {/* Teknik oyları */}
            <div className="flex flex-wrap gap-1 pt-1">
              {(sig.votes || []).map(v => (
                <span key={v.technique} title={`${TECH_LABELS[v.technique] || v.technique}: ${v.score}`}
                  className={`text-[9px] px-1.5 py-0.5 rounded border ${v.vote === 'long' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : v.vote === 'short' ? 'bg-rose-500/10 text-rose-300 border-rose-500/30' : 'bg-gray-500/10 text-gray-500 border-gray-500/20'}`}>
                  {TECH_LABELS[v.technique] || v.technique}: {v.vote === 'long' ? 'AL' : v.vote === 'short' ? 'SAT' : '—'}
                </span>
              ))}
            </div>
          </div>

          {/* Koşullar (teknik bazlı) */}
          {Object.keys(condsByTech).length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">Geçen Koşullar</div>
              {Object.entries(condsByTech).map(([tech, conds]) => (
                <div key={tech}>
                  <div className="text-[10px] text-gray-500 mb-1">{TECH_LABELS[tech] || tech}</div>
                  <div className="flex flex-wrap gap-1">
                    {conds.map((c, i) => (
                      <span key={c.id + i} className="text-[10px] px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-300 border-emerald-500/30 inline-flex items-center gap-1"><CheckCircle2 className="w-2.5 h-2.5" />{c.label}</span>
                    ))}
                  </div>
                </div>
              ))}
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
