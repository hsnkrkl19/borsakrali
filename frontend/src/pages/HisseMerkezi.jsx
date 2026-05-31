import { useEffect, useState, useRef, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Search, TrendingUp, TrendingDown, Activity, BarChart3, Brain, Waves,
  CandlestickChart, Layers, Calculator, Hash, Building2,
  ExternalLink, RefreshCw, ChevronRight, AlertCircle, Sparkles, Crown,
  Database,
} from 'lucide-react'
import api from '../services/api'
import StockChart from '../components/charts/StockChart'
import { Button, Card, Badge, Skeleton } from '../components/ui'

// ─── TradingView dış link (sadece "Aç" butonu için) ───────────────────────
function tvSymbolFor(symbol, isCrypto) {
  if (isCrypto) return `BINANCE:${symbol}USDT`
  return `BIST:${symbol}`
}
function tvExternalLink(symbol, isCrypto) {
  return `https://tr.tradingview.com/chart/?symbol=${tvSymbolFor(symbol, isCrypto)}&interval=D`
}

// ─── Yardımcı: Sayı formatla ──────────────────────────────────────────────
function fmt(v, dec = 2) {
  if (v == null || isNaN(v)) return '—'
  return Number(v).toLocaleString('tr-TR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}
function fmtPct(v) {
  if (v == null || isNaN(v)) return '—'
  const n = Number(v)
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

// ─── Çıkarımlar: indikatör → AL/SAT/NÖTR ──────────────────────────────────
function rsiSignal(r) {
  if (r == null) return { label: '—', color: 'var(--text-muted)' }
  if (r >= 70) return { label: 'Aşırı Alım', color: 'var(--ember)' }
  if (r <= 30) return { label: 'Aşırı Satım', color: 'var(--jade)' }
  if (r >= 55) return { label: 'Pozitif', color: 'var(--jade)' }
  if (r <= 45) return { label: 'Negatif', color: 'var(--ember)' }
  return { label: 'Nötr', color: 'var(--gold-400)' }
}

// ─── Kart wrapper'ı ────────────────────────────────────────────────────────
function SectionCard({ icon: Icon, title, accent = 'var(--gold-400)', isNew, children, action, loading, empty, error }) {
  return (
    <Card padding="md" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
          style={{
            background: `color-mix(in srgb, ${accent} 13%, transparent)`,
            border: `1px solid color-mix(in srgb, ${accent} 32%, transparent)`,
            color: accent,
          }}
        >
          <Icon size={18} aria-hidden="true" />
        </span>
        <h3 className="flex-1 truncate text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h3>
        {isNew && <Badge tone="gold">Yeni</Badge>}
      </div>

      <div className="min-h-[80px] flex-1">
        {loading ? (
          <Skeleton count={3} />
        ) : error ? (
          <div className="flex items-start gap-1.5 text-[12.5px]" style={{ color: 'var(--text-faint)' }}>
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : empty ? (
          <p className="text-[12.5px]" style={{ color: 'var(--text-faint)' }}>Veri yok</p>
        ) : children}
      </div>

      {action && (
        <button
          onClick={action.onClick}
          className="self-start inline-flex items-center gap-1 text-[12px] font-semibold transition-opacity hover:opacity-80"
          style={{ color: `color-mix(in srgb, ${accent} 68%, var(--text-primary) 32%)` }}
        >
          {action.label} <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </Card>
  )
}

// ─── Kategori başlık çubuğu ──────────────────────────────────────────────
// Hisse Merkezi'ndeki 10 kart 3 mantıksal gruba bölündü; her grubun başına
// bu çubuk konuyor — sayfada nerede ne olduğu net anlaşılsın diye.
function CategoryHeader({ icon: Icon, title, sub }) {
  return (
    <div className="flex items-center gap-2.5 pt-1">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{
          background: 'rgba(16, 185, 129, 0.12)',
          border: '1px solid var(--border-gold)',
          color: 'var(--gold-400)',
        }}
      >
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="min-w-0">
        <h2 className="text-[14px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h2>
        {sub && (
          <p className="text-[11px] mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>
            {sub}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Mini KPI ────────────────────────────────────────────────────────────
function KPI({ label, value, sub, valueColor }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[10.5px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-faint)' }}>
        {label}
      </div>
      <div className="text-[14px] font-bold num-tabular" style={{ color: valueColor || 'var(--text-primary)' }}>
        {value}
      </div>
      {sub && <div className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  )
}

// ─── Ana sayfa: HisseMerkezi ──────────────────────────────────────────────
export default function HisseMerkezi() {
  const { symbol: paramSym } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isCrypto = (searchParams.get('type') || '').toLowerCase() === 'crypto'

  const symbol = (paramSym || searchParams.get('symbol') || '').toUpperCase().trim()

  const [quickInput, setQuickInput] = useState('')
  const [suggest, setSuggest] = useState([])

  const [overview, setOverview] = useState({ loading: true, data: null, error: null })
  const [tech, setTech] = useState({ loading: true, data: null, error: null })
  const [ai, setAi] = useState({ loading: true, data: null, error: null })
  const [ema34, setEma34] = useState({ loading: true, data: null, error: null })
  const [tema34, setTema34] = useState({ loading: true, data: null, error: null })
  const [snr, setSnr] = useState({ loading: true, data: null, error: null })
  const [smc, setSmc] = useState({ loading: true, data: null, error: null })
  const [combo, setCombo] = useState({ loading: true, data: null, error: null })
  const [fundamental, setFundamental] = useState({ loading: true, data: null, error: null })
  const [dcf, setDcf] = useState({ loading: true, data: null, error: null })
  const [xMent, setXMent] = useState({ loading: true, data: null, error: null })

  // ── Sembol değiştiğinde tüm verileri paralel çek ──
  useEffect(() => {
    if (!symbol) return
    const typeParam = isCrypto ? '?type=crypto' : ''

    const wrap = (setter, p) => {
      setter({ loading: true, data: null, error: null })
      p.then((r) => setter({ loading: false, data: r.data, error: null }))
       .catch((e) => setter({
         loading: false,
         data: null,
         error: e?.response?.data?.error || e?.message || 'Veri alınamadı',
       }))
    }

    wrap(setOverview, api.get(`/market/stock/${symbol}${typeParam}`))
    wrap(setTech, api.get(`/analysis/technical/${symbol}${typeParam}`))
    wrap(setAi, api.get(`/analysis/ai-score/${symbol}${typeParam}`))
    wrap(setEma34, api.get(`/ema34/track/${symbol}${typeParam}`))
    wrap(setTema34, api.get(`/tema34/track/${symbol}${typeParam}`))
    wrap(setSnr, api.get(`/snr/${symbol}${typeParam}`))
    wrap(setSmc, api.get(`/smc/${symbol}${typeParam}`))
    wrap(setCombo, api.get(`/combo-strategies/analyze/${symbol}`))
    if (!isCrypto) {
      wrap(setFundamental, api.get(`/analysis/fundamental/${symbol}`))
      wrap(setDcf, api.get(`/dcf/${symbol}`))
    } else {
      setFundamental({ loading: false, data: null, error: 'Kripto için temel analiz yok' })
      setDcf({ loading: false, data: null, error: 'Kripto için DCF yok' })
    }
    wrap(setXMent, api.get(`/x-mentions/${symbol}${typeParam}`))
  }, [symbol, isCrypto])

  // ── Hızlı arama: backend autocomplete ──
  useEffect(() => {
    if (!quickInput || quickInput.length < 1) { setSuggest([]); return }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const r = await api.get(`/market/stocks/search?q=${encodeURIComponent(quickInput)}`, { signal: ctrl.signal })
        setSuggest((r.data?.stocks || []).slice(0, 7))
      } catch { /* yok say */ }
    }, 150)
    return () => { clearTimeout(t); ctrl.abort?.() }
  }, [quickInput])

  // ── Eğer sembol yoksa, arama ekranı göster ──
  if (!symbol) {
    return (
      <div className="max-w-2xl mx-auto pt-12 pb-20">
        <div className="text-center mb-6">
          <Crown className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--gold-400)' }} />
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Hisse Merkezi</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Bir hissenin tüm taramalarını, analizlerini ve X yorumlarını tek çatı altında toplar.
          </p>
        </div>
        <SymbolFinder onPick={(s) => navigate(`/hisse/${s}`)} />
      </div>
    )
  }

  const price = overview.data?.price
  const changePct = overview.data?.changePercent
  const name = overview.data?.name || tech.data?.name || symbol
  const sector = overview.data?.sector || tech.data?.sector

  // ── X Yorum sentiment dağılımı ──
  const xSent = xMent.data?.success && xMent.data?.summary
    ? xMent.data.summary
    : null

  return (
    <div className="space-y-6 pb-16">
      {/* ─── Üst Başlık ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>
              {symbol}
            </h1>
            {name && name !== symbol && (
              <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>{name}</span>
            )}
            {sector && <Badge tone="gold">{sector}</Badge>}
          </div>
          <div className="flex items-baseline gap-3 mt-2">
            {overview.loading ? (
              <div className="h-7 w-32 rounded animate-pulse" style={{ background: 'var(--bg-elevated)' }} />
            ) : (
              <>
                <span className="text-2xl font-bold num-tabular" style={{ color: 'var(--text-primary)' }}>
                  {fmt(price)} {isCrypto ? '$' : '₺'}
                </span>
                {changePct != null && (
                  <span className="flex items-center gap-1 text-[14px] font-bold"
                    style={{ color: changePct >= 0 ? 'var(--jade)' : 'var(--ember)' }}>
                    {changePct >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    {fmtPct(changePct)}
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isCrypto && (
            <Button
              variant="ghost"
              size="sm"
              icon={Database}
              onClick={() => navigate(`/is-yatirim-veri?symbol=${symbol}&tab=stock`)}
            >
              İş Yatırım
            </Button>
          )}
          <Button
            as="a"
            href={tvExternalLink(symbol, isCrypto)}
            target="_blank"
            rel="noopener noreferrer"
            variant="ghost"
            size="sm"
            icon={BarChart3}
            iconRight={ExternalLink}
          >
            TradingView
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={RefreshCw}
            onClick={() => navigate(`/hisse/${symbol}`, { replace: false })}
          >
            Yenile
          </Button>
        </div>
      </div>

      {/* ─── Hızlı arama (header altında, başka hisseye geçmek için) ──── */}
      <SymbolFinder
        compact
        placeholder="Başka bir hisse ara (ör: GARAN, ASELS, BTC)…"
        onPick={(s, t) => navigate(`/hisse/${s}${t === 'crypto' ? '?type=crypto' : ''}`)}
      />

      {/* ─── Grafik (kendi lightweight-charts implementasyonumuz) ───────── */}
      <StockChart symbol={symbol} assetType={isCrypto ? 'crypto' : 'stock'} height={620} />

      {/* ─── Kategori 1: Sinyaller & Modeller ──────────────────── */}
      <CategoryHeader
        icon={Sparkles}
        title="Sinyaller & Modeller"
        sub="Sistem önerileri: AI puanı, indikatörler, EMA/TEMA, SNR, SMC ve combo stratejiler."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">

        {/* 1) AI Skor / Tavsiye */}
        <SectionCard
          icon={Brain}
          title="AI Skor & Tavsiye"
          accent="var(--gold-400)"
          loading={ai.loading}
          error={ai.error}
          empty={!ai.loading && !ai.error && !ai.data}
          action={{
            label: 'Detaylı Pro Analiz',
            onClick: () => navigate(`/pro-analiz?symbol=${symbol}${isCrypto ? '&type=crypto' : ''}`),
          }}
        >
          {ai.data && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-3">
                <div className="text-4xl font-black num-tabular" style={{
                  color: ai.data.overallScore >= 65 ? 'var(--jade)'
                       : ai.data.overallScore >= 45 ? 'var(--gold-400)' : 'var(--ember)'
                }}>
                  {ai.data.overallScore}
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>/ 100</span>
                  <span className="text-[12px] font-bold uppercase tracking-wider" style={{
                    color: ai.data.recommendation === 'AL' ? 'var(--jade)'
                         : ai.data.recommendation === 'SAT' ? 'var(--ember)' : 'var(--gold-400)'
                  }}>
                    {ai.data.recommendation}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <KPI label="Teknik" value={ai.data.technicalScore} />
                <KPI label="Temel" value={ai.data.fundamentalScore} />
                <KPI label="Risk" value={ai.data.riskScore} />
              </div>
            </div>
          )}
        </SectionCard>

        {/* 2) Teknik Göstergeler */}
        <SectionCard
          icon={Activity}
          title="Teknik Göstergeler"
          accent="#56a8f5"
          loading={tech.loading}
          error={tech.error}
          empty={!tech.loading && !tech.error && !tech.data}
          action={{
            label: 'Tüm indikatörler',
            onClick: () => navigate(`/teknik-analiz-ai?symbol=${symbol}${isCrypto ? '&type=crypto' : ''}`),
          }}
        >
          {tech.data && (
            <div className="grid grid-cols-2 gap-2 text-[12px]">
              {(() => {
                const r = tech.data.indicators?.rsi
                const s = rsiSignal(r)
                return <KPI label="RSI(14)" value={fmt(r, 1)} sub={s.label} valueColor={s.color} />
              })()}
              <KPI
                label="MACD"
                value={fmt(tech.data.indicators?.macd, 3)}
                sub={tech.data.indicators?.macd > tech.data.indicators?.macdSignal ? 'Alış' : 'Satış'}
                valueColor={tech.data.indicators?.macd > tech.data.indicators?.macdSignal ? 'var(--jade)' : 'var(--ember)'}
              />
              <KPI
                label="Trend"
                value={tech.data.trend === 'Yukselis' ? 'Yükseliş ↑' : 'Düşüş ↓'}
                valueColor={tech.data.trend === 'Yukselis' ? 'var(--jade)' : 'var(--ember)'}
              />
              <KPI
                label="EMA50"
                value={fmt(tech.data.indicators?.ema50)}
                sub={tech.data.currentPrice > tech.data.indicators?.ema50 ? 'Üzerinde' : 'Altında'}
              />
            </div>
          )}
        </SectionCard>

        {/* 3) EMA34 Wave */}
        <SectionCard
          icon={Waves}
          title="EMA34 Wave Rider"
          accent="#22c55e"
          loading={ema34.loading}
          error={ema34.error}
          empty={!ema34.loading && !ema34.error && !ema34.data}
          action={{
            label: 'Tarayıcıyı aç',
            onClick: () => navigate(`/tarayicilar?tab=ema34&symbol=${symbol}${isCrypto ? '&type=crypto' : ''}`),
          }}
        >
          {ema34.data && !ema34.data.error && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge tone={ema34.data.aboveEma34 ? 'jade' : 'ember'}>
                  {ema34.data.activeSignal === 'wave_long' ? '🌊 Wave AL' :
                   ema34.data.activeSignal === 'wave_short' ? '🌊 Wave SAT' :
                   ema34.data.activeSignal === 'cross_above' ? '↑ Yön yukarı' :
                   ema34.data.activeSignal === 'cross_below' ? '↓ Yön aşağı' :
                   ema34.data.activeSignal === 'trending_up' ? '⇈ Yükselişte' :
                   ema34.data.activeSignal === 'trending_down' ? '⇊ Düşüşte' :
                   ema34.data.aboveEma34 ? '✓ Üzerinde' : '✗ Altında'}
                </Badge>
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Skor {ema34.data.score}/100
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <KPI label="EMA34" value={fmt(ema34.data.ema34)} />
                <KPI label="Uzaklık" value={fmtPct(ema34.data.distancePct)}
                  valueColor={ema34.data.aboveEma34 ? 'var(--jade)' : 'var(--ember)'} />
                <KPI label="Bar"
                  value={ema34.data.consecutiveDaysAbove > 0
                    ? `+${ema34.data.consecutiveDaysAbove}`
                    : `-${ema34.data.consecutiveDaysBelow}`} />
              </div>
            </div>
          )}
        </SectionCard>

        {/* 4) TEMA34 */}
        <SectionCard
          icon={TrendingUp}
          title="TEMA34 Takip"
          accent="#10b981"
          loading={tema34.loading}
          error={tema34.error}
          empty={!tema34.loading && !tema34.error && !tema34.data}
          action={{
            label: 'Tarayıcıyı aç',
            onClick: () => navigate(`/tarayicilar?tab=tema34&symbol=${symbol}${isCrypto ? '&type=crypto' : ''}`),
          }}
        >
          {tema34.data && !tema34.data.error && (() => {
            const above = tema34.data.aboveTema34 ?? tema34.data.aboveEma34
            const t34 = tema34.data.tema34 ?? tema34.data.ema34
            const dist = tema34.data.lastClose && t34
              ? ((tema34.data.lastClose - t34) / t34) * 100 : null
            return (
              <div className="space-y-2">
                <Badge tone={above ? 'jade' : 'ember'}>
                  {tema34.data.activeSignal || (above ? '✓ Üzerinde' : '✗ Altında')}
                </Badge>
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <KPI label="TEMA34" value={fmt(t34)} />
                  <KPI label="Uzaklık" value={fmtPct(dist)}
                    valueColor={above ? 'var(--jade)' : 'var(--ember)'} />
                  <KPI label="Üst üste"
                    value={tema34.data.consecutiveDaysAbove > 0
                      ? `+${tema34.data.consecutiveDaysAbove} gün`
                      : '—'} />
                </div>
              </div>
            )
          })()}
        </SectionCard>

        {/* 5) Malaysian SNR */}
        <SectionCard
          icon={CandlestickChart}
          title="Malaysian SNR"
          accent="#a78bfa"
          loading={snr.loading}
          error={snr.error}
          empty={!snr.loading && !snr.error && !(snr.data?.signals?.length || snr.data?.zones?.length)}
          action={{
            label: 'Detaylı SNR analizi',
            onClick: () => navigate(`/tarayicilar?tab=snr&symbol=${symbol}${isCrypto ? '&type=crypto' : ''}`),
          }}
        >
          {snr.data && (() => {
            const topSig = snr.data.signals?.[0]
            const supports = (snr.data.zones || []).filter(z => z.type === 'support')
            const resists = (snr.data.zones || []).filter(z => z.type === 'resistance')
            return (
              <div className="space-y-2 text-[12px]">
                {topSig ? (
                  <div className="rounded-lg p-2 border" style={{
                    background: topSig.direction === 'long' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(225, 29, 72, 0.08)',
                    borderColor: topSig.direction === 'long' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(225, 29, 72, 0.3)',
                  }}>
                    <div className="font-bold text-[12.5px]" style={{
                      color: topSig.direction === 'long' ? 'var(--jade)' : 'var(--ember)'
                    }}>
                      {topSig.direction === 'long' ? '↑ LONG' : '↓ SHORT'} · {topSig.label || topSig.type} · {topSig.score}p
                    </div>
                    {topSig.entry != null && (
                      <div className="text-[10.5px] mt-1" style={{ color: 'var(--text-muted)' }}>
                        Giriş ≈ {fmt(topSig.entry)} · SL {fmt(topSig.stop)} · TP {fmt(topSig.target)}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-[12px]" style={{ color: 'var(--text-faint)' }}>Aktif sinyal yok</div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <KPI label="Destek bölge" value={supports.length} valueColor="var(--jade)" />
                  <KPI label="Direnç bölge" value={resists.length} valueColor="var(--ember)" />
                </div>
              </div>
            )
          })()}
        </SectionCard>

        {/* 6) SMC (Smart Money) */}
        <SectionCard
          icon={Layers}
          title="SMC (Smart Money)"
          accent="#f59e0b"
          isNew
          loading={smc.loading}
          error={smc.error}
          empty={!smc.loading && !smc.error && !smc.data}
          action={{
            label: 'SMC tarayıcı',
            onClick: () => navigate(`/tarayicilar?tab=smc&symbol=${symbol}${isCrypto ? '&type=crypto' : ''}`),
          }}
        >
          {smc.data && (() => {
            const topSig = smc.data.signals?.[0] || smc.data.topSignal
            const obCount = (smc.data.orderBlocks || smc.data.zones || []).length || smc.data.summary?.orderBlocks
            const fvgCount = (smc.data.fvgs || smc.data.fvg || []).length || smc.data.summary?.fvgs
            return (
              <div className="space-y-2 text-[12px]">
                {topSig ? (
                  <div className="font-bold" style={{
                    color: topSig.direction === 'long' ? 'var(--jade)' : 'var(--ember)'
                  }}>
                    {topSig.label || topSig.type || 'Aktif sinyal'}
                    {topSig.score != null && ` · ${topSig.score}p`}
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-muted)' }}>Aktif sinyal yok — bölgeler hazır.</div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <KPI label="Order Block" value={obCount || 0} />
                  <KPI label="FVG (boşluk)" value={fvgCount || 0} />
                </div>
              </div>
            )
          })()}
        </SectionCard>

        {/* 7) Combo Strateji */}
        <SectionCard
          icon={Sparkles}
          title="Strateji Komboları"
          accent="#ec4899"
          loading={combo.loading}
          error={combo.error}
          empty={!combo.loading && !combo.error && !combo.data?.results?.length}
          action={{
            label: 'Tüm strateji komboları',
            onClick: () => navigate(`/tarayicilar?tab=kombolar&symbol=${symbol}`),
          }}
        >
          {combo.data && Array.isArray(combo.data.results) && (
            <div className="space-y-2 text-[12px]">
              <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                <strong style={{ color: 'var(--gold-400)' }}>{combo.data.results.filter(r => r.matched).length}</strong>
                {' '}/ {combo.data.results.length} strateji tetiklendi
              </div>
              <div className="flex flex-wrap gap-1">
                {combo.data.results.filter(r => r.matched).slice(0, 4).map((r, i) => (
                  <Badge key={i} tone={r.direction === 'long' || r.direction === 'bullish' ? 'jade' : 'ember'}>
                    {r.name || r.strategy || r.label}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </SectionCard>

      </div>

      {/* ─── Kategori 2: Şirket Değerleme ─────────────────────── */}
      <CategoryHeader
        icon={Building2}
        title="Şirket Değerleme"
        sub="Mali tablolar, oranlar ve indirgenmiş nakit akışı (DCF) değerlemesi."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">

        {/* 8) Temel Analiz */}
        <SectionCard
          icon={Building2}
          title="Temel Analiz"
          accent="#f97316"
          loading={fundamental.loading}
          error={fundamental.error}
          empty={!fundamental.loading && !fundamental.error && !fundamental.data}
          action={{
            label: 'Mali tablolar & KAP',
            onClick: () => navigate(`/sirket-analizi?symbol=${symbol}`),
          }}
        >
          {fundamental.data && (
            <div className="grid grid-cols-2 gap-2 text-[12px]">
              <KPI label="F/K (P/E)" value={fmt(fundamental.data.ratios?.priceToEarnings, 2)} />
              <KPI label="PD/DD (P/B)" value={fmt(fundamental.data.ratios?.priceToBook, 2)} />
              <KPI label="ROE" value={fundamental.data.ratios?.returnOnEquity != null ? fmtPct(fundamental.data.ratios.returnOnEquity * 100) : '—'} />
              <KPI label="Net Marj" value={fundamental.data.ratios?.netMargin != null ? fmtPct(fundamental.data.ratios.netMargin * 100) : '—'} />
            </div>
          )}
        </SectionCard>

        {/* 9) DCF Değerleme */}
        <SectionCard
          icon={Calculator}
          title="DCF Değerleme"
          accent="#22d3ee"
          loading={dcf.loading}
          error={dcf.error}
          empty={!dcf.loading && !dcf.error && !dcf.data?.success}
          action={{
            label: 'Detaylı DCF',
            onClick: () => navigate(`/dcf-degerleme?symbol=${symbol}`),
          }}
        >
          {dcf.data?.success && (() => {
            const fair = dcf.data.fairValue ?? dcf.data.intrinsicValue ?? dcf.data.valuePerShare
            const cur = dcf.data.currentPrice || price
            const upside = (fair && cur) ? ((fair - cur) / cur) * 100 : null
            return (
              <div className="space-y-2 text-[12px]">
                <div className="grid grid-cols-2 gap-2">
                  <KPI label="Gerçek Değer" value={fmt(fair)} />
                  <KPI label="Yükseliş Potansiyeli"
                    value={upside != null ? fmtPct(upside) : '—'}
                    valueColor={upside >= 0 ? 'var(--jade)' : 'var(--ember)'} />
                </div>
                {dcf.data.recommendation && (
                  <Badge tone="azure">{dcf.data.recommendation}</Badge>
                )}
              </div>
            )
          })()}
        </SectionCard>

      </div>

      {/* ─── Kategori 3: Topluluk & Haber Akışı ───────────────── */}
      <CategoryHeader
        icon={Hash}
        title="Topluluk & Haber"
        sub="X (Twitter) gündemi: sembolle ilgili son mention'lar ve sentiment dağılımı."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">

        {/* 10) X Yorumları */}
        <SectionCard
          icon={Hash}
          title="X Yorumları (Twitter)"
          accent="#0ea5e9"
          isNew
          loading={xMent.loading}
          error={xMent.error}
          empty={!xMent.loading && !xMent.error && !xMent.data?.success}
          action={{
            label: 'X gündemini aç',
            onClick: () => navigate(`/tarayicilar?tab=x-gundem&symbol=${symbol}${isCrypto ? '&type=crypto' : ''}`),
          }}
        >
          {xMent.data?.success && (
            <div className="space-y-2 text-[12px]">
              {xSent && (
                <div className="grid grid-cols-3 gap-2">
                  <KPI label="Pozitif" value={xSent.positive ?? 0} valueColor="var(--jade)" />
                  <KPI label="Nötr" value={xSent.neutral ?? 0} valueColor="var(--gold-400)" />
                  <KPI label="Negatif" value={xSent.negative ?? 0} valueColor="var(--ember)" />
                </div>
              )}
              <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                <strong style={{ color: 'var(--gold-400)' }}>{xMent.data.totalMentions ?? xMent.data.mentions?.length ?? 0}</strong> mention
                {xMent.data.lastSeen && (
                  <> · son {new Date(xMent.data.lastSeen).toLocaleString('tr-TR')}</>
                )}
              </div>
              {Array.isArray(xMent.data.mentions) && xMent.data.mentions.slice(0, 2).map((m, i) => (
                <div key={i} className="rounded-lg p-2 text-[11px] line-clamp-2"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                  {m.text || m.content || m.tweet || ''}
                </div>
              ))}
            </div>
          )}
        </SectionCard>

      </div>

      <p className="text-[11px] text-center" style={{ color: 'var(--text-faint)' }}>
        Tüm veriler eş zamanlı çekilir — bazı kartlar diğerlerinden geç gelebilir. Yatırım tavsiyesi değildir.
      </p>
    </div>
  )
}

// ─── Hisse arama bileşeni (sayfa içi + yalın) ─────────────────────────────
function SymbolFinder({ onPick, compact = false, placeholder = 'Hisse veya kripto ara — örn. THYAO, GARAN, BTC' }) {
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
          api.get(`/market/stocks/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal }),
          api.get(`/crypto/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal }),
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

  const goSymbol = (sym, type = 'stock') => {
    onPick?.(sym.toUpperCase(), type)
    setQ('')
    setFocused(false)
  }

  const handleEnter = (e) => {
    if (e.key === 'Enter' && q.trim()) {
      e.preventDefault()
      const first = results.stocks[0] || results.coins[0]
      if (first) {
        goSymbol(first.symbol || first.id, results.stocks[0] ? 'stock' : 'crypto')
      } else {
        goSymbol(q.trim().toUpperCase(), 'stock')
      }
    }
  }

  const showResults = focused && (results.stocks.length > 0 || results.coins.length > 0 || loading)

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--gold-400)' }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 180)}
          onKeyDown={handleEnter}
          placeholder={placeholder}
          className={`w-full ${compact ? 'h-10' : 'h-12'} pl-10 pr-4 rounded-xl text-[13.5px] focus:outline-none`}
          style={{
            background: 'rgba(var(--bg-input-rgb), 0.7)',
            border: '1px solid var(--border-main)',
            color: 'var(--text-primary)',
          }}
        />
      </div>

      {showResults && (
        <div className="absolute left-0 right-0 top-full mt-2 rounded-xl overflow-hidden z-30 max-h-[24rem] overflow-y-auto custom-scrollbar"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)', boxShadow: '0 12px 28px rgba(0,0,0,0.35)' }}
        >
          {loading && (
            <div className="px-3 py-2 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
              Aranıyor…
            </div>
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
                  onClick={() => goSymbol(s.symbol, 'stock')}
                  className="w-full text-left flex items-center justify-between px-3 py-2 transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <span className="flex flex-col">
                    <span className="font-bold text-[13px]" style={{ color: 'var(--text-primary)' }}>{s.symbol}</span>
                    <span className="text-[10.5px]" style={{ color: 'var(--text-faint)' }}>{s.name}</span>
                  </span>
                  {s.price != null && (
                    <span className="text-[11.5px] num-tabular flex items-center gap-1.5">
                      <span style={{ color: 'var(--text-muted)' }}>{fmt(s.price)} ₺</span>
                      {s.changePercent != null && (
                        <span style={{ color: s.changePercent >= 0 ? 'var(--jade)' : 'var(--ember)' }}>
                          {fmtPct(s.changePercent)}
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
                  onClick={() => goSymbol((c.symbol || c.id).toUpperCase(), 'crypto')}
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

      {!compact && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          <span className="text-[11px] mr-1 self-center" style={{ color: 'var(--text-faint)' }}>Popüler:</span>
          {['THYAO', 'GARAN', 'ASELS', 'KCHOL', 'EREGL', 'BIMAS', 'TUPRS', 'AKBNK'].map(s => (
            <Button key={s} variant="outline" size="sm" onClick={() => goSymbol(s, 'stock')}>
              {s}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
