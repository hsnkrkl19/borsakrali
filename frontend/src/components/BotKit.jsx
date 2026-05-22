/**
 * BotKit — Borsa Krali bot sayfaları için ortak görsel bileşenler.
 *
 * Trading Bot, TEMA34 Bot ve Kağıt Üzerinde sayfaları birebir aynı görünsün
 * diye paylaşılan parçalar tek yerde toplanır: sekme çubuğu, KPI kartı, tablo
 * sarmalayıcı, katlanır "nasıl çalışır" paneli, durum etiketi, işlem-notu
 * listesi, portföy grafiği ve ortak formatlayıcılar.
 */
import { useState, useRef, useEffect } from 'react'
import { ChevronDown, ChevronUp, Info } from 'lucide-react'
import { createChart } from 'lightweight-charts'
import { Card } from './ui'
import ScrollableTabBar from './ScrollableTabBar'

// ── Formatlayıcılar ────────────────────────────────────────────────────────
export function fmtMoney(v, digits = 2) {
  if (v == null || !isFinite(v)) return '—'
  return Number(v).toLocaleString('tr-TR', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })
}
export function fmtPct(v, digits = 2) {
  if (v == null || !isFinite(v)) return '—'
  return `${v >= 0 ? '+' : ''}${Number(v).toFixed(digits)}%`
}
export function fmtDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}
export function fmtDateShort(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('tr-TR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
    })
  } catch { return (iso || '').slice(0, 10) }
}

// ── Sekme başlığı + aksiyon ────────────────────────────────────────────────
export function TabHeader({ title, sub, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
      </div>
      {children && <div className="flex flex-shrink-0 items-center gap-2">{children}</div>}
    </div>
  )
}

// ── İç sekme çubuğu — üç bot da aynı ──────────────────────────────────────
export function BotTabs({ tabs, active, onChange }) {
  return (
    <ScrollableTabBar activeKey={active} className="gap-0.5 border-b border-dark-700 -mx-1 px-1">
      {tabs.map((t) => {
        const Icon = t.icon
        const on = active === t.id
        return (
          <button
            key={t.id}
            type="button"
            data-tab-key={t.id}
            onClick={() => onChange(t.id)}
            aria-pressed={on}
            className="-mb-px flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] transition-colors"
            style={{
              color: on ? 'var(--text-primary)' : 'var(--text-muted)',
              borderBottomColor: on ? 'var(--gold-400)' : 'transparent',
              fontWeight: on ? 600 : 400,
            }}
          >
            {Icon && <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />}
            {t.label}
            {t.count > 0 && (
              <span className="ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-dark-700 px-1 text-[10px] text-gray-300">
                {t.count}
              </span>
            )}
          </button>
        )
      })}
    </ScrollableTabBar>
  )
}

// ── KPI kartı ──────────────────────────────────────────────────────────────
const STAT_TONE = {
  neutral: 'text-white',
  good: 'text-emerald-300',
  bad: 'text-rose-300',
  gold: 'text-gold-300',
}
export function StatCard({ icon: Icon, label, value, sub, tone = 'neutral' }) {
  return (
    <Card padding="sm">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        {Icon && <Icon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />}
        <span className="truncate">{label}</span>
      </div>
      <div className={`text-xl font-bold leading-none ${STAT_TONE[tone] || STAT_TONE.neutral}`}>
        {value}
      </div>
      {sub && <div className="mt-1.5 text-[11px] leading-snug text-gray-500">{sub}</div>}
    </Card>
  )
}

// ── Durum etiketi ──────────────────────────────────────────────────────────
const CHIP_TONE = {
  neutral: 'bg-dark-700 text-gray-300',
  good: 'bg-emerald-500/15 text-emerald-300',
  bad: 'bg-rose-500/15 text-rose-300',
  warn: 'bg-amber-500/15 text-amber-300',
  info: 'bg-sky-500/15 text-sky-300',
  gold: 'bg-gold-500/15 text-gold-300',
}
export function Chip({ tone = 'neutral', icon: Icon, className = '', children }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${
        CHIP_TONE[tone] || CHIP_TONE.neutral
      } ${className}`}
    >
      {Icon && <Icon className="h-3 w-3" aria-hidden="true" />}
      {children}
    </span>
  )
}

// ── Tablo sarmalayıcı ──────────────────────────────────────────────────────
export function TableShell({ title, action, children }) {
  return (
    <Card padding="none" className="overflow-hidden">
      {(title || action) && (
        <div className="flex items-center justify-between gap-2 border-b border-dark-700 px-3.5 py-2.5">
          {title && (
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              {title}
            </span>
          )}
          {action}
        </div>
      )}
      <div className="overflow-x-auto">{children}</div>
    </Card>
  )
}

// ── Katlanır "nasıl çalışır" paneli ───────────────────────────────────────
export function HowItWorks({ summary, children }) {
  const [open, setOpen] = useState(false)
  return (
    <Card padding="none" className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left"
      >
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-sky-500/10">
          <Info className="h-4 w-4 text-sky-400" aria-hidden="true" />
        </span>
        <span className="flex-1 text-[12.5px] leading-snug text-gray-400">
          <span className="font-semibold text-white">Nasıl çalışır? </span>
          {summary}
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 flex-shrink-0 text-gray-500" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-500" aria-hidden="true" />
        )}
      </button>
      {open && (
        <div className="border-t border-dark-700 px-3.5 py-3 text-[12.5px] leading-relaxed text-gray-400">
          {children}
        </div>
      )}
    </Card>
  )
}

// ── İşlem notu listesi ─────────────────────────────────────────────────────
const NOTE_TONE = {
  signal: 'gold', entry: 'good', trigger: 'good', pending: 'info',
  trail: 'info', exit: 'bad', skip: 'neutral',
}
const NOTE_LABEL = {
  signal: 'SİNYAL', entry: 'GİRİŞ', trigger: 'TETİK', pending: 'BEKLEME',
  trail: 'STOP ↑', exit: 'ÇIKIŞ', skip: 'ATLANDI',
}
export function NotesList({ notes }) {
  if (!Array.isArray(notes) || notes.length === 0) {
    return <div className="text-xs text-gray-500">Henüz not yok.</div>
  }
  return (
    <ol className="space-y-2">
      {notes.map((n, i) => (
        <li key={i} className="flex gap-2">
          <Chip tone={NOTE_TONE[n.action] || 'neutral'} className="shrink-0 tracking-wider">
            {NOTE_LABEL[n.action] || (n.action || '').toUpperCase()}
          </Chip>
          <div className="min-w-0">
            <div className="text-xs text-gray-200">{n.text}</div>
            <div className="text-[10px] text-gray-500">{fmtDate(n.time)}</div>
          </div>
        </li>
      ))}
    </ol>
  )
}

// ── Portföy eğrisi grafiği ─────────────────────────────────────────────────
export function EquityChart({ data, height = 200 }) {
  const ref = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    if (!ref.current) return
    const chart = createChart(ref.current, {
      width: ref.current.clientWidth,
      height,
      layout: { background: { color: 'transparent' }, textColor: 'rgba(148,163,184,0.8)' },
      grid: {
        vertLines: { color: 'rgba(148,163,184,0.06)' },
        horzLines: { color: 'rgba(148,163,184,0.06)' },
      },
      timeScale: { borderColor: 'rgba(148,163,184,0.14)' },
      rightPriceScale: { borderColor: 'rgba(148,163,184,0.14)' },
    })
    const series = chart.addAreaSeries({
      lineColor: '#d4af37',
      topColor: 'rgba(212,175,55,0.28)',
      bottomColor: 'rgba(212,175,55,0.02)',
      lineWidth: 2,
    })
    chartRef.current = { chart, series }
    const onResize = () => {
      if (ref.current) chart.applyOptions({ width: ref.current.clientWidth })
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      chart.remove()
    }
  }, [height])

  useEffect(() => {
    if (!chartRef.current || !Array.isArray(data)) return
    const pts = data
      .filter((p) => p.date && isFinite(p.equity))
      .map((p) => ({ time: p.date, value: Number(p.equity) }))
    chartRef.current.series.setData(pts)
    if (pts.length > 0) chartRef.current.chart.timeScale().fitContent()
  }, [data])

  return <div ref={ref} className="w-full" />
}
