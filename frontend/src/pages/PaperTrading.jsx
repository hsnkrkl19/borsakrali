/**
 * Paper Trading Sayfası — Borsa Krali (Faz 20)
 *
 * Backend paperTradingService'in tüm endpoint'lerini tüketir:
 *   - GET  /api/paper-trading/portfolio
 *   - POST /api/paper-trading/close   { posId }
 *   - POST /api/paper-trading/reset
 *   - GET  /api/paper-trading/leaderboard
 *
 * 3 sekme:
 *   1. AÇIK POZİSYONLAR — mark-to-market PnL canlı
 *   2. GEÇMİŞ           — kapanmış pozisyonlar + win/loss tablosu
 *   3. LEADERBOARD      — top kullanıcılar (toplam PnL sırası)
 */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RefreshCw, TrendingUp, TrendingDown, Wallet, Trophy, History,
  X, RotateCcw, ExternalLink, AlertTriangle, Sparkles, Activity, Coins, Layers,
} from 'lucide-react'
import api from '../services/api'

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
  const [activeTab, setActiveTab] = useState('open')  // 'open' | 'history' | 'leaderboard'
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
    if (!confirm('Portfolio sıfırlanacak. Tüm açık pozisyonlar ve geçmiş silinecek. Emin misin?')) return
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
      <div className="space-y-4">
        <div className="card p-8 text-center">
          <RefreshCw className="w-6 h-6 text-gold-400 animate-spin mx-auto mb-2" />
          <p className="text-sm text-gray-400">Portfolio yükleniyor...</p>
        </div>
      </div>
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
            <Wallet className="w-6 h-6 text-gold-400" />
            Paper Trading
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gold-400/20 text-gold-400 border border-gold-400/30">
              Dummy Portfolio
            </span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Gerçek para riski yok — MTF sinyallerini kağıt üzerinde test et.
            Mark-to-market PnL canlı (20sn refresh).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
            Yenile
          </button>
          <button
            onClick={handleReset}
            disabled={resetting}
            className="text-xs px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/30 hover:bg-rose-500/20 flex items-center gap-1 disabled:opacity-50"
            title="Portfolio'yu sıfırla — başlangıç bakiyesine dön"
          >
            <RotateCcw className="w-3 h-3" />
            Sıfırla
          </button>
        </div>
      </div>

      {/* Üst stats kartları */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Toplam Değer"
          value={formatUsd(equity)}
          sub={`Bakiye: ${formatUsd(balance)}`}
          icon={Wallet}
          color="gold"
        />
        <StatCard
          label="Toplam PnL"
          value={formatUsd(totalPnl)}
          valueColor={totalPnl >= 0 ? 'emerald' : 'rose'}
          sub={`${wins} kazanç / ${losses} kayıp`}
          icon={totalPnl >= 0 ? TrendingUp : TrendingDown}
          color={totalPnl >= 0 ? 'emerald' : 'rose'}
        />
        <StatCard
          label="Gerçekleşmemiş"
          value={formatUsd(totalUnrealized)}
          valueColor={totalUnrealized >= 0 ? 'emerald' : 'rose'}
          sub={`${openPositions.length} açık pozisyon`}
          icon={Activity}
          color="amber"
        />
        <StatCard
          label="Kârlı işlem oranı"
          value={`%${winRate}`}
          sub={`${totalTrades} toplam işlem`}
          icon={Trophy}
          color="sky"
        />
      </div>

      {/* Tab selector */}
      <div className="flex items-center gap-1 border-b border-dark-700">
        <TabBtn active={activeTab === 'open'} onClick={() => setActiveTab('open')} icon={Activity} count={openPositions.length}>
          Açık
        </TabBtn>
        <TabBtn active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={History} count={history.length}>
          Geçmiş
        </TabBtn>
        <TabBtn active={activeTab === 'leaderboard'} onClick={() => setActiveTab('leaderboard')} icon={Trophy} count={leaderboard.length}>
          Sıralama
        </TabBtn>
      </div>

      {/* Tab content */}
      {activeTab === 'open' && (
        <OpenPositionsTab
          positions={openPositions}
          onClose={handleClose}
          closingPosId={closingPosId}
          navigate={navigate}
        />
      )}
      {activeTab === 'history' && (
        <HistoryTab history={history} />
      )}
      {activeTab === 'leaderboard' && (
        <LeaderboardTab leaderboard={leaderboard} />
      )}

      {/* Bottom info */}
      <div className="card p-3 bg-blue-500/5 border-blue-500/20 text-[11px] text-gray-400 flex items-start gap-2">
        <Sparkles className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
        <p className="leading-relaxed">
          <span className="text-white">Nasıl kullanılır:</span>{' '}
          <button onClick={() => navigate('/gunluk-tespitler?tab=mtf')} className="text-gold-400 hover:text-gold-400 underline">
            MTF tarayıcı
          </button>'da bir sinyale tıkla → "7-TF Detay" → "Paper Trade Aç". $1,000 fixed pozisyon
          açılır (sinyaldeki kaldıraçla). Stop/Target tetiklenince otomatik kapanır.
          Başlangıç bakiye: $10,000.
        </p>
      </div>
    </div>
  )
}

function StatCard({ label, value, valueColor = 'white', sub, icon: Icon, color }) {
  const colorMap = {
    gold:    'border-gold-500/30 bg-gold-500/5',
    emerald: 'border-emerald-500/30 bg-emerald-500/5',
    rose:    'border-rose-500/30 bg-rose-500/5',
    amber:   'border-amber-500/30 bg-amber-500/5',
    sky:     'border-sky-500/30 bg-sky-500/5',
  }
  const valueColorClass = {
    white:   'text-white',
    emerald: 'text-emerald-300',
    rose:    'text-rose-300',
  }[valueColor] || 'text-white'

  return (
    <div className={`card p-3 border ${colorMap[color] || colorMap.gold}`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[10px] uppercase tracking-wider text-gray-400">{label}</span>
        <Icon className={`w-3.5 h-3.5 text-${color}-400`} />
      </div>
      <div className={`text-lg sm:text-xl font-bold font-mono ${valueColorClass}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function TabBtn({ active, onClick, icon: Icon, count, children }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-2 transition-colors flex items-center gap-1.5 border-b-2 ${
        active
          ? 'border-gold-500 text-white'
          : 'border-transparent text-gray-400 hover:text-white'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {children}
      {count > 0 && (
        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-dark-700 text-gray-400">{count}</span>
      )}
    </button>
  )
}

// ─── AÇIK POZİSYONLAR TAB ──────────────────────────────────────────────────
function OpenPositionsTab({ positions, onClose, closingPosId, navigate }) {
  if (positions.length === 0) {
    return (
      <div className="card p-8 text-center">
        <Activity className="w-8 h-8 text-gray-500 mx-auto mb-2" />
        <p className="text-sm text-gray-400">Henüz açık pozisyon yok.</p>
        <button
          onClick={() => navigate('/gunluk-tespitler?tab=mtf')}
          className="btn-primary text-xs mt-3 inline-flex items-center gap-1.5"
        >
          <Layers className="w-3 h-3" />
          MTF Tarayıcı'ya Git
        </button>
      </div>
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

function PositionCard({ pos, onClose, closing }) {
  const isLong = pos.direction === 'long'
  const dirStyle = isLong
    ? { label: '↑ LONG', color: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' }
    : { label: '↓ SHORT', color: 'text-rose-300', bg: 'bg-rose-500/10', border: 'border-rose-500/30' }
  const pnl = pos.unrealizedPnl || 0
  const pnlPct = pos.unrealizedPnlPct || 0
  const pnlClass = pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'

  // Mevcut fiyat stop/target yakınlığı (% mesafe)
  const distToStop = pos.currentPrice && pos.stop
    ? ((pos.currentPrice - pos.stop) / pos.currentPrice * 100) * (isLong ? 1 : -1)
    : null
  const distToTarget = pos.currentPrice && pos.target1
    ? ((pos.target1 - pos.currentPrice) / pos.currentPrice * 100) * (isLong ? 1 : -1)
    : null

  return (
    <div className="card border-2 border-dark-700">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-bold text-white">{pos.symbol}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${dirStyle.bg} ${dirStyle.border} ${dirStyle.color}`}>
              {dirStyle.label}
            </span>
            {pos.timeframe && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-dark-700 text-gray-300 font-mono">
                {pos.timeframe}
              </span>
            )}
            {pos.leverage > 1 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                {pos.leverage}x
              </span>
            )}
            {pos.grade && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gold-500/10 text-gold-300 border border-gold-500/30">
                {pos.grade}
              </span>
            )}
          </div>
          <p className="text-[10px] text-gray-500 mt-0.5">
            Açılış: {formatDate(pos.openedAt)} · Notional: {formatUsd(pos.notional)}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <div className={`text-lg font-bold font-mono ${pnlClass}`}>
            {pnl >= 0 ? '+' : ''}{formatUsd(pnl)}
          </div>
          <div className={`text-xs ${pnlClass}`}>{formatPct(pnlPct)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-[11px]">
        <div className="p-1.5 rounded bg-dark-800 border border-dark-700">
          <div className="text-[9px] text-gray-500 uppercase">Giriş</div>
          <div className="text-white font-mono">{formatPrice(pos.entry)}</div>
        </div>
        <div className="p-1.5 rounded bg-dark-800 border border-dark-700">
          <div className="text-[9px] text-gray-500 uppercase">Mevcut</div>
          <div className="text-gold-300 font-mono">{formatPrice(pos.currentPrice)}</div>
        </div>
        <div className="p-1.5 rounded bg-rose-500/5 border border-rose-500/30">
          <div className="text-[9px] text-gray-500 uppercase">Stop</div>
          <div className="text-rose-300 font-mono">
            {formatPrice(pos.stop)}
            {distToStop != null && <span className="text-[9px] opacity-70 ml-1">({distToStop.toFixed(1)}%)</span>}
          </div>
        </div>
        <div className="p-1.5 rounded bg-emerald-500/5 border border-emerald-500/30">
          <div className="text-[9px] text-gray-500 uppercase">Hedef 1</div>
          <div className="text-emerald-300 font-mono">
            {formatPrice(pos.target1)}
            {distToTarget != null && <span className="text-[9px] opacity-70 ml-1">({distToTarget.toFixed(1)}%)</span>}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-dark-700/50">
        <span className="text-[10px] text-gray-500">
          Boyut: <span className="text-gray-300 font-mono">{pos.size?.toFixed(6)}</span> {pos.symbol}
          {pos.winProbability != null && (
            <span className="ml-2">· Sinyal güveni: <span className="text-gold-400">%{(pos.winProbability * 100).toFixed(0)}</span></span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <a
            href={`https://www.binance.com/en/trade/${pos.symbol}_USDT`}
            target="_blank" rel="noopener noreferrer"
            className="text-[10px] text-gold-400 hover:text-gold-300 inline-flex items-center gap-1"
          >
            <ExternalLink className="w-2.5 h-2.5" />
            Binance
          </a>
          <button
            onClick={() => onClose(pos.id)}
            disabled={closing}
            className="text-[10px] px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 inline-flex items-center gap-1 disabled:opacity-50"
          >
            {closing ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <X className="w-2.5 h-2.5" />}
            {closing ? 'Kapanıyor...' : 'Kapat'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── GEÇMİŞ TAB ────────────────────────────────────────────────────────────
function HistoryTab({ history }) {
  if (history.length === 0) {
    return (
      <div className="card p-8 text-center">
        <History className="w-8 h-8 text-gray-500 mx-auto mb-2" />
        <p className="text-sm text-gray-400">Henüz kapanmış pozisyon yok.</p>
      </div>
    )
  }
  return (
    <div className="card p-0 overflow-x-auto">
      <table className="w-full text-[11px]" style={{ minWidth: 720 }}>
        <thead>
          <tr className="border-b border-dark-700 text-gray-500">
            <th className="text-left py-2 px-2">Coin</th>
            <th className="text-left py-2 px-2">Yön</th>
            <th className="text-center py-2 px-2">TF</th>
            <th className="text-center py-2 px-2">Sonuç</th>
            <th className="text-right py-2 px-2">Giriş</th>
            <th className="text-right py-2 px-2">Çıkış</th>
            <th className="text-right py-2 px-2">PnL</th>
            <th className="text-right py-2 px-2">PnL %</th>
            <th className="text-right py-2 px-2">Süre</th>
          </tr>
        </thead>
        <tbody>
          {history.map(h => {
            const isLong = h.direction === 'long'
            const isWin = h.pnl > 0
            const outcomeStyle = h.exitReason === 'hit_target'
              ? { label: '🎯 Hedef', cls: 'text-emerald-300 bg-emerald-500/10' }
              : h.exitReason === 'hit_stop'
              ? { label: '🛑 Stop', cls: 'text-rose-300 bg-rose-500/10' }
              : { label: '✕ Manuel', cls: 'text-gray-300 bg-gray-500/10' }
            const dur = h.openedAt && h.closedAt
              ? Math.round((new Date(h.closedAt) - new Date(h.openedAt)) / 60000) + ' dk'
              : '—'
            return (
              <tr key={h.id} className="border-b border-dark-700/40 hover:bg-dark-800/50">
                <td className="py-1.5 px-2 font-mono font-semibold text-white">{h.symbol}</td>
                <td className="py-1.5 px-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${isLong ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'}`}>
                    {isLong ? '↑ LONG' : '↓ SHORT'}
                  </span>
                </td>
                <td className="py-1.5 px-2 text-center text-gray-400 font-mono">{h.timeframe || '—'}</td>
                <td className="py-1.5 px-2 text-center">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${outcomeStyle.cls}`}>
                    {outcomeStyle.label}
                  </span>
                </td>
                <td className="py-1.5 px-2 text-right text-gray-300 font-mono">{formatPrice(h.entry)}</td>
                <td className="py-1.5 px-2 text-right text-gray-300 font-mono">{formatPrice(h.exitPrice)}</td>
                <td className={`py-1.5 px-2 text-right font-mono font-bold ${isWin ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {h.pnl >= 0 ? '+' : ''}{formatUsd(h.pnl)}
                </td>
                <td className={`py-1.5 px-2 text-right font-mono ${isWin ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {formatPct(h.pnlPct)}
                </td>
                <td className="py-1.5 px-2 text-right text-gray-500">{dur}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── LEADERBOARD TAB ───────────────────────────────────────────────────────
function LeaderboardTab({ leaderboard }) {
  if (leaderboard.length === 0) {
    return (
      <div className="card p-8 text-center">
        <Trophy className="w-8 h-8 text-gray-500 mx-auto mb-2" />
        <p className="text-sm text-gray-400">Henüz sıralanmış kullanıcı yok.</p>
      </div>
    )
  }
  return (
    <div className="card p-0 overflow-x-auto">
      <table className="w-full text-[11px]" style={{ minWidth: 540 }}>
        <thead>
          <tr className="border-b border-dark-700 text-gray-500">
            <th className="text-left py-2 px-2">#</th>
            <th className="text-left py-2 px-2">Kullanıcı</th>
            <th className="text-right py-2 px-2">Toplam Kâr / Zarar</th>
            <th className="text-right py-2 px-2">İşlem</th>
            <th className="text-right py-2 px-2">Kârlı Oran</th>
          </tr>
        </thead>
        <tbody>
          {leaderboard.map((row, idx) => {
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`
            const pnlClass = row.totalPnl >= 0 ? 'text-emerald-300' : 'text-rose-300'
            return (
              <tr key={row.userId} className="border-b border-dark-700/40 hover:bg-dark-800/50">
                <td className="py-1.5 px-2 font-bold">{medal}</td>
                <td className="py-1.5 px-2 font-mono text-white">{row.userId}</td>
                <td className={`py-1.5 px-2 text-right font-mono font-bold ${pnlClass}`}>
                  {row.totalPnl >= 0 ? '+' : ''}{formatUsd(row.totalPnl)}
                </td>
                <td className="py-1.5 px-2 text-right text-gray-300">
                  {row.totalTrades} ({row.wins}W / {row.losses}L)
                </td>
                <td className="py-1.5 px-2 text-right text-sky-300">%{row.winRate}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
