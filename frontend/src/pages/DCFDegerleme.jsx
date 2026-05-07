import { useState, useEffect } from 'react'
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

function fmtBig(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)} mlr`
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)} mn`
  if (abs >= 1e3) return `${(n / 1e3).toFixed(0)}b`
  return fmtNum(n)
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

function VerdictCard({ verdict, fairPrice, currentPrice, upside }) {
  const v = VERDICT_LABELS[verdict] || VERDICT_LABELS.belirsiz
  const colors = {
    green: 'from-green-500/20 to-green-700/5 border-green-500/40 text-green-300',
    amber: 'from-amber-500/20 to-amber-700/5 border-amber-500/40 text-amber-300',
    red:   'from-red-500/20 to-red-700/5 border-red-500/40 text-red-300',
    gray:  'from-gray-500/20 to-gray-700/5 border-gray-500/40 text-gray-300',
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
        </div>
        {upside !== null && (
          <div className="text-right">
            <div className={`text-2xl sm:text-3xl font-bold ${upside >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {upside >= 0 ? '+' : ''}{upside}%
            </div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400">Upside</div>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-white/10">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-400">İçsel Değer</div>
          <div className="text-xl font-bold text-white">{fmtNum(fairPrice, 2)} ₺</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-400">Güncel Fiyat</div>
          <div className="text-xl font-bold text-white">{fmtNum(currentPrice, 2)} ₺</div>
        </div>
      </div>
    </div>
  )
}

function SensitivityMatrix({ sensitivity, currentPrice }) {
  if (!sensitivity?.rows) return null
  return (
    <div className="overflow-x-auto custom-scrollbar">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="text-left p-2 text-gray-500 font-medium">WACC ↓ \ g →</th>
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
                    <div className="font-semibold text-white">{fair ? fmtNum(fair, 2) : '—'}</div>
                    {diff !== null && (
                      <div className={`text-[10px] ${diff >= 0 ? 'text-green-300' : 'text-red-300'}`}>
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

function ProjectionTable({ projection, baseFCF }) {
  if (!projection?.length) return null
  const cumPV = projection.reduce((a, p) => a + p.pv, 0)
  return (
    <div className="overflow-x-auto custom-scrollbar">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-gray-500">
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
            <td className="p-2 text-right text-white font-semibold">{fmtBig(baseFCF)}</td>
            <td className="p-2 text-right text-gray-500">—</td>
          </tr>
          {projection.map(p => (
            <tr key={p.year} className="border-t border-dark-800">
              <td className="p-2 text-gray-400">+{p.year} yıl</td>
              <td className="p-2 text-right text-amber-300">{p.growthRate}%</td>
              <td className="p-2 text-right text-white">{fmtBig(p.fcf)}</td>
              <td className="p-2 text-right text-blue-300">{fmtBig(p.pv)}</td>
            </tr>
          ))}
          <tr className="border-t border-dark-700 bg-amber-500/5">
            <td className="p-2 text-amber-300 font-semibold">Toplam PV (5y)</td>
            <td colSpan="2"></td>
            <td className="p-2 text-right text-amber-300 font-bold">{fmtBig(cumPV)}</td>
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

  const calculate = async (sym) => {
    const s = (sym || inputVal).trim().toUpperCase().replace('.IS', '')
    if (!s) return
    setSymbol(s)
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

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-white">DCF Değerleme</h1>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-200 border border-amber-500/40">YENİ</span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">İndirgenmiş Nakit Akımı yöntemiyle içsel değer hesabı (5 yıl projeksiyon + Gordon terminal)</p>
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
        <div className="flex gap-2">
          <input
            className="input flex-1 text-sm"
            placeholder="Sembol: THYAO, ASELS, GARAN..."
            value={inputVal}
            onChange={e => setInputVal(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && calculate()}
          />
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
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 flex gap-2 items-start">
        <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-blue-200/90">
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
          <div className="rounded-xl border border-dark-700 bg-dark-900/40 p-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="text-lg font-bold text-white">{data.symbol}</div>
                <div className="text-xs text-gray-400">{data.name}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">{data.sector} · {data.market}</div>
              </div>
              <div className="text-right text-[10px] text-gray-500">
                <div>FCF kaynağı: <span className="text-amber-300">{inputs?.fcfSource}</span></div>
                <div>Mod: {inputs?.waccMode?.toUpperCase()}</div>
              </div>
            </div>
          </div>

          {/* Verdict */}
          <VerdictCard
            verdict={val.verdict}
            fairPrice={val.fairPrice}
            currentPrice={val.currentPrice}
            upside={val.upsidePct}
          />

          {/* Key inputs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatCard label="Baz FCF" value={fmtBig(inputs.baseFCF)} sub="son yıl" color="amber" />
            <StatCard label="Tarihsel CAGR" value={`${inputs.historicalCAGR}%`} sub={`%${inputs.cappedCAGR} kullanıldı`} color="blue" />
            <StatCard label="WACC" value={`${inputs.wacc}%`} sub={inputs.sectorEN} color="amber" />
            <StatCard label="Terminal g" value={`${inputs.terminalGrowth}%`} sub="Gordon" color="blue" />
          </div>

          {/* WACC adjustments */}
          {inputs.waccAdjustments?.length > 0 && (
            <div className="text-[11px] text-gray-400 flex flex-wrap gap-2 px-1">
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
            <div className="rounded-xl border border-dark-700 bg-dark-900/40 p-3">
              <div className="text-xs text-gray-400 mb-2 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                Tarihsel FCF
              </div>
              <div className="flex items-end gap-2 h-20">
                {inputs.fcfHistory.map(h => {
                  const max = Math.max(...inputs.fcfHistory.map(x => Math.abs(x.fcf)))
                  const height = max > 0 ? (Math.abs(h.fcf) / max) * 100 : 0
                  return (
                    <div key={h.year} className="flex-1 flex flex-col items-center gap-1">
                      <div className="text-[9px] text-gray-500">{fmtBig(h.fcf)}</div>
                      <div
                        className={`w-full rounded-sm ${h.fcf >= 0 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ height: `${height}%` }}
                      />
                      <div className="text-[9px] text-gray-500">{h.year}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Projection */}
          <div className="rounded-xl border border-dark-700 bg-dark-900/40 p-3">
            <div className="text-xs text-gray-400 mb-2 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-amber-400" />
              5 Yıllık FCF Projeksiyonu (Bugünkü Değere İndirgenmiş)
            </div>
            <ProjectionTable projection={data.projection} baseFCF={inputs.baseFCF} />
          </div>

          {/* Bridge to fair price */}
          <div className="rounded-xl border border-dark-700 bg-dark-900/40 p-3">
            <div className="text-xs text-gray-400 mb-2">Adil Değere Köprü</div>
            <div className="text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-gray-400">5y PV toplamı</span>
                <span className="text-white">{fmtBig(val.sumPV5y)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">+ Terminal PV (Gordon)</span>
                <span className="text-white">{fmtBig(val.terminalPV)}</span>
              </div>
              <div className="flex justify-between border-t border-dark-700 pt-1.5">
                <span className="text-gray-300">= Enterprise Value</span>
                <span className="text-amber-300 font-semibold">{fmtBig(val.enterpriseValue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">− Net Borç</span>
                <span className="text-red-300">{fmtBig(val.netDebt)}</span>
              </div>
              <div className="flex justify-between border-t border-dark-700 pt-1.5">
                <span className="text-gray-300">= Equity Value</span>
                <span className="text-amber-300 font-semibold">{fmtBig(val.equityValue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">÷ Hisse Sayısı</span>
                <span className="text-gray-400">{fmtBig(inputs.shares)}</span>
              </div>
              <div className="flex justify-between border-t border-amber-500/30 pt-1.5">
                <span className="text-white font-semibold">= Adil Fiyat</span>
                <span className="text-amber-300 font-bold text-base">{fmtNum(val.fairPrice, 2)} ₺</span>
              </div>
            </div>
          </div>

          {/* Sensitivity matrix */}
          <div className="rounded-xl border border-dark-700 bg-dark-900/40 p-3">
            <div className="text-xs text-gray-400 mb-2 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              3×3 Hassasiyet Matrisi (WACC ±%1 × Terminal g)
            </div>
            <SensitivityMatrix sensitivity={data.sensitivity} currentPrice={val.currentPrice} />
            <div className="text-[10px] text-gray-500 mt-2">
              Yeşil hücreler = adil fiyat güncel fiyatın üstünde (alım fırsatı potansiyeli). Kırmızı = pahalı.
            </div>
          </div>

          {/* Disclaimer */}
          <div className="text-[10px] text-gray-600 px-1">
            DCF teorik bir değerleme yöntemidir; tek başına yatırım kararı için yeterli değildir. Yahoo Finance verileri kullanılır,
            BIST hisselerinde tarihsel FCF eksik olduğunda fallback hesaplar (operating CF − capex veya net income proxy) devreye girer.
          </div>
        </>
      )}
    </div>
  )
}
