import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, TrendingUp, TrendingDown, RefreshCw, BarChart3 } from 'lucide-react'
import api from '../services/api'
import StockChart from '../components/charts/StockChart'

const INDEX_INFO = {
  'XU100':   { label: 'BIST 100',   desc: 'Borsa İstanbul\'un en büyük 100 hissesinden oluşan ana endeks' },
  'XU030':   { label: 'BIST 30',    desc: 'BIST 100\'ün en likit 30 mavi-çip hissesi' },
  'XU050':   { label: 'BIST 50',    desc: 'BIST 100\'ün ilk 50 hissesi' },
  'XBANK':   { label: 'BIST Banka', desc: 'Bankacılık sektörü endeksi' },
  'XUSIN':   { label: 'BIST Sınai', desc: 'Sınai endeksi' },
  'XHOLD':   { label: 'BIST Holding', desc: 'Holding endeksi' },
}

const fmt = (n, d = 2) => n == null ? '—' : n.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d })

export default function EndeksDetay() {
  const { symbol } = useParams()
  const navigate = useNavigate()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [period, setPeriod]   = useState('1mo') // 5d|1mo|3mo|6mo|1y

  const symU = (symbol || '').toUpperCase()
  const info = INDEX_INFO[symU] || { label: symU, desc: 'Endeks detayı' }

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    const sym = symU === 'XU100' ? 'bist100' : symU === 'XU030' ? 'bist30' : null

    const fetcher = sym
      ? api.get(`/market/${sym}`)
      : api.get(`/market/stock/${symU}`)

    fetcher
      .then(r => active && setData(r.data))
      .catch(e => active && setError(e.response?.data?.error || e.message))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [symU])

  const value = data?.value ?? data?.price ?? 0
  const change = data?.change ?? 0
  const changePct = data?.changePercent ?? 0
  const up = changePct >= 0

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Geri butonu */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm text-gray-400 hover:text-amber-400 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Geri
      </button>

      {/* Hero */}
      <div className={`rounded-3xl border p-5 sm:p-6 ${
        up ? 'border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.08] via-dark-900/60 to-dark-900/30'
           : 'border-red-500/30 bg-gradient-to-br from-red-500/[0.08] via-dark-900/60 to-dark-900/30'
      }`}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{info.label}</h1>
            <p className="text-xs sm:text-sm text-gray-400 mt-1">{info.desc}</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="p-2 bg-dark-800 hover:bg-dark-700 rounded-xl text-gray-300"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-400">
            ⚠ {error}
          </div>
        )}

        {!error && (
          <div className="flex items-baseline gap-3 flex-wrap">
            <div className="text-4xl sm:text-5xl font-bold text-white font-mono tracking-tight">
              {fmt(value)}
            </div>
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-sm font-bold ${
              up ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
            }`}>
              {up ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {up ? '+' : ''}{fmt(change)} ({up ? '+' : ''}{fmt(changePct)}%)
            </div>
          </div>
        )}

        {/* Hızlı stats */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-5">
            <Stat label="Önceki Kapanış" value={fmt(data.previousClose)} />
            <Stat label="Yüksek"          value={fmt(data.high)} />
            <Stat label="Düşük"           value={fmt(data.low)} />
            <Stat label="Hacim"           value={data.volume ? `${(data.volume / 1e6).toFixed(1)}M` : '—'} />
          </div>
        )}
      </div>

      {/* Periyot seçici */}
      <div className="bg-dark-900 border border-dark-700 rounded-2xl p-1.5 inline-flex gap-1 overflow-x-auto custom-scrollbar w-full sm:w-auto">
        {[
          { id: '5d',  label: '5G' },
          { id: '1mo', label: '1A' },
          { id: '3mo', label: '3A' },
          { id: '6mo', label: '6A' },
          { id: '1y',  label: '1Y' },
        ].map(p => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`px-3 sm:px-4 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              period === p.id ? 'bg-amber-500 text-dark-950' : 'text-gray-400 hover:text-white'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Grafik */}
      <div className="bg-dark-900/60 border border-dark-700 rounded-2xl p-3 sm:p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold text-white">Fiyat Grafiği — {period.toUpperCase()}</span>
        </div>
        <StockChart symbol={symU} period={period} height={400} />
      </div>

      <div className="text-xs text-gray-600 text-center pt-2">
        Veri: Yahoo Finance · Eğitim amaçlıdır, yatırım tavsiyesi değildir
      </div>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="bg-dark-900/60 border border-dark-700 rounded-xl p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className="text-sm sm:text-base font-bold text-white mt-0.5 font-mono">{value}</div>
    </div>
  )
}
