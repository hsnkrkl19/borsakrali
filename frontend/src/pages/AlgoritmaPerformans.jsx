import { useState, useEffect } from 'react'
import { Trophy, TrendingUp, Target, BarChart3, RefreshCw, Award, Users, Clock, Zap } from 'lucide-react'
import InfoTooltip from '../components/InfoTooltip'

import { getApiBase } from '../config'
const API_BASE = getApiBase() + '/api'

const STRATEGY_TIPS = {
  'EMA Crossover': {
    title: 'EMA Crossover (EMA Kesişimi)',
    description: 'Kısa vadeli EMA, uzun vadeli EMA\'yı yukarı kestiğinde alış (Golden Cross), aşağı kestiğinde satış (Death Cross) sinyali üretir. Trend takip eden bir stratejidir.',
    formula: 'EMA(k) = Fiyat × (2/(k+1)) + öncekiEMA × (1-2/(k+1))\n\nAlış: EMA9 > EMA21 (yukarı kesişim)\nSatış: EMA9 < EMA21 (aşağı kesişim)\n\nGolden Cross: EMA50 > EMA200\nDeath Cross: EMA50 < EMA200',
    source: 'Standart teknik analiz — EMA Crossover sistemi'
  },
  'RSI Signal': {
    title: 'RSI Sinyal Stratejisi',
    description: 'RSI aşırı satım bölgesine (30 altı) düşünce alış, aşırı alım bölgesine (70 üstü) çıkınca satış sinyali verir. Ortalamaya dönüş (mean reversion) stratejisidir.',
    formula: 'RSI = 100 - 100/(1 + RS)\nRS = AvgGain / AvgLoss (14 periyot, Wilder smoothing)\n\nAlış: RSI < 30 → Aşırı Satım\nSatış: RSI > 70 → Aşırı Alım\nNötr: 30 ≤ RSI ≤ 70',
    source: 'J. Welles Wilder — RSI (1978)'
  },
  'MACD Crossover': {
    title: 'MACD Kesişim Stratejisi',
    description: 'MACD çizgisi sinyal çizgisini yukarı kestiğinde alış, aşağı kestiğinde satış sinyali verir. Hem trend hem momentum bilgisi içerir.',
    formula: 'MACD = EMA12 - EMA26\nSignal = EMA9(MACD)\nHistogram = MACD - Signal\n\nAlış: MACD > Signal (yukarı kesişim)\nSatış: MACD < Signal (aşağı kesişim)\nZero Cross: Histogram sıfırı geçince güçlü sinyal',
    source: 'Gerald Appel — MACD (1970\'ler)'
  },
  'Bollinger Breakout': {
    title: 'Bollinger Kırılım Stratejisi',
    description: 'Fiyat Bollinger Bantlarının dışına kırıldığında kırılım yönünde sinyal verir. Genişleyen bantlar artan volatilite ve trend başlangıcını gösterir.',
    formula: 'SMA20 = son 20 günün ortalaması\nStdDev = √(Σ(x-SMA)²/(n-1))\nÜst = SMA + 2×StdDev\nAlt = SMA - 2×StdDev\n\nAlış: Fiyat > Üst Bant (breakout)\nSatış: Fiyat < Alt Bant (breakdown)\nBant genişliği < %10 → Kırılım yakın',
    source: 'John Bollinger — Bollinger Bands (1980\'ler)'
  },
  'Volume Spike': {
    title: 'Hacim Artışı (Volume Spike) Stratejisi',
    description: 'İşlem hacminin ortalamanın belirli katlarına çıkması kurumsal para girişini/çıkışını gösterir. Hacim artışı + fiyat artışı = güçlü alış sinyali.',
    formula: 'OrtalamaHacim = son 20 günün ortalama hacmi\nSpike = AnlıkHacim / OrtalamaHacim\n\nAlış: Spike ≥ 2.0 VE Fiyat Artıyor\nGüçlü: Spike ≥ 3.0 VE Fiyat > EMA20\nPanic Sell: Spike ≥ 2.0 VE Fiyat Düşüyor → Olası dip',
    source: 'OBV (On Balance Volume) + Volume Analysis'
  },
}

const METRIC_TIPS = {
  successRate: {
    title: 'Başarı Oranı',
    description: 'Sinyal üretildikten sonra hedef yönde hareket eden işlemlerin yüzdesidir. %50 üzeri olumlu kabul edilir, ancak ortalama getiri de önemlidir.',
    formula: 'Başarı Oranı = (Pozitif Sonuçlanan / Toplam Sinyal) × 100\n\nÖnemli Not: %60 başarı oranı ile %3 kayıp,\n%40 başarı oranı ile %8 kazanç → İkincisi daha karlı!',
    source: 'Strateji backtest — Borsa Krali'
  },
  avgReturn: {
    title: 'Ortalama Getiri',
    description: 'Strateji tarafından üretilen tüm sinyallerin ortalama fiyat değişimini gösterir. Pozitif değer ortalamada kazandırdığını gösterir.',
    formula: 'AvgReturn = Σ(Sinyal Getirisi) / Sinyal Sayısı\nGetiri = (ExitFiyatı - EntryFiyatı) / EntryFiyatı × 100\n\nBeklenen Değer = Başarı% × AvgWin - (1-Başarı%) × AvgLoss',
    source: 'Borsa Krali backtest motoru'
  },
}

export default function AlgoritmaPerformans() {
  const [activeTab, setActiveTab] = useState('vitrin')
  const [loading, setLoading] = useState(true)
  const [performanceData, setPerformanceData] = useState(null)

  const tabs = [
    { id: 'vitrin', label: 'Vitrin' },
    { id: 'analitik', label: 'Analitik' },
    { id: 'aktif', label: 'Aktif Takip' },
    { id: 'sonlanan', label: 'Sonlanan' }
  ]

  useEffect(() => {
    fetchPerformanceData()
  }, [])

  const fetchPerformanceData = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/market/algorithm-performance`)
      const data = await response.json()
      setPerformanceData(data)
    } catch (error) {
      console.error('Performans verisi hatası:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Algoritma Performans</h1>
          <p className="text-gray-400 text-sm mt-1">Teknik analiz taramalarının performans takibi</p>
        </div>
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 text-primary-500 animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Ne Yapar? Açıklama Kartı */}
      <div className="bg-primary-500/5 border border-primary-500/20 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <BarChart3 className="w-5 h-5 text-primary-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-primary-300 font-medium text-sm mb-1">Bu sayfa ne gösterir?</p>
            <p className="text-gray-400 text-xs leading-relaxed">
              <strong className="text-white">Algoritma Performans</strong> sayfası, sistemin ürettiği al/sat sinyallerinin
              gerçek fiyat hareketlerine göre performansını takip eder.
              <span className="text-white"> Vitrin</span> sekmesi günün en iyi getirisi olan hisseleri gösterir.
              <span className="text-white"> Analitik</span> sekmesinde her stratejinin başarı oranı ve ortalama getirisi listelenir.
              <span className="text-white"> Aktif Takip</span> sekmesinde şu an açık olan sinyaller,
              <span className="text-white"> Sonlanan</span> sekmesinde tamamlanmış sinyaller görülür.
              {(performanceData?.summary?.totalSignals === 0 || !performanceData?.summary?.totalSignals) && (
                <span className="block mt-1 text-yellow-400">⚠️ Şu an aktif sinyal yok — sistem taramaları tamamlandıkça veriler burada görünecek.</span>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">Algoritma Performans <InfoTooltip size="lg" title="Algoritma Performans Takibi" description="Teknik analiz stratejilerinin geçmiş sinyal başarı oranlarını ve ortalama getirilerini gösterir. Her strateji gerçek fiyat hareketleriyle kıyaslanarak değerlendirilir." formula="Başarı Oranı = Pozitif Kapanan / Toplam Sinyal × 100\nOrtalama Getiri = Σ(Sinyal Getirisi) / Sinyal Sayısı\n\nDeğerlendirme: >60% başarı + >%2 ort. getiri = Güçlü strateji" source="Borsa Krali — Backtest Motoru" /></h1>
          <p className="text-gray-400 text-sm mt-1">Teknik analiz taramalarının performans takibi</p>
        </div>
        <button
          onClick={fetchPerformanceData}
          disabled={loading}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 sm:px-4 py-2 rounded-lg font-medium transition-colors text-sm sm:text-base ${activeTab === tab.id
                ? 'bg-primary-600 text-white'
                : 'bg-dark-800 text-gray-400 hover:text-white'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Özet Kartlar */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="card">
          <div className="text-primary-500 mb-2"><Target className="w-6 h-6" /></div>
          <div className="text-3xl font-bold text-white mb-1">
            {performanceData?.summary?.activeTracks || 0}
          </div>
          <div className="text-xs text-gray-400">AKTİF TAKIP</div>
        </div>
        <div className="card">
          <div className="text-success-500 mb-2"><TrendingUp className="w-6 h-6" /></div>
          <div className="text-3xl font-bold text-success-500 mb-1">
            {performanceData?.summary?.totalSuccessful || 0} (%{performanceData?.summary?.successRate || 0})
          </div>
          <div className="text-xs text-gray-400 flex items-center gap-1">POZİTİF OLAN <InfoTooltip {...METRIC_TIPS.successRate} /></div>
        </div>
        <div className="card">
          <div className="text-warning-500 mb-2"><Trophy className="w-6 h-6" /></div>
          <div className="text-3xl font-bold text-white mb-1">%{performanceData?.summary?.totalReturn || 0}</div>
          <div className="text-xs text-gray-400">TOPLAM DEĞİŞİM</div>
        </div>
        <div className="card">
          <div className="text-primary-500 mb-2"><BarChart3 className="w-6 h-6" /></div>
          <div className="text-3xl font-bold text-white mb-1">%{performanceData?.summary?.avgReturn || 0}</div>
          <div className="text-xs text-gray-400 flex items-center gap-1">ORTALAMA DEĞİŞİM <InfoTooltip {...METRIC_TIPS.avgReturn} /></div>
        </div>
      </div>

      {/* Vitrin - Şampiyon */}
      {activeTab === 'vitrin' && performanceData?.champion && (
        <>
          <div className="card">
            <h3 className="text-lg font-semibold text-white mb-4">🏆 BU DÖNEMİN ŞAMPİYONU</h3>
            <div className="bg-gradient-to-r from-warning-500/20 to-warning-600/20 border border-warning-500/30 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-2xl font-bold text-white mb-2">{performanceData.champion.symbol}</h4>
                  <p className="text-sm text-gray-400">{performanceData.champion.strategy}</p>
                </div>
                <div className="text-right">
                  <div className="text-4xl font-bold text-success-500">+%{performanceData.champion.return}</div>
                  <p className="text-xs text-gray-400 mt-1">{performanceData.champion.days} gün</p>
                </div>
              </div>
            </div>
          </div>

          {/* Top Performers */}
          <div className="card">
            <h3 className="text-lg font-semibold text-white mb-4">🔥 En İyi Performanslar</h3>
            <div className="space-y-3">
              {performanceData.topPerformers?.map((performer, idx) => (
                <div key={idx} className="bg-dark-800 rounded-lg p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-primary-500/20 flex items-center justify-center text-primary-400 font-bold">
                      {idx + 1}
                    </div>
                    <div>
                      <p className="font-semibold text-white">{performer.symbol}</p>
                      <p className="text-xs text-gray-400">{performer.strategy}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${performer.return > 0 ? 'text-success-500' : 'text-danger-500'}`}>
                      +%{performer.return}
                    </p>
                    <p className="text-xs text-gray-400">{performer.days} gün</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Analitik - Strateji Detayları */}
      {activeTab === 'analitik' && (
        <div className="card">
          <h3 className="text-lg font-semibold text-white mb-4">📊 Strateji Performansları</h3>
          <div className="table-shell">
            <table className="w-full table-min-medium">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-dark-700">
                  <th className="pb-3 pr-4">Strateji</th>
                  <th className="pb-3 pr-4">Toplam Sinyal</th>
                  <th className="pb-3 pr-4">Başarılı</th>
                  <th className="pb-3 pr-4"><span className="flex items-center gap-1">Başarı Oranı <InfoTooltip {...METRIC_TIPS.successRate} /></span></th>
                  <th className="pb-3"><span className="flex items-center gap-1">Ort. Getiri <InfoTooltip {...METRIC_TIPS.avgReturn} /></span></th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {performanceData?.strategies?.map((strategy, idx) => (
                  <tr key={idx} className="border-b border-dark-800">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-primary-400" />
                        <span className="text-white font-medium">{strategy.name}</span>
                        {STRATEGY_TIPS[strategy.name] && <InfoTooltip {...STRATEGY_TIPS[strategy.name]} />}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-gray-400">{strategy.signals}</td>
                    <td className="py-3 pr-4 text-success-500">{strategy.successful}</td>
                    <td className="py-3 pr-4">
                      <span className={`px-2 py-1 rounded text-xs ${parseFloat(strategy.successRate) > 70
                          ? 'bg-success-500/20 text-success-500'
                          : 'bg-warning-500/20 text-warning-500'
                        }`}>
                        %{strategy.successRate}
                      </span>
                    </td>
                    <td className="py-3 text-success-500 font-medium">+%{strategy.avgReturn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Aktif Takip */}
      {activeTab === 'aktif' && (
        <div className="card">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary-400" />
            Aktif Takipteki Sinyaller
          </h3>
          <p className="text-gray-400 mb-4">
            Şu anda {performanceData?.summary?.activeTracks || 0} aktif sinyal takip edilmektedir.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {performanceData?.topPerformers?.slice(0, 6).map((item, idx) => (
              <div key={idx} className="bg-dark-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono font-bold text-primary-400">{item.symbol}</span>
                  <span className="text-xs bg-primary-500/20 text-primary-400 px-2 py-1 rounded">Aktif</span>
                </div>
                <p className="text-xs text-gray-400 mb-2">{item.strategy}</p>
                <div className="flex items-center justify-between">
                  <span className="text-success-500 font-semibold">+%{item.return}</span>
                  <span className="text-xs text-gray-500">{item.days} gün</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sonlanan */}
      {activeTab === 'sonlanan' && (
        <div className="card">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Award className="w-5 h-5 text-gray-400" />
            Sonlanan Sinyaller
          </h3>
          <p className="text-gray-400">
            Geçmiş dönemdeki sonlanmış sinyaller burada listelenir. Toplam {performanceData?.summary?.totalSignals || 0} sinyal tamamlandı.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="bg-success-500/10 border border-success-500/30 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-success-500">{performanceData?.summary?.totalSuccessful || 0}</p>
              <p className="text-sm text-gray-400">Pozitif Sonuçlanan</p>
            </div>
            <div className="bg-danger-500/10 border border-danger-500/30 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-danger-500">
                {(performanceData?.summary?.totalSignals || 0) - (performanceData?.summary?.totalSuccessful || 0)}
              </p>
              <p className="text-sm text-gray-400">Negatif Sonuçlanan</p>
            </div>
          </div>
        </div>
      )}

      {/* Son güncelleme */}
      <div className="text-center text-xs text-gray-500">
        Son güncelleme: {performanceData?.lastUpdate ? new Date(performanceData.lastUpdate).toLocaleString('tr-TR') : '-'}
      </div>
    </div>
  )
}
