/**
 * TradingBot.jsx — Borsa Krali Sinyal-Takipli Bot
 *
 * /gunluk-tespitler?tab=bugun sayfasında yayınlanan günlük BIST sinyallerini
 * (trend + reversion, sadece LONG) sanal işleme çevirir. Pozisyon kâra geçtikçe
 * stop-loss kademeli yukarı taşınır. Verilen tüm sinyaller değişmez kayıtta
 * saklanır.
 *
 * 5 sekme: Genel Bakış · Açık Pozisyonlar · İşlem Geçmişi · Sinyal Kaydı · Ayarlar
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Bot, TrendingUp, ListChecks, History, FileText, Settings,
  RefreshCw, ChevronDown, ChevronUp, AlertTriangle, XCircle,
  Activity, Award, Clock, Target,
} from 'lucide-react'
import api from '../services/api'
import { Button, Card, EmptyState } from '../components/ui'
import {
  fmtMoney, fmtPct, fmtDate, fmtDateShort,
  TabHeader, BotTabs, StatCard, Chip, TableShell, HowItWorks, NotesList, EquityChart,
} from '../components/BotKit'

const TABS = [
  { id: 'overview', label: 'Genel Bakış',      icon: TrendingUp },
  { id: 'open',     label: 'Açık Pozisyonlar', icon: ListChecks },
  { id: 'trades',   label: 'İşlem Geçmişi',    icon: History },
  { id: 'log',      label: 'Sinyal Kaydı',     icon: FileText },
  { id: 'settings', label: 'Ayarlar',          icon: Settings },
]

function FragmentRow({ children }) { return <>{children}</> }

// ── Genel Bakış ────────────────────────────────────────────────────────────
function OverviewTab({ status, loading, onRefresh }) {
  const p = status?.portfolio || {}
  return (
    <div className="space-y-4">
      <TabHeader title="Bot performansı">
        <Button variant="ghost" size="sm" icon={RefreshCw} loading={loading} onClick={onRefresh}>
          Yenile
        </Button>
      </TabHeader>

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
          sub={`${status?.pendingCount ?? 0} bekleyen · ${fmtMoney(status?.unrealizedPnL)} TL anlık`}
        />
        <StatCard
          icon={Bot}
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
            İlk işlemler kapandıkça portföy eğrisi burada görünecek.
          </p>
        )}
      </Card>

      <HowItWorks summary="Günlük BIST sinyallerini sanal parayla işler, sonuçları takip eder.">
        Bot, <strong className="text-gray-200">Bugünün Sinyalleri</strong> sekmesinde verilen
        AL (LONG) sinyallerini sanal portföyle takip eder. Trend sinyallerinde piyasa fiyatından
        girer, Reversion sinyallerinde fiyat hedef bölgeye düşene kadar bekler. Pozisyon kâra
        geçtikçe stop-loss kademeli olarak yukarı taşınır, böylece kazanç korunur. Pozisyonlar
        hedefe, stop-loss'a veya 10 işgünü sınırına ulaşınca kapanır. Verilen her sinyal{' '}
        <strong className="text-gray-200">Sinyal Kaydı</strong> sekmesinde değişmez biçimde saklanır.
      </HowItWorks>
    </div>
  )
}

// ── Açık Pozisyonlar ──────────────────────────────────────────────────────
function OpenPositionsTab({ open, pending, onRefresh, loading }) {
  const [expanded, setExpanded] = useState(null)
  const toggle = (id) => setExpanded((e) => (e === id ? null : id))

  return (
    <div className="space-y-4">
      <TabHeader title="Aktif pozisyonlar" sub={`${open.length} açık · ${pending.length} bekleyen`}>
        <Button variant="ghost" size="sm" icon={RefreshCw} loading={loading} onClick={onRefresh}>
          Yenile
        </Button>
      </TabHeader>

      {open.length === 0 && pending.length === 0 && (
        <Card padding="none">
          <EmptyState
            icon={ListChecks}
            title="Açık pozisyon yok"
            description="Yeni sinyaller geldikçe bot pozisyon açar ve burada görünür."
          />
        </Card>
      )}

      {open.length > 0 && (
        <PositionTable
          title="Açık pozisyonlar"
          positions={open}
          mode="open"
          expanded={expanded}
          onToggle={toggle}
        />
      )}
      {pending.length > 0 && (
        <PositionTable
          title="Bekleyen pozisyonlar — fiyatın hedef bölgeye gelmesi bekleniyor"
          positions={pending}
          mode="pending"
          expanded={expanded}
          onToggle={toggle}
        />
      )}
    </div>
  )
}

function PositionTable({ title, positions, expanded, onToggle, mode }) {
  const colSpan = mode === 'open' ? 9 : 7
  return (
    <TableShell title={title}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
            <th className="px-3 py-2 font-semibold">Sembol</th>
            <th className="px-3 py-2 font-semibold">Strateji</th>
            <th className="px-3 py-2 font-semibold">Sinyal Tarihi</th>
            {mode === 'open' && <th className="px-3 py-2 text-right font-semibold">Giriş</th>}
            {mode === 'open' && <th className="px-3 py-2 text-right font-semibold">Son Fiyat</th>}
            {mode === 'pending' && <th className="px-3 py-2 text-right font-semibold">Beklenen Giriş</th>}
            <th className="px-3 py-2 text-right font-semibold">Stop</th>
            <th className="px-3 py-2 text-right font-semibold">Hedef</th>
            {mode === 'open' && <th className="px-3 py-2 text-right font-semibold">Anlık K/Z</th>}
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {positions.map((pos) => {
            const last = pos.lastPrice ?? pos.entryPrice
            const pnlPct = mode === 'open' && pos.entryPrice
              ? ((last - pos.entryPrice) / pos.entryPrice) * 100
              : null
            const isExp = expanded === pos.id
            return (
              <FragmentRow key={pos.id}>
                <tr className="border-t border-dark-700/60">
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-white">{pos.symbol}</div>
                    {pos.name && <div className="text-[10px] text-gray-500">{pos.name}</div>}
                  </td>
                  <td className="px-3 py-2.5">
                    <Chip tone={pos.strategy === 'trend' ? 'info' : 'gold'}>
                      {pos.strategy === 'trend' ? 'Trend' : 'Reversion'}
                    </Chip>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-400">
                    {fmtDateShort(pos.signalDate)} · {pos.signalPhase}
                  </td>
                  {mode === 'open' && (
                    <td className="px-3 py-2.5 text-right text-gray-300">{fmtMoney(pos.entryPrice)}</td>
                  )}
                  {mode === 'open' && (
                    <td className="px-3 py-2.5 text-right font-semibold text-white">{fmtMoney(last)}</td>
                  )}
                  {mode === 'pending' && (
                    <td className="px-3 py-2.5 text-right text-gray-300">{fmtMoney(pos.originalEntry)}</td>
                  )}
                  <td className="px-3 py-2.5 text-right text-rose-300">
                    {fmtMoney(pos.currentStop ?? pos.originalStop)}
                    {mode === 'open' && pos.currentStop != null && pos.currentStop > pos.originalStop && (
                      <div className="text-[10px] text-gray-500">ilk: {fmtMoney(pos.originalStop)}</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-emerald-300">
                    {fmtMoney(pos.currentTarget ?? pos.originalTarget)}
                  </td>
                  {mode === 'open' && (
                    <td className={`px-3 py-2.5 text-right font-semibold ${(pnlPct || 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {fmtPct(pnlPct)}
                    </td>
                  )}
                  <td className="px-3 py-2.5 text-right">
                    <button
                      onClick={() => onToggle(pos.id)}
                      className="rounded p-1 text-gray-400 hover:bg-white/5 hover:text-white"
                      aria-label="Detay"
                    >
                      {isExp ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </td>
                </tr>
                {isExp && (
                  <tr className="bg-white/[0.02]">
                    <td colSpan={colSpan} className="px-3 py-3">
                      <NotesList notes={pos.notes || []} />
                    </td>
                  </tr>
                )}
              </FragmentRow>
            )
          })}
        </tbody>
      </table>
    </TableShell>
  )
}

// ── İşlem Geçmişi ─────────────────────────────────────────────────────────
function TradesTab({ trades, onRefresh, loading }) {
  const [expanded, setExpanded] = useState(null)
  const summary = useMemo(() => {
    const total = trades.length
    if (!total) return null
    const wins = trades.filter((t) => (t.realizedPnL || 0) > 0).length
    const losses = trades.filter((t) => (t.realizedPnL || 0) < 0).length
    const totalPnL = trades.reduce((s, t) => s + (t.realizedPnL || 0), 0)
    return { total, wins, losses, totalPnL }
  }, [trades])

  return (
    <div className="space-y-4">
      <TabHeader title="Kapanan işlemler" sub={`${trades.length} işlem`}>
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
            description="Bot yeni sinyallerle çalıştıkça kapanan işlemler burada listelenir."
          />
        </Card>
      ) : (
        <TableShell>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
                <th className="px-3 py-2 font-semibold">Sembol</th>
                <th className="px-3 py-2 font-semibold">Strateji</th>
                <th className="px-3 py-2 font-semibold">Giriş → Çıkış</th>
                <th className="px-3 py-2 text-right font-semibold">Giriş</th>
                <th className="px-3 py-2 text-right font-semibold">Çıkış</th>
                <th className="px-3 py-2 text-right font-semibold">Kâr/Zarar</th>
                <th className="px-3 py-2 font-semibold">Çıkış Sebebi</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => {
                const isExp = expanded === t.id
                const win = (t.realizedPnL || 0) >= 0
                return (
                  <FragmentRow key={t.id}>
                    <tr className="border-t border-dark-700/60">
                      <td className="px-3 py-2.5 font-semibold text-white">{t.symbol}</td>
                      <td className="px-3 py-2.5">
                        <Chip tone={t.strategy === 'trend' ? 'info' : 'gold'}>
                          {t.strategy === 'trend' ? 'Trend' : 'Reversion'}
                        </Chip>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-400">
                        {fmtDateShort(t.entryDate)} → {fmtDateShort(t.exitDate)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-300">{fmtMoney(t.entryPrice)}</td>
                      <td className="px-3 py-2.5 text-right text-gray-300">{fmtMoney(t.exitPrice)}</td>
                      <td className={`px-3 py-2.5 text-right font-semibold ${win ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {fmtPct(t.realizedPnLPct)}
                        <div className="text-[10px] font-normal text-gray-500">{fmtMoney(t.realizedPnL)} TL</div>
                      </td>
                      <td className="px-3 py-2.5"><ExitReasonChip reason={t.exitReason} /></td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          onClick={() => setExpanded(isExp ? null : t.id)}
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
                          <NotesList notes={t.notes || []} />
                        </td>
                      </tr>
                    )}
                  </FragmentRow>
                )
              })}
            </tbody>
          </table>
        </TableShell>
      )}
    </div>
  )
}

function ExitReasonChip({ reason }) {
  const map = {
    target:         { tone: 'good',    label: 'Hedef',        icon: Target },
    stop:           { tone: 'bad',     label: 'Stop',         icon: XCircle },
    timeout:        { tone: 'warn',    label: 'Süre doldu',   icon: Clock },
    signal_dropped: { tone: 'neutral', label: 'Sinyal düştü', icon: AlertTriangle },
  }
  const m = map[reason] || { tone: 'neutral', label: reason || '—', icon: Activity }
  return <Chip tone={m.tone} icon={m.icon}>{m.label}</Chip>
}

// ── Sinyal Kaydı ──────────────────────────────────────────────────────────
const OUTCOME = {
  signaled:       { tone: 'neutral', label: 'Verildi' },
  triggered:      { tone: 'info',    label: 'Tetiklendi' },
  closed_target:  { tone: 'good',    label: 'Hedef tuttu' },
  closed_stop:    { tone: 'bad',     label: 'Stop oldu' },
  closed_timeout: { tone: 'warn',    label: 'Süre doldu' },
  closed_dropped: { tone: 'neutral', label: 'Sinyal düştü' },
  closed_other:   { tone: 'neutral', label: 'Kapandı' },
  no_trigger:     { tone: 'neutral', label: 'Tetiklenmedi' },
}

function FilterField({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</span>
      {children}
    </label>
  )
}

function SignalLogTab({ entries, onRefresh, loading, filters, setFilters }) {
  return (
    <div className="space-y-4">
      <TabHeader title="Sinyal kaydı" sub={`${entries.length} kayıt · değişmez geçmiş`}>
        <Button variant="ghost" size="sm" icon={RefreshCw} loading={loading} onClick={onRefresh}>
          Yenile
        </Button>
      </TabHeader>

      <Card padding="sm">
        <div className="flex flex-wrap items-end gap-3">
          <FilterField label="Sembol">
            <input
              value={filters.symbol || ''}
              placeholder="THYAO"
              onChange={(e) => setFilters((f) => ({ ...f, symbol: e.target.value.toUpperCase() }))}
              className="input w-32 text-sm"
            />
          </FilterField>
          <FilterField label="Strateji">
            <select
              value={filters.strategy || ''}
              onChange={(e) => setFilters((f) => ({ ...f, strategy: e.target.value }))}
              className="input text-sm"
            >
              <option value="">Hepsi</option>
              <option value="trend">Trend</option>
              <option value="reversion">Reversion</option>
            </select>
          </FilterField>
          <FilterField label="Durum">
            <select
              value={filters.outcome || ''}
              onChange={(e) => setFilters((f) => ({ ...f, outcome: e.target.value }))}
              className="input text-sm"
            >
              <option value="">Hepsi</option>
              <option value="signaled">Verildi</option>
              <option value="triggered">Tetiklendi (açık)</option>
              <option value="closed_target">Hedef tuttu</option>
              <option value="closed_stop">Stop oldu</option>
              <option value="closed_timeout">Süre doldu</option>
              <option value="closed_dropped">Sinyal düştü</option>
              <option value="no_trigger">Tetiklenmedi</option>
            </select>
          </FilterField>
          <FilterField label="En eski tarih">
            <input
              type="date"
              value={filters.fromDate || ''}
              onChange={(e) => setFilters((f) => ({ ...f, fromDate: e.target.value }))}
              className="input text-sm"
            />
          </FilterField>
        </div>
      </Card>

      <TableShell>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
              <th className="px-3 py-2 font-semibold">Verilme</th>
              <th className="px-3 py-2 font-semibold">Faz</th>
              <th className="px-3 py-2 font-semibold">Sembol</th>
              <th className="px-3 py-2 font-semibold">Strateji</th>
              <th className="px-3 py-2 text-right font-semibold">Giriş</th>
              <th className="px-3 py-2 text-right font-semibold">Stop</th>
              <th className="px-3 py-2 text-right font-semibold">Hedef</th>
              <th className="px-3 py-2 text-right font-semibold">Skor</th>
              <th className="px-3 py-2 font-semibold">Durum</th>
              <th className="px-3 py-2 font-semibold">Biten</th>
              <th className="px-3 py-2 text-right font-semibold">Sonuç</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-10 text-center text-xs text-gray-500">
                  Filtrelere uyan kayıt yok.
                </td>
              </tr>
            )}
            {entries.map((e) => {
              const o = OUTCOME[e.outcome] || OUTCOME.signaled
              return (
                <tr key={e.id} className="border-t border-dark-700/60">
                  <td className="px-3 py-2.5 text-xs text-gray-400">{fmtDateShort(e.signalDate)}</td>
                  <td className="px-3 py-2.5 text-[11px] uppercase text-gray-400">{e.signalPhase}</td>
                  <td className="px-3 py-2.5 font-semibold text-white">{e.symbol}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-400">
                    {e.strategy === 'trend' ? 'Trend' : 'Reversion'}
                  </td>
                  <td className="px-3 py-2.5 text-right text-gray-300">{fmtMoney(e.entry)}</td>
                  <td className="px-3 py-2.5 text-right text-rose-300">{fmtMoney(e.stop)}</td>
                  <td className="px-3 py-2.5 text-right text-emerald-300">{fmtMoney(e.target)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-300">{e.totalScore ?? '—'}</td>
                  <td className="px-3 py-2.5"><Chip tone={o.tone}>{o.label}</Chip></td>
                  <td className="px-3 py-2.5 text-xs text-gray-400">
                    {e.exitDate ? fmtDateShort(e.exitDate) : '—'}
                  </td>
                  <td className={`px-3 py-2.5 text-right text-xs font-semibold ${(e.finalReturnPct ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {e.finalReturnPct != null ? fmtPct(e.finalReturnPct) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableShell>

      <p className="px-1 text-[11px] leading-relaxed text-gray-500">
        Sinyal kaydı değişmezdir — verilen bir sinyalin giriş/stop/hedef/skor değerleri sonradan
        düzenlenmez. Yalnızca sonuç alanları (tetiklendi mi, ne zaman kapandı, ne kadar getiri
        sağladı) bot çalışırken eklenir.
      </p>
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

function SettingsTab({ status, isAdmin, onReset, onTick, busy }) {
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
          <SettingRow label="Başlangıç sermayesi" value={`${fmtMoney(p.capital)} TL`} />
          <SettingRow
            label="Pozisyon büyüklüğü"
            value={`Her sinyalde sermayenin %${((c.POSITION_SIZE_PCT || 0.05) * 100).toFixed(1)}'i`}
          />
          <SettingRow label="En fazla açık pozisyon" value={c.MAX_CONCURRENT_POSITIONS ?? '—'} />
          <SettingRow label="Komisyon" value={`%${((c.COMMISSION_PCT || 0.002) * 100).toFixed(2)}`} />
          <SettingRow label="Kayma payı (slippage)" value={`%${((c.SLIPPAGE_PCT || 0.001) * 100).toFixed(2)}`} />
          <SettingRow label="Zaman sınırı" value={`${c.TIMEOUT_BUSINESS_DAYS ?? 10} işgünü`} />
          <SettingRow label="Stop-loss kuralı" value="Kâr büyüdükçe kademeli yukarı çekilir" />
        </div>
      </Card>

      {isAdmin && (
        <Card tone="ember" className="space-y-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-rose-300">
            <AlertTriangle className="h-4 w-4" /> Yönetici kontrolleri
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={onTick}>
              Botu manuel çalıştır
            </Button>
            {!confirmingReset ? (
              <Button variant="danger" size="sm" onClick={() => setConfirmingReset(true)}>
                Botu sıfırla
              </Button>
            ) : (
              <>
                <span className="text-xs text-gray-400">
                  Tüm pozisyon, işlem ve sinyal kaydı silinecek. Emin misin?
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
        </Card>
      )}
    </div>
  )
}

// ── Ana sayfa ──────────────────────────────────────────────────────────────
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
    <div className="mx-auto max-w-7xl space-y-4">
      <BotTabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'overview' && (
        <OverviewTab status={status} loading={loading} onRefresh={refresh} />
      )}
      {tab === 'open' && (
        <OpenPositionsTab open={open} pending={pending} loading={loading} onRefresh={loadPositions} />
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
