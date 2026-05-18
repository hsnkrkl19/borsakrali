import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Clock, ArrowRight, ChevronRight, RefreshCw, TrendingUp, TrendingDown, Search, Crown,
} from 'lucide-react'
import apiClient from '../services/api'
import GuestCTA from '../components/GuestCTA'
import HelpBubble from '../components/HelpBubble'
import HomeFooter from '../components/home/HomeFooter'
import DecisionDetailModal from '../components/DecisionDetailModal'
import OpportunityListModal from '../components/OpportunityListModal'
import { useAuthStore } from '../store/authStore'
import { useScrollReveal } from '../hooks/useAnime'

/* ─── Borsa açık/kapalı durumu ─────────────────────────────────────────── */
function getMarketStatus(now = new Date()) {
  const day = now.getDay()
  const h = now.getHours()
  const m = now.getMinutes()
  const t = h * 60 + m
  const open = 10 * 60
  const close = 18 * 60
  const isWeekday = day >= 1 && day <= 5
  if (isWeekday && t >= open && t < close) {
    return { open: true, label: 'Borsa açık', sub: `Kapanışa ${Math.floor((close - t) / 60)}sa ${(close - t) % 60}dk` }
  }
  let daysUntil = 0
  if (!isWeekday) daysUntil = day === 0 ? 1 : 2
  else if (t >= close) daysUntil = day === 5 ? 3 : 1
  return { open: false, label: 'Borsa kapalı', sub: daysUntil === 0 ? 'Bugün 10:00\'da açılır' : `${daysUntil} gün sonra açılır` }
}

/* ─── Selamlama saatine göre ──────────────────────────────────────────── */
function getGreeting(hour) {
  if (hour < 6)  return 'İyi geceler'
  if (hour < 12) return 'Günaydın'
  if (hour < 18) return 'İyi günler'
  return 'İyi akşamlar'
}

/* ─── Hisse Merkezi araması — anasayfa hero arama kutusu ─────────────── */
function DashboardStockSearch() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [results, setResults] = useState({ stocks: [], coins: [] })
  const [loading, setLoading] = useState(false)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!q || q.length < 1) { setResults({ stocks: [], coins: [] }); return }
    const ctrl = new AbortController()
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const [stockRes, cryptoRes] = await Promise.allSettled([
          apiClient.get(`/market/stocks/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal }),
          apiClient.get(`/crypto/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal }),
        ])
        const stocks = stockRes.status === 'fulfilled'
          ? (stockRes.value.data?.stocks || []).slice(0, 6) : []
        const coins = cryptoRes.status === 'fulfilled'
          ? (cryptoRes.value.data?.coins || []).slice(0, 4) : []
        setResults({ stocks, coins })
      } catch { /* yok say */ }
      finally { setLoading(false) }
    }, 150)
    return () => { clearTimeout(t); ctrl.abort?.() }
  }, [q])

  const go = (sym, type = 'stock') => {
    const path = type === 'crypto'
      ? `/hisse/${sym.toUpperCase()}?type=crypto`
      : `/hisse/${sym.toUpperCase()}`
    navigate(path)
  }

  const onEnter = (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const trim = q.trim()
    if (!trim) return
    const first = results.stocks[0] || results.coins[0]
    if (first) go(first.symbol || first.id, results.stocks[0] ? 'stock' : 'crypto')
    else go(trim, 'stock')
  }

  const showResults = focused && (results.stocks.length > 0 || results.coins.length > 0 || loading)

  return (
    <div
      className="rounded-2xl border p-4 sm:p-5 relative"
      style={{
        background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.06) 0%, var(--bg-card) 70%)',
        borderColor: 'var(--border-gold)',
        boxShadow: '0 0 0 1px rgba(212, 175, 55, 0.15) inset, 0 8px 28px rgba(0, 0, 0, 0.18)',
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Crown className="w-4 h-4" style={{ color: 'var(--gold-400)' }} />
        <h2 className="text-[14px] font-bold uppercase tracking-wider" style={{ color: 'var(--gold-400)' }}>
          Hisse Merkezi
        </h2>
        <span className="text-[10.5px] hidden sm:inline" style={{ color: 'var(--text-faint)' }}>
          tek arama, tüm analizler
        </span>
      </div>
      <p className="text-[13px] mb-3" style={{ color: 'var(--text-secondary)' }}>
        Hisse adını yaz — teknik, temel, EMA34, TEMA34, SNR, SMC, AI skor ve X yorumları tek sayfada.
      </p>

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5" style={{ color: 'var(--gold-400)' }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 180)}
          onKeyDown={onEnter}
          placeholder="THYAO, GARAN, ASELS, BTC… (Enter ile aç)"
          className="w-full h-12 pl-10 pr-4 rounded-xl text-[14px] focus:outline-none"
          style={{
            background: 'rgba(var(--bg-input-rgb), 0.85)',
            border: '1px solid var(--border-main)',
            color: 'var(--text-primary)',
          }}
        />

        {showResults && (
          <div className="absolute left-0 right-0 top-full mt-2 rounded-xl overflow-hidden z-30 max-h-[24rem] overflow-y-auto custom-scrollbar"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)', boxShadow: '0 12px 28px rgba(0, 0, 0, 0.35)' }}
          >
            {loading && (
              <div className="px-3 py-2 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>Aranıyor…</div>
            )}
            {results.stocks.length > 0 && (
              <div>
                <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold"
                  style={{ color: 'var(--text-faint)', background: 'var(--bg-elevated)' }}>
                  BIST Hisseleri
                </div>
                {results.stocks.map((s) => (
                  <button
                    key={s.symbol}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => go(s.symbol, 'stock')}
                    className="w-full text-left flex items-center justify-between px-3 py-2 transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <span className="flex flex-col min-w-0 flex-1">
                      <span className="font-bold text-[13px] truncate" style={{ color: 'var(--text-primary)' }}>{s.symbol}</span>
                      <span className="text-[10.5px] truncate" style={{ color: 'var(--text-faint)' }}>{s.name}</span>
                    </span>
                    {s.price != null && (
                      <span className="text-[11.5px] num-tabular flex items-center gap-1.5 flex-shrink-0">
                        <span style={{ color: 'var(--text-muted)' }}>{Number(s.price).toFixed(2)} ₺</span>
                        {s.changePercent != null && (
                          <span style={{ color: s.changePercent >= 0 ? 'var(--jade)' : 'var(--ember)' }}>
                            {s.changePercent >= 0 ? '+' : ''}{Number(s.changePercent).toFixed(2)}%
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {results.coins.length > 0 && (
              <div>
                <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold"
                  style={{ color: 'var(--text-faint)', background: 'var(--bg-elevated)' }}>
                  Kripto
                </div>
                {results.coins.map((c) => (
                  <button
                    key={c.symbol || c.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => go((c.symbol || c.id), 'crypto')}
                    className="w-full text-left flex items-center justify-between px-3 py-2 transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <span className="flex flex-col">
                      <span className="font-bold text-[13px]" style={{ color: 'var(--text-primary)' }}>
                        {(c.symbol || c.id).toUpperCase()}
                      </span>
                      <span className="text-[10.5px]" style={{ color: 'var(--text-faint)' }}>{c.name}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 mt-3 items-center">
        <span className="text-[11px] mr-1" style={{ color: 'var(--text-faint)' }}>Popüler:</span>
        {['THYAO', 'GARAN', 'ASELS', 'KCHOL', 'EREGL', 'BIMAS', 'TUPRS', 'AKBNK'].map(s => (
          <button
            key={s}
            onClick={() => go(s, 'stock')}
            className="text-[11px] font-semibold px-2 py-1 rounded-lg transition-all hover:scale-105"
            style={{
              background: 'rgba(212, 175, 55, 0.10)',
              border: '1px solid rgba(212, 175, 55, 0.25)',
              color: 'var(--gold-400)',
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ─── Karar Kartı — 3 büyük slot ──────────────────────────────────────── */
function DecisionCard({ tone, emoji, title, symbol, label, sentence, onDetail, loading, empty }) {
  // tone: 'long' | 'short' | 'watch'
  const palette = tone === 'long'
    ? { rgb: '0, 201, 138', color: 'var(--jade)' }
    : tone === 'short'
      ? { rgb: '255, 59, 70', color: 'var(--ember)' }
      : { rgb: '212, 175, 55', color: 'var(--gold-400)' }

  return (
    <div
      className="relative rounded-2xl p-5 border overflow-hidden flex flex-col"
      style={{
        background: `linear-gradient(135deg, rgba(${palette.rgb}, 0.10) 0%, var(--bg-card) 60%)`,
        borderColor: `rgba(${palette.rgb}, 0.45)`,
        boxShadow: `var(--shadow-card), 0 0 0 1px rgba(${palette.rgb}, 0.18) inset`,
        minHeight: 180,
      }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
        style={{ background: `linear-gradient(90deg, transparent, rgba(${palette.rgb}, 0.7) 50%, transparent)` }}
      />

      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl leading-none" aria-hidden="true">{emoji}</span>
        <span className="text-[11px] uppercase tracking-[0.14em] font-semibold" style={{ color: 'var(--text-faint)' }}>
          {title}
        </span>
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="h-8 w-32 rounded animate-pulse" style={{ background: 'var(--bg-elevated)' }} />
          <div className="h-5 w-24 rounded animate-pulse" style={{ background: 'var(--bg-elevated)' }} />
          <div className="h-4 w-48 rounded animate-pulse" style={{ background: 'var(--bg-elevated)' }} />
        </div>
      ) : empty ? (
        <div className="flex-1 flex flex-col justify-center">
          <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
            Henüz uygun fırsat yok. Borsa açılınca burada görünecek.
          </p>
        </div>
      ) : (
        <>
          <div
            className="text-3xl font-bold tracking-tight mb-1"
            style={{ color: 'var(--text-primary)' }}
          >
            {symbol}
          </div>
          <div
            className="text-[13px] font-bold tracking-wider uppercase mb-2"
            style={{ color: palette.color }}
          >
            {label}
          </div>
          <p className="text-[13px] leading-snug flex-1" style={{ color: 'var(--text-secondary)' }}>
            {sentence}
          </p>
          {onDetail && (
            <button
              onClick={onDetail}
              className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold self-start"
              style={{ color: palette.color }}
            >
              Detay <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </>
      )}
    </div>
  )
}

/* ─── Sinyalleri etikete map'le ──────────────────────────────────────── */
// Backend daily-signals/today şu yapıyı döndürür:
//   { revision|premarket: { trend: { signals: [...] }, reversion: { signals: [...] } } }
// Her sinyalin direction: 'long'|'short', totalScore, applicableMax alanları var.
//
// Sayaç tanımları (mutually exclusive — toplamı = total):
//   • strong   = trend long sinyalleri (anlık AL)
//   • risky    = trend short sinyalleri (anlık SAT)
//   • watching = reversion sinyalleri (zone'a değmesini bekleyen — yön farketmez)
function pickDecisionCards(snapshot) {
  const phase = snapshot?.revision || snapshot?.premarket
  const trendSignals = phase?.trend?.signals || []
  const reversionSignals = phase?.reversion?.signals || []
  const all = [...trendSignals, ...reversionSignals]

  const longs  = all.filter((s) => s.direction === 'long').sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))
  const shorts = all.filter((s) => s.direction === 'short').sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))

  const topLong  = longs[0]
  const topShort = shorts[0]
  const watch    = longs[1] || longs[2] || null  // ikinci en güçlü long → "takip" adayı

  return {
    topLong, topShort, watch,
    total: all.length,
    counts: {
      strong:   trendSignals.filter(s => s.direction === 'long').length,
      risky:    trendSignals.filter(s => s.direction === 'short').length,
      watching: reversionSignals.length,
    },
  }
}

export default function Dashboard() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [bist100, setBist100] = useState(null)
  const [dailySnapshot, setDailySnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const [now, setNow] = useState(new Date())
  const [detail, setDetail] = useState(null) // { signal, tone, title } — Detay modal'ı için
  const [listOpen, setListOpen] = useState(false) // "X fırsat" tıklanınca liste modal'ı

  useEffect(() => {
    let active = true
    setLoading(true)

    Promise.allSettled([
      apiClient.get('/market/bist100'),
      apiClient.get('/daily-signals/today'),
    ]).then(([b100, ds]) => {
      if (!active) return
      if (b100.status === 'fulfilled') setBist100(b100.value.data)
      if (ds.status   === 'fulfilled') setDailySnapshot(ds.value.data)
      const allRejected = [b100, ds].every((r) => r.status === 'rejected')
      if (allRejected) setError('Veriler şu an yüklenemedi. Birkaç saniye sonra tekrar deneyin.')
      else setError(null)
    }).finally(() => active && setLoading(false))

    return () => { active = false }
  }, [refreshTick])

  useEffect(() => {
    const i = setInterval(() => setRefreshTick((t) => t + 1), 60_000)
    const onRefresh = () => setRefreshTick((t) => t + 1)
    window.addEventListener('bk-refresh-market', onRefresh)
    return () => { clearInterval(i); window.removeEventListener('bk-refresh-market', onRefresh) }
  }, [])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  const market = useMemo(() => getMarketStatus(now), [now])
  const { topLong, topShort, watch, total, counts } = useMemo(() => pickDecisionCards(dailySnapshot), [dailySnapshot])
  const greeting = useMemo(() => getGreeting(now.getHours()), [now])
  const firstName = user?.firstName || 'Borsa Kralı'

  const cockpitRef = useScrollReveal({ selector: '> *', stagger: 80, y: 22, duration: 800, delay: 50 })

  const bistChange = bist100?.changePercent
  const bistChangeStr = bistChange != null
    ? `${bistChange >= 0 ? '+' : ''}${bistChange.toFixed(2)}%`
    : null

  return (
    <div className="space-y-10 sm:space-y-14 lg:space-y-16">
      <div ref={cockpitRef} className="space-y-6 scroll-mt-20">
        <GuestCTA />

        {/* Hisse Merkezi araması — herhangi bir hisseyi yaz, tek çatı altında detaya git */}
        <DashboardStockSearch />

        {/* Üst: selamlama + borsa durumu + yenile */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              {greeting}, {firstName}.
              <HelpBubble text="Bugün ne yapacağını tek bakışta görürsün." />
            </h1>
            <p className="text-sm sm:text-base mt-1" style={{ color: 'var(--text-secondary)' }}>
              {loading
                ? 'Bugünün fırsatları hazırlanıyor…'
                : total > 0
                  ? (
                    <>
                      Bugün{' '}
                      <button
                        onClick={() => setListOpen(true)}
                        className="font-bold underline-offset-2 hover:underline transition-opacity hover:opacity-80"
                        style={{ color: 'var(--gold-400)' }}
                        title="Tüm fırsatları listele"
                      >
                        {total} fırsat
                      </button>
                      {' '}bulduk —{' '}
                      <button
                        onClick={() => setListOpen(true)}
                        className="text-[12.5px] font-semibold inline-flex items-center gap-0.5 hover:opacity-80"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        listeyi aç
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </>
                  )
                  : 'Bugün henüz fırsat hazır değil — birazdan tekrar bak.'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className={`market-status ${market.open ? 'is-open' : 'is-closed'}`}>
              <span className={`status-dot ${market.open ? 'status-dot-live' : 'status-dot-off'}`} />
              <span>{market.label}</span>
              <span className="hidden sm:inline" style={{ color: 'var(--text-muted)', fontWeight: 500 }}>· {market.sub}</span>
            </div>
            <button
              onClick={() => setRefreshTick((t) => t + 1)}
              className="h-9 px-3 rounded-xl flex items-center gap-2 transition-all"
              style={{
                background: 'rgba(212, 175, 55, 0.10)',
                border: '1px solid var(--border-gold)',
                color: 'var(--gold-400)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(212, 175, 55, 0.18)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(212, 175, 55, 0.10)')}
              aria-label="Yenile"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline text-[12.5px] font-semibold">Yenile</span>
            </button>
          </div>
        </div>

        {error && (
          <div
            className="rounded-xl p-3 text-sm flex items-start gap-2"
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

        {/* 3 BÜYÜK KARAR KARTI */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4" data-tour="dashboard-card">
          <DecisionCard
            tone="long"
            emoji="🟢"
            title="Bugünün Güçlü Hissesi"
            symbol={topLong?.symbol}
            label="AL"
            sentence={topLong ? 'Yükseliş başladı. Alıcılar güçleniyor.' : ''}
            empty={!loading && !topLong}
            loading={loading && !dailySnapshot}
            onDetail={topLong ? () => setDetail({ signal: topLong, tone: 'long', title: 'Bugünün Güçlü Hissesi' }) : null}
          />
          <DecisionCard
            tone="short"
            emoji="🔴"
            title="Riskli Bölge"
            symbol={topShort?.symbol}
            label="ŞİMDİ GİRME"
            sentence={topShort ? 'Düşüş baskısı sürüyor.' : ''}
            empty={!loading && !topShort}
            loading={loading && !dailySnapshot}
            onDetail={topShort ? () => setDetail({ signal: topShort, tone: 'short', title: 'Riskli Bölge' }) : null}
          />
          <DecisionCard
            tone="watch"
            emoji="🟡"
            title="Takip Et"
            symbol={watch?.symbol}
            label="HAREKET BEKLENİYOR"
            sentence={watch ? 'Yatay seyir, çıkış yakın.' : ''}
            empty={!loading && !watch}
            loading={loading && !dailySnapshot}
            onDetail={watch ? () => setDetail({ signal: watch, tone: 'watch', title: 'Takip Et' }) : null}
          />
        </div>

        {/* ÖZET ŞERİDİ — mobilde dikey stack, sm+ tek satır.
            Eski flex-wrap + ml-auto buton'un tek başına sağa kayarak kırılmasına
            neden oluyordu. flex-col → flex-row geçişi deterministik. */}
        <div
          className="rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:flex-wrap gap-y-2 gap-x-5 text-[13px]"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-main)',
          }}
        >
          {bistChangeStr != null ? (
            <span className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
              BIST100 bugün
              <strong
                className="flex items-center gap-1"
                style={{ color: bistChange >= 0 ? 'var(--jade)' : 'var(--ember)' }}
              >
                {bistChange >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {bistChangeStr}
              </strong>
              {bistChange >= 0 ? 'yükseldi' : 'düştü'}
            </span>
          ) : (
            <span style={{ color: 'var(--text-faint)' }}>BIST100 verisi bekleniyor…</span>
          )}

          <span className="flex items-center gap-2 flex-wrap" style={{ color: 'var(--text-secondary)' }}>
            <span title="Anlık AL fırsatları (trend takibi)">
              <strong style={{ color: 'var(--jade)' }}>{counts.strong}</strong> güçlü
            </span>
            <span aria-hidden="true" style={{ color: 'var(--text-faint)' }}>·</span>
            <span title="Anlık SAT uyarıları (kaçınılması önerilen)">
              <strong style={{ color: 'var(--ember)' }}>{counts.risky}</strong> riskli
            </span>
            <span aria-hidden="true" style={{ color: 'var(--text-faint)' }}>·</span>
            <span title="Zone'a gelmesini bekleyen reversion fırsatları">
              <strong style={{ color: 'var(--gold-400)' }}>{counts.watching}</strong> takipte
            </span>
          </span>

          {/* Eylem + saat — mobilde alt satırda solda, sm+ sağda */}
          <div className="flex items-center gap-3 sm:ml-auto">
            <button
              onClick={() => setListOpen(true)}
              className="inline-flex items-center gap-1 text-[12.5px] font-semibold transition-opacity hover:opacity-80"
              style={{ color: 'var(--gold-400)' }}
              title="BIST + Kripto tüm sinyalleri listele"
            >
              Tam listeyi gör <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <span className="hidden sm:flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-faint)' }}>
              <Clock className="w-3 h-3" />
              {now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      </div>

      <HomeFooter />

      {listOpen && (
        <OpportunityListModal
          snapshot={dailySnapshot}
          onClose={() => setListOpen(false)}
          onPick={(signal, tone, title) => setDetail({ signal, tone, title })}
        />
      )}
      {detail && (
        <DecisionDetailModal
          signal={detail.signal}
          tone={detail.tone}
          cardTitle={detail.title}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  )
}
