import { useState, useEffect } from 'react'
import { FileText, TrendingUp, TrendingDown, Activity, Clock, Tag, ChevronRight, Search, Filter, RefreshCw } from 'lucide-react'

import { getApiBase } from '../config'
const API_BASE = getApiBase() + '/api'

export default function TeknikNotlar() {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedNote, setSelectedNote] = useState(null)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchNotes()
  }, [])

  const fetchNotes = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/technical-notes`)
      const data = await response.json()
      setNotes(data.notes || [])
    } catch (error) {
      console.error('Teknik notlar hatasi:', error)
    } finally {
      setLoading(false)
    }
  }

  const categories = [
    { id: 'all', label: 'Tümü' },
    { id: 'Trend Analizi', label: 'Trend Analizi' },
    { id: 'Destek/Direnç', label: 'Destek/Direnç' },
    { id: 'Momentum', label: 'Momentum' },
    { id: 'Formasyon', label: 'Formasyon' },
    { id: 'Günlük Analiz', label: 'Günlük Analiz' }
  ]

  const filteredNotes = notes.filter(note => {
    if (filter !== 'all' && note.category !== filter) return false
    if (search && !note.symbol.toLowerCase().includes(search.toLowerCase()) &&
        !note.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const getTrendIcon = (trend) => {
    if (trend === 'Yükseliş' || trend === 'Pozitif') return <TrendingUp className="w-4 h-4 text-green-500" />
    if (trend === 'Düşüş' || trend === 'Negatif') return <TrendingDown className="w-4 h-4 text-red-500" />
    return <Activity className="w-4 h-4 text-yellow-500" />
  }

  const formatDate = (dateStr) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Teknik İnceleme Notları</h1>
          <p className="text-gray-400 mt-1">AI destekli teknik analiz değerlendirmeleri ve notlar</p>
        </div>
        <button
          onClick={fetchNotes}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </button>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Hisse veya başlık ara..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input w-full pl-10"
              />
            </div>
          </div>

          {/* Category Filter */}
          <div className="flex flex-wrap gap-2">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setFilter(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filter === cat.id
                    ? 'bg-primary-600 text-white'
                    : 'bg-dark-800 text-gray-400 hover:text-white'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Notes Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 text-primary-500 animate-spin" />
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="card text-center py-16">
          <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">Not Bulunamadı</h3>
          <p className="text-gray-400">Filtreleri değiştirerek tekrar deneyin</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredNotes.map((note) => (
            <div
              key={note.id}
              onClick={() => setSelectedNote(note)}
              className="card cursor-pointer transition-all hover:border-primary-500 hover:shadow-glow-gold"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-lg font-bold text-primary-400 font-mono">{note.symbol}</span>
                <span className="text-xs bg-primary-500/20 text-primary-400 px-2 py-1 rounded">
                  {note.category}
                </span>
              </div>

              {/* Title */}
              <h3 className="text-white font-semibold mb-2 line-clamp-2">{note.title}</h3>

              {/* Content Preview */}
              <p className="text-sm text-gray-400 mb-4 line-clamp-3">{note.content}</p>

              {/* Indicators */}
              {note.indicators && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {Object.entries(note.indicators).slice(0, 3).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-1 text-xs bg-dark-800 px-2 py-1 rounded min-w-0">
                      {key === 'trend' && getTrendIcon(value)}
                      <span className="text-gray-400 shrink-0">{key}:</span>
                      <span className="text-white font-medium truncate">{value}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-dark-700">
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Clock className="w-3 h-3" />
                  {formatDate(note.date)}
                </div>
                <button className="text-xs text-primary-500 flex items-center gap-1 hover:text-primary-400">
                  Detay <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedNote && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-dark-900 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gold-500/30 shadow-premium">
            {/* Modal Header */}
            <div className="sticky top-0 bg-dark-900 border-b border-dark-700 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl font-bold text-primary-400 font-mono">{selectedNote.symbol}</span>
                    <span className="text-sm bg-primary-500/20 text-primary-400 px-2 py-1 rounded">
                      {selectedNote.category}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-white">{selectedNote.title}</h2>
                </div>
                <button
                  onClick={() => setSelectedNote(null)}
                  className="p-2 hover:bg-dark-800 rounded-lg transition-colors"
                >
                  <span className="text-gray-400 text-2xl">&times;</span>
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Content */}
              <div>
                <h3 className="text-sm font-semibold text-gray-400 mb-2">ANALİZ</h3>
                <p className="text-gray-300 leading-relaxed">{selectedNote.content}</p>
              </div>

              {/* Indicators */}
              {selectedNote.indicators && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-400 mb-3">GÖSTERGELER</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.entries(selectedNote.indicators).map(([key, value]) => (
                      <div key={key} className="bg-dark-800 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-1">{key.toUpperCase()}</p>
                        <div className="flex items-center gap-2">
                          {key === 'trend' && getTrendIcon(value)}
                          <span className={`font-semibold ${
                            value === 'Yükseliş' || value === 'Pozitif' ? 'text-green-500' :
                            value === 'Düşüş' || value === 'Negatif' ? 'text-red-500' :
                            'text-white'
                          }`}>
                            {typeof value === 'number' ? value.toFixed(2) : value}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Meta Info */}
              <div className="flex items-center justify-between pt-4 border-t border-dark-700">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Tag className="w-4 h-4" />
                  {selectedNote.author}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Clock className="w-4 h-4" />
                  {formatDate(selectedNote.date)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
        <p className="text-xs text-gray-400 text-center">
          <strong className="text-yellow-500">ÖNEMLİ:</strong> Bu teknik analizler yapay zeka tarafından otomatik olarak üretilmektedir.
          Eğitim amaçlıdır ve yatırım tavsiyesi niteliği taşımaz. Borsa Krali
        </p>
      </div>
    </div>
  )
}
