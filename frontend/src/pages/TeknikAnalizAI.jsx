import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, Activity, TrendingUp, TrendingDown, ArrowUp, ArrowDown, Minus, AlertCircle, Clock } from 'lucide-react'
import StockChart from '../components/charts/StockChart'
import InfoTooltip from '../components/InfoTooltip'
import { getStoredTheme, getTradingViewTheme } from '../utils/theme'

// TradingView embed hook — kripto grafik için
import { useRef } from 'react'

const TV_CRYPTO_SYMBOLS = {
  TOTAL: 'CRYPTOCAP:TOTAL', TOTAL2: 'CRYPTOCAP:TOTAL2', TOTAL3: 'CRYPTOCAP:TOTAL3',
  USDT: 'CRYPTOCAP:USDT', USDC: 'CRYPTOCAP:USDC',
}
function getTVCryptoSymbol(sym) {
  if (TV_CRYPTO_SYMBOLS[sym]) return TV_CRYPTO_SYMBOLS[sym]
  return `BINANCE:${sym}USDT`
}

function CryptoTVChart({ symbol, height = 480 }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !symbol) return
    el.innerHTML = '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>'
    const sc = document.createElement('script')
    sc.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    sc.async = true
    sc.textContent = JSON.stringify({
      autosize: true,
      symbol: getTVCryptoSymbol(symbol),
      interval: 'D',
      timezone: 'Europe/Istanbul',
      theme: getTradingViewTheme(),
      style: '1',
      locale: 'tr',
      toolbar_bg: getStoredTheme() === 'dark' ? '#0a0e27' : '#f8fafc',
      enable_publishing: false,
      allow_symbol_change: true,
      hide_top_toolbar: false,
      save_image: false,
      studies: ['MASimple@tv-basicstudies', 'RSI@tv-basicstudies', 'MACD@tv-basicstudies'],
      show_popup_button: true,
      popup_width: '1000',
      popup_height: '650',
    })
    el.appendChild(sc)
    return () => { try { el.innerHTML = '' } catch {} }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol])

  return (
    <div className="card overflow-hidden">
      <div className="p-3 border-b border-dark-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-orange-400">🪙</span>
          <span className="text-white font-medium text-sm">{symbol} — Günlük Grafik (TradingView)</span>
          <span className="text-[10px] text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded">Kripto</span>
        </div>
        <a href={`https://tr.tradingview.com/symbols/${getTVCryptoSymbol(symbol)}/`}
           target="_blank" rel="noopener noreferrer"
           className="text-xs text-blue-400 hover:text-blue-300">TradingView'de Aç ↗</a>
      </div>
      <div
        ref={ref}
        className="tradingview-widget-container"
        style={{ height: `${height}px`, width: '100%', background: getStoredTheme() === 'dark' ? '#0a0e27' : '#f8fafc' }}
      />
    </div>
  )
}

const CRYPTO_QUICK = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'AVAX', 'DOGE', 'LINK', 'DOT', 'LTC', 'BCH', 'NEAR', 'UNI', 'MATIC']

const TIPS = {
  rsi: {
    title: 'RSI — Göreceli Güç Endeksi',
    description: '0-100 arasinda ölçülen momentum göstergesi. 70 üzeri asiri alim (düzeltme riski), 30 alti asiri satim (toparlanma firsati). En yaygin kullanilan teknik göstergelerden biridir.',
    formula: 'RS = AvgGain / AvgLoss\nRSI = 100 - 100/(1 + RS)\n\nWilder Smoothing (standart):\nAvgGain = (öncekiAvgGain × 13 + günlük kazanc) / 14\nAvgLoss = (öncekiAvgLoss × 13 + günlük kayip) / 14\n\nPeriyot: 14 gün (standart)',
    source: 'J. Welles Wilder — "New Concepts in Technical Trading Systems" (1978)'
  },
  macd: {
    title: 'MACD — Hareketli Ortalama Yakinlasma/Iraksamasi',
    description: 'Trend ve momentum göstergesi. EMA12 ile EMA26 arasindaki farki ve bu farkin 9 günlük EMA\'sini (signal line) karsilastirir. MACD signal\'i geçerse alis, altina duserse satis sinyali.',
    formula: 'EMA12: k = 2/13\nEMA26: k = 2/27\nMACD = EMA12 - EMA26\n\nSignal = EMA9(MACD): k = 2/10\nHistogram = MACD - Signal\n\nAlis: MACD > Signal (yukari kesisim)\nSatis: MACD < Signal (asagi kesisim)',
    source: 'Gerald Appel — 1970\'ler'
  },
  bollinger: {
    title: 'Bollinger Bantlari',
    description: 'Fiyatin istatistiksel olarak "normal" araligini gösterir. Fiyat üst banda yaklasirsak asiri alim, alt banda yaklasirsak asiri satim bölgesindedir. Bant daralmas kirilim öncesi sessizligi gösterebilir.',
    formula: 'SMA20 = son 20 günün ortalamasi\nStdDev = kök((Toplam(fiyat - SMA)^2) / 19)\n\nÜst Bant = SMA20 + 2 × StdDev\nOrta Bant = SMA20\nAlt Bant = SMA20 - 2 × StdDev\n\nFiyatin %95\'i bantlar arasinda kalir',
    source: 'John Bollinger — 1980\'ler'
  },
  ema: {
    title: 'EMA — Üstel Hareketli Ortalama',
    description: 'Son fiyatlara daha fazla agirlik veren hareketli ortalama. Fiyat EMA üzerindeyse yükselis egilimi, altindaysa düsüs egilimi. Fiyatin EMA\'yi kesmesi trend degisim sinyali olabilir.',
    formula: 'k = 2 / (periyot + 1)\nEMA = Fiyat × k + öncekiEMA × (1 - k)\n\nIlk EMA = son n günün SMA\'si\n\nEMA5 > EMA9 > EMA21 = Güçlü yükselis\nEMA21 > EMA50 > EMA200 = Uzun vadeli yükselis',
    source: 'Standart teknik analiz formülü'
  },
  fibonacci: {
    title: 'Fibonacci Geri Cekilme Seviyeleri',
    description: 'Fibonacci dizisinin oranlarindan türetilen destek/direnc seviyeleri. Trendin doruk ve dip noktalari arasindaki mesafeye uygulanir. %61.8 "Altin Oran" olarak en kritik seviyedir.',
    formula: 'Swing Yüksek (H) ve Swing Düsük (L) alinir:\n%0    = H\n%23.6 = H - (H-L) × 0.236\n%38.2 = H - (H-L) × 0.382\n%50   = H - (H-L) × 0.500\n%61.8 = H - (H-L) × 0.618  (Altin Oran)\n%78.6 = H - (H-L) × 0.786\n%100  = L',
    source: 'Leonardo Fibonacci (1175-1250) — Doganin matematik dizisi'
  },
  fibonacci618: {
    title: '%61.8 — Altin Oran',
    description: 'Fibonacci dizisinde ardisik iki sayi orani (örn. 89/144 = 0.618). Dogada, sanatta ve finansta evrensel denge noktasi olarak kabul edilir. Teknik analizde en güçlü geri cekilme seviyesidir.',
    formula: 'Altin Oran = 1 / phi = 1 / 1.618 ≈ 0.618\nphi = (1 + kök5) / 2 ≈ 1.618\n\nFibonacci: 1, 1, 2, 3, 5, 8, 13, 21...\n89/144 = 0.618 (yaklasik)',
    source: 'Leonardo Fibonacci / Altin Oran — Evrensel matematik'
  },
  volatility: {
    title: 'Volatilite (Fiyat Oynakligi)',
    description: 'Hissenin fiyat degiskenliginin yüzdesidir. Yüksek volatilite hem yüksek risk hem de yüksek firsat anlamina gelir. Günlük/haftalik kapanislarin standart sapmasindan hesaplanir.',
    formula: 'Günlük getiri = (Kapanis - ÖncekiKapanis) / ÖncekiKapanis\nVolatilite = StdDev(son 20 günlük getiri) × kök(252) × 100\n(Yillikastirilmis yüzde)',
    source: 'Standart finansal volatilite hesabi'
  },
  signals: {
    title: 'Teknik Sinyaller',
    description: 'Birden fazla göstergeyi birlestirerek genel alim/satim sinyali üretir. Her gösterge bagimsiz degerlendirilerek özetlenir.',
    formula: 'RSI < 30 -> Asiri Satim (Alis)\nRSI > 70 -> Asiri Alim (Satis)\nMACD > Signal -> Alis\nMACD < Signal -> Satis\nFiyat > EMA20 -> Yukselis\nFiyat < EMA20 -> Dusus',
    source: 'Standart teknik analiz sinyal kurallar'
  },
  support: {
    title: 'Destek Seviyesi',
    description: 'Fiyatin dususunu engelleyecegi, alim ilgisinin artmasinin beklenildigi seviyedir. Bu seviyenin altina kalinli geçis negatif sinyal verir.',
    formula: 'Fibonacci %38.2 veya %50 seviyesi\nveya son swing düsügü\n\nDestek = H - (H-L) × 0.382\n(H = dönem yüksegi, L = dönem düsügü)',
    source: 'Fibonacci destek/direnc — teknik analiz'
  },
  resistance: {
    title: 'Direnc Seviyesi',
    description: 'Fiyatin yükselis momentumunu kaybedebilecegi, satim ilgisinin artmasinin beklenildigi seviyedir. Bu seviyenin üzerine kalinli geçis pozitif sinyal verir.',
    formula: 'Fibonacci %61.8 veya %78.6 seviyesi\nveya son swing yüksegi\n\nDirenc = H - (H-L) × 0.618\n(H = dönem yüksegi, L = dönem düsügü)',
    source: 'Fibonacci destek/direnc — teknik analiz'
  },
}

export default function TeknikAnalizAI() {
  const [searchParams] = useSearchParams()
  const [symbol, setSymbol] = useState('')
  const [assetType, setAssetType] = useState('stock') // 'stock' | 'crypto'
  const [selectedSector, setSelectedSector] = useState('')
  const [loading, setLoading] = useState(false)
  const [analysis, setAnalysis] = useState(null)
  const [sectors, setSectors] = useState([])
  const [sectorStocks, setSectorStocks] = useState([])
  const [sectorLoading, setSectorLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Sektorleri yukle
    fetch('/api/market/sectors')
      .then(res => {
        if (!res.ok) throw new Error('Sektorler yuklenemedi')
        return res.json()
      })
      .then(data => setSectors(data.sectors || []))
      .catch(err => console.error('Sektor yukleme hatasi:', err))

    // URL parametrelerinden sembol ve tip yükle
    const urlSym  = searchParams.get('symbol')
    const urlType = searchParams.get('type') || 'stock'
    if (urlSym) {
      const s = urlSym.toUpperCase()
      setSymbol(s)
      setAssetType(urlType)
      // handleAnalyze henüz tanımlanmadı, doğrudan fetch yap
      const typeParam = urlType === 'crypto' ? '?type=crypto' : ''
      fetch(`/api/analysis/technical/${s}${typeParam}`)
        .then(r => r.ok ? r.json() : Promise.reject(r))
        .then(d => { if (d?.symbol) setAnalysis(d) })
        .catch(() => setError(`${s} analiz edilemedi`))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sector degistiginde o sectordeki hisseleri getir
  useEffect(() => {
    if (!selectedSector) {
      setSectorStocks([])
      return
    }
    setSectorLoading(true)
    fetch(`/api/market/live?limit=200`)
      .then(res => res.ok ? res.json() : { stocks: [] })
      .then(data => {
        const stocks = (data.stocks || [])
          .filter(s => s.sector === selectedSector)
          .sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0))
          .slice(0, 20)
        setSectorStocks(stocks)
      })
      .catch(() => setSectorStocks([]))
      .finally(() => setSectorLoading(false))
  }, [selectedSector])

  const handleAnalyze = async (stockSymbol, forceType) => {
    const sym = (stockSymbol || symbol).trim().toUpperCase()
    if (!sym) return
    const type = forceType || assetType
    setLoading(true)
    setError(null)
    setAnalysis(null)
    try {
      const typeParam = type === 'crypto' ? '?type=crypto' : ''
      const response = await fetch(`/api/analysis/technical/${sym}${typeParam}`)
      if (!response.ok) {
        if (response.status === 404) throw new Error(`"${sym}" bulunamadi.`)
        throw new Error('Analiz sirasinda bir hata olustu.')
      }
      const data = await response.json()
      if (!data || !data.symbol) throw new Error('Veri alinamadi.')
      setAnalysis(data)
    } catch (error) {
      console.error('Analiz hatasi:', error)
      setError(error.message || 'Bilinmeyen bir hata olustu')
    } finally {
      setLoading(false)
    }
  }

  const getSignalColor = (signal) => {
    if (signal.includes('Alış') || signal.includes('Pozitif') || signal.includes('Yükseliş') || signal.includes('Aşırı Satım')) {
      return 'text-success-500'
    }
    if (signal.includes('Satış') || signal.includes('Negatif') || signal.includes('Düşüş') || signal.includes('Aşırı Alım')) {
      return 'text-danger-500'
    }
    return 'text-warning-500'
  }

  const getSignalIcon = (signal) => {
    if (signal.includes('Alış') || signal.includes('Pozitif') || signal.includes('Yükseliş')) {
      return <ArrowUp className="w-4 h-4 text-success-500" />
    }
    if (signal.includes('Satış') || signal.includes('Negatif') || signal.includes('Düşüş')) {
      return <ArrowDown className="w-4 h-4 text-danger-500" />
    }
    return <Minus className="w-4 h-4 text-warning-500" />
  }

  const formatAssetPrice = (value, isCrypto = analysis?.isCrypto) => {
    const numericValue = Number(value)
    if (!Number.isFinite(numericValue)) return '-'

    const digits = isCrypto
      ? (numericValue >= 1000 ? 2 : numericValue >= 1 ? 4 : 6)
      : 2

    const formatted = numericValue.toLocaleString('tr-TR', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })

    return isCrypto ? `$${formatted}` : `${formatted} TL`
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Teknik Analiz AI</h1>
        <p className="text-gray-400 mt-1">RSI, MACD, Bollinger ve EMA göstergeleri ile analiz</p>
      </div>

      {/* Varlık Tipi Toggle */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { setAssetType('stock'); setAnalysis(null); setError(null) }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all ${assetType === 'stock' ? 'bg-gold-500 text-dark-950' : 'bg-dark-800 text-gray-400 hover:text-white'}`}
        >
          📈 BIST Hisseleri
        </button>
        <button
          onClick={() => { setAssetType('crypto'); setAnalysis(null); setError(null); setSelectedSector('') }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all ${assetType === 'crypto' ? 'bg-orange-500 text-white' : 'bg-dark-800 text-gray-400 hover:text-white'}`}
        >
          🪙 Kripto Paralar
        </button>
      </div>

      {/* Arama ve Sektör/Kripto Seçimi */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {assetType === 'stock' ? (
          <div className="card">
            <h3 className="font-semibold text-white mb-4">Sektörden Seçim</h3>
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="input w-full"
            >
              <option value="">Bir Sektör Seçin</option>
              {sectors.map((sector, idx) => (
                <option key={idx} value={sector.sector}>{sector.sector} ({sector.stockCount} hisse)</option>
              ))}
            </select>
            {selectedSector && (
              <div className="mt-3">
                {sectorLoading ? (
                  <div className="flex items-center gap-2 text-gray-400 text-xs py-2">
                    <Activity className="w-4 h-4 animate-pulse" />
                    Sektör hisseleri yükleniyor...
                  </div>
                ) : sectorStocks.length === 0 ? (
                  <p className="text-gray-500 text-xs py-2">Bu sektörde hisse bulunamadı.</p>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                    <p className="text-xs text-gray-500 mb-2">{selectedSector} — {sectorStocks.length} hisse (değişime göre)</p>
                    {sectorStocks.map(s => (
                      <button
                        key={s.symbol}
                        onClick={() => { setSymbol(s.symbol); handleAnalyze(s.symbol, 'stock'); }}
                        className="w-full flex items-center justify-between px-3 py-2 bg-dark-800 hover:bg-dark-700 rounded-lg text-sm transition-colors group"
                      >
                        <span className="font-mono font-semibold text-white group-hover:text-primary-400">{s.symbol}</span>
                        <span className={`text-xs font-semibold ${(s.changePercent || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {(s.changePercent || 0) >= 0 ? '+' : ''}{(s.changePercent || 0).toFixed(2)}%
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="card">
            <h3 className="font-semibold text-white mb-4">🪙 Popüler Kriptolar</h3>
            <div className="flex flex-wrap gap-1.5">
              {CRYPTO_QUICK.map(s => (
                <button
                  key={s}
                  onClick={() => { setSymbol(s); handleAnalyze(s, 'crypto'); }}
                  className="px-2.5 py-1.5 bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/20 text-xs text-orange-300 rounded-lg transition-colors font-medium"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="card">
          <h3 className="font-semibold text-white mb-4">
            {assetType === 'crypto' ? '🔍 Kripto Ara' : 'Hızlı Arama'}
          </h3>
          <div className="flex responsive-stack gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type="text"
                placeholder={assetType === 'crypto' ? 'Kripto sembol (BTC, ETH, SOL...)' : 'Hisse kodu (örn: THYAO)'}
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
                className="input w-full pl-10"
              />
            </div>
            <button onClick={() => handleAnalyze()} disabled={loading} className={`btn-primary ${assetType === 'crypto' ? 'bg-orange-600 hover:bg-orange-500' : ''}`}>
              {loading ? '...' : 'Ara'}
            </button>
          </div>
        </div>
      </div>

      {/* Popüler Hisseler / Kripto kısayolları */}
      {assetType === 'stock' && (
        <div className="card">
          <h3 className="font-semibold text-white mb-4">Popüler Hisseler</h3>
          <div className="flex flex-wrap gap-2">
            {['THYAO', 'GARAN', 'AKBNK', 'ASELS', 'EREGL', 'SISE', 'KCHOL', 'TUPRS'].map((sym) => (
              <button
                key={sym}
                onClick={() => { setSymbol(sym); handleAnalyze(sym, 'stock'); }}
                className="px-3 py-1.5 bg-dark-800 hover:bg-primary-600 text-gray-300 hover:text-white rounded-lg text-sm transition-colors"
              >
                {sym}
              </button>
            ))}
          </div>
        </div>
      )}

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
          {/* Kripto için TradingView Grafik */}
          {analysis.isCrypto && null}


          {/* Başlık */}
          <div className={`card bg-gradient-to-r ${analysis.isCrypto ? 'from-orange-900/30 to-dark-900' : 'from-purple-900/50 to-dark-900'}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-bold text-white">{analysis.symbol}</h2>
                  {analysis.isCrypto && <span className="text-[11px] text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full border border-orange-500/30">Kripto Para</span>}
                </div>
                <p className="text-gray-400">{analysis.name}</p>
              </div>
              <div className="text-right">
                {analysis.currentPrice != null ? (
                  <div className="text-3xl font-bold text-white">{formatAssetPrice(analysis.currentPrice, analysis.isCrypto)}</div>
                ) : (
                  <div className="text-gray-500 text-sm">Fiyat verisi mevcut değil</div>
                )}
                <div className={`flex items-center justify-end gap-1 ${
                  analysis.trend?.toLowerCase().includes('yuksel') || analysis.trend?.toLowerCase().includes('yüksel')
                    ? 'text-success-500'
                    : analysis.trend?.toLowerCase().includes('dusus') || analysis.trend?.toLowerCase().includes('düşüş')
                    ? 'text-danger-500'
                    : 'text-warning-500'
                }`}>
                  {analysis.trend?.toLowerCase().includes('yuksel') || analysis.trend?.toLowerCase().includes('yüksel') ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : analysis.trend?.toLowerCase().includes('dusus') || analysis.trend?.toLowerCase().includes('düşüş') ? (
                    <TrendingDown className="w-4 h-4" />
                  ) : (
                    <Activity className="w-4 h-4" />
                  )}
                  <span>{analysis.trend || 'Yatay'} Trendi</span>
                </div>
                {analysis.lastUpdate && (
                  <div className="flex items-center justify-end gap-1 text-xs text-gray-500 mt-1">
                    <Clock className="w-3 h-3" />
                    {new Date(analysis.lastUpdate).toLocaleTimeString('tr-TR')}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Grafik — sadece BIST hisseleri için (kripto için TradingView yukarıda gösterildi) */}
          <StockChart symbol={analysis.symbol} assetType={analysis.isCrypto ? 'crypto' : 'stock'} />

          {/* Göstergeler Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* RSI */}
            <div className="card">
              <h4 className="text-xs text-gray-500 mb-2 flex items-center gap-1">RSI (14) <InfoTooltip {...TIPS.rsi} /></h4>
              <div className={`text-2xl font-bold ${analysis.indicators?.rsi < 30 ? 'text-success-500' :
                analysis.indicators?.rsi > 70 ? 'text-danger-500' : 'text-white'
                }`}>
                {analysis.indicators?.rsi}
              </div>
              <div className="mt-2 h-2 bg-dark-700 rounded-full overflow-hidden">
                <div
                  className={`h-full ${analysis.indicators?.rsi < 30 ? 'bg-success-500' :
                    analysis.indicators?.rsi > 70 ? 'bg-danger-500' : 'bg-primary-500'
                    }`}
                  style={{ width: `${analysis.indicators?.rsi}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {analysis.indicators?.rsi < 30 ? 'Aşırı Satım' :
                  analysis.indicators?.rsi > 70 ? 'Aşırı Alım' : 'Nötr'}
              </p>
            </div>

            {/* MACD */}
            <div className="card">
              <h4 className="text-xs text-gray-500 mb-2 flex items-center gap-1">MACD <InfoTooltip {...TIPS.macd} /></h4>
              <div className={`text-2xl font-bold ${analysis.indicators?.macd > analysis.indicators?.macdSignal ? 'text-success-500' : 'text-danger-500'
                }`}>
                {analysis.indicators?.macd}
              </div>
              <p className="text-xs text-gray-400 mt-1">Sinyal: {analysis.indicators?.macdSignal}</p>
              <p className="text-xs mt-1">
                <span className={analysis.indicators?.macd > analysis.indicators?.macdSignal ? 'text-success-500' : 'text-danger-500'}>
                  {analysis.indicators?.macd > analysis.indicators?.macdSignal ? 'Alış Sinyali' : 'Satış Sinyali'}
                </span>
              </p>
            </div>

            {/* Bollinger */}
            <div className="card">
              <h4 className="text-xs text-gray-500 mb-2 flex items-center gap-1">Bollinger Bands <InfoTooltip {...TIPS.bollinger} /></h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Üst:</span>
                  <span className="text-danger-400">{analysis.indicators?.bollingerUpper}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Orta:</span>
                  <span className="text-white">{analysis.indicators?.bollingerMiddle}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Alt:</span>
                  <span className="text-success-400">{analysis.indicators?.bollingerLower}</span>
                </div>
              </div>
            </div>

            {/* Volatilite */}
            <div className="card">
              <h4 className="text-xs text-gray-500 mb-2 flex items-center gap-1">Volatilite <InfoTooltip {...TIPS.volatility} /></h4>
              <div className="text-2xl font-bold text-white">%{analysis.volatility}</div>
              <p className="text-xs text-gray-400 mt-2">Momentum: {analysis.momentum}</p>
            </div>
          </div>

          {/* EMA Seviyeleri */}
          <div className="card">
            <h3 className="font-semibold text-white mb-4 flex items-center gap-2">EMA Seviyeleri <InfoTooltip size="lg" {...TIPS.ema} /></h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {[
                { label: 'EMA 5', value: analysis.indicators?.ema5 },
                { label: 'EMA 9', value: analysis.indicators?.ema9 },
                { label: 'EMA 21', value: analysis.indicators?.ema21 },
                { label: 'EMA 50', value: analysis.indicators?.ema50 },
                { label: 'EMA 200', value: analysis.indicators?.ema200 }
              ].map((ema, idx) => (
                <div key={idx} className="bg-dark-800 rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-500 flex items-center justify-center gap-1">{ema.label} <InfoTooltip {...TIPS.ema} /></div>
                  <p className={`text-lg font-semibold ${analysis.currentPrice > ema.value ? 'text-success-500' : 'text-danger-500'
                    }`}>
                    {ema.value}
                  </p>
                  {analysis.currentPrice > ema.value ? (
                    <ArrowUp className="w-4 h-4 text-success-500 mx-auto mt-1" />
                  ) : (
                    <ArrowDown className="w-4 h-4 text-danger-500 mx-auto mt-1" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Destek / Direnç - Fibonacci Tabanli */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="card">
              <h3 className="font-semibold text-white mb-3 flex items-center gap-1.5 text-sm">
                <ArrowDown className="w-4 h-4 text-success-500 flex-shrink-0" />
                <span className="truncate">Destek <span className="text-gray-500 font-normal">(Fib)</span></span>
                <InfoTooltip {...TIPS.support} />
              </h3>
              <div className="text-lg sm:text-2xl font-bold text-success-500 truncate">
                {analysis.support !== undefined && analysis.support !== null && analysis.support !== 0
                  ? formatAssetPrice(analysis.support, analysis.isCrypto)
                  : analysis.fibonacciLevels?.level_382
                    ? formatAssetPrice(analysis.fibonacciLevels.level_382, analysis.isCrypto)
                    : <span className="text-base text-gray-500">Hesaplanıyor</span>}
              </div>
              <p className="text-xs text-gray-500 mt-1.5">Altına düşerse satış baskısı artabilir</p>
            </div>
            <div className="card">
              <h3 className="font-semibold text-white mb-3 flex items-center gap-1.5 text-sm">
                <ArrowUp className="w-4 h-4 text-danger-500 flex-shrink-0" />
                <span className="truncate">Direnç <span className="text-gray-500 font-normal">(Fib)</span></span>
                <InfoTooltip {...TIPS.resistance} />
              </h3>
              <div className="text-lg sm:text-2xl font-bold text-danger-500 truncate">
                {analysis.resistance !== undefined && analysis.resistance !== null && analysis.resistance !== 0
                  ? formatAssetPrice(analysis.resistance, analysis.isCrypto)
                  : analysis.fibonacciLevels?.level_618
                    ? formatAssetPrice(analysis.fibonacciLevels.level_618, analysis.isCrypto)
                    : <span className="text-base text-gray-500">Hesaplanıyor</span>}
              </div>
              <p className="text-xs text-gray-500 mt-1.5">Aşarsa alış baskısı artabilir</p>
            </div>
          </div>

          {/* Fibonacci Seviyeleri Detay */}
          {analysis.fibonacciLevels && (
            <div className="card">
              <h3 className="font-semibold text-white mb-4 flex items-center gap-2">Fibonacci Geri Cekilme Seviyeleri <InfoTooltip size="lg" {...TIPS.fibonacci} /></h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
                {[
                  { label: '%0', key: 'level_0', color: 'text-red-400' },
                  { label: '%23.6', key: 'level_236', color: 'text-orange-400' },
                  { label: '%38.2', key: 'level_382', color: 'text-yellow-400' },
                  { label: '%50', key: 'level_500', color: 'text-white' },
                  { label: '%61.8', key: 'level_618', color: 'text-blue-400', tip: true },
                  { label: '%78.6', key: 'level_786', color: 'text-purple-400' },
                  { label: '%100', key: 'level_100', color: 'text-green-400' }
                ].map((fib) => (
                  <div key={fib.key} className="bg-dark-800 rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-500 flex items-center justify-center gap-1">
                      {fib.label}
                      {fib.tip && <InfoTooltip {...TIPS.fibonacci618} />}
                    </div>
                    <p className={`text-sm font-semibold ${fib.color}`}>
                      {formatAssetPrice(analysis.fibonacciLevels[fib.key], analysis.isCrypto)}
                    </p>
                    {analysis.currentPrice && analysis.fibonacciLevels[fib.key] && (
                      <p className="text-xs mt-1">
                        {analysis.currentPrice > analysis.fibonacciLevels[fib.key] ? (
                          <span className="text-green-400">Ustunde</span>
                        ) : (
                          <span className="text-red-400">Altinda</span>
                        )}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-3 text-center">
                %61.8 seviyesi "Altin Oran" olarak bilinir ve en onemli geri cekilme seviyesidir.
              </p>
            </div>
          )}

          {/* Sinyal Tablosu */}
          <div className="card">
            <h3 className="font-semibold text-white mb-4 flex items-center gap-2">Teknik Sinyaller <InfoTooltip size="lg" {...TIPS.signals} /></h3>
            <div className="space-y-3">
              {analysis.signals?.map((signal, idx) => (
                <div key={idx} className="flex items-center justify-between bg-dark-800 rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <Activity className="w-5 h-5 text-primary-500" />
                    <span className="text-white">{signal.indicator}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {getSignalIcon(signal.signal)}
                    <span className={getSignalColor(signal.signal)}>{signal.signal}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Başlangıç durumu */}
      {!analysis && !loading && (
        <div className="card text-center py-16">
          <Activity className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">Teknik Analiz Başlatın</h3>
          <p className="text-gray-400 max-w-md mx-auto">
            Yukarıdaki arama kutusuna hisse kodunu girerek veya popüler hisselerden birine tıklayarak teknik analiz görüntüleyebilirsiniz.
          </p>
        </div>
      )}
    </div>
  )
}
