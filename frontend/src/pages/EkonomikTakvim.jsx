import { useState, useEffect } from 'react'
import { RefreshCw, AlertCircle, Calendar, ExternalLink, Brain, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from 'lucide-react'
import api from '../services/api'

const IMPORTANCE_CONFIG = {
  high:   { label: 'Yüksek', color: 'text-red-400',    dot: 'bg-red-400',    bg: 'bg-red-500/10 border-red-500/20' },
  medium: { label: 'Orta',   color: 'text-yellow-400', dot: 'bg-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  low:    { label: 'Düşük',  color: 'text-gray-400',   dot: 'bg-gray-500',   bg: 'bg-dark-800 border-dark-700' },
}

const MONTH_NAMES_TR = [
  '', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
]

export default function EkonomikTakvim() {
  const now = new Date()
  const [year,       setYear]       = useState(now.getFullYear())
  const [month,      setMonth]      = useState(now.getMonth() + 1)
  const [country,    setCountry]    = useState('ALL')
  const [importance, setImportance] = useState('ALL')
  const [events,     setEvents]     = useState([])
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)
  const [dataSource, setDataSource] = useState('')
  const [dataNote,   setDataNote]   = useState('')
  const [fetchedFrom, setFetchedFrom] = useState('')
  const [expandedCommentary, setExpandedCommentary] = useState(new Set())
  const today = now.toISOString().slice(0, 10)

  // 15 dakikada bir otomatik yenile
  useEffect(() => {
    const interval = setInterval(() => fetchCalendar(year, month), 15 * 60 * 1000)
    return () => clearInterval(interval)
  }, [year, month])

  const fetchCalendar = async (y = year, m = month, force = false) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ year: y, month: m })
      if (force) params.append('force', 'true')
      if (country !== 'ALL') params.append('country', country)
      if (importance !== 'ALL') params.append('importance', importance)
      const r = await api.get(`/economic-calendar?${params}`)
      setEvents(r.data.events || [])
      setDataSource(r.data.dataSource || '')
      setDataNote(r.data.dataNote || '')
      setFetchedFrom(r.data.fetchedFrom || 'static')
    } catch (e) {
      setError('Takvim verisi yüklenemedi. Lütfen tekrar deneyin.')
      setEvents([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchCalendar() }, [year, month, country, importance])

  const changeMonth = (delta) => {
    let m = month + delta
    let y = year
    if (m > 12) { m = 1; y++ }
    if (m < 1)  { m = 12; y-- }
    setMonth(m)
    setYear(y)
  }

  // Tarihe göre grupla
  const filtered = events.filter(e => {
    if (country !== 'ALL' && e.country !== country) return false
    if (importance !== 'ALL' && e.importance !== importance) return false
    return true
  })

  const grouped = {}
  filtered.forEach(e => {
    if (!grouped[e.date]) grouped[e.date] = []
    grouped[e.date].push(e)
  })
  const sortedDates = Object.keys(grouped).sort()

  const formatDate = (d) => {
    const date = new Date(d + 'T12:00:00')
    const isPast   = d < today
    const isToday  = d === today
    const label = date.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })
    return { label, isPast, isToday }
  }

  const getActualColor = (event) => {
    if (!event.actual || !event.forecast) return 'text-green-400'
    const a = parseFloat(event.actual.replace(/[^0-9.\-]/g, ''))
    const f = parseFloat(event.forecast.replace(/[^0-9.\-]/g, ''))
    if (isNaN(a) || isNaN(f)) return 'text-blue-400'
    return a > f ? 'text-green-400' : a < f ? 'text-red-400' : 'text-yellow-400'
  }

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Calendar className="w-6 h-6 text-gold-400" />
            Ekonomik Takvim
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {MONTH_NAMES_TR[month]} {year} — Türkiye ve ABD önemli veri açıklamaları
          </p>
        </div>
        <button
          onClick={() => fetchCalendar(year, month, true)}
          disabled={loading}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </button>
      </div>

      {/* Ay Navigasyonu */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => changeMonth(-1)}
          className="px-3 py-1.5 text-sm bg-dark-800 text-gray-300 rounded-lg hover:bg-dark-700 transition-colors"
        >
          ← Önceki
        </button>
        <span className="px-4 py-1.5 text-sm font-semibold text-white bg-dark-700 rounded-lg min-w-[120px] text-center">
          {MONTH_NAMES_TR[month]} {year}
        </span>
        <button
          onClick={() => changeMonth(+1)}
          className="px-3 py-1.5 text-sm bg-dark-800 text-gray-300 rounded-lg hover:bg-dark-700 transition-colors"
        >
          Sonraki →
        </button>
        <button
          onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth() + 1) }}
          className="px-3 py-1.5 text-xs bg-gold-500/20 text-gold-400 rounded-lg hover:bg-gold-500/30 transition-colors ml-1"
        >
          Bugün
        </button>
      </div>

      {/* Filtreler */}
      <div className="flex gap-2 flex-wrap">
        <div className="flex gap-1 bg-dark-800 p-1 rounded-xl">
          {['ALL', 'TR', 'US'].map(c => (
            <button
              key={c}
              onClick={() => setCountry(c)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${country === c ? 'bg-gold-500 text-dark-950 font-medium' : 'text-gray-400 hover:text-white'}`}
            >
              {c === 'ALL' ? '🌍 Tümü' : c === 'TR' ? '🇹🇷 Türkiye' : '🇺🇸 ABD'}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-dark-800 p-1 rounded-xl">
          {['ALL', 'high', 'medium', 'low'].map(i => {
            const cfg = IMPORTANCE_CONFIG[i]
            return (
              <button
                key={i}
                onClick={() => setImportance(i)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${importance === i ? 'bg-gold-500 text-dark-950 font-medium' : 'text-gray-400 hover:text-white'}`}
              >
                {i === 'ALL' ? 'Tümü' : cfg?.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Veri Kaynağı Notu */}
      {dataSource && (
        <div className="text-xs text-gray-500 flex items-center gap-1.5 bg-dark-800/50 rounded-lg px-3 py-2">
          <ExternalLink className="w-3 h-3 flex-shrink-0 text-gold-400" />
          <span>
            <span className="text-gold-400">{dataSource}</span>
            {fetchedFrom === 'investing_live'    && <span className="ml-1.5 text-green-400 font-medium">● Canlı (Investing.com)</span>}
            {fetchedFrom === 'investing_cache'   && <span className="ml-1.5 text-blue-400 font-medium">● Önbellekten (Investing.com)</span>}
            {fetchedFrom === 'forexfactory_live' && <span className="ml-1.5 text-green-400 font-medium">● Canlı (Forex Factory)</span>}
            {fetchedFrom === 'forexfactory_cache'&& <span className="ml-1.5 text-blue-400 font-medium">● Önbellekten (Forex Factory)</span>}
            {fetchedFrom === 'fmp_live'          && <span className="ml-1.5 text-green-400 font-medium">● Canlı (FMP)</span>}
            {fetchedFrom === 'fmp_cache'         && <span className="ml-1.5 text-blue-400 font-medium">● Önbellekten (FMP)</span>}
            {fetchedFrom === 'bls_live'          && <span className="ml-1.5 text-green-400 font-medium">● Canlı (BLS.gov)</span>}
            {fetchedFrom === 'bls_cache'         && <span className="ml-1.5 text-blue-400 font-medium">● Önbellekten (BLS.gov)</span>}
            {fetchedFrom === 'static'            && <span className="ml-1.5 text-gray-500 font-medium">● Statik Veri</span>}
            {dataNote ? ` — ${dataNote}` : ''}
          </span>
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-4 text-xs text-gray-500">
        {Object.entries(IMPORTANCE_CONFIG).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${v.dot}`} />
            {v.label}
          </div>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-6 h-6 text-gold-400 animate-spin" />
          <span className="ml-2 text-gray-400 text-sm">Yükleniyor...</span>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm text-red-400">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Veri Yok */}
      {!loading && !error && sortedDates.length === 0 && (
        <div className="text-center py-12">
          <Calendar className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Bu ay için ekonomik takvim verisi bulunamadı.</p>
          <p className="text-gray-600 text-xs mt-1">Desteklenen yıl: 2026</p>
        </div>
      )}

      {/* Calendar */}
      {!loading && !error && sortedDates.length > 0 && (
        <div className="space-y-6">
          {sortedDates.map(date => {
            const { label, isPast, isToday } = formatDate(date)
            return (
              <div key={date}>
                <div className={`flex items-center gap-3 mb-3 pb-2 border-b ${isToday ? 'border-gold-500/40' : 'border-dark-700'}`}>
                  <div className={`w-2.5 h-2.5 rounded-full ${isToday ? 'bg-gold-400 animate-pulse' : isPast ? 'bg-gray-600' : 'bg-blue-400'}`} />
                  <span className={`text-sm font-semibold ${isToday ? 'text-gold-400' : isPast ? 'text-gray-500' : 'text-white'}`}>
                    {label}
                    {isToday && <span className="ml-2 text-xs font-normal bg-gold-500/20 text-gold-400 px-2 py-0.5 rounded-full">Bugün</span>}
                    {isPast && !isToday && <span className="ml-2 text-xs font-normal text-gray-600">• Tamamlandı</span>}
                  </span>
                </div>
                <div className="space-y-2">
                  {grouped[date].map(event => {
                    const imp = IMPORTANCE_CONFIG[event.importance] || IMPORTANCE_CONFIG.low
                    return (
                      <div
                        key={event.id}
                        className={`rounded-xl border p-3 sm:p-4 ${imp.bg} ${isPast ? 'opacity-80' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${imp.dot}`} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-gray-500">{event.flag} {event.time}</span>
                                <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${imp.color} bg-dark-800`}>
                                  {imp.label}
                                </span>
                                <span className="text-xs text-gray-600">{event.category}</span>
                                {event.aiCommentary && (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                    event.aiCommentary.sentiment === 'positive' ? 'bg-green-500/20 text-green-400' :
                                    event.aiCommentary.sentiment === 'negative' ? 'bg-red-500/20 text-red-400' :
                                    'bg-gray-500/20 text-gray-400'
                                  }`}>
                                    {event.aiCommentary.sentiment === 'positive' ? '▲ Olumlu' :
                                     event.aiCommentary.sentiment === 'negative' ? '▼ Olumsuz' : '● Nötr'}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm font-medium text-white mt-1 leading-snug">{event.title}</p>
                              {event.note && (
                                <p className="text-xs text-gray-400 mt-0.5 italic">{event.note}</p>
                              )}

                              {/* AI Yorum Bölümü */}
                              {event.aiCommentary && (
                                <div className="mt-2">
                                  <button
                                    onClick={() => {
                                      setExpandedCommentary(prev => {
                                        const next = new Set(prev)
                                        next.has(event.id) ? next.delete(event.id) : next.add(event.id)
                                        return next
                                      })
                                    }}
                                    className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
                                  >
                                    <Brain className="w-3 h-3" />
                                    AI Piyasa Yorumu
                                    {expandedCommentary.has(event.id) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                  </button>
                                  {expandedCommentary.has(event.id) && (
                                    <div className="mt-2 p-2.5 bg-dark-900/60 rounded-lg border border-blue-500/20 space-y-1.5">
                                      <p className="text-xs text-gray-300"><span className="text-blue-400 font-medium">Etki:</span> {event.aiCommentary.impact}</p>
                                      <p className="text-xs text-gray-300"><span className="text-yellow-400 font-medium">Senaryo:</span> {event.aiCommentary.scenario}</p>
                                      <p className="text-xs text-gray-400 italic">{event.aiCommentary.consensus}</p>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Önceki / Tahmin / Gerçekleşen */}
                          <div className="flex gap-3 flex-shrink-0 text-right text-xs">
                            {event.previous != null && (
                              <div>
                                <div className="text-gray-500 mb-0.5">Önceki</div>
                                <div className="text-gray-300 font-medium">{event.previous}</div>
                              </div>
                            )}
                            {event.forecast != null && (
                              <div>
                                <div className="text-gray-500 mb-0.5">Tahmin</div>
                                <div className="text-blue-400 font-medium">{event.forecast}</div>
                              </div>
                            )}
                            <div>
                              <div className="text-gray-500 mb-0.5">Gerçekleşen</div>
                              {event.actual != null ? (
                                <div className={`font-bold ${getActualColor(event)}`}>{event.actual}</div>
                              ) : (
                                <div className="text-gray-600">—</div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Footer */}
      <div className="text-xs text-gray-600 text-center pt-2">
        Veriler TCMB, TÜİK, BLS, Fed ve ECB resmi açıklama takvimlerinden derlenmektedir.
        Gerçekleşen değerler yayınlandıkça güncellenir.
      </div>
    </div>
  )
}
