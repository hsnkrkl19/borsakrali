/**
 * BIST Model Portföy — Borsa Krali
 *
 * "Hisse önerisi" botlarının CANLI sanal portföyü: AL pozisyon açar, SAT/STOP/TP
 * ile kapatır (yalnız elde tutulanı satar), nakit + açık pozisyon (gerçekleşmemiş
 * K/Z) + kapanan işlem (gerçekleşen K/Z) + özsermaye + kazanma oranı biriktirir.
 * İki portföy: AL (@borsasinyal34, avgScore≥80) · ≥75 (ana kanal). Gerçek para yok.
 * Veri: GET /api/bist-portfolio.
 */

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, TrendingUp, TrendingDown, Target, Shield, Wallet, CheckCircle2, XCircle, Clock, ArrowUpRight, ArrowDownRight, Hash, Info } from 'lucide-react'
import api from '../services/api'

function fmt(v, p = 2) { return v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('tr-TR', { minimumFractionDigits: p, maximumFractionDigits: p }) }
function money(v) { return v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('tr-TR', { maximumFractionDigits: 0 }) }
function pctCls(v) { return v >= 0 ? 'text-emerald-400' : 'text-red-400' }
function sgn(v) { return v >= 0 ? '+' : '' }

const EXIT_META = {
  target:      { label: 'TP (Hedef)',  cls: 'text-emerald-400', Icon: CheckCircle2 },
  stop:        { label: 'Stop',        cls: 'text-red-400',     Icon: XCircle },
  signal_exit: { label: 'SAT (Sinyal)', cls: 'text-sky-400',    Icon: ArrowDownRight },
  timeout:     { label: 'Süre doldu',  cls: 'text-gray-400',    Icon: Clock },
}

const BOTS = [
  { id: 'al', label: 'Kaliteli AL', hint: '@borsasinyal34 · avgSkor ≥80' },
  { id: 'signals', label: '≥75 LONG', hint: 'Ana kanal · güven ≥75' },
]

// Basit özsermaye sparkline (SVG)
function Sparkline({ history, capital }) {
  const pts = (history || []).filter(h => Number.isFinite(h.equity))
  if (pts.length < 2) return null
  const W = 260, H = 44
  const ys = pts.map(p => p.equity)
  const min = Math.min(...ys, capital), max = Math.max(...ys, capital)
  const span = max - min || 1
  const path = pts.map((p, i) => `${(i / (pts.length - 1)) * W},${H - ((p.equity - min) / span) * H}`).join(' ')
  const up = ys[ys.length - 1] >= capital
  const baseY = H - ((capital - min) / span) * H
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-11" preserveAspectRatio="none">
      <line x1="0" y1={baseY} x2={W} y2={baseY} stroke="currentColor" strokeWidth="0.5" className="text-gray-600" strokeDasharray="3 3" />
      <polyline points={path} fill="none" strokeWidth="1.5" className={up ? 'text-emerald-400' : 'text-red-400'} stroke="currentColor" />
    </svg>
  )
}

function Kpi({ label, value, sub, cls }) {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/40 p-3">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className={`text-base md:text-lg font-bold ${cls || ''}`}>{value}</div>
      {sub != null && <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  )
}

export default function BistPortfoy() {
  const [data, setData] = useState(null)
  const [bot, setBot] = useState('al')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      const r = await api.get('/bist-portfolio')
      if (r.data?.ok) { setData(r.data); setError(null) }
      else setError(r.data?.error || 'Portföy yüklenemedi')
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    } finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [load])

  const snap = data?.[bot]
  const k = snap?.kpis
  const open = snap?.open || []
  const closed = snap?.closed || []

  return (
    <div className="space-y-5">
      {/* Başlık + bot seçici */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg md:text-xl font-bold flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-400" /> BIST Model Portföy
          </h2>
          <p className="text-xs md:text-sm text-gray-400 mt-1">
            Öneri botları canlı sanal portföy gibi çalışır: AL açar, yalnız <b>elde tutulanı</b> SAT/STOP eder,
            risk/ödül + gerçekleşen/gerçekleşmemiş K/Z + özsermaye biriktirir. Yatırım tavsiyesi değildir.
          </p>
        </div>
        <button
          onClick={() => { setRefreshing(true); load() }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/30 transition-colors text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Yenile
        </button>
      </div>

      <div className="flex gap-2">
        {BOTS.map(b => (
          <button key={b.id} onClick={() => setBot(b.id)}
            className={`flex-1 rounded-lg border px-3 py-2 text-left transition-colors ${bot === b.id ? 'border-emerald-500/60 bg-emerald-600/15' : 'border-gray-700 bg-gray-800/30 hover:bg-gray-800/50'}`}>
            <div className="text-sm font-semibold">{b.label}</div>
            <div className="text-[11px] text-gray-500">{b.hint}</div>
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-10 text-gray-400">Portföy yükleniyor…</div>}
      {error && !loading && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300 flex items-center gap-2">
          <Info className="w-4 h-4" /> {error}
        </div>
      )}

      {!loading && k && (
        <>
          {/* KPI ızgarası */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <Kpi label="Portföy Değeri (Özsermaye)" value={`${money(k.equity)} ₺`}
              sub={`Başlangıç ${money(k.capital)} ₺`}
              cls={k.equity >= k.capital ? 'text-emerald-400' : 'text-red-400'} />
            <Kpi label="Toplam Getiri" value={`${sgn(k.totalReturnPct)}${fmt(k.totalReturnPct)}%`} cls={pctCls(k.totalReturnPct)}
              sub={`Nakit ${money(k.cash)} ₺`} />
            <Kpi label="Gerçekleşen K/Z" value={`${sgn(k.totalRealizedPnL)}${money(k.totalRealizedPnL)} ₺`} cls={pctCls(k.totalRealizedPnL)}
              sub={`Açık K/Z ${sgn(k.unrealizedTotal)}${money(k.unrealizedTotal)} ₺`} />
            <Kpi label="Kazanma Oranı" value={`%${fmt(k.winRate, 0)}`}
              sub={`${k.winCount}G / ${k.lossCount}K · ${k.openCount} açık`} />
          </div>

          {/* Özsermaye eğrisi */}
          {(snap.equityHistory || []).length >= 2 && (
            <div className="rounded-xl border border-gray-700 bg-gray-800/30 p-3">
              <div className="text-[11px] text-gray-500 mb-1">Özsermaye eğrisi ({snap.equityHistory.length} gün)</div>
              <Sparkline history={snap.equityHistory} capital={k.capital} />
            </div>
          )}

          {k.tradingEnabled === false && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300 flex items-center gap-2">
              <Info className="w-4 h-4" /> Yeni alım duraklatıldı{k.haltReason ? ` (${k.haltReason})` : ''}. Açık pozisyon yönetimi (SAT/STOP/TP) sürer.
            </div>
          )}

          {/* Açık pozisyonlar */}
          <section>
            <h3 className="text-sm font-semibold text-gray-300 mb-2">Açık Pozisyonlar ({open.length})</h3>
            {open.length === 0 ? (
              <div className="rounded-lg border border-gray-700 bg-gray-800/30 p-4 text-sm text-gray-400">
                Şu an açık pozisyon yok. Nitelikli AL sinyali oluştuğunda risk-bazlı boyutla pozisyon açılır ve burada görünür.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {open.map((p) => (
                  <div key={p.id || p.symbol} className="rounded-xl border border-emerald-500/30 bg-gray-800/40 p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {p.ticket && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-600/30 text-emerald-200 text-xs font-bold"><Hash className="w-3 h-3" />{p.ticket}</span>}
                        <span className="font-bold">{p.symbol}</span>
                        <span className="text-[10px] uppercase tracking-wide text-emerald-400 font-semibold">LONG</span>
                      </div>
                      <span className={`flex items-center gap-1 text-sm font-bold ${pctCls(p.unrealizedPct)}`}>
                        {p.unrealizedPct >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                        {sgn(p.unrealizedPct)}{fmt(p.unrealizedPct)}%
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      <div><div className="text-gray-500">Giriş</div><div className="font-semibold">{fmt(p.entryPrice)}</div></div>
                      <div><div className="text-gray-500">Güncel</div><div className="font-semibold">{fmt(p.lastPrice)}</div></div>
                      <div><div className="text-gray-500 flex items-center gap-0.5"><Shield className="w-3 h-3" />Stop</div><div className="font-semibold text-red-300">{fmt(p.currentStop)}</div></div>
                      <div><div className="text-gray-500 flex items-center gap-0.5"><Target className="w-3 h-3" />Hedef</div><div className="font-semibold text-emerald-300">{fmt(p.currentTarget)}</div></div>
                    </div>
                    <div className="flex items-center justify-between mt-2 text-[11px] text-gray-500">
                      <span>{money(p.shares)} adet · {money(p.positionSizeTL)} ₺ · risk %{fmt(p.riskPct, 1)}{p.rewardPct != null ? ` / ödül %${fmt(p.rewardPct, 1)}` : ''}</span>
                      <span className={pctCls(p.unrealizedPnL)}>{sgn(p.unrealizedPnL)}{money(p.unrealizedPnL)} ₺</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Kapanan işlemler */}
          {closed.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-300 mb-2">Kapanan İşlemler (gerçekleşen K/Z)</h3>
              <div className="space-y-1.5">
                {closed.map((c, i) => {
                  const meta = EXIT_META[c.exitReason] || EXIT_META.timeout
                  const Icon = meta.Icon
                  const rp = c.priceReturnPct ?? c.realizedPnLPct
                  return (
                    <div key={`${c.symbol}-${i}`} className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800/30 px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        {c.ticket && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-300 font-bold"><Hash className="w-3 h-3" />{c.ticket}</span>}
                        <span className="font-semibold">{c.symbol}</span>
                        <span className={`flex items-center gap-1 ${meta.cls}`}><Icon className="w-3.5 h-3.5" />{meta.label}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-gray-500">{fmt(c.entryPrice)} → {fmt(c.exitPrice)}</span>
                        <span className={pctCls(rp)}>{sgn(rp)}{fmt(rp)}%</span>
                        <span className={`font-semibold ${pctCls(c.realizedPnL)}`}>{sgn(c.realizedPnL)}{money(c.realizedPnL)} ₺</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          <p className="text-[11px] text-gray-500 flex items-center gap-1.5">
            {k.totalReturnPct >= 0 ? <TrendingUp className="w-3 h-3 text-emerald-500" /> : <TrendingDown className="w-3 h-3 text-red-500" />}
            Sanal model portföy · komisyon + slipaj dahil · yalnız elde tutulan satılır. Yatırım tavsiyesi değildir.
          </p>
        </>
      )}
    </div>
  )
}
