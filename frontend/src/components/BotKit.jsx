/**
 * BotKit — Borsa Krali bot sayfaları için ortak görsel bileşenler.
 *
 * Trading Bot, TEMA34 Bot ve Kağıt Üzerinde sayfaları birebir aynı görünsün
 * diye paylaşılan parçalar tek yerde toplanır: sekme çubuğu, KPI kartı, tablo
 * sarmalayıcı, katlanır "nasıl çalışır" paneli, durum etiketi, işlem-notu
 * listesi, portföy grafiği ve ortak formatlayıcılar.
 */
import { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, ChevronUp, Info, ShoppingCart, Sparkles, CalendarDays } from 'lucide-react'
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

// ── Çıkış sonucu etiketi (kâr/zarar farkındalıklı) ─────────────────────────
// Bir pozisyon kapanırken İKİ ayrı bilgi vardır:
//   1) NEDEN kapandı  → stop / hedef / süre / sinyal kaynaklı
//   2) SONUÇ ne oldu  → kâr / zarar / başabaş
// Trailing stop kârı kilitleyince exitReason HÂLÂ 'stop' kalır; sadece nedene
// bakan eski etiket bu yüzden kârlı işlemlere de kırmızı "Stop oldu" yazıyordu.
// Burada renk DAİMA gerçek sonuca (kâr=yeşil, zarar=kırmızı) göre belirlenir;
// etiket "neden · sonuç" formatındadır. Sinyal kaynaklı çıkışlar ise gerçek
// sebepleri ayırt edilsin diye ayrı (mavi/info) renkle işaretlenir.
function pnlResult(pnl) {
  const n = typeof pnl === 'number' && isFinite(pnl) ? pnl : null
  if (n == null)  return { word: null,      tone: 'neutral' }
  if (n > 1e-9)   return { word: 'kâr',      tone: 'good' }
  if (n < -1e-9)  return { word: 'zarar',    tone: 'bad' }
  return            { word: 'başabaş', tone: 'neutral' }
}

// reason: stop | target | timeout | signal_dropped | signal | manual_close |
//         tema_exit | hit_stop | hit_target | ...
export function exitOutcome(reason, pnl) {
  const r = pnlResult(pnl)
  const suf = r.word ? ` · ${r.word}` : ''
  const win = r.word === 'kâr'
  const flat = r.word === 'başabaş'
  switch (reason) {
    case 'target':
    case 'hit_target':
      // Hedef tuttu → normalde kâr; komisyonla zarara dönerse kırmızı göster.
      return { tone: r.word === 'zarar' ? 'bad' : 'good', label: `Hedef${suf}` }
    case 'stop':
    case 'hit_stop':
      // Kârla kapandıysa trailing stop kârı kilitlemiştir → yeşil, "Stop · kâr".
      if (win)  return { tone: 'good',    label: 'Stop · kâr' }
      if (flat) return { tone: 'neutral', label: 'Stop · başabaş' }
      return { tone: 'bad', label: r.word ? 'Stop · zarar' : 'Stop' }
    case 'timeout':
      return { tone: r.tone, label: `Süre doldu${suf}` }
    case 'signal_dropped':
    case 'signal':
    case 'signal_exit':
      return { tone: 'info', label: `Sinyal çıkışı${suf}` }
    case 'manual_close':
      return { tone: 'info', label: `Manuel${suf}` }
    case 'tema_exit':
      return { tone: 'info', label: `TEMA34 altı${suf}` }
    default:
      return { tone: r.tone, label: r.word ? `Kapandı${suf}` : (reason || 'Kapandı') }
  }
}

// Sinyal kaydı yaşam-döngüsü durumları → kâr/zarar farkındalıklı etiket.
// Kapanmış (closed_*) durumlar gerçek P&L'e göre exitOutcome'a delege edilir.
export function signalOutcome(outcome, pnl) {
  switch (outcome) {
    case 'signaled':       return { tone: 'neutral', label: 'Verildi' }
    case 'triggered':      return { tone: 'info',    label: 'Açık' }
    case 'no_trigger':     return { tone: 'neutral', label: 'Tetiklenmedi' }
    case 'closed_target':  return exitOutcome('target', pnl)
    case 'closed_stop':    return exitOutcome('stop', pnl)
    case 'closed_timeout': return exitOutcome('timeout', pnl)
    case 'closed_dropped': return exitOutcome('signal_dropped', pnl)
    case 'closed_other':   return exitOutcome('other', pnl)
    default:               return { tone: 'neutral', label: outcome || 'Kapandı' }
  }
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
      lineColor: '#10b981',
      topColor: 'rgba(16,185,129,0.28)',
      bottomColor: 'rgba(16,185,129,0.02)',
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

// ── Saat / gün formatlayıcıları ────────────────────────────────────────────
export function fmtTime(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}
export function fmtDayLabel(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch { return String(iso).slice(0, 10) }
}
function dayKeyOf(iso) {
  if (!iso) return '0000-00-00'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function shortDT(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    })
  } catch { return '' }
}

// ── Etiket-değer çifti ─────────────────────────────────────────────────────
function KV({ label, value, valueCls = 'text-gray-200' }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`truncate text-xs font-medium ${valueCls}`}>{value}</div>
    </div>
  )
}

// ── Portföy özet şeridi — açık pozisyonların toplam maliyet/değer/K-Z'si ───
export function PortfolioSummary({ count = 0, costText = '—', valueText = '—', pnlText = '—', win = true }) {
  return (
    <Card padding="sm">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KV label="Pozisyon" value={count} valueCls="text-white" />
        <KV label="Toplam maliyet" value={costText} valueCls="text-white" />
        <KV label="Güncel değer" value={valueText} valueCls="text-white" />
        <KV label="Anlık K/Z" value={pnlText} valueCls={win ? 'text-emerald-300' : 'text-rose-300'} />
      </div>
    </Card>
  )
}

// ── Alış bilgisi + alış sinyali bloğu (satır detayında gösterilir) ─────────
export function BuyDetail({ buyAt, priceText, qtyText, costText, signalLabel, signalRows }) {
  return (
    <div className="space-y-2.5">
      <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/[0.04] p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-300/90">
          <ShoppingCart className="h-3.5 w-3.5" aria-hidden="true" /> Alış bilgisi
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KV label="Alış tarihi" value={fmtDate(buyAt)} />
          <KV label="Alış fiyatı" value={priceText || '—'} />
          {qtyText && <KV label="Adet" value={qtyText} />}
          {costText && <KV label="Maliyet" value={costText} />}
        </div>
      </div>
      {(signalLabel || (signalRows && signalRows.length > 0)) && (
        <div className="rounded-lg border border-gold-500/15 bg-gold-500/[0.04] p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gold-300/90">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Alış sinyali
          </div>
          {signalLabel && <div className="mb-2 text-xs leading-relaxed text-gray-200">{signalLabel}</div>}
          {signalRows && signalRows.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {signalRows.map((r, i) => <KV key={i} label={r.label} value={r.value} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Gün-gruplu işlem geçmişi defteri ──────────────────────────────────────
// trades: normalize edilmiş kapanmış işlemler — her biri:
//   { id, symbol, outcome:{tone,label}|null, buyAt, sellAt (ISO),
//     buyText, sellText, pnlText, pnlSubText, win }
// renderDetail(trade) verilirse satır tıklanınca açılır.
export function TradeLedger({ trades, renderDetail, entryLabel = 'ALIŞ', exitLabel = 'SATIŞ' }) {
  const [expanded, setExpanded] = useState(null)
  const groups = useMemo(() => {
    const map = new Map()
    for (const t of (trades || [])) {
      const k = dayKeyOf(t.sellAt)
      if (!map.has(k)) map.set(k, [])
      map.get(k).push(t)
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [trades])

  if (!groups.length) return null

  return (
    <div className="space-y-3">
      {groups.map(([key, dayTrades]) => (
        <Card key={key} padding="none" className="overflow-hidden">
          <div className="flex items-center gap-1.5 border-b border-dark-700 bg-dark-800/40 px-3.5 py-2 text-xs font-semibold text-gray-300">
            <CalendarDays className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
            {fmtDayLabel(dayTrades[0].sellAt)}
            <span className="font-normal text-gray-500">· {dayTrades.length} işlem</span>
          </div>
          <div className="divide-y divide-dark-700/60">
            {dayTrades.map((t) => {
              const isExp = expanded === t.id
              const sameDay = dayKeyOf(t.buyAt) === dayKeyOf(t.sellAt)
              return (
                <div key={t.id}>
                  <button
                    type="button"
                    onClick={() => renderDetail && setExpanded(isExp ? null : t.id)}
                    className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-white/[0.02]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-white">{t.symbol}</span>
                        {t.outcome && <Chip tone={t.outcome.tone}>{t.outcome.label}</Chip>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                        <span className="text-emerald-300">
                          {entryLabel} {sameDay ? fmtTime(t.buyAt) : shortDT(t.buyAt)} · {t.buyText}
                        </span>
                        <span className="text-gray-600" aria-hidden="true">→</span>
                        <span className="text-rose-300">
                          {exitLabel} {fmtTime(t.sellAt)} · {t.sellText}
                        </span>
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <div className={`text-sm font-semibold ${t.win ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {t.pnlText}
                      </div>
                      {t.pnlSubText && <div className="text-[10px] text-gray-500">{t.pnlSubText}</div>}
                    </div>
                    {renderDetail && (
                      isExp
                        ? <ChevronUp className="h-4 w-4 flex-shrink-0 text-gray-500" aria-hidden="true" />
                        : <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-500" aria-hidden="true" />
                    )}
                  </button>
                  {isExp && renderDetail && (
                    <div className="border-t border-dark-700/60 bg-white/[0.02] px-3.5 py-3">
                      {renderDetail(t)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      ))}
    </div>
  )
}
