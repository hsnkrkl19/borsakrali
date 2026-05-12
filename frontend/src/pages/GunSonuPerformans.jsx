import { useState, useEffect, useMemo } from 'react'
import {
  BarChart3, RefreshCw, TrendingUp, TrendingDown, Target as TargetIcon,
  CheckCircle2, XCircle, Clock, Trophy, Activity, Coins, ArrowUpDown,
} from 'lucide-react'
import api from '../services/api'

const TABS = [
  { id: 'stocks', label: 'Hisse', icon: Activity },
  { id: 'crypto', label: 'Kripto', icon: Coins },
]

const SORTABLE_COLS = [
  { key: 'symbol',        label: 'Sembol',     numeric: false },
  { key: 'direction',     label: 'Tip',        numeric: false },
  { key: 'entryPrice',    label: 'Giriş',      numeric: true  },
  { key: 'target',        label: 'T1',         numeric: true  },
  { key: 'stop',          label: 'Stop',       numeric: true  },
  { key: 'currentClose',  label: 'Kapanış',    numeric: true  },
  { key: 'returnPct',     label: 'Getiri %',   numeric: true  },
  { key: 'whatIf10K',     label: '10K → ?',    numeric: true  },
  { key: 'outcome',       label: 'Sonuç',      numeric: false },
]

function fmtPrice(v) {
  if (v == null) return '—'
  const abs = Math.abs(v)
  const digits = abs >= 100 ? 2 : abs >= 1 ? 3 : 5
  return Number(v).toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function fmtPct(v) {
  if (v == null) return '—'
  const sign = v > 0 ? '+' : ''
  return `${sign}${Number(v).toFixed(2)}%`
}

function fmtTL(v) {
  if (v == null) return '—'
  return Number(v).toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' ₺'
}

function dirBadge(direction) {
  const map = {
    long:  { label: 'Long',  cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
    short: { label: 'Short', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
    spot:  { label: 'Spot',  cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  }
  const m = map[direction] || { label: direction || '—', cls: 'bg-gray-500/15 text-gray-300 border-gray-500/30' }
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${m.cls}`}>{m.label}</span>
}

function outcomeBadge(o) {
  if (o === 'hit_target') return { icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: 'T1 Vuruldu', cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' }
  if (o === 'hit_stop')   return { icon: <XCircle className="w-3.5 h-3.5" />,      label: 'Stop',       cls: 'text-red-300 bg-red-500/10 border-red-500/30' }
  if (o === 'open')       return { icon: <Clock className="w-3.5 h-3.5" />,        label: 'Açık',       cls: 'text-gray-300 bg-gray-500/10 border-gray-500/30' }
  return { icon: <Clock className="w-3.5 h-3.5" />, label: '—', cls: 'text-gray-300 bg-gray-500/10 border-gray-500/30' }
}

export default function GunSonuPerformans() {
  const [dates, setDates] = useState([])
  const [date, setDate] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('stocks')
  const [sortKey, setSortKey] = useState('returnPct')
  const [sortDir, setSortDir] = useState('desc')

  useEffect(() => {
    let alive = true
    api.get('/market/daily-performance/dates?limit=30')
      .then(res => {
        if (!alive) return
        const list = res.data?.dates || []
        setDates(list)
        // default: en güncel tarih
        if (list.length > 0) setDate(list[0])
      })
      .catch(e => alive && setError(e.message))
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!date) return
    let alive = true
    setLoading(true); setError(null)
    api.get(`/market/daily-performance/${date}?compute=1`)
      .then(res => alive && setData(res.data))
      .catch(e => {
        if (!alive) return
        setError(e.response?.data?.error || e.message)
        setData(null)
      })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [date])

  const refresh = async () => {
    if (!date) return
    setLoading(true); setError(null)
    try {
      const res = await api.get(`/market/daily-performance/${date}?compute=1&_=${Date.now()}`)
      setData(res.data)
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    } finally {
      setLoading(false)
    }
  }

  const activeBucket = data?.[tab] || { signals: [], summary: null }
  const summary = activeBucket?.summary
  const rows = activeBucket?.signals || []

  const sortedRows = useMemo(() => {
    if (!rows.length) return []
    const col = SORTABLE_COLS.find(c => c.key === sortKey)
    if (!col) return rows
    const arr = [...rows]
    arr.sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (col.numeric) return sortDir === 'asc' ? av - bv : bv - av
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
    })
    return arr
  }, [rows, sortKey, sortDir])

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.06] via-dark-900/60 to-dark-900/30 p-4 sm:p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
              <BarChart3 className="w-5 h-5 text-dark-950" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Gün Sonu Performans</h1>
              <p className="text-xs sm:text-sm text-gray-400">O gün üretilen sinyallerin gün sonu sonuçları — hedef, stop, kapanış</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/40"
            >
              {dates.length === 0 && <option value="">Tarih yok</option>}
              {dates.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <button
              onClick={refresh}
              disabled={loading || !date}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm font-medium hover:bg-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Tekrar hesapla"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </button>
          </div>
        </div>
      </div>

      {/* TAB */}
      <div className="bg-dark-900/60 border border-dark-700 rounded-2xl p-1.5">
        <div className="flex gap-1">
          {TABS.map(t => {
            const Icon = t.icon
            const isActive = tab === t.id
            const count = data?.[t.id]?.summary?.total ?? 0
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all
                  ${isActive
                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-dark-950 shadow-lg shadow-amber-500/25'
                    : 'text-gray-400 hover:text-white hover:bg-dark-800'
                  }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${isActive ? 'bg-dark-950/20' : 'bg-dark-700 text-gray-300'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* METRİK KARTLARI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          icon={<Activity className="w-4 h-4 text-amber-400" />}
          label="Toplam sinyal"
          value={summary?.total ?? '—'}
          sub={summary?.total > 0 ? `${summary.winners} kazanan · ${summary.losers} kaybeden` : null}
        />
        <MetricCard
          icon={<Trophy className="w-4 h-4 text-emerald-400" />}
          label="Kazanan oranı"
          value={summary ? `${summary.winRate}%` : '—'}
          tone={(summary?.winRate ?? 0) >= 50 ? 'pos' : 'neg'}
        />
        <MetricCard
          icon={<TrendingUp className="w-4 h-4 text-sky-400" />}
          label="Ortalama getiri"
          value={summary ? fmtPct(summary.avgBestExit) : '—'}
          sub={summary ? `Kapanış ort: ${fmtPct(summary.avgReturn)}` : null}
          tone={(summary?.avgBestExit ?? 0) >= 0 ? 'pos' : 'neg'}
        />
        <MetricCard
          icon={<TargetIcon className="w-4 h-4 text-amber-400" />}
          label="En iyi sinyal"
          value={summary?.bestSignal ? `${summary.bestSignal.symbol} ${fmtPct(summary.bestSignal.bestExitPct)}` : '—'}
          sub={summary?.bestSignal ? `${summary.bestSignal.direction} · ${summary.bestSignal.outcome === 'hit_target' ? 'T1' : 'kapanış'}` : null}
          tone="pos"
        />
      </div>

      {/* "10K girseydin" özeti */}
      {summary && summary.total > 0 && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
          <div className="flex items-start gap-3">
            <Trophy className="w-5 h-5 text-amber-300 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-gray-200">
              <div className="font-semibold text-white">
                Eğer her sinyale {fmtTL(data?.sampleInvestment ?? 10000)} girseydin →{' '}
                toplamda{' '}
                <span className={summary.sumWhatIf10KPnL >= 0 ? 'text-emerald-300' : 'text-red-300'}>
                  {summary.sumWhatIf10KPnL >= 0 ? '+' : ''}{fmtTL(summary.sumWhatIf10KPnL)}
                </span>{' '}
                kazanır/kaybederdin.
              </div>
              <div className="text-[12px] text-gray-400 mt-1">
                Hesap: T1'e değen sinyaller hedefte kapatıldı kabul edilir, diğerleri gün kapanış fiyatına göre.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HATA */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
          Performans yüklenemedi: {error}
        </div>
      )}

      {/* TABLO */}
      <div className="rounded-2xl border border-dark-700 bg-dark-900/60 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400 text-sm">
            <RefreshCw className="w-6 h-6 mx-auto mb-3 animate-spin text-amber-400" />
            Hesaplanıyor — bu, gün ortasında 30-60 saniye sürebilir.
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm">
            {tab === 'crypto' && data && !data.hasCryptoSnapshot
              ? 'Bu tarih için kripto sinyal snapshot\'ı bulunmuyor.'
              : 'Bu tarihte değerlendirilebilen sinyal yok.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-dark-800/60 text-gray-400 text-[11px] uppercase tracking-wider">
                <tr>
                  {SORTABLE_COLS.map(col => (
                    <th
                      key={col.key}
                      className="px-3 py-2.5 text-left font-semibold whitespace-nowrap cursor-pointer select-none hover:text-amber-300"
                      onClick={() => toggleSort(col.key)}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        <ArrowUpDown className={`w-3 h-3 ${sortKey === col.key ? 'text-amber-400' : 'text-gray-600'}`} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r, i) => {
                  const positive = (r.bestExitPct ?? 0) >= 0
                  const ob = outcomeBadge(r.outcome)
                  return (
                    <tr
                      key={`${r.symbol}-${r.strategy}-${i}`}
                      className="border-t border-dark-800 hover:bg-dark-800/40"
                    >
                      <td className="px-3 py-2.5 font-bold text-white whitespace-nowrap">
                        <div className="flex flex-col">
                          <span>{r.symbol}</span>
                          {r.name && <span className="text-[10px] text-gray-500 truncate max-w-[140px]">{r.name}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">{dirBadge(r.direction)}</td>
                      <td className="px-3 py-2.5 text-gray-200 whitespace-nowrap">{fmtPrice(r.entryPrice)}</td>
                      <td className="px-3 py-2.5 text-emerald-300 whitespace-nowrap">{fmtPrice(r.target)}</td>
                      <td className="px-3 py-2.5 text-red-300 whitespace-nowrap">{fmtPrice(r.stop)}</td>
                      <td className="px-3 py-2.5 text-gray-200 whitespace-nowrap">{fmtPrice(r.currentClose)}</td>
                      <td className={`px-3 py-2.5 font-semibold whitespace-nowrap ${positive ? 'text-emerald-300' : 'text-red-300'}`}>
                        {positive ? <TrendingUp className="inline w-3.5 h-3.5 mr-1" /> : <TrendingDown className="inline w-3.5 h-3.5 mr-1" />}
                        {fmtPct(r.bestExitPct)}
                      </td>
                      <td className={`px-3 py-2.5 font-semibold whitespace-nowrap ${positive ? 'text-emerald-300' : 'text-red-300'}`}>
                        {fmtTL(r.whatIf10K)}
                        <div className="text-[10px] text-gray-500 font-normal">
                          {r.whatIf10KPnL >= 0 ? '+' : ''}{fmtTL(r.whatIf10KPnL)}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${ob.cls}`}>
                          {ob.icon} {ob.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="text-[11px] text-gray-500 px-1">
        Veri kaynağı: gün-içi 1g mum (Yahoo Finance). Sinyal girişleri snapshot'tan, T1/Stop dokunması mum yüksek/düşüğü ile değerlendirilir.
      </div>
    </div>
  )
}

function MetricCard({ icon, label, value, sub, tone }) {
  const valueCls = tone === 'pos' ? 'text-emerald-300' : tone === 'neg' ? 'text-red-300' : 'text-white'
  return (
    <div className="rounded-2xl border border-dark-700 bg-dark-900/60 p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-gray-400 mb-2">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`text-xl sm:text-2xl font-bold ${valueCls} truncate`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-500 mt-1 truncate">{sub}</div>}
    </div>
  )
}
