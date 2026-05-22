import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { TrendingUp, TrendingDown, RefreshCw, Search, Activity, ArrowUp, ArrowDown, BarChart3, ExternalLink } from 'lucide-react'
import api from '../services/api'
import InfoTooltip from '../components/InfoTooltip'
import { Button } from '../components/ui'

// TradingView eksternal link — BIST + kripto
function tvLink(symbol, isCrypto) {
  const tv = isCrypto ? `BINANCE:${symbol}USDT` : `BIST:${symbol}`
  return `https://tr.tradingview.com/chart/?symbol=${tv}&interval=D`
}

const SIGNAL_CONFIG = {
  cross_above: { label: '↑ TEMA34 Üstüne Çıktı', color: 'text-green-400', bg: 'bg-green-500/20 border-green-500/40', icon: ArrowUp, priority: 0 },
  above:       { label: '✓ TEMA34 Üzerinde',     color: 'text-green-300', bg: 'bg-green-500/10 border-green-500/20', icon: TrendingUp, priority: 1 },
  cross_below: { label: '↓ TEMA34 Altına İndi',  color: 'text-red-400',   bg: 'bg-red-500/20 border-red-500/40',   icon: ArrowDown, priority: 2 },
  below:       { label: '✗ TEMA34 Altında',       color: 'text-red-300',   bg: 'bg-red-500/10 border-red-500/20',   icon: TrendingDown, priority: 3 },
}

const TEMA34_TIP = {
  title: 'TEMA34 (Triple EMA) Takip Sistemi',
  description: 'Günlük mum grafiğinde TEMA34 (34 periyot Triple EMA — Üçlü Üssel Hareketli Ortalama) seviyesine göre hisseleri filtreler. TEMA, klasik EMA\'ya göre gecikmeyi belirgin biçimde azaltır ve orta vadeli trendi daha hızlı teyit eder. Hızlı sinyal — klasik EMA34 yerine daha çevik bir trend göstergesi. Fiyat TEMA34 üzerindeyken alım trendi devam etmekte; altına geçince trend kırılmaktadır.',
  formula: 'TEMA — Triple Exponential Moving Average (length = 34)\n\nk = 2 / (34 + 1) ≈ 0.0571\n\nema1 = EMA(Kapanış, 34)\nema2 = EMA(ema1,    34)\nema3 = EMA(ema2,    34)\nTEMA = 3 × (ema1 − ema2) + ema3\n\nKesişim yukarı (Cross Above):\n  Dün: Kapanış < TEMA_dün\n  Bugün: Kapanış > TEMA_bugün → AL Sinyali\n\nKesişim aşağı (Cross Below):\n  Dün: Kapanış > TEMA_dün\n  Bugün: Kapanış < TEMA_bugün → ÇIKIŞ Sinyali\n\nSkor hesabı:\n  TEMA üzerinde: +20\n  Yeni kesişim yukarı: +20 ek\n  TEMA\'ya yakın (%0-3): +10\n  TEMA\'ya yakın (%3-8): +5\n  TEMA altında: -20\n  Yeni kesişim aşağı: -15 ek\n\nKlasik EMA34\'ten farkı: TEMA üçlü filtrelenmiş — gecikmesi yaklaşık 3 kat daha az, ama daha gürültülü. EMA34 = yavaş & güvenilir rejim filtresi, TEMA34 = hızlı sinyal.',
  source: 'TradingView Pine v6 — Triple EMA (TEMA) standart formülü'
}

export default function TEMA34Tarayici() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [scanData, setScanData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [trackSymbol, setTrackSymbol] = useState('')
  const [trackInput, setTrackInput] = useState('')
  const [trackData, setTrackData] = useState(null)
  const [trackLoading, setTrackLoading] = useState(false)
  const [listParam, setListParam] = useState('all')
  const [filterSignal, setFilterSignal] = useState('all')

  const runScan = async (list = listParam) => {
    setLoading(true)
    setScanData(null)
    try {
      const r = await api.get(`/tema34/scan?list=${list}`)
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
    setTrackSymbol(s)
    setTrackLoading(true)
    setTrackData(null)
    try {
      const typeParam = isCrypto ? '?type=crypto' : ''
      const r = await api.get(`/tema34/track/${s}${typeParam}`)
      setTrackData(r.data)
    } catch (e) {
      setTrackData({ error: e.response?.data?.error || 'Takip hatası' })
    } finally {
      setTrackLoading(false)
    }
  }

  useEffect(() => { runScan() }, [])

  // URL'den symbol gelirse o hisseyi otomatik takip et
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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <InfoTooltip size="lg" {...TEMA34_TIP} />
          <p className="text-gray-400 text-sm truncate">Günlük kapanışa göre TEMA34 üstü/altı tarayıcı ve al-devam sinyali</p>
        </div>
        <Button variant="ghost" size="sm" icon={RefreshCw} loading={loading} onClick={() => runScan(listParam)}>Yenile</Button>
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
        <div className="flex gap-2 ml-auto">
          {['all', 'cross_above', 'above', 'cross_below', 'below'].map(s => (
            <button
              key={s}
              onClick={() => setFilterSignal(s)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${filterSignal === s ? 'bg-primary-600 text-white' : 'bg-dark-800 text-gray-400 hover:text-white'}`}
            >
              {s === 'all' ? 'Tümü' : s === 'cross_above' ? '↑ Yeni Kırılım' : s === 'above' ? '✓ Üstünde' : s === 'cross_below' ? '↓ Yeni İniş' : '✗ Altında'}
            </button>
          ))}
        </div>
      </div>

      {/* Özet kartlar */}
      {scanData && !scanData.error && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { key: 'crossAbove', label: '↑ Yeni Kırılım',  color: 'text-green-400', bg: 'bg-green-500/10' },
            { key: 'above',      label: '✓ TEMA Üzerinde', color: 'text-green-300', bg: 'bg-green-500/5' },
            { key: 'crossBelow', label: '↓ Yeni İniş',     color: 'text-red-400',   bg: 'bg-red-500/10' },
            { key: 'below',      label: '✗ TEMA Altında',  color: 'text-red-300',   bg: 'bg-red-500/5' },
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
          Tekil Hisse TEMA34 Takibi
        </h3>
        <div className="flex gap-2">
          <input
            value={trackInput}
            onChange={e => setTrackInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && trackStock()}
            placeholder="Sembol: THYAO, GARAN..."
            className="flex-1 bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary-500"
          />
          <Button variant="gold" icon={TrendingUp} loading={trackLoading} onClick={() => trackStock()}>
            Takip Et
          </Button>
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
              <span className={`px-3 py-1 rounded-full text-sm font-bold border ${(trackData.aboveTema34 ?? trackData.aboveEma34) ? 'bg-green-500/20 text-green-400 border-green-500/40' : 'bg-red-500/20 text-red-400 border-red-500/40'}`}>
                {trackData.activeSignal}
              </span>
              <span className="text-gray-400 text-sm">{trackData.consecutiveDaysAbove > 0 ? `${trackData.consecutiveDaysAbove} gün üst üste TEMA üzerinde` : 'TEMA altında'}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div className="bg-dark-800 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500 mb-1">Son Kapanış</div>
                <div className="font-mono font-bold text-white">{trackData.lastClose?.toFixed(2)}</div>
              </div>
              <div className="bg-dark-800 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500 mb-1">TEMA34 Bugün</div>
                <div className="font-mono font-bold text-primary-400">{(trackData.tema34 ?? trackData.ema34)?.toFixed(2)}</div>
              </div>
              <div className="bg-dark-800 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500 mb-1">Uzaklık</div>
                <div className={`font-mono font-bold ${(trackData.aboveTema34 ?? trackData.aboveEma34) ? 'text-green-400' : 'text-red-400'}`}>
                  {(() => {
                    const t = trackData.tema34 ?? trackData.ema34
                    return trackData.lastClose && t ? `${((trackData.lastClose - t) / t * 100).toFixed(2)}%` : '-'
                  })()}
                </div>
              </div>
            </div>
            {/* Geçmiş serisi */}
            {trackData.series && (
              <div className="mt-2 max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-dark-700">
                      <th className="pb-1 text-left">Tarih</th>
                      <th className="pb-1 text-right">Kapanış</th>
                      <th className="pb-1 text-right">TEMA34</th>
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
            <span className="text-gray-400 ml-2">BIST hisseleri taranıyor...</span>
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
                  <th className="pb-2 pr-3">TEMA34</th>
                  <th className="pb-2 pr-3">Uzaklık</th>
                  <th className="pb-2 pr-3">Skor</th>
                  <th className="pb-2 text-right">Aksiyon</th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.map((row, i) => {
                  const cfg = SIGNAL_CONFIG[row.signal]
                  const Icon = cfg.icon
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
                          {cfg.label}
                        </span>
                      </td>
                      <td className="py-2 pr-3 font-mono text-white">{row.lastClose?.toFixed(2)}</td>
                      <td className="py-2 pr-3 font-mono text-primary-400">{(row.tema34 ?? row.ema34)?.toFixed(2)}</td>
                      <td className={`py-2 pr-3 font-mono ${parseFloat(row.distancePct) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {parseFloat(row.distancePct) >= 0 ? '+' : ''}{row.distancePct}%
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-dark-700 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${row.score >= 70 ? 'bg-green-500' : row.score >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                              style={{ width: `${row.score}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400">{row.score}</span>
                        </div>
                      </td>
                      <td className="py-2 text-right">
                        <div
                          className="inline-flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/hisse/${row.symbol}${listParam === 'crypto' ? '?type=crypto' : ''}`)
                            }}
                            title="Hisse merkezinde aç"
                            className="px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors"
                            style={{
                              background: 'rgba(212, 175, 55, 0.10)',
                              border: '1px solid rgba(212, 175, 55, 0.30)',
                              color: 'var(--gold-400)',
                            }}
                          >
                            <Search className="w-3 h-3" /> Detay
                          </button>
                          <a
                            href={tvLink(row.symbol, listParam === 'crypto')}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title="TradingView'de teknik analiz"
                            className="px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors"
                            style={{
                              background: 'rgba(33, 150, 243, 0.10)',
                              border: '1px solid rgba(33, 150, 243, 0.30)',
                              color: '#56a8f5',
                            }}
                          >
                            <BarChart3 className="w-3 h-3" /> Teknik Analiz
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
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
