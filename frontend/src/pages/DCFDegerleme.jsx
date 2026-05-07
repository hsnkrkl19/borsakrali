import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Calculator, Search, TrendingUp, TrendingDown, RefreshCw, AlertCircle, Info, Target, Zap } from 'lucide-react'
import api from '../services/api'

const POPULAR = ['THYAO', 'ASELS', 'GARAN', 'KCHOL', 'EREGL', 'SASA', 'BIMAS', 'TUPRS', 'SAHOL', 'AKBNK']

const VERDICT_LABELS = {
  derin_iskonto:    { label: 'Derin İskonto', tone: 'green',  emoji: '🟢', desc: 'Adil değerin %25+ altında' },
  iskonto:          { label: 'İskontolu',     tone: 'green',  emoji: '🟢', desc: '%10–25 iskonto' },
  gercege_yakin:    { label: 'Gerçeğe Yakın', tone: 'amber',  emoji: '🟡', desc: '±%10 bandında' },
  pahali:           { label: 'Pahalı',        tone: 'red',    emoji: '🟠', desc: 'Adil değerin %10–25 üstünde' },
  cok_pahali:       { label: 'Çok Pahalı',    tone: 'red',    emoji: '🔴', desc: 'Adil değerin %25+ üstünde' },
  belirsiz:         { label: 'Belirsiz',      tone: 'gray',   emoji: '⚪', desc: 'Veri yetersiz' },
}

function fmtNum(n, decimals = 0) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

// Para birimine göre fiyat: USD modda küçük rakamlar için ondalık otomatik ayarlanır
function fmtPrice(n, symbol = '₺') {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  let decimals = 2
  if (symbol === '$' && abs > 0 && abs < 1) decimals = abs < 0.01 ? 6 : 4
  const formatted = Number(n).toLocaleString('tr-TR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  return `${formatted} ${symbol}`
}

function fmtBig(n, symbol = '') {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  const suffix = symbol ? ` ${symbol}` : ''
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)} mlr${suffix}`
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)} mn${suffix}`
  if (abs >= 1e3) return `${(n / 1e3).toFixed(0)}b${suffix}`
  if (symbol === '$' && abs > 0 && abs < 1) return `${n.toFixed(abs < 0.01 ? 6 : 4)}${suffix}`
  return `${fmtNum(n, 2)}${suffix}`
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
    <div className={`rounded-xl border bg-gradient-to-br to-transparent p-3 sm:p-3.5 ${colors[color]}`}>
      <div className="text-xs uppercase tracking-wider text-gray-400">{label}</div>
      <div className="text-lg sm:text-xl font-bold text-white mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  )
}

function VerdictCard({ verdict, fairPrice, currentPrice, upside, symbol = '₺' }) {
  const v = VERDICT_LABELS[verdict] || VERDICT_LABELS.belirsiz
  const colors = {
    green: 'from-green-500/20 to-green-700/5 border-green-500/40 text-green-300',
    amber: 'from-amber-500/20 to-amber-700/5 border-amber-500/40 text-amber-300',
    red:   'from-red-500/20 to-red-700/5 border-red-500/40 text-red-300',
    gray:  'from-gray-500/20 to-gray-700/5 border-gray-500/40 text-gray-300',
  }
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-4 sm:p-5 ${colors[v.tone]}`}>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <span>{v.emoji}</span>
            <span className="text-white">{v.label}</span>
          </div>
          <div className="text-sm opacity-80 mt-1">{v.desc}</div>
        </div>
        {upside !== null && (
          <div className="text-right">
            <div className={`text-2xl sm:text-3xl font-bold ${upside >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {upside >= 0 ? '+' : ''}{upside}%
            </div>
            <div className="text-xs uppercase tracking-wider text-gray-400">Upside</div>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-white/10">
        <div>
          <div className="text-xs uppercase tracking-wider text-gray-400">İçsel Değer</div>
          <div className="text-xl sm:text-2xl font-bold text-white mt-0.5">{fmtPrice(fairPrice, symbol)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-gray-400">Güncel Fiyat</div>
          <div className="text-xl sm:text-2xl font-bold text-white mt-0.5">{fmtPrice(currentPrice, symbol)}</div>
        </div>
      </div>
    </div>
  )
}

function SensitivityMatrix({ sensitivity, currentPrice, symbol = '₺' }) {
  if (!sensitivity?.rows) return null
  return (
    <div className="overflow-x-auto custom-scrollbar">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left p-2 text-xs text-gray-500 font-medium">WACC ↓ \ g →</th>
            {sensitivity.growths.map(g => (
              <th key={g} className="p-2 text-amber-300 font-semibold text-center">{g}%</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sensitivity.rows.map(row => (
            <tr key={row.wacc}>
              <td className="p-2 text-amber-300 font-semibold">{row.wacc}%</td>
              {row.cells.map((cell, idx) => {
                const fair = cell.fairPrice
                const diff = (currentPrice > 0 && fair) ? ((fair - currentPrice) / currentPrice) * 100 : null
                let bg = 'bg-dark-900/40'
                if (diff !== null) {
                  if (diff > 25) bg = 'bg-green-500/30'
                  else if (diff > 10) bg = 'bg-green-500/15'
                  else if (diff > -10) bg = 'bg-amber-500/15'
                  else if (diff > -25) bg = 'bg-red-500/15'
                  else bg = 'bg-red-500/30'
                }
                return (
                  <td key={idx} className={`p-2 text-center border border-dark-700 ${bg}`}>
                    <div className="font-semibold text-white">{fair ? fmtPrice(fair, symbol) : '—'}</div>
                    {diff !== null && (
                      <div className={`text-xs ${diff >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                        {diff >= 0 ? '+' : ''}{diff.toFixed(1)}%
                      </div>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ProjectionTable({ projection, baseFCF, symbol = '' }) {
  if (!projection?.length) return null
  const cumPV = projection.reduce((a, p) => a + p.pv, 0)
  return (
    <div className="overflow-x-auto custom-scrollbar">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wider text-gray-500">
            <th className="text-left p-2">Yıl</th>
            <th className="text-right p-2">Büyüme</th>
            <th className="text-right p-2">FCF</th>
            <th className="text-right p-2">PV</th>
          </tr>
        </thead>
        <tbody>
          <tr className="bg-dark-900/40">
            <td className="p-2 text-gray-400">Bugün</td>
            <td className="p-2 text-right text-gray-500">—</td>
            <td className="p-2 text-right text-white font-semibold">{fmtBig(baseFCF, symbol)}</td>
            <td className="p-2 text-right text-gray-500">—</td>
          </tr>
          {projection.map(p => (
            <tr key={p.year} className="border-t border-dark-800">
              <td className="p-2 text-gray-400">+{p.year} yıl</td>
              <td className="p-2 text-right text-amber-300">{p.growthRate}%</td>
              <td className="p-2 text-right text-white">{fmtBig(p.fcf, symbol)}</td>
              <td className="p-2 text-right text-blue-300">{fmtBig(p.pv, symbol)}</td>
            </tr>
          ))}
          <tr className="border-t border-dark-700 bg-amber-500/5">
            <td className="p-2 text-amber-300 font-semibold">Toplam PV (5y)</td>
            <td colSpan="2"></td>
            <td className="p-2 text-right text-amber-300 font-bold">{fmtBig(cumPV, symbol)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export default function DCFDegerleme() {
  const [searchParams] = useSearchParams()
  const [inputVal, setInputVal] = useState(searchParams.get('symbol') || 'THYAO')
  const [symbol, setSymbol] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState('usd') // usd | tl
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const suggestionAbort = useRef(null)
  const suggestionTimer = useRef(null)
  const inputRef = useRef(null)

  // Autocomplete: input değişince debounce'lu arama
  useEffect(() => {
    if (suggestionTimer.current) clearTimeout(suggestionTimer.current)
    if (!inputVal || inputVal.length < 1 || inputVal === symbol) {
      setSuggestions([])
      return
    }
    suggestionTimer.current = setTimeout(async () => {
      if (suggestionAbort.current) suggestionAbort.current.abort()
      const ctrl = new AbortController()
      suggestionAbort.current = ctrl
      try {
        const r = await api.get('/market/stocks/search', { params: { q: inputVal }, signal: ctrl.signal })
        setSuggestions((r.data?.stocks || []).slice(0, 8))
      } catch (_) { /* aborted veya hata */ }
    }, 200)
    return () => clearTimeout(suggestionTimer.current)
  }, [inputVal, symbol])

  const calculate = async (sym) => {
    const s = (sym || inputVal).trim().toUpperCase().replace('.IS', '')
    if (!s) return
    setSymbol(s)
    setShowSuggestions(false)
    setSuggestions([])
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const r = await api.get(`/dcf/${s}`, { params: { mode } })
      setData(r.data)
    } catch (e) {
      setError(e.response?.data?.error || 'DCF hesaplanamadı')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const urlSymbol = searchParams.get('symbol')
    if (urlSymbol) calculate(urlSymbol)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Mode değişince varsa yeniden hesapla
  useEffect(() => {
    if (symbol) calculate(symbol)
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  const inputs = data?.inputs
  const val = data?.valuation
  const sym = data?.currencySymbol || '₺'

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-white">DCF Değerleme</h1>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-200 border border-amber-500/40">YENİ</span>
          </div>
          <p className="text-sm text-gray-400 mt-1">İndirgenmiş Nakit Akımı yöntemiyle içsel değer hesabı (5 yıl projeksiyon + Gordon terminal)</p>
        </div>
        <div className="flex gap-1 bg-dark-900/60 border border-dark-700 rounded-xl p-1">
          {[
            { id: 'usd', label: 'USD bazlı' },
            { id: 'tl',  label: 'TL bazlı' },
          ].map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                mode === m.id ? 'bg-amber-500 text-dark-950' : 'text-gray-400 hover:text-white'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="card p-4">
        <div className="flex gap-2 relative">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              className="input w-full text-sm"
              placeholder="Sembol: THYAO, ASELS, GARAN..."
              value={inputVal}
              onChange={e => { setInputVal(e.target.value.toUpperCase()); setShowSuggestions(true) }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onKeyDown={e => {
                if (e.key === 'Enter') calculate()
                if (e.key === 'Escape') setShowSuggestions(false)
              }}
              autoComplete="off"
            />
            {/* Autocomplete dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-dark-900 border border-dark-700 rounded-xl shadow-2xl overflow-hidden z-20 max-h-72 overflow-y-auto custom-scrollbar">
                {suggestions.map(s => (
                  <button
                    key={s.symbol}
                    onMouseDown={(e) => { e.preventDefault(); setInputVal(s.symbol); calculate(s.symbol) }}
                    className="w-full text-left px-3 py-2 hover:bg-dark-800 border-b border-dark-800 last:border-0 flex items-center justify-between gap-2 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-amber-300">{s.symbol}</div>
                      <div className="text-[10px] text-gray-500 truncate">{s.name || s.companyName || ''}</div>
                    </div>
                    {s.sector && (
                      <div className="text-[10px] text-gray-400 px-1.5 py-0.5 rounded bg-dark-800 border border-dark-700 whitespace-nowrap">
                        {s.sector}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => calculate()} disabled={loading} className="btn-primary px-5 flex items-center gap-2">
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
            Hesapla
          </button>
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
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 sm:p-3.5 flex gap-2.5 items-start">
        <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-200/90 leading-relaxed">
          <span className="font-semibold">Metodoloji:</span> 5 yıllık FCF projeksiyonu (CAGR %15 ile sınırlı, yıllık decay 0.95→0.80),
          Gordon terminal (g=%2.5), sektör bazlı WACC. <span className="opacity-70">Kaynak: virattt/dexter DCF skill</span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3 text-red-400">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> DCF hesaplanıyor...
        </div>
      )}

      {/* Results */}
      {data && !loading && (
        <>
          {/* Hisse meta */}
          <div className="rounded-xl border border-dark-700 bg-dark-900/40 p-3 sm:p-3.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="text-lg sm:text-xl font-bold text-white">{data.symbol}</div>
                <div className="text-sm text-gray-300">{data.name}</div>
                <div className="text-xs text-gray-500 mt-1">{data.sector} · {data.market}</div>
              </div>
              <div className="text-right text-xs text-gray-400 space-y-0.5">
                <div>FCF kaynağı: <span className="text-amber-300">{inputs?.fcfSource}</span></div>
                <div>Para birimi: <span className="text-amber-300">{data.currency}</span> {data.currency === 'USD' && data.usdTryRate ? <span className="text-gray-500">(1$={data.usdTryRate}₺)</span> : null}</div>
                <div>WACC modu: {inputs?.waccMode?.toUpperCase()}</div>
              </div>
            </div>
          </div>

          {/* Verdict */}
          <VerdictCard
            verdict={val.verdict}
            fairPrice={val.fairPrice}
            currentPrice={val.currentPrice}
            upside={val.upsidePct}
            symbol={sym}
          />

          {/* Key inputs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <StatCard label="Baz FCF" value={fmtBig(inputs.baseFCF, sym)} sub="son yıl" color="amber" />
            <StatCard label="Tarihsel CAGR" value={`${inputs.historicalCAGR}%`} sub={`%${inputs.cappedCAGR} kullanıldı`} color="blue" />
            <StatCard label="WACC" value={`${inputs.wacc}%`} sub={inputs.sectorEN} color="amber" />
            <StatCard label="Terminal g" value={`${inputs.terminalGrowth}%`} sub="Gordon" color="blue" />
          </div>

          {/* WACC adjustments */}
          {inputs.waccAdjustments?.length > 0 && (
            <div className="text-xs text-gray-400 flex flex-wrap gap-2 items-center px-1">
              <span className="text-gray-500">WACC ayarlamaları:</span>
              {inputs.waccAdjustments.map((a, i) => (
                <span key={i} className="px-2 py-0.5 rounded-md bg-dark-800 border border-dark-700">
                  {a.label} <span className="text-amber-300">{a.value}</span>
                </span>
              ))}
            </div>
          )}

          {/* FCF history */}
          {inputs.fcfHistory?.length > 1 && (
            <div className="rounded-xl border border-dark-700 bg-dark-900/40 p-3 sm:p-3.5">
              <div className="text-sm text-gray-300 mb-3 flex items-center gap-1.5 font-medium">
                <TrendingUp className="w-4 h-4 text-amber-400" />
                Tarihsel FCF
              </div>
              <div className="flex items-end gap-2 h-24">
                {inputs.fcfHistory.map(h => {
                  const max = Math.max(...inputs.fcfHistory.map(x => Math.abs(x.fcf)))
                  const height = max > 0 ? (Math.abs(h.fcf) / max) * 100 : 0
                  return (
                    <div key={h.year} className="flex-1 flex flex-col items-center gap-1.5">
                      <div className="text-xs text-gray-400 font-medium">{fmtBig(h.fcf, sym)}</div>
                      <div
                        className={`w-full rounded-sm ${h.fcf >= 0 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ height: `${height}%` }}
                      />
                      <div className="text-xs text-gray-500">{h.year}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Projection */}
          <div className="rounded-xl border border-dark-700 bg-dark-900/40 p-3 sm:p-3.5">
            <div className="text-sm text-gray-300 mb-3 flex items-center gap-1.5 font-medium">
              <Target className="w-4 h-4 text-amber-400" />
              5 Yıllık FCF Projeksiyonu (Bugünkü Değere İndirgenmiş)
            </div>
            <ProjectionTable projection={data.projection} baseFCF={inputs.baseFCF} symbol={sym} />
          </div>

          {/* Bridge to fair price */}
          <div className="rounded-xl border border-dark-700 bg-dark-900/40 p-3 sm:p-3.5">
            <div className="text-sm text-gray-300 mb-3 font-medium">Adil Değere Köprü</div>
            <div className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">5y PV toplamı</span>
                <span className="text-white">{fmtBig(val.sumPV5y, sym)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">+ Terminal PV (Gordon)</span>
                <span className="text-white">{fmtBig(val.terminalPV, sym)}</span>
              </div>
              <div className="flex justify-between border-t border-dark-700 pt-2">
                <span className="text-gray-300">= Enterprise Value</span>
                <span className="text-amber-300 font-semibold">{fmtBig(val.enterpriseValue, sym)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">− Net Borç</span>
                <span className="text-red-300">{fmtBig(val.netDebt, sym)}</span>
              </div>
              <div className="flex justify-between border-t border-dark-700 pt-2">
                <span className="text-gray-300">= Equity Value</span>
                <span className="text-amber-300 font-semibold">{fmtBig(val.equityValue, sym)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">÷ Hisse Sayısı</span>
                <span className="text-gray-400">{fmtBig(inputs.shares)}</span>
              </div>
              <div className="flex justify-between border-t border-amber-500/30 pt-2">
                <span className="text-white font-semibold">= Adil Fiyat</span>
                <span className="text-amber-300 font-bold text-lg">{fmtPrice(val.fairPrice, sym)}</span>
              </div>
            </div>
          </div>

          {/* Sensitivity matrix */}
          <div className="rounded-xl border border-dark-700 bg-dark-900/40 p-3 sm:p-3.5">
            <div className="text-sm text-gray-300 mb-3 flex items-center gap-1.5 font-medium">
              <Zap className="w-4 h-4 text-amber-400" />
              3×3 Hassasiyet Matrisi (WACC ±%1 × Terminal g)
            </div>
            <SensitivityMatrix sensitivity={data.sensitivity} currentPrice={val.currentPrice} symbol={sym} />
            <div className="text-xs text-gray-500 mt-3 leading-relaxed">
              Yeşil hücreler = adil fiyat güncel fiyatın üstünde (alım fırsatı potansiyeli). Kırmızı = pahalı.
            </div>
          </div>

          {/* Disclaimer */}
          <div className="text-xs text-gray-500 px-1 leading-relaxed">
            DCF teorik bir değerleme yöntemidir; tek başına yatırım kararı için yeterli değildir. Yahoo Finance verileri kullanılır,
            BIST hisselerinde tarihsel FCF eksik olduğunda fallback hesaplar (operating CF − capex veya net income proxy) devreye girer.
          </div>
        </>
      )}
    </div>
  )
}
