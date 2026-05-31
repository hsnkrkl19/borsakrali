/**
 * Sinyaller — Özet Komuta Sayfası
 *
 * BIST + Kripto sinyallerinin tek bir yerden hızlı erişim merkezi.
 * Üstte: 3 büyük "öne çıkan" kart (en yüksek skorlu BIST trend + spot_long + futures_long).
 * Altta: 5 sekme × top 5 (BIST Trend / BIST Reversion / Kripto Spot / Futures Long / Short).
 *
 * Tüm sinyaller backtest tabanlı historicalWinRate + confidence band ile zenginleştirilmiş;
 * her kartta net Entry/Stop/Target/R/R/WinRate gözükür.
 */

import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  TrendingUp, TrendingDown, Target, Sparkles, Coins, RefreshCw, ChevronRight,
  AlertCircle, Activity, RotateCcw, Crown, Info, Layers,
} from 'lucide-react'
import api from '../services/api'
import MTFConfluenceSummary from '../components/MTFConfluenceSummary'
import HelpBubble from '../components/HelpBubble'
import { Button, Card, Badge, Spinner, EmptyState, PageHeader } from '../components/ui'

// ── Tasarım tonları — design-system renkleriyle (jade/gold/azure/ember) ────
// fg: metin/ikon · bg: dolgu · bd: aktif kenarlık · line: yumuşak kenarlık
const TONE = {
  jade:  { fg: 'var(--jade)',     bg: 'rgba(16, 185, 129, 0.12)', bd: 'rgba(16, 185, 129, 0.45)', line: 'rgba(16, 185, 129, 0.22)' },
  gold:  { fg: 'var(--gold-400)', bg: 'rgba(16, 185, 129, 0.12)', bd: 'rgba(16, 185, 129, 0.45)', line: 'rgba(16, 185, 129, 0.22)' },
  azure: { fg: 'var(--azure)',    bg: 'rgba(59, 130, 246, 0.12)', bd: 'rgba(59, 130, 246, 0.45)', line: 'rgba(59, 130, 246, 0.22)' },
  ember: { fg: 'var(--ember)',    bg: 'rgba(225, 29, 72, 0.12)',  bd: 'rgba(225, 29, 72, 0.45)',  line: 'rgba(225, 29, 72, 0.22)' },
}

const GRADE_TONE = { MUKEMMEL: 'jade', GUCLU: 'azure', ORTA: 'gold', ZAYIF: 'neutral' }

const CONFIDENCE = {
  high:    { label: 'Yüksek', tone: 'jade',    icon: '✓' },
  mid:     { label: 'Orta',   tone: 'gold',    icon: '~' },
  low:     { label: 'Düşük',  tone: 'ember',   icon: '!' },
  unknown: { label: 'Yeni',   tone: 'neutral', icon: '?' },
}

const TABS = [
  { key: 'trend',         label: 'BIST · Yön Takibi',    icon: TrendingUp,   tone: 'jade',  source: 'bist',   block: 'trend' },
  { key: 'reversion',     label: 'BIST · Dönüş Bölgesi', icon: RotateCcw,    tone: 'gold',  source: 'bist',   block: 'reversion' },
  { key: 'spot_long',     label: 'Kripto · Spot AL',     icon: Coins,        tone: 'jade',  source: 'crypto', block: 'spot_long' },
  { key: 'futures_long',  label: 'Kripto · Yükseliş',    icon: Sparkles,     tone: 'azure', source: 'crypto', block: 'futures_long' },
  { key: 'futures_short', label: 'Kripto · Düşüş',       icon: TrendingDown, tone: 'ember', source: 'crypto', block: 'futures_short' },
]

const TOP_N_PER_TAB = 5

// USD format — kripto fiyatları geniş aralıkta
function formatUsd(value) {
  if (value == null) return '—'
  const v = Number(value)
  if (!isFinite(v)) return '—'
  if (v >= 1000) return `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
  if (v >= 10)   return `$${v.toFixed(3)}`
  if (v >= 1)    return `$${v.toFixed(4)}`
  if (v >= 0.01) return `$${v.toFixed(5)}`
  return `$${v.toFixed(8)}`
}

function formatTl(value) {
  if (value == null) return '—'
  return `${Number(value).toFixed(2)} TL`
}

// ── Bölüm başlığı — küçük etiket ─────────────────────────────────────────
function SectionLabel({ icon: Icon, children, extra }) {
  return (
    <h2
      className="mb-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.13em]"
      style={{ color: 'var(--text-faint)' }}
    >
      {Icon && <Icon size={14} style={{ color: 'var(--gold-400)' }} aria-hidden="true" />}
      {children}
      {extra}
    </h2>
  )
}

// ── Sayfa ─────────────────────────────────────────────────────────────────
export default function Sinyaller() {
  const navigate = useNavigate()
  const [bist, setBist] = useState(null)
  const [crypto, setCrypto] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState('trend')
  const [error, setError] = useState(null)

  const loadAll = useCallback(async () => {
    setError(null)
    try {
      const [bistRes, cryptoRes] = await Promise.allSettled([
        api.get('/daily-signals/today'),
        api.get('/market/crypto/signals'),
      ])
      setBist(bistRes.status === 'fulfilled' ? bistRes.value.data : null)
      setCrypto(cryptoRes.status === 'fulfilled' ? cryptoRes.value.data : null)
      if (bistRes.status === 'rejected' && cryptoRes.status === 'rejected') {
        setError('Sinyaller yüklenemedi. Sunucu uyanıyor olabilir, tekrar deneyin.')
      }
    } catch (e) {
      setError('Sinyaller yüklenemedi.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadAll()
    setRefreshing(false)
  }

  // BIST'in en güncel fazı (revision varsa, yoksa premarket)
  const bistPhase = bist?.revision || bist?.premarket || null

  // Sekmeye göre sinyalleri getir
  const getSignalsForTab = (tabKey) => {
    const tab = TABS.find(t => t.key === tabKey)
    if (!tab) return []
    if (tab.source === 'bist') {
      return bistPhase?.[tab.block]?.signals || []
    }
    return crypto?.[tab.block]?.signals || []
  }

  // En öne çıkan 3 sinyal (BIST trend + spot_long + futures_long en yüksek skorlu)
  const featuredSignals = [
    { tabKey: 'trend',        tab: TABS.find(t => t.key === 'trend'),        sig: (bistPhase?.trend?.signals || [])[0] || null,        source: 'bist' },
    { tabKey: 'spot_long',    tab: TABS.find(t => t.key === 'spot_long'),    sig: (crypto?.spot_long?.signals || [])[0] || null,       source: 'crypto' },
    { tabKey: 'futures_long', tab: TABS.find(t => t.key === 'futures_long'), sig: (crypto?.futures_long?.signals || [])[0] || null,    source: 'crypto' },
  ].filter(f => f.sig)

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <Spinner size={34} />
        <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Sinyaller yükleniyor…</p>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      {/* ── Sayfa başlığı ─────────────────────────────────────────────────── */}
      <PageHeader
        icon={Crown}
        eyebrow="Komuta Merkezi"
        title={<span className="inline-flex items-center">Sinyaller<HelpBubble text="Şu an hareket eden hisseler burada." /></span>}
        description="BIST + Kripto sinyallerinin tek noktadan özeti. Her sinyal backtest tabanlı geçmiş başarı oranı ile etiketli — detay için kartlara dokun."
        actions={
          <Button variant="ghost" size="sm" icon={RefreshCw} loading={refreshing} onClick={handleRefresh}>
            Yenile
          </Button>
        }
      />

      {error && (
        <Card tone="ember" padding="md" className="flex items-start gap-2.5">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--ember)' }} aria-hidden="true" />
          <div>
            <p className="text-[13px] font-semibold" style={{ color: 'var(--ember)' }}>{error}</p>
            <Button variant="subtle" size="sm" onClick={loadAll} className="mt-1">Tekrar dene</Button>
          </div>
        </Card>
      )}

      {/* ── Bilgi şeridi ──────────────────────────────────────────────────── */}
      <div
        className="flex items-start gap-2 rounded-xl p-3"
        style={{ background: 'rgba(59, 130, 246, 0.07)', border: '1px solid rgba(59, 130, 246, 0.22)' }}
      >
        <Info size={15} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--azure)' }} aria-hidden="true" />
        <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>Sinyal kalitesi v5</strong> · Min skor sıkılaştırıldı
          (BIST ≥6/10, Kripto ≥6/10), yapı kanıtı şart; her sinyale backtest geçmiş başarı oranı beslendi.
          Geçmiş veriler Pazar 03:00&apos;da güncellenir.
          <span style={{ color: 'var(--gold-400)' }}> ⚠ Yatırım tavsiyesi değildir, eğitim amaçlıdır.</span>
        </p>
      </div>

      {/* ── Öne çıkan 3 sinyal ────────────────────────────────────────────── */}
      {featuredSignals.length > 0 && (
        <div>
          <SectionLabel icon={Sparkles}>Bugünün En Güçlü Sinyalleri</SectionLabel>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {featuredSignals.map(({ tabKey, tab, sig, source }) => (
              <FeaturedCard
                key={tabKey}
                tab={tab}
                sig={sig}
                source={source}
                onClick={() => navigate(`/gunluk-tespitler?tab=${source === 'bist' ? 'bugun' : 'kripto'}`)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── MTF Confluence özeti ──────────────────────────────────────────── */}
      <div>
        <SectionLabel
          icon={Layers}
          extra={
            <Badge tone="gold" className="ml-auto sm:ml-0" style={{ textTransform: 'none', letterSpacing: 0 }}>
              Bayesian kalibrasyon
            </Badge>
          }
        >
          MTF Confluence — 7 Timeframe Birleşimi
        </SectionLabel>
        <MTFConfluenceSummary navigate={navigate} />
      </div>

      {/* ── Sekme satırı ──────────────────────────────────────────────────── */}
      <div>
        <SectionLabel icon={Activity}>Strateji Bazında Top {TOP_N_PER_TAB}</SectionLabel>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
          {TABS.map(tab => {
            const Icon = tab.icon
            const t = TONE[tab.tone]
            const signals = getSignalsForTab(tab.key)
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                aria-pressed={isActive}
                className="rounded-xl border p-2.5 text-left transition-all"
                style={{
                  background: isActive ? t.bg : 'var(--bg-card)',
                  borderColor: isActive ? t.bd : 'var(--border-main)',
                }}
              >
                <div className="flex items-center justify-between gap-1">
                  <Icon size={15} style={{ color: isActive ? t.fg : 'var(--text-muted)' }} aria-hidden="true" />
                  <span
                    className="num-tabular text-base font-bold"
                    style={{ color: isActive ? t.fg : 'var(--text-faint)' }}
                  >
                    {signals.length}
                  </span>
                </div>
                <p
                  className="mt-1 truncate text-[11px] leading-tight"
                  style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: isActive ? 600 : 400 }}
                >
                  {tab.label}
                </p>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Aktif sekme listesi ───────────────────────────────────────────── */}
      <TabContent
        tab={TABS.find(t => t.key === activeTab)}
        signals={getSignalsForTab(activeTab).slice(0, TOP_N_PER_TAB)}
        totalCount={getSignalsForTab(activeTab).length}
      />

      {/* ── Alt navigasyon ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
        {[
          { to: '/gunluk-tespitler?tab=bugun', eyebrow: 'BIST Detaylı Analiz', title: 'Bugünün Sinyalleri · Tam Liste', desc: 'Tüm sinyaller, diff, revize sebepleri, expanded analiz' },
          { to: '/gunluk-tespitler?tab=kripto', eyebrow: 'Kripto Detaylı Analiz', title: 'Kripto Sinyalleri · Tam Liste', desc: 'Spot + Futures (long/short), 10 koşul detayı, funding rate' },
        ].map((nav) => (
          <Card key={nav.to} as={Link} to={nav.to} interactive padding="md" className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>{nav.eyebrow}</p>
              <p className="mt-0.5 text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>{nav.title}</p>
              <p className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>{nav.desc}</p>
            </div>
            <ChevronRight className="h-5 w-5 flex-shrink-0 transition-colors" style={{ color: 'var(--text-faint)' }} />
          </Card>
        ))}
      </div>

      {/* ── Footer disclaimer ───────────────────────────────────────────── */}
      <p className="pt-1 text-center text-[10px]" style={{ color: 'var(--text-faint)' }}>
        Sinyaller algoritmik olarak üretilir, yatırım tavsiyesi değildir. Kendi araştırmanızı yapın.
      </p>
    </div>
  )
}

// ─── Öne çıkan büyük kart ────────────────────────────────────────────────
function FeaturedCard({ tab, sig, source, onClick }) {
  const isLong = sig.direction === 'long'
  const conf = CONFIDENCE[sig.confidence] || CONFIDENCE.unknown
  const fmt = source === 'bist' ? formatTl : formatUsd
  const targetVal = source === 'bist' ? sig.target : sig.target1
  const winRate = sig.historicalWinRate != null ? `%${sig.historicalWinRate}` : conf.label

  // İlk 2 geçen koşul — "neden bu sinyal" mini özeti
  const topReasons = (sig.conditions || []).filter(c => c.met && c.applicable).slice(0, 2).map(c => c.label)

  const metrics = [
    { label: 'Giriş', value: fmt(sig.entry),  tone: 'azure' },
    { label: 'Stop',  value: fmt(sig.stop),   tone: 'ember' },
    { label: 'Hedef', value: fmt(targetVal),  tone: 'jade' },
    { label: 'R/R',   value: sig.riskReward != null ? sig.riskReward.toFixed(2) : '—', tone: 'azure' },
  ]

  return (
    <Card
      interactive
      padding="md"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      aria-label={`${sig.symbol} sinyali — detay`}
      className="flex flex-col text-left"
    >
      {/* Üst — etiket + güven */}
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <Badge tone={tab.tone} icon={tab.icon}>{tab.label}</Badge>
        <Badge tone={conf.tone} title="Geçmiş başarı oranı">{conf.icon} {winRate}</Badge>
      </div>

      {/* Sembol + yön + grade + skor */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>{sig.symbol}</span>
        <Badge tone={isLong ? 'jade' : 'ember'} icon={isLong ? TrendingUp : TrendingDown}>
          {isLong ? 'AL' : 'SAT'}
        </Badge>
        <Badge tone={GRADE_TONE[sig.grade] || 'neutral'}>{sig.grade}</Badge>
        <span className="ml-auto num-tabular">
          <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{sig.totalScore}</span>
          <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}> / {sig.applicableMax}</span>
        </span>
      </div>

      {sig.name && sig.name !== sig.symbol && (
        <p className="mb-2 truncate text-[11px]" style={{ color: 'var(--text-faint)' }}>{sig.name}</p>
      )}

      {/* Entry / Stop / Target / R/R */}
      <div className="mt-1 grid grid-cols-4 gap-1.5">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="rounded-lg p-1.5 text-center"
            style={{ background: TONE[m.tone].bg, border: `1px solid ${TONE[m.tone].line}` }}
          >
            <p className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>{m.label}</p>
            <p className="num-tabular truncate text-[11px] font-bold" style={{ color: TONE[m.tone].fg }}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Neden — 2 koşul */}
      {topReasons.length > 0 && (
        <p className="mt-2 text-[10.5px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          <span className="font-semibold" style={{ color: 'var(--gold-400)' }}>Neden: </span>
          {topReasons.join(' · ')}
        </p>
      )}
    </Card>
  )
}

// ─── Sekme içeriği — kompakt sinyal listesi ──────────────────────────────
function TabContent({ tab, signals, totalCount }) {
  if (!tab) return null
  const source = tab.source

  if (signals.length === 0) {
    return (
      <Card padding="none">
        <EmptyState
          icon={tab.icon}
          compact
          title={`${tab.label} için şu an sinyal yok`}
          description="Sinyal kalitesi sıkı tutuluyor — her zaman her stratejide sinyal olmayabilir."
        />
      </Card>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <p style={{ color: 'var(--text-muted)' }}>
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{tab.label}</span> · Top {signals.length}
          {totalCount > signals.length && (
            <span style={{ color: 'var(--text-faint)' }}> ({totalCount} toplam)</span>
          )}
        </p>
        <Link
          to={`/gunluk-tespitler?tab=${source === 'bist' ? 'bugun' : 'kripto'}`}
          className="bk-link bk-link--gold flex items-center gap-0.5 font-semibold"
        >
          Tümünü gör <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      {signals.map((sig, idx) => (
        <CompactSignalRow key={sig.symbol + idx} sig={sig} rank={idx + 1} source={source} />
      ))}
    </div>
  )
}

// ─── Kompakt sinyal satırı — sekme listesi için ──────────────────────────
function CompactSignalRow({ sig, rank, source }) {
  const navigate = useNavigate()
  const isLong = sig.direction === 'long'
  const conf = CONFIDENCE[sig.confidence] || CONFIDENCE.unknown
  const fmt = source === 'bist' ? formatTl : formatUsd
  const targetVal = source === 'bist' ? sig.target : sig.target1
  const winRate = sig.historicalWinRate != null ? `%${sig.historicalWinRate}` : conf.label

  const handleClick = () => {
    navigate(`/gunluk-tespitler?tab=${source === 'bist' ? 'bugun' : 'kripto'}`)
  }

  return (
    <Card
      interactive
      padding="none"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick() } }}
      aria-label={`${sig.symbol} sinyali — detay`}
      className="p-3"
    >
      {/* Üst satır */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-5 flex-shrink-0 text-center text-xs font-bold" style={{ color: 'var(--text-faint)' }}>
          #{rank}
        </span>

        {sig.image && (
          <img
            src={sig.image}
            alt=""
            className="h-6 w-6 flex-shrink-0 rounded-full"
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
        )}

        <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{sig.symbol}</span>
        <Badge tone={isLong ? 'jade' : 'ember'} icon={isLong ? TrendingUp : TrendingDown}>
          {isLong ? 'AL' : 'SAT'}
        </Badge>
        <Badge tone={GRADE_TONE[sig.grade] || 'neutral'}>{sig.grade}</Badge>
        <Badge tone={conf.tone} title="Backtest geçmiş başarı">{conf.icon} {winRate}</Badge>

        <div className="ml-auto flex items-center gap-2">
          <span className="num-tabular text-[11px] font-bold" style={{ color: 'var(--text-primary)' }}>
            {sig.totalScore}<span style={{ color: 'var(--text-faint)' }}>/{sig.applicableMax}</span>
          </span>
          <ChevronRight className="h-4 w-4" style={{ color: 'var(--text-faint)' }} />
        </div>
      </div>

      {/* Alt satır — Giriş / Stop / Hedef / R/R */}
      <div className="ml-7 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span style={{ color: 'var(--text-muted)' }}>
          <Target className="mr-0.5 inline h-3 w-3" /> Giriş:{' '}
          <span className="num-tabular" style={{ color: 'var(--text-primary)' }}>{fmt(sig.entry)}</span>
        </span>
        <span style={{ color: 'var(--ember)' }}>Stop: <span className="num-tabular">{fmt(sig.stop)}</span></span>
        <span style={{ color: 'var(--jade)' }}>Hedef: <span className="num-tabular">{fmt(targetVal)}</span></span>
        {sig.riskReward != null && (
          <span style={{ color: 'var(--azure)' }}>R/R: <span className="num-tabular">{sig.riskReward.toFixed(2)}</span></span>
        )}
      </div>
    </Card>
  )
}
