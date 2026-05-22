import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight, ChevronRight, RefreshCw, TrendingUp, TrendingDown,
  Search, Crown, Eye, Clock, AlertTriangle,
} from 'lucide-react'
import apiClient from '../services/api'
import GuestCTA from '../components/GuestCTA'
import HelpBubble from '../components/HelpBubble'
import HomeFooter from '../components/home/HomeFooter'
import LazyOnScroll from '../components/LazyOnScroll'
import DecisionDetailModal from '../components/DecisionDetailModal'
import OpportunityListModal from '../components/OpportunityListModal'
import { Button, Card, Badge, Skeleton } from '../components/ui'
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
    <Card tone="gold" accent padding="md">
      <div className="mb-2.5 flex items-center gap-2">
        <Crown size={15} style={{ color: 'var(--gold-400)' }} aria-hidden="true" />
        <h2 className="text-[13px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--gold-400)' }}>
          Hisse Merkezi
        </h2>
        <span className="hidden text-[10.5px] sm:inline" style={{ color: 'var(--text-faint)' }}>
          · tek arama, tüm analizler
        </span>
      </div>
      <p className="mb-3 text-[12.5px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
        Hisse adını yaz — teknik, temel, EMA34, TEMA34, SNR, SMC, AI skor ve X yorumları tek sayfada.
      </p>

      <div className="relative">
        <Search
          size={17}
          className="absolute left-3.5 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--gold-400)' }}
          aria-hidden="true"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 180)}
          onKeyDown={onEnter}
          aria-label="Hisse veya kripto ara"
          placeholder="THYAO, GARAN, ASELS, BTC… (Enter ile aç)"
          className="h-12 w-full rounded-xl pl-10 pr-4 text-[14px] transition-colors"
          style={{
            background: 'rgba(var(--bg-input-rgb), 0.85)',
            border: '1px solid var(--border-main)',
            color: 'var(--text-primary)',
          }}
        />

        {showResults && (
          <div
            className="custom-scrollbar absolute left-0 right-0 top-full z-30 mt-2 max-h-[24rem] overflow-y-auto overflow-hidden rounded-xl"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)', boxShadow: 'var(--shadow-lg)' }}
          >
            {loading && (
              <div className="px-3 py-2 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>Aranıyor…</div>
            )}
            {results.stocks.length > 0 && (
              <div>
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: 'var(--text-faint)', background: 'var(--bg-elevated)' }}>
                  BIST Hisseleri
                </div>
                {results.stocks.map((s) => (
                  <button
                    key={s.symbol}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => go(s.symbol, 'stock')}
                    className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>{s.symbol}</span>
                      <span className="truncate text-[10.5px]" style={{ color: 'var(--text-faint)' }}>{s.name}</span>
                    </span>
                    {s.price != null && (
                      <span className="num-tabular flex flex-shrink-0 items-center gap-1.5 text-[11.5px]">
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
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: 'var(--text-faint)', background: 'var(--bg-elevated)' }}>
                  Kripto
                </div>
                {results.coins.map((c) => (
                  <button
                    key={c.symbol || c.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => go((c.symbol || c.id), 'crypto')}
                    className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <span className="flex flex-col">
                      <span className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
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

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px]" style={{ color: 'var(--text-faint)' }}>Popüler:</span>
        {['THYAO', 'GARAN', 'ASELS', 'KCHOL', 'EREGL', 'BIMAS', 'TUPRS', 'AKBNK'].map((s) => (
          <Button key={s} variant="outline" size="sm" onClick={() => go(s, 'stock')}>
            {s}
          </Button>
        ))}
      </div>
    </Card>
  )
}

/* ─── Karar Kartı — 3 büyük slot ──────────────────────────────────────── */
const DECISION_TONE = {
  jade:  { fg: 'var(--jade)',     bg: 'rgba(0, 201, 138, 0.12)', bd: 'rgba(0, 201, 138, 0.30)' },
  ember: { fg: 'var(--ember)',    bg: 'rgba(255, 59, 70, 0.12)', bd: 'rgba(255, 59, 70, 0.30)' },
  gold:  { fg: 'var(--gold-400)', bg: 'rgba(212, 175, 55, 0.12)', bd: 'var(--border-gold)' },
}

function DecisionCard({ tone, icon: Icon, title, symbol, label, badgeTone, sentence, onDetail, loading, empty }) {
  const palette = DECISION_TONE[tone]
  const clickable = !!onDetail && !loading && !empty

  return (
    <Card
      tone={tone}
      accent
      padding="lg"
      interactive={clickable}
      className="flex flex-col"
      style={{ minHeight: 204 }}
      {...(clickable ? {
        role: 'button',
        tabIndex: 0,
        onClick: onDetail,
        onKeyDown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDetail() }
        },
        'aria-label': `${title}: ${symbol} detayını aç`,
      } : {})}
    >
      <div className="mb-4 flex items-center gap-2.5">
        <span
          className="flex items-center justify-center rounded-lg"
          style={{ width: 32, height: 32, background: palette.bg, border: `1px solid ${palette.bd}` }}
        >
          <Icon size={17} strokeWidth={2.3} style={{ color: palette.fg }} aria-hidden="true" />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.13em]" style={{ color: 'var(--text-faint)' }}>
          {title}
        </span>
      </div>

      {loading ? (
        <div className="flex flex-1 flex-col gap-3">
          <Skeleton w={128} h={34} />
          <Skeleton w={72} h={20} rounded={999} />
          <Skeleton count={2} />
        </div>
      ) : empty ? (
        <div className="flex flex-1 items-center">
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Henüz uygun fırsat yok. Borsa açılınca burada görünecek.
          </p>
        </div>
      ) : (
        <>
          <div
            className="num-tabular text-[28px] font-bold leading-none tracking-tight sm:text-[32px]"
            style={{ color: 'var(--text-primary)' }}
          >
            {symbol}
          </div>
          <Badge tone={badgeTone} className="mt-2.5 self-start">{label}</Badge>
          <p className="mt-2.5 flex-1 text-[13px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
            {sentence}
          </p>
          {onDetail && (
            <span
              className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold"
              style={{ color: palette.fg }}
            >
              Detayı gör <ChevronRight className="h-3.5 w-3.5" />
            </span>
          )}
        </>
      )}
    </Card>
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
  const dateLabel = now.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })

  const cockpitRef = useScrollReveal({ selector: '> *', stagger: 80, y: 22, duration: 800, delay: 50 })

  const bistChange = bist100?.changePercent
  const bistChangeStr = bistChange != null
    ? `${bistChange >= 0 ? '+' : ''}${bistChange.toFixed(2)}%`
    : null

  return (
    <div className="space-y-10 sm:space-y-14 lg:space-y-16">
      <div ref={cockpitRef} className="space-y-6 scroll-mt-20">
        <GuestCTA />

        {/* HERO — selamlama + tarih + borsa durumu */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div
              className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.16em]"
              style={{ color: 'var(--gold-400)' }}
            >
              {dateLabel}
            </div>
            <h1
              className="text-2xl font-bold leading-tight tracking-tight sm:text-[28px]"
              style={{ color: 'var(--text-primary)' }}
            >
              {greeting}, <span className="text-gold">{firstName}</span>.
              <HelpBubble text="Bugün ne yapacağını tek bakışta görürsün." />
            </h1>
            <p className="mt-1.5 text-sm sm:text-[15px]" style={{ color: 'var(--text-secondary)' }}>
              {loading
                ? 'Bugünün fırsatları hazırlanıyor…'
                : total > 0
                  ? (
                    <>
                      Bugün{' '}
                      <button
                        onClick={() => setListOpen(true)}
                        className="font-bold underline-offset-2 transition-opacity hover:underline hover:opacity-80"
                        style={{ color: 'var(--gold-400)' }}
                        title="Tüm fırsatları listele"
                      >
                        {total} fırsat
                      </button>
                      {' '}bulduk —{' '}
                      <button
                        onClick={() => setListOpen(true)}
                        className="inline-flex items-center gap-0.5 text-[12.5px] font-semibold hover:opacity-80"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        listeyi aç
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    </>
                  )
                  : 'Bugün henüz fırsat hazır değil — birazdan tekrar bak.'}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <div className={`market-status ${market.open ? 'is-open' : 'is-closed'}`}>
              <span className={`status-dot ${market.open ? 'status-dot-live' : 'status-dot-off'}`} />
              <span>{market.label}</span>
              <span className="hidden sm:inline" style={{ color: 'var(--text-muted)', fontWeight: 500 }}>· {market.sub}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              icon={RefreshCw}
              loading={loading}
              onClick={() => setRefreshTick((t) => t + 1)}
              aria-label="Verileri yenile"
            >
              <span className="hidden sm:inline">Yenile</span>
            </Button>
          </div>
        </div>

        {/* Hisse Merkezi araması — herhangi bir hisseyi yaz, tek çatı altında detaya git */}
        <DashboardStockSearch />

        {error && (
          <div
            className="flex items-start gap-2.5 rounded-xl p-3.5 text-[13px]"
            style={{
              background: 'rgba(255, 59, 70, 0.08)',
              border: '1px solid rgba(255, 59, 70, 0.28)',
              color: 'var(--ember)',
            }}
          >
            <AlertTriangle className="mt-px h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 3 BÜYÜK KARAR KARTI */}
        <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3" data-tour="dashboard-card">
          <DecisionCard
            tone="jade"
            icon={TrendingUp}
            title="Bugünün Güçlü Hissesi"
            symbol={topLong?.symbol}
            label="AL"
            badgeTone="jade"
            sentence={topLong ? 'Yükseliş başladı. Alıcılar güçleniyor.' : ''}
            empty={!loading && !topLong}
            loading={loading && !dailySnapshot}
            onDetail={topLong ? () => setDetail({ signal: topLong, tone: 'long', title: 'Bugünün Güçlü Hissesi' }) : null}
          />
          <DecisionCard
            tone="ember"
            icon={TrendingDown}
            title="Riskli Bölge"
            symbol={topShort?.symbol}
            label="ŞİMDİ GİRME"
            badgeTone="ember"
            sentence={topShort ? 'Düşüş baskısı sürüyor.' : ''}
            empty={!loading && !topShort}
            loading={loading && !dailySnapshot}
            onDetail={topShort ? () => setDetail({ signal: topShort, tone: 'short', title: 'Riskli Bölge' }) : null}
          />
          <DecisionCard
            tone="gold"
            icon={Eye}
            title="Takip Et"
            symbol={watch?.symbol}
            label="HAREKET BEKLENİYOR"
            badgeTone="gold"
            sentence={watch ? 'Yatay seyir, çıkış yakın.' : ''}
            empty={!loading && !watch}
            loading={loading && !dailySnapshot}
            onDetail={watch ? () => setDetail({ signal: watch, tone: 'watch', title: 'Takip Et' }) : null}
          />
        </div>

        {/* ÖZET ŞERİDİ — piyasa nabzı tek bakışta */}
        <Card padding="none" className="flex flex-col gap-y-3 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
          {bistChangeStr != null ? (
            <span className="flex items-center gap-2 text-[13px]">
              <span style={{ color: 'var(--text-muted)' }}>BIST 100</span>
              <strong
                className="num-tabular flex items-center gap-1 text-[13.5px]"
                style={{ color: bistChange >= 0 ? 'var(--jade)' : 'var(--ember)' }}
              >
                {bistChange >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                {bistChangeStr}
              </strong>
              <span style={{ color: 'var(--text-faint)' }}>{bistChange >= 0 ? 'yükselişte' : 'düşüşte'}</span>
            </span>
          ) : (
            <span className="text-[12.5px]" style={{ color: 'var(--text-faint)' }}>BIST 100 verisi bekleniyor…</span>
          )}

          <span aria-hidden="true" className="hidden h-4 w-px sm:block" style={{ background: 'var(--border-main)' }} />

          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { v: counts.strong,   l: 'güçlü',   c: 'var(--jade)',     t: 'Anlık AL fırsatları (trend takibi)' },
              { v: counts.risky,    l: 'riskli',  c: 'var(--ember)',    t: 'Anlık SAT uyarıları (kaçınılması önerilen)' },
              { v: counts.watching, l: 'takipte', c: 'var(--gold-400)', t: 'Zone\'a gelmesini bekleyen reversion fırsatları' },
            ].map((x) => (
              <span
                key={x.l}
                title={x.t}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-main)' }}
              >
                <strong className="num-tabular text-[13px]" style={{ color: x.c }}>{x.v}</strong>
                <span className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{x.l}</span>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-3 sm:ml-auto">
            <Button variant="subtle" size="sm" iconRight={ArrowRight} onClick={() => setListOpen(true)}>
              Tam listeyi gör
            </Button>
            <span className="hidden items-center gap-1.5 text-[11px] sm:flex" style={{ color: 'var(--text-faint)' }}>
              <Clock className="h-3 w-3" />
              {now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </Card>
      </div>

      <LazyOnScroll rootMargin="600px" fallback={<div style={{ minHeight: 400 }} />}>
        <HomeFooter />
      </LazyOnScroll>

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
