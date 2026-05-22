import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Newspaper, RefreshCw, AlertCircle, ExternalLink, Bitcoin, Globe, Filter, Clock, Hash } from 'lucide-react'
import api from '../services/api'
import { Button } from '../components/ui'

const CATEGORY_FILTERS = [
  { id: 'all',     label: 'Tümü',          icon: Globe },
  { id: 'general', label: 'Genel Ekonomi', icon: Newspaper },
  { id: 'crypto',  label: 'Kripto',        icon: Bitcoin },
]

function formatDate(s) {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'şimdi'
  if (min < 60) return `${min}dk önce`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}sa önce`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}g önce`
  return d.toLocaleDateString('tr-TR')
}

function NewsCard({ item, onSymbolClick }) {
  const isCrypto = item.sourceCategory === 'crypto'
  const accentColor = isCrypto ? 'border-orange-500/30 hover:border-orange-500/60' : 'border-amber-500/20 hover:border-amber-500/50'
  const bistSyms = item.mentionedSymbols?.bist || []
  const cryptoSyms = item.mentionedSymbols?.crypto || []
  const hasSymbols = bistSyms.length > 0 || cryptoSyms.length > 0

  return (
    <div className={`rounded-xl border bg-dark-900/50 hover:bg-dark-900/80 ${accentColor} p-3 transition-all group`}>
      <a
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 text-[10px]">
            <span className={`px-2 py-0.5 rounded-md font-semibold ${
              isCrypto ? 'bg-orange-500/15 text-orange-300 border border-orange-500/30' : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
            }`}>
              {item.source}
            </span>
            {item.publishedAt && (
              <span className="text-gray-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDate(item.publishedAt)}
              </span>
            )}
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-gray-500 group-hover:text-amber-400 transition-colors flex-shrink-0" />
        </div>
        <h3 className="text-sm font-semibold text-white group-hover:text-amber-300 transition-colors leading-snug mb-1.5">
          {item.title}
        </h3>
        {item.description && (
          <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">{item.description}</p>
        )}
      </a>

      {/* Tespit edilmiş semboller — tıklanınca X Gündemi'ne git */}
      {hasSymbols && (
        <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-dark-700/50">
          <Hash className="w-3 h-3 text-amber-400 self-center" />
          {bistSyms.map(s => (
            <button
              key={`b_${s}`}
              onClick={(e) => { e.stopPropagation(); onSymbolClick?.(s, 'stock') }}
              className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 font-bold transition-colors"
              title={`${s} BIST hissesinin X Gündemi detayı`}
            >
              {s}
            </button>
          ))}
          {cryptoSyms.map(s => (
            <button
              key={`c_${s}`}
              onClick={(e) => { e.stopPropagation(); onSymbolClick?.(s, 'crypto') }}
              className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-300 hover:bg-orange-500/30 border border-orange-500/30 font-bold transition-colors"
              title={`${s} kriptosunun X Gündemi detayı`}
            >
              ${s}
            </button>
          ))}
        </div>
      )}

      {item.categories?.length > 0 && !hasSymbols && (
        <div className="flex flex-wrap gap-1 mt-2">
          {item.categories.slice(0, 3).map((c, i) => (
            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-dark-800 text-gray-400 border border-dark-700">
              {c}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function HaberAkisi() {
  const navigate = useNavigate()
  const [category, setCategory] = useState('all')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeSource, setActiveSource] = useState('all')
  const [sources, setSources] = useState([])

  // Sembol tıkı → X Gündemi tab'ına git, ilgili asset type ile
  const handleSymbolClick = (symbol, type) => {
    navigate(`/tarayicilar?tab=x-gundem&focus=${symbol}&assetType=${type}`)
  }

  const load = async (cat = category) => {
    setLoading(true)
    setError(null)
    try {
      const params = cat === 'all' ? {} : { category: cat }
      const r = await api.get('/scraper/news', { params })
      setData(r.data)
    } catch (e) {
      setError(e.response?.data?.error || 'Haberler yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    api.get('/scraper/sources').then(r => setSources(r.data.sources || [])).catch(() => {})
  }, [])

  useEffect(() => { load() }, [category]) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredNews = (data?.news || []).filter(n =>
    activeSource === 'all' || n.sourceKey === activeSource
  )

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Toolbar — başlık Tarayıcılar wrapper'ında */}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" icon={RefreshCw} loading={loading} onClick={() => load(category)}>Yenile</Button>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORY_FILTERS.map(c => {
          const Icon = c.icon
          const isActive = category === c.id
          return (
            <button
              key={c.id}
              onClick={() => { setCategory(c.id); setActiveSource('all') }}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                isActive
                  ? c.id === 'crypto'
                    ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25'
                    : 'bg-amber-500 text-dark-950 shadow-lg shadow-amber-500/25'
                  : 'bg-dark-800 text-gray-400 hover:text-white hover:bg-dark-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {c.label}
            </button>
          )
        })}
      </div>

      {/* Stats */}
      {data?.success && (
        <div className="rounded-xl border border-dark-700 bg-dark-900/40 p-3 flex items-center justify-between flex-wrap gap-2">
          <div className="text-xs text-gray-400">
            <span className="text-amber-300 font-bold">{filteredNews.length}</span> haber
            {data.sourcesUsed?.length > 0 && (
              <> · <span className="text-blue-300">{data.sourcesUsed.length}</span> kaynak</>
            )}
          </div>
          <div className="text-[10px] text-gray-500">
            Son güncelleme: {formatDate(data.fetchedAt)}
          </div>
        </div>
      )}

      {/* Source filter pills */}
      {data?.sourcesUsed?.length > 0 && (
        <div className="flex gap-1.5 flex-wrap items-center">
          <Filter className="w-3.5 h-3.5 text-gray-500" />
          <button
            onClick={() => setActiveSource('all')}
            className={`text-xs px-2 py-1 rounded-md font-semibold transition-all ${
              activeSource === 'all' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-dark-800 text-gray-400 hover:text-white border border-dark-700'
            }`}
          >
            Tüm Kaynaklar ({data.news?.length || 0})
          </button>
          {data.sourcesUsed.map(s => (
            <button
              key={s.key}
              onClick={() => setActiveSource(s.key)}
              className={`text-xs px-2 py-1 rounded-md font-semibold transition-all ${
                activeSource === s.key ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-dark-800 text-gray-400 hover:text-white border border-dark-700'
              }`}
            >
              {s.name} ({s.count})
            </button>
          ))}
        </div>
      )}

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
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Haberler kazınıyor...
        </div>
      )}

      {/* News grid */}
      {filteredNews.length > 0 && (
        <div className="space-y-2">
          {filteredNews.map(n => (
            <NewsCard key={n.id + n.title} item={n} onSymbolClick={handleSymbolClick} />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && filteredNews.length === 0 && data && (
        <div className="text-center py-12 text-gray-500 text-sm">
          <Newspaper className="w-10 h-10 mx-auto mb-2 opacity-40" />
          Bu filtreyle eşleşen haber yok.
        </div>
      )}

      {/* Footer note */}
      <div className="text-[10px] text-gray-600 px-1 leading-relaxed">
        Haberler RSS feed'lerinden 5 dakikalık önbellekle çekilir. İçerik kaynağa aittir; başlığa tıklayarak orijinal haberi açabilirsiniz.
        {sources.length > 0 && (
          <span> Kullanılabilir kaynaklar: {sources.map(s => s.name).join(', ')}.</span>
        )}
      </div>
    </div>
  )
}
