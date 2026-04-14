import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, TrendingUp, AlertTriangle, CheckCircle, XCircle, Info, AlertCircle } from 'lucide-react'
import { getApiBase } from '../config'
const API_BASE = getApiBase() + '/api'

export default function TemelAnalizAI() {
  const [searchParams] = useSearchParams()
  const [symbol, setSymbol] = useState('')
  const [loading, setLoading] = useState(false)
  const [analysis, setAnalysis] = useState(null)
  const [error, setError] = useState(null)

  // URL'den ?symbol= parametresi ile otomatik analiz başlat
  useEffect(() => {
    const sym = searchParams.get('symbol')
    if (sym) {
      setSymbol(sym.toUpperCase())
      handleAnalyzeSymbol(sym.toUpperCase())
    }
  }, [])

  const handleAnalyzeSymbol = async (sym) => {
    if (!sym?.trim()) return
    setLoading(true)
    setError(null)
    setAnalysis(null)
    try {
      const response = await fetch(`${API_BASE}/analysis/fundamental/${sym.toUpperCase()}`)
      if (!response.ok) {
        if (response.status === 404) throw new Error(`"${sym}" hisse kodu bulunamadı.`)
        throw new Error('Analiz sırasında bir hata oluştu.')
      }
      const data = await response.json()
      if (!data || !data.symbol) throw new Error('Veri alınamadı.')
      setAnalysis(data)
    } catch (err) {
      setError(err.message || 'Bilinmeyen bir hata oluştu')
    } finally {
      setLoading(false)
    }
  }

  const handleAnalyze = async () => {
    await handleAnalyzeSymbol(symbol)
  }

  const getScoreColor = (score, type) => {
    if (type === 'altman') {
      if (score > 2.99) return 'text-success-500'
      if (score > 1.81) return 'text-warning-500'
      return 'text-danger-500'
    }
    if (type === 'piotroski') {
      if (score >= 7) return 'text-success-500'
      if (score >= 4) return 'text-warning-500'
      return 'text-danger-500'
    }
    return 'text-gray-400'
  }

  const getScoreIcon = (score, type) => {
    if (type === 'altman') {
      if (score > 2.99) return <CheckCircle className="w-5 h-5 text-success-500" />
      if (score > 1.81) return <AlertTriangle className="w-5 h-5 text-warning-500" />
      return <XCircle className="w-5 h-5 text-danger-500" />
    }
    if (type === 'piotroski') {
      if (score >= 7) return <CheckCircle className="w-5 h-5 text-success-500" />
      if (score >= 4) return <AlertTriangle className="w-5 h-5 text-warning-500" />
      return <XCircle className="w-5 h-5 text-danger-500" />
    }
    return <Info className="w-5 h-5 text-gray-400" />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Temel Analiz AI</h1>
        <p className="text-gray-400 mt-1">Akademik finansal skorlama modelleri ile derinlemesine analiz</p>
      </div>

      {/* Arama */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">Hisse Analizi</h2>
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              placeholder="Hisse kodu girin (örn: THYAO)"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
              className="input w-full pl-10"
            />
          </div>
          <button onClick={handleAnalyze} disabled={loading} className="btn-primary px-8">
            {loading ? 'Analiz Ediliyor...' : 'Analiz Et'}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Bu analizler eğitim amaçlıdır, yatırım tavsiyesi niteliği taşımaz.
        </p>
      </div>

      {/* Hata Mesaji */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-400 font-medium">Hata</p>
            <p className="text-red-300 text-sm mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Analiz Sonuclari */}
      {analysis && (
        <div className="space-y-6">
          {/* Başlık */}
          <div className="card bg-gradient-to-r from-primary-900/50 to-dark-900">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white">{analysis.symbol}</h2>
                <p className="text-gray-400">{analysis.name}</p>
                <span className="text-xs bg-primary-500/20 text-primary-400 px-2 py-1 rounded mt-2 inline-block">
                  {analysis.sector}
                </span>
              </div>
            </div>
          </div>

          {/* Skorlar Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Altman Z-Score */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-white">Altman Z-Score</h3>
                {getScoreIcon(analysis.altmanZScore, 'altman')}
              </div>
              <div className={`text-4xl font-bold ${getScoreColor(analysis.altmanZScore, 'altman')}`}>
                {analysis.altmanZScore}
              </div>
              <p className="text-sm text-gray-400 mt-2">{analysis.altmanInterpretation}</p>
              <div className="mt-4 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">&gt; 2.99</span>
                  <span className="text-success-500">Güvenli</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">1.81 - 2.99</span>
                  <span className="text-warning-500">Gri Bölge</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">&lt; 1.81</span>
                  <span className="text-danger-500">Risk Bölgesi</span>
                </div>
              </div>
            </div>

            {/* Piotroski F-Score */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-white">Piotroski F-Score</h3>
                {getScoreIcon(analysis.piotroskiFScore, 'piotroski')}
              </div>
              <div className={`text-4xl font-bold ${getScoreColor(analysis.piotroskiFScore, 'piotroski')}`}>
                {analysis.piotroskiFScore}/9
              </div>
              <p className="text-sm text-gray-400 mt-2">{analysis.piotroskiInterpretation}</p>
              <div className="mt-4 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">7-9</span>
                  <span className="text-success-500">Güçlü</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">4-6</span>
                  <span className="text-warning-500">Orta</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">0-3</span>
                  <span className="text-danger-500">Zayıf</span>
                </div>
              </div>
            </div>

            {/* Beneish M-Score */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-white">Beneish M-Score</h3>
                <Info className="w-5 h-5 text-gray-400" />
              </div>
              <div className={`text-4xl font-bold ${analysis.beneishMScore < -2.22 ? 'text-success-500' : 'text-danger-500'}`}>
                {analysis.beneishMScore}
              </div>
              <p className="text-sm text-gray-400 mt-2">{analysis.beneishInterpretation}</p>
              <div className="mt-4 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">&lt; -2.22</span>
                  <span className="text-success-500">Düşük Risk</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">&gt; -2.22</span>
                  <span className="text-danger-500">Yüksek Risk</span>
                </div>
              </div>
            </div>
          </div>

          {/* Finansal Oranlar */}
          <div className="card">
            <h3 className="font-semibold text-white mb-4">Finansal Oranlar</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {Object.entries({
                'F/K': analysis.priceToEarnings,
                'PD/DD': analysis.priceToBook,
                'F/S': analysis.priceToSales,
                'EV/EBITDA': analysis.evToEbitda,
                'Borç/Özsermaye': analysis.debtToEquity,
                'Cari Oran': analysis.currentRatio,
                'Hızlı Oran': analysis.quickRatio,
                'ROE %': analysis.returnOnEquity,
                'ROA %': analysis.returnOnAssets,
                'Net Kar Marjı %': analysis.netProfitMargin
              }).map(([key, value]) => (
                <div key={key} className="bg-dark-800 rounded-lg p-3">
                  <p className="text-xs text-gray-500">{key}</p>
                  <p className="text-lg font-semibold text-white">{value ?? '-'}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Açıklamalar */}
          <div className="card bg-dark-800/50">
            <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
              <Info className="w-5 h-5 text-primary-500" />
              Skor Açıklamaları
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-400">
              <div>
                <h4 className="text-white font-medium mb-2">Altman Z-Score</h4>
                <p>Edward Altman tarafından 1968'de geliştirilen, şirketlerin iflas riskini ölçen bir model.</p>
              </div>
              <div>
                <h4 className="text-white font-medium mb-2">Piotroski F-Score</h4>
                <p>Joseph Piotroski tarafından geliştirilen, finansal gücü 9 kritere göre değerlendiren bir sistem.</p>
              </div>
              <div>
                <h4 className="text-white font-medium mb-2">Beneish M-Score</h4>
                <p>Şirketlerin kar manipülasyonu yapıp yapmadığını tespit etmek için kullanılan bir model.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Başlangıç durumu */}
      {!analysis && !loading && (
        <div className="card text-center py-16">
          <TrendingUp className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">Temel Analiz Başlatın</h3>
          <p className="text-gray-400 max-w-md mx-auto">
            Yukarıdaki arama kutusuna hisse kodunu girerek akademik finansal analiz skorlarını görüntüleyebilirsiniz.
          </p>
        </div>
      )}
    </div>
  )
}
