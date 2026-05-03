import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, TrendingDown, Activity, Flame, ChevronRight,
  RefreshCw, Target, Brain, Gem, Search, Briefcase, Coins, Building2,
  BarChart3, Calendar,
} from 'lucide-react'
import apiClient from '../services/api'

const fmt = (n, d = 2) => n == null ? '—' : n.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d })

/* ─── Tıklanabilir endeks kartı ─────────────────────────────────────────── */
function IndexCard({ symbol, label, value, change, changePct, onClick, loading }) {
  const up = (changePct ?? 0) >= 0
  return (
    <button
      onClick={onClick}
      className={`relative w-full text-left rounded-2xl p-4 sm:p-5 border transition-all
        active:scale-[0.99] hover:scale-[1.005] hover:border-amber-500/40
        ${up
          ? 'bg-gradient-to-br from-emerald-500/[0.08] via-dark-900/80 to-dark-900/40 border-emerald-500/20'
          : 'bg-gradient-to-br from-red-500/[0.08] via-dark-900/80 to-dark-900/40 border-red-500/20'
        }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold tracking-wider
            ${up ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
            {symbol.replace('XU', '')}
          </div>
          <span className="text-sm font-semibold text-gray-300">{label}</span>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-500" />
      </div>

      {loading ? (
        <div className="space-y-2">
          <div className="h-7 w-32 bg-dark-800 rounded animate-pulse" />
          <div className="h-4 w-20 bg-dark-800 rounded animate-pulse" />
        </div>
      ) : (
        <>
          <div className="text-2xl sm:text-3xl font-bold text-white font-mono tracking-tight">
            {fmt(value)}
          </div>
          <div className={`flex items-center gap-1 mt-1 text-xs sm:text-sm font-semibold ${
            up ? 'text-emerald-400' : 'text-red-400'
          }`}>
            {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            <span>{up ? '+' : ''}{fmt(change)}</span>
            <span>({up ? '+' : ''}{fmt(changePct)}%)</span>
          </div>
        </>
      )}
    </button>
  )
}

/* ─── Hisse Mover Kartı (kompakt, alt grid için) ───────────────────────── */
function MoverRow({ stock, onClick }) {
  const up = (stock.changePercent ?? 0) >= 0
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-dark-800/60 rounded-xl transition-colors text-left"
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-white truncate">{stock.symbol}</div>
        <div className="text-[10px] text-gray-500 truncate">{stock.name || '—'}</div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-sm font-bold text-white font-mono">{fmt(stock.price)}</div>
        <div className={`text-[11px] font-semibold ${up ? 'text-emerald-400' : 'text-red-400'}`}>
          {up ? '+' : ''}{fmt(stock.changePercent)}%
        </div>
      </div>
    </button>
  )
}

/* ─── Hızlı erişim butonu ───────────────────────────────────────────── */
function QuickAccess({ to, icon: Icon, label, sub, color, navigate }) {
  return (
    <button
      onClick={() => navigate(to)}
      className="group flex items-center gap-3 p-3 sm:p-4 bg-dark-900/60 hover:bg-dark-800 border border-dark-700 hover:border-amber-500/30 rounded-2xl transition-all text-left"
    >
      <div className={`flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-md`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-white">{label}</div>
        <div className="text-[11px] text-gray-500 truncate">{sub}</div>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-amber-400 transition-colors" />
    </button>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [bist100, setBist100] = useState(null)
  const [bist30,  setBist30]  = useState(null)
  const [gainers, setGainers] = useState([])
  const [losers,  setLosers]  = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)

    Promise.allSettled([
      apiClient.get('/market/bist100'),
      apiClient.get('/market/bist30'),
      apiClient.get('/market/gainers'),
      apiClient.get('/market/losers'),
    ]).then(([b100, b30, gn, ls]) => {
      if (!active) return
      if (b100.status === 'fulfilled') setBist100(b100.value.data)
      if (b30.status  === 'fulfilled') setBist30(b30.value.data)
      if (gn.status   === 'fulfilled') setGainers((gn.value.data?.stocks || gn.value.data || []).slice(0, 5))
      if (ls.status   === 'fulfilled') setLosers((ls.value.data?.stocks || ls.value.data || []).slice(0, 5))
      const allRejected = [b100, b30].every(r => r.status === 'rejected')
      if (allRejected) setError('Veriler şu an yüklenemedi. Birkaç saniye sonra tekrar deneyin.')
      else setError(null)
    }).finally(() => active && setLoading(false))

    return () => { active = false }
  }, [refreshTick])

  // Auto refresh 60sn
  useEffect(() => {
    const i = setInterval(() => setRefreshTick(t => t + 1), 60_000)
    return () => clearInterval(i)
  }, [])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Piyasa Kokpiti</h1>
          <p className="text-xs sm:text-sm text-gray-400 mt-0.5">BIST anlık verileri · 60 sn auto-refresh</p>
        </div>
        <button
          onClick={() => setRefreshTick(t => t + 1)}
          className="p-2 sm:px-3 sm:py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-xl flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline text-sm font-medium">Yenile</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-400">⚠ {error}</div>
      )}

      {/* Endeks Kartları (TIKLANINCA DETAY GRAFIK SAYFASI AÇILIR) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <IndexCard
          symbol="XU100"
          label="BIST 100"
          value={bist100?.value}
          change={bist100?.change}
          changePct={bist100?.changePercent}
          loading={loading && !bist100}
          onClick={() => navigate('/endeks/XU100')}
        />
        <IndexCard
          symbol="XU030"
          label="BIST 30"
          value={bist30?.value}
          change={bist30?.change}
          changePct={bist30?.changePercent}
          loading={loading && !bist30}
          onClick={() => navigate('/endeks/XU030')}
        />
      </div>

      {/* Hızlı Erişim Kartları */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Gem className="w-4 h-4 text-amber-400" />
          <span className="text-xs uppercase tracking-wider font-semibold text-amber-400/80">Hızlı Erişim</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
          <QuickAccess to="/canli-heatmap"   icon={Flame}      label="Canlı Heatmap"  sub="BIST30 renk haritası"             color="from-orange-500 to-red-500"     navigate={navigate} />
          <QuickAccess to="/kripto"          icon={Coins}      label="Kripto"         sub="Top 100 + alarm + watchlist"      color="from-yellow-500 to-orange-500"  navigate={navigate} />
          <QuickAccess to="/teknik-analiz-ai" icon={Activity}  label="Teknik Analiz"  sub="RSI · MACD · EMA · BB"            color="from-blue-500 to-blue-600"      navigate={navigate} />
          <QuickAccess to="/sirket-analizi"  icon={Building2}  label="Şirket Analizi" sub="Mali tablolar · KAP · AI Skor"    color="from-indigo-500 to-indigo-600"  navigate={navigate} />
          <QuickAccess to="/tarayicilar"     icon={Search}     label="Tarayıcılar"    sub="EMA34 · SNR · Strateji"           color="from-emerald-500 to-emerald-600" navigate={navigate} />
          <QuickAccess to="/gunluk-tespitler" icon={Target}    label="Günlük Sinyaller" sub="AL/SAT/NÖTR algoritma"          color="from-red-500 to-red-600"        navigate={navigate} />
          <QuickAccess to="/takip-listem"    icon={Briefcase}  label="Portföyüm"      sub="Hisse takip + kar/zarar"          color="from-purple-500 to-purple-600"  navigate={navigate} />
          <QuickAccess to="/pro-analiz"      icon={Brain}      label="Pro Analiz"     sub="Premium AI tahminleri"            color="from-amber-500 to-amber-600"    navigate={navigate} />
          <QuickAccess to="/ekonomik-takvim" icon={Calendar}   label="Eko. Takvim"    sub="TR + ABD ekonomik veriler"        color="from-rose-500 to-rose-600"      navigate={navigate} />
        </div>
      </div>

      {/* Yükselen / Düşen Hisseler — KOMPAKT */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {/* Yükselenler */}
        <div className="bg-dark-900/60 border border-dark-700 rounded-2xl p-3 sm:p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-semibold text-white">En Çok Yükselenler</span>
          </div>
          <div className="space-y-1">
            {loading && gainers.length === 0 && (
              [...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-dark-800/40 rounded-xl animate-pulse" />
              ))
            )}
            {gainers.map(s => (
              <MoverRow
                key={s.symbol}
                stock={s}
                onClick={() => navigate(`/teknik-analiz-ai?symbol=${s.symbol}`)}
              />
            ))}
            {!loading && gainers.length === 0 && (
              <div className="text-center text-xs text-gray-500 py-4">Veri yok</div>
            )}
          </div>
        </div>

        {/* Düşenler */}
        <div className="bg-dark-900/60 border border-dark-700 rounded-2xl p-3 sm:p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="w-4 h-4 text-red-400" />
            <span className="text-sm font-semibold text-white">En Çok Düşenler</span>
          </div>
          <div className="space-y-1">
            {loading && losers.length === 0 && (
              [...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-dark-800/40 rounded-xl animate-pulse" />
              ))
            )}
            {losers.map(s => (
              <MoverRow
                key={s.symbol}
                stock={s}
                onClick={() => navigate(`/teknik-analiz-ai?symbol=${s.symbol}`)}
              />
            ))}
            {!loading && losers.length === 0 && (
              <div className="text-center text-xs text-gray-500 py-4">Veri yok</div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-xs text-gray-600 text-center pt-2 pb-4">
        Veri: Yahoo Finance + KAP · Eğitim amaçlıdır, yatırım tavsiyesi değildir
      </div>
    </div>
  )
}
