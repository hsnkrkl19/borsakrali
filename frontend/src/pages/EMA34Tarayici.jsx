import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { TrendingUp, TrendingDown, RefreshCw, Search, Activity, ArrowUp, ArrowDown, Waves, ChevronsUp, ChevronsDown } from 'lucide-react'
import api from '../services/api'
import InfoTooltip from '../components/InfoTooltip'

// Sinyal yapılandırması — 8 farklı durum
const SIGNAL_CONFIG = {
  wave_long:     { label: '🌊 Dalga AL (Dönüş)',         short: '🌊 Dalga AL',   color: 'text-emerald-300', bg: 'bg-emerald-500/25 border-emerald-500/60', icon: Waves },
  cross_above:   { label: '↑ Yön Yukarı Döndü',           short: '↑ Yön Yukarı',  color: 'text-green-400',   bg: 'bg-green-500/20 border-green-500/40',     icon: ArrowUp },
  trending_up:   { label: '⇈ Güçlü Yükseliş (5+ bar)',    short: '⇈ Yükselişte',  color: 'text-green-300',   bg: 'bg-green-500/15 border-green-500/30',     icon: ChevronsUp },
  above:         { label: '✓ Yön Yukarıda',               short: '✓ Yukarıda',    color: 'text-green-200',   bg: 'bg-green-500/10 border-green-500/20',     icon: TrendingUp },
  below:         { label: '✗ Yön Aşağıda',                short: '✗ Aşağıda',     color: 'text-red-200',     bg: 'bg-red-500/10 border-red-500/20',         icon: TrendingDown },
  trending_down: { label: '⇊ Güçlü Düşüş (5+ bar)',       short: '⇊ Düşüşte',     color: 'text-red-300',     bg: 'bg-red-500/15 border-red-500/30',         icon: ChevronsDown },
  cross_below:   { label: '↓ Yön Aşağı Döndü',            short: '↓ Yön Aşağı',   color: 'text-red-400',     bg: 'bg-red-500/20 border-red-500/40',         icon: ArrowDown },
  wave_short:    { label: '🌊 Dalga SAT (Dönüş)',         short: '🌊 Dalga SAT',  color: 'text-red-300',     bg: 'bg-red-500/25 border-red-500/60',         icon: Waves },
}

const SLOPE_BADGE = {
  up:   { label: '↗ Yukarı eğim', color: 'bg-green-500/20 text-green-300' },
  flat: { label: '→ Yatay',       color: 'bg-gray-500/20 text-gray-300' },
  down: { label: '↘ Aşağı eğim',  color: 'bg-red-500/20 text-red-300' },
}

const EMA34_TIP = {
  title: 'EMA34 (Bill Williams) — Wave Rider Sistemi',
  description: 'Klasik tek-geçişli 34 periyot Üstel Hareketli Ortalama. Fibonacci sayısı (34) piyasada doğal destek/direnç oluşturur; profesyonel trader\'ların favori seviyesidir. TEMA34\'ten farkı: gecikme yüksek ama gürültü düşük → güvenilir uzun vadeli trend rejimi filtresi. Bill Williams\'ın "Wave Rider" stratejisi 3 adımda çalışır: (1) trend kurulması (5+ ardışık bar bir tarafta), (2) EMA34\'e geri çekilme (pullback), (3) trend yönünde tepki kapanışı = yüksek olasılıklı giriş.',
  formula: 'EMA — Exponential Moving Average (length = 34)\n\nk = 2 / (34 + 1) ≈ 0.0571\nEMA_0 = SMA(Kapanış, 34)   [SMA seed]\nEMA_t = Kapanış_t × k + EMA_{t-1} × (1 − k)\n\n══ Wave Long Sinyali ══\n  • Önce 5+ ardışık bar EMA34 üzerinde kapanmış (trend onayı)\n  • Son 5 bar içinde fiyat EMA34\'e dokunmuş (low ≤ EMA ≤ high)\n  • Şu an Kapanış > EMA34 + EMA34 eğimi yukarı → GİRİŞ\n\n══ Wave Short Sinyali ══\n  • Önce 5+ ardışık bar EMA34 altında kapanmış\n  • Pullback dokunuş + eğim aşağı → SHORT GİRİŞ\n\n══ Trend Modu ══\n  • Trending Up: 5+ bar üstte + slope > +%0.3\n  • Trending Down: 5+ bar altta + slope < −%0.3\n\n══ Skor (0-100) ══\n  Wave Long: 90 | Cross Above: 80 | Trending Up: 75 | Above: 60\n  Below: 40 | Trending Down: 25 | Cross Below: 20 | Wave Short: 10\n  Eğim bonusu: ±5\n\n══ Mesafe ölçümü ══\n  • % uzaklık: (Kapanış − EMA) / EMA × 100\n  • ATR uzaklık: (Kapanış − EMA) / ATR(14)  [normalize]',
  source: 'Bill Williams "Trading Chaos" — 34 EMA Wave Rider stratejisi'
}

export default function EMA34Tarayici() {
  const [searchParams] = useSearchParams()
  const [scanData, setScanData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [trackInput, setTrackInput] = useState('')
  const [trackData, setTrackData] = useState(null)
  const [trackLoading, setTrackLoading] = useState(false)
  const [listParam, setListParam] = useState('bist30')
  const [filterSignal, setFilterSignal] = useState('all')

  const runScan = async (list = listParam) => {
    setLoading(true)
    setScanData(null)
    try {
      const r = await api.get(`/ema34/scan?list=${list}`)
      setScanData(r.data)
    } catch (e) {
      setScanData({ error: e.response?.data?.error || 'Tarama hatası' })
    } finally {
      setLoading(false)
    }
  }

  const trackStock = async (sym, forceType) => {
    const s = (sym || trackInput).trim().toUpperCase()
    if (!s) return
    const isCrypto = forceType === 'crypto' || listParam === 'crypto'
    setTrackLoading(true)
    setTrackData(null)
    try {
      const typeParam = isCrypto ? '?type=crypto' : ''
      const r = await api.get(`/ema34/track/${s}${typeParam}`)
      setTrackData(r.data)
    } catch (e) {
      setTrackData({ error: e.response?.data?.error || 'Takip hatası' })
    } finally {
      setTrackLoading(false)
    }
  }

  useEffect(() => { runScan() }, [])

  useEffect(() => {
    const urlSym = searchParams.get('symbol')
    const urlType = searchParams.get('type')
    if (urlSym) {
      const s = urlSym.toUpperCase()
      setTrackInput(s)
      trackStock(s, urlType === 'crypto' ? 'crypto' : 'stock')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredResults = scanData?.results?.filter(r =>
    filterSignal === 'all' || r.signal === filterSignal
  ) || []

  return (
    <div className="space-y-6">
      {/* Başlık */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            EMA34 Wave Rider
            <InfoTooltip size="lg" {...EMA34_TIP} />
          </h1>
          <p className="text-gray-400 text-sm mt-1">Bill Williams 34 EMA — Trend filtresi + Pullback giriş sistemi</p>
        </div>
        <button onClick={() => runScan(listParam)} disabled={loading} className="btn-secondary flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </button>
      </div>

      {/* Liste seçici + Filtre */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-2">
          {['bist30', 'bist100', 'all', 'crypto'].map(l => (
            <button
              key={l}
              onClick={() => { setListParam(l); runScan(l) }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                listParam === l
                  ? l === 'crypto' ? 'bg-orange-500 text-white' : 'bg-primary-600 text-white'
                  : 'bg-dark-800 text-gray-400 hover:text-white'
              }`}
            >
              {l === 'bist30' ? 'BIST30' : l === 'bist100' ? 'BIST100' : l === 'crypto' ? '🪙 Kripto (40)' : 'Tümü'}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 ml-auto flex-wrap">
          {['all', 'wave_long', 'cross_above', 'trending_up', 'trending_down', 'cross_below', 'wave_short'].map(s => (
            <button
              key={s}
              onClick={() => setFilterSignal(s)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${filterSignal === s ? 'bg-primary-600 text-white' : 'bg-dark-800 text-gray-400 hover:text-white'}`}
            >
              {s === 'all' ? 'Tümü' : SIGNAL_CONFIG[s]?.short}
            </button>
          ))}
        </div>
      </div>

      {/* Özet kartlar — 8 sinyal türü */}
      {scanData && !scanData.error && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { key: 'waveLong',     label: '🌊 Wave Long',    color: 'text-emerald-300', bg: 'bg-emerald-500/15' },
            { key: 'crossAbove',   label: '↑ Yeni Kırılım',  color: 'text-green-400',   bg: 'bg-green-500/10' },
            { key: 'trendingUp',   label: '⇈ Trend Boğa',    color: 'text-green-300',   bg: 'bg-green-500/5' },
            { key: 'above',        label: '✓ Üzerinde',      color: 'text-green-200',   bg: 'bg-green-500/5' },
            { key: 'below',        label: '✗ Altında',       color: 'text-red-200',     bg: 'bg-red-500/5' },
            { key: 'trendingDown', label: '⇊ Trend Ayı',     color: 'text-red-300',     bg: 'bg-red-500/5' },
            { key: 'crossBelow',   label: '↓ Yeni İniş',     color: 'text-red-400',     bg: 'bg-red-500/10' },
            { key: 'waveShort',    label: '🌊 Wave Short',   color: 'text-red-300',     bg: 'bg-red-500/15' },
          ].map(({ key, label, color, bg }) => (
            <div key={key} className={`card text-center ${bg}`}>
              <div className={`text-2xl font-bold ${color}`}>{scanData[key] || 0}</div>
              <div className="text-xs text-gray-500 mt-1">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Hisse Takip Arama */}
      <div className="card">
        <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary-400" />
          Tekil Hisse EMA34 Takibi
        </h3>
        <div className="flex gap-2">
          <input
            value={trackInput}
            onChange={e => setTrackInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && trackStock()}
            placeholder="Sembol: THYAO, GARAN..."
            className="flex-1 bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary-500"
          />
          <button onClick={() => trackStock()} disabled={trackLoading} className="btn-primary flex items-center gap-2">
            <Search className="w-4 h-4" />
            Takip Et
          </button>
        </div>

        {trackLoading && (
          <div className="flex items-center justify-center py-6">
            <RefreshCw className="w-5 h-5 text-primary-400 animate-spin" />
            <span className="text-gray-400 ml-2">Veri çekiliyor...</span>
          </div>
        )}

        {trackData && !trackData.error && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xl font-bold text-white">{trackData.symbol}</span>
              {trackData.activeSignal && SIGNAL_CONFIG[trackData.activeSignal] && (
                <span className={`px-3 py-1 rounded-full text-sm font-bold border ${SIGNAL_CONFIG[trackData.activeSignal].bg} ${SIGNAL_CONFIG[trackData.activeSignal].color}`}>
                  {SIGNAL_CONFIG[trackData.activeSignal].label}
                </span>
              )}
              {trackData.slopeDir && (
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${SLOPE_BADGE[trackData.slopeDir].color}`}>
                  {SLOPE_BADGE[trackData.slopeDir].label} ({trackData.slopePct >= 0 ? '+' : ''}{trackData.slopePct}%)
                </span>
              )}
              <span className="text-gray-400 text-sm">
                {trackData.consecutiveDaysAbove > 0
                  ? `${trackData.consecutiveDaysAbove} gün üst üste EMA üzerinde`
                  : trackData.consecutiveDaysBelow > 0
                    ? `${trackData.consecutiveDaysBelow} gün üst üste EMA altında`
                    : ''}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="bg-dark-800 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500 mb-1">Son Kapanış</div>
                <div className="font-mono font-bold text-white">{trackData.lastClose?.toFixed(2)}</div>
              </div>
              <div className="bg-dark-800 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500 mb-1">EMA34</div>
                <div className="font-mono font-bold text-primary-400">{trackData.ema34?.toFixed(2)}</div>
              </div>
              <div className="bg-dark-800 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500 mb-1">Uzaklık (%)</div>
                <div className={`font-mono font-bold ${trackData.aboveEma34 ? 'text-green-400' : 'text-red-400'}`}>
                  {trackData.distancePct >= 0 ? '+' : ''}{trackData.distancePct}%
                </div>
              </div>
              <div className="bg-dark-800 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500 mb-1">ATR Çarpanı</div>
                <div className={`font-mono font-bold ${trackData.aboveEma34 ? 'text-green-400' : 'text-red-400'}`}>
                  {trackData.distanceAtr >= 0 ? '+' : ''}{trackData.distanceAtr}σ
                </div>
              </div>
            </div>

            {/* Wave detayı */}
            {(trackData.touched || trackData.priorTrendBars > 0) && (
              <div className="bg-dark-800/60 border border-dark-700 rounded-lg p-3 text-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Waves className="w-4 h-4 text-emerald-400" />
                  <span className="font-semibold text-emerald-300">Wave Analizi</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-gray-500">Pullback temas:</span>{' '}
                    <span className={trackData.touched ? 'text-yellow-300 font-semibold' : 'text-gray-400'}>
                      {trackData.touched ? `Evet (${trackData.touchSide === 'support' ? 'destek' : 'direnç'})` : 'Yok'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Önceki trend:</span>{' '}
                    <span className="text-white font-semibold">{trackData.priorTrendBars} bar</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Skor:</span>{' '}
                    <span className={`font-semibold ${trackData.score >= 70 ? 'text-green-400' : trackData.score >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>{trackData.score}/100</span>
                  </div>
                </div>
              </div>
            )}

            {/* Geçmiş serisi */}
            {trackData.series && (
              <div className="mt-2 max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-dark-700">
                      <th className="pb-1 text-left">Tarih</th>
                      <th className="pb-1 text-right">Kapanış</th>
                      <th className="pb-1 text-right">EMA34</th>
                      <th className="pb-1 text-right">Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...trackData.series].reverse().slice(0, 30).map((row, i) => (
                      <tr key={i} className={`border-b border-dark-800 ${row.signal ? 'bg-yellow-500/5' : ''}`}>
                        <td className="py-1 text-gray-400">{row.date}</td>
                        <td className="py-1 text-right font-mono text-white">{row.close?.toFixed(2)}</td>
                        <td className="py-1 text-right font-mono text-primary-400">{row.ema34?.toFixed(2)}</td>
                        <td className="py-1 text-right">
                          {row.signal === 'cross_above' && <span className="text-green-400 font-bold">↑ KIRILIM</span>}
                          {row.signal === 'cross_below' && <span className="text-red-400 font-bold">↓ ÇIKIŞ</span>}
                          {!row.signal && (row.above
                            ? <span className="text-green-300">AL✓</span>
                            : <span className="text-red-300">DIŞI✗</span>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {trackData?.error && <p className="text-red-400 text-sm mt-3">{trackData.error}</p>}
      </div>

      {/* Tarama sonuçları */}
      <div className="card">
        <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary-400" />
          Tarama Sonuçları
          {scanData && <span className="text-xs text-gray-500 ml-2">{filteredResults.length} hisse</span>}
          {scanData?.scannedAt && <span className="text-xs text-gray-600 ml-auto">{new Date(scanData.scannedAt).toLocaleTimeString('tr-TR')}</span>}
        </h3>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 text-primary-400 animate-spin" />
            <span className="text-gray-400 ml-2">Hisseler taranıyor (EMA34 — 1 yıl veri)...</span>
          </div>
        )}

        {scanData?.error && <p className="text-red-400">{scanData.error}</p>}

        {!loading && filteredResults.length > 0 && (
          <div className="table-shell">
            <table className="w-full table-min-medium text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-dark-700">
                  <th className="pb-2 pr-3">Hisse</th>
                  <th className="pb-2 pr-3">Sinyal</th>
                  <th className="pb-2 pr-3">Kapanış</th>
                  <th className="pb-2 pr-3">EMA34</th>
                  <th className="pb-2 pr-3">Eğim</th>
                  <th className="pb-2 pr-3">Bar</th>
                  <th className="pb-2 pr-3">Uzaklık</th>
                  <th className="pb-2">Skor</th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.map((row, i) => {
                  const cfg = SIGNAL_CONFIG[row.signal] || SIGNAL_CONFIG.above
                  const Icon = cfg.icon
                  const slopeBadge = SLOPE_BADGE[row.slopeDir] || SLOPE_BADGE.flat
                  return (
                    <tr
                      key={i}
                      className="border-b border-dark-800 hover:bg-dark-800/50 cursor-pointer"
                      onClick={() => { setTrackInput(row.symbol); trackStock(row.symbol) }}
                    >
                      <td className="py-2 pr-3 font-mono font-bold text-white">{row.symbol}</td>
                      <td className="py-2 pr-3">
                        <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded border w-fit ${cfg.bg} ${cfg.color}`}>
                          <Icon className="w-3 h-3" />
                          {cfg.short}
                        </span>
                      </td>
                      <td className="py-2 pr-3 font-mono text-white">{row.lastClose?.toFixed(2)}</td>
                      <td className="py-2 pr-3 font-mono text-primary-400">{row.ema34?.toFixed(2)}</td>
                      <td className="py-2 pr-3">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${slopeBadge.color}`}>
                          {row.slopePct >= 0 ? '+' : ''}{row.slopePct}%
                        </span>
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs text-gray-300">
                        {row.consecutive > 0 ? `+${row.consecutive}` : row.consecutive}
                      </td>
                      <td className={`py-2 pr-3 font-mono text-xs ${parseFloat(row.distancePct) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {parseFloat(row.distancePct) >= 0 ? '+' : ''}{row.distancePct}%
                      </td>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-14 bg-dark-700 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${row.score >= 70 ? 'bg-green-500' : row.score >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                              style={{ width: `${row.score}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400">{row.score}</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filteredResults.length === 0 && !scanData?.error && scanData && (
          <p className="text-gray-500 text-center py-6">Bu filtrede sonuç bulunamadı.</p>
        )}
      </div>
    </div>
  )
}
