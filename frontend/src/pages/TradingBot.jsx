/**
 * TradingBot.jsx — Borsa Krali Sinyal-Takipli Bot (v6)
 *
 * Bot, /gunluk-tespitler?tab=bugun sayfasında yayınlanan canlı günlük BIST
 * sinyallerini (trend + reversion, sadece LONG) sanal işleme çevirir.
 * TP/SL dinamik trailing (R basamağı + ATR tavanı) uygulanır.
 * Tüm sinyaller append-only log'ta kalır; bot kararları kısa not olarak yazılır.
 *
 * 5 sekme:
 *   1. Genel Bakış      — KPI kartları + equity chart
 *   2. Açık Pozisyonlar — şu an taşınan sanal pozisyonlar + notlar
 *   3. İşlem Geçmişi    — kapanmış sanal işlemler
 *   4. Sinyal Logu      — immutable: tüm verilmiş sinyaller (filtreli)
 *   5. Ayarlar          — config + admin reset
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  Bot, TrendingUp, ListChecks, History, FileText, Settings,
  RefreshCw, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, XCircle,
  Activity, Award, Clock, Target,
} from 'lucide-react'
import { createChart } from 'lightweight-charts'
import api from '../services/api'

const TABS = [
  { id: 'overview',  label: 'Genel Bakış',     icon: TrendingUp },
  { id: 'open',      label: 'Açık Pozisyonlar', icon: ListChecks },
  { id: 'trades',    label: 'İşlem Geçmişi',    icon: History },
  { id: 'log',       label: 'Sinyal Logu',      icon: FileText },
  { id: 'settings',  label: 'Ayarlar',          icon: Settings },
]

function fmtMoney(v, digits = 2) {
  if (v == null || !isFinite(v)) return '—'
  return Number(v).toLocaleString('tr-TR', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })
}
function fmtPct(v, digits = 2) {
  if (v == null || !isFinite(v)) return '—'
  const s = v >= 0 ? '+' : ''
  return `${s}${Number(v).toFixed(digits)}%`
}
function fmtDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch (_) {
    return iso
  }
}
function fmtDateShort(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('tr-TR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
    })
  } catch (_) {
    return (iso || '').slice(0, 10)
  }
}

// ── KPI Kartı ─────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, tone = 'neutral' }) {
  const palette = {
    neutral: { color: 'var(--text-primary)', bg: 'rgba(255,255,255,0.04)' },
    good:    { color: '#22c55e', bg: 'rgba(34,197,94,0.10)' },
    bad:     { color: '#ef4444', bg: 'rgba(239,68,68,0.10)' },
    gold:    { color: 'var(--gold-400)', bg: 'rgba(212,175,55,0.10)' },
  }
  const p = palette[tone] || palette.neutral
  return (
    <div
      className="rounded-2xl p-4 border"
      style={{ background: p.bg, borderColor: 'var(--border-subtle)' }}
    >
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider mb-2"
           style={{ color: 'var(--text-secondary)' }}>
        {Icon && <Icon className="w-3.5 h-3.5" />}
        <span>{label}</span>
      </div>
      <div className="text-2xl font-bold" style={{ color: p.color }}>{value}</div>
      {sub && <div className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>{sub}</div>}
    </div>
  )
}

// ── Equity Chart (lightweight-charts) ─────────────────────────────────────
function EquityChart({ data }) {
  const ref = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    if (!ref.current) return
    const chart = createChart(ref.current, {
      width: ref.current.clientWidth,
      height: 220,
      layout: {
        background: { color: 'transparent' },
        textColor: 'rgba(255,255,255,0.7)',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      timeScale: { borderColor: 'rgba(255,255,255,0.1)' },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)' },
    })
    const series = chart.addAreaSeries({
      lineColor: '#d4af37',
      topColor: 'rgba(212, 175, 55, 0.35)',
      bottomColor: 'rgba(212, 175, 55, 0.02)',
      lineWidth: 2,
    })
    chartRef.current = { chart, series }

    const handleResize = () => {
      if (ref.current) chart.applyOptions({ width: ref.current.clientWidth })
    }
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
    }
  }, [])

  useEffect(() => {
    if (!chartRef.current || !Array.isArray(data)) return
    const pts = data
      .filter(p => p.date && isFinite(p.equity))
      .map(p => ({ time: p.date, value: Number(p.equity) }))
    chartRef.current.series.setData(pts)
    if (pts.length > 0) chartRef.current.chart.timeScale().fitContent()
  }, [data])

  return <div ref={ref} className="w-full" />
}

// ── Genel Bakış sekmesi ──────────────────────────────────────────────────
function OverviewTab({ status, loading, onRefresh }) {
  const p = status?.portfolio || {}
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Bot performansı
        </h2>
        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border"
          style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={Award}
          label="Toplam Getiri"
          value={fmtPct(p.totalRealizedPnLPct)}
          sub={`${fmtMoney(p.totalRealizedPnL)} TL gerçekleşen`}
          tone={(p.totalRealizedPnLPct || 0) >= 0 ? 'good' : 'bad'}
        />
        <KpiCard
          icon={Target}
          label="Kazanma Oranı"
          value={`%${(p.winRate ?? 0).toFixed(1)}`}
          sub={`${p.winCount || 0} kazanç / ${p.lossCount || 0} kayıp`}
          tone="gold"
        />
        <KpiCard
          icon={Activity}
          label="Açık Pozisyon"
          value={`${status?.openCount ?? 0}`}
          sub={`${status?.pendingCount ?? 0} pending · ${fmtMoney(status?.unrealizedPnL)} TL anlık`}
        />
        <KpiCard
          icon={Bot}
          label="Sanal Sermaye"
          value={`${fmtMoney(status?.equity)} TL`}
          sub={`Nakit ${fmtMoney(p.cash)} · Başlangıç ${fmtMoney(p.capital)}`}
        />
      </div>

      <div className="rounded-2xl p-4 border"
           style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border-subtle)' }}>
        <div className="text-xs uppercase tracking-wider mb-3"
             style={{ color: 'var(--text-secondary)' }}>
          Sanal portföy eğrisi
        </div>
        <EquityChart data={p.equityHistory || []} />
      </div>

      <div className="rounded-xl p-3 text-xs border"
           style={{ background: 'rgba(59,130,246,0.06)', borderColor: 'rgba(59,130,246,0.25)', color: 'var(--text-secondary)' }}>
        <strong style={{ color: '#60a5fa' }}>Nasıl çalışıyor?</strong> Bot, Bugünün Sinyalleri sekmesinde verilen
        <em> AL (LONG) </em> sinyallerini sanal portföyle takip eder. Trend sinyallerinde piyasa fiyatından girer,
        Reversion sinyallerinde fiyat zone'a düşene kadar bekler. Kâr arttıkça SL kademeli olarak yukarı taşınır
        (R-basamağı + ATR×2 tavanı). Pozisyonlar TP'ye, SL'e veya 10 işgününe ulaşınca kapanır.
        Verilen tüm sinyaller değişmez log'da saklanır.
      </div>
    </div>
  )
}

// ── Açık Pozisyonlar sekmesi ─────────────────────────────────────────────
function OpenPositionsTab({ open, pending, onRefresh, loading }) {
  const [expanded, setExpanded] = useState(null)
  const toggle = (id) => setExpanded(expanded === id ? null : id)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Aktif pozisyonlar ({open.length} açık · {pending.length} bekleyen)
        </h2>
        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border"
          style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Yenile
        </button>
      </div>

      {open.length === 0 && pending.length === 0 && (
        <EmptyState text="Şu an açık veya bekleyen pozisyon yok. Yeni sinyaller geldikçe burada görünecek." />
      )}

      {open.length > 0 && (
        <PositionTable
          title="Açık pozisyonlar"
          positions={open}
          expanded={expanded}
          onToggle={toggle}
          mode="open"
        />
      )}
      {pending.length > 0 && (
        <PositionTable
          title="Bekleyen pozisyonlar (zone'a değiş bekleniyor)"
          positions={pending}
          expanded={expanded}
          onToggle={toggle}
          mode="pending"
        />
      )}
    </div>
  )
}

function PositionTable({ title, positions, expanded, onToggle, mode }) {
  return (
    <div className="rounded-2xl border overflow-hidden"
         style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border-subtle)' }}>
      <div className="px-4 py-2.5 text-xs uppercase tracking-wider border-b"
           style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' }}>
        {title}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase"
                style={{ color: 'var(--text-faint)' }}>
              <th className="px-3 py-2">Sembol</th>
              <th className="px-3 py-2">Strateji</th>
              <th className="px-3 py-2">Sinyal Tarihi</th>
              {mode === 'open' && <th className="px-3 py-2 text-right">Giriş</th>}
              {mode === 'open' && <th className="px-3 py-2 text-right">Son Fiyat</th>}
              {mode === 'pending' && <th className="px-3 py-2 text-right">Beklenen Giriş</th>}
              <th className="px-3 py-2 text-right">SL</th>
              <th className="px-3 py-2 text-right">TP</th>
              {mode === 'open' && <th className="px-3 py-2 text-right">Anlık P&L</th>}
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {positions.map(pos => {
              const last = pos.lastPrice ?? pos.entryPrice
              const pnlPct = mode === 'open' && pos.entryPrice
                ? ((last - pos.entryPrice) / pos.entryPrice) * 100
                : null
              const isExp = expanded === pos.id
              return (
                <FragmentRow key={pos.id}>
                  <tr className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                    <td className="px-3 py-2 font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {pos.symbol}
                      <div className="text-[10px]" style={{ color: 'var(--text-faint)' }}>{pos.name}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded text-[11px] uppercase"
                            style={{
                              background: pos.strategy === 'trend' ? 'rgba(59,130,246,0.15)' : 'rgba(168,85,247,0.15)',
                              color: pos.strategy === 'trend' ? '#60a5fa' : '#c084fc',
                            }}>
                        {pos.strategy === 'trend' ? 'Trend' : 'Reversion'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {fmtDateShort(pos.signalDate)} · {pos.signalPhase}
                    </td>
                    {mode === 'open' && <td className="px-3 py-2 text-right">{fmtMoney(pos.entryPrice)}</td>}
                    {mode === 'open' && <td className="px-3 py-2 text-right font-semibold">{fmtMoney(last)}</td>}
                    {mode === 'pending' && <td className="px-3 py-2 text-right">{fmtMoney(pos.originalEntry)}</td>}
                    <td className="px-3 py-2 text-right" style={{ color: '#ef4444' }}>
                      {fmtMoney(pos.currentStop ?? pos.originalStop)}
                      {mode === 'open' && pos.currentStop != null && pos.currentStop > pos.originalStop && (
                        <div className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
                          orijinal {fmtMoney(pos.originalStop)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right" style={{ color: '#22c55e' }}>
                      {fmtMoney(pos.currentTarget ?? pos.originalTarget)}
                    </td>
                    {mode === 'open' && (
                      <td className="px-3 py-2 text-right font-semibold"
                          style={{ color: pnlPct >= 0 ? '#22c55e' : '#ef4444' }}>
                        {fmtPct(pnlPct)}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => onToggle(pos.id)}
                              className="p-1 rounded hover:bg-white/5">
                        {isExp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>
                  {isExp && (
                    <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                      <td colSpan={mode === 'open' ? 9 : 7} className="px-3 py-3">
                        <NotesList notes={pos.notes || []} />
                      </td>
                    </tr>
                  )}
                </FragmentRow>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FragmentRow({ children }) { return <>{children}</> }

function NotesList({ notes }) {
  if (!Array.isArray(notes) || notes.length === 0) {
    return <div className="text-xs" style={{ color: 'var(--text-faint)' }}>Henüz not yok.</div>
  }
  const actionColor = {
    signal:  { bg: 'rgba(212,175,55,0.15)', color: '#d4af37' },
    entry:   { bg: 'rgba(34,197,94,0.15)',  color: '#22c55e' },
    trigger: { bg: 'rgba(34,197,94,0.15)',  color: '#22c55e' },
    pending: { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa' },
    trail:   { bg: 'rgba(168,85,247,0.15)', color: '#c084fc' },
    exit:    { bg: 'rgba(239,68,68,0.15)',  color: '#ef4444' },
    skip:    { bg: 'rgba(255,255,255,0.05)', color: 'var(--text-faint)' },
  }
  return (
    <ol className="space-y-2 text-xs">
      {notes.map((n, i) => {
        const c = actionColor[n.action] || actionColor.skip
        return (
          <li key={i} className="flex gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] uppercase tracking-wider shrink-0"
                  style={{ background: c.bg, color: c.color }}>
              {n.action}
            </span>
            <div>
              <div style={{ color: 'var(--text-primary)' }}>{n.text}</div>
              <div className="text-[10px]" style={{ color: 'var(--text-faint)' }}>{fmtDate(n.time)}</div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function EmptyState({ text }) {
  return (
    <div className="rounded-2xl p-8 text-center border-2 border-dashed"
         style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-faint)' }}>
      {text}
    </div>
  )
}

// ── İşlem Geçmişi sekmesi ────────────────────────────────────────────────
function TradesTab({ trades, onRefresh, loading }) {
  const [expanded, setExpanded] = useState(null)
  const summary = useMemo(() => {
    const total = trades.length
    if (!total) return null
    const wins = trades.filter(t => (t.realizedPnL || 0) > 0).length
    const losses = trades.filter(t => (t.realizedPnL || 0) < 0).length
    const totalPnL = trades.reduce((s, t) => s + (t.realizedPnL || 0), 0)
    return { total, wins, losses, totalPnL, winRate: total > 0 ? (wins / total) * 100 : 0 }
  }, [trades])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Kapanan işlemler ({trades.length})
        </h2>
        <button onClick={onRefresh}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border"
                style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Yenile
        </button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Toplam İşlem" value={summary.total} />
          <KpiCard label="Kazanç" value={`${summary.wins}`} tone="good" />
          <KpiCard label="Kayıp" value={`${summary.losses}`} tone="bad" />
          <KpiCard
            label="Net P&L"
            value={`${fmtMoney(summary.totalPnL)} TL`}
            tone={summary.totalPnL >= 0 ? 'good' : 'bad'}
          />
        </div>
      )}

      {trades.length === 0 ? (
        <EmptyState text="Henüz kapanmış işlem yok. Bot yeni sinyallerle çalıştıkça burası dolacak." />
      ) : (
        <div className="rounded-2xl border overflow-hidden"
             style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border-subtle)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase"
                    style={{ color: 'var(--text-faint)' }}>
                  <th className="px-3 py-2">Sembol</th>
                  <th className="px-3 py-2">Strateji</th>
                  <th className="px-3 py-2">Giriş → Çıkış</th>
                  <th className="px-3 py-2 text-right">Giriş Fiyatı</th>
                  <th className="px-3 py-2 text-right">Çıkış Fiyatı</th>
                  <th className="px-3 py-2 text-right">P&L</th>
                  <th className="px-3 py-2">Sebep</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {trades.map(t => {
                  const isExp = expanded === t.id
                  return (
                    <FragmentRow key={t.id}>
                      <tr className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                        <td className="px-3 py-2 font-semibold">{t.symbol}</td>
                        <td className="px-3 py-2 text-xs uppercase">{t.strategy}</td>
                        <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {fmtDateShort(t.entryDate)} → {fmtDateShort(t.exitDate)}
                        </td>
                        <td className="px-3 py-2 text-right">{fmtMoney(t.entryPrice)}</td>
                        <td className="px-3 py-2 text-right">{fmtMoney(t.exitPrice)}</td>
                        <td className="px-3 py-2 text-right font-semibold"
                            style={{ color: (t.realizedPnL || 0) >= 0 ? '#22c55e' : '#ef4444' }}>
                          {fmtPct(t.realizedPnLPct)}<br />
                          <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
                            {fmtMoney(t.realizedPnL)} TL
                          </span>
                        </td>
                        <td className="px-3 py-2"><ExitReasonChip reason={t.exitReason} /></td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => setExpanded(isExp ? null : t.id)}
                                  className="p-1 rounded hover:bg-white/5">
                            {isExp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </td>
                      </tr>
                      {isExp && (
                        <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                          <td colSpan={8} className="px-3 py-3">
                            <NotesList notes={t.notes || []} />
                          </td>
                        </tr>
                      )}
                    </FragmentRow>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function ExitReasonChip({ reason }) {
  const map = {
    target:         { label: 'Hedef',     color: '#22c55e', bg: 'rgba(34,197,94,0.15)',   icon: Target },
    stop:           { label: 'Stop',      color: '#ef4444', bg: 'rgba(239,68,68,0.15)',   icon: XCircle },
    timeout:        { label: 'Zaman',     color: '#fbbf24', bg: 'rgba(251,191,36,0.15)',  icon: Clock },
    signal_dropped: { label: 'Düştü',     color: '#94a3b8', bg: 'rgba(148,163,184,0.15)', icon: AlertTriangle },
  }
  const m = map[reason] || { label: reason || '—', color: 'var(--text-faint)', bg: 'rgba(255,255,255,0.05)', icon: Activity }
  const Icon = m.icon
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px]"
          style={{ background: m.bg, color: m.color }}>
      <Icon className="w-3 h-3" /> {m.label}
    </span>
  )
}

// ── Sinyal Logu sekmesi ──────────────────────────────────────────────────
const OUTCOME_LABEL = {
  signaled:        { label: 'Verildi',       color: 'var(--text-secondary)', bg: 'rgba(255,255,255,0.05)' },
  triggered:       { label: 'Tetiklendi',    color: '#60a5fa', bg: 'rgba(59,130,246,0.15)' },
  closed_target:   { label: 'Hedef tuttu',   color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
  closed_stop:     { label: 'Stop oldu',     color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
  closed_timeout:  { label: 'Zaman aşımı',   color: '#fbbf24', bg: 'rgba(251,191,36,0.15)' },
  closed_dropped:  { label: 'Sinyal düştü',  color: '#94a3b8', bg: 'rgba(148,163,184,0.15)' },
  closed_other:    { label: 'Kapandı',       color: 'var(--text-faint)', bg: 'rgba(255,255,255,0.05)' },
  no_trigger:      { label: 'Tetiklenmedi',  color: 'var(--text-faint)', bg: 'rgba(255,255,255,0.05)' },
}

function SignalLogTab({ entries, onRefresh, loading, filters, setFilters }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Sinyal Logu — {entries.length} kayıt
        </h2>
        <button onClick={onRefresh}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border"
                style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Yenile
        </button>
      </div>

      <div className="rounded-2xl p-3 border flex flex-wrap gap-2 text-xs"
           style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border-subtle)' }}>
        <FilterInput
          label="Sembol"
          value={filters.symbol || ''}
          onChange={v => setFilters(f => ({ ...f, symbol: v.toUpperCase() }))}
          placeholder="THYAO"
        />
        <FilterSelect
          label="Strateji"
          value={filters.strategy || ''}
          onChange={v => setFilters(f => ({ ...f, strategy: v }))}
          options={[
            { v: '', label: 'Hepsi' },
            { v: 'trend', label: 'Trend' },
            { v: 'reversion', label: 'Reversion' },
          ]}
        />
        <FilterSelect
          label="Durum"
          value={filters.outcome || ''}
          onChange={v => setFilters(f => ({ ...f, outcome: v }))}
          options={[
            { v: '', label: 'Hepsi' },
            { v: 'signaled', label: 'Verildi' },
            { v: 'triggered', label: 'Tetiklendi (açık)' },
            { v: 'closed_target', label: 'Hedef tuttu' },
            { v: 'closed_stop', label: 'Stop oldu' },
            { v: 'closed_timeout', label: 'Zaman aşımı' },
            { v: 'closed_dropped', label: 'Sinyal düştü' },
            { v: 'no_trigger', label: 'Tetiklenmedi' },
          ]}
        />
        <FilterInput
          label="Tarih (en eski)"
          value={filters.fromDate || ''}
          onChange={v => setFilters(f => ({ ...f, fromDate: v }))}
          placeholder="2026-05-01"
          type="date"
        />
      </div>

      <div className="rounded-2xl border overflow-hidden"
           style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border-subtle)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase"
                  style={{ color: 'var(--text-faint)' }}>
                <th className="px-3 py-2">Verilme</th>
                <th className="px-3 py-2">Faz</th>
                <th className="px-3 py-2">Sembol</th>
                <th className="px-3 py-2">Strateji</th>
                <th className="px-3 py-2 text-right">Giriş</th>
                <th className="px-3 py-2 text-right">SL</th>
                <th className="px-3 py-2 text-right">TP</th>
                <th className="px-3 py-2 text-right">Skor</th>
                <th className="px-3 py-2">Durum</th>
                <th className="px-3 py-2">Biten</th>
                <th className="px-3 py-2 text-right">Sonuç</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-8 text-center text-xs"
                        style={{ color: 'var(--text-faint)' }}>
                  Filtrelere uyan kayıt yok.
                </td></tr>
              )}
              {entries.map(e => {
                const status = OUTCOME_LABEL[e.outcome] || OUTCOME_LABEL.signaled
                return (
                  <tr key={e.id} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                    <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {fmtDateShort(e.signalDate)}
                    </td>
                    <td className="px-3 py-2 text-[11px] uppercase">{e.signalPhase}</td>
                    <td className="px-3 py-2 font-semibold">{e.symbol}</td>
                    <td className="px-3 py-2 text-xs uppercase">{e.strategy}</td>
                    <td className="px-3 py-2 text-right">{fmtMoney(e.entry)}</td>
                    <td className="px-3 py-2 text-right" style={{ color: '#ef4444' }}>{fmtMoney(e.stop)}</td>
                    <td className="px-3 py-2 text-right" style={{ color: '#22c55e' }}>{fmtMoney(e.target)}</td>
                    <td className="px-3 py-2 text-right">{e.totalScore ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded text-[11px]"
                            style={{ background: status.bg, color: status.color }}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {e.exitDate ? fmtDateShort(e.exitDate) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-xs font-semibold"
                        style={{ color: (e.finalReturnPct ?? 0) >= 0 ? '#22c55e' : '#ef4444' }}>
                      {e.finalReturnPct != null ? fmtPct(e.finalReturnPct) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl p-3 text-xs border"
           style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border-subtle)', color: 'var(--text-faint)' }}>
        <strong>Sinyal Logu</strong> append-only'dir — verilen bir sinyalin entry/SL/TP/skor değerleri asla değişmez.
        Sadece sonuç alanları (tetiklendi mi, ne zaman kapandı, ne kadar getiri sağladı) bot çalışırken eklenir.
      </div>
    </div>
  )
}

function FilterInput({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <label className="flex items-center gap-2">
      <span style={{ color: 'var(--text-faint)' }}>{label}:</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="px-2 py-1 rounded border bg-transparent w-32"
        style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
      />
    </label>
  )
}
function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="flex items-center gap-2">
      <span style={{ color: 'var(--text-faint)' }}>{label}:</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="px-2 py-1 rounded border bg-transparent"
        style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
      >
        {options.map(o => (
          <option key={o.v} value={o.v} style={{ background: '#1a1a1a' }}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}

// ── Ayarlar sekmesi ──────────────────────────────────────────────────────
function SettingsTab({ status, isAdmin, onReset, onTick, busy }) {
  const c = status?.config || {}
  const p = status?.portfolio || {}
  const [confirmingReset, setConfirmingReset] = useState(false)

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
        Bot ayarları
      </h2>

      <div className="rounded-2xl p-4 border space-y-2 text-sm"
           style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border-subtle)' }}>
        <SettingRow label="Başlangıç tarihi" value={fmtDate(p.startedAt)} />
        <SettingRow label="Son reset" value={p.resetAt ? fmtDate(p.resetAt) : '—'} />
        <SettingRow label="Başlangıç sermayesi" value={`${fmtMoney(p.capital)} TL`} />
        <SettingRow label="Pozisyon büyüklüğü" value={`%${((c.POSITION_SIZE_PCT || 0.05) * 100).toFixed(1)} (her sinyal için)`} />
        <SettingRow label="Maks. eşzamanlı pozisyon" value={c.MAX_CONCURRENT_POSITIONS ?? '—'} />
        <SettingRow label="Komisyon" value={`%${((c.COMMISSION_PCT || 0.002) * 100).toFixed(2)}`} />
        <SettingRow label="Slippage" value={`%${((c.SLIPPAGE_PCT || 0.001) * 100).toFixed(2)}`} />
        <SettingRow label="Zaman aşımı" value={`${c.TIMEOUT_BUSINESS_DAYS ?? 10} işgünü`} />
        <SettingRow label="Trailing kuralı" value="R-basamağı + ATR×2 tavanı (sıkı olan kazanır)" />
      </div>

      {isAdmin && (
        <div className="rounded-2xl p-4 border space-y-3"
             style={{ background: 'rgba(239,68,68,0.04)', borderColor: 'rgba(239,68,68,0.25)' }}>
          <div className="font-semibold text-sm" style={{ color: '#ef4444' }}>
            <AlertTriangle className="inline w-4 h-4 mr-1" /> Admin kontrolleri
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onTick}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg border text-xs"
              style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
            >
              Manuel tick çalıştır
            </button>
            {!confirmingReset ? (
              <button
                onClick={() => setConfirmingReset(true)}
                className="px-3 py-1.5 rounded-lg border text-xs"
                style={{ background: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.35)', color: '#ef4444' }}
              >
                Botu sıfırla
              </button>
            ) : (
              <>
                <span className="text-xs self-center" style={{ color: 'var(--text-secondary)' }}>
                  Tüm pozisyon, işlem ve sinyal logu silinecek. Emin misin?
                </span>
                <button
                  onClick={() => { setConfirmingReset(false); onReset(); }}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: '#ef4444', color: 'white' }}
                >
                  Evet, sıfırla
                </button>
                <button
                  onClick={() => setConfirmingReset(false)}
                  className="px-3 py-1.5 rounded-lg border text-xs"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
                >
                  Vazgeç
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
function SettingRow({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}

// ── Ana sayfa ────────────────────────────────────────────────────────────
export default function TradingBot() {
  const [tab, setTab] = useState('overview')
  const [status, setStatus] = useState(null)
  const [open, setOpen] = useState([])
  const [pending, setPending] = useState([])
  const [trades, setTrades] = useState([])
  const [logEntries, setLogEntries] = useState([])
  const [logFilters, setLogFilters] = useState({})
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  const isAdmin = useMemo(() => {
    try {
      const raw = localStorage.getItem('user')
      if (!raw) return false
      return JSON.parse(raw)?.role === 'admin'
    } catch { return false }
  }, [])

  const loadStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/trading-bot/status')
      if (data?.ok) setStatus(data.status)
    } catch (_) {}
  }, [])
  const loadPositions = useCallback(async () => {
    try {
      const { data } = await api.get('/trading-bot/positions')
      if (data?.ok) {
        setOpen(data.open || [])
        setPending(data.pending || [])
      }
    } catch (_) {}
  }, [])
  const loadTrades = useCallback(async () => {
    try {
      const { data } = await api.get('/trading-bot/trades', { params: { limit: 200 } })
      if (data?.ok) setTrades(data.trades || [])
    } catch (_) {}
  }, [])
  const loadLog = useCallback(async () => {
    try {
      const { data } = await api.get('/trading-bot/signal-log', {
        params: { ...logFilters, limit: 500 },
      })
      if (data?.ok) setLogEntries(data.entries || [])
    } catch (_) {}
  }, [logFilters])

  const refresh = useCallback(async () => {
    setLoading(true)
    await Promise.all([loadStatus(), loadPositions(), loadTrades(), loadLog()])
    setLoading(false)
  }, [loadStatus, loadPositions, loadTrades, loadLog])

  useEffect(() => { refresh() }, []) // ilk yüklemede tek seferlik
  useEffect(() => { loadLog() }, [logFilters, loadLog])

  // Tab'a göre seçici yenileme
  useEffect(() => {
    if (tab === 'overview' || tab === 'settings') loadStatus()
    if (tab === 'open') loadPositions()
    if (tab === 'trades') loadTrades()
    if (tab === 'log') loadLog()
  }, [tab, loadStatus, loadPositions, loadTrades, loadLog])

  const handleReset = async () => {
    setBusy(true)
    try {
      await api.post('/trading-bot/reset')
      await refresh()
    } catch (e) {
      alert(`Reset hata: ${e?.response?.data?.error || e.message}`)
    } finally {
      setBusy(false)
    }
  }
  const handleTick = async () => {
    setBusy(true)
    try {
      await api.post('/trading-bot/tick')
      await refresh()
    } catch (e) {
      alert(`Tick hata: ${e?.response?.data?.error || e.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <header className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl"
             style={{ background: 'rgba(212,175,55,0.10)', border: '1px solid var(--border-gold)' }}>
          <Bot className="w-6 h-6" style={{ color: 'var(--gold-400)' }} />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Trading Bot
          </h1>
          <p className="text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
            Bugünün LONG sinyallerini sanal portföyle takip eden bot. Tüm kararlar log'da.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap gap-1 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px"
              style={{
                borderColor: active ? 'var(--gold-400)' : 'transparent',
                color: active ? 'var(--gold-400)' : 'var(--text-secondary)',
                fontWeight: active ? 600 : 400,
              }}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'overview' && (
        <OverviewTab status={status} loading={loading} onRefresh={refresh} />
      )}
      {tab === 'open' && (
        <OpenPositionsTab
          open={open}
          pending={pending}
          loading={loading}
          onRefresh={loadPositions}
        />
      )}
      {tab === 'trades' && (
        <TradesTab trades={trades} loading={loading} onRefresh={loadTrades} />
      )}
      {tab === 'log' && (
        <SignalLogTab
          entries={logEntries}
          loading={loading}
          onRefresh={loadLog}
          filters={logFilters}
          setFilters={setLogFilters}
        />
      )}
      {tab === 'settings' && (
        <SettingsTab
          status={status}
          isAdmin={isAdmin}
          onReset={handleReset}
          onTick={handleTick}
          busy={busy}
        />
      )}
    </div>
  )
}
