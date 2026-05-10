import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, TrendingDown, Activity, Flame, ChevronRight,
  RefreshCw, Target, Brain, Gem, Search, Briefcase, Coins, Building2,
  Calendar, Clock, Command, Sparkles, ArrowRight,
} from 'lucide-react'
import apiClient from '../services/api'
import GuestCTA from '../components/GuestCTA'

const fmt = (n, d = 2) => n == null ? '—' : n.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d })

/* ─── Borsa açık/kapalı durumu ─────────────────────────────────────────── */
function getMarketStatus(now = new Date()) {
  const day = now.getDay()           // 0 Sun, 6 Sat
  const h = now.getHours()
  const m = now.getMinutes()
  const t = h * 60 + m
  const open = 10 * 60               // 10:00
  const close = 18 * 60              // 18:00
  const isWeekday = day >= 1 && day <= 5
  if (isWeekday && t >= open && t < close) {
    return { open: true, label: 'Borsa açık', sub: `Kapanışa ${Math.floor((close - t) / 60)}sa ${(close - t) % 60}dk` }
  }
  // next open
  let daysUntil = 0
  if (!isWeekday) daysUntil = day === 0 ? 1 : 2
  else if (t >= close) daysUntil = day === 5 ? 3 : 1
  return { open: false, label: 'Borsa kapalı', sub: daysUntil === 0 ? 'Bugün 10:00\'da açılır' : `${daysUntil} gün sonra açılır` }
}

/* ─── Tıklanabilir endeks kartı (tema uyumlu) ───────────────────────────── */
function IndexCard({ symbol, label, value, change, changePct, onClick, loading }) {
  const up = (changePct ?? 0) >= 0
  const accent = up ? '0,201,138' : '255,59,70' // RGB jade / ember
  return (
    <button
      onClick={onClick}
      className="relative w-full text-left rounded-2xl p-4 sm:p-5 border overflow-hidden transition-all
        active:scale-[0.99] hover:scale-[1.005]"
      style={{
        background: `linear-gradient(135deg, rgba(${accent}, 0.06) 0%, var(--bg-card) 55%, var(--bg-card) 100%)`,
        borderColor: `rgba(${accent}, 0.45)`,
        boxShadow: `var(--shadow-card), 0 0 0 1px rgba(${accent}, 0.18) inset`,
      }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
        style={{ background: `linear-gradient(90deg, transparent 0%, rgba(${accent}, 0.7) 50%, transparent 100%)` }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[1px]"
        style={{ background: `linear-gradient(90deg, transparent 0%, rgba(${accent}, 0.45) 50%, transparent 100%)` }}
      />
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
      className="group hover-lift flex flex-col sm:flex-row items-center sm:items-center gap-2 sm:gap-3 p-3 sm:p-4 rounded-2xl text-center sm:text-left h-full min-h-[110px] sm:min-h-[72px]"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-main)',
      }}
    >
      <div className={`flex-shrink-0 w-11 h-11 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-md transition-transform group-hover:scale-110`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs sm:text-sm font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>{label}</div>
        <div className="text-[10px] sm:text-[11px] truncate hidden sm:block" style={{ color: 'var(--text-muted)' }}>{sub}</div>
      </div>
      <ChevronRight className="w-4 h-4 transition-all group-hover:translate-x-1 hidden sm:block" style={{ color: 'var(--text-faint)' }} />
    </button>
  )
}

/* ─── Stat chip — hızlı bakış için ─────────────────────────────────────── */
function StatChip({ label, value, tone = 'neutral', title }) {
  const toneStyle = tone === 'up'
    ? { color: 'var(--jade)', bg: 'rgba(0, 201, 138, 0.10)', border: 'rgba(0, 201, 138, 0.28)' }
    : tone === 'down'
      ? { color: 'var(--ember)', bg: 'rgba(255, 59, 70, 0.10)', border: 'rgba(255, 59, 70, 0.28)' }
      : { color: 'var(--text-secondary)', bg: 'var(--bg-input)', border: 'var(--border-main)' }
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-help"
      style={{ background: toneStyle.bg, border: `1px solid ${toneStyle.border}` }}
      title={title}
    >
      <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-faint)' }}>{label}</span>
      <span className="text-[12.5px] font-bold num-tabular" style={{ color: toneStyle.color }}>{value}</span>
    </div>
  )
}

/**
 * Bugünün Sinyalleri özet kartı — Dashboard'da BIST endeks kartlarının altında
 * boşluğu doldurur. Top 3 trend sinyali gösterir, kart tıklanınca tam panele
 * yönlendirir. Snapshot yoksa "borsa açılışı bekleniyor" mesajı gösterir.
 */
function DailySignalsSummary({ snapshot, navigate, loading }) {
  const phase = snapshot?.revision || snapshot?.premarket
  const trendSignals = phase?.trend?.signals || []
  const reversionSignals = phase?.reversion?.signals || []
  const top3 = trendSignals.slice(0, 3)
  const phaseLabel = snapshot?.revision ? '11:00 Revize' : snapshot?.premarket ? '09:55 Pre-Market' : null

  return (
    <div
      onClick={() => navigate('/gunluk-tespitler?tab=bugun')}
      className="rounded-2xl p-3 sm:p-4 border cursor-pointer hover-lift transition-all relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(212,175,55,0.06), rgba(212,175,55,0.02))',
        borderColor: 'var(--border-gold)',
      }}
    >
      {/* Sol üst köşe gold parıltı */}
      <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full opacity-30 pointer-events-none"
        style={{ background: 'radial-gradient(circle, var(--gold-400), transparent 70%)' }} />

      <div className="flex items-start justify-between gap-3 relative">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, var(--gold-300), var(--gold-500))', color: '#1a1208' }}>
            <Sparkles className="w-4 h-4" strokeWidth={2.4} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Bugünün Sinyalleri</span>
              {phaseLabel && (
                <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full font-semibold"
                  style={{ background: 'rgba(212,175,55,0.15)', color: 'var(--gold-400)', border: '1px solid var(--border-gold)' }}>
                  {phaseLabel}
                </span>
              )}
            </div>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {phase
                ? `Trend: ${trendSignals.length} · Reversion: ${reversionSignals.length} aktif sinyal`
                : 'Borsa açılışı (09:55) bekleniyor — sinyaller hazırlandığında bildirim alacaksın'}
            </p>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 flex-shrink-0 mt-1" style={{ color: 'var(--gold-400)' }} />
      </div>

      {/* Top 3 mini liste */}
      {top3.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mt-3 relative">
          {top3.map((sig) => (
            <div key={sig.symbol} className="rounded-lg p-2 text-center"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}>
              <div className="flex items-center justify-center gap-1">
                <span className="font-bold text-[12px]" style={{ color: 'var(--text-primary)' }}>{sig.symbol}</span>
                <span className={`text-[9px] px-1 rounded ${sig.direction === 'long' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                  {sig.direction === 'long' ? '↑' : '↓'}
                </span>
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {sig.totalScore}/{sig.applicableMax} koşul
              </div>
            </div>
          ))}
        </div>
      )}

      {!phase && !loading && (
        <div className="mt-3 flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          <Clock className="w-3 h-3" />
          <span>Pre-market sinyalleri her gün 09:55'te otomatik üretilir</span>
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [bist100, setBist100] = useState(null)
  const [bist30,  setBist30]  = useState(null)
  const [gainers, setGainers] = useState([])
  const [losers,  setLosers]  = useState([])
  const [breadth, setBreadth] = useState(null)
  const [dailySnapshot, setDailySnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const [now, setNow] = useState(new Date())
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')

  useEffect(() => {
    let active = true
    setLoading(true)

    Promise.allSettled([
      apiClient.get('/market/bist100'),
      apiClient.get('/market/bist30'),
      apiClient.get('/market/gainers'),
      apiClient.get('/market/losers'),
      apiClient.get('/market/breadth'),
      apiClient.get('/daily-signals/today'),
    ]).then(([b100, b30, gn, ls, br, ds]) => {
      if (!active) return
      if (b100.status === 'fulfilled') setBist100(b100.value.data)
      if (b30.status  === 'fulfilled') setBist30(b30.value.data)
      if (gn.status   === 'fulfilled') setGainers((gn.value.data?.stocks || gn.value.data || []).slice(0, 5))
      if (ls.status   === 'fulfilled') setLosers((ls.value.data?.stocks || ls.value.data || []).slice(0, 5))
      if (br.status   === 'fulfilled') setBreadth(br.value.data)
      if (ds.status   === 'fulfilled') setDailySnapshot(ds.value.data)
      const allRejected = [b100, b30].every(r => r.status === 'rejected')
      if (allRejected) setError('Veriler şu an yüklenemedi. Birkaç saniye sonra tekrar deneyin.')
      else setError(null)
    }).finally(() => active && setLoading(false))

    return () => { active = false }
  }, [refreshTick])

  // Auto refresh 60sn + manual via Ctrl+K command
  useEffect(() => {
    const i = setInterval(() => setRefreshTick(t => t + 1), 60_000)
    const onRefresh = () => setRefreshTick(t => t + 1)
    window.addEventListener('bk-refresh-market', onRefresh)
    return () => { clearInterval(i); window.removeEventListener('bk-refresh-market', onRefresh) }
  }, [])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  const market = useMemo(() => getMarketStatus(now), [now])
  // breadth artık doğrudan /api/market/breadth'ten geliyor (BIST100'de gerçek
  // yükselen / düşen sayısı). Eskiden top-5 listelerin uzunluğunu sayıyordu —
  // o yüzden hep "5 / 5 / %50" gösteriyordu.

  return (
    <div className="space-y-5">
      <GuestCTA />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Piyasa Kokpiti</h1>
          <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            BIST anlık verileri · 60 sn otomatik yenileme
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className={`market-status ${market.open ? 'is-open' : 'is-closed'}`}>
            <span className={`status-dot ${market.open ? 'status-dot-live' : 'status-dot-off'}`} />
            <span>{market.label}</span>
            <span className="hidden sm:inline" style={{ color: 'var(--text-muted)', fontWeight: 500 }}>· {market.sub}</span>
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('bk-open-cmdk'))}
            title={`Komut Paleti — ${isMac ? '⌘' : 'Ctrl'}+K`}
            className="hidden md:flex items-center gap-1.5 h-9 px-3 rounded-xl transition-all hover-lift"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-main)',
              color: 'var(--text-secondary)',
            }}
          >
            <Command className="w-3.5 h-3.5" style={{ color: 'var(--gold-400)' }} />
            <span className="text-[12px] font-semibold">Hızlı git</span>
            <span className="kbd ml-1">{isMac ? '⌘' : 'Ctrl'}</span>
            <span className="kbd">K</span>
          </button>
          <button
            onClick={() => setRefreshTick(t => t + 1)}
            className="h-9 px-3 rounded-xl flex items-center gap-2 transition-all"
            style={{
              background: 'rgba(212, 175, 55, 0.10)',
              border: '1px solid var(--border-gold)',
              color: 'var(--gold-400)',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(212, 175, 55, 0.18)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(212, 175, 55, 0.10)'}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline text-[12.5px] font-semibold">Yenile</span>
          </button>
        </div>
      </div>

      {/* Quick stat chips — anlık piyasa durumu özeti
          • BIST100/BIST30 = endeks gün içi yüzdesel değişim
          • Yükselen/Düşen  = BIST100'deki yön sayıları (gerçek breadth) */}
      <div className="flex flex-wrap items-center gap-2">
        {bist100 != null && (
          <StatChip
            label="BIST100"
            value={bist100?.changePercent != null ? `${bist100.changePercent >= 0 ? '+' : ''}${bist100.changePercent.toFixed(2)}%` : '—'}
            tone={bist100?.changePercent >= 0 ? 'up' : 'down'}
            title="BIST100 endeksinin gün içi yüzdesel değişimi"
          />
        )}
        {bist30 != null && (
          <StatChip
            label="BIST30"
            value={bist30?.changePercent != null ? `${bist30.changePercent >= 0 ? '+' : ''}${bist30.changePercent.toFixed(2)}%` : '—'}
            tone={bist30?.changePercent >= 0 ? 'up' : 'down'}
            title="BIST30 endeksinin gün içi yüzdesel değişimi"
          />
        )}
        {breadth && breadth.total > 0 && (
          <>
            <StatChip
              label="Yükselen"
              value={breadth.up}
              tone="up"
              title={`BIST100'deki ${breadth.up} hisse bugün artıda kapanıyor (${breadth.total} aktif hisse içinde)`}
            />
            <StatChip
              label="Düşen"
              value={breadth.down}
              tone="down"
              title={`BIST100'deki ${breadth.down} hisse bugün eksideki kapanıyor (${breadth.total} aktif hisse içinde)`}
            />
          </>
        )}
        <div className="flex items-center gap-1.5 ml-auto text-[11px]" style={{ color: 'var(--text-faint)' }}>
          <Clock className="w-3 h-3" />
          {now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      {error && (
        <div className="rounded-xl p-3 text-sm flex items-start gap-2"
          style={{
            background: 'rgba(255, 59, 70, 0.08)',
            border: '1px solid rgba(255, 59, 70, 0.28)',
            color: 'var(--ember)',
          }}
        >
          <span>⚠</span>
          <span>{error}</span>
        </div>
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

      {/* Bugünün Sinyalleri Özeti — boşluğu doldurur, daily-signals'e atlar */}
      <DailySignalsSummary snapshot={dailySnapshot} navigate={navigate} loading={loading && !dailySnapshot} />

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
