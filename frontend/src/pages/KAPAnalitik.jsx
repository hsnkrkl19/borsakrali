import { useState, useEffect } from 'react'
import { FileText, TrendingUp, TrendingDown, Minus, AlertTriangle, RefreshCw, Filter } from 'lucide-react'

export default function KAPAnalitik() {
  const [activeTab, setActiveTab] = useState('haberler')
  const [news, setNews] = useState([])
  const [anomalies, setAnomalies] = useState([])
  const [loading, setLoading] = useState(true)
  const [sentimentFilter, setSentimentFilter] = useState('')

  useEffect(() => {
    fetchData()
  }, [sentimentFilter])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [newsRes, anomaliesRes] = await Promise.all([
        fetch(`/api/kap/news${sentimentFilter ? `?sentiment=${sentimentFilter}` : ''}`),
        fetch('/api/kap/anomalies')
      ])

      // Her response'u ayri ayri kontrol et
      if (newsRes.ok) {
        const newsData = await newsRes.json()
        setNews(newsData.news || [])
      } else {
        setNews([])
      }

      if (anomaliesRes.ok) {
        const anomaliesData = await anomaliesRes.json()
        setAnomalies(anomaliesData.anomalies || [])
      } else {
        setAnomalies([])
      }
    } catch (error) {
      console.error('Veri cekme hatasi:', error)
      setNews([])
      setAnomalies([])
    } finally {
      setLoading(false)
    }
  }

  const getSentimentIcon = (sentiment) => {
    switch (sentiment) {
      case 'positive':
        return <TrendingUp className="w-4 h-4 text-success-500" />
      case 'negative':
        return <TrendingDown className="w-4 h-4 text-danger-500" />
      default:
        return <Minus className="w-4 h-4 text-gray-500" />
    }
  }

  const getSentimentBadge = (sentiment) => {
    switch (sentiment) {
      case 'positive':
        return <span className="badge-success text-xs">Pozitif</span>
      case 'negative':
        return <span className="badge-danger text-xs">Negatif</span>
      default:
        return <span className="badge-warning text-xs">Nötr</span>
    }
  }

  const formatDate = (dateStr) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const tabs = [
    { id: 'haberler', label: 'Şirket Haberleri' },
    { id: 'analiz', label: 'Haber Analizi' },
    { id: 'anomali', label: 'Anomali Tespiti' }
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">KAP Analitik</h1>
          <p className="text-gray-400 mt-1">AI destekli KAP bildirim analizi</p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </button>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-primary-600 text-white'
                : 'bg-dark-800 text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Şirket Haberleri */}
      {activeTab === 'haberler' && (
        <div className="space-y-4">
          {/* Filtreler */}
          <div className="card flex items-center gap-4">
            <Filter className="w-5 h-5 text-gray-500" />
            <span className="text-gray-400 text-sm">Filtrele:</span>
            <div className="flex gap-2">
              {[
                { value: '', label: 'Tümü' },
                { value: 'positive', label: 'Pozitif' },
                { value: 'neutral', label: 'Nötr' },
                { value: 'negative', label: 'Negatif' }
              ].map((filter) => (
                <button
                  key={filter.value}
                  onClick={() => setSentimentFilter(filter.value)}
                  className={`px-3 py-1 rounded text-sm ${
                    sentimentFilter === filter.value
                      ? 'bg-primary-600 text-white'
                      : 'bg-dark-700 text-gray-400 hover:text-white'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {/* Haber Listesi */}
          {loading ? (
            <div className="card text-center py-12">
              <RefreshCw className="w-8 h-8 text-primary-500 animate-spin mx-auto mb-4" />
              <p className="text-gray-400">Haberler yükleniyor...</p>
            </div>
          ) : news.length === 0 ? (
            <div className="card text-center py-12">
              <FileText className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">Haber bulunamadı</p>
            </div>
          ) : (
            <div className="space-y-3">
              {news.map((item) => (
                <div key={item.id} className="card hover:border-primary-500 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-sm font-mono font-bold text-primary-400">
                          {item.stockSymbol}
                        </span>
                        {getSentimentBadge(item.sentiment)}
                        <span className="text-xs text-gray-500">
                          {formatDate(item.publishDate)}
                        </span>
                      </div>
                      <h3 className="text-white font-medium mb-1">{item.title}</h3>
                      <p className="text-sm text-gray-400">{item.summary}</p>
                    </div>
                    <div className="ml-4">
                      {getSentimentIcon(item.sentiment)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Haber Analizi */}
      {activeTab === 'analiz' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Sentiment Dağılımı */}
          <div className="card">
            <h3 className="font-semibold text-white mb-4">Sentiment Dağılımı</h3>
            <div className="space-y-3">
              {[
                { label: 'Pozitif', color: 'bg-success-500', count: news.filter(n => n.sentiment === 'positive').length },
                { label: 'Nötr', color: 'bg-warning-500', count: news.filter(n => n.sentiment === 'neutral').length },
                { label: 'Negatif', color: 'bg-danger-500', count: news.filter(n => n.sentiment === 'negative').length }
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">{item.label}</span>
                    <span className="text-white">{item.count}</span>
                  </div>
                  <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${item.color}`}
                      style={{ width: `${news.length ? (item.count / news.length) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* En Çok Haber Alanlar */}
          <div className="card">
            <h3 className="font-semibold text-white mb-4">En Çok Haber Alan</h3>
            <div className="space-y-2">
              {Object.entries(
                news.reduce((acc, n) => {
                  acc[n.stockSymbol] = (acc[n.stockSymbol] || 0) + 1
                  return acc
                }, {})
              )
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([symbol, count]) => (
                  <div key={symbol} className="flex items-center justify-between bg-dark-800 rounded-lg p-2">
                    <span className="text-primary-400 font-mono">{symbol}</span>
                    <span className="text-white">{count} haber</span>
                  </div>
                ))}
            </div>
          </div>

          {/* Özet İstatistikler */}
          <div className="card">
            <h3 className="font-semibold text-white mb-4">Özet</h3>
            <div className="space-y-4">
              <div className="bg-dark-800 rounded-lg p-3">
                <p className="text-xs text-gray-500">Toplam Haber</p>
                <p className="text-2xl font-bold text-white">{news.length}</p>
              </div>
              <div className="bg-dark-800 rounded-lg p-3">
                <p className="text-xs text-gray-500">Pozitif Oran</p>
                <p className="text-2xl font-bold text-success-500">
                  %{news.length ? Math.round((news.filter(n => n.sentiment === 'positive').length / news.length) * 100) : 0}
                </p>
              </div>
              <div className="bg-dark-800 rounded-lg p-3">
                <p className="text-xs text-gray-500">Farklı Şirket</p>
                <p className="text-2xl font-bold text-primary-500">
                  {new Set(news.map(n => n.stockSymbol)).size}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Anomali Tespiti */}
      {activeTab === 'anomali' && (
        <div className="space-y-4">
          <div className="card bg-warning-500/10 border-warning-500/50">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-warning-500 mt-0.5" />
              <div>
                <h3 className="font-semibold text-warning-500 mb-1">Anomali Tespiti</h3>
                <p className="text-sm text-gray-400">
                  Normalden fazla KAP bildirimi yapan şirketler tespit edildi.
                  Bu durum önemli bir gelişmeye işaret edebilir.
                </p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="card text-center py-12">
              <RefreshCw className="w-8 h-8 text-primary-500 animate-spin mx-auto mb-4" />
              <p className="text-gray-400">Anomaliler analiz ediliyor...</p>
            </div>
          ) : anomalies.length === 0 ? (
            <div className="card text-center py-12">
              <AlertTriangle className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">Anomali tespit edilmedi</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {anomalies.map((anomaly, idx) => (
                <div key={idx} className="card border-warning-500/30">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-lg font-bold text-primary-400 font-mono">
                      {anomaly.symbol}
                    </span>
                    <span className="text-xs bg-warning-500/20 text-warning-500 px-2 py-1 rounded">
                      Anomali
                    </span>
                  </div>
                  <p className="text-sm text-gray-400 mb-3">{anomaly.name}</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Bugünkü Haber</span>
                      <span className="text-white font-semibold">{anomaly.newsCount}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Ortalama</span>
                      <span className="text-gray-400">{anomaly.avgNewsCount}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Anomali Skoru</span>
                      <span className="text-warning-500 font-semibold">
                        {(anomaly.anomalyScore * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
