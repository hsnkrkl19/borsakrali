/**
 * 🥇 ALTIN — XAU/USD Çoklu Zaman Dilimi Sistemi (Borsa Krali)
 *
 * Tek enstrüman (XAU/USD) için katmanlı çoklu-TF sinyal sistemi. Haftalıkta YÖN
 * analizi (yön motoru) yapılır; günlük / 8h / 4h / 1h zaman dilimlerinde net
 * sinyaller, 15m / 5m / 1m üzerinde ise düşük güvenli fırsat/scalp katmanı üretilir.
 * Her TF için destek/direnç seviyeleri + fraktal kırılımı izlenir; çıktı backtest
 * ile doğrulanır.
 *
 * 3 alt-görünüm:
 *   1) Canlı            — GET /altin/signals   ·  POST /altin/generate
 *   2) Açık Pozisyonlar — GET /altin/performance
 *   3) Backtest         — GET /altin/backtest
 *
 * Backend: /api/altin
 */

import { useCallback, useEffect, useState } from 'react'
import {
  RefreshCw, Target, Shield, Info, AlertCircle, Clock, Gauge, BarChart3,
  Activity, Coins, TrendingUp, TrendingDown, Minus, Unlock, Lock,
} from 'lucide-react'
import api from '../services/api'

const TF_LABELS = {
  '1d': 'Günlük', '8h': '8 Saat', '4h': '4 Saat', '1h': '1 Saat',
  '15m': '15 Dakika', '5m': '5 Dakika', '1m': '1 Dakika',
}
// Sinyal katmanı: core (1d-1h net) vs scalp/fırsat (15m-1m düşük güven)
const SCALP_TFS = new Set(['15m', '5m', '1m'])

function fmtPrice(v, p = 2) {
  return v == null ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: p, maximumFractionDigits: p })
}
function fmtPct(v, d = 2) { return v == null ? '—' : `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(d)}%` }
function fmtTime(v) {
  if (!v) return '—'
  try { return new Date(v).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return '—' }
}
function confColor(c) { return c >= 75 ? 'text-emerald-300' : c >= 60 ? 'text-sky-300' : c >= 45 ? 'text-amber-300' : 'text-gray-400' }
function confBar(c) { return c >= 75 ? 'bg-emerald-500' : c >= 60 ? 'bg-sky-500' : c >= 45 ? 'bg-amber-500' : 'bg-gray-500' }

const SUBVIEWS = [
  { id: 'canli', label: 'Canlı', icon: Activity },
  { id: 'acik', label: 'Açık Pozisyonlar', icon: BarChart3 },
  { id: 'backtest', label: 'Backtest', icon: Target },
]

export default function AltinSinyalleri() {
  const [view, setView] = useState('canli')

  return (
    <div className="space-y-4">
      {/* ── Başlık ─────────────────────────────────────────────────────── */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Coins className="w-6 h-6 text-gold-400" />
          <div>
            <h3 className="text-white font-bold flex items-center gap-2 flex-wrap">
              🥇 Altın — XAU/USD Çoklu Zaman Dilimi
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">XAU/USD · 1m–1d</span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">Haftalıkta yön → günlük/8h/4h/1h sinyaller + 15m/5m/1m fırsat katmanı · backtest doğrulamalı</p>
          </div>
        </div>

        <div className="flex items-start gap-2 p-2.5 bg-blue-500/5 border border-blue-500/20 rounded-lg text-[11px]">
          <Info className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
          <p className="text-gray-400 leading-relaxed">
            <span className="text-white">XAU/USD çoklu zaman dilimi</span> sistemi. Haftalıkta <span className="text-white">YÖN analizi</span> yapılır
            (yön motoru) → günlük / 8h / 4h / 1h üzerinde net sinyaller, 15m / 5m / 1m üzerinde ise düşük güvenli
            <span className="text-white"> fırsat / scalp</span> katmanı üretilir. Her TF için <span className="text-white">destek/direnç + fraktal kırılımı</span> izlenir.
            Çıktı <span className="text-white">backtest</span> ile doğrulanır.
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

      {view === 'canli' && <CanliView />}
      {view === 'acik' && <OpenPositionsView />}
      {view === 'backtest' && <BacktestView />}
    </div>
  )
}

function MiniStat({ label, value, tone }) {
  return (<div className="p-2 rounded-lg bg-dark-800 border border-dark-700 text-center"><div className="text-[9px] text-gray-500 uppercase tracking-wider">{label}</div><div className={`text-sm font-bold ${tone === 'amber' ? 'text-amber-300' : tone === 'emerald' ? 'text-emerald-300' : tone === 'rose' ? 'text-rose-300' : 'text-white'}`}>{value}</div></div>)
}

// ════════════════════════════════════════════════════════════════════════════
// 1) CANLI  — GET /altin/signals  ·  POST /altin/generate
// ════════════════════════════════════════════════════════════════════════════
const ALL_TFS = ['1d', '8h', '4h', '1h', '15m', '5m', '1m']

function CanliView() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await api.get('/altin/signals')
      setData(r.data)
    } catch (e) {
      const status = e.response?.status
      if (status === 503) setData({ pending: true })
      else setData({ error: e.response?.data?.error || e.message })
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 60000) // her 60sn güncellenir
    return () => clearInterval(t)
  }, [load])

  const refresh = async () => {
    setRefreshing(true)
    try { await api.post('/altin/generate'); await load() }
    catch (_) {} finally { setRefreshing(false) }
  }

  if (loading) return (
    <div className="card p-8 text-center"><RefreshCw className="w-6 h-6 text-gold-400 animate-spin mx-auto mb-2" /><p className="text-sm text-gray-400">Altın sinyalleri yükleniyor...</p></div>
  )
  if (data?.pending) return (
    <div className="card p-8 text-center space-y-3">
      <Clock className="w-8 h-8 text-amber-400 mx-auto" /><h3 className="text-white font-bold">Altın sistemi hazırlanıyor</h3>
      <p className="text-xs text-gray-400 max-w-md mx-auto">İlk üretim Yahoo verilerini topluyor (7 TF × XAU/USD), birkaç saniye sürer.</p>
      <button onClick={refresh} disabled={refreshing} className="btn-primary inline-flex items-center gap-2 text-sm disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Şimdi üret</button>
    </div>
  )
  if (data?.error) return (
    <div className="card p-6 text-center"><AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-2" /><p className="text-sm text-red-300">{data.error}</p><button onClick={load} className="btn-secondary text-xs mt-3">Tekrar dene</button></div>
  )

  const bias = data?.bias || {}
  const perTf = data?.perTf || {}
  const tfs = (data?.tfs && data.tfs.length ? data.tfs : ALL_TFS)
  const counts = data?.counts || {}
  const srBreaks = data?.srBreaks || []
  const biasDirLabel = bias.tradeBias || (bias.dir === 'bull' ? 'long' : bias.dir === 'bear' ? 'short' : 'nötr')

  return (
    <div className="space-y-4">
      {/* Üst bilgi + yenile */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-xs text-gray-500">
            {data?.generatedAt ? `Güncellendi: ${new Date(data.generatedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : '—'}
            {` · ${data?.symbol || 'XAU/USD'}`}
          </p>
          <button onClick={refresh} disabled={refreshing} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1 disabled:opacity-50"><RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} /> Yenile</button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MiniStat label="Toplam sinyal" value={counts.signals ?? (data?.signals?.length ?? 0)} tone="emerald" />
          <MiniStat label="Long" value={counts.long ?? '—'} tone="emerald" />
          <MiniStat label="Short" value={counts.short ?? '—'} tone="rose" />
          <MiniStat label="Scalp / fırsat" value={counts.scalp ?? '—'} tone="amber" />
        </div>
      </div>

      {/* ── BIAS BANNER — Yön Motoru (haftalık) ──────────────────────── */}
      <BiasBanner bias={bias} biasDirLabel={biasDirLabel} />

      {/* ── Son kırılımlar şeridi ────────────────────────────────────── */}
      {srBreaks.length > 0 && (
        <div className="card p-3 space-y-2">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
            <Activity className="w-3 h-3" /> Son Kırılımlar
          </div>
          <div className="flex flex-wrap gap-1.5">
            {srBreaks.slice(0, 12).map((b, i) => {
              const broke = b.type === 'resistance'
              return (
                <span key={(b.tf || i) + '-' + (b.level ?? i) + '-' + i}
                  className={`text-[10px] px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${broke ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/10 text-rose-300 border-rose-500/30'}`}
                  title={b.breakTime ? fmtTime(b.breakTime) : ''}>
                  {broke ? <Unlock className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                  <span className="font-mono text-gray-400">{b.tf}</span>
                  {broke ? 'Direnç' : 'Destek'} @{fmtPrice(b.level)}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Per-TF kart ızgarası ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {tfs.map(tf => (
          <TfCard key={tf} tf={tf} entry={perTf[tf]} biasDirLabel={biasDirLabel} />
        ))}
      </div>
    </div>
  )
}

// ─── Bias banner (yön motoru) ───────────────────────────────────────────────
function BiasBanner({ bias, biasDirLabel }) {
  const dir = bias.dir || 'neutral'
  const meta = dir === 'bull'
    ? { label: 'BOĞA', cls: 'border-emerald-500/40 bg-emerald-500/10', text: 'text-emerald-300', bar: 'bg-emerald-500', Icon: TrendingUp }
    : dir === 'bear'
    ? { label: 'AYI', cls: 'border-rose-500/40 bg-rose-500/10', text: 'text-rose-300', bar: 'bg-rose-500', Icon: TrendingDown }
    : { label: 'NÖTR', cls: 'border-gray-600/40 bg-gray-500/10', text: 'text-gray-300', bar: 'bg-gray-500', Icon: Minus }
  const strengthPct = Math.round(Math.max(0, Math.min(1, bias.strength || 0)) * 100)
  const weekly = bias.weekly || {}
  const daily = bias.daily || {}
  const alignMeta = {
    'tam': 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
    'kısmi': 'text-amber-300 border-amber-500/30 bg-amber-500/10',
    'belirsiz': 'text-gray-400 border-gray-500/30 bg-gray-500/10',
  }[bias.alignment] || 'text-gray-400 border-gray-500/30 bg-gray-500/10'

  return (
    <div className={`card border-2 ${meta.cls} p-4 space-y-3`}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <meta.Icon className={`w-6 h-6 ${meta.text}`} />
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wider">Yön Motoru (Haftalık)</div>
            <div className={`text-xl font-bold leading-none ${meta.text}`}>{meta.label}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${alignMeta}`}>Uyum: {bias.alignment || 'belirsiz'}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full border bg-dark-800 border-dark-700 text-gray-300">
            İşlem yönü: <span className={biasDirLabel === 'long' ? 'text-emerald-300' : biasDirLabel === 'short' ? 'text-rose-300' : 'text-gray-400'}>{biasDirLabel}</span>
          </span>
        </div>
      </div>

      {/* Güç çubuğu */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] text-gray-500">
          <span>Yön gücü</span><span className={meta.text}>{strengthPct}%</span>
        </div>
        <div className="w-full h-2 bg-dark-700 rounded-full overflow-hidden">
          <div className={`h-full ${meta.bar}`} style={{ width: `${strengthPct}%` }} />
        </div>
      </div>

      {/* Haftalık gerekçe + detay */}
      {(weekly.reason || weekly.close != null || daily.dir) && (
        <div className="space-y-1.5 text-[11px]">
          {weekly.reason && <p className="text-gray-300 leading-relaxed">{weekly.reason}</p>}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-gray-400">
            {weekly.close != null && <span>Haftalık kapanış: <span className="text-white font-mono">{fmtPrice(weekly.close)}</span></span>}
            {weekly.ema100 != null && <span>EMA100: <span className="text-white font-mono">{fmtPrice(weekly.ema100)}</span></span>}
            {weekly.distPct != null && <span>EMA mesafe: <span className="text-white font-mono">{fmtPct(weekly.distPct)}</span></span>}
            {weekly.slopePct != null && <span>Eğim: <span className="text-white font-mono">{fmtPct(weekly.slopePct)}</span></span>}
            {daily.dir && <span>Günlük: <span className={daily.dir === 'bull' ? 'text-emerald-300' : daily.dir === 'bear' ? 'text-rose-300' : 'text-gray-400'}>{daily.dir}</span>{daily.ema50 != null ? <span className="text-gray-500"> (EMA50 {fmtPrice(daily.ema50)})</span> : null}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Per-TF kart ────────────────────────────────────────────────────────────
function TfCard({ tf, entry, biasDirLabel }) {
  const sr = entry?.sr || {}
  const signals = (entry?.signals || []).slice().sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
  const sig = signals[0] || null
  const lastClose = entry?.lastClose ?? sr.lastClose
  const isScalpTf = SCALP_TFS.has(tf)
  const lastBreak = sr.lastBreak || null

  return (
    <div className={`card border ${isScalpTf ? 'border-dark-700' : 'border-dark-600'} p-3 space-y-2.5`}>
      {/* Başlık satırı */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white font-mono">{tf}</span>
          <span className="text-[10px] text-gray-500">{TF_LABELS[tf] || tf}</span>
          {isScalpTf && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">FIRSAT</span>}
        </div>
        <span className="text-[11px] text-gray-400">Kapanış: <span className="text-white font-mono">{fmtPrice(lastClose)}</span></span>
      </div>

      {/* Sinyal varsa */}
      {sig ? (
        <SignalBlock sig={sig} isScalpTf={isScalpTf} />
      ) : (
        <div className="text-[11px] text-gray-500 p-2 rounded-lg bg-dark-800/50 border border-dark-700">
          Sinyal bekleniyor — yön: <span className={biasDirLabel === 'long' ? 'text-emerald-300' : biasDirLabel === 'short' ? 'text-rose-300' : 'text-gray-400'}>{biasDirLabel}</span>
        </div>
      )}

      {/* Destek / Direnç + son kırılım */}
      <div className="space-y-1.5 text-[11px]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-rose-300 flex items-center gap-1">
            <Lock className="w-3 h-3" /> Destek:
            <span className="font-mono text-white">{sr.nearestSupport ? fmtPrice(sr.nearestSupport.price) : '—'}</span>
            {sr.nearestSupport?.distPct != null && <span className="text-gray-500">({fmtPct(sr.nearestSupport.distPct)})</span>}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-emerald-300 flex items-center gap-1">
            <Unlock className="w-3 h-3" /> Direnç:
            <span className="font-mono text-white">{sr.nearestResistance ? fmtPrice(sr.nearestResistance.price) : '—'}</span>
            {sr.nearestResistance?.distPct != null && <span className="text-gray-500">({fmtPct(sr.nearestResistance.distPct)})</span>}
          </span>
        </div>
        {lastBreak && (
          <div className={`flex items-center gap-1 ${lastBreak.type === 'resistance' ? 'text-emerald-300' : 'text-rose-300'}`}>
            {lastBreak.type === 'resistance' ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
            {lastBreak.type === 'resistance' ? '🔓 Direnç kırıldı' : '🔒 Destek kırıldı'} @{fmtPrice(lastBreak.level)}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tek sinyal bloğu (kart içi) ────────────────────────────────────────────
function SignalBlock({ sig, isScalpTf }) {
  const isLong = sig.action === 'LONG'
  const dirCls = isLong ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' : 'text-rose-400 bg-rose-500/10 border-rose-500/30'
  const isScalp = sig.scalp || isScalpTf
  const c = sig.confidence ?? 0

  return (
    <div className={`rounded-lg p-2.5 border ${isLong ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-rose-500/20 bg-rose-500/5'} space-y-2`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[11px] px-2 py-0.5 rounded-full border font-bold ${dirCls}`}>{isLong ? '🟢⬆️ LONG' : '🔴⬇️ SHORT'}</span>
          {sig.label && <span className="text-[10px] text-gray-300">{sig.label}</span>}
          {isScalp && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30" title="Düşük güvenli fırsat/scalp katmanı">
              ⚠️ SCALP/fırsat — düşük güven
            </span>
          )}
        </div>
        <div className="flex flex-col items-end">
          <div className="flex items-center gap-1"><Gauge className="w-3 h-3 text-gray-500" /><span className={`text-base font-bold leading-none ${confColor(c)}`}>{c}</span><span className="text-[8px] text-gray-500">/100</span></div>
          {sig.wrEst != null && <span className="text-[9px] text-gray-500">WR ~%{sig.wrEst}</span>}
        </div>
      </div>

      {/* Güven çubuğu */}
      <div className="w-full h-1 bg-dark-700 rounded-full overflow-hidden"><div className={`h-full ${confBar(c)}`} style={{ width: `${c}%` }} /></div>

      {/* Seviyeler */}
      <div className="flex items-center gap-x-3 gap-y-1 text-[11px] text-gray-400 flex-wrap">
        <span className="flex items-center gap-1"><Target className="w-3 h-3" />Giriş: <span className="text-white font-mono">{fmtPrice(sig.entry)}</span></span>
        <span className="text-rose-300 flex items-center gap-1"><Shield className="w-3 h-3" />SL: <span className="font-mono">{fmtPrice(sig.stop)}</span></span>
        <span className="text-emerald-300">TP: <span className="font-mono">{fmtPrice(sig.target)}</span></span>
        {sig.rr != null && <span className="text-sky-300">R/R: <span className="font-mono">{Number(sig.rr).toFixed(2)}</span></span>}
      </div>

      {sig.srNote && <p className="text-[10px] text-gray-500 leading-relaxed">{sig.srNote}</p>}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// 2) AÇIK POZİSYONLAR  — GET /altin/performance
// ════════════════════════════════════════════════════════════════════════════
function OpenPositionsView() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await api.get('/altin/performance')
      setData(r.data)
    } catch (e) { setError(e.response?.data?.error || e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="card p-8 text-center"><RefreshCw className="w-6 h-6 text-gold-400 animate-spin mx-auto mb-2" /><p className="text-sm text-gray-400">Açık pozisyonlar yükleniyor...</p></div>
  if (error) return <div className="card p-6 text-center"><AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-2" /><p className="text-sm text-red-300">{error}</p><button onClick={load} className="btn-secondary text-xs mt-3">Tekrar dene</button></div>

  const open = data?.open || []
  const stats = data?.stats || {}
  const overall = stats.overall || {}

  return (
    <div className="space-y-4">
      {/* Özet */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h4 className="text-white font-bold flex items-center gap-2"><BarChart3 className="w-4 h-4 text-gold-400" /> Açık Pozisyonlar (Çoklu Bot)</h4>
          <button onClick={load} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Yenile</button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MiniStat label="Açık pozisyon" value={open.length} tone="amber" />
          <MiniStat label="Toplam açılan" value={overall.totalOpened ?? overall.opened ?? '—'} />
          <MiniStat label="Kapanan" value={overall.totalClosed ?? overall.closed ?? '—'} />
          <MiniStat label="Genel WR" value={overall.winRate != null ? `%${Math.round((overall.winRate || 0) * 100)}` : (overall.n ? `%${Math.round(((overall.win || 0) / overall.n) * 100)}` : '—')} tone="emerald" />
        </div>
      </div>

      {/* Açık pozisyon tablosu */}
      <div className="card p-4 space-y-2">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider">Yaşayan Pozisyonlar — her TF kendi botu</div>
        {open.length === 0 ? (
          <p className="text-xs text-gray-500 py-4 text-center">Şu an açık pozisyon yok — sinyal üretildikçe burada listelenir.</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-gray-500 uppercase tracking-wider text-[9px] border-b border-dark-700">
                  <th className="text-left py-1.5 px-2 font-medium">Kod</th>
                  <th className="text-left py-1.5 px-2 font-medium">TF</th>
                  <th className="text-left py-1.5 px-2 font-medium">Yön</th>
                  <th className="text-right py-1.5 px-2 font-medium">Giriş</th>
                  <th className="text-right py-1.5 px-2 font-medium">SL</th>
                  <th className="text-right py-1.5 px-2 font-medium">TP</th>
                  <th className="text-right py-1.5 px-2 font-medium">Güven</th>
                  <th className="text-right py-1.5 px-2 font-medium">Anlık %</th>
                  <th className="text-left py-1.5 px-2 font-medium">Açılış</th>
                </tr>
              </thead>
              <tbody>
                {open.map((o, i) => {
                  const isLong = o.direction === 'long' || o.direction === 'LONG'
                  const upnl = o.unrealizedPct
                  const upnlCls = upnl > 0 ? 'text-emerald-300' : upnl < 0 ? 'text-rose-300' : 'text-gray-400'
                  return (
                    <tr key={(o.code || i) + '-' + i} className="border-b border-dark-800 hover:bg-dark-800/40">
                      <td className="py-1.5 px-2 font-mono text-gray-300">{o.code || '—'}</td>
                      <td className="py-1.5 px-2 font-mono text-gray-400">{o.tf || '—'}</td>
                      <td className="py-1.5 px-2"><span className={isLong ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>{isLong ? '🟢⬆️ LONG' : '🔴⬇️ SHORT'}</span></td>
                      <td className="py-1.5 px-2 text-right font-mono text-white">{fmtPrice(o.entry)}</td>
                      <td className="py-1.5 px-2 text-right font-mono text-rose-300">{fmtPrice(o.stop)}</td>
                      <td className="py-1.5 px-2 text-right font-mono text-emerald-300">{fmtPrice(o.target)}</td>
                      <td className={`py-1.5 px-2 text-right font-mono font-bold ${confColor(o.confidence)}`}>{o.confidence ?? '—'}</td>
                      <td className={`py-1.5 px-2 text-right font-mono font-bold ${upnlCls}`}>{upnl != null ? fmtPct(upnl) : '—'}</td>
                      <td className="py-1.5 px-2 text-gray-400 whitespace-nowrap">{fmtTime(o.issuedAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// 3) BACKTEST  — GET /altin/backtest
// ════════════════════════════════════════════════════════════════════════════
function BacktestView() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await api.get('/altin/backtest')
      setData(r.data)
    } catch (e) { setError(e.response?.data?.error || e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="card p-8 text-center"><RefreshCw className="w-6 h-6 text-gold-400 animate-spin mx-auto mb-2" /><p className="text-sm text-gray-400">Backtest yükleniyor...</p></div>
  if (error) return <div className="card p-6 text-center"><AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-2" /><p className="text-sm text-red-300">{error}</p><button onClick={load} className="btn-secondary text-xs mt-3">Tekrar dene</button></div>

  const perTf = data?.perTf || {}
  const tfOrder = ALL_TFS.filter(tf => perTf[tf])
  const otherTfs = Object.keys(perTf).filter(tf => !ALL_TFS.includes(tf))
  const allTfs = [...tfOrder, ...otherTfs]

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h4 className="text-white font-bold flex items-center gap-2"><Target className="w-4 h-4 text-gold-400" /> Backtest Doğrulaması</h4>
          <button onClick={load} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Yenile</button>
        </div>
        {data?.generatedAt && <p className="text-[10px] text-gray-500">Güncellendi: {fmtTime(data.generatedAt)}</p>}
      </div>

      {allTfs.length === 0 ? (
        <div className="card p-6 text-center"><p className="text-sm text-gray-400">Backtest verisi henüz yok.</p></div>
      ) : (
        allTfs.map(tf => {
          const tfData = perTf[tf] || {}
          const strategies = tfData.strategies || []
          const isScalpTf = SCALP_TFS.has(tf)
          return (
            <div key={tf} className="card p-4 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white font-mono">{tf}</span>
                  <span className="text-[10px] text-gray-500">{TF_LABELS[tf] || tf}</span>
                  {isScalpTf && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">FIRSAT</span>}
                </div>
                {tfData.bestWinRate != null && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${tfData.bestWinRate >= 75 ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-dark-800 border-dark-700 text-gray-300'}`}>
                    En iyi WR: %{Math.round(tfData.bestWinRate)}
                  </span>
                )}
              </div>
              {strategies.length === 0 ? (
                <p className="text-xs text-gray-500">Bu TF için strateji verisi yok.</p>
              ) : (
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-gray-500 uppercase tracking-wider text-[9px] border-b border-dark-700">
                        <th className="text-left py-1.5 px-2 font-medium">Strateji</th>
                        <th className="text-right py-1.5 px-2 font-medium">WR</th>
                        <th className="text-right py-1.5 px-2 font-medium">PF</th>
                        <th className="text-right py-1.5 px-2 font-medium">Beklenti</th>
                        <th className="text-right py-1.5 px-2 font-medium">Getiri</th>
                        <th className="text-right py-1.5 px-2 font-medium">Max DD</th>
                        <th className="text-right py-1.5 px-2 font-medium">İşlem</th>
                        <th className="text-right py-1.5 px-2 font-medium">OOS WR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {strategies.map((s, i) => {
                        const wrHigh = s.winRate >= 75
                        return (
                          <tr key={(s.type || i) + '-' + i} className="border-b border-dark-800 hover:bg-dark-800/40">
                            <td className="py-1.5 px-2 text-gray-200">{s.label || s.type}</td>
                            <td className={`py-1.5 px-2 text-right font-mono font-bold ${wrHigh ? 'text-emerald-300' : 'text-gray-300'}`}>{s.winRate != null ? `%${Math.round(s.winRate)}` : '—'}</td>
                            <td className="py-1.5 px-2 text-right font-mono text-gray-300">{s.profitFactor != null ? Number(s.profitFactor).toFixed(2) : '—'}</td>
                            <td className={`py-1.5 px-2 text-right font-mono ${s.expectancyPct > 0 ? 'text-emerald-300' : s.expectancyPct < 0 ? 'text-rose-300' : 'text-gray-300'}`}>{s.expectancyPct != null ? fmtPct(s.expectancyPct) : '—'}</td>
                            <td className={`py-1.5 px-2 text-right font-mono ${s.totalReturnPct > 0 ? 'text-emerald-300' : s.totalReturnPct < 0 ? 'text-rose-300' : 'text-gray-300'}`}>{s.totalReturnPct != null ? fmtPct(s.totalReturnPct) : '—'}</td>
                            <td className="py-1.5 px-2 text-right font-mono text-rose-300">{s.maxDDpct != null ? `${Number(s.maxDDpct).toFixed(1)}%` : '—'}</td>
                            <td className="py-1.5 px-2 text-right font-mono text-gray-400">{s.trades ?? '—'}</td>
                            <td className="py-1.5 px-2 text-right font-mono text-gray-300">{s.oosWinRate != null ? `%${Math.round(s.oosWinRate)}` : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })
      )}

      <div className="flex items-start gap-2 p-2.5 bg-amber-500/5 border border-amber-500/20 rounded-lg text-[11px]">
        <Info className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
        <p className="text-gray-400 leading-relaxed">
          <span className="text-amber-300">15m / 5m / 1m:</span> backtest kenarı zayıf → fırsat/scalp katmanı (düşük güven).
          Net çekirdek sinyaller günlük / 8h / 4h / 1h üzerinde üretilir.
        </p>
      </div>
    </div>
  )
}
