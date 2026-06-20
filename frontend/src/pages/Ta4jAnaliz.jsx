import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LineChart, Search, TrendingUp, TrendingDown, Minus, AlertCircle, Layers } from 'lucide-react'
import { Button, Card, EmptyState, PageHeader, Badge } from '../components/ui'
import ScrollableTabBar from '../components/ScrollableTabBar'
import { getTa4jCatalog, getTa4jAnalysis } from '../services/ta4jService'

// Backend grup anahtarı → TR başlık + sıra.
const GROUPS = [
  { key: 'overlap', label: 'Hareketli Ortalamalar' },
  { key: 'momentum', label: 'Momentum / Osilatörler' },
  { key: 'trend', label: 'Trend / Yön' },
  { key: 'volatility', label: 'Volatilite' },
  { key: 'volume', label: 'Hacim' },
]

const RANGES = [
  { key: '6mo', label: '6 Ay' },
  { key: '1y', label: '1 Yıl' },
  { key: '2y', label: '2 Yıl' },
  { key: '5y', label: '5 Yıl' },
]

const QUICK = ['THYAO', 'ASELS', 'GARAN', 'SISE', 'KCHOL', 'EREGL', 'TUPRS', 'BIMAS']

// Tek sayıyı yerel biçimde göster (büyük/küçük ölçeğe göre ondalık).
function fmt(v) {
  if (v == null || Number.isNaN(v)) return '—'
  const abs = Math.abs(v)
  const digits = abs >= 1000 ? 1 : abs >= 1 ? 2 : 4
  return Number(v).toLocaleString('tr-TR', { maximumFractionDigits: digits })
}

const biasMeta = {
  bullish: { tone: 'jade', Icon: TrendingUp, label: 'AL', color: 'var(--gold-400)' },
  bearish: { tone: 'ember', Icon: TrendingDown, label: 'SAT', color: 'var(--ember)' },
  neutral: { tone: 'neutral', Icon: Minus, label: 'NÖTR', color: 'var(--text-secondary)' },
}

const overallMeta = {
  bullish: { tone: 'jade', label: 'YÜKSELİŞ EĞİLİMİ' },
  bearish: { tone: 'ember', label: 'DÜŞÜŞ EĞİLİMİ' },
  neutral: { tone: 'neutral', label: 'NÖTR' },
}

const tileStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-main)',
}

// Bir indikatör değeri: sayı ya da bileşik nesne (macd/bb/stochastic vb.).
function IndicatorTile({ label, value }) {
  const isObj = value != null && typeof value === 'object'
  return (
    <div className="rounded-lg p-3" style={tileStyle}>
      <div className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </div>
      {isObj ? (
        <div className="mt-1 space-y-0.5">
          {Object.entries(value).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-2 text-[12.5px]">
              <span style={{ color: 'var(--text-tertiary, var(--text-secondary))' }}>{k}</span>
              <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                {fmt(v)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-0.5 text-lg font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
          {fmt(value)}
        </div>
      )}
    </div>
  )
}

export default function Ta4jAnaliz() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [symbol, setSymbol] = useState((searchParams.get('symbol') || '').toUpperCase())
  const [range, setRange] = useState(searchParams.get('range') || '1y')
  const [catalog, setCatalog] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Katalog (indikatör etiketleri/grupları) — bir kez yükle.
  useEffect(() => {
    getTa4jCatalog()
      .then((res) => setCatalog(res?.indicators || []))
      .catch(() => setCatalog([]))
  }, [])

  const runAnalyze = useCallback(
    async (rawSymbol, rng) => {
      const sym = String(rawSymbol || '').trim().toUpperCase().replace('.IS', '')
      if (!sym) return
      const useRange = rng || range
      setLoading(true)
      setError(null)
      setData(null)
      setSearchParams({ symbol: sym, range: useRange }, { replace: true })
      try {
        const res = await getTa4jAnalysis(sym, { range: useRange })
        if (!res?.success) throw new Error(res?.error || 'Analiz alınamadı.')
        setData(res)
      } catch (e) {
        const status = e?.response?.status
        const msg = e?.response?.data?.error
        setError(status === 404 ? `"${sym}" için yeterli veri bulunamadı.` : msg || e.message || 'Bir hata oluştu.')
      } finally {
        setLoading(false)
      }
    },
    [range, setSearchParams],
  )

  // URL'de sembol varsa ilk açılışta otomatik analiz et.
  useEffect(() => {
    const initial = (searchParams.get('symbol') || '').trim()
    if (initial) runAnalyze(initial, searchParams.get('range') || '1y')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const catalogByGroup = (groupKey) => catalog.filter((c) => c.group === groupKey)

  return (
    <div className="space-y-5">
      <PageHeader
        icon={LineChart}
        eyebrow="ta4j · trading-signals"
        title="Ta4j Teknik Analiz"
        description="28 ta4j tarzı indikatör (SMA/EMA/RSI/MACD/ADX/Bollinger/Stochastic/ATR/OBV…) tek bakışta — sembol gir, anlık değerleri ve yorumu gör."
      />

      {/* Arama + aralık */}
      <Card padding="md">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                size={18}
                style={{ color: 'var(--text-secondary)' }}
              />
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && runAnalyze(symbol)}
                placeholder="Hisse kodu (örn. THYAO)"
                className="w-full rounded-lg py-2.5 pl-10 pr-3 text-sm font-semibold uppercase outline-none transition-colors"
                style={{
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border-main)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
            <Button variant="gold" icon={Search} loading={loading} onClick={() => runAnalyze(symbol)}>
              Analiz Et
            </Button>
          </div>

          <ScrollableTabBar activeKey={range} className="gap-2">
            {RANGES.map((r) => (
              <button
                key={r.key}
                data-tab-key={r.key}
                onClick={() => {
                  setRange(r.key)
                  if (data || symbol) runAnalyze(symbol, r.key)
                }}
                className="whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
                style={
                  range === r.key
                    ? { background: 'var(--gold-400)', color: '#fff', border: '1px solid var(--gold-400)' }
                    : { background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-main)' }
                }
              >
                {r.label}
              </button>
            ))}
          </ScrollableTabBar>

          <div className="flex flex-wrap gap-1.5">
            {QUICK.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSymbol(s)
                  runAnalyze(s)
                }}
                className="rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors"
                style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-main)' }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Hata */}
      {error && (
        <div
          className="flex items-center gap-2 rounded-lg p-3 text-sm"
          style={{ background: 'rgba(225,29,72,0.10)', border: '1px solid rgba(225,29,72,0.30)', color: 'var(--ember)' }}
        >
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {/* Yükleniyor */}
      {loading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg" style={tileStyle} />
          ))}
        </div>
      )}

      {/* Boş durum */}
      {!data && !loading && !error && (
        <Card padding="none">
          <EmptyState
            icon={LineChart}
            title="Teknik Analiz Başlatın"
            description="Bir hisse kodu girin (veya yukarıdaki hızlı seçimlerden birine dokunun) — ta4j indikatörlerinin anlık değerlerini ve özet yorumu hesaplayalım."
          />
        </Card>
      )}

      {/* Sonuçlar */}
      {data && !loading && (
        <div className="space-y-5">
          {/* Özet */}
          <Card tone={overallMeta[data.overall]?.tone || 'neutral'} accent padding="md">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-baseline gap-3">
                <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  {data.symbol}
                </h2>
                <span className="text-xl font-semibold tabular-nums" style={{ color: 'var(--gold-400)' }}>
                  {fmt(data.lastClose)} ₺
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={overallMeta[data.overall]?.tone || 'neutral'} dot>
                  {overallMeta[data.overall]?.label || data.overall}
                </Badge>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {data.candles} mum · {data.range}
                </span>
              </div>
            </div>

            {Array.isArray(data.signals) && data.signals.length > 0 && (
              <div className="mt-4 flex flex-col gap-2">
                {data.signals.map((s, i) => {
                  const m = biasMeta[s.bias] || biasMeta.neutral
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2"
                      style={tileStyle}
                    >
                      <m.Icon size={16} style={{ color: m.color }} />
                      <span className="text-[11px] font-bold uppercase" style={{ color: m.color, minWidth: 34 }}>
                        {m.label}
                      </span>
                      <span className="text-[13px]" style={{ color: 'var(--text-primary)' }}>
                        {s.note}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          {/* Gruplu indikatör anlık görüntüsü */}
          {GROUPS.map((g) => {
            const defs = catalogByGroup(g.key)
            const items = defs
              .map((d) => ({ key: d.key, label: d.label, value: data.snapshot?.[d.key] }))
              .filter((it) => it.value !== undefined)
            if (items.length === 0) return null
            return (
              <Card key={g.key} padding="md">
                <div className="mb-3 flex items-center gap-2">
                  <Layers size={16} style={{ color: 'var(--gold-400)' }} />
                  <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--text-primary)' }}>
                    {g.label}
                  </h3>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {items.map((it) => (
                    <IndicatorTile key={it.key} label={it.label} value={it.value} />
                  ))}
                </div>
              </Card>
            )
          })}

          <p className="text-center text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            ta4j tarzı (trading-signals) hesaplamalar · yatırım tavsiyesi değildir
          </p>
        </div>
      )}
    </div>
  )
}
