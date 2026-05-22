/**
 * Tema34Bot.jsx — Borsa Krali TEMA34 Kesişim Botu
 *
 * Saf TEMA34 (34 günlük üçlü EMA) günlük-mum kesişim botu. Her işlem günü
 * kapanışından sonra tüm BIST'i tarar:
 *   • Günlük kapanışı TEMA34'ün üzerine yeni çıkan hisseyi (kesişim) o günkü
 *     kapanış fiyatından alır.
 *   • Elde tutulan bir hissenin kapanışı TEMA34'ün altına inince satar.
 * Stop-loss / hedef / zaman sınırı yoktur — tek çıkış kuralı TEMA34.
 *
 * 5 sekme: Genel Bakış · Açık Pozisyonlar · İşlem Geçmişi · Tarama Günlüğü · Ayarlar
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  LineChart, TrendingUp, ListChecks, History, ScrollText, Settings,
  RefreshCw, ChevronDown, ChevronUp, AlertTriangle, Activity, Award, Target,
} from 'lucide-react'
import api from '../services/api'
import { Button, Card, EmptyState } from '../components/ui'
import {
  fmtMoney, fmtPct, fmtDate, fmtDateShort,
  TabHeader, BotTabs, StatCard, Chip, TableShell, HowItWorks, NotesList, EquityChart,
  TradeLedger, PortfolioSummary, BuyDetail,
} from '../components/BotKit'

const TABS = [
  { id: 'overview', label: 'Genel Bakış',      icon: TrendingUp },
  { id: 'open',     label: 'Açık Pozisyonlar', icon: ListChecks },
  { id: 'trades',   label: 'İşlem Geçmişi',    icon: History },
  { id: 'runs',     label: 'Tarama Günlüğü',   icon: ScrollText },
  { id: 'settings', label: 'Ayarlar',          icon: Settings },
]

function FragmentRow({ children }) { return <>{children}</> }

// ── Yardımcılar — maliyet & alış-detayı ───────────────────────────────────
function lotCost(entryPrice, shares, commission) {
  if (entryPrice != null && shares != null) return entryPrice * shares + (commission || 0)
  return null
}

// Kapanmış işlemi TradeLedger'ın beklediği şekle çevirir
function toLedgerTrade(t) {
  return {
    id: t.id,
    symbol: t.symbol,
    outcome: { tone: 'neutral', label: 'TEMA34 altı' },
    buyAt: t.entryAt || t.entryDate,
    sellAt: t.exitAt || t.exitDate,
    buyText: `${fmtMoney(t.entryPrice)} ₺`,
    sellText: `${fmtMoney(t.exitPrice)} ₺`,
    pnlText: fmtPct(t.realizedPnLPct),
    pnlSubText: `${fmtMoney(t.realizedPnL)} ₺`,
    win: (t.realizedPnL || 0) >= 0,
    _src: t,
  }
}

// Açık pozisyon / kapanmış işlem için BuyDetail props'ları
function temaBuyDetail(o) {
  const cost = lotCost(o.entryPrice, o.shares, o.commissionPaid)
  return {
    buyAt: o.entryAt || o.entryDate,
    priceText: o.entryPrice != null ? `${fmtMoney(o.entryPrice)} ₺` : '—',
    qtyText: o.shares != null ? `${fmtMoney(o.shares, o.shares < 1 ? 4 : 2)} adet` : null,
    costText: cost != null
      ? `${fmtMoney(cost)} ₺`
      : (o.positionSizeTL != null ? `${fmtMoney(o.positionSizeTL)} ₺` : null),
    signalLabel: 'TEMA34 kesişimi — günlük kapanış, TEMA34 (34 günlük üçlü EMA) çizgisinin üzerine yeni çıktı.',
    signalRows: [
      { label: 'Giriş kapanışı', value: o.entryPrice != null ? `${fmtMoney(o.entryPrice)} ₺` : '—' },
      { label: 'Giriş TEMA34', value: o.entryTema != null ? `${fmtMoney(o.entryTema)} ₺` : '—' },
    ],
  }
}

// ── Genel Bakış ────────────────────────────────────────────────────────────
function OverviewTab({ status, loading, onRefresh }) {
  const p = status?.portfolio || {}
  const neverRan = !p.lastRunAt
  return (
    <div className="space-y-4">
      <TabHeader title="Bot performansı">
        <Button variant="ghost" size="sm" icon={RefreshCw} loading={loading} onClick={onRefresh}>
          Yenile
        </Button>
      </TabHeader>

      {status?.running && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-300">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Tüm BIST taranıyor — 1-2 dakika sürebilir.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          icon={Award}
          label="Toplam Getiri"
          value={fmtPct(p.totalRealizedPnLPct)}
          sub={`${fmtMoney(p.totalRealizedPnL)} TL gerçekleşen`}
          tone={(p.totalRealizedPnLPct || 0) >= 0 ? 'good' : 'bad'}
        />
        <StatCard
          icon={Target}
          label="Kazanma Oranı"
          value={`%${(p.winRate ?? 0).toFixed(1)}`}
          sub={`${p.winCount || 0} kazanç · ${p.lossCount || 0} kayıp`}
          tone="gold"
        />
        <StatCard
          icon={Activity}
          label="Açık Pozisyon"
          value={`${status?.openCount ?? 0}`}
          sub={`${fmtMoney(status?.unrealizedPnL)} TL anlık · ${fmtMoney(status?.openValue)} TL değer`}
        />
        <StatCard
          icon={LineChart}
          label="Sanal Sermaye"
          value={`${fmtMoney(status?.equity)} TL`}
          sub={`Nakit ${fmtMoney(p.cash)} · Başlangıç ${fmtMoney(p.capital)}`}
        />
      </div>

      <Card>
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          Sanal portföy eğrisi
        </div>
        {(p.equityHistory || []).length > 0 ? (
          <EquityChart data={p.equityHistory} />
        ) : (
          <p className="py-8 text-center text-xs text-gray-500">
            İlk tarama tamamlandığında portföy eğrisi burada görünecek.
          </p>
        )}
      </Card>

      <HowItWorks summary="Her işlem günü kapanışında BIST'i tarar, TEMA34 kesişimiyle alıp satar.">
        Bot her işlem günü kapanışından sonra (18:30) tüm BIST'i tarar. Günlük kapanışı{' '}
        <strong className="text-gray-200">TEMA34</strong> (34 günlük üçlü hareketli ortalama)
        çizgisinin üzerine yeni çıkan hisseyi o günkü kapanış fiyatından alır; elde tuttuğu bir
        hissenin kapanışı TEMA34'ün altına inince satar. Stop-loss, hedef veya zaman sınırı yoktur
        — tek çıkış kuralı TEMA34. Her alım o anki nakdin %5'i kadardır. Tüm hesaplar günlük mum
        üzerinden yapılır.
      </HowItWorks>

      {neverRan && (
        <p className="px-1 text-[11px] leading-relaxed text-gray-500">
          Bot henüz tarama yapmadı. İlk tarama bir sonraki işlem günü 18:30'da (BIST kapanışından
          sonra) otomatik çalışır. Yöneticiler Ayarlar sekmesinden hemen tarama başlatabilir.
        </p>
      )}
    </div>
  )
}

// ── Açık Pozisyonlar (Portföy) ────────────────────────────────────────────
function OpenPositionsTab({ open, onRefresh, loading }) {
  const [expanded, setExpanded] = useState(null)

  const folio = useMemo(() => {
    let cost = 0
    let value = 0
    for (const p of open) {
      const c = lotCost(p.entryPrice, p.shares, p.commissionPaid)
      if (c != null) cost += c
      if (p.shares != null) value += (p.lastPrice ?? p.entryPrice) * p.shares
    }
    return { cost, value, pnl: value - cost }
  }, [open])

  return (
    <div className="space-y-4">
      <TabHeader title="Portföy — açık pozisyonlar" sub={`${open.length} pozisyon`}>
        <Button variant="ghost" size="sm" icon={RefreshCw} loading={loading} onClick={onRefresh}>
          Yenile
        </Button>
      </TabHeader>

      {open.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={ListChecks}
            title="Açık pozisyon yok"
            description="TEMA34 üzerine çıkan hisseler tarandıkça burada görünür."
          />
        </Card>
      ) : (
        <>
          <PortfolioSummary
            count={open.length}
            costText={`${fmtMoney(folio.cost)} ₺`}
            valueText={`${fmtMoney(folio.value)} ₺`}
            pnlText={`${fmtMoney(folio.pnl)} ₺  (${fmtPct(folio.cost > 0 ? (folio.pnl / folio.cost) * 100 : 0)})`}
            win={folio.pnl >= 0}
          />
          <TableShell>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
                  <th className="px-3 py-2 font-semibold">Sembol</th>
                  <th className="px-3 py-2 font-semibold">Giriş Tarihi</th>
                  <th className="px-3 py-2 text-right font-semibold">Giriş Fiyatı</th>
                  <th className="px-3 py-2 text-right font-semibold">Son Kapanış</th>
                  <th className="px-3 py-2 text-right font-semibold">Maliyet</th>
                  <th className="px-3 py-2 text-right font-semibold">Son TEMA34</th>
                  <th className="px-3 py-2 text-right font-semibold">Anlık K/Z</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {open.map((pos) => {
                  const last = pos.lastPrice ?? pos.entryPrice
                  const pnlPct = pos.entryPrice ? ((last - pos.entryPrice) / pos.entryPrice) * 100 : null
                  const cost = lotCost(pos.entryPrice, pos.shares, pos.commissionPaid)
                  const isExp = expanded === pos.id
                  return (
                    <FragmentRow key={pos.id}>
                      <tr className="border-t border-dark-700/60">
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-white">{pos.symbol}</div>
                          {pos.name && (
                            <div className="max-w-[180px] truncate text-[10px] text-gray-500">{pos.name}</div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-400">{fmtDateShort(pos.entryDate)}</td>
                        <td className="px-3 py-2.5 text-right text-gray-300">{fmtMoney(pos.entryPrice)}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-white">{fmtMoney(last)}</td>
                        <td className="px-3 py-2.5 text-right text-gray-300">
                          {cost != null ? fmtMoney(cost) : fmtMoney(pos.positionSizeTL)}
                          {pos.shares != null && (
                            <div className="text-[10px] text-gray-500">
                              {fmtMoney(pos.shares, pos.shares < 1 ? 4 : 2)} adet
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right text-gold-300">
                          {fmtMoney(pos.lastTema ?? pos.entryTema)}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-semibold ${(pnlPct || 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                          {fmtPct(pnlPct)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            onClick={() => setExpanded(isExp ? null : pos.id)}
                            className="rounded p-1 text-gray-400 hover:bg-white/5 hover:text-white"
                            aria-label="Detay"
                          >
                            {isExp ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                        </td>
                      </tr>
                      {isExp && (
                        <tr className="bg-white/[0.02]">
                          <td colSpan={8} className="px-3 py-3">
                            <div className="space-y-3">
                              <BuyDetail {...temaBuyDetail(pos)} />
                              <NotesList notes={pos.notes || []} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </FragmentRow>
                  )
                })}
              </tbody>
            </table>
          </TableShell>
        </>
      )}
    </div>
  )
}

// ── İşlem Geçmişi ─────────────────────────────────────────────────────────
function TradesTab({ trades, onRefresh, loading }) {
  const summary = useMemo(() => {
    const total = trades.length
    if (!total) return null
    const wins = trades.filter((t) => (t.realizedPnL || 0) > 0).length
    const losses = trades.filter((t) => (t.realizedPnL || 0) < 0).length
    const totalPnL = trades.reduce((s, t) => s + (t.realizedPnL || 0), 0)
    return { total, wins, losses, totalPnL }
  }, [trades])

  const ledger = useMemo(() => trades.map(toLedgerTrade), [trades])

  return (
    <div className="space-y-4">
      <TabHeader title="Kapanan işlemler" sub={`${trades.length} işlem · gün gün`}>
        <Button variant="ghost" size="sm" icon={RefreshCw} loading={loading} onClick={onRefresh}>
          Yenile
        </Button>
      </TabHeader>

      {summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Toplam İşlem" value={summary.total} />
          <StatCard label="Kazanç" value={summary.wins} tone="good" />
          <StatCard label="Kayıp" value={summary.losses} tone="bad" />
          <StatCard
            label="Net Kâr/Zarar"
            value={`${fmtMoney(summary.totalPnL)} TL`}
            tone={summary.totalPnL >= 0 ? 'good' : 'bad'}
          />
        </div>
      )}

      {trades.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={History}
            title="Kapanmış işlem yok"
            description="Bir hisse TEMA34'ün altına inip satılınca burada görünür."
          />
        </Card>
      ) : (
        <TradeLedger
          trades={ledger}
          renderDetail={(lt) => (
            <div className="space-y-3">
              <BuyDetail {...temaBuyDetail(lt._src)} />
              <NotesList notes={lt._src.notes || []} />
            </div>
          )}
        />
      )}
    </div>
  )
}

// ── Tarama Günlüğü ────────────────────────────────────────────────────────
function RunsTab({ runs, onRefresh, loading }) {
  return (
    <div className="space-y-4">
      <TabHeader title="Tarama günlüğü" sub={`${runs.length} kayıt`}>
        <Button variant="ghost" size="sm" icon={RefreshCw} loading={loading} onClick={onRefresh}>
          Yenile
        </Button>
      </TabHeader>

      {runs.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={ScrollText}
            title="Tarama kaydı yok"
            description="Bot her işlem günü 18:30'da çalışır; tamamlanan taramalar burada listelenir."
          />
        </Card>
      ) : (
        <TableShell>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
                <th className="px-3 py-2 font-semibold">Çalışma</th>
                <th className="px-3 py-2 font-semibold">Mum Tarihi</th>
                <th className="px-3 py-2 text-right font-semibold">Taranan</th>
                <th className="px-3 py-2 text-right font-semibold">Kesişim</th>
                <th className="px-3 py-2 text-right font-semibold">Alınan</th>
                <th className="px-3 py-2 text-right font-semibold">Satılan</th>
                <th className="px-3 py-2 font-semibold">Durum</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-dark-700/60">
                  <td className="px-3 py-2.5 text-xs text-gray-400">
                    {fmtDate(r.finishedAt || r.startedAt || r.recordedAt)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-300">{r.candleDate || '—'}</td>
                  <td className="px-3 py-2.5 text-right text-gray-300">{r.scanned ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="text-emerald-300">↑{r.crossAbove ?? 0}</span>
                    <span className="text-gray-600"> / </span>
                    <span className="text-rose-300">↓{r.crossBelow ?? 0}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-emerald-300">{r.opened ?? 0}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-rose-300">{r.closed ?? 0}</td>
                  <td className="px-3 py-2.5">
                    {r.skipped ? (
                      <Chip tone="neutral">Atlandı</Chip>
                    ) : r.ok === false || r.error ? (
                      <Chip tone="bad">Hata</Chip>
                    ) : (
                      <Chip tone="good">Tamam</Chip>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      )}
    </div>
  )
}

// ── Ayarlar ────────────────────────────────────────────────────────────────
function SettingRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-gray-400">{label}</span>
      <span className="text-right font-semibold text-white">{value}</span>
    </div>
  )
}

function SettingsTab({ status, isAdmin, onReset, onRun, busy }) {
  const c = status?.config || {}
  const p = status?.portfolio || {}
  const [confirmingReset, setConfirmingReset] = useState(false)

  return (
    <div className="max-w-2xl space-y-4">
      <TabHeader title="Bot ayarları" />

      <Card>
        <div className="divide-y divide-dark-700 text-sm">
          <SettingRow label="Başlangıç tarihi" value={fmtDate(p.startedAt)} />
          <SettingRow label="Son sıfırlama" value={p.resetAt ? fmtDate(p.resetAt) : '—'} />
          <SettingRow label="Son tarama" value={p.lastRunAt ? fmtDate(p.lastRunAt) : '—'} />
          <SettingRow label="İşlenen son mum" value={p.lastCandleDate || '—'} />
          <SettingRow label="Başlangıç sermayesi" value={`${fmtMoney(p.capital)} TL`} />
          <SettingRow label="Hisse evreni" value="Tüm BIST (~510 hisse)" />
          <SettingRow label="İndikatör" value={`TEMA${c.TEMA_PERIOD ?? 34} (üçlü EMA), günlük mum`} />
          <SettingRow label="Giriş kuralı" value="Günlük kapanış TEMA34 üzerine çıkınca (kesişim)" />
          <SettingRow label="Çıkış kuralı" value="Günlük kapanış TEMA34 altına inince" />
          <SettingRow label="Pozisyon büyüklüğü" value={`Nakdin %${((c.POSITION_SIZE_PCT || 0.05) * 100).toFixed(1)}'i`} />
          <SettingRow label="En fazla açık pozisyon" value={c.MAX_CONCURRENT_POSITIONS ?? '—'} />
          <SettingRow label="En düşük pozisyon tutarı" value={`${fmtMoney(c.MIN_POSITION_TL ?? 500)} TL`} />
          <SettingRow label="Komisyon" value={`%${((c.COMMISSION_PCT || 0.002) * 100).toFixed(2)} (alış + satış)`} />
          <SettingRow label="Stop-loss / Hedef" value="Yok — tek çıkış kuralı TEMA34" />
          <SettingRow label="Tarama zamanı" value="Her işlem günü 18:30 (BIST kapanışı sonrası)" />
        </div>
      </Card>

      {isAdmin && (
        <Card tone="ember" className="space-y-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-rose-300">
            <AlertTriangle className="h-4 w-4" /> Yönetici kontrolleri
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" disabled={busy || status?.running} onClick={onRun}>
              {status?.running ? 'Tarama sürüyor…' : 'Manuel tarama çalıştır (~1-2 dk)'}
            </Button>
            {!confirmingReset ? (
              <Button variant="danger" size="sm" onClick={() => setConfirmingReset(true)}>
                Botu sıfırla
              </Button>
            ) : (
              <>
                <span className="text-xs text-gray-400">
                  Tüm pozisyon, işlem ve tarama günlüğü silinecek. Emin misin?
                </span>
                <Button
                  variant="danger"
                  size="sm"
                  loading={busy}
                  onClick={() => { setConfirmingReset(false); onReset() }}
                >
                  Evet, sıfırla
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmingReset(false)}>
                  Vazgeç
                </Button>
              </>
            )}
          </div>
          <p className="text-[11px] text-gray-500">
            Manuel tarama tüm BIST'i (~510 hisse) yeniden çeker; 1-2 dakika sürer ve arka planda
            çalışır.
          </p>
        </Card>
      )}
    </div>
  )
}

// ── Ana sayfa ──────────────────────────────────────────────────────────────
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
    <div className="mx-auto max-w-7xl space-y-4">
      <BotTabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'overview' && <OverviewTab status={status} loading={loading} onRefresh={refresh} />}
      {tab === 'open' && <OpenPositionsTab open={open} loading={loading} onRefresh={loadPositions} />}
      {tab === 'trades' && <TradesTab trades={trades} loading={loading} onRefresh={loadTrades} />}
      {tab === 'runs' && <RunsTab runs={runs} loading={loading} onRefresh={loadRuns} />}
      {tab === 'settings' && (
        <SettingsTab status={status} isAdmin={isAdmin} onReset={handleReset} onRun={handleRun} busy={busy} />
      )}
    </div>
  )
}
