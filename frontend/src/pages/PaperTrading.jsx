/**
 * Paper Trading Sayfası — Borsa Krali
 *
 * Backend paperTradingService'in tüm endpoint'lerini tüketir:
 *   - GET  /api/paper-trading/portfolio
 *   - POST /api/paper-trading/close   { posId }
 *   - POST /api/paper-trading/reset
 *   - GET  /api/paper-trading/leaderboard
 *
 * 3 sekme: Açık Pozisyonlar · Geçmiş · Sıralama
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RefreshCw, TrendingUp, TrendingDown, Wallet, Trophy, History,
  X, RotateCcw, ExternalLink, Activity, Layers,
} from 'lucide-react'
import api from '../services/api'
import { Button, Card, EmptyState, Spinner } from '../components/ui'
import { TabHeader, BotTabs, StatCard, Chip, TableShell, HowItWorks } from '../components/BotKit'

function formatUsd(v, digits = 2) {
  if (v == null) return '—'
  const n = Number(v)
  if (!isFinite(n)) return '—'
  if (Math.abs(n) >= 1000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: digits })}`
  return `$${n.toFixed(digits)}`
}

function formatPrice(v) {
  if (v == null) return '—'
  const n = Number(v)
  if (n >= 1000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
  if (n >= 10) return `$${n.toFixed(3)}`
  if (n >= 1) return `$${n.toFixed(4)}`
  if (n >= 0.01) return `$${n.toFixed(5)}`
  return `$${n.toFixed(8)}`
}

function formatPct(v) {
  if (v == null) return '—'
  const sign = v >= 0 ? '+' : ''
  return `${sign}${v.toFixed(2)}%`
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function PaperTrading() {
  const navigate = useNavigate()
  const [portfolio, setPortfolio] = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState('open')
  const [closingPosId, setClosingPosId] = useState(null)
  const [resetting, setResetting] = useState(false)

  const load = useCallback(async () => {
    try {
      const [pRes, lRes] = await Promise.allSettled([
        api.get('/paper-trading/portfolio'),
        api.get('/paper-trading/leaderboard?limit=20'),
      ])
      if (pRes.status === 'fulfilled') setPortfolio(pRes.value.data)
      if (lRes.status === 'fulfilled') setLeaderboard(lRes.value.data?.leaderboard || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Auto refresh 20sn — açık pozisyonlar canlı mark-to-market
  useEffect(() => {
    const i = setInterval(load, 20 * 1000)
    return () => clearInterval(i)
  }, [load])

  const handleRefresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  const handleClose = async (posId) => {
    setClosingPosId(posId)
    try {
      await api.post('/paper-trading/close', { posId })
      await load()
    } catch (e) {
      // sessiz
    } finally {
      setClosingPosId(null)
    }
  }

  const handleReset = async () => {
    if (!confirm('Portföy sıfırlanacak. Tüm açık pozisyonlar ve geçmiş silinecek. Emin misin?')) return
    setResetting(true)
    try {
      await api.post('/paper-trading/reset', {})
      await load()
    } finally {
      setResetting(false)
    }
  }

  if (loading) {
    return (
      <Card className="flex flex-col items-center gap-3 py-12">
        <Spinner size={26} />
        <p className="text-sm text-gray-400">Portföy yükleniyor…</p>
      </Card>
    )
  }

  const equity = portfolio?.totalEquity ?? 0
  const balance = portfolio?.balance ?? 10000
  const totalPnl = portfolio?.totalPnl ?? 0
  const totalUnrealized = portfolio?.totalUnrealized ?? 0
  const winRate = portfolio?.winRate ?? 0
  const totalTrades = portfolio?.totalTrades ?? 0
  const wins = portfolio?.wins ?? 0
  const losses = portfolio?.losses ?? 0
  const openPositions = portfolio?.positions || []
  const history = portfolio?.history || []

  const TABS = [
    { id: 'open',        label: 'Açık Pozisyonlar', icon: Activity, count: openPositions.length },
    { id: 'history',     label: 'Geçmiş',           icon: History,  count: history.length },
    { id: 'leaderboard', label: 'Sıralama',         icon: Trophy,   count: leaderboard.length },
  ]

  return (
    <div className="space-y-4">
      <TabHeader title="Sanal portföyün" sub="Başlangıç bakiyesi $10.000">
        <Button variant="ghost" size="sm" icon={RefreshCw} loading={refreshing} onClick={handleRefresh}>
          Yenile
        </Button>
        <Button variant="danger" size="sm" icon={RotateCcw} loading={resetting} onClick={handleReset}>
          Sıfırla
        </Button>
      </TabHeader>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={Wallet}
          label="Toplam Değer"
          value={formatUsd(equity)}
          sub={`Bakiye ${formatUsd(balance)}`}
        />
        <StatCard
          icon={totalPnl >= 0 ? TrendingUp : TrendingDown}
          label="Toplam Kâr/Zarar"
          value={formatUsd(totalPnl)}
          sub={`${wins} kazanç · ${losses} kayıp`}
          tone={totalPnl >= 0 ? 'good' : 'bad'}
        />
        <StatCard
          icon={Activity}
          label="Açık Kâr/Zarar"
          value={formatUsd(totalUnrealized)}
          sub={`${openPositions.length} açık pozisyon`}
          tone={totalUnrealized >= 0 ? 'good' : 'bad'}
        />
        <StatCard
          icon={Trophy}
          label="Kârlı İşlem Oranı"
          value={`%${winRate}`}
          sub={`${totalTrades} toplam işlem`}
          tone="gold"
        />
      </div>

      <BotTabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'open' && (
        <OpenPositionsTab
          positions={openPositions}
          onClose={handleClose}
          closingPosId={closingPosId}
          navigate={navigate}
        />
      )}
      {activeTab === 'history' && <HistoryTab history={history} />}
      {activeTab === 'leaderboard' && <LeaderboardTab leaderboard={leaderboard} />}

      <HowItWorks summary="MTF tarayıcıdan seçtiğin sinyallerle gerçek para riske atmadan işlem dene.">
        <button
          onClick={() => navigate('/gunluk-tespitler?tab=mtf')}
          className="font-semibold text-gold-300 underline"
        >
          MTF tarayıcı
        </button>
        'da bir sinyale tıkla → "7-TF Detay" → "Paper Trade Aç". Sinyaldeki kaldıraçla $1.000'lık
        sabit pozisyon açılır. Stop veya hedef tetiklenince pozisyon otomatik kapanır. Başlangıç
        bakiyen $10.000'dır ve istediğin an Sıfırla ile başa dönebilirsin.
      </HowItWorks>
    </div>
  )
}

// ── Açık Pozisyonlar ──────────────────────────────────────────────────────
function OpenPositionsTab({ positions, onClose, closingPosId, navigate }) {
  if (positions.length === 0) {
    return (
      <Card padding="none">
        <EmptyState
          icon={Activity}
          title="Açık pozisyon yok"
          description="MTF tarayıcıdan bir sinyal seçip kağıt üzerinde pozisyon açabilirsin."
          action={
            <Button variant="gold" size="sm" icon={Layers} onClick={() => navigate('/gunluk-tespitler?tab=mtf')}>
              MTF Tarayıcı&apos;ya Git
            </Button>
          }
        />
      </Card>
    )
  }
  return (
    <div className="space-y-2">
      {positions.map((pos) => (
        <PositionCard key={pos.id} pos={pos} onClose={onClose} closing={closingPosId === pos.id} />
      ))}
    </div>
  )
}

function Metric({ label, value, valueCls = 'text-white', extra }) {
  return (
    <div className="rounded-lg bg-dark-800 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`font-mono text-xs ${valueCls}`}>
        {value}
        {extra && <span className="ml-1 text-[9px] text-gray-500">({extra})</span>}
      </div>
    </div>
  )
}

function PositionCard({ pos, onClose, closing }) {
  const isLong = pos.direction === 'long'
  const pnl = pos.unrealizedPnl || 0
  const pnlPct = pos.unrealizedPnlPct || 0
  const pnlCls = pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'

  const distToStop = pos.currentPrice && pos.stop
    ? ((pos.currentPrice - pos.stop) / pos.currentPrice * 100) * (isLong ? 1 : -1)
    : null
  const distToTarget = pos.currentPrice && pos.target1
    ? ((pos.target1 - pos.currentPrice) / pos.currentPrice * 100) * (isLong ? 1 : -1)
    : null

  return (
    <Card>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-base font-bold text-white">{pos.symbol}</span>
            <Chip tone={isLong ? 'good' : 'bad'}>{isLong ? '↑ LONG' : '↓ SHORT'}</Chip>
            {pos.timeframe && <Chip tone="neutral">{pos.timeframe}</Chip>}
            {pos.leverage > 1 && <Chip tone="warn">{pos.leverage}x</Chip>}
            {pos.grade && <Chip tone="gold">{pos.grade}</Chip>}
          </div>
          <p className="mt-1 text-[10px] text-gray-500">
            Açılış: {formatDate(pos.openedAt)} · Tutar {formatUsd(pos.notional)}
          </p>
        </div>
        <div className="text-right">
          <div className={`text-lg font-bold ${pnlCls}`}>
            {pnl >= 0 ? '+' : ''}{formatUsd(pnl)}
          </div>
          <div className={`text-xs ${pnlCls}`}>{formatPct(pnlPct)}</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Giriş" value={formatPrice(pos.entry)} />
        <Metric label="Mevcut" value={formatPrice(pos.currentPrice)} valueCls="text-gold-300" />
        <Metric
          label="Stop"
          value={formatPrice(pos.stop)}
          valueCls="text-rose-300"
          extra={distToStop != null ? `%${distToStop.toFixed(1)}` : null}
        />
        <Metric
          label="Hedef"
          value={formatPrice(pos.target1)}
          valueCls="text-emerald-300"
          extra={distToTarget != null ? `%${distToTarget.toFixed(1)}` : null}
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-dark-700 pt-3">
        <span className="text-[10px] text-gray-500">
          Boyut: <span className="font-mono text-gray-300">{pos.size?.toFixed(6)}</span>
          {pos.winProbability != null && (
            <> · Sinyal güveni <span className="text-gold-300">%{(pos.winProbability * 100).toFixed(0)}</span></>
          )}
        </span>
        <div className="flex items-center gap-2">
          <Button
            as="a"
            href={`https://www.binance.com/en/trade/${pos.symbol}_USDT`}
            target="_blank"
            rel="noopener noreferrer"
            variant="ghost"
            size="sm"
            icon={ExternalLink}
          >
            Binance
          </Button>
          <Button variant="danger" size="sm" icon={X} loading={closing} onClick={() => onClose(pos.id)}>
            {closing ? 'Kapanıyor…' : 'Kapat'}
          </Button>
        </div>
      </div>
    </Card>
  )
}

// ── Geçmiş ─────────────────────────────────────────────────────────────────
function HistoryTab({ history }) {
  if (history.length === 0) {
    return (
      <Card padding="none">
        <EmptyState icon={History} title="Kapanmış pozisyon yok" description="Kapanan işlemlerin burada listelenir." />
      </Card>
    )
  }
  return (
    <TableShell>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
            <th className="px-3 py-2 font-semibold">Coin</th>
            <th className="px-3 py-2 font-semibold">Yön</th>
            <th className="px-3 py-2 font-semibold">Zaman Dilimi</th>
            <th className="px-3 py-2 font-semibold">Sonuç</th>
            <th className="px-3 py-2 text-right font-semibold">Giriş</th>
            <th className="px-3 py-2 text-right font-semibold">Çıkış</th>
            <th className="px-3 py-2 text-right font-semibold">Kâr/Zarar</th>
            <th className="px-3 py-2 text-right font-semibold">Süre</th>
          </tr>
        </thead>
        <tbody>
          {history.map((h) => {
            const isLong = h.direction === 'long'
            const isWin = h.pnl > 0
            const outcome = h.exitReason === 'hit_target'
              ? { tone: 'good', label: 'Hedef' }
              : h.exitReason === 'hit_stop'
              ? { tone: 'bad', label: 'Stop' }
              : { tone: 'neutral', label: 'Manuel' }
            const dur = h.openedAt && h.closedAt
              ? Math.round((new Date(h.closedAt) - new Date(h.openedAt)) / 60000) + ' dk'
              : '—'
            return (
              <tr key={h.id} className="border-t border-dark-700/60">
                <td className="px-3 py-2.5 font-mono font-semibold text-white">{h.symbol}</td>
                <td className="px-3 py-2.5">
                  <Chip tone={isLong ? 'good' : 'bad'}>{isLong ? '↑ LONG' : '↓ SHORT'}</Chip>
                </td>
                <td className="px-3 py-2.5 font-mono text-xs text-gray-400">{h.timeframe || '—'}</td>
                <td className="px-3 py-2.5"><Chip tone={outcome.tone}>{outcome.label}</Chip></td>
                <td className="px-3 py-2.5 text-right font-mono text-gray-300">{formatPrice(h.entry)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-gray-300">{formatPrice(h.exitPrice)}</td>
                <td className={`px-3 py-2.5 text-right font-mono font-semibold ${isWin ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {h.pnl >= 0 ? '+' : ''}{formatUsd(h.pnl)}
                  <div className="text-[10px] font-normal text-gray-500">{formatPct(h.pnlPct)}</div>
                </td>
                <td className="px-3 py-2.5 text-right text-xs text-gray-500">{dur}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </TableShell>
  )
}

// ── Sıralama ───────────────────────────────────────────────────────────────
function LeaderboardTab({ leaderboard }) {
  if (leaderboard.length === 0) {
    return (
      <Card padding="none">
        <EmptyState icon={Trophy} title="Sıralanmış kullanıcı yok" description="Kullanıcılar işlem yaptıkça sıralama burada oluşur." />
      </Card>
    )
  }
  return (
    <TableShell>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
            <th className="px-3 py-2 font-semibold">Sıra</th>
            <th className="px-3 py-2 font-semibold">Kullanıcı</th>
            <th className="px-3 py-2 text-right font-semibold">Toplam Kâr/Zarar</th>
            <th className="px-3 py-2 text-right font-semibold">İşlem</th>
            <th className="px-3 py-2 text-right font-semibold">Kârlı Oran</th>
          </tr>
        </thead>
        <tbody>
          {leaderboard.map((row, idx) => {
            const pnlCls = row.totalPnl >= 0 ? 'text-emerald-300' : 'text-rose-300'
            return (
              <tr key={row.userId} className="border-t border-dark-700/60">
                <td className={`px-3 py-2.5 font-bold ${idx === 0 ? 'text-gold-300' : 'text-gray-400'}`}>
                  #{idx + 1}
                </td>
                <td className="px-3 py-2.5 font-mono text-white">{row.userId}</td>
                <td className={`px-3 py-2.5 text-right font-mono font-semibold ${pnlCls}`}>
                  {row.totalPnl >= 0 ? '+' : ''}{formatUsd(row.totalPnl)}
                </td>
                <td className="px-3 py-2.5 text-right text-gray-300">
                  {row.totalTrades} ({row.wins}K / {row.losses}Z)
                </td>
                <td className="px-3 py-2.5 text-right text-gold-300">%{row.winRate}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </TableShell>
  )
}
