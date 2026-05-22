import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Hash, TrendingUp, TrendingDown, MessageCircle, RefreshCw, AlertCircle, ExternalLink, X as XIcon, Smile, Frown, Meh, Flame, Bitcoin, BarChart3 } from 'lucide-react'
import api from '../services/api'
import ScrollableTabBar from '../components/ScrollableTabBar'
import { Button } from '../components/ui'

const ASSET_TYPES = [
  { id: 'stock',  label: 'BIST Hisseleri', icon: BarChart3, color: 'amber' },
  { id: 'crypto', label: 'Kripto Paralar', icon: Bitcoin,   color: 'orange' },
]

const SCOPES_BY_TYPE = {
  stock: [
    { id: 'bist30',  label: 'BIST 30' },
    { id: 'bist100', label: 'BIST 100' },
    { id: 'all',     label: 'Tümü' },
  ],
  crypto: [
    { id: 'crypto_top10', label: 'Top 10' },
    { id: 'crypto',       label: 'Top 30' },
    { id: 'crypto_all',   label: 'Tümü' },
  ],
}

// Warmer artık tüm evreni sürekli canlı tutuyor — default seçim de tam liste
const DEFAULT_SCOPE = { stock: 'all', crypto: 'crypto_all' }

const TABS = [
  { id: 'top',      label: 'En Çok Konuşulanlar', icon: Flame },
  { id: 'trending', label: 'Yükselişte',          icon: TrendingUp },
  { id: 'bullish',  label: 'Pozitif Sentiment',   icon: Smile },
  { id: 'bearish',  label: 'Negatif Sentiment',   icon: Frown },
  { id: 'all',      label: 'Tümü',                icon: Hash },
]

function StatCard({ title, value, sub, color = 'amber' }) {
  const colorMap = {
    amber:  'from-amber-500/20 to-amber-600/5 border-amber-500/30 text-amber-300',
    green:  'from-green-500/20 to-green-600/5 border-green-500/30 text-green-300',
    red:    'from-red-500/20 to-red-600/5 border-red-500/30 text-red-300',
    blue:   'from-blue-500/20 to-blue-600/5 border-blue-500/30 text-blue-300',
  }
  return (
    <div className={`rounded-xl border bg-gradient-to-br p-3 ${colorMap[color]}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-80">{title}</div>
      <div className="text-xl font-bold mt-1 text-white">{value}</div>
      {sub && <div className="text-[11px] mt-0.5 opacity-80">{sub}</div>}
    </div>
  )
}

function SentimentBar({ sentiment }) {
  const { positive = 0, negative = 0, neutral = 0 } = sentiment || {}
  return (
    <div className="flex h-2 w-full rounded-full overflow-hidden bg-dark-800">
      <div className="bg-green-500" style={{ width: `${positive}%` }} title={`Pozitif ${positive}%`} />
      <div className="bg-gray-500" style={{ width: `${neutral}%` }} title={`Nötr ${neutral}%`} />
      <div className="bg-red-500" style={{ width: `${negative}%` }} title={`Negatif ${negative}%`} />
    </div>
  )
}

function LeaderCard({ title, icon: Icon, color, items, metric, suffix, onSelect }) {
  const palette = {
    amber: { border: 'border-amber-500/30', bg: 'from-amber-500/10', text: 'text-amber-300', dot: 'bg-amber-400', accent: 'text-amber-200' },
    green: { border: 'border-green-500/30', bg: 'from-green-500/10', text: 'text-green-300', dot: 'bg-green-400', accent: 'text-green-200' },
    red:   { border: 'border-red-500/30',   bg: 'from-red-500/10',   text: 'text-red-300',   dot: 'bg-red-400',   accent: 'text-red-200'   },
  }[color] || { border: 'border-dark-700', bg: 'from-dark-800/40', text: 'text-gray-300', dot: 'bg-gray-400', accent: 'text-gray-200' }

  const getValue = (it) => {
    if (!metric) return 0
    return metric.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), it) ?? 0
  }

  return (
    <div className={`rounded-xl border ${palette.border} bg-gradient-to-br ${palette.bg} to-transparent p-3`}>
      <div className={`flex items-center gap-1.5 mb-2 text-[11px] font-bold uppercase tracking-wider ${palette.text}`}>
        <Icon className="w-3.5 h-3.5" />
        {title}
      </div>
      {items.length === 0 ? (
        <div className="text-[11px] text-gray-500 py-3 text-center">Veri yok</div>
      ) : (
        <div className="space-y-1">
          {items.map((it, i) => (
            <button
              key={it.symbol}
              onClick={() => onSelect(it.symbol)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors text-left"
            >
              <span className={`text-[10px] font-mono w-4 text-center ${palette.accent}`}>{i + 1}</span>
              <span className={`w-1 h-1 rounded-full ${palette.dot}`} />
              <span className="text-sm font-semibold text-white flex-1 truncate">{it.symbol}</span>
              <span className={`text-xs font-bold ${palette.accent} tabular-nums`}>
                {getValue(it)}{suffix}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function MentionRow({ stock, rank, maxMentions, onClick }) {
  const pct = (stock.mentions24h / maxMentions) * 100
  const changeColor = stock.change24h >= 0 ? 'text-green-400' : 'text-red-400'
  return (
    <div
      onClick={() => onClick(stock.symbol)}
      className="grid grid-cols-12 gap-2 items-center px-3 py-2.5 rounded-xl bg-dark-900/40 border border-dark-700/40 hover:bg-dark-800/60 hover:border-amber-500/30 cursor-pointer transition-all"
    >
      <div className="col-span-1 text-center text-xs text-gray-500 font-mono">#{rank}</div>
      <div className="col-span-3 sm:col-span-2">
        <div className="text-sm font-bold text-white">{stock.symbol}</div>
        <div className="text-[10px] text-gray-500 truncate">{stock.market}</div>
      </div>
      <div className="col-span-4 sm:col-span-3">
        <div className="text-xs text-gray-400 truncate">{stock.name}</div>
        <div className="text-[10px] text-gray-600 truncate">{stock.sector}</div>
      </div>
      <div className="col-span-4 sm:col-span-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-dark-800 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-amber-500 to-amber-300" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-xs font-semibold text-amber-300 min-w-[40px] text-right">{stock.mentions24h}</div>
        </div>
        <div className="hidden sm:block mt-1.5">
          <SentimentBar sentiment={stock.sentiment} />
        </div>
      </div>
      <div className={`hidden sm:block sm:col-span-2 text-xs font-semibold text-right ${changeColor}`}>
        {stock.change24h >= 0 ? '+' : ''}{stock.change24h}%
      </div>
      <div className="col-span-4 sm:col-span-1 text-right">
        <span className="text-[10px] px-2 py-1 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/20 font-semibold">
          {stock.trendScore}
        </span>
      </div>
    </div>
  )
}

function DetailModal({ symbol, assetType, onClose }) {
  const [data, setData] = useState(null)
  const [cryptoQuote, setCryptoQuote] = useState(null) // canlı kripto fiyat (varsa)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    setCryptoQuote(null)

    const params = assetType ? { type: assetType } : {}
    const detailPromise = api.get(`/x-mentions/${symbol}`, { params }).then(r => r.data)

    // Kripto ise CoinGecko'dan canlı fiyat da çek (paralel)
    const quotePromise = assetType === 'crypto'
      ? api.get(`/crypto/quote/${symbol}`).then(r => r.data).catch(() => null)
      : Promise.resolve(null)

    Promise.all([detailPromise, quotePromise])
      .then(([detail, quote]) => {
        if (!active) return
        setData(detail)
        if (quote?.success) setCryptoQuote(quote)
      })
      .catch(e => { if (active) setError(e.response?.data?.error || 'Detay alınamadı') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [symbol, assetType])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6" onClick={onClose}>
      <div
        className="bg-dark-950 border border-amber-500/30 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto custom-scrollbar"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-dark-950/95 backdrop-blur border-b border-dark-700 px-4 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <Hash className="w-4 h-4 text-amber-400" />
            <h3 className="text-lg font-bold text-white">{symbol}</h3>
          </div>
          <div className="flex items-center gap-2">
            {data?.xSearchUrl && (
              <a href={data.xSearchUrl} target="_blank" rel="noopener noreferrer"
                 className="text-xs text-gray-400 hover:text-amber-400 flex items-center gap-1">
                X'te aç <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <XIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4">
          {loading && (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Yükleniyor...
            </div>
          )}
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3 text-red-400">
              <AlertCircle className="w-5 h-5" />
              <span className="text-sm">{error}</span>
            </div>
          )}
          {data && !loading && (
            <div className="space-y-4">
              <div className="text-sm text-gray-400">{data.name} <span className="text-gray-600">— {data.sector}</span></div>

              {/* Canlı kripto fiyatı (CoinGecko) — sadece crypto detail için */}
              {cryptoQuote && (
                <div className="rounded-xl border border-orange-500/30 bg-gradient-to-br from-orange-500/10 to-transparent p-3">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      {cryptoQuote.image && (
                        <img src={cryptoQuote.image} alt={cryptoQuote.name} className="w-10 h-10 rounded-full" />
                      )}
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-orange-300">CoinGecko · Canlı</div>
                        <div className="text-2xl font-bold text-white">
                          ${cryptoQuote.price?.usd?.toLocaleString('en-US', { maximumFractionDigits: cryptoQuote.price?.usd < 1 ? 6 : 2 })}
                        </div>
                      </div>
                    </div>
                    <div className="text-right text-xs space-y-0.5">
                      <div className={cryptoQuote.change?.pct24h >= 0 ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                        {cryptoQuote.change?.pct24h >= 0 ? '▲' : '▼'} {Math.abs(cryptoQuote.change?.pct24h || 0).toFixed(2)}% (24sa)
                      </div>
                      {cryptoQuote.change?.pct7d != null && (
                        <div className={cryptoQuote.change.pct7d >= 0 ? 'text-green-300/70' : 'text-red-300/70'}>
                          {cryptoQuote.change.pct7d >= 0 ? '+' : ''}{cryptoQuote.change.pct7d.toFixed(2)}% (7g)
                        </div>
                      )}
                      <div className="text-gray-500">Sıra #{cryptoQuote.rank}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-orange-500/15 text-[11px]">
                    <div>
                      <div className="text-gray-500">Market Cap</div>
                      <div className="text-white font-semibold">${(cryptoQuote.marketCap / 1e9).toFixed(2)} mlr</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Hacim 24sa</div>
                      <div className="text-white font-semibold">${(cryptoQuote.volume24h / 1e9).toFixed(2)} mlr</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Dolaşımda</div>
                      <div className="text-white font-semibold">{(cryptoQuote.supply?.circulating / 1e6)?.toFixed(1)} mn</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <StatCard title="24 Saat" value={data.mentions24h} color="amber" />
                <StatCard title="7 Gün" value={data.mentions7d} color="blue" />
                <StatCard title="Değişim" value={`${data.change24h >= 0 ? '+' : ''}${data.change24h}%`} color={data.change24h >= 0 ? 'green' : 'red'} />
                <StatCard title="Trend Skoru" value={data.trendScore} color="amber" />
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-2">Sentiment Dağılımı</div>
                <SentimentBar sentiment={data.sentiment} />
                <div className="flex justify-between text-[11px] mt-1">
                  <span className="text-green-400 flex items-center gap-1"><Smile className="w-3 h-3" /> {data.sentiment.positive}%</span>
                  <span className="text-gray-400 flex items-center gap-1"><Meh className="w-3 h-3" /> {data.sentiment.neutral}%</span>
                  <span className="text-red-400 flex items-center gap-1"><Frown className="w-3 h-3" /> {data.sentiment.negative}%</span>
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-2">Son 7 Gün</div>
                <div className="flex items-end gap-1 h-24 bg-dark-900/40 rounded-xl p-2 border border-dark-700/40">
                  {data.series7d.map((d) => {
                    const max = Math.max(...data.series7d.map(x => x.mentions))
                    const h = max > 0 ? (d.mentions / max) * 100 : 0
                    return (
                      <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group">
                        <div className="text-[9px] text-amber-300 opacity-0 group-hover:opacity-100 transition-opacity">{d.mentions}</div>
                        <div className="w-full bg-gradient-to-t from-amber-600 to-amber-400 rounded-sm" style={{ height: `${h}%` }} />
                        <div className="text-[9px] text-gray-500">{d.date.slice(5)}</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-2">Popüler Hashtag'ler</div>
                <div className="flex flex-wrap gap-1.5">
                  {data.topHashtags.map(h => (
                    <span key={h} className="text-xs px-2 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20">
                      {h}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-2">Son Tweetler (örnek)</div>
                <div className="space-y-2">
                  {data.recentTweets.slice(0, 6).map(tw => (
                    <div key={tw.id} className="bg-dark-900/40 border border-dark-700/40 rounded-xl p-3">
                      <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1">
                        <span className="font-semibold text-gray-300">{tw.author}</span>
                        <span>{tw.createdMinutesAgo < 60 ? `${tw.createdMinutesAgo}dk önce` : `${Math.floor(tw.createdMinutesAgo / 60)}sa önce`}</span>
                      </div>
                      <div className="text-sm text-gray-200">{tw.text}</div>
                      <div className="flex gap-3 mt-1.5 text-[10px] text-gray-500">
                        <span>♥ {tw.metrics.likes}</span>
                        <span>↻ {tw.metrics.retweets}</span>
                        <span>💬 {tw.metrics.replies}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function XGundem() {
  const [searchParams, setSearchParams] = useSearchParams()
  // URL'den initial state — haberden focus=BTC&assetType=crypto ile gelirse hemen modal aç
  const initialAssetType = searchParams.get('assetType') === 'crypto' ? 'crypto' : 'stock'
  const initialFocus = searchParams.get('focus')

  const [assetType, setAssetType] = useState(initialAssetType)
  const [scope, setScope] = useState(DEFAULT_SCOPE[initialAssetType])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('top')
  const [selectedSymbol, setSelectedSymbol] = useState(initialFocus || null)

  const currentScopes = SCOPES_BY_TYPE[assetType] || SCOPES_BY_TYPE.stock

  const load = async (sc = scope) => {
    setLoading(true)
    setError(null)
    try {
      const r = await api.get('/x-mentions/scanner', { params: { scope: sc } })
      setData(r.data)
    } catch (e) {
      setError(e.response?.data?.error || 'Tarama yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  // Asset type değişince varsayılan scope'a düş ve tarama yap
  const switchAssetType = (type) => {
    setAssetType(type)
    setScope(DEFAULT_SCOPE[type])
    setSelectedSymbol(null)
    setActiveTab('top')
  }

  useEffect(() => { load() }, [scope]) // eslint-disable-line react-hooks/exhaustive-deps

  const list = (() => {
    if (!data) return []
    if (activeTab === 'top')      return data.top20
    if (activeTab === 'trending') return data.trending
    if (activeTab === 'bullish')  return data.bullish
    if (activeTab === 'bearish')  return data.bearish
    return [...data.all].sort((a, b) => b.mentions24h - a.mentions24h).slice(0, 50)
  })()

  const maxMentions = list.length > 0 ? Math.max(...list.map(s => s.mentions24h)) : 1
  const top3 = data?.top20?.slice(0, 3) || []

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Toolbar — başlık Tarayıcılar wrapper'ında */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {data?.dataSource === 'x_scraper' && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-500/30 text-green-200 border border-green-500/40">CANLI · X.COM</span>
          )}
          {data?.dataSource === 'x_scraper_partial' && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-200 border border-amber-500/40">KISMİ · {data.totalScanned}/{data.totalItems}</span>
          )}
          {data?.dataSource === 'x_scraper_warming' && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/30 text-blue-200 border border-blue-500/40">ISINIYOR</span>
          )}
          {data?.dataSource === 'x_scraper_unconfigured' && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/30 text-red-200 border border-red-500/40">BAĞLI DEĞİL</span>
          )}
        </div>
        <Button variant="ghost" size="sm" icon={RefreshCw} loading={loading} onClick={() => load(scope)}>Yenile</Button>
      </div>

      {/* Asset type toggle */}
      <div className="flex gap-2 flex-wrap">
        {ASSET_TYPES.map(t => {
          const Icon = t.icon
          const isActive = assetType === t.id
          const colorMap = {
            amber:  isActive ? 'bg-amber-500 text-dark-950'  : 'bg-dark-800 text-gray-400 hover:text-white',
            orange: isActive ? 'bg-orange-500 text-white'    : 'bg-dark-800 text-gray-400 hover:text-white',
          }
          return (
            <button
              key={t.id}
              onClick={() => switchAssetType(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all ${colorMap[t.color]}`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Veri kaynağı uyarısı — sadece sorun varsa göster */}
      {data?.dataSource === 'x_scraper_unconfigured' && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 flex gap-2 items-start">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-red-200/90">
            <div className="font-semibold mb-0.5">X scraper bağlı değil.</div>
            <div className="text-red-200/70">
              {data.message || 'X_AUTH_TOKEN ve X_CT0 cookie\'leri yapılandırılmamış. Sunucu .env dosyasına ekleyip yeniden başlatın.'}
            </div>
          </div>
        </div>
      )}
      {data?.dataSource === 'x_scraper_warming' && (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 flex gap-2 items-start">
          <RefreshCw className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5 animate-spin" />
          <div className="text-xs text-blue-200/90">
            <div className="font-semibold mb-0.5">İlk tarama yapılıyor…</div>
            <div className="text-blue-200/70">
              {data.message || 'Scraper X.com\'a bağlandı, hisseleri ilk kez tarıyor. Birkaç dakika sonra yenileyin.'}
            </div>
          </div>
        </div>
      )}
      {data?.dataSource === 'x_scraper_partial' && data.pendingCount > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex gap-2 items-start">
          <RefreshCw className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5 animate-spin" />
          <div className="text-xs text-amber-200/90">
            <div className="font-semibold mb-0.5">
              {data.totalScanned}/{data.totalItems} sembolün verisi hazır
            </div>
            <div className="text-amber-200/70">
              Kalan {data.pendingCount} sembol arka planda taranıyor; rate-limit'e takılmamak için yavaş ilerliyor.
              Birkaç dakika sonra yenileyin — listeye eklenecekler.
            </div>
          </div>
        </div>
      )}

      {/* Scope filter */}
      <div className="bg-dark-900/60 border border-dark-700 rounded-xl p-1 flex gap-1 w-fit">
        {currentScopes.map(s => {
          const isActive = scope === s.id
          const activeBg = assetType === 'crypto' ? 'bg-orange-500 text-white' : 'bg-amber-500 text-dark-950'
          return (
            <button
              key={s.id}
              onClick={() => setScope(s.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                isActive ? activeBg : 'text-gray-400 hover:text-white'
              }`}
            >
              {s.label}
            </button>
          )
        })}
      </div>

      {/* Stats */}
      {data && (() => {
        const dsMap = {
          x_scraper:              { label: 'Canlı X.com',  sub: 'Gerçek tweet verisi',         color: 'green' },
          x_scraper_partial:      { label: 'Kısmi Canlı',  sub: `${data.pendingCount || 0} sembol kuyrukta`, color: 'amber' },
          x_scraper_warming:      { label: 'Isınıyor',     sub: 'İlk tarama sürüyor',          color: 'blue'  },
          x_scraper_unconfigured: { label: 'Bağlı Değil',  sub: 'Cookie\'ler eksik',           color: 'red'   },
        }
        const ds = dsMap[data.dataSource] || { label: data.dataSource || '—', sub: '', color: 'amber' }
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatCard title="Taranan Hisse" value={data.totalScanned} color="blue" />
            <StatCard title="24sa Toplam Mention" value={data.totalMentions24h.toLocaleString('tr-TR')} color="amber" />
            <StatCard title="Hisse Başına Ort." value={data.avgMentionsPerStock} color="amber" />
            <StatCard title="Veri Kaynağı" value={ds.label} sub={ds.sub} color={ds.color} />
          </div>
        )
      })()}

      {/* Top 3 podium — yenilenen tasarım */}
      {top3.length === 3 && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3 items-end">
          {[1, 0, 2].map((idx, pos) => {
            const stock = top3[idx]
            const rank = idx + 1
            const heights = ['min-h-[150px]', 'min-h-[180px]', 'min-h-[135px]']
            const medals = ['🥈', '🥇', '🥉']
            const palettes = [
              { ring: 'ring-slate-300/40',  glow: 'shadow-slate-300/10', grad: 'from-slate-400/25 via-slate-500/10 to-transparent', border: 'border-slate-300/40', accent: 'text-slate-200' },
              { ring: 'ring-amber-300/60',  glow: 'shadow-amber-400/20', grad: 'from-amber-400/30 via-amber-500/15 to-transparent', border: 'border-amber-300/60', accent: 'text-amber-200' },
              { ring: 'ring-orange-500/40', glow: 'shadow-orange-600/10', grad: 'from-orange-600/25 via-orange-700/10 to-transparent', border: 'border-orange-500/40', accent: 'text-orange-200' },
            ]
            const p = palettes[pos]
            const change = stock.change24h
            const changeColor = change >= 0 ? 'text-green-400' : 'text-red-400'
            return (
              <button
                key={stock.symbol}
                onClick={() => setSelectedSymbol(stock.symbol)}
                className={`group relative overflow-hidden ${heights[pos]} rounded-2xl border ${p.border} bg-gradient-to-b ${p.grad} p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${p.glow} ring-1 ${p.ring} hover:ring-2`}
              >
                {/* Glow blob */}
                <div className={`pointer-events-none absolute -top-10 -right-10 h-24 w-24 rounded-full opacity-30 blur-2xl bg-gradient-to-br ${p.grad}`} />

                {/* Header: rank + medal */}
                <div className="flex items-center justify-between">
                  <div className={`text-[10px] uppercase tracking-wider font-bold ${p.accent}`}>#{rank}</div>
                  <div className="text-3xl drop-shadow-lg">{medals[pos]}</div>
                </div>

                {/* Body */}
                <div className="mt-2 space-y-1.5">
                  <div className="text-lg font-bold text-white truncate">{stock.symbol}</div>
                  <div className="text-[10px] text-gray-400 truncate -mt-0.5">{stock.sector || stock.name}</div>

                  <div className="flex items-baseline gap-1.5 pt-1">
                    <span className="text-xl font-extrabold text-white">{stock.mentions24h}</span>
                    <span className="text-[10px] text-gray-500">mention</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className={`font-semibold ${changeColor}`}>
                      {change >= 0 ? '▲' : '▼'} {Math.abs(change)}%
                    </span>
                    <span className="px-1.5 py-0.5 rounded-md bg-black/30 border border-white/10 font-bold text-white text-[10px]">
                      Skor {stock.trendScore}
                    </span>
                  </div>

                  <div className="pt-1">
                    <SentimentBar sentiment={stock.sentiment} />
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Hızlı liderlik tablosu — 3'lü kompakt özet */}
      {data?.all?.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <LeaderCard
            title="En Çok Konuşulan"
            icon={Flame}
            color="amber"
            items={data.top20.slice(0, 5)}
            metric="mentions24h"
            suffix=""
            onSelect={setSelectedSymbol}
          />
          <LeaderCard
            title="En Pozitif"
            icon={Smile}
            color="green"
            items={data.bullish.slice(0, 5)}
            metric="sentiment.positive"
            suffix="%"
            onSelect={setSelectedSymbol}
          />
          <LeaderCard
            title="En Negatif"
            icon={Frown}
            color="red"
            items={data.bearish.slice(0, 5)}
            metric="sentiment.negative"
            suffix="%"
            onSelect={setSelectedSymbol}
          />
        </div>
      )}

      {/* Tabs — sağ/sol ok butonu */}
      <ScrollableTabBar
        activeKey={activeTab}
        className="bg-dark-900/60 border border-dark-700 rounded-xl p-1 gap-1"
      >
        {TABS.map(t => {
          const Icon = t.icon
          const isActive = activeTab === t.id
          return (
            <button
              key={t.id}
              data-tab-key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                isActive ? 'bg-amber-500 text-dark-950' : 'text-gray-400 hover:text-white hover:bg-dark-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          )
        })}
      </ScrollableTabBar>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3 text-red-400">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Loading */}
      {loading && !data && (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> X gündemi taranıyor...
        </div>
      )}

      {/* List */}
      {list.length > 0 && (
        <div className="space-y-1.5">
          <div className="hidden sm:grid grid-cols-12 gap-2 px-3 py-1 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
            <div className="col-span-1 text-center">#</div>
            <div className="col-span-2">Sembol</div>
            <div className="col-span-3">Şirket</div>
            <div className="col-span-3">Mention (24sa)</div>
            <div className="col-span-2 text-right">Δ 24sa</div>
            <div className="col-span-1 text-right">Skor</div>
          </div>
          {list.map((stock, idx) => (
            <MentionRow
              key={stock.symbol}
              stock={stock}
              rank={idx + 1}
              maxMentions={maxMentions}
              onClick={setSelectedSymbol}
            />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && list.length === 0 && data && (
        <div className="text-center py-12 text-gray-500 text-sm">
          <MessageCircle className="w-10 h-10 mx-auto mb-2 opacity-40" />
          Bu kategoride sonuç yok.
        </div>
      )}

      {/* Detail modal */}
      {selectedSymbol && <DetailModal symbol={selectedSymbol} assetType={assetType} onClose={() => setSelectedSymbol(null)} />}
    </div>
  )
}
