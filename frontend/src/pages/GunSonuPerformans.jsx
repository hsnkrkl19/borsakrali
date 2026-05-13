import { useState, useEffect, useMemo } from 'react'
import {
  BarChart3, RefreshCw, TrendingUp, TrendingDown, Target as TargetIcon,
  CheckCircle2, XCircle, Clock, Trophy, Activity, Coins, ArrowUpDown,
  X, History, Hash, CalendarClock, Layers,
} from 'lucide-react'
import api from '../services/api'

const TABS = [
  { id: 'stocks', label: 'Hisse', icon: Activity },
  { id: 'crypto', label: 'Kripto', icon: Coins },
]

const VIEW_MODES = [
  { id: 'latest',  label: 'Sembol başı son',  icon: Layers,  desc: 'Her sembol için en son üretilen sinyal' },
  { id: 'history', label: 'Sinyaller tarihçesi', icon: History, desc: 'Tüm fazlardan tüm sinyal versiyonları (kronolojik)' },
]

const SORTABLE_COLS = [
  { key: 'signalId',      label: 'Sinyal #',   numeric: false },
  { key: 'createdAt',     label: 'Verildi',    numeric: true  },
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

const PHASE_LABEL = {
  premarket: 'Açılış öncesi (09:55)',
  revision:  'Revizyon (11:00)',
  intraday:  'Gün içi refresh',
  morning:   'Sabah (09:00)',
  midday:    'Öğle (13:00)',
  evening:   'Akşam (19:00)',
  night:     'Gece (01:00)',
}

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

// "09:55" gibi sadece saat-dakika (Türkiye saati)
function fmtTime(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleTimeString('tr-TR', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul',
    })
  } catch { return '—' }
}

// "13.05.2026 09:55:12" tam tarih+saat (tooltip ve modal için)
function fmtDateTime(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZone: 'Europe/Istanbul',
    })
  } catch { return '—' }
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

function phaseBadge(phase) {
  if (!phase) return null
  const cls = {
    premarket: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    revision:  'bg-blue-500/15 text-blue-300 border-blue-500/30',
    intraday:  'bg-purple-500/15 text-purple-300 border-purple-500/30',
    morning:   'bg-amber-500/15 text-amber-300 border-amber-500/30',
    midday:    'bg-orange-500/15 text-orange-300 border-orange-500/30',
    evening:   'bg-violet-500/15 text-violet-300 border-violet-500/30',
    night:     'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  }[phase] || 'bg-gray-500/15 text-gray-300 border-gray-500/30'
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border uppercase tracking-wider ${cls}`}>{phase}</span>
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
  const [viewMode, setViewMode] = useState('latest')
  const [sortKey, setSortKey] = useState('returnPct')
  const [sortDir, setSortDir] = useState('desc')
  const [detail, setDetail] = useState(null) // tıklanan sinyalin full satırı

  useEffect(() => {
    let alive = true
    api.get('/market/daily-performance/dates?limit=30')
      .then(res => {
        if (!alive) return
        const list = res.data?.dates || []
        setDates(list)
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

  const activeBucket = data?.[tab] || { signals: [], history: [], summary: null }
  const summary = activeBucket?.summary
  const baseRows = viewMode === 'history'
    ? (activeBucket?.history || [])
    : (activeBucket?.signals || [])

  const sortedRows = useMemo(() => {
    if (!baseRows.length) return []
    const col = SORTABLE_COLS.find(c => c.key === sortKey)
    if (!col) return baseRows
    const arr = [...baseRows]
    arr.sort((a, b) => {
      let av = a[sortKey]; let bv = b[sortKey]
      // createdAt karşılaştırması: ISO string → timestamp
      if (sortKey === 'createdAt') {
        av = av ? new Date(av).getTime() : 0
        bv = bv ? new Date(bv).getTime() : 0
      }
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (col.numeric) return sortDir === 'asc' ? av - bv : bv - av
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
    })
    return arr
  }, [baseRows, sortKey, sortDir])

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const historyCount = activeBucket?.history?.length || 0
  const latestCount  = activeBucket?.signals?.length  || 0

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

      {/* VIEW MODE TOGGLE */}
      <div className="bg-dark-900/60 border border-dark-700 rounded-2xl p-1.5">
        <div className="flex gap-1">
          {VIEW_MODES.map(m => {
            const Icon = m.icon
            const isActive = viewMode === m.id
            const count = m.id === 'history' ? historyCount : latestCount
            return (
              <button
                key={m.id}
                onClick={() => setViewMode(m.id)}
                title={m.desc}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all
                  ${isActive
                    ? 'bg-amber-500/15 border border-amber-500/30 text-amber-200'
                    : 'text-gray-400 hover:text-white hover:bg-dark-800 border border-transparent'
                  }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {m.label}
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${isActive ? 'bg-amber-500/20 text-amber-200' : 'bg-dark-700 text-gray-300'}`}>
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

      {/* "10K girseydin" özeti — sadece "latest" mod */}
      {viewMode === 'latest' && summary && summary.total > 0 && (
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
                Hesap: T1'e değen sinyaller hedefte kapatıldı kabul edilir, diğerleri gün kapanış fiyatına göre. Aynı semboldeki yeniden üretilen sinyalden yalnızca en sonuncusu sayılır.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tarihçe modunda bilgi notu */}
      {viewMode === 'history' && (
        <div className="rounded-xl border border-dark-700 bg-dark-900/40 p-3 text-xs text-gray-400 flex items-start gap-2">
          <History className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            Tarihçe modunda <strong className="text-white">aynı sembol birden fazla satırla</strong> görünebilir — her satır, sinyalin verildiği farklı bir andır (ör. <code className="text-amber-300 bg-dark-800 px-1 rounded">ASELS_1</code> önce, sonra koşullar değişip <code className="text-amber-300 bg-dark-800 px-1 rounded">ASELS_2</code> yeniden üretilmiş). Geriye dönük düzeltme yapılmaz — her sinyal verildiği saatle birlikte kalıcıdır.
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
        ) : sortedRows.length === 0 ? (
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
                      key={`${r.signalId || r.symbol}-${r.strategy}-${r.createdAt || i}`}
                      onClick={() => setDetail(r)}
                      className="border-t border-dark-800 hover:bg-amber-500/[0.04] cursor-pointer transition-colors"
                      title="Sinyal detayını gör"
                    >
                      {/* Sinyal # */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1 text-amber-300 font-mono text-[11px] font-semibold">
                          <Hash className="w-3 h-3" />
                          {r.signalId || `${r.symbol}_?`}
                        </div>
                      </td>
                      {/* Verildi (saat) */}
                      <td
                        className="px-3 py-2.5 whitespace-nowrap text-gray-300"
                        title={fmtDateTime(r.createdAt)}
                      >
                        <div className="flex items-center gap-1.5">
                          <CalendarClock className="w-3.5 h-3.5 text-gray-500" />
                          <div className="flex flex-col">
                            <span className="text-[12px] font-medium">{fmtTime(r.createdAt)}</span>
                            {r.phase && <span className="text-[9px] text-gray-500 uppercase">{r.phase}</span>}
                          </div>
                        </div>
                      </td>
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
        Bir satıra tıklayarak <strong>sinyalin tam detayını ve hangi an verildiğini</strong> görüntüleyebilirsin.
      </div>

      {/* DETAY MODAL */}
      {detail && (
        <SignalDetailModal
          detail={detail}
          history={activeBucket?.history || []}
          onClose={() => setDetail(null)}
          onJumpToSignal={(s) => setDetail(s)}
        />
      )}
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

// ── Sinyal Detay Modalı ────────────────────────────────────────────────────
// Tek bir sinyalin (örn ASELS_2) ne zaman, hangi fazda, hangi parametrelerle
// verildiğini gösterir. Altta aynı sembolün diğer versiyonlarını ("ASELS_1",
// "ASELS_3" …) listeleyerek tarihçeyi kolayca dolaşmayı sağlar.
function SignalDetailModal({ detail, history, onClose, onJumpToSignal }) {
  const r = detail
  const ob = outcomeBadge(r.outcome)
  const positive = (r.bestExitPct ?? 0) >= 0

  // Aynı sembol+strateji+direction için tüm versiyonlar (kronolojik artan)
  const versions = useMemo(() => {
    const same = (history || []).filter(h =>
      h.symbol === r.symbol &&
      h.strategy === r.strategy &&
      (h.direction || '') === (r.direction || '')
    )
    return [...same].sort((a, b) =>
      new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
    )
  }, [history, r])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-dark-900 border border-amber-500/30 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal başlık */}
        <div className="sticky top-0 bg-dark-900/95 backdrop-blur border-b border-dark-700 px-5 py-3 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-amber-300 font-mono text-sm font-bold">
                <Hash className="inline w-3.5 h-3.5 mr-1" />
                {r.signalId || `${r.symbol}_?`}
              </span>
              {dirBadge(r.direction)}
              {phaseBadge(r.phase)}
            </div>
            <div className="text-lg font-bold text-white mt-1">{r.symbol}</div>
            {r.name && <div className="text-xs text-gray-400">{r.name}</div>}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-dark-800 text-gray-400 hover:text-white"
            aria-label="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Verildiği an */}
        <div className="px-5 py-4 border-b border-dark-800">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Sinyal ne zaman verildi?</div>
          <div className="flex items-center gap-2 text-amber-200 font-semibold">
            <CalendarClock className="w-4 h-4" />
            {fmtDateTime(r.createdAt)}
          </div>
          {r.phase && (
            <div className="text-xs text-gray-400 mt-1">
              Faz: <span className="text-gray-200">{PHASE_LABEL[r.phase] || r.phase}</span>
            </div>
          )}
        </div>

        {/* Parametreler */}
        <div className="px-5 py-4 border-b border-dark-800 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <DetailRow label="Giriş"   value={fmtPrice(r.entryPrice)} />
          <DetailRow label="Hedef T1" value={fmtPrice(r.target)} valueCls="text-emerald-300" />
          <DetailRow label="Stop"    value={fmtPrice(r.stop)}    valueCls="text-red-300" />
          <DetailRow label="Kapanış" value={fmtPrice(r.currentClose)} />
          <DetailRow label="Gün max" value={fmtPrice(r.intradayHigh)} />
          <DetailRow label="Gün min" value={fmtPrice(r.intradayLow)} />
        </div>

        {/* Sonuç */}
        <div className="px-5 py-4 border-b border-dark-800">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Gün sonu sonucu</div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold border ${ob.cls}`}>
              {ob.icon} {ob.label}
            </span>
            <span className={`text-base font-bold ${positive ? 'text-emerald-300' : 'text-red-300'}`}>
              {positive ? <TrendingUp className="inline w-4 h-4 mr-1" /> : <TrendingDown className="inline w-4 h-4 mr-1" />}
              {fmtPct(r.bestExitPct)}
            </span>
            <span className="text-xs text-gray-400">
              10.000 ₺ →{' '}
              <span className={positive ? 'text-emerald-300' : 'text-red-300'}>
                {fmtTL(r.whatIf10K)}
              </span>
            </span>
          </div>
          {r.totalScore != null && (
            <div className="text-[11px] text-gray-500 mt-2">
              Skor: <span className="text-amber-300 font-semibold">{r.totalScore}</span>
              {r.grade && <> · Sınıf: <span className="text-gray-300">{r.grade}</span></>}
              {r.strategy && <> · Strateji: <span className="text-gray-300">{r.strategy}</span></>}
            </div>
          )}
        </div>

        {/* Bu sembolün tüm versiyonları */}
        {versions.length > 1 && (
          <div className="px-5 py-4">
            <div className="flex items-center gap-2 mb-2">
              <History className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-semibold text-white">
                Bu sembol bugün {versions.length} kez sinyal verdi
              </span>
            </div>
            <div className="text-[11px] text-gray-500 mb-3">
              Koşullar değiştikçe yeniden üretildi. Aşağıdaki kayıtlar geriye dönük düzeltilmez.
            </div>
            <div className="space-y-1.5">
              {versions.map((v) => {
                const isCurrent = v.signalId === r.signalId
                const vOb = outcomeBadge(v.outcome)
                return (
                  <button
                    key={`${v.signalId}-${v.createdAt}`}
                    onClick={() => onJumpToSignal(v)}
                    disabled={isCurrent}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-xs transition-colors
                      ${isCurrent
                        ? 'bg-amber-500/10 border border-amber-500/30 cursor-default'
                        : 'bg-dark-800/60 border border-dark-700 hover:bg-dark-800 hover:border-amber-500/30'
                      }`}
                  >
                    <span className="font-mono text-amber-300 font-bold w-16">{v.signalId}</span>
                    <span className="text-gray-300 w-20">{fmtTime(v.createdAt)}</span>
                    {phaseBadge(v.phase)}
                    <span className="text-gray-400 ml-2">→ Giriş {fmtPrice(v.entryPrice)}</span>
                    <span className={`ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${vOb.cls}`}>
                      {vOb.icon} {fmtPct(v.bestExitPct)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function DetailRow({ label, value, valueCls }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`text-sm font-semibold ${valueCls || 'text-white'}`}>{value}</div>
    </div>
  )
}
