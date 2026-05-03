import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { TrendingUp, TrendingDown, RefreshCw, Search, Activity, ArrowUp, ArrowDown, Minus } from 'lucide-react'
import api from '../services/api'
import InfoTooltip from '../components/InfoTooltip'

const SIGNAL_CONFIG = {
  cross_above: { label: '↑ EMA34 Üstüne Çıktı', color: 'text-green-400', bg: 'bg-green-500/20 border-green-500/40', icon: ArrowUp, priority: 0 },
  above:       { label: '✓ EMA34 Üzerinde',      color: 'text-green-300', bg: 'bg-green-500/10 border-green-500/20', icon: TrendingUp, priority: 1 },
  cross_below: { label: '↓ EMA34 Altına İndi',   color: 'text-red-400',   bg: 'bg-red-500/20 border-red-500/40',   icon: ArrowDown, priority: 2 },
  below:       { label: '✗ EMA34 Altında',        color: 'text-red-300',   bg: 'bg-red-500/10 border-red-500/20',   icon: TrendingDown, priority: 3 },
}

const EMA34_TIP = {
  title: 'EMA34 Takip Sistemi',
  description: 'Günlük mum grafiğinde EMA34 (34 periyot Üssel Hareketli Ortalama) seviyesine göre hisseleri filtreler. EMA34, orta vadeli trendin teyit indikatörüdür. Fiyat EMA34 üzerindeyken alım trendi devam etmekte; altına geçince trend kırılmaktadır.',
  formula: 'k = 2 / (34 + 1) = 0.0556\nEMA34(bugün) = Kapanış × k + EMA34(dün) × (1-k)\n\nKesişim yukarı (Cross Above):\n  Dün: Kapanış < EMA34_dün\n  Bugün: Kapanış > EMA34_bugün → AL Sinyali\n\nKesişim aşağı (Cross Below):\n  Dün: Kapanış > EMA34_dün\n  Bugün: Kapanış < EMA34_bugün → ÇIKIŞ Sinyali\n\nSkor hesabı:\n  EMA üzerinde: +20\n  Yeni kesişim yukarı: +20 ek\n  EMA\'ya yakın (%0-3): +10\n  EMA\'ya yakın (%3-8): +5\n  EMA altında: -20\n  Yeni kesişim aşağı: -15 ek',
  source: 'EMA34 — Standart Wilder EMA formülü'
}

export default function EMA34Tarayici() {
  const [searchParams] = useSearchParams()
  const [scanData, setScanData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [trackSymbol, setTrackSymbol] = useState('')
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
    setTrackSymbol(s)
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            EMA34 Takip
            <InfoTooltip size="lg" {...EMA34_TIP} />
          </h1>
          <p className="text-gray-400 text-sm mt-1">Günlük kapanışa göre EMA34 üstü/altı tarayıcı ve al-devam sinyali</p>
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
            { key: 'crossAbove', label: '↑ Yeni Kırılım', color: 'text-green-400', bg: 'bg-green-500/10' },
            { key: 'above',      label: '✓ EMA Üzerinde', color: 'text-green-300', bg: 'bg-green-500/5' },
            { key: 'crossBelow', label: '↓ Yeni İniş',    color: 'text-red-400',   bg: 'bg-red-500/10' },
            { key: 'below',      label: '✗ EMA Altında',  color: 'text-red-300',   bg: 'bg-red-500/5' },
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
              <span className={`px-3 py-1 rounded-full text-sm font-bold border ${trackData.aboveEma34 ? 'bg-green-500/20 text-green-400 border-green-500/40' : 'bg-red-500/20 text-red-400 border-red-500/40'}`}>
                {trackData.activeSignal}
              </span>
              <span className="text-gray-400 text-sm">{trackData.consecutiveDaysAbove > 0 ? `${trackData.consecutiveDaysAbove} gün üst üste EMA üzerinde` : 'EMA altında'}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div className="bg-dark-800 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500 mb-1">Son Kapanış</div>
                <div className="font-mono font-bold text-white">{trackData.lastClose?.toFixed(2)}</div>
              </div>
              <div className="bg-dark-800 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500 mb-1">EMA34 Bugün</div>
                <div className="font-mono font-bold text-primary-400">{trackData.ema34?.toFixed(2)}</div>
              </div>
              <div className="bg-dark-800 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500 mb-1">Uzaklık</div>
                <div className={`font-mono font-bold ${trackData.aboveEma34 ? 'text-green-400' : 'text-red-400'}`}>
                  {trackData.lastClose && trackData.ema34 ? `${((trackData.lastClose - trackData.ema34) / trackData.ema34 * 100).toFixed(2)}%` : '-'}
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
                  <th className="pb-2 pr-3">EMA34</th>
                  <th className="pb-2 pr-3">Uzaklık</th>
                  <th className="pb-2">Skor</th>
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
                      <td className="py-2 pr-3 font-mono text-primary-400">{row.ema34?.toFixed(2)}</td>
                      <td className={`py-2 pr-3 font-mono ${parseFloat(row.distancePct) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {parseFloat(row.distancePct) >= 0 ? '+' : ''}{row.distancePct}%
                      </td>
                      <td className="py-2">
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
