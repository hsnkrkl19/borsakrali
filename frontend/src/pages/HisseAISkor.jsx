import { useState } from 'react'
import { Search, Zap, Target, Shield, TrendingUp, TrendingDown, Activity, BarChart3, AlertCircle, Clock, Database, Info } from 'lucide-react'

import { getApiBase } from '../config'
const API_BASE = getApiBase() + '/api'

const CRYPTO_QUICK = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'AVAX', 'DOGE', 'LINK', 'NEAR', 'INJ']
const PERIOD_LABELS = {
  hourly: 'Saatlik',
  daily: 'Günlük',
  weekly: 'Haftalık',
  monthly: 'Aylık'
}

const SCORE_GUIDE = [
  {
    title: '65 - 100',
    description: 'Güçlü ve daha olumlu görünüm.',
    className: 'border-green-500/20 bg-green-500/10 text-green-400'
  },
  {
    title: '45 - 64',
    description: 'Karışık veya teyit bekleyen görünüm.',
    className: 'border-yellow-500/20 bg-yellow-500/10 text-yellow-400'
  },
  {
    title: '0 - 44',
    description: 'Zayıf ya da kırılgan görünüm.',
    className: 'border-red-500/20 bg-red-500/10 text-red-400'
  }
]

const TERM_EXPLANATIONS = [
  {
    title: 'RSI',
    description: 'Fiyatın aşırı ısınıp ısınmadığını gösterir.',
    hint: '30 altı zayıflama, 70 üstü aşırı ısınma olarak okunur.'
  },
  {
    title: 'MACD',
    description: 'Trend yönü ve ivmesini takip eder.',
    hint: 'Pozitif kesişmeler güç kazanımına işaret edebilir.'
  },
  {
    title: 'EMA 21 / EMA 50',
    description: 'Kısa ve orta vadeli ortalama fiyat seviyeleridir.',
    hint: 'Fiyat bu ortalamaların üstünde kaldıkça trend daha sağlıklı görünür.'
  },
  {
    title: 'Altman Z-Score',
    description: 'Şirketin finansal sıkıntı yaşama ihtimalini ölçer.',
    hint: 'Yüksek değer genelde daha güven verici kabul edilir.'
  },
  {
    title: 'Piotroski F-Score',
    description: 'Bilançoyu 9 farklı kalite kriteriyle puanlar.',
    hint: "9'a yaklaştıkça finansal kalite artmış sayılır."
  },
  {
    title: 'Beneish M-Score',
    description: 'Kar manipülasyonu riskini anlamaya yardım eder.',
    hint: '-2.22 altındaki değerler genelde daha güven vericidir.'
  },
  {
    title: 'F/K Orani',
    description: 'Fiyatın şirkete ait kâra göre pahalı mı ucuz mu olduğunu anlatır.',
    hint: 'Tek başına yeterli değildir; sektörle birlikte okunmalıdır.'
  },
  {
    title: 'PD/DD',
    description: 'Piyasa değerinin özkaynaklara göre nasıl fiyatlandığını gösterir.',
    hint: 'Düşük değer bazen daha makul fiyatlama anlamına gelebilir.'
  }
]

const SCORE_INSIGHTS = {
  technical: {
    high: 'Fiyat davranışı, trend ve momentum şu an daha destekleyici görünüyor.',
    medium: 'Teknik görünüm karışık. İşlem öncesi ek teyit izlenmeli.',
    low: 'Teknik yapı zayıf. Trend veya momentum desteği sınırlı.'
  },
  fundamental: {
    high: 'Bilanço kalitesi ve temel yapı tarafında daha sağlam bir tablo var.',
    medium: 'Temel veriler ne çok güçlü ne de çok zayıf. Ayrıntılı inceleme gerekir.',
    low: 'Temel tarafta zayıf halkalar olabilir. Bilanço kalemleri dikkatle okunmalı.'
  },
  risk: {
    high: 'Risk dengesi daha kontrollü. Oynaklık ve kırılganlık baskısı nispeten düşük.',
    medium: 'Risk orta seviyede. Getiri beklentisiyle birlikte dikkatli izlenmeli.',
    low: 'Risk baskısı yüksek. Sert hareketler ve belirsizlik daha belirgin olabilir.'
  },
  overall: {
    high: 'Genel tablo olumlu. Teknik, temel ve risk verileri birbirini daha çok destekliyor.',
    medium: 'Genel sonuç karışık. Tek bir alana bakıp karar vermek yerine tablo bütün okunmalı.',
    low: 'Genel görünüm zayıf. Veriler şu an daha temkinli kalınması gerektiğini söylüyor.'
  }
}

function getMetricLevel(score, isRisk = false) {
  if (isRisk) {
    if (score >= 70) return 'high'
    if (score >= 45) return 'medium'
    return 'low'
  }

  if (score >= 65) return 'high'
  if (score >= 45) return 'medium'
  return 'low'
}

function getMetricTone(score, isRisk = false) {
  const level = getMetricLevel(score, isRisk)

  if (isRisk) {
    if (level === 'high') {
      return {
        label: 'Kontrollü',
        badgeClass: 'border-green-500/20 bg-green-500/10 text-green-400',
        barClass: 'bg-green-500'
      }
    }

    if (level === 'medium') {
      return {
        label: 'Dengeli',
        badgeClass: 'border-yellow-500/20 bg-yellow-500/10 text-yellow-400',
        barClass: 'bg-yellow-500'
      }
    }

    return {
        label: 'Kırılgan',
      badgeClass: 'border-red-500/20 bg-red-500/10 text-red-400',
      barClass: 'bg-red-500'
    }
  }

  if (level === 'high') {
    return {
      label: 'Güçlü',
      badgeClass: 'border-green-500/20 bg-green-500/10 text-green-400',
      barClass: 'bg-green-500'
    }
  }

  if (level === 'medium') {
    return {
      label: 'Karışık',
      badgeClass: 'border-yellow-500/20 bg-yellow-500/10 text-yellow-400',
      barClass: 'bg-yellow-500'
    }
  }

  return {
    label: 'Zayıf',
    badgeClass: 'border-red-500/20 bg-red-500/10 text-red-400',
    barClass: 'bg-red-500'
  }
}

function getScoreColor(score) {
  if (score >= 70) return 'text-green-500'
  if (score >= 50) return 'text-yellow-500'
  return 'text-red-500'
}

function getScoreLabel(score) {
  if (score >= 80) return 'ÇOK GÜÇLÜ'
  if (score >= 65) return 'GÜÇLÜ'
  if (score >= 50) return 'ORTA'
  if (score >= 35) return 'ZAYIF'
  return 'ÇOK ZAYIF'
}

function getTrendIcon(status) {
  if (status === 'up') return <TrendingUp className="w-4 h-4 text-green-500" />
  if (status === 'down') return <TrendingDown className="w-4 h-4 text-red-500" />
  return <Activity className="w-4 h-4 text-yellow-500" />
}

function formatMetricValue(value, digits = 2) {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'string') return value

  return Number(value).toLocaleString('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  })
}

function formatTimestamp(value) {
  if (!value) return null

  return new Date(value).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getPlainLanguageSummary(analysis) {
  const overallLevel = getMetricLevel(analysis.overallScore)
  const technicalLevel = getMetricLevel(analysis.technicalScore)
  const fundamentalLevel = getMetricLevel(analysis.fundamentalScore)
  const riskLevel = getMetricLevel(analysis.riskScore, true)

  const overallText = {
    high: 'Genel görünüm olumlu.',
    medium: 'Genel görünüm karışık.',
    low: 'Genel görünüm temkinli okunmalı.'
  }[overallLevel]

  const technicalText = {
    high: 'Teknik tarafta alıcı lehine bir ivme var.',
    medium: 'Teknik tarafta net bir üstünlük yok.',
    low: 'Teknik tarafta zayıflık baskın.'
  }[technicalLevel]

  const fundamentalText = {
    high: 'Temel yapıda daha sağlam sinyaller görülüyor.',
    medium: 'Temel veriler orta güçte.',
    low: 'Temel tarafta dikkat isteyen noktalar var.'
  }[fundamentalLevel]

  const riskText = {
    high: 'Risk dengesi daha kontrollü.',
    medium: 'Risk orta seviyede.',
    low: 'Risk baskısı yüksek.'
  }[riskLevel]

  return `${overallText} ${technicalText} ${fundamentalText} ${riskText}`
}

export default function HisseAISkor() {
  const [searchSymbol, setSearchSymbol] = useState('')
  const [assetType, setAssetType] = useState('stock') // 'stock' | 'crypto'
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const quickSymbols = ['THYAO', 'GARAN', 'ASELS', 'SISE', 'TCELL', 'AKBNK', 'EREGL', 'KCHOL']

  const analyzeStock = async (symbol, forceType) => {
    if (!symbol) return
    const type = forceType || assetType
    setLoading(true)
    setError(null)

    try {
      const typeParam = type === 'crypto' ? '?type=crypto' : ''
      const response = await fetch(`${API_BASE}/analysis/ai-score/${symbol.toUpperCase()}${typeParam}`)

      if (!response.ok) {
        throw new Error('Hisse bulunamadı')
      }

      const data = await response.json()

      // Trend analizi ekle
      const trends = {
        hourly: {
          status: data.indicators?.rsi > 50 ? 'up' : data.indicators?.rsi < 50 ? 'down' : 'neutral',
          label: data.indicators?.rsi > 50 ? 'Yükseliş eğilimi' : data.indicators?.rsi < 50 ? 'Düşüş eğilimi' : 'Yatay'
        },
        daily: {
          status: data.technicalScore > 50 ? 'up' : data.technicalScore < 50 ? 'down' : 'neutral',
          label: data.technicalScore > 50 ? 'Yükseliş eğilimi' : data.technicalScore < 50 ? 'Düşüş eğilimi' : 'Yatay'
        },
        weekly: {
          status: data.fundamentalScore > 50 ? 'up' : 'neutral',
          label: data.fundamentalScore > 50 ? 'Temel görünüm güçlü' : 'Temel görünüm orta'
        },
        monthly: {
          status: data.overallScore > 60 ? 'up' : data.overallScore < 40 ? 'down' : 'neutral',
          label: data.overallScore > 60 ? 'Genel tablo pozitif' : data.overallScore < 40 ? 'Genel tablo zayıf' : 'Nötr'
        }
      }

      // Radar data hesapla
      const vol = data.indicators?.volume || 0
      const volSMA = data.indicators?.volumeSMA20 || 1
      const volRatio = volSMA > 0 ? vol / volSMA : 1
      // Hacim desteği: ortalamaya göre normalize et (0-100 arası)
      // 2x+ hacim → 100, 0.5x- → 20, 1x → 60
      const hacimDestegi = Math.min(100, Math.max(0, Math.round(20 + (volRatio - 0.5) * (80 / 1.5))))
      const radarData = {
        trend: Math.min(100, Math.max(0, data.technicalScore + 10)),
        momentum: data.indicators?.rsi || 50,
        hacimDestegi,
        temelyapi: data.fundamentalScore,
        risk: 100 - data.riskScore
      }

      setAnalysis({
        ...data,
        trends,
        radarData
      })

    } catch (err) {
      console.error('Analiz hatası:', err)
      setError(err.message || 'Analiz yapılamadı')
    } finally {
      setLoading(false)
    }
  }

  const scoreCards = analysis
    ? [
        {
          title: 'Teknik Skor',
          description: 'Fiyat trendi, momentum ve teknik göstergelerin özeti.',
          icon: <Target className="w-4 h-4" />,
          score: analysis.technicalScore,
          max: 100,
          insight: SCORE_INSIGHTS.technical[getMetricLevel(analysis.technicalScore)]
        },
        {
          title: 'Temel Skor',
          description: 'Bilanço kalitesi, kârlılık ve değerleme yapısını toplar.',
          icon: <TrendingUp className="w-4 h-4" />,
          score: analysis.fundamentalScore,
          max: 100,
          insight: SCORE_INSIGHTS.fundamental[getMetricLevel(analysis.fundamentalScore)]
        },
        {
          title: 'Risk Dengesi',
          description: 'Belirsizlik, oynaklık ve kırılganlık seviyesini okur.',
          icon: <Shield className="w-4 h-4" />,
          score: analysis.riskScore,
          max: 100,
          isRisk: true,
          insight: SCORE_INSIGHTS.risk[getMetricLevel(analysis.riskScore, true)]
        },
        {
          title: 'Genel AI Skoru',
          description: 'Teknik, temel ve risk verilerinin tek puandaki özeti.',
          icon: <Zap className="w-4 h-4" />,
          score: analysis.overallScore,
          max: 100,
          insight: SCORE_INSIGHTS.overall[getMetricLevel(analysis.overallScore)]
        }
      ]
    : []

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto">
        <div className="inline-flex items-center space-x-2 bg-green-500/20 text-green-500 px-4 py-2 rounded-full text-sm font-medium mb-4">
          <Zap className="w-4 h-4" />
        <span>AI Engine Aktif - Gerçek Veri</span>
        </div>

        <h1 className="text-3xl font-bold text-white mb-2">Hisse AI Skor Analizi</h1>
        <p className="text-gray-400">
          Yapay zeka destekli kapsamlı hisse analizi. Skor kartları ve açıklamalar ilk kez bakan
          kullanıcı için daha sade hale getirildi.
        </p>
      </div>

      {/* Varlık Tipi Toggle */}
      <div className="mx-auto flex max-w-2xl flex-wrap justify-center gap-2">
        <button
          onClick={() => { setAssetType('stock'); setAnalysis(null); setError(null) }}
          className={`flex min-w-[140px] flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all sm:flex-none ${assetType === 'stock' ? 'bg-gold-500 text-dark-950' : 'bg-dark-800 text-gray-400 hover:text-white'}`}
        >
          📈 BIST Hisseleri
        </button>
        <button
          onClick={() => { setAssetType('crypto'); setAnalysis(null); setError(null) }}
          className={`flex min-w-[140px] flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all sm:flex-none ${assetType === 'crypto' ? 'bg-orange-500 text-white' : 'bg-dark-800 text-gray-400 hover:text-white'}`}
        >
          🪙 Kripto Paralar
        </button>
      </div>

      {/* Search */}
      <div className="max-w-2xl mx-auto">
        <div className="rounded-xl border border-dark-700 bg-dark-800 p-4 md:p-6">
          <label className="block text-sm font-medium text-gray-400 mb-3">
            {assetType === 'crypto' ? '🪙 KRİPTO SEMBOL (ÖRN: BTC, ETH)' : 'HİSSE KODU (ÖRN: THYAO)'}
          </label>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type="text"
                placeholder={assetType === 'crypto' ? 'Kripto sembol (BTC, ETH, SOL...)' : 'Hisse kodu giriniz...'}
                value={searchSymbol}
                onChange={(e) => setSearchSymbol(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && analyzeStock(searchSymbol)}
                className="w-full bg-dark-900 border border-dark-600 rounded-lg pl-11 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
              />
            </div>
            <button
              onClick={() => analyzeStock(searchSymbol)}
              disabled={!searchSymbol || loading}
              className={`rounded-lg px-6 py-3 font-medium text-white transition-colors disabled:cursor-not-allowed disabled:bg-dark-700 sm:px-8 ${assetType === 'crypto' ? 'bg-orange-600 hover:bg-orange-500' : 'bg-primary-600 hover:bg-primary-700'}`}
            >
              {loading ? 'Analiz Ediliyor...' : 'Analiz Et'}
            </button>
          </div>

          {/* Quick Symbols */}
          <div className="mt-4">
            <p className="text-xs text-gray-500 mb-2">Hızlı Erişim:</p>
            <div className="flex flex-wrap gap-2">
              {(assetType === 'crypto' ? CRYPTO_QUICK : quickSymbols).map((symbol) => (
                <button
                  key={symbol}
                  onClick={() => { setSearchSymbol(symbol); analyzeStock(symbol, assetType); }}
                  className={`px-3 py-1.5 rounded text-sm font-mono text-gray-300 hover:text-white transition-colors ${assetType === 'crypto' ? 'bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/30 text-orange-300' : 'bg-dark-700 hover:bg-primary-600'}`}
                >
                  {symbol}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="max-w-2xl mx-auto bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-12">
          <div className="inline-block">
            <div className="w-16 h-16 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-400">AI analiz yapılıyor... Gerçek veriler hesaplanıyor.</p>
          </div>
        </div>
      )}

      {/* Analysis Result */}
      {analysis && !loading && (
        <div className="space-y-6 max-w-6xl mx-auto">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_320px]">
            <div className="rounded-2xl border border-dark-700 bg-dark-800 p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-3">
                    <h2 className="text-3xl font-bold text-white">{analysis.symbol}</h2>
                    <span className="rounded bg-primary-500/20 px-2 py-1 text-sm text-primary-400">
                      {analysis.sector || 'Sektor bilgisi yok'}
                    </span>
                  </div>
                  <p className="text-gray-400">{analysis.name}</p>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <span className="text-2xl font-bold text-white">
                      {analysis.currentPrice != null
                        ? `${analysis.currentPrice.toLocaleString('tr-TR', {
                            maximumFractionDigits: analysis.currentPrice < 1 ? 6 : 2
                          })} ${analysis.isCrypto ? '$' : 'TL'}`
                        : 'Fiyat mevcut değil'}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-sm font-semibold ${
                        analysis.recommendation === 'AL'
                          ? 'bg-green-500/20 text-green-500'
                          : analysis.recommendation === 'SAT'
                            ? 'bg-red-500/20 text-red-500'
                            : 'bg-yellow-500/20 text-yellow-500'
                      }`}
                    >
                      AI ÖNERİ: {analysis.recommendation}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                    {analysis.lastUpdate && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTimestamp(analysis.lastUpdate)}
                      </span>
                    )}
                    {analysis.dataSource && (
                      <span className="flex items-center gap-1">
                        <Database className="w-3 h-3" />
                        {analysis.dataSource}
                      </span>
                    )}
                    {analysis.dataQuality && (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          analysis.dataQuality === 'real'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-yellow-500/20 text-yellow-400'
                        }`}
                      >
                        {analysis.dataQuality === 'real' ? 'Gerçek Veri' : 'Tahmini'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-primary-500/20 bg-primary-500/5 p-4">
                <div className="flex items-start gap-3">
                  <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary-400" />
                  <div>
                    <p className="text-sm font-semibold text-white">Bu analiz ne söylüyor?</p>
                    <p className="mt-1 text-sm leading-6 text-gray-400">{getPlainLanguageSummary(analysis)}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center rounded-2xl border border-dark-700 bg-dark-800 p-6 text-center">
              <div className="relative">
                <svg className="h-28 w-28 md:h-[140px] md:w-[140px]" viewBox="0 0 140 140">
                  <circle cx="70" cy="70" r="60" fill="none" stroke="#1e293b" strokeWidth="12" />
                  <circle
                    cx="70"
                    cy="70"
                    r="60"
                    fill="none"
                    stroke={analysis.overallScore >= 65 ? '#22c55e' : analysis.overallScore >= 45 ? '#eab308' : '#ef4444'}
                    strokeWidth="12"
                    strokeDasharray={`${(analysis.overallScore / 100) * 377} 377`}
                    strokeLinecap="round"
                    transform="rotate(-90 70 70)"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-bold text-white">{analysis.overallScore}</span>
                  <span className={`text-xs font-semibold ${getScoreColor(analysis.overallScore)}`}>
                    {getScoreLabel(analysis.overallScore)}
                  </span>
                </div>
              </div>

              <h3 className="mt-4 text-lg font-semibold text-white">Genel AI Skoru</h3>
              <p className="mt-2 text-sm leading-6 text-gray-400">
                Teknik görünüm, temel kalite ve risk dengesinin tek bakışta özetidir.
              </p>

              <div className="mt-4 w-full space-y-2">
                {SCORE_GUIDE.map((item) => (
                  <div key={item.title} className={`rounded-xl border px-3 py-2 text-left ${item.className}`}>
                    <div className="text-xs font-semibold">{item.title}</div>
                    <div className="mt-1 text-[11px] leading-5 text-gray-300">{item.description}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {scoreCards.map((card) => (
              <ScoreCard
                key={card.title}
                icon={card.icon}
                title={card.title}
                description={card.description}
                score={card.score}
                max={card.max}
                isRisk={card.isRisk}
                insight={card.insight}
              />
            ))}
          </div>

          <div className="rounded-2xl border border-dark-700 bg-dark-800 p-4">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary-400" />
              <div>
                <h3 className="text-sm font-semibold text-white">Skorlar nasıl okunur?</h3>
                <p className="mt-1 text-xs leading-5 text-gray-400">
                  Teknik, Temel ve Genel kartlarında yüksek puan daha olumlu kabul edilir. Risk
                  Dengesi kartında da yüksek puan daha kontrollü riski anlatır. Aşağıdaki radar
                  bölümündeki Risk Baskısı alanında ise tersine, düşük değer daha sağlıklıdır.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <DetailPanel
              icon={<BarChart3 className="h-4 w-4 text-primary-500" />}
              title="Teknik Göstergeler"
              description="RSI, MACD ve EMA verileri kısa vadeli fiyat davranışını anlamaya yardım eder."
            >
              <div className="space-y-2.5">
                <IndicatorRow
                  label="RSI (14)"
                  value={analysis.indicators?.rsi?.toFixed(1)}
                  status={
                    analysis.indicators?.rsi < 30
                      ? 'oversold'
                      : analysis.indicators?.rsi > 70
                        ? 'overbought'
                        : 'neutral'
                  }
                />
                <IndicatorRow
                  label="MACD"
                  value={analysis.indicators?.macd?.toFixed(3)}
                  status={analysis.indicators?.macd > analysis.indicators?.macdSignal ? 'positive' : 'negative'}
                />
                <IndicatorRow label="EMA 21" value={analysis.indicators?.ema21?.toFixed(2)} />
                <IndicatorRow label="EMA 50" value={analysis.indicators?.ema50?.toFixed(2)} />
              </div>
            </DetailPanel>

            <DetailPanel
              icon={<Activity className="h-4 w-4 text-primary-500" />}
              title="Üretilen Sinyaller"
              description="Algoritmanın en belirgin al, sat veya nötr sinyallerini hızlı tarama için özetler."
            >
              <div className="space-y-2">
                {analysis.signals?.length ? (
                  analysis.signals.slice(0, 4).map((signal, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2 rounded-lg bg-dark-700 px-3 py-2">
                      <span className="truncate text-xs text-gray-400">{signal.indicator}</span>
                      <span
                        className={`shrink-0 text-xs font-semibold ${
                          signal.signal?.toLowerCase().includes('al') || signal.signal?.includes('Yuksel')
                            ? 'text-green-500'
                            : signal.signal?.toLowerCase().includes('sat') || signal.signal?.includes('Dusus')
                              ? 'text-red-500'
                              : 'text-yellow-500'
                        }`}
                      >
                        {signal.signal}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500">Bu hisse için ek sinyal bilgisi yok.</p>
                )}
              </div>
            </DetailPanel>

            <DetailPanel
              icon={<TrendingUp className="h-4 w-4 text-primary-500" />}
              title="Trend Özeti"
              description="Farklı zaman pencerelerinde yön eğilimini basit dille gösterir."
            >
              <div className="space-y-2.5">
                {Object.entries(analysis.trends || {}).map(([period, data]) => (
                  <div key={period} className="flex items-center justify-between gap-3">
                    <span className="text-xs text-gray-400">{PERIOD_LABELS[period] || period}</span>
                    <div className="flex items-center gap-1.5">
                      {getTrendIcon(data.status)}
                      <span
                        className={`text-xs font-semibold ${
                          data.status === 'up'
                            ? 'text-green-500'
                            : data.status === 'down'
                              ? 'text-red-500'
                              : 'text-yellow-500'
                        }`}
                      >
                        {data.label}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </DetailPanel>
          </div>

          <div className="rounded-2xl border border-dark-700 bg-dark-800 p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-white">Temel Analiz Metrikleri</h3>
              <p className="mt-1 text-xs leading-5 text-gray-400">
                Bu bölüm şirketin finansal sağlığını farklı açılardan ölçer. Her kartta "bu neyi
                anlatır?" ve "nasıl yorumlanır?" bilgisi bulunur.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <FundamentalItem
                label="Altman Z-Score"
                description="Finansal sikinti riskini olcer."
                readingHint="Yüksek değer genelde daha güven verici kabul edilir."
                value={analysis.fundamentals?.altmanZScore}
                interpretation={analysis.fundamentals?.altmanInterpretation}
                good={analysis.fundamentals?.altmanZScore > 2.99}
              />
              <FundamentalItem
                label="Piotroski F-Score"
                description="Bilanço kalitesini 9 adımda puanlar."
                readingHint="9'a yaklaştıkça finansal kalite artmış sayılır."
                value={
                  analysis.fundamentals?.piotroskiFScore !== undefined &&
                  analysis.fundamentals?.piotroskiFScore !== null
                    ? `${analysis.fundamentals.piotroskiFScore}/9`
                    : null
                }
                interpretation={analysis.fundamentals?.piotroskiInterpretation}
                good={analysis.fundamentals?.piotroskiFScore >= 7}
              />
              <FundamentalItem
                label="Beneish M-Score"
                description="Kar manipulasyonu riskine bakar."
                readingHint="-2.22 altindaki degerler genelde daha olumlu okunur."
                value={analysis.fundamentals?.beneishMScore}
                interpretation={analysis.fundamentals?.beneishInterpretation}
                good={analysis.fundamentals?.beneishMScore < -2.22}
              />
              <FundamentalItem
                label="F/K Orani"
                description="Fiyatın kâra göre pahalı mı ucuz mu olduğunu gösterir."
                readingHint="Düşük değer bazen daha makul fiyatlama anlamına gelebilir."
                value={analysis.fundamentals?.priceToEarnings}
                good={analysis.fundamentals?.priceToEarnings < 15}
              />
              <FundamentalItem
                label="PD/DD"
                description="Piyasa değerinin özkaynaklara oranıdır."
                readingHint="Sektöre göre değişir, tek başına karar kriteri değildir."
                value={analysis.fundamentals?.priceToBook}
                good={analysis.fundamentals?.priceToBook < 2}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-dark-700 bg-dark-800 p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-white">Hızlı Radar Özeti</h3>
              <p className="mt-1 text-xs leading-5 text-gray-400">
                Trend, Momentum, Hacim Desteği ve Temel Yapı kartlarında yüksek değer daha
                olumludur. Risk Baskısı tarafında ise düşük değer daha sağlıklı kabul edilir.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <RadarItem label="Trend" hint="Yüksek daha iyi" value={analysis.radarData?.trend} />
              <RadarItem label="Momentum" hint="Yüksek daha iyi" value={analysis.radarData?.momentum} />
              <RadarItem label="Hacim Desteği" hint="Yüksek daha iyi" value={analysis.radarData?.hacimDestegi} />
              <RadarItem label="Temel Yapı" hint="Yüksek daha iyi" value={analysis.radarData?.temelyapi} />
              <RadarItem label="Risk Baskısı" hint="Düşük daha iyi" value={analysis.radarData?.risk} isDanger />
            </div>
          </div>

          <div className="rounded-2xl border border-dark-700 bg-dark-800 p-5">
            <div className="mb-4 flex items-center gap-2">
              <Info className="h-4 w-4 text-primary-500" />
              <h3 className="text-sm font-semibold text-white">Terimler Ne Anlama Geliyor?</h3>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {TERM_EXPLANATIONS.map((item) => (
                <ExplanationCard
                  key={item.title}
                  title={item.title}
                  description={item.description}
                  hint={item.hint}
                />
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
            <p className="text-center text-sm leading-6 text-gray-400">
              <strong className="text-yellow-500">ÖNEMLİ:</strong> Bu analizler eğitim amaçlıdır
              ve yatırım tavsiyesi değildir. Nihai kararı vermeden önce kendi araştırmanızı yapmanız
              gerekir.
            </p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!analysis && !loading && !error && (
        <div className="text-center py-12">
          <div className="w-32 h-32 bg-dark-800 rounded-full mx-auto mb-4 flex items-center justify-center">
            <Search className="w-16 h-16 text-gray-600" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">Analiz Bekleniyor</h3>
          <p className="text-gray-400">Yapay zeka destekli detaylı analiz için hisse kodu girin</p>
        </div>
      )}
    </div>
  )
}

function ScoreCard({ icon, title, description, score, max, insight, isRisk = false }) {
  const safeScore = score || 0
  const percentage = Math.min(100, Math.max(0, (safeScore / max) * 100))
  const tone = getMetricTone(safeScore, isRisk)

  return (
    <div className="h-full rounded-2xl border border-dark-700 bg-dark-800 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="shrink-0 rounded-xl bg-primary-500/10 p-2 text-primary-400">{icon}</div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            <p className="mt-1 text-xs leading-5 text-gray-400">{description}</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tone.badgeClass}`}>
          {tone.label}
        </span>
      </div>

      <div className="mt-4">
        <div className="text-3xl font-bold text-white">{safeScore}</div>
        <div className="text-xs text-gray-500">/ {max}</div>
      </div>

      <div className="mt-3 h-2 rounded-full bg-dark-700 overflow-hidden">
        <div className={`h-full ${tone.barClass}`} style={{ width: `${percentage}%` }}></div>
      </div>

      <p className="mt-3 text-xs leading-5 text-gray-400">{insight}</p>
    </div>
  )
}

function DetailPanel({ icon, title, description, children }) {
  return (
    <div className="rounded-2xl border border-dark-700 bg-dark-800 p-4">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-sm font-semibold text-white">{title}</h3>
        </div>
        <p className="mt-1 text-xs leading-5 text-gray-400">{description}</p>
      </div>
      {children}
    </div>
  )
}

function IndicatorRow({ label, value, status }) {
  const textClass =
    status === 'oversold' || status === 'positive'
      ? 'text-green-500'
      : status === 'overbought' || status === 'negative'
        ? 'text-red-500'
        : 'text-white'

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-gray-400">{label}</span>
      <span className={`text-sm font-semibold ${textClass}`}>{value || '-'}</span>
    </div>
  )
}

function FundamentalItem({ label, description, readingHint, value, interpretation, good }) {
  return (
    <div className="h-full rounded-xl border border-dark-600/80 bg-dark-700 p-3">
      <p className="text-sm font-semibold text-white">{label}</p>
      <p className="mt-1 text-xs leading-5 text-gray-400">{description}</p>
      <p className={`mt-3 text-2xl font-bold ${good ? 'text-green-500' : 'text-white'}`}>
        {formatMetricValue(value)}
      </p>
      {interpretation && <p className="mt-1 text-xs leading-5 text-gray-400">{interpretation}</p>}
      <p className="mt-3 text-[11px] leading-5 text-gray-500">{readingHint}</p>
    </div>
  )
}

function RadarItem({ label, value, hint, isDanger = false }) {
  const displayValue = Math.round(value || 0)
  const isGood = isDanger ? displayValue < 30 : displayValue >= 60
  const badgeClass = isDanger
    ? isGood
      ? 'border-green-500/20 bg-green-500/10 text-green-400'
      : displayValue < 60
        ? 'border-yellow-500/20 bg-yellow-500/10 text-yellow-400'
        : 'border-red-500/20 bg-red-500/10 text-red-400'
    : isGood
      ? 'border-green-500/20 bg-green-500/10 text-green-400'
      : displayValue >= 40
        ? 'border-yellow-500/20 bg-yellow-500/10 text-yellow-400'
        : 'border-red-500/20 bg-red-500/10 text-red-400'

  const badgeLabel = isDanger
    ? isGood
      ? 'Düşük risk'
      : displayValue < 60
        ? 'Orta risk'
        : 'Yüksek risk'
    : isGood
      ? 'Güçlü'
      : displayValue >= 40
        ? 'Orta'
        : 'Zayıf'

  const valueClass = isDanger
    ? isGood
      ? 'text-green-500'
      : displayValue < 60
        ? 'text-yellow-500'
        : 'text-red-500'
    : isGood
      ? 'text-green-500'
      : displayValue >= 40
        ? 'text-yellow-500'
        : 'text-red-500'

  return (
    <div className="h-full rounded-xl border border-dark-600/80 bg-dark-700 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{label}</p>
          <p className="mt-1 text-[11px] text-gray-500">{hint}</p>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${badgeClass}`}>
          {badgeLabel}
        </span>
      </div>

      <div className={`mt-4 text-3xl font-bold ${valueClass}`}>{displayValue}</div>
    </div>
  )
}

function ExplanationCard({ title, description, hint }) {
  return (
    <div className="rounded-xl border border-dark-600/80 bg-dark-700 p-3">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-2 text-xs leading-5 text-gray-400">{description}</p>
      <p className="mt-3 text-[11px] leading-5 text-gray-500">{hint}</p>
    </div>
  )
}
