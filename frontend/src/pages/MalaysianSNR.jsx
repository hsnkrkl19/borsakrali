import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, TrendingUp, TrendingDown, Minus, Target, AlertCircle, RefreshCw, BarChart2, Shield, Zap } from 'lucide-react'
import { createChart, LineStyle } from 'lightweight-charts'
import api from '../services/api'
import InfoTooltip from '../components/InfoTooltip'
import { fetchCommodityHistory } from '../utils/commodityHistory'

// ─── lightweight-charts SNR Grafiği ──────────────────────────────────────────
const CHART_TIMEFRAMES = [
  { label: '30dk', period: '5d',  interval: '30m', key: '30m' },
  { label: '1sa',  period: '7d',  interval: '60m', key: '1h'  },
  { label: 'Günlük', period: '6mo', interval: '1d', key: '1d' },
  { label: 'Haftalık', period: '2y', interval: '1wk', key: '1wk' },
]

function calcPivotsSNR(candles, len = 3) {
  const highs = [], lows = []
  for (let i = len; i < candles.length - len; i++) {
    const h = candles[i].high, l = candles[i].low
    let isH = true, isL = true
    for (let j = 1; j <= len; j++) {
      if (candles[i-j].high >= h || candles[i+j].high >= h) isH = false
      if (candles[i-j].low  <= l || candles[i+j].low  <= l) isL = false
    }
    if (isH) highs.push({ time: candles[i].time, value: h })
    if (isL) lows.push({ time: candles[i].time, value: l })
  }
  return { highs: highs.slice(-5), lows: lows.slice(-5) }
}

function SnrChart({ symbol, assetType, data }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const [candles, setCandles] = useState([])
  const [tf, setTf] = useState(CHART_TIMEFRAMES[2]) // Günlük default

  const fetchCandles = useCallback(async (timeframe) => {
    if (!symbol) return
    try {
      // Commodity semboller için ayrı endpoint
      if (assetType === 'commodity') {
        const commKey = COMMODITY_KEY_MAP[symbol]
        if (!commKey) return
        const d = await fetchCommodityHistory(commKey, { period: timeframe.period, interval: timeframe.interval })
        const raw = d.data || []
        const seen = new Set()
        const formatted = raw
          .filter(q => q.close)
          .map(q => ({ time: q.time, open: +q.open||0, high: +q.high||0, low: +q.low||0, close: +q.close||0 }))
          .filter(q => { if (seen.has(q.time)) return false; seen.add(q.time); return true })
          .sort((a, b) => a.time > b.time ? 1 : -1)
        setCandles(formatted)
        return
      }
      const apiSym = assetType === 'crypto' ? `${symbol}-USD` : symbol
      const r = await fetch(`/api/market/stock/${apiSym}/historical?period=${timeframe.period}&interval=${timeframe.interval}`)
      if (!r.ok) return
      const d = await r.json()
      const raw = d.data || d.quotes || []
      const isIntraday = timeframe.interval !== '1d' && timeframe.interval !== '1wk'
      const seen = new Set()
      const formatted = raw
        .filter(q => q.close)
        .map(q => {
          const t = isIntraday ? Math.floor(q.timestamp / 1000) : new Date(q.date).toISOString().split('T')[0]
          return { time: t, open: +q.open||0, high: +q.high||0, low: +q.low||0, close: +q.close||0 }
        })
        .filter(q => { if (seen.has(q.time)) return false; seen.add(q.time); return true })
        .sort((a, b) => a.time > b.time ? 1 : -1)
      setCandles(formatted)
    } catch (e) { console.error('SNR chart fetch:', e) }
  }, [symbol, assetType])

  useEffect(() => { fetchCandles(tf) }, [fetchCandles, tf])

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null }

    const chart = createChart(containerRef.current, {
      layout: { background: { type: 'solid', color: '#0d0d14' }, textColor: '#9ca3af' },
      grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
      autoSize: true,
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.1)', timeVisible: true, secondsVisible: false },
    })

    const cs = chart.addCandlestickSeries({
      upColor: '#22c55e', downColor: '#ef4444',
      borderUpColor: '#22c55e', borderDownColor: '#ef4444',
      wickUpColor: '#22c55e', wickDownColor: '#ef4444',
    })
    cs.setData(candles)

    // Destek/Direnç zone çizgileri — zone top/bottom olarak
    if (data?.zones) {
      data.zones.slice(0, 10).forEach(z => {
        const col = z.type === 'support' ? '#22c55e' : '#ef4444'
        cs.createPriceLine({ price: z.top, color: col + '90', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '' })
        cs.createPriceLine({ price: z.bottom, color: col + '60', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '' })
      })
    }

    // En güçlü sinyal: Giriş / Stop / TP seviyeleri
    if (data?.signals?.length > 0) {
      const sig = data.signals[0]
      cs.createPriceLine({ price: sig.entry, color: '#3b82f6', lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `▶ GİRİŞ ${sig.entry?.toFixed(2)}` })
      cs.createPriceLine({ price: sig.stop,  color: '#ef4444', lineWidth: 2, lineStyle: LineStyle.LargeDashed, axisLabelVisible: true, title: `✕ STOP ${sig.stop?.toFixed(2)}` })
      cs.createPriceLine({ price: sig.target,color: '#22c55e', lineWidth: 2, lineStyle: LineStyle.LargeDashed, axisLabelVisible: true, title: `★ TP ${sig.target?.toFixed(2)}` })
      // 2. sinyal varsa onu da ekle
      if (data.signals[1]) {
        const s2 = data.signals[1]
        cs.createPriceLine({ price: s2.entry,  color: '#8b5cf6', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `▶ GİRİŞ2 ${s2.entry?.toFixed(2)}` })
        cs.createPriceLine({ price: s2.target, color: '#a78bfa', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `★ TP2 ${s2.target?.toFixed(2)}` })
      }
    }

    // Otomatik trend çizgileri (pivot high/low)
    const { highs, lows } = calcPivotsSNR(candles, tf.key === '1d' || tf.key === '1wk' ? 3 : 2)
    const lastT = candles[candles.length - 1].time
    if (highs.length >= 2) {
      const h1 = highs[highs.length - 2], h2 = highs[highs.length - 1]
      const rLine = chart.addLineSeries({ color: '#ef444466', lineWidth: 2, lineStyle: LineStyle.Dashed, lastValueVisible: false, priceLineVisible: false })
      rLine.setData([{ time: h1.time, value: h1.value }, { time: h2.time, value: h2.value }, { time: lastT, value: h2.value + (h2.value - h1.value) * 0.3 }])
    }
    if (lows.length >= 2) {
      const l1 = lows[lows.length - 2], l2 = lows[lows.length - 1]
      const sLine = chart.addLineSeries({ color: '#22c55e66', lineWidth: 2, lineStyle: LineStyle.Dashed, lastValueVisible: false, priceLineVisible: false })
      sLine.setData([{ time: l1.time, value: l1.value }, { time: l2.time, value: l2.value }, { time: lastT, value: l2.value + (l2.value - l1.value) * 0.3 }])
    }

    chart.timeScale().fitContent()
    chartRef.current = chart

    return () => { if (chartRef.current) { chartRef.current.remove(); chartRef.current = null } }
  }, [candles, data])

  return (
    <div className="card p-0 overflow-hidden">
      {/* Başlık + Zaman Dilimi */}
      <div className="px-4 py-3 border-b border-dark-700 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white">{symbol}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${assetType === 'crypto' ? 'bg-orange-500/20 text-orange-400' : assetType === 'commodity' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-blue-500/20 text-blue-400'}`}>
            {assetType === 'crypto' ? 'Kripto' : assetType === 'commodity' ? 'Emtia' : 'BIST'}
          </span>
          <span className="text-[10px] text-gray-500">— Malaysian SNR Grafiği</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Renk Açıklaması */}
          {data?.signals?.length > 0 && (
            <div className="flex items-center gap-2 mr-2 text-[10px]">
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-400 inline-block"/>Giriş</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-400 inline-block"/>Stop</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-green-400 inline-block"/>TP</span>
            </div>
          )}
          {CHART_TIMEFRAMES.map(t => (
            <button key={t.key} onClick={() => setTf(t)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${tf.key === t.key ? 'bg-gold-500/30 text-gold-400 border border-gold-500/50' : 'bg-dark-700 text-gray-400 hover:text-white'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div ref={containerRef} className="w-full" style={{ height: 520 }} />
    </div>
  )
}

// ─── Renk & Konfigürasyon ─────────────────────────────────────────────────────
const GRADE_COLORS = {
  'A+': 'bg-green-500/20 text-green-400 border-green-500/40',
  'A':  'bg-blue-500/20 text-blue-400 border-blue-500/40',
  'B':  'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
}

const STORYLINE_CONFIG = {
  bullish:  { color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30', icon: TrendingUp,  label: 'Yükseliş Trendi' },
  bearish:  { color: 'text-red-400',   bg: 'bg-red-500/10 border-red-500/30',     icon: TrendingDown, label: 'Düşüş Trendi' },
  neutral:  { color: 'text-gray-400',  bg: 'bg-dark-800 border-dark-600',          icon: Minus,       label: 'Yatay Trend' },
}

const POPULAR = ['THYAO', 'GARAN', 'ASELS', 'EREGL', 'BIMAS', 'AKBNK', 'TUPRS', 'SISE', 'KCHOL', 'SAHOL']

// Kıymetli Metaller — commodity endpoint'e yönlendirilen semboller
const COMMODITY_LIST = [
  { label: 'Altın (Ons)',  symbol: 'XAUUSD', key: 'gold_usd'   },
  { label: 'Gümüş (Ons)', symbol: 'XAGUSD', key: 'silver_usd' },
  { label: 'Altın TL',    symbol: 'XAUTRY', key: 'gold_try'   },
]

// Sembol → commodity key eşlemesi
const COMMODITY_KEY_MAP = {
  XAUUSD: 'gold_usd',
  XAGUSD: 'silver_usd',
  XAUTRY: 'gold_try',
}

// Top 100 Kripto — kısa semboller (Yahoo Finance'te -USD eki ile çekilir)
const CRYPTO_TOP = [
  'BTC','ETH','BNB','SOL','XRP','USDC','ADA','AVAX','DOGE','TRX',
  'LINK','TON','MATIC','DOT','LTC','SHIB','BCH','NEAR','UNI','APT',
  'ICP','FIL','ATOM','OP','ARB','VET','MKR','AAVE','ALGO','THETA',
  'XLM','IMX','RNDR','GRT','INJ','EGLD','STX','FLOW','SAND','MANA',
  'QNT','HBAR','AXS','CRV','SNX','RUNE','COMP','ENS','LDO','GMX',
  'PEPE','FLOKI','WLD','BLUR','ID','SUI','SEI','TIA','PYTH','JTO',
  'JUP','WIF','BONK','ORDI','SATS','BOME','ENA','ETHFI','REZ','NOT',
  'ZK','LISTA','ZRO','IO','ZRX','1INCH','CAKE','GMT','APE','CHZ',
  'BAT','LUNC','HOT','XTZ','IOTA','EOS','DASH','ZEC','DGB','WAVES',
  'KSM','DCR','SC','LSK','NANO','ZIL','ONT','BTT','WIN','XNO',
]

// Total S ve diğer market cap göstergeleri
const TOTAL_MARKET = [
  { label: 'Total (Tüm Kripto)', symbol: 'TOTAL', type: 'crypto' },
  { label: 'Total S (BTC hariç)', symbol: 'TOTAL2', type: 'crypto' },
  { label: 'Total3 (BTC+ETH hariç)', symbol: 'TOTAL3', type: 'crypto' },
]

// ─── Tooltip İçerikleri — PDF'ten zenginleştirildi ───────────────────────────
const TIPS = {
  methodology: {
    title: 'Malaysian SNR Metodolojisi',
    description: 'Malezya kökenli profesyonel traderlerin geliştirdiği destek/direnç tespit yöntemi. Geleneksel yöntemlerin aksine mumların GÖVDELERİNİ (body) baz alır — fitiller (wick) göz ardı edilir. Gövde oranı %30\'ın altındaki mumlar zone oluşturmaz. Temel kural: Çizgi grafik kullanarak "A" (direnç) ve "V" (destek) şekillerini tespit et, ardından mum grafiğe geç.',
    formula: 'Gövde filtresi: |Kapanış − Açılış| / (Yüksek − Düşük) ≥ 0.30\n\nDestek zone (V şekli):\n  Bearish kapanış → Bullish açılış\n  Zone top    = max(önceki open, close)\n  Zone bottom = min(önceki open, close)\n\nDirenç zone (A şekli):\n  Bullish kapanış → Bearish açılış\n  Zone top    = max(önceki open, close)\n  Zone bottom = min(önceki open, close)\n\nTemel fark: Fitil değil GÖVDE baz alınır.',
    source: 'Trading SNR the Malaysian Way — Iyanu Adegboruwa'
  },
  storyline: {
    title: 'Storyline (Büyük Resim Yönü)',
    description: 'Hissenin genel trend yönünü EMA ile belirler. Destek/direnç zone\'larının trend yönüyle uyumlu olması skoru artırır (+20), zıt yön ise düşürür (-10). Yükseliş trendinde yalnızca destek zone\'larından alım; düşüş trendinde yalnızca direnç zone\'larından satım yapmak önerilir.',
    formula: 'EMA20 = son 20 bar EMA\nEMA50 = son 50 bar EMA\n\nYükseliş (Bullish): Fiyat > EMA20 > EMA50\nDüşüş  (Bearish) : Fiyat < EMA20 < EMA50\nYatay  (Neutral) : Diğer tüm durumlar\n\nUyum bonusu  : +20 skor\nZıt yön cezası: −10 skor',
    source: 'EMA — standart formül; snrService.js deriveStoryline()'
  },
  atr: {
    title: 'ATR — Ortalama Gerçek Aralık',
    description: 'Average True Range. Hissenin günlük oynaklığını ölçer. Stop Loss\'ta zone sınırına eklenen tampon mesafesi ATR baz alınarak hesaplanır. Yüksek ATR = geniş stop, büyük hedef. Malaysian SNR\'de stop asla zone\'un tam sınırına konmaz — 0.5×ATR tampon zorunludur.',
    formula: 'TR = max(\n  Yüksek − Düşük,\n  |Yüksek − Önceki Kapanış|,\n  |Düşük  − Önceki Kapanış|\n)\n\nATR14 = Son 14 TR\'nin aritmetik ortalaması\n\nKullanım:\n• Stop tampon marjı: ATR × 0.50\n• Gap zone eşiği  : |Gap| ≥ ATR × 0.10\n• Dokunma tolerans: ATR × 0.05',
    source: 'J. Welles Wilder — "New Concepts in Technical Trading Systems" (1978)'
  },
  zone: {
    title: 'Zone (Destek / Direnç Bölgesi)',
    description: 'Fiyatın geçmişte sert tepki verdiği, kurumsal alıcı/satıcıların yoğunlaştığı fiyat bölgesidir. Zone sınırları GÖVDE minimum/maximumuna göre belirlenir — fitiller dışarıda bırakılır. Çizgi grafikte "V" (destek) ve "A" (direnç) şekilleri oluşturur.',
    formula: 'Gövde filtresi:\n  |Kap. − Açılış| / (Yük. − Düş.) ≥ 0.30\n\nDestek zone:\n  prevBullish=false AND currBullish=true\n  top    = max(prev.open, prev.close)\n  bottom = min(prev.open, prev.close)\n\nDirenç zone:\n  prevBullish=true AND currBullish=false\n  top    = max(prev.open, prev.close)\n  bottom = min(prev.open, prev.close)\n\nNOT: Fitiller (wick) zone sınırı DIŞINDA kalır.',
    source: 'Malaysian SNR — snrService.js detectZones()'
  },
  score: {
    title: 'Skor (0 – 100)',
    description: 'Zone\'un güvenilirlik puanı. 50 ve üzeri skor alan zone\'lar sinyal listesine girer ve A+/A/B notu alır. Birden fazla faktörün bir arada bulunması skoru katlar. En yüksek skoru alan zone en önce gösterilir.',
    formula: 'Başlangıç puanı        : 40\n+ Taze (fresh)          : +15\n+ Test edilmiş (tested) : +5\n+ Gap zone              : +10\n+ Engulfing (yakın 3 bar): +15\n+ Likidite süpürmesi    : +20\n+ Storyline uyumu       : +20\n− Storyline zıt yön     : −10\n− Her dokunma (touch)   : −5\n+ Onaylı (validated)    : +5\n\nMaksimum : 100 | Minimum : 0\n\nNot eşikleri:\n  A+ ≥ 80 | A ≥ 65 | B ≥ 50',
    source: 'snrService.js scoreZones() — Borsa Krali'
  },
  grade: {
    title: 'Grade (Not: A+ / A / B)',
    description: 'Zone\'un sayısal skordan türetilen harf notu. Yalnızca skor 50 ve üzerindeki zone\'lar not alır ve sinyal listesinde gösterilir.',
    formula: 'A+ = Skor ≥ 80  → Çok Güçlü (En yüksek öncelik)\nA  = Skor ≥ 65  → Güçlü\nB  = Skor ≥ 50  → Orta\n\n50 altı = Listelenmez',
    source: 'snrService.js scoreZones() grade hesabı'
  },
  freshness: {
    title: 'Tazelik (Freshness)',
    description: 'Zone\'un kaç kez test edildiğini gösteren durum etiketidir. Taze (fresh) zone\'lar, kurumsal emirlerin henüz dolmadığını gösterir. PDF\'e göre: "Wick zone sınırını geçse de gövde geçmediyse zone hâlâ tazedir." En güçlü sinyal adayı taze zone\'dur.',
    formula: 'fresh  = 0 dokunma            (+15 skor)\ntested = 1-2 dokunma          (+5 skor)\nused   = 3+ dokunma           (ek puan yok)\nbroken = Fiyat zone\'u kırdı   (listeden çıkar)\n\nKırılma:\n  close < bottom - 0.5×ATR    (destek)\n  close > top + 0.5×ATR       (direnç)\n\nÖnemli: Sadece GÖVDE kapanışı kırılma sayılır!\nWick geçişi = "unfresh" değil, zone hâlâ taze.',
    source: 'snrService.js validateZones() — Trading SNR the Malaysian Way'
  },
  zoneType: {
    title: 'Zone Tipi: Klasik ve Gap',
    description: 'Gap zone\'lar (boşluk zone\'ları) çok daha güçlüdür. Gap oluşumunda fiyat büyük bir atlama ile hareket etmiştir; bu o bölgedeki kurumsal ilginin son derece yüksek olduğunu gösterir. PDF\'e göre: "HTF Gap SNR = LTF Engulfing" — yüksek zaman diliminde gap, düşük zaman diliminde engulfing olarak görünür.',
    formula: 'gap_değeri = curr.open − prev.close\n\nGap Zone   : |gap_değeri| ≥ ATR × 0.10  (+10 skor)\nKlasik Zone: |gap_değeri|  < ATR × 0.10\n\nÖnemli: Gap zone\'lar düşük zaman diliminde\n"Hidden Engulfing" olarak görünür.\nHTF Gap SNR = LTF Engulfing prensibi!',
    source: 'snrService.js detectZones() — Trading SNR the Malaysian Way'
  },
  validated: {
    title: 'Onaylı Zone (Validated)',
    description: 'Zone\'un gerçek fiyat tepkisi oluşturduğunu doğrular. İki koşuldan biri sağlanırsa zone "onaylı" sayılır ve +5 bonus alır. PDF\'e göre hızlı fiyat tepkisi = güçlü kurumsal ilgi işareti.',
    formula: 'Koşul 1: İlk dokunma pivot\'tan sonraki\n  3 bar içinde gerçekleştiyse → Onaylı\n  (Hızlı tepki = güçlü kurumsal ilgi)\n\nKoşul 2: Zone oluştu ama 5+ bar boyunca\n  hiç test edilmediyse → Onaylı (bekleniyor)\n  (Fiyat zone\'dan hızla uzaklaştı)\n\n+5 skor bonusu',
    source: 'snrService.js validateZones() — validated kontrolü'
  },
  touchCount: {
    title: 'Dokunma Sayısı (Touch Count)',
    description: 'Fiyatın o zone\'a kaç kez yaklaştığını gösterir. Malaysian SNR\'de dokunma sayısı kritiktir: PDF\'e göre "Miss" (boşluk) bulunan trendline dokunmaları daha anlamlıdır. Çok dokunma = kurumsal emirler tükenmeye başlıyor.',
    formula: 'Dokunma koşulu:\n  candle.low  ≤ zone.top\n  candle.high ≥ zone.bottom\n\nHer dokunma: −5 skor cezası\n\n0 dokunma → fresh  (+15 skor bonus)\n1–2 dokunma → tested (+5 skor bonus)\n3+ dokunma → used  (ek puan yok)\n\nMiss kuralı: Dokunmalar arasındaki boşluk\nzone\'un önemini artırır!',
    source: 'snrService.js validateZones() — Trading SNR the Malaysian Way'
  },
  entry: {
    title: 'Giriş Seviyesi (Entry) — Neden Bu Fiyat?',
    description: 'Malaysian SNR\'de giriş noktası zone\'un GÖVDE sınırından belirlenir. Destek zone\'unda zone üstü = önceki düşüş mumunun kapanış fiyatı = kurumsal alıcıların bölgeye girdiği kesin nokta. Direnç zone\'unda zone altı = önceki yükseliş mumunun açılış fiyatı = kurumsal satıcıların aktif olduğu nokta.',
    formula: 'Destek zone (long):\n  Giriş = zone.top\n  (= önceki bearish mumun kapanışı)\n  (= yeni bullish mumun açılış noktası)\n  Neden? Kurumsal alıcı emirleri burada!\n\nDirenç zone (short):\n  Giriş = zone.bottom\n  (= önceki bullish mumun kapanışı → bearish açılış)\n  Neden? Kurumsal satıcı emirleri burada!\n\nKural: Sadece wick dokunuşunda giriş yap —\ngövde dokunuşu = geç kalma işareti!',
    source: 'snrService.js scoreZones() — Trading SNR the Malaysian Way'
  },
  stop: {
    title: 'Stop Loss — Neden Bu Fiyat?',
    description: 'Stop Loss zone sınırının ÖTESINE 0.5×ATR tampon mesafe eklenerek yerleştirilir. Bu tampon kritiktir: "Likidite Süpürmesi" (wick saldırısı) sırasında fiyat kısa süreliğine zone sınırını aşabilir ama orada KAPANAMAZ. 0.5×ATR tampon bu sahte kırılmaları filtreler ve pozisyonu korur.',
    formula: 'Destek zone (long) stop:\n  Stop = zone.bottom − 0.5 × ATR\n  Neden bottom altı? Çünkü gerçek kırılma\n  ancak zone altında GÖVDE kapanışı olunca\n  gerçekleşir.\n\nDirenç zone (short) stop:\n  Stop = zone.top + 0.5 × ATR\n\nRisk = |Giriş − Stop|\n\n0.5×ATR tampon:\n  Likidite sweep (wick baskısı) koruması!\n  Küçük yatırımcı stop\'ları taranırken\n  pozisyonunuz ayakta kalır.',
    source: 'snrService.js scoreZones() — Trading SNR the Malaysian Way'
  },
  target: {
    title: 'Hedef Fiyat (Target) — Neden Bu Fiyat?',
    description: 'Kâr alınması önerilen fiyat seviyesidir. Risk/ödül oranı 1:2 olarak sabitlenmiştir; riskin iki katı kadar kazanç hedeflenir. PDF örneklerinde 1:9RR, 1:21RR, hatta 1:24.51RR başarılarına yer verilmiştir. 1:2 minimum standarttır; iyi confluence\'larda çok daha yüksek hedefler mümkündür.',
    formula: 'Risk = |Giriş - Stop|\n\nDestek zone (long):\n  Hedef = Giriş + 2 × Risk\n\nDirenç zone (short):\n  Hedef = Giriş - 2 × Risk\n\nRisk:Ödül = 1:2 (minimum)\n\nPDF örnekleri:\n  GBPJPY M45  → 1:9RR\n  XAUUSD M15  → 1:24.51RR\n  XAUUSD M5   → 1:21RR\n\nNeden 1:2? Her 3 işlemden 1 kâr bile\nyıllık pozitif beklenti sağlar.',
    source: 'snrService.js scoreZones() — Trading SNR the Malaysian Way'
  },
  engulfing: {
    title: 'Engulfing (Yutma Mumu) — Zone Teyidi',
    description: 'Malaysian SNR\'de Engulfing = Rejection or Cover Up. İkinci mumun GÖVDESI, birinci mumun GÖVDESINI tamamen yutmalıdır (wick\'ler sayılmaz). Zone yakınında engulfing = kurumsal oyuncuların o bölgede aktif işlem yaptığının kanıtı. PDF kuralı: "NO VALIDATION, NO TRADE" — trendline\'ın 1,2,3. noktalarının tamamında engulfing olmalı.',
    formula: 'Engulfing geçerlilik koşulu:\n  2. mumun gövdesi 1. mumun gövdesini\n  TAMAMEN kapsamalı (body-to-body)\n  Wick\'ler hesaba katılmaz!\n\nBullish Engulfing (Destek teyidi):\n  curr.close > prev.open (önceki top\'u geçti)\n  curr.open  < prev.close (önceki bottom altından açıldı)\n\nBearish Engulfing (Direnç teyidi):\n  curr.close < prev.open\n  curr.open  > prev.close\n\nKullanım:\n1) Zone\'u işaretlemek için\n2) Zone retest\'inde giriş teyidi\n\nNO VALIDATION, NO TRADE!',
    source: 'Trading SNR the Malaysian Way — Engulfing Patterns chapter'
  },
  sweep: {
    title: 'Likidite Süpürmesi (Liquidity Sweep) — En Güçlü Sinyal',
    description: 'Fiyatın zone sınırını wick ile kısa süreliğine aşması ama orada KAPANAMAYARAK geri dönmesidir. Bu, kurumsal oyuncuların küçük yatırımcıların stop emirlerini kasıtlı olarak tetiklediğinin ve ardından güçlü bir hareket başlattığının göstergesidir. +20 skor bonusu ile en yüksek single-factor puanıdır.',
    formula: 'Destek sweep (long sinyal güçlenir):\n  candle.low   < zone.bottom  (wick zone altına indi)\n  candle.close ≥ zone.bottom  (close zone içinde/üstünde)\n  → Kurumsal alıcılar stop\'ları temizledi!\n\nDirenç sweep (short sinyal güçlenir):\n  candle.high  > zone.top     (wick zone üstüne çıktı)\n  candle.close ≤ zone.top     (close zone içinde/altında)\n\nSweep = +20 skor bonusu\nNeden önemli? Retail stop\'lar tarandı =\nkurumsal pozisyon hazır = güçlü hareket yakın!',
    source: 'snrService.js detectLiquiditySweeps() — Smart Money Concepts'
  },
  firstTouch: {
    title: 'İlk Dokunma Kuralı — Kritik Giriş Koşulu',
    description: 'Malaysian SNR\'nin en kritik kurallarından biri: Zone\'a İLK DOKUNMA mutlaka wick (fitil/gölge) ile olmalıdır — gövde ile değil. PDF\'te büyük harflerle vurgulanır: "VALIDATION!" Gövde dokunuşu = geç kalma = güven vermiyor.',
    formula: 'Doğru giriş (wick touch):\n  Mum wick\'i zone sınırına değiyor\n  Gövde zone dışında kalıyor\n  → GİRİŞ YAP! Kurumsal tepki var.\n\nYanlış giriş (body touch):\n  Mum gövdesi zone\'a giriyor\n  → GEÇ KALDIM! Fiyat zaten içeri girdi.\n\nNeden önemli?\n  Wick = piyasa zone\'u test etti ama\n  gövde kabul etmedi = güçlü reddedilme!\n\n"THE MARKET MUST BE ABOVE OR BELOW\nTHE SNR LEVEL FIRST — THIS IS HOW\nTHE MARKET TELLS YOU WHERE THE WICK\n(TOUCH) WILL FORM." — PDF',
    source: 'Trading SNR the Malaysian Way — Touch Validation chapter'
  },
  missCandle: {
    title: 'Miss Mum (Kaçırılmış Dokunma)',
    description: 'Trendline veya zone oluştu ama fiyat birkaç bar boyunca o seviyeye dokunmadan uzaklaştıysa — bu bir "Miss" (kaçırma) durumudur. PDF\'e göre dokunmalar arasındaki boşluk (Miss), zone veya trendline\'ın önemini önemli ölçüde artırır. Pent-up (birikmiş) basınç oluşur.',
    formula: 'Miss nedir?\n  Zone oluştu → fiyat uzaklaştı\n  (dokunmadan birkaç bar geçti)\n  Sonra geri döndü ve dokundu\n\n"NOTE THAT THERE IS A MISS (SPACE)\nFROM PREVIOUS TOUCH OF TRENDLINE\nTO THE NEXT. THIS ADDS TO THE\nSIGNIFICANCE IN PRICE BREAKOUT."\n— PDF\n\nNeden önemli?\n  Bekleyen emirler birikmektedir.\n  Trendline veya zone\'a ulaştığında\n  güçlü bir tepki beklenir.',
    source: 'Trading SNR the Malaysian Way — Trendline chapter'
  },
  confluence: {
    title: 'Confluence (Kesişim Noktası) — "X Faktörü"',
    description: 'Malaysian SNR\'nin "X Faktörü" veya "Evlilik Konsepti" (Marriage Concept): İki veya üç farklı teknik faktörün aynı fiyat noktasında kesişmesi. En güçlü giriş noktaları SNR + Trendline + Engulfing\'in üçünün de buluştuğu noktalardır.',
    formula: 'Confluence örnekleri:\n  SNR + Trendline          → Güçlü\n  SNR + Engulfing          → Güçlü\n  SNR + TL + Engulfing     → Çok Güçlü\n  2 SNR aynı seviyede      → Çok Güçlü\n  Gap SNR + TL             → Çok Güçlü\n  QML SNR + TL + Engulfing → En Güçlü\n\n"MIRACLE HAPPENS WHERE MY (SLANT)\nTREND LINE INTERSECTS WITH SNR LEVEL"\n— PDF (Gold M15 örneği: 24.51RR!)\n\nBirden fazla sinyal = daha yüksek olasılık!',
    source: 'Trading SNR the Malaysian Way — The X Factor chapter'
  },
}

// ─── Ana Bileşen ──────────────────────────────────────────────────────────────
export default function MalaysianSNR() {
  const [searchParams] = useSearchParams()
  const [symbol, setSymbol]       = useState('')
  const [inputVal, setInputVal]   = useState('')
  const [assetType, setAssetType] = useState('stock') // 'stock' | 'crypto' | 'commodity'
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [scanner, setScanner]     = useState(null)
  const [scanLoading, setScanLoading] = useState(false)
  const [scanScope, setScanScope] = useState('bist100')
  const [tab, setTab]             = useState('zones')
  const [cryptoPage, setCryptoPage] = useState(0) // kripto sayfa (50'şer)
  const chartRef = useRef(null)

  // URL parametrelerinden otomatik analiz — Header arama yönlendirmesi
  // (analyze tanımlandıktan sonra çalışması için ayrı bir flag kullanıyoruz)
  const [pendingURL, setPendingURL] = useState(() => {
    const urlSymbol = searchParams.get('symbol')
    const urlType   = searchParams.get('type') || 'stock'
    return urlSymbol ? { symbol: urlSymbol.toUpperCase(), type: urlType } : null
  })

  // Toplam piyasa endeksleri — SNR analizi desteklenmiyor, sadece grafik
  const MARKET_INDEX_SYMBOLS = new Set(['TOTAL', 'TOTAL2', 'TOTAL3', 'TOTALS', 'TOTALDEFI'])

  const analyze = async (sym, type) => {
    const s = (sym || inputVal).trim().toUpperCase().replace('-USD', '')
    if (!s) return
    const t = type || assetType
    setSymbol(s)
    setAssetType(t)
    setData(null)
    setError(null)
    // Market cap endeksleri için sadece grafik göster
    if (MARKET_INDEX_SYMBOLS.has(s)) {
      setTab('zones')
      return
    }
    // Commodity sembolleri için SNR analizi desteklenmiyor — sadece grafik
    if (t === 'commodity') {
      setTab('zones')
      return
    }
    setLoading(true)
    try {
      const params = t === 'crypto' ? `?type=crypto` : ''
      const r = await api.get(`/snr/${s}${params}`)
      setData(r.data)
      setTab('zones')
    } catch (e) {
      setError(e.response?.data?.error || 'Analiz yapılamadı')
    } finally {
      setLoading(false)
    }
  }

  // URL'den gelen symbol'ü analiz et (component mount sonrası)
  useEffect(() => {
    if (pendingURL) {
      setPendingURL(null)
      analyze(pendingURL.symbol, pendingURL.type)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadScanner = async (scope = scanScope) => {
    setScanLoading(true)
    try {
      const r = await api.get('/snr/scanner', { params: { scope } })
      setScanner(r.data.results || [])
    } catch {
      setScanner([])
    } finally {
      setScanLoading(false)
    }
  }

  const freshZones = data?.zones?.filter(z => z.freshness === 'fresh') || []
  const allZones   = data?.zones || []
  const signals    = data?.signals || []

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white">Malaysian SNR</h1>
            <InfoTooltip size="lg" {...TIPS.methodology} />
          </div>
          <p className="text-xs text-gray-500 mt-0.5">Body-Bazlı Destek/Direnç — Engulfing Teyitli Sinyal Sistemi</p>
        </div>
        <button
          onClick={() => { setTab('scanner'); loadScanner() }}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <BarChart2 className="w-4 h-4" />
          BIST Tarayıcı
        </button>
      </div>

      {/* ── Varlık Tipi Seçimi ──────────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setAssetType('stock')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all ${assetType === 'stock' ? 'bg-gold-500 text-dark-950' : 'bg-dark-800 text-gray-400 hover:text-white'}`}
        >
          📈 BIST Hisseleri
        </button>
        <button
          onClick={() => setAssetType('crypto')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all ${assetType === 'crypto' ? 'bg-orange-500 text-white' : 'bg-dark-800 text-gray-400 hover:text-white'}`}
        >
          🪙 Kripto Paralar
        </button>
        <button
          onClick={() => setAssetType('commodity')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all ${assetType === 'commodity' ? 'bg-yellow-500 text-dark-950' : 'bg-dark-800 text-gray-400 hover:text-white'}`}
        >
          🏅 Kıymetli Metaller
        </button>
        {assetType === 'crypto' && TOTAL_MARKET.map(m => (
          <button key={m.symbol}
            onClick={() => { setInputVal(m.symbol); analyze(m.symbol, 'crypto') }}
            className="px-3 py-2 bg-purple-500/20 text-purple-400 border border-purple-500/30 text-xs rounded-xl hover:bg-purple-500/30 transition-colors font-medium">
            {m.label}
          </button>
        ))}
      </div>

      {/* ── Arama ──────────────────────────────────────────────────────────── */}
      <div className="card p-4">
        <div className="flex gap-2">
          <input
            className="input flex-1 text-sm"
            placeholder={assetType === 'crypto' ? 'Kripto girin: BTC, ETH, SOL, BNB...' : assetType === 'commodity' ? 'Sembol girin: XAUUSD, XAGUSD, XAUTRY' : 'Sembol girin: THYAO, GARAN, ASELS...'}
            value={inputVal}
            onChange={e => setInputVal(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && analyze()}
          />
          <button onClick={() => analyze()} disabled={loading} className="btn-primary px-5 flex items-center gap-2">
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Analiz Et
          </button>
        </div>

        {/* BIST Hızlı Erişim */}
        {assetType === 'stock' && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {POPULAR.map(s => (
              <button key={s} onClick={() => { setInputVal(s); analyze(s, 'stock') }}
                className="px-2.5 py-1 bg-dark-700 hover:bg-dark-600 text-xs text-gray-300 rounded-lg transition-colors">
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Kıymetli Metaller Hızlı Erişim */}
        {assetType === 'commodity' && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {COMMODITY_LIST.map(c => (
              <button key={c.symbol} onClick={() => { setInputVal(c.symbol); analyze(c.symbol, 'commodity') }}
                className="px-2.5 py-1 bg-yellow-500/10 border border-yellow-500/20 hover:bg-yellow-500/20 text-xs text-yellow-300 rounded-lg transition-colors font-medium">
                {c.symbol} — {c.label}
              </button>
            ))}
          </div>
        )}

        {/* Kripto Hızlı Erişim — sayfalı */}
        {assetType === 'crypto' && (
          <div className="mt-3">
            <div className="flex flex-wrap gap-1.5">
              {CRYPTO_TOP.slice(cryptoPage * 30, cryptoPage * 30 + 30).map(s => (
                <button key={s} onClick={() => { setInputVal(s); analyze(s, 'crypto') }}
                  className="px-2.5 py-1 bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/20 text-xs text-orange-300 rounded-lg transition-colors">
                  {s}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              {cryptoPage > 0 && (
                <button onClick={() => setCryptoPage(p => p - 1)}
                  className="text-xs text-gray-400 hover:text-white px-2 py-1 bg-dark-700 rounded-lg">← Önceki</button>
              )}
              {cryptoPage < Math.floor(CRYPTO_TOP.length / 30) && (
                <button onClick={() => setCryptoPage(p => p + 1)}
                  className="text-xs text-gray-400 hover:text-white px-2 py-1 bg-dark-700 rounded-lg">Sonraki → ({CRYPTO_TOP.length - (cryptoPage+1)*30} kaldı)</button>
              )}
              <span className="text-xs text-gray-600 self-center">{cryptoPage * 30 + 1}–{Math.min((cryptoPage+1)*30, CRYPTO_TOP.length)} / {CRYPTO_TOP.length} kripto</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Hata ───────────────────────────────────────────────────────────── */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3 text-red-400">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* ── Kıymetli Metal bilgi kartı ──────────────────────────────────────── */}
      {symbol && assetType === 'commodity' && !loading && (
        <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl flex items-center gap-3">
          <span className="text-2xl">🏅</span>
          <div>
            <p className="text-white font-semibold">
              {symbol === 'XAUUSD' ? 'Altın (Ons) — USD'
                : symbol === 'XAGUSD' ? 'Gümüş (Ons) — USD'
                : symbol === 'XAUTRY' ? 'Altın — TL'
                : symbol}
            </p>
            <p className="text-gray-400 text-xs mt-0.5">Kıymetli metaller için SNR analizi desteklenmiyor — grafik gösteriliyor</p>
          </div>
        </div>
      )}

      {/* ── Toplam Piyasa Endeksi bilgi kartı (sadece TOTAL* semboller için) ── */}
      {symbol && MARKET_INDEX_SYMBOLS.has(symbol) && !data && !loading && (
        <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl flex items-center gap-3">
          <span className="text-2xl">🌐</span>
          <div>
            <p className="text-white font-semibold">
              {symbol === 'TOTAL' ? 'Toplam Kripto Piyasa Değeri'
                : symbol === 'TOTAL2' ? 'Total S — BTC Hariç Kripto (Altcoin)'
                : 'Total3 — BTC + ETH Hariç Kripto'}
            </p>
            <p className="text-gray-400 text-xs mt-0.5">Piyasa endeksleri için SNR analizi desteklenmiyor — grafik gösteriliyor</p>
          </div>
        </div>
      )}

      {/* ── Grafik — symbol seçilince göster ──────────────────────────────── */}
      {symbol && !loading && (
        <SnrChart symbol={symbol} assetType={assetType} data={data} />
      )}

      {/* ── Analiz Özet Kartı ──────────────────────────────────────────────── */}
      {data && !loading && (() => {
        const cfg = STORYLINE_CONFIG[data.storyline] || STORYLINE_CONFIG.neutral
        const topSig = data.signals?.[0]
        const supportZones = data.zones?.filter(z => z.type === 'support') || []
        const resistZones = data.zones?.filter(z => z.type === 'resistance') || []
        const freshCount = data.zones?.filter(z => z.freshness === 'fresh').length || 0
        const candleCount = data.candleCount || data.zones?.length * 5 || '~180'
        const rr = topSig ? Math.abs((topSig.target - topSig.entry) / (topSig.entry - topSig.stop)).toFixed(1) : null
        return (
          <div className="card p-5 space-y-4 border border-dark-600">
            <div className="flex items-center gap-2 pb-3 border-b border-dark-700">
              <Shield className="w-5 h-5 text-gold-400" />
              <h3 className="font-bold text-white text-sm">Malaysian SNR Analiz Raporu — {symbol}</h3>
            </div>

            {/* Ne analiz edildi */}
            <div className="bg-dark-800/60 rounded-lg p-3 space-y-1 text-xs text-gray-400">
              <p className="text-gray-300 font-medium mb-1">📊 Ne Analiz Edildi?</p>
              <p>• <span className="text-white">~180 günlük</span> kapanış verisi incelendi ({assetType === 'crypto' ? 'Kripto' : 'BIST'} — günlük zaman dilimi)</p>
              <p>• Gövde oranı <span className="text-white">≥%30</span> olan mumlar filtrelendi (Malaysian SNR kuralı: wick değil gövde bazlı)</p>
              <p>• <span className="text-white">Bearish→Bullish</span> geçişlerde Destek, <span className="text-white">Bullish→Bearish</span> geçişlerde Direnç zone'ları tespit edildi</p>
              <p>• Her zone için <span className="text-white">tazelik, engulfing, likidite süpürmesi</span> ve storyline uyumu skorlandı</p>
            </div>

            {/* Sonuçlar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="bg-dark-800 rounded-lg p-3 text-center">
                <p className="text-gray-500 mb-1">Trend Yönü</p>
                <p className={`font-bold text-sm ${cfg.color}`}>{cfg.label}</p>
                <p className="text-gray-600 text-[10px] mt-0.5">EMA20/50 bazlı</p>
              </div>
              <div className="bg-dark-800 rounded-lg p-3 text-center">
                <p className="text-gray-500 mb-1">ATR (Oynaklık)</p>
                <p className="font-bold text-sm text-white">{data.atr?.toFixed(2)}</p>
                <p className="text-gray-600 text-[10px] mt-0.5">Stop tamponu: {(data.atr * 0.5)?.toFixed(2)}</p>
              </div>
              <div className="bg-dark-800 rounded-lg p-3 text-center">
                <p className="text-gray-500 mb-1">Zone Dağılımı</p>
                <p className="font-bold text-sm text-white">{supportZones.length}D / {resistZones.length}R</p>
                <p className="text-gray-600 text-[10px] mt-0.5">{freshCount} taze zone</p>
              </div>
              <div className="bg-dark-800 rounded-lg p-3 text-center">
                <p className="text-gray-500 mb-1">Aktif Sinyal</p>
                <p className="font-bold text-sm text-gold-400">{data.signals?.length || 0}</p>
                <p className="text-gray-600 text-[10px] mt-0.5">Skor ≥50 zone</p>
              </div>
            </div>

            {/* En iyi sinyal detayı */}
            {topSig && (
              <div className={`rounded-lg p-4 border space-y-3 ${topSig.type === 'support' ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-sm font-bold text-white">
                    {topSig.type === 'support' ? '🟢 En Güçlü LONG Sinyali' : '🔴 En Güçlü SHORT Sinyali'}
                    {topSig.grade && <span className={`ml-2 text-xs px-1.5 py-0.5 rounded border ${GRADE_COLORS[topSig.grade]}`}>{topSig.grade}</span>}
                  </p>
                  {rr && <span className="text-xs text-gray-400">Risk/Ödül: <span className="text-gold-400 font-bold">1:{rr}</span></span>}
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="text-center bg-blue-500/10 border border-blue-500/20 rounded-lg p-2 min-w-0">
                    <p className="text-blue-400 font-bold text-base">{topSig.entry?.toFixed(2)}</p>
                    <p className="text-gray-500 text-[10px] truncate">▶ GİRİŞ</p>
                  </div>
                  <div className="text-center bg-red-500/10 border border-red-500/20 rounded-lg p-2 min-w-0">
                    <p className="text-red-400 font-bold text-base">{topSig.stop?.toFixed(2)}</p>
                    <p className="text-gray-500 text-[10px] truncate">✕ STOP</p>
                  </div>
                  <div className="text-center bg-green-500/10 border border-green-500/20 rounded-lg p-2 min-w-0">
                    <p className="text-green-400 font-bold text-base">{topSig.target?.toFixed(2)}</p>
                    <p className="text-gray-500 text-[10px] truncate">★ Hedef</p>
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  {topSig.type === 'support'
                    ? `${symbol} fiyatı ${topSig.entry?.toFixed(2)} destek zone'una yaklaşırken LONG pozisyon değerlendirilebilir. Zone ${topSig.freshness === 'fresh' ? 'taze (daha önce test edilmedi) — kurumsal alıcılar aktif olabilir.' : 'daha önce test edilmiş — dikkatli yaklaşım önerilir.'} Stop ${topSig.stop?.toFixed(2)} altına konularak likidite süpürmesi korunur.`
                    : `${symbol} fiyatı ${topSig.entry?.toFixed(2)} direnç zone'una yaklaşırken SHORT pozisyon değerlendirilebilir. Zone ${topSig.freshness === 'fresh' ? 'taze — kurumsal satıcılar bölgeyi savunabilir.' : 'test edilmiş — ikinci direnç zayıflama işareti.'} Stop ${topSig.stop?.toFixed(2)} üstüne konulur.`
                  }
                </p>
              </div>
            )}

            <p className="text-[10px] text-gray-600 text-center">⚠️ Bu analiz yatırım tavsiyesi değildir. Malaysian SNR — Body-Bazlı Destek/Direnç Metodolojisi</p>
          </div>
        )
      })()}

      {/* ── Sonuçlar ───────────────────────────────────────────────────────── */}
      {data && (
        <>
          {/* Storyline + Özet */}
          {(() => {
            const cfg = STORYLINE_CONFIG[data.storyline] || STORYLINE_CONFIG.neutral
            const StoryIcon = cfg.icon
            return (
              <div className={`p-4 border rounded-xl flex items-center gap-4 ${cfg.bg}`}>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-black/20">
                  <StoryIcon className={`w-6 h-6 ${cfg.color}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-lg font-bold text-white">{symbol}</span>
                    <span className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</span>
                    <InfoTooltip {...TIPS.storyline} />
                  </div>
                  <div className="flex gap-4 mt-1 text-xs text-gray-400 flex-wrap">
                    <span className="flex items-center gap-1">
                      ATR: <span className="text-white">{data.atr?.toFixed(2) || '—'}</span>
                      <InfoTooltip {...TIPS.atr} />
                    </span>
                    <span className="flex items-center gap-1">
                      Zonlar: <span className="text-white">{allZones.length}</span>
                      <InfoTooltip {...TIPS.zone} />
                    </span>
                    <span>Taze: <span className="text-green-400">{freshZones.length}</span></span>
                    <span className="flex items-center gap-1">
                      Sinyal: <span className="text-gold-400">{signals.length}</span>
                      <InfoTooltip {...TIPS.grade} />
                    </span>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* ── Taze Zone Listesi ───────────────────────────────────────────── */}
          <div className="card p-0 overflow-hidden">
            <div className="p-3 border-b border-dark-700 flex items-center gap-2">
              <p className="text-xs font-medium text-gray-300">Taze Zone Seviyeleri</p>
              <span className="text-[10px] text-gray-500">— Kırılmamış destek/direnç bölgeleri</span>
              <InfoTooltip {...TIPS.freshness} />
            </div>
            <div className="p-4 space-y-2">
              {freshZones.slice(0, 6).map(z => (
                <div key={z.id} className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${z.type === 'support' ? 'bg-green-400' : 'bg-red-400'}`} />
                  <div className="flex-1 flex items-center gap-2">
                    <span className={`text-xs font-medium ${z.type === 'support' ? 'text-green-400' : 'text-red-400'}`}>
                      {z.type === 'support' ? 'DESTEK' : 'DİRENÇ'}
                    </span>
                    {z.zoneType === 'gap' && (
                      <span className="text-[10px] text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded">Gap</span>
                    )}
                    {z.validated && (
                      <span className="text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">Onaylı</span>
                    )}
                  </div>
                  <span className="text-xs text-white font-mono">{z.bottom?.toFixed(2)} – {z.top?.toFixed(2)}</span>
                  {z.grade && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${GRADE_COLORS[z.grade]}`}>{z.grade}</span>
                  )}
                  <span className="text-xs text-gray-500">{z.score}p</span>
                </div>
              ))}
              {freshZones.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-4">Taze zone bulunamadı</p>
              )}
            </div>
          </div>

          {/* ── Sekmeler ────────────────────────────────────────────────────── */}
          <div className="flex gap-1 bg-dark-800 p-1 rounded-xl">
            {[
              { id: 'zones',   label: `Tüm Zonlar (${allZones.length})` },
              { id: 'signals', label: `Sinyaller (${signals.length})` },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${tab === t.id ? 'bg-gold-500 text-dark-950' : 'text-gray-400 hover:text-white'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'zones' && (
            <div className="space-y-2">
              {allZones.length === 0
                ? <div className="text-center py-8 text-gray-500 text-sm">Zone bulunamadı</div>
                : allZones.map(z => <ZoneCard key={z.id} zone={z} />)}
            </div>
          )}

          {tab === 'signals' && (
            <div className="space-y-3">
              {signals.length === 0
                ? <div className="text-center py-8 text-gray-500 text-sm">Aktif sinyal yok</div>
                : signals.map((sig, i) => <SignalCard key={sig.id} sig={sig} rank={i + 1} />)}
            </div>
          )}
        </>
      )}

      {/* ── Scanner ────────────────────────────────────────────────────────── */}
      {tab === 'scanner' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-white">BIST Yüksek Puanlı Sinyaller</h2>
              <InfoTooltip {...TIPS.score} />
            </div>
            <button onClick={() => loadScanner()} disabled={scanLoading} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1">
              <RefreshCw className={`w-3 h-3 ${scanLoading ? 'animate-spin' : ''}`} />
              Yenile
            </button>
          </div>

          {/* Tarama kapsamı seçici */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400">Kapsam:</span>
            {[
              { id: 'bist30',  label: 'BIST30',  hint: '~10 sn' },
              { id: 'bist100', label: 'BIST100', hint: '~30 sn', recommended: true },
              { id: 'all',     label: 'Tümü',    hint: '2-3 dk' },
            ].map(opt => (
              <button
                key={opt.id}
                onClick={() => { setScanScope(opt.id); loadScanner(opt.id) }}
                disabled={scanLoading}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition disabled:opacity-50 ${
                  scanScope === opt.id
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-200'
                    : 'bg-dark-700 border-dark-600 text-gray-400 hover:text-white'
                }`}
              >
                {opt.label}
                {opt.recommended && scanScope !== opt.id && <span className="ml-1 text-[8px] text-emerald-400">★</span>}
                <span className="ml-1 text-[9px] opacity-70">{opt.hint}</span>
              </button>
            ))}
          </div>

          {scanLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-gold-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-400">{scanScope === 'all' ? 'Tüm BIST' : scanScope === 'bist100' ? 'BIST100' : 'BIST30'} taranıyor...</p>
              </div>
            </div>
          ) : scanner === null ? (
            <div className="text-center py-8 text-gray-500 text-sm">Tarama başlatmak için "BIST Tarayıcı" butonuna tıklayın</div>
          ) : scanner.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">Aktif sinyal bulunamadı</div>
          ) : scanner.map((item, i) => (
            <div key={item.symbol} onClick={() => { analyze(item.symbol); setTab('signals') }}
              className="card cursor-pointer hover:border-gold-500/40 flex items-center gap-4">
              <span className="text-lg font-bold text-gray-500 w-6 text-center">#{i + 1}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white">{item.symbol}</span>
                  {(() => {
                    const cfg = STORYLINE_CONFIG[item.storyline] || STORYLINE_CONFIG.neutral
                    const Icon = cfg.icon
                    return <Icon className={`w-4 h-4 ${cfg.color}`} />
                  })()}
                </div>
                <p className="text-xs text-gray-500">{item.name}</p>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-2 justify-end">
                  {item.topSignal.grade && (
                    <span className={`text-xs px-2 py-0.5 rounded border font-bold ${GRADE_COLORS[item.topSignal.grade]}`}>
                      {item.topSignal.grade}
                    </span>
                  )}
                  <span className="text-lg font-bold text-white">{item.topSignal.score}</span>
                </div>
                <p className={`text-xs ${item.topSignal.type === 'support' ? 'text-green-400' : 'text-red-400'}`}>
                  {item.topSignal.type === 'support' ? 'Destek' : 'Direnç'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── ZoneCard ─────────────────────────────────────────────────────────────────
function ZoneCard({ zone }) {
  const isSupport = zone.type === 'support'
  return (
    <div className={`card flex items-center gap-3 ${zone.freshness === 'fresh' ? (isSupport ? 'border-green-500/30' : 'border-red-500/30') : 'opacity-60'}`}>
      <div className={`w-2 h-10 rounded-full flex-shrink-0 ${isSupport ? 'bg-green-500' : 'bg-red-500'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-bold ${isSupport ? 'text-green-400' : 'text-red-400'}`}>
            {isSupport ? 'DESTEK' : 'DİRENÇ'}
          </span>
          <span className="flex items-center gap-1 text-xs text-gray-500">
            {zone.zoneType === 'gap' ? 'Gap Zone' : 'Klasik'}
            <InfoTooltip {...TIPS.zoneType} />
          </span>
          <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full ${
            zone.freshness === 'fresh'  ? 'bg-green-500/20 text-green-400' :
            zone.freshness === 'tested' ? 'bg-yellow-500/20 text-yellow-400' :
            'bg-gray-500/20 text-gray-400'
          }`}>
            {zone.freshness}
            <InfoTooltip {...TIPS.freshness} />
          </span>
        </div>
        <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
          Dokunma: {zone.touchCount}
          <InfoTooltip {...TIPS.touchCount} />
          {zone.validated && <span className="ml-2 flex items-center gap-1 text-blue-400">Onaylı<InfoTooltip {...TIPS.validated} /></span>}
        </div>
      </div>
      <div className="text-right">
        <p className="text-sm font-mono text-white">{zone.bottom?.toFixed(2)}–{zone.top?.toFixed(2)}</p>
        <div className="flex items-center gap-1 justify-end mt-0.5">
          {zone.grade && (
            <span className={`flex items-center gap-1 text-[10px] px-1.5 rounded border font-bold ${GRADE_COLORS[zone.grade] || ''}`}>
              {zone.grade}
              <InfoTooltip {...TIPS.grade} />
            </span>
          )}
          <span className="flex items-center gap-1 text-xs text-gray-500">
            {zone.score}
            <InfoTooltip {...TIPS.score} />
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── SignalCard ───────────────────────────────────────────────────────────────
function SignalCard({ sig, rank }) {
  const isSupport = sig.type === 'support'
  const risk      = Math.abs((sig.entry || 0) - (sig.stop || 0))
  const atrBuffer = isSupport
    ? Math.abs((sig.stop || 0) - (sig.bottom || 0)).toFixed(2)
    : Math.abs((sig.stop || 0) - (sig.top || 0)).toFixed(2)

  // Skor gerekçe etiketleri
  const scoreReasons = [
    sig.freshness === 'fresh'  && 'Taze zone (+15)',
    sig.freshness === 'tested' && 'Test edilmiş (+5)',
    sig.validated              && 'Onaylı (+5)',
    sig.zoneType === 'gap'     && 'Gap zone (+10)',
  ].filter(Boolean)

  return (
    <div className={`card border-2 ${isSupport ? 'border-green-500/30' : 'border-red-500/30'}`}>

      {/* ── Başlık ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-gray-500 font-bold">#{rank}</span>
          <span className={`font-bold ${isSupport ? 'text-green-400' : 'text-red-400'}`}>
            {isSupport ? '↑ DESTEK' : '↓ DİRENÇ'}
          </span>
          {sig.grade && (
            <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded border font-bold ${GRADE_COLORS[sig.grade]}`}>
              {sig.grade}
              <InfoTooltip {...TIPS.grade} />
            </span>
          )}
          {sig.zoneType === 'gap' && (
            <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded-full">
              Gap Zone <InfoTooltip {...TIPS.zoneType} />
            </span>
          )}
        </div>
        <div className="text-right flex items-center gap-1">
          <div>
            <span className="text-2xl font-bold text-white">{sig.score}</span>
            <p className="text-xs text-gray-500">/ 100</p>
          </div>
          <InfoTooltip {...TIPS.score} />
        </div>
      </div>

      {/* ── Giriş / Stop / Hedef Kutuları ──────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 text-sm">
        {/* Zone */}
        <div className="bg-dark-800 rounded-lg p-2.5 text-center">
          <div className="text-[10px] text-gray-500 uppercase mb-1 flex items-center justify-center gap-1">
            Zone <InfoTooltip {...TIPS.zone} />
          </div>
          <p className="font-mono text-xs text-white">{sig.bottom?.toFixed(2)}</p>
          <p className="text-gray-600 text-[10px]">—</p>
          <p className="font-mono text-xs text-white">{sig.top?.toFixed(2)}</p>
        </div>

        {/* Giriş */}
        <div className={`rounded-lg p-2.5 text-center ${isSupport ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
          <div className="text-[10px] text-gray-500 uppercase mb-1 flex items-center justify-center gap-1">
            <Target className="w-3 h-3" /> Giriş <InfoTooltip {...TIPS.entry} />
          </div>
          <p className={`font-mono font-bold text-sm ${isSupport ? 'text-green-400' : 'text-red-400'}`}>
            {sig.entry?.toFixed(2)}
          </p>
          <p className="text-[10px] text-gray-500 mt-0.5">
            {isSupport ? 'zone üstü' : 'zone altı'}
          </p>
        </div>

        {/* Stop + Hedef */}
        <div className="bg-dark-800 rounded-lg p-2.5 text-center">
          <div className="text-[10px] text-gray-500 uppercase mb-1 flex items-center justify-center gap-1">
            <Shield className="w-3 h-3" /> Stop <InfoTooltip {...TIPS.stop} />
          </div>
          <p className="font-mono text-red-400 text-xs font-bold">{sig.stop?.toFixed(2)}</p>
          <div className="border-t border-dark-700 mt-1.5 pt-1.5">
            <div className="text-[10px] flex items-center justify-center gap-1 text-gray-500 mb-0.5">
              <Zap className="w-3 h-3 text-yellow-400" /> Hedef <InfoTooltip {...TIPS.target} />
            </div>
            <span className="font-mono text-yellow-300 text-xs font-bold">{sig.target?.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* ── NEDEN Bu Tavsiye? — PDF Gerekçeleri ────────────────────────────── */}
      <div className="mt-3 bg-dark-900/80 rounded-lg p-3 border border-dark-700/60 space-y-2">
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-gold-500/40 inline-block" />
          Bu tavsiyeyi neden veriyoruz?
        </p>

        {/* Giriş gerekçesi */}
        <div className="flex items-start gap-2">
          <Target className="w-3 h-3 text-green-400 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-gray-300 leading-relaxed">
            <span className={`font-semibold ${isSupport ? 'text-green-400' : 'text-red-400'}`}>
              Giriş @ {sig.entry?.toFixed(2)}:
            </span>{' '}
            {isSupport
              ? 'Zone üstü = önceki düşüş mumunun GÖVDE kapanış noktası. Yükseliş mumu tam burada açıldı — kurumsal alıcı emirlerinin yoğunlaştığı kesin bölge. İlk dokunma wick ile olmalı, gövde değil!'
              : 'Zone altı = önceki yükseliş mumunun GÖVDE açılış noktası. Düşüş mumu tam burada kapandı — kurumsal satıcı emirlerinin yoğunlaştığı kesin bölge. İlk dokunma wick ile olmalı, gövde değil!'}
            <span className="ml-1"><InfoTooltip {...TIPS.firstTouch} /></span>
          </p>
        </div>

        {/* Stop gerekçesi */}
        <div className="flex items-start gap-2">
          <Shield className="w-3 h-3 text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-gray-300 leading-relaxed">
            <span className="font-semibold text-red-400">Stop @ {sig.stop?.toFixed(2)}:</span>{' '}
            Zone {isSupport ? 'altına' : 'üstüne'} {atrBuffer} TL (0.5×ATR) tampon eklendi.
            {' '}Likidite Süpürmesi (wick saldırısı) zone sınırını kısa süreliğine geçebilir ama orada <em>kapanamaz</em>.
            {' '}Bu tampon o sahte kırılmalardan korur — stop asla zone'un tam sınırına konmaz.
            <span className="ml-1"><InfoTooltip {...TIPS.sweep} /></span>
          </p>
        </div>

        {/* Hedef gerekçesi */}
        <div className="flex items-start gap-2">
          <Zap className="w-3 h-3 text-yellow-400 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-gray-300 leading-relaxed">
            <span className="font-semibold text-yellow-400">Hedef @ {sig.target?.toFixed(2)}:</span>{' '}
            Risk = {risk.toFixed(2)} TL → Hedef = Giriş {isSupport ? '+' : '-'} 2×Risk = {(risk * 2).toFixed(2)} TL kâr.
            {' '}Malaysian SNR minimum 1:2 RR standardı. PDF'teki gerçek örnekler: 1:9RR (GBPJPY), 1:21RR (XAUUSD M5), 1:24.51RR (XAUUSD M15).
            <span className="ml-1"><InfoTooltip {...TIPS.target} /></span>
          </p>
        </div>

        {/* Skor gerekçesi */}
        {scoreReasons.length > 0 && (
          <div className="flex items-start gap-2">
            <span className="text-yellow-400 text-xs font-bold flex-shrink-0 mt-0.5">★</span>
            <p className="text-[11px] text-gray-300 leading-relaxed">
              <span className="font-semibold text-yellow-400">Skor {sig.score}/100 — {sig.grade}:</span>{' '}
              {scoreReasons.join(' · ')}.
              {sig.freshness === 'fresh' && ' Taze zone = kurumsal emirler henüz dolmadı — en güçlü sinyal adayı.'}
              {sig.zoneType === 'gap' && ' Gap zone = HTF Hidden Engulfing ile eşdeğer; düşük TF\'de engulfing olarak görünür.'}
              <span className="ml-1"><InfoTooltip {...TIPS.confluence} /></span>
            </p>
          </div>
        )}
      </div>

      {/* ── Etiketler ──────────────────────────────────────────────────────── */}
      <div className="flex gap-2 mt-2.5 flex-wrap items-center">
        {sig.validated && (
          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-full">
            Onaylı <InfoTooltip {...TIPS.validated} />
          </span>
        )}
        <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-dark-700 text-gray-400 rounded-full">
          {sig.freshness} <InfoTooltip {...TIPS.freshness} />
        </span>
        <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-dark-700 text-gray-400 rounded-full">
          {sig.touchCount} dokunma <InfoTooltip {...TIPS.touchCount} />
        </span>
        <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded-full">
          1:{(risk > 0 ? (Math.abs((sig.target || 0) - (sig.entry || 0)) / risk).toFixed(1) : '2')} RR
        </span>
      </div>
    </div>
  )
}
