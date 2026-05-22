/**
 * Tema34Bot.jsx — Borsa Krali TEMA34 Kesişim Botu
 *
 * Saf TEMA34 (Triple EMA, periyot 34) günlük-mum kesişim botu. Her işlem günü
 * kapanışından sonra tüm BIST'i tarar:
 *   • Günlük kapanışı TEMA34'ün üzerine YENİ çıkan hisseyi (kesişim) o günkü
 *     kapanış fiyatından alır.
 *   • Elde tutulan bir hissenin kapanışı TEMA34'ün ALTINA inince satar.
 * Stop-loss / hedef / zaman aşımı yoktur — tek çıkış kuralı TEMA34.
 *
 * 5 sekme: Genel Bakış · Açık Pozisyonlar · İşlem Geçmişi · Tarama Günlüğü · Ayarlar
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  LineChart, TrendingUp, ListChecks, History, ScrollText, Settings,
  RefreshCw, ChevronDown, ChevronUp, AlertTriangle, Activity, Award, Target,
} from 'lucide-react'
import { createChart } from 'lightweight-charts'
import api from '../services/api'
import { Button } from '../components/ui'

const TABS = [
  { id: 'overview', label: 'Genel Bakış',     icon: TrendingUp },
  { id: 'open',     label: 'Açık Pozisyonlar', icon: ListChecks },
  { id: 'trades',   label: 'İşlem Geçmişi',    icon: History },
  { id: 'runs',     label: 'Tarama Günlüğü',   icon: ScrollText },
  { id: 'settings', label: 'Ayarlar',          icon: Settings },
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
  } catch (_) { return iso }
}
function fmtDateShort(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('tr-TR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
    })
  } catch (_) { return (iso || '').slice(0, 10) }
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
    <div className="rounded-2xl p-4 border"
         style={{ background: p.bg, borderColor: 'var(--border-subtle)' }}>
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

// ── Equity Chart ──────────────────────────────────────────────────────────
function EquityChart({ data }) {
  const ref = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    if (!ref.current) return
    const chart = createChart(ref.current, {
      width: ref.current.clientWidth,
      height: 220,
      layout: { background: { color: 'transparent' }, textColor: 'rgba(255,255,255,0.7)' },
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

function EmptyState({ text }) {
  return (
    <div className="rounded-2xl p-8 text-center border-2 border-dashed"
         style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-faint)' }}>
      {text}
    </div>
  )
}

function FragmentRow({ children }) { return <>{children}</> }

function NotesList({ notes }) {
  if (!Array.isArray(notes) || notes.length === 0) {
    return <div className="text-xs" style={{ color: 'var(--text-faint)' }}>Henüz not yok.</div>
  }
  const actionColor = {
    signal: { bg: 'rgba(212,175,55,0.15)', color: '#d4af37' },
    entry:  { bg: 'rgba(34,197,94,0.15)',  color: '#22c55e' },
    exit:   { bg: 'rgba(239,68,68,0.15)',  color: '#ef4444' },
  }
  return (
    <ol className="space-y-2 text-xs">
      {notes.map((n, i) => {
        const c = actionColor[n.action] || { bg: 'rgba(255,255,255,0.05)', color: 'var(--text-faint)' }
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

// ── Genel Bakış ───────────────────────────────────────────────────────────
function OverviewTab({ status, loading, onRefresh }) {
  const p = status?.portfolio || {}
  const neverRan = !p.lastRunAt
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Bot performansı
        </h2>
        <Button variant="ghost" size="sm" icon={RefreshCw} loading={loading} onClick={onRefresh}>
          Yenile
        </Button>
      </div>

      {status?.running && (
        <div className="rounded-xl p-3 text-xs border flex items-center gap-2"
             style={{ background: 'rgba(251,191,36,0.08)', borderColor: 'rgba(251,191,36,0.30)', color: '#fbbf24' }}>
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          Tüm BIST taranıyor — 1-2 dakika sürebilir.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Award} label="Toplam Getiri"
          value={fmtPct(p.totalRealizedPnLPct)}
          sub={`${fmtMoney(p.totalRealizedPnL)} TL gerçekleşen`}
          tone={(p.totalRealizedPnLPct || 0) >= 0 ? 'good' : 'bad'} />
        <KpiCard icon={Target} label="Kazanma Oranı"
          value={`%${(p.winRate ?? 0).toFixed(1)}`}
          sub={`${p.winCount || 0} kazanç / ${p.lossCount || 0} kayıp`}
          tone="gold" />
        <KpiCard icon={Activity} label="Açık Pozisyon"
          value={`${status?.openCount ?? 0}`}
          sub={`${fmtMoney(status?.unrealizedPnL)} TL anlık · ${fmtMoney(status?.openValue)} TL değer`} />
        <KpiCard icon={LineChart} label="Sanal Sermaye"
          value={`${fmtMoney(status?.equity)} TL`}
          sub={`Nakit ${fmtMoney(p.cash)} · Başlangıç ${fmtMoney(p.capital)}`} />
      </div>

      <div className="rounded-2xl p-4 border"
           style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border-subtle)' }}>
        <div className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-secondary)' }}>
          Sanal portföy eğrisi
        </div>
        {(p.equityHistory || []).length > 0
          ? <EquityChart data={p.equityHistory} />
          : <div className="text-xs py-8 text-center" style={{ color: 'var(--text-faint)' }}>
              İlk tarama tamamlandığında portföy eğrisi burada görünecek.
            </div>}
      </div>

      <div className="rounded-xl p-3 text-xs border"
           style={{ background: 'rgba(59,130,246,0.06)', borderColor: 'rgba(59,130,246,0.25)', color: 'var(--text-secondary)' }}>
        <strong style={{ color: '#60a5fa' }}>Nasıl çalışıyor?</strong> Bot her işlem günü kapanışından
        sonra (18:30) tüm BIST'i tarar. Günlük kapanışı <em>TEMA34</em>'ün üzerine yeni çıkan (kesişim)
        hisseyi o günkü kapanış fiyatından alır; elde tuttuğu bir hissenin kapanışı TEMA34'ün altına
        inince satar. Stop-loss, hedef veya zaman aşımı yoktur — tek çıkış kuralı TEMA34. Her alım,
        o anki nakdin %5'i kadardır. Tüm hesaplar günlük mum üzerinden yapılır.
      </div>

      {neverRan && (
        <div className="rounded-xl p-3 text-xs border"
             style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border-subtle)', color: 'var(--text-faint)' }}>
          Bot henüz tarama yapmadı. İlk tarama bir sonraki işlem günü 18:30'da (BIST kapanışından sonra)
          otomatik çalışacak. Admin'ler Ayarlar sekmesinden hemen tarama başlatabilir.
        </div>
      )}
    </div>
  )
}

// ── Açık Pozisyonlar ──────────────────────────────────────────────────────
function OpenPositionsTab({ open, onRefresh, loading }) {
  const [expanded, setExpanded] = useState(null)
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Açık pozisyonlar ({open.length})
        </h2>
        <Button variant="ghost" size="sm" icon={RefreshCw} loading={loading} onClick={onRefresh}>
          Yenile
        </Button>
      </div>

      {open.length === 0 ? (
        <EmptyState text="Şu an açık pozisyon yok. TEMA34 üzerine çıkan hisseler tarandıkça burada görünecek." />
      ) : (
        <div className="rounded-2xl border overflow-hidden"
             style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border-subtle)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase" style={{ color: 'var(--text-faint)' }}>
                  <th className="px-3 py-2">Sembol</th>
                  <th className="px-3 py-2">Giriş Tarihi</th>
                  <th className="px-3 py-2 text-right">Giriş Fiyatı</th>
                  <th className="px-3 py-2 text-right">Son Kapanış</th>
                  <th className="px-3 py-2 text-right">Son TEMA34</th>
                  <th className="px-3 py-2 text-right">Anlık P&L</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {open.map(pos => {
                  const last = pos.lastPrice ?? pos.entryPrice
                  const pnlPct = pos.entryPrice ? ((last - pos.entryPrice) / pos.entryPrice) * 100 : null
                  const isExp = expanded === pos.id
                  return (
                    <FragmentRow key={pos.id}>
                      <tr className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                        <td className="px-3 py-2 font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {pos.symbol}
                          <div className="text-[10px] truncate max-w-[160px]" style={{ color: 'var(--text-faint)' }}>{pos.name}</div>
                        </td>
                        <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {fmtDateShort(pos.entryDate)}
                        </td>
                        <td className="px-3 py-2 text-right">{fmtMoney(pos.entryPrice)}</td>
                        <td className="px-3 py-2 text-right font-semibold">{fmtMoney(last)}</td>
                        <td className="px-3 py-2 text-right" style={{ color: 'var(--gold-400)' }}>
                          {fmtMoney(pos.lastTema ?? pos.entryTema)}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold"
                            style={{ color: (pnlPct || 0) >= 0 ? '#22c55e' : '#ef4444' }}>
                          {fmtPct(pnlPct)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => setExpanded(isExp ? null : pos.id)}
                                  className="p-1 rounded hover:bg-white/5">
                            {isExp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </td>
                      </tr>
                      {isExp && (
                        <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                          <td colSpan={7} className="px-3 py-3"><NotesList notes={pos.notes || []} /></td>
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

// ── İşlem Geçmişi ─────────────────────────────────────────────────────────
function TradesTab({ trades, onRefresh, loading }) {
  const [expanded, setExpanded] = useState(null)
  const summary = useMemo(() => {
    const total = trades.length
    if (!total) return null
    const wins = trades.filter(t => (t.realizedPnL || 0) > 0).length
    const losses = trades.filter(t => (t.realizedPnL || 0) < 0).length
    const totalPnL = trades.reduce((s, t) => s + (t.realizedPnL || 0), 0)
    return { total, wins, losses, totalPnL }
  }, [trades])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Kapanan işlemler ({trades.length})
        </h2>
        <Button variant="ghost" size="sm" icon={RefreshCw} loading={loading} onClick={onRefresh}>
          Yenile
        </Button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Toplam İşlem" value={summary.total} />
          <KpiCard label="Kazanç" value={`${summary.wins}`} tone="good" />
          <KpiCard label="Kayıp" value={`${summary.losses}`} tone="bad" />
          <KpiCard label="Net P&L" value={`${fmtMoney(summary.totalPnL)} TL`}
                   tone={summary.totalPnL >= 0 ? 'good' : 'bad'} />
        </div>
      )}

      {trades.length === 0 ? (
        <EmptyState text="Henüz kapanmış işlem yok. Bir hisse TEMA34 altına inip satılınca burada görünecek." />
      ) : (
        <div className="rounded-2xl border overflow-hidden"
             style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border-subtle)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase" style={{ color: 'var(--text-faint)' }}>
                  <th className="px-3 py-2">Sembol</th>
                  <th className="px-3 py-2">Giriş → Çıkış</th>
                  <th className="px-3 py-2 text-right">Giriş Fiyatı</th>
                  <th className="px-3 py-2 text-right">Çıkış Fiyatı</th>
                  <th className="px-3 py-2 text-right">P&L</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {trades.map(t => {
                  const isExp = expanded === t.id
                  return (
                    <FragmentRow key={t.id}>
                      <tr className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                        <td className="px-3 py-2 font-semibold">
                          {t.symbol}
                          <div className="text-[10px] truncate max-w-[160px]" style={{ color: 'var(--text-faint)' }}>{t.name}</div>
                        </td>
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
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => setExpanded(isExp ? null : t.id)}
                                  className="p-1 rounded hover:bg-white/5">
                            {isExp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </td>
                      </tr>
                      {isExp && (
                        <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                          <td colSpan={6} className="px-3 py-3"><NotesList notes={t.notes || []} /></td>
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

// ── Tarama Günlüğü ────────────────────────────────────────────────────────
function RunsTab({ runs, onRefresh, loading }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Tarama günlüğü ({runs.length})
        </h2>
        <Button variant="ghost" size="sm" icon={RefreshCw} loading={loading} onClick={onRefresh}>
          Yenile
        </Button>
      </div>

      {runs.length === 0 ? (
        <EmptyState text="Henüz tarama kaydı yok. Bot her işlem günü 18:30'da çalışır." />
      ) : (
        <div className="rounded-2xl border overflow-hidden"
             style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border-subtle)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase" style={{ color: 'var(--text-faint)' }}>
                  <th className="px-3 py-2">Çalışma</th>
                  <th className="px-3 py-2">Mum Tarihi</th>
                  <th className="px-3 py-2 text-right">Taranan</th>
                  <th className="px-3 py-2 text-right">Kesişim</th>
                  <th className="px-3 py-2 text-right">Alınan</th>
                  <th className="px-3 py-2 text-right">Satılan</th>
                  <th className="px-3 py-2">Durum</th>
                </tr>
              </thead>
              <tbody>
                {runs.map(r => (
                  <tr key={r.id} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                    <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {fmtDate(r.finishedAt || r.startedAt || r.recordedAt)}
                    </td>
                    <td className="px-3 py-2 text-xs">{r.candleDate || '—'}</td>
                    <td className="px-3 py-2 text-right">{r.scanned ?? '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <span style={{ color: '#22c55e' }}>↑{r.crossAbove ?? 0}</span>
                      {' / '}
                      <span style={{ color: '#ef4444' }}>↓{r.crossBelow ?? 0}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold" style={{ color: '#22c55e' }}>
                      {r.opened ?? 0}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold" style={{ color: '#ef4444' }}>
                      {r.closed ?? 0}
                    </td>
                    <td className="px-3 py-2">
                      {r.skipped ? (
                        <span className="px-2 py-0.5 rounded text-[11px]"
                              style={{ background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }}>
                          Atlandı
                        </span>
                      ) : r.ok === false || r.error ? (
                        <span className="px-2 py-0.5 rounded text-[11px]"
                              style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                          Hata
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[11px]"
                              style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                          Tamam
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Ayarlar ───────────────────────────────────────────────────────────────
function SettingRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span className="font-semibold text-right" style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}

function SettingsTab({ status, isAdmin, onReset, onRun, busy }) {
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
        <SettingRow label="Son tarama" value={p.lastRunAt ? fmtDate(p.lastRunAt) : '—'} />
        <SettingRow label="İşlenen son mum" value={p.lastCandleDate || '—'} />
        <SettingRow label="Başlangıç sermayesi" value={`${fmtMoney(p.capital)} TL`} />
        <SettingRow label="Hisse evreni" value="Tüm BIST (~510 hisse)" />
        <SettingRow label="İndikatör" value={`TEMA${c.TEMA_PERIOD ?? 34} (Triple EMA), günlük mum`} />
        <SettingRow label="Giriş kuralı" value="Günlük kapanış TEMA34 üzerine çıkınca (kesişim)" />
        <SettingRow label="Çıkış kuralı" value="Günlük kapanış TEMA34 altına inince" />
        <SettingRow label="Pozisyon büyüklüğü" value={`Nakdin %${((c.POSITION_SIZE_PCT || 0.05) * 100).toFixed(1)}'i`} />
        <SettingRow label="Maks. eşzamanlı pozisyon" value={c.MAX_CONCURRENT_POSITIONS ?? '—'} />
        <SettingRow label="Min. pozisyon tutarı" value={`${fmtMoney(c.MIN_POSITION_TL ?? 500)} TL`} />
        <SettingRow label="Komisyon" value={`%${((c.COMMISSION_PCT || 0.002) * 100).toFixed(2)} (alış + satış)`} />
        <SettingRow label="Stop-loss / Hedef" value="Yok — tek çıkış kuralı TEMA34" />
        <SettingRow label="Tarama zamanı" value="Her işlem günü 18:30 (BIST kapanışı sonrası)" />
      </div>

      {isAdmin && (
        <div className="rounded-2xl p-4 border space-y-3"
             style={{ background: 'rgba(239,68,68,0.04)', borderColor: 'rgba(239,68,68,0.25)' }}>
          <div className="font-semibold text-sm" style={{ color: '#ef4444' }}>
            <AlertTriangle className="inline w-4 h-4 mr-1" /> Admin kontrolleri
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={onRun} disabled={busy || status?.running}
                    className="px-3 py-1.5 rounded-lg border text-xs"
                    style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
              {status?.running ? 'Tarama sürüyor…' : 'Manuel tarama çalıştır (~1-2 dk)'}
            </button>
            {!confirmingReset ? (
              <button onClick={() => setConfirmingReset(true)}
                      className="px-3 py-1.5 rounded-lg border text-xs"
                      style={{ background: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.35)', color: '#ef4444' }}>
                Botu sıfırla
              </button>
            ) : (
              <>
                <span className="text-xs self-center" style={{ color: 'var(--text-secondary)' }}>
                  Tüm pozisyon, işlem ve tarama günlüğü silinecek. Emin misin?
                </span>
                <button onClick={() => { setConfirmingReset(false); onReset() }} disabled={busy}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                        style={{ background: '#ef4444', color: 'white' }}>
                  Evet, sıfırla
                </button>
                <button onClick={() => setConfirmingReset(false)}
                        className="px-3 py-1.5 rounded-lg border text-xs"
                        style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                  Vazgeç
                </button>
              </>
            )}
          </div>
          <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
            Manuel tarama tüm BIST'i (~510 hisse) yeniden çeker; 1-2 dakika sürer ve arka planda çalışır.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Ana sayfa ─────────────────────────────────────────────────────────────
export default function Tema34Bot() {
  const [tab, setTab] = useState('overview')
  const [status, setStatus] = useState(null)
  const [open, setOpen] = useState([])
  const [trades, setTrades] = useState([])
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const pollRef = useRef(null)

  const isAdmin = useMemo(() => {
    try {
      const raw = localStorage.getItem('user')
      if (!raw) return false
      return JSON.parse(raw)?.role === 'admin'
    } catch { return false }
  }, [])

  const loadStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/tema34-bot/status')
      if (data?.ok) setStatus(data.status)
      return data?.status
    } catch (_) { return null }
  }, [])
  const loadPositions = useCallback(async () => {
    try {
      const { data } = await api.get('/tema34-bot/positions')
      if (data?.ok) setOpen(data.open || [])
    } catch (_) {}
  }, [])
  const loadTrades = useCallback(async () => {
    try {
      const { data } = await api.get('/tema34-bot/trades', { params: { limit: 200 } })
      if (data?.ok) setTrades(data.trades || [])
    } catch (_) {}
  }, [])
  const loadRuns = useCallback(async () => {
    try {
      const { data } = await api.get('/tema34-bot/runs', { params: { limit: 60 } })
      if (data?.ok) setRuns(data.runs || [])
    } catch (_) {}
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    await Promise.all([loadStatus(), loadPositions(), loadTrades(), loadRuns()])
    setLoading(false)
  }, [loadStatus, loadPositions, loadTrades, loadRuns])

  useEffect(() => { refresh() }, []) // ilk yüklemede tek seferlik

  useEffect(() => {
    if (tab === 'overview' || tab === 'settings') loadStatus()
    if (tab === 'open') loadPositions()
    if (tab === 'trades') loadTrades()
    if (tab === 'runs') loadRuns()
  }, [tab, loadStatus, loadPositions, loadTrades, loadRuns])

  // Tarama bitince otomatik yenile — manuel tarama sonrası status.running izlenir
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    let ticks = 0
    pollRef.current = setInterval(async () => {
      ticks++
      const s = await loadStatus()
      if (!s?.running || ticks > 25) {
        clearInterval(pollRef.current)
        pollRef.current = null
        await refresh()
      }
    }, 8000)
  }, [loadStatus, refresh])

  const handleReset = async () => {
    setBusy(true)
    try {
      await api.post('/tema34-bot/reset')
      await refresh()
    } catch (e) {
      alert(`Reset hatası: ${e?.response?.data?.error || e.message}`)
    } finally { setBusy(false) }
  }
  const handleRun = async () => {
    setBusy(true)
    try {
      const { data } = await api.post('/tema34-bot/run')
      if (data?.busy) alert('Tarama zaten sürüyor.')
      await loadStatus()
      startPolling()
    } catch (e) {
      alert(`Tarama hatası: ${e?.response?.data?.error || e.message}`)
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap gap-1 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px"
                    style={{
                      borderColor: active ? 'var(--gold-400)' : 'transparent',
                      color: active ? 'var(--gold-400)' : 'var(--text-secondary)',
                      fontWeight: active ? 600 : 400,
                    }}>
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'overview' && <OverviewTab status={status} loading={loading} onRefresh={refresh} />}
      {tab === 'open'     && <OpenPositionsTab open={open} loading={loading} onRefresh={loadPositions} />}
      {tab === 'trades'   && <TradesTab trades={trades} loading={loading} onRefresh={loadTrades} />}
      {tab === 'runs'     && <RunsTab runs={runs} loading={loading} onRefresh={loadRuns} />}
      {tab === 'settings' && (
        <SettingsTab status={status} isAdmin={isAdmin} onReset={handleReset} onRun={handleRun} busy={busy} />
      )}
    </div>
  )
}
