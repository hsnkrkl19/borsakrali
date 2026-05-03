import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, TrendingDown, Activity, Flame, ChevronRight,
  RefreshCw, Target, Brain, Gem, Search, Briefcase, Coins, Building2,
  BarChart3, Calendar,
} from 'lucide-react'
import apiClient from '../services/api'

const fmt = (n, d = 2) => n == null ? '—' : n.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d })

/* ─── Tıklanabilir endeks kartı (tema uyumlu) ───────────────────────────── */
function IndexCard({ symbol, label, value, change, changePct, onClick, loading }) {
  const up = (changePct ?? 0) >= 0
  const accent = up ? '0,201,138' : '255,59,70' // RGB jade / ember
  return (
    <button
      onClick={onClick}
      className="relative w-full text-left rounded-2xl p-4 sm:p-5 border transition-all
        active:scale-[0.99] hover:scale-[1.005]"
      style={{
        background: `linear-gradient(135deg, rgba(${accent}, 0.10) 0%, var(--bg-card) 50%, var(--bg-elevated) 100%)`,
        borderColor: `rgba(${accent}, 0.30)`,
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold tracking-wider"
            style={{
              background: `rgba(${accent}, 0.15)`,
              color: up ? 'var(--jade)' : 'var(--ember)',
            }}
          >
            {symbol.replace('XU', '')}
          </div>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>{label}</span>
        </div>
        <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
      </div>

      {loading ? (
        <div className="space-y-2">
          <div className="h-7 w-32 rounded animate-pulse" style={{ background: 'var(--bg-elevated)' }} />
          <div className="h-4 w-20 rounded animate-pulse" style={{ background: 'var(--bg-elevated)' }} />
        </div>
      ) : (
        <>
          <div
            className="text-2xl sm:text-3xl font-bold font-mono tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            {fmt(value)}
          </div>
          <div
            className="flex items-center gap-1 mt-1 text-xs sm:text-sm font-semibold"
            style={{ color: up ? 'var(--jade)' : 'var(--ember)' }}
          >
            {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            <span>{up ? '+' : ''}{fmt(change)}</span>
            <span>({up ? '+' : ''}{fmt(changePct)}%)</span>
          </div>
        </>
      )}
    </button>
  )
}

/* ─── Hisse Mover Kartı (tema uyumlu) ──────────────────────────────────── */
function MoverRow({ stock, onClick }) {
  const up = (stock.changePercent ?? 0) >= 0
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl transition-colors text-left hover:opacity-90"
      style={{ background: 'transparent' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{stock.symbol}</div>
        <div className="text-[10px] truncate" style={{ color: 'var(--text-faint)' }}>{stock.name || '—'}</div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-sm font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{fmt(stock.price)}</div>
        <div className="text-[11px] font-semibold" style={{ color: up ? 'var(--jade)' : 'var(--ember)' }}>
          {up ? '+' : ''}{fmt(stock.changePercent)}%
        </div>
      </div>
    </button>
  )
}

/* ─── Hızlı erişim butonu (tema uyumlu) ─────────────────────────────────── */
function QuickAccess({ to, icon: Icon, label, sub, color, navigate }) {
  return (
    <button
      onClick={() => navigate(to)}
      className="group flex flex-col sm:flex-row items-center sm:items-center gap-2 sm:gap-3 p-3 sm:p-4 rounded-2xl transition-all text-center sm:text-left border h-full min-h-[110px] sm:min-h-[72px]"
      style={{
        background: 'var(--bg-card)',
        borderColor: 'var(--border-main)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'var(--bg-hover)'
        e.currentTarget.style.borderColor = 'var(--border-gold)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'var(--bg-card)'
        e.currentTarget.style.borderColor = 'var(--border-main)'
      }}
    >
      <div className={`flex-shrink-0 w-11 h-11 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-md`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs sm:text-sm font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>{label}</div>
        <div className="text-[10px] sm:text-[11px] truncate hidden sm:block" style={{ color: 'var(--text-muted)' }}>{sub}</div>
      </div>
      <ChevronRight className="w-4 h-4 group-hover:text-amber-400 transition-colors hidden sm:block" style={{ color: 'var(--text-faint)' }} />
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
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Piyasa Kokpiti</h1>
          <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>BIST anlık verileri · 60 sn auto-refresh</p>
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
        <div className="grid grid-cols-3 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
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

      {/* Yükselen / Düşen Hisseler — TEMA UYUMLU */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {/* Yükselenler */}
        <div
          className="rounded-2xl p-3 sm:p-4 border"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border-main)' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4" style={{ color: 'var(--jade)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>En Çok Yükselenler</span>
          </div>
          <div className="space-y-1">
            {loading && gainers.length === 0 && (
              [...Array(5)].map((_, i) => (
                <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: 'var(--bg-elevated)' }} />
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
              <div className="text-center text-xs py-4" style={{ color: 'var(--text-faint)' }}>Veri yok</div>
            )}
          </div>
        </div>

        {/* Düşenler */}
        <div
          className="rounded-2xl p-3 sm:p-4 border"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border-main)' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="w-4 h-4" style={{ color: 'var(--ember)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>En Çok Düşenler</span>
          </div>
          <div className="space-y-1">
            {loading && losers.length === 0 && (
              [...Array(5)].map((_, i) => (
                <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: 'var(--bg-elevated)' }} />
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
              <div className="text-center text-xs py-4" style={{ color: 'var(--text-faint)' }}>Veri yok</div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-xs text-center pt-2 pb-4" style={{ color: 'var(--text-faint)' }}>
        Veri: Yahoo Finance + KAP · Eğitim amaçlıdır, yatırım tavsiyesi değildir
      </div>
    </div>
  )
}
