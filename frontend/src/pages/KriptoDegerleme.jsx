import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Calculator, RefreshCw, AlertCircle, Info, TrendingDown, TrendingUp, Activity, Coins, Layers } from 'lucide-react'
import api from '../services/api'
import { PageHeader, Button } from '../components/ui'

const POPULAR = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'AVAX', 'LINK', 'DOT', 'MATIC']

const VERDICT_LABELS = {
  derin_iskonto:   { label: 'Derin İskonto',  tone: 'green', emoji: '🟢', desc: 'Birden fazla model "ucuz" işaret veriyor' },
  iskonto:         { label: 'İskontolu',      tone: 'green', emoji: '🟢', desc: 'Modeller hafif ucuz işaret veriyor' },
  gercege_yakin:   { label: 'Gerçeğe Yakın',  tone: 'amber', emoji: '🟡', desc: 'Adil değer bandında' },
  pahali:          { label: 'Pahalı',         tone: 'red',   emoji: '🟠', desc: 'Birkaç model "pahalı" işaret veriyor' },
  cok_pahali:      { label: 'Çok Pahalı',     tone: 'red',   emoji: '🔴', desc: 'Modeller "aşırı ısınmış" işaret veriyor' },
  belirsiz:        { label: 'Belirsiz',       tone: 'gray',  emoji: '⚪', desc: 'Veri yetersiz' },
}

const SIGNAL_LABELS = {
  // Drawdown
  deep_oversold:   { label: 'Aşırı Satışta',  color: 'green' },
  oversold:        { label: 'Satışta',         color: 'green' },
  fair:            { label: 'Adil',            color: 'amber' },
  overbought:      { label: 'Aşırı Alımda',    color: 'red' },
  overheated:      { label: 'Aşırı Isınmış',   color: 'red' },
  deep_overbought: { label: 'Aşırı Aşırı Alım', color: 'red' },
  // S2F / NVT
  deep_value:      { label: 'Derin Değer',     color: 'green' },
  undervalued:     { label: 'Düşük Değerli',   color: 'green' },
  pricey:          { label: 'Pahalı',          color: 'red' },
  overvalued:      { label: 'Aşırı Değerli',   color: 'red' },
  active:          { label: 'Aktif',           color: 'green' },
  deep_active:     { label: 'Çok Aktif',       color: 'green' },
  // Volatility band
  p25_under:       { label: 'Bant alt %25',    color: 'green' },
  p25_to_p50:      { label: '%25-50 bandı',    color: 'green' },
  p50_to_p75:      { label: '%50-75 bandı',    color: 'amber' },
  p75_over:        { label: 'Bant üst %75',    color: 'red' },
}

function fmtUSD(n, decimals = 2) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  if (n < 0.01) return '$' + Number(n).toExponential(2)
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtBig(n) {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (abs >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`
  if (abs >= 1e3)  return `$${(n / 1e3).toFixed(0)}K`
  return fmtUSD(n)
}

function fmtSupply(n) {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)} mlr`
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)} mn`
  if (abs >= 1e3) return `${(n / 1e3).toFixed(0)}b`
  return n.toFixed(0)
}

function StatCard({ label, value, sub, color = 'amber' }) {
  const colors = {
    amber: 'border-amber-500/30 from-amber-500/15',
    green: 'border-green-500/30 from-green-500/15',
    red:   'border-red-500/30 from-red-500/15',
    blue:  'border-blue-500/30 from-blue-500/15',
    gray:  'border-gray-500/30 from-gray-500/15',
  }
  return (
    <div className={`rounded-xl border bg-gradient-to-br to-transparent p-3 ${colors[color]}`}>
      <div className="text-[10px] uppercase tracking-wider text-gray-400">{label}</div>
      <div className="text-lg sm:text-xl font-bold text-white mt-0.5">{value}</div>
      {sub && <div className="text-[10px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function VerdictCard({ verdict, fairPrice, currentPrice, upside, score }) {
  const v = VERDICT_LABELS[verdict] || VERDICT_LABELS.belirsiz
  const colors = {
    green: 'from-green-500/20 to-green-700/5 border-green-500/40',
    amber: 'from-amber-500/20 to-amber-700/5 border-amber-500/40',
    red:   'from-red-500/20 to-red-700/5 border-red-500/40',
    gray:  'from-gray-500/20 to-gray-700/5 border-gray-500/40',
  }
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-4 ${colors[v.tone]}`}>
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <div className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <span>{v.emoji}</span>
            <span className="text-white">{v.label}</span>
          </div>
          <div className="text-xs opacity-80 mt-0.5">{v.desc}</div>
          <div className="text-[10px] text-gray-400 mt-1">Composite skor: <span className="text-amber-300 font-bold">{score}/100</span></div>
        </div>
        {upside !== null && (
          <div className="text-right">
            <div className={`text-2xl sm:text-3xl font-bold ${upside >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {upside >= 0 ? '+' : ''}{upside}%
            </div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400">Tahmini Upside</div>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-white/10">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-400">Modellerin Adil Değeri</div>
          <div className="text-xl font-bold text-white">{fmtUSD(fairPrice, fairPrice < 1 ? 6 : 2)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-400">Güncel Fiyat</div>
          <div className="text-xl font-bold text-white">{fmtUSD(currentPrice, currentPrice < 1 ? 6 : 2)}</div>
        </div>
      </div>
    </div>
  )
}

function SignalRow({ icon: Icon, title, signal, score, children }) {
  const sl = signal ? SIGNAL_LABELS[signal] : null
  const colorMap = {
    green: 'bg-green-500/15 text-green-300 border-green-500/30',
    amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    red:   'bg-red-500/15 text-red-300 border-red-500/30',
  }
  return (
    <div className="rounded-xl border border-dark-700 bg-dark-900/40 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-amber-400" />
          <div className="text-sm font-semibold text-white">{title}</div>
        </div>
        <div className="flex items-center gap-2">
          {sl && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${colorMap[sl.color] || colorMap.amber}`}>
              {sl.label}
            </span>
          )}
          {score !== undefined && score !== null && (
            <span className="text-[10px] text-gray-500">skor {score}</span>
          )}
        </div>
      </div>
      <div className="text-xs text-gray-400 space-y-1">{children}</div>
    </div>
  )
}

export default function KriptoDegerleme() {
  const [searchParams] = useSearchParams()
  const [inputVal, setInputVal] = useState((searchParams.get('symbol') || 'BTC').toUpperCase())
  const [symbol, setSymbol] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const calculate = async (sym) => {
    const s = (sym || inputVal).trim().toUpperCase()
    if (!s) return
    setSymbol(s)
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const r = await api.get(`/crypto/valuation/${s}`)
      // Backend stale-fallback ile success: true ama stale: true donebilir → bunu da goster
      if (r.data?.success === false) {
        setError(r.data.error || 'Degerleme hesaplanamadi')
      } else {
        setData(r.data)
      }
    } catch (e) {
      const data = e.response?.data
      if (data?.rateLimited) {
        setError('CoinGecko anlik istek limitine takildi. Lutfen 1-2 dakika sonra tekrar deneyin.')
      } else {
        setError(data?.error || 'Degerleme hesaplanamadi')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const urlSymbol = searchParams.get('symbol')
    if (urlSymbol) calculate(urlSymbol)
    else calculate('BTC')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const inputs = data?.inputs
  const sig = data?.signals
  const val = data?.valuation

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <PageHeader
        icon={Coins}
        eyebrow="YENİ"
        title="Kripto Değerleme"
        description="5 modelin (drawdown · MA reversion · Stock-to-Flow · NVT · volatility band) composite analizi"
      />

      {/* Search */}
      <div className="card p-4">
        <div className="flex gap-2">
          <input
            className="input flex-1 text-sm"
            placeholder="Sembol: BTC, ETH, SOL, ADA..."
            value={inputVal}
            onChange={e => setInputVal(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && calculate()}
          />
          <Button variant="gold" icon={Calculator} loading={loading} onClick={() => calculate()}>Hesapla</Button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {POPULAR.map(s => (
            <button
              key={s}
              onClick={() => { setInputVal(s); calculate(s) }}
              className="px-2.5 py-1 bg-dark-700 hover:bg-dark-600 text-xs text-gray-300 rounded-lg transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Methodology hint */}
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 flex gap-2 items-start">
        <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-blue-200/90">
          <span className="font-semibold">Metodoloji:</span> 5 model eşit ağırlıkta 0-100 skor üretir;
          ortalama "composite skor" verdict'i belirler. DCF crypto'ya doğrudan uygulanamadığı için drawdown,
          MA reversion, Stock-to-Flow, NVT-proxy ve volatilite band karması kullanılıyor.
          <span className="opacity-70"> Veri: CoinGecko</span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3 text-red-400">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Stale-data uyarisi (CoinGecko 429 sonrasi cache donecegini bildir) */}
      {data?.stale && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-3 text-amber-300">
          <Info className="w-4 h-4" />
          <span className="text-xs">
            CoinGecko anlik istek limitine takildi — onbellekteki son hesaplanan deger gosteriliyor.
            Bu deger {new Date(data.fetchedAt).toLocaleString('tr-TR')} itibariyle hesaplandi.
          </span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Değerleme hesaplanıyor...
        </div>
      )}

      {/* Results */}
      {data && !loading && (
        <>
          {/* Coin meta */}
          <div className="rounded-xl border border-dark-700 bg-dark-900/40 p-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="text-lg font-bold text-white">{data.symbol}</div>
                <div className="text-xs text-gray-400">{data.name}</div>
              </div>
              <div className="text-right text-[10px] text-gray-500">
                <div>CoinGecko ID: <span className="text-amber-300">{data.coingeckoId}</span></div>
                <div>Methodology: {data.methodology}</div>
              </div>
            </div>
          </div>

          {/* Verdict */}
          <VerdictCard
            verdict={val.verdict}
            fairPrice={val.fairPrice}
            currentPrice={val.currentPrice}
            upside={val.upsidePct}
            score={val.compositeScore}
          />

          {/* Key inputs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatCard label="Market Cap" value={fmtBig(inputs.marketCap)} sub="USD" color="amber" />
            <StatCard label="ATH" value={fmtUSD(inputs.ath, inputs.ath < 1 ? 6 : 0)} sub={inputs.athDate?.slice(0, 10)} color="blue" />
            <StatCard label="30g Volatilite" value={`${inputs.volatility30dPct}%`} sub="günlük std" color="amber" />
            <StatCard label="Dolaşan Arz" value={fmtSupply(inputs.circulatingSupply)} sub={inputs.maxSupply ? `/${fmtSupply(inputs.maxSupply)}` : 'sınırsız'} color="blue" />
          </div>

          {/* Signal cards */}
          <div className="grid sm:grid-cols-2 gap-3">
            {sig.drawdown && (
              <SignalRow icon={TrendingDown} title="Zirveden Düşüş" signal={sig.drawdown.signal} score={sig.drawdown.score}>
                <div className="flex justify-between"><span>ATH'tan uzaklık</span><span className="text-white font-semibold">{sig.drawdown.drawdownPct}%</span></div>
                <div className="flex justify-between"><span>ATH</span><span className="text-gray-300">{fmtUSD(inputs.ath)}</span></div>
              </SignalRow>
            )}

            {sig.maReversion && (
              <SignalRow icon={Activity} title="MA Reversion" signal={sig.maReversion.signal} score={sig.maReversion.score}>
                <div className="flex justify-between"><span>200g MA</span><span className="text-white font-semibold">{fmtUSD(sig.maReversion.ma200)}</span></div>
                <div className="flex justify-between"><span>MA200'den sapma</span><span className="text-gray-300">{sig.maReversion.deviationFrom200Pct}%</span></div>
                <div className="flex justify-between"><span>50g/200g trend</span><span className={`font-semibold ${sig.maReversion.trend === 'bullish' ? 'text-green-400' : sig.maReversion.trend === 'bearish' ? 'text-red-400' : 'text-amber-400'}`}>{sig.maReversion.trend}</span></div>
              </SignalRow>
            )}

            {sig.stockToFlow && (
              <SignalRow icon={Layers} title="Stock-to-Flow" signal={sig.stockToFlow.signal} score={sig.stockToFlow.score}>
                <div className="flex justify-between"><span>S2F oranı</span><span className="text-white font-semibold">{sig.stockToFlow.s2f}</span></div>
                <div className="flex justify-between"><span>Model fiyatı</span><span className="text-gray-300">{fmtUSD(sig.stockToFlow.modelPrice)}</span></div>
                <div className="flex justify-between"><span>Fiyat/Model</span><span className="text-gray-300">{sig.stockToFlow.ratio}x</span></div>
                {sig.stockToFlow.note && <div className="text-[10px] text-gray-500 italic mt-1">{sig.stockToFlow.note}</div>}
              </SignalRow>
            )}

            {sig.nvt && (
              <SignalRow icon={Coins} title="NVT-proxy (MCap/Volume)" signal={sig.nvt.signal} score={sig.nvt.score}>
                <div className="flex justify-between"><span>NVT</span><span className="text-white font-semibold">{sig.nvt.nvt}</span></div>
                <div className="flex justify-between"><span>30g vol ortalama</span><span className="text-gray-300">{fmtBig(inputs.volume30dAvg)}</span></div>
              </SignalRow>
            )}

            {sig.volatilityBand && (
              <SignalRow icon={TrendingUp} title="90g Volatilite Bandı" signal={sig.volatilityBand.signal} score={sig.volatilityBand.score}>
                <div className="flex justify-between"><span>%25 percentile</span><span className="text-gray-300">{fmtUSD(sig.volatilityBand.p25)}</span></div>
                <div className="flex justify-between"><span>%50 (medyan)</span><span className="text-gray-300">{fmtUSD(sig.volatilityBand.p50)}</span></div>
                <div className="flex justify-between"><span>%75 percentile</span><span className="text-gray-300">{fmtUSD(sig.volatilityBand.p75)}</span></div>
              </SignalRow>
            )}
          </div>

          {/* Disclaimer */}
          <div className="text-[10px] text-gray-600 px-1">
            Crypto değerleme yöntemleri spekülatif niteliktedir; tek başına yatırım kararı için yeterli değildir.
            Stock-to-Flow modeli özellikle BTC ve sabit-arz coinler için anlamlıdır; meme/DeFi tokenlarında bilgilendirici amaçlıdır.
            CoinGecko ücretsiz API verileri kullanılır.
          </div>
        </>
      )}
    </div>
  )
}
