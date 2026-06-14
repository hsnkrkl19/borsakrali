/**
 * KriptoBot.jsx — Borsa Krali Kripto Botu (long + short)
 *
 * Kripto sinyallerini (Spot AL / Futures Long / Futures Short) sanal USD
 * portföyle işleme çevirir. BIST botundan farkı: hem yükselişe (long) hem
 * düşüşe (short) pozisyon açabilir. Her işlem için "ne zaman, neye göre,
 * sonuç ne" üç soruya da net cevap verir — sinyalin karşıladığı koşullar
 * tek tek listelenir.
 *
 * 5 sekme: Genel Bakış · Açık Pozisyonlar · İşlem Geçmişi · Sinyal Kaydı · Ayarlar
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Bitcoin, TrendingUp, TrendingDown, ListChecks, History, FileText, Settings,
  RefreshCw, ChevronDown, ChevronUp, AlertTriangle, Activity, Award, Target,
  Check, X, ArrowUpRight, ArrowDownRight, Sparkles, Clock, Flag,
} from 'lucide-react'
import api from '../services/api'
import { Button, Card, EmptyState } from '../components/ui'
import {
  fmtPct, fmtDate, fmtDateShort,
  TabHeader, BotTabs, StatCard, Chip, TableShell, HowItWorks, NotesList,
  EquityChart, TradeLedger, exitOutcome, signalOutcome,
} from '../components/BotKit'

// ── USD formatlayıcılar ────────────────────────────────────────────────────
function num(v, digits = 2) {
  if (v == null || !isFinite(v)) return '—'
  return Number(v).toLocaleString('tr-TR', { maximumFractionDigits: digits, minimumFractionDigits: digits })
}
function usd(v, digits = 2) {
  if (v == null || !isFinite(v)) return '—'
  return `$${num(v, digits)}`
}
// Kripto fiyatı büyüklüğe göre ondalık ($72.000 → $0.00007)
function px(v) {
  if (v == null || !isFinite(v)) return '—'
  const a = Math.abs(v)
  const d = a >= 100 ? 2 : a >= 1 ? 3 : a >= 0.01 ? 5 : 8
  return `$${num(v, d)}`
}

const STRAT_LABEL = {
  spot_long: 'Spot AL',
  futures_long: 'Futures Long',
  futures_short: 'Futures Short',
}
const STRAT_DESC = {
  spot_long: 'Güvenli trend takip — kaldıraçsız al-tut mantığı',
  futures_long: 'Momentum patlaması — agresif yükseliş',
  futures_short: 'Bozulan trend — düşüşten kazanç',
}
const DIR_META = {
  long: { label: 'LONG', tone: 'good', icon: ArrowUpRight, word: 'Yükseliş' },
  short: { label: 'SHORT', tone: 'bad', icon: ArrowDownRight, word: 'Düşüş' },
}

function FragmentRow({ children }) { return <>{children}</> }

// ── Koşul listesi — "neye göre alındı" ─────────────────────────────────────
function ConditionList({ conditions }) {
  if (!Array.isArray(conditions) || conditions.length === 0) return null
  return (
    <div className="rounded-lg border border-gold-500/15 bg-gold-500/[0.04] p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gold-300/90">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Sinyal neye göre verildi
      </div>
      <ul className="space-y-1.5">
        {conditions.map((c, i) => (
          <li key={i} className="flex items-start gap-2 text-xs">
            {c.met ? (
              <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-400" aria-hidden="true" />
            ) : (
              <X className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-gray-600" aria-hidden="true" />
            )}
            <span className="min-w-0">
              <span className={c.met ? 'font-medium text-gray-200' : 'text-gray-500'}>{c.label}</span>
              {c.required && <span className="ml-1 text-[10px] text-gold-400">(zorunlu)</span>}
              {c.why && <span className="block text-[11px] leading-snug text-gray-500">{c.why}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── İşlem hikayesi — ne zaman / neye göre / sonuç ──────────────────────────
function PositionDetail({ pos, closed }) {
  const dir = DIR_META[pos.direction] || DIR_META.long
  const story = pos.direction === 'short'
    ? `${fmtDateShort(pos.signalDate)} tarihli "${STRAT_LABEL[pos.strategy]}" sinyaliyle ${px(pos.entryPrice)}'den AÇIĞA SATILDI (short). Fiyat düşerse kazanır; hedef ${px(pos.originalTarget)}, stop ${px(pos.originalStop)}.`
    : `${fmtDateShort(pos.signalDate)} tarihli "${STRAT_LABEL[pos.strategy]}" sinyaliyle ${px(pos.entryPrice)}'den ALINDI (long). Fiyat yükselirse kazanır; hedef ${px(pos.originalTarget)}, stop ${px(pos.originalStop)}.`

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg border border-dark-700 bg-dark-800/40 p-3 text-xs leading-relaxed text-gray-300">
        <Flag className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-gray-500" aria-hidden="true" />
        <span>{story}</span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-dark-700 bg-dark-800/30 p-2.5">
          <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            <Clock className="h-3 w-3" /> Ne zaman
          </div>
          <div className="text-xs text-gray-300">Açılış: {fmtDate(pos.entryDate)}</div>
          <div className="text-[11px] text-gray-500">Sinyal: {fmtDateShort(pos.signalDate)} · {pos.signalPhase}</div>
          {closed && <div className="text-[11px] text-gray-500">Kapanış: {fmtDate(pos.exitDate)}</div>}
        </div>
        <div className="rounded-lg border border-dark-700 bg-dark-800/30 p-2.5">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Plan</div>
          <div className="text-xs text-gray-300">Giriş: {px(pos.entryPrice)}</div>
          <div className="text-[11px] text-emerald-300">Hedef: {px(pos.originalTarget)}</div>
          <div className="text-[11px] text-rose-300">
            Stop: {px(pos.currentStop ?? pos.originalStop)}
            {pos.currentStop != null && pos.originalStop != null &&
              Math.abs(pos.currentStop - pos.originalStop) > 1e-9 && (
              <span className="text-gray-500"> (ilk: {px(pos.originalStop)})</span>
            )}
          </div>
          {pos.suggestedLeverage > 1 && (
            <div className="text-[11px] text-gray-500">Önerilen kaldıraç: {pos.suggestedLeverage}x</div>
          )}
        </div>
        <div className="rounded-lg border border-dark-700 bg-dark-800/30 p-2.5">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            {closed ? 'Sonuç' : 'Durum'}
          </div>
          {closed ? (
            <>
              <div className={`text-sm font-semibold ${(pos.realizedPnL || 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {fmtPct(pos.realizedPnLPct)} · {usd(pos.realizedPnL)}
              </div>
              {(() => { const o = exitOutcome(pos.exitReason, pos.realizedPnL); return <Chip tone={o.tone}>{o.label}</Chip> })()}
            </>
          ) : (
            <>
              <div className="text-xs text-gray-300">Son fiyat: {px(pos.lastPrice ?? pos.entryPrice)}</div>
              <div className="text-[11px] text-gray-500">Miktar: {num(pos.shares, pos.shares < 1 ? 6 : 3)} adet</div>
              <div className="text-[11px] text-gray-500">Büyüklük: {usd(pos.positionSize)}</div>
            </>
          )}
        </div>
      </div>

      <ConditionList conditions={pos.signalConditions} />
      <div>
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">İşlem günlüğü</div>
        <NotesList notes={pos.notes || []} />
      </div>
    </div>
  )
}

// ── Genel Bakış ────────────────────────────────────────────────────────────
function OverviewTab({ status, loading, onRefresh }) {
  const p = status?.portfolio || {}
  return (
    <div className="space-y-4">
      <TabHeader title="Kripto bot performansı">
        <Button variant="ghost" size="sm" icon={RefreshCw} loading={loading} onClick={onRefresh}>Yenile</Button>
      </TabHeader>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={Award} label="Toplam Getiri" value={fmtPct(p.totalRealizedPnLPct)}
          sub={`${usd(p.totalRealizedPnL)} gerçekleşen`} tone={(p.totalRealizedPnLPct || 0) >= 0 ? 'good' : 'bad'} />
        <StatCard icon={Target} label="Kazanma Oranı" value={`%${(p.winRate ?? 0).toFixed(1)}`}
          sub={`${p.winCount || 0} kazanç · ${p.lossCount || 0} kayıp`} tone="gold" />
        <StatCard icon={Activity} label="Açık Pozisyon" value={`${status?.openCount ?? 0}`}
          sub={`${usd(status?.unrealizedPnL)} anlık K/Z`} />
        <StatCard icon={Bitcoin} label="Sanal Sermaye" value={usd(status?.equity)}
          sub={`Nakit ${usd(p.cash)} · Başlangıç ${usd(p.capital)}`} />
      </div>

      <Card>
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Sanal portföy eğrisi (USD)</div>
        {(p.equityHistory || []).length > 1 ? (
          <EquityChart data={p.equityHistory} />
        ) : (
          <p className="py-8 text-center text-xs text-gray-500">İlk işlemler kapandıkça portföy eğrisi burada görünecek.</p>
        )}
      </Card>

      <HowItWorks summary="Kripto sinyallerini sanal USD parayla işler — hem yükselişe (long) hem düşüşe (short).">
        Bot, kripto tarayıcısının ürettiği üç sinyal listesini sanal portföyle takip eder:{' '}
        <strong className="text-emerald-300">Spot AL</strong> ve{' '}
        <strong className="text-emerald-300">Futures Long</strong> sinyallerinde fiyatın yükselişine{' '}
        <strong className="text-gray-200">LONG</strong> açar;{' '}
        <strong className="text-rose-300">Futures Short</strong> sinyallerinde fiyatın düşüşüne{' '}
        <strong className="text-gray-200">SHORT</strong> açar. Her pozisyon market fiyatından açılır,
        kâr büyüdükçe stop kademeli olarak kâr yönünde çekilir. Pozisyon hedefe, stop'a veya 7 gün
        sınırına ulaşınca kapanır. Bir pozisyona neden girildiğini görmek için satırı aç — sinyalin
        karşıladığı tüm koşullar tek tek listelenir.
      </HowItWorks>
    </div>
  )
}

// ── Açık Pozisyonlar ───────────────────────────────────────────────────────
function OpenPositionsTab({ open, onRefresh, loading }) {
  const [expanded, setExpanded] = useState(null)
  const toggle = (id) => setExpanded((e) => (e === id ? null : id))

  return (
    <div className="space-y-4">
      <TabHeader title="Açık pozisyonlar" sub={`${open.length} açık pozisyon`}>
        <Button variant="ghost" size="sm" icon={RefreshCw} loading={loading} onClick={onRefresh}>Yenile</Button>
      </TabHeader>

      {open.length === 0 ? (
        <Card padding="none">
          <EmptyState icon={ListChecks} title="Açık pozisyon yok"
            description="Yeni kripto sinyalleri geldikçe bot pozisyon açar ve burada görünür." />
        </Card>
      ) : (
        <TableShell title="Portföy">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
                <th className="px-3 py-2 font-semibold">Coin</th>
                <th className="px-3 py-2 font-semibold">Yön</th>
                <th className="px-3 py-2 font-semibold">Strateji</th>
                <th className="px-3 py-2 text-right font-semibold">Giriş</th>
                <th className="px-3 py-2 text-right font-semibold">Son</th>
                <th className="px-3 py-2 text-right font-semibold">Hedef</th>
                <th className="px-3 py-2 text-right font-semibold">Stop</th>
                <th className="px-3 py-2 text-right font-semibold">Anlık K/Z</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {open.map((pos) => {
                const dir = DIR_META[pos.direction] || DIR_META.long
                const last = pos.lastPrice ?? pos.entryPrice
                const pnlPct = pos.entryPrice
                  ? ((pos.direction === 'short' ? (pos.entryPrice - last) : (last - pos.entryPrice)) / pos.entryPrice) * 100
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
                        <Chip tone={dir.tone} icon={dir.icon}>{dir.label}</Chip>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-400">{STRAT_LABEL[pos.strategy] || pos.strategy}</td>
                      <td className="px-3 py-2.5 text-right text-gray-300">{px(pos.entryPrice)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-white">{px(last)}</td>
                      <td className="px-3 py-2.5 text-right text-emerald-300">{px(pos.originalTarget)}</td>
                      <td className="px-3 py-2.5 text-right text-rose-300">{px(pos.currentStop ?? pos.originalStop)}</td>
                      <td className={`px-3 py-2.5 text-right font-semibold ${(pnlPct || 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {fmtPct(pnlPct)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button onClick={() => toggle(pos.id)} className="rounded p-1 text-gray-400 hover:bg-white/5 hover:text-white" aria-label="Detay">
                          {isExp ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </td>
                    </tr>
                    {isExp && (
                      <tr className="bg-white/[0.02]">
                        <td colSpan={9} className="px-3 py-3"><PositionDetail pos={pos} closed={false} /></td>
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

// ── İşlem Geçmişi ──────────────────────────────────────────────────────────
function TradesTab({ trades, onRefresh, loading }) {
  const summary = useMemo(() => {
    const total = trades.length
    if (!total) return null
    const wins = trades.filter((t) => (t.realizedPnL || 0) > 0).length
    const losses = trades.filter((t) => (t.realizedPnL || 0) < 0).length
    const totalPnL = trades.reduce((s, t) => s + (t.realizedPnL || 0), 0)
    return { total, wins, losses, totalPnL }
  }, [trades])

  const ledger = useMemo(() => trades.map((t) => ({
    id: t.id,
    symbol: t.symbol,
    outcome: exitOutcome(t.exitReason, t.realizedPnL),
    buyAt: t.entryDate,
    sellAt: t.exitDate,
    buyText: `${(DIR_META[t.direction] || DIR_META.long).label} ${px(t.entryPrice)}`,
    sellText: px(t.exitPrice),
    pnlText: fmtPct(t.realizedPnLPct),
    pnlSubText: usd(t.realizedPnL),
    win: (t.realizedPnL || 0) >= 0,
    _src: t,
  })), [trades])

  return (
    <div className="space-y-4">
      <TabHeader title="Kapanan işlemler" sub={`${trades.length} işlem · gün gün`}>
        <Button variant="ghost" size="sm" icon={RefreshCw} loading={loading} onClick={onRefresh}>Yenile</Button>
      </TabHeader>

      {summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Toplam İşlem" value={summary.total} />
          <StatCard label="Kazanç" value={summary.wins} tone="good" />
          <StatCard label="Kayıp" value={summary.losses} tone="bad" />
          <StatCard label="Net Kâr/Zarar" value={usd(summary.totalPnL)} tone={summary.totalPnL >= 0 ? 'good' : 'bad'} />
        </div>
      )}

      {trades.length === 0 ? (
        <Card padding="none">
          <EmptyState icon={History} title="Kapanmış işlem yok"
            description="Bot çalıştıkça kapanan kripto işlemleri burada listelenir." />
        </Card>
      ) : (
        <TradeLedger trades={ledger} entryLabel="AÇILIŞ" exitLabel="KAPANIŞ"
          renderDetail={(lt) => <PositionDetail pos={lt._src} closed />} />
      )}
    </div>
  )
}

// ── Sinyal Kaydı ───────────────────────────────────────────────────────────
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
        <Button variant="ghost" size="sm" icon={RefreshCw} loading={loading} onClick={onRefresh}>Yenile</Button>
      </TabHeader>

      <Card padding="sm">
        <div className="flex flex-wrap items-end gap-3">
          <FilterField label="Coin">
            <input value={filters.symbol || ''} placeholder="BTC"
              onChange={(e) => setFilters((f) => ({ ...f, symbol: e.target.value.toUpperCase() }))}
              className="input w-28 text-sm" />
          </FilterField>
          <FilterField label="Strateji">
            <select value={filters.strategy || ''} onChange={(e) => setFilters((f) => ({ ...f, strategy: e.target.value }))} className="input text-sm">
              <option value="">Hepsi</option>
              <option value="spot_long">Spot AL</option>
              <option value="futures_long">Futures Long</option>
              <option value="futures_short">Futures Short</option>
            </select>
          </FilterField>
          <FilterField label="Durum">
            <select value={filters.outcome || ''} onChange={(e) => setFilters((f) => ({ ...f, outcome: e.target.value }))} className="input text-sm">
              <option value="">Hepsi</option>
              <option value="triggered">Açık</option>
              <option value="closed_target">Hedef tuttu</option>
              <option value="closed_stop">Stop (kâr/zarar)</option>
              <option value="closed_timeout">Süre doldu</option>
            </select>
          </FilterField>
        </div>
      </Card>

      <TableShell>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
              <th className="px-3 py-2 font-semibold">Tarih</th>
              <th className="px-3 py-2 font-semibold">Coin</th>
              <th className="px-3 py-2 font-semibold">Yön</th>
              <th className="px-3 py-2 font-semibold">Strateji</th>
              <th className="px-3 py-2 text-right font-semibold">Giriş</th>
              <th className="px-3 py-2 text-right font-semibold">Hedef</th>
              <th className="px-3 py-2 text-right font-semibold">Stop</th>
              <th className="px-3 py-2 text-right font-semibold">Skor</th>
              <th className="px-3 py-2 font-semibold">Durum</th>
              <th className="px-3 py-2 text-right font-semibold">Sonuç</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-10 text-center text-xs text-gray-500">Filtrelere uyan kayıt yok.</td></tr>
            )}
            {entries.map((e) => {
              const o = signalOutcome(e.outcome, e.finalPnL)
              const dir = DIR_META[e.direction] || DIR_META.long
              return (
                <tr key={e.id} className="border-t border-dark-700/60">
                  <td className="px-3 py-2.5 text-xs text-gray-400">{fmtDateShort(e.signalDate)} · {e.signalPhase}</td>
                  <td className="px-3 py-2.5 font-semibold text-white">{e.symbol}</td>
                  <td className="px-3 py-2.5"><Chip tone={dir.tone}>{dir.label}</Chip></td>
                  <td className="px-3 py-2.5 text-xs text-gray-400">{STRAT_LABEL[e.strategy] || e.strategy}</td>
                  <td className="px-3 py-2.5 text-right text-gray-300">{px(e.entry)}</td>
                  <td className="px-3 py-2.5 text-right text-emerald-300">{px(e.target)}</td>
                  <td className="px-3 py-2.5 text-right text-rose-300">{px(e.stop)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-300">{e.totalScore ?? '—'}</td>
                  <td className="px-3 py-2.5"><Chip tone={o.tone}>{o.label}</Chip></td>
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
        Sinyal kaydı değişmezdir — verilen bir sinyalin giriş/hedef/stop/skor değerleri sonradan
        düzenlenmez. Yalnızca sonuç alanları (açıldı mı, ne zaman kapandı, ne kadar getiri) bot
        çalışırken eklenir.
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
          <SettingRow label="Başlangıç sermayesi" value={usd(p.capital)} />
          <SettingRow label="Pozisyon büyüklüğü" value={`Her sinyalde nakdin %${((c.POSITION_SIZE_PCT || 0.1) * 100).toFixed(0)}'i`} />
          <SettingRow label="En fazla açık pozisyon" value={c.MAX_CONCURRENT_POSITIONS ?? '—'} />
          <SettingRow label="Stratejiden işlenen" value={`En iyi ${c.TOP_PER_STRATEGY ?? 5} sinyal`} />
          <SettingRow label="Yön" value="Long + Short serbest" />
          <SettingRow label="Komisyon" value={`%${((c.COMMISSION_PCT || 0.001) * 100).toFixed(2)}`} />
          <SettingRow label="Kayma payı (slippage)" value={`%${((c.SLIPPAGE_PCT || 0.0005) * 100).toFixed(2)}`} />
          <SettingRow label="Zaman sınırı" value={`${c.TIMEOUT_DAYS ?? 7} gün`} />
          <SettingRow label="Stop-loss kuralı" value="Kâr büyüdükçe kâr yönünde çekilir" />
        </div>
      </Card>

      {isAdmin && (
        <Card tone="ember" className="space-y-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-rose-300">
            <AlertTriangle className="h-4 w-4" /> Yönetici kontrolleri
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={onTick}>Botu manuel çalıştır</Button>
            {!confirmingReset ? (
              <Button variant="danger" size="sm" onClick={() => setConfirmingReset(true)}>Botu sıfırla</Button>
            ) : (
              <>
                <span className="text-xs text-gray-400">Tüm pozisyon, işlem ve sinyal kaydı silinecek. Emin misin?</span>
                <Button variant="danger" size="sm" loading={busy} onClick={() => { setConfirmingReset(false); onReset() }}>Evet, sıfırla</Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmingReset(false)}>Vazgeç</Button>
              </>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}

const TABS = [
  { id: 'overview', label: 'Genel Bakış', icon: TrendingUp },
  { id: 'open', label: 'Açık Pozisyonlar', icon: ListChecks },
  { id: 'trades', label: 'İşlem Geçmişi', icon: History },
  { id: 'log', label: 'Sinyal Kaydı', icon: FileText },
  { id: 'settings', label: 'Ayarlar', icon: Settings },
]

// ── Ana sayfa ──────────────────────────────────────────────────────────────
export default function KriptoBot() {
  const [tab, setTab] = useState('overview')
  const [status, setStatus] = useState(null)
  const [open, setOpen] = useState([])
  const [trades, setTrades] = useState([])
  const [logEntries, setLogEntries] = useState([])
  const [logFilters, setLogFilters] = useState({})
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  const isAdmin = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user'))?.role === 'admin' } catch { return false }
  }, [])

  const loadStatus = useCallback(async () => {
    try { const { data } = await api.get('/crypto-bot/status'); if (data?.ok) setStatus(data.status) } catch (_) {}
  }, [])
  const loadPositions = useCallback(async () => {
    try { const { data } = await api.get('/crypto-bot/positions'); if (data?.ok) setOpen(data.open || []) } catch (_) {}
  }, [])
  const loadTrades = useCallback(async () => {
    try { const { data } = await api.get('/crypto-bot/trades', { params: { limit: 200 } }); if (data?.ok) setTrades(data.trades || []) } catch (_) {}
  }, [])
  const loadLog = useCallback(async () => {
    try { const { data } = await api.get('/crypto-bot/signal-log', { params: { ...logFilters, limit: 500 } }); if (data?.ok) setLogEntries(data.entries || []) } catch (_) {}
  }, [logFilters])

  const refresh = useCallback(async () => {
    setLoading(true)
    await Promise.all([loadStatus(), loadPositions(), loadTrades(), loadLog()])
    setLoading(false)
  }, [loadStatus, loadPositions, loadTrades, loadLog])

  useEffect(() => { refresh() }, [])
  useEffect(() => { loadLog() }, [logFilters, loadLog])
  useEffect(() => {
    if (tab === 'overview' || tab === 'settings') loadStatus()
    if (tab === 'open') loadPositions()
    if (tab === 'trades') loadTrades()
    if (tab === 'log') loadLog()
  }, [tab, loadStatus, loadPositions, loadTrades, loadLog])

  const handleReset = async () => {
    setBusy(true)
    try { await api.post('/crypto-bot/reset'); await refresh() }
    catch (e) { alert(`Reset hata: ${e?.response?.data?.error || e.message}`) }
    finally { setBusy(false) }
  }
  const handleTick = async () => {
    setBusy(true)
    try { await api.post('/crypto-bot/tick'); await refresh() }
    catch (e) { alert(`Tick hata: ${e?.response?.data?.error || e.message}`) }
    finally { setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <BotTabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'overview' && <OverviewTab status={status} loading={loading} onRefresh={refresh} />}
      {tab === 'open' && <OpenPositionsTab open={open} loading={loading} onRefresh={loadPositions} />}
      {tab === 'trades' && <TradesTab trades={trades} loading={loading} onRefresh={loadTrades} />}
      {tab === 'log' && <SignalLogTab entries={logEntries} loading={loading} onRefresh={loadLog} filters={logFilters} setFilters={setLogFilters} />}
      {tab === 'settings' && <SettingsTab status={status} isAdmin={isAdmin} onReset={handleReset} onTick={handleTick} busy={busy} />}
    </div>
  )
}
