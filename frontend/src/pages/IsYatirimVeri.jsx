/**
 * İş Yatırım Verileri — Python `urazakgul/isyatirimhisse` portu için kullanıcı arayüzü.
 *
 * 3 sekme:
 *   • Hisse (HisseTekil)     — günlük fiyat / hacim / piyasa değeri
 *   • Endeks (IndexHistoricalAll) — XU100, XU030 vb. tarihsel
 *   • Finansal Tablo (MaliTablo)  — 4 çeyrek × yıl (KALEM_KOD bazlı ham)
 *
 * Veri direkt `/api/isyatirim/*` üzerinden gelir. Her sekmenin CSV indirme butonu vardır.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Database, RefreshCw, Download, Search, Calendar, Building2, BarChart3, FileSpreadsheet, Info, Calculator } from 'lucide-react'
import { createChart } from 'lightweight-charts'
import api from '../services/api'
import { Button, Card, PageHeader, EmptyState, Spinner } from '../components/ui'
import ScrollableTabBar from '../components/ScrollableTabBar'

const TABS = [
  { id: 'stock',      label: 'Hisse',           icon: BarChart3 },
  { id: 'index',      label: 'Endeks',          icon: Building2 },
  { id: 'financials', label: 'Finansal Tablo',  icon: FileSpreadsheet },
]

const fmtNum = (n, d = 2) => n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d })
const fmtBigNum = (n) => {
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + ' Mr'
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + ' M'
  if (abs >= 1e3) return (n / 1e3).toFixed(2) + ' B'
  return fmtNum(n, 2)
}

const todayTr = () => {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
}
const yearsAgoTr = (yrs) => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - yrs)
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
}

function downloadCsv(rows, headers, fileName) {
  if (!rows?.length) return
  const escape = (v) => {
    if (v == null) return ''
    const s = String(v)
    return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const lines = [headers.map(h => escape(h.label)).join(';')]
  for (const r of rows) {
    lines.push(headers.map(h => escape(typeof h.value === 'function' ? h.value(r) : r[h.key])).join(';'))
  }
  const csv = '﻿' + lines.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── Mini grafik (kapanış area series) ────────────────────────────────────
// `series` = [{ date: 'YYYY-MM-DD', value: number }] — düzenli (eski→yeni)
function MiniChart({ series, title, color = '#d4af37', height = 200 }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const seriesRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current) return
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: { background: { color: 'transparent' }, textColor: '#9ca3af' },
      grid: { vertLines: { color: 'rgba(75,85,99,0.15)' }, horzLines: { color: 'rgba(75,85,99,0.15)' } },
      rightPriceScale: { borderColor: 'rgba(75,85,99,0.3)' },
      timeScale: { borderColor: 'rgba(75,85,99,0.3)', timeVisible: false, secondsVisible: false },
      crosshair: { mode: 1 },
      handleScroll: true,
      handleScale: true,
    })
    chartRef.current = chart
    const area = chart.addAreaSeries({
      lineColor: color,
      topColor: color + '55',
      bottomColor: color + '00',
      lineWidth: 2,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    })
    seriesRef.current = area

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth })
      }
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      try { chart.remove() } catch (_) {}
      chartRef.current = null
      seriesRef.current = null
    }
  }, [height, color])

  useEffect(() => {
    if (!seriesRef.current || !series?.length) return
    const data = series
      .filter(d => d.date && d.value != null && Number.isFinite(d.value))
      .map(d => ({ time: d.date, value: d.value }))
    if (!data.length) return
    try {
      seriesRef.current.setData(data)
      chartRef.current?.timeScale?.().fitContent()
    } catch (e) {
      // setData hatalı format atarsa görmezden gel
    }
  }, [series])

  return (
    <div className="rounded-xl border border-dark-700 bg-dark-900/40 p-2 mb-3">
      {title && (
        <div className="text-[11px] font-bold text-gray-400 px-1 pb-1 flex items-center gap-1.5">
          <BarChart3 size={11} className="text-amber-400" />
          {title}
        </div>
      )}
      <div ref={containerRef} style={{ width: '100%', height }} />
    </div>
  )
}

// ── Stock sekmesi ────────────────────────────────────────────────────────
function StockTab({ initialSymbol }) {
  const [symbol, setSymbol] = useState(initialSymbol || 'THYAO')
  const [start, setStart] = useState(yearsAgoTr(1))
  const [end, setEnd] = useState(todayTr())
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    if (!symbol) return
    setLoading(true); setError(null)
    try {
      const r = await api.get(`/isyatirim/stock/${symbol.trim().toUpperCase()}`, { params: { start, end } })
      setData(r.data?.data || [])
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Veri alınamadı')
      setData([])
    } finally { setLoading(false) }
  }, [symbol, start, end])

  // İlk yükleme + sembol değişince
  useEffect(() => { fetchData() }, []) // eslint-disable-line

  const onSubmit = (e) => { e.preventDefault(); fetchData() }

  const csvHeaders = [
    { key: 'date',          label: 'Tarih' },
    { key: 'symbol',        label: 'Sembol' },
    { key: 'close',         label: 'Düzeltilmiş Kapanış' },
    { key: 'closeRaw',      label: 'Ham Kapanış' },
    { key: 'high',          label: 'Yüksek' },
    { key: 'low',           label: 'Düşük' },
    { key: 'volume',        label: 'Hacim (adet)' },
    { key: 'volumeUsd',     label: 'Hacim (USD)' },
    { key: 'weightedAvg',   label: 'AOF' },
    { key: 'marketCap',     label: 'Piyasa Değeri' },
    { key: 'marketCapUsd',  label: 'Piyasa Değeri (USD)' },
    { key: 'freeFloatCap',  label: 'HAO Piy. Değ.' },
    { key: 'closeUsd',      label: 'Kapanış (USD)' },
    { key: 'indexValue',    label: 'BIST 100 (kapanış)' },
    { key: 'usdRate',       label: 'USD/TRY' },
    { key: 'capital',       label: 'Sermaye' },
  ]

  // Son satırı en üstte gösterelim — render limiti 80 satır, tam veri CSV'de
  const rows = useMemo(() => [...data].reverse().slice(0, 80), [data])

  // Grafik için kronolojik sıra
  const chartSeries = useMemo(
    () => data.map(d => ({ date: d.date, value: d.close })).filter(d => d.date && d.value != null),
    [data]
  )

  return (
    <Card padding="md">
      <form onSubmit={onSubmit} className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-3">
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="THYAO, ASELS, SISE..."
          className="input col-span-1 sm:col-span-1"
        />
        <input
          value={start}
          onChange={(e) => setStart(e.target.value)}
          placeholder="01-01-2024"
          className="input"
        />
        <input
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          placeholder={todayTr()}
          className="input"
        />
        <div className="flex gap-2">
          <Button type="submit" icon={Search} loading={loading} block>Getir</Button>
        </div>
      </form>
      <div className="text-[11px] text-gray-500 mb-3 flex items-center gap-1">
        <Info size={12} /> Tarih biçimi <code className="text-amber-300">gg-aa-yyyy</code>. Tek sembol veya virgülle ayrılmış birden fazla (örn. THYAO,ASELS).
      </div>

      {error && (
        <div className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-300">⚠ {error}</div>
      )}

      {chartSeries.length > 1 && (
        <MiniChart series={chartSeries} title={`${symbol.toUpperCase()} — Düzeltilmiş Kapanış (${chartSeries.length} gün)`} height={220} />
      )}

      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-gray-400">
          {loading ? 'Yükleniyor…' : `${data.length} kayıt`} <span className="text-gray-600">· Kaynak: İş Yatırım HisseTekil</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={Download}
          disabled={!data.length}
          onClick={() => downloadCsv(data, csvHeaders, `${symbol}_${start}_${end}.csv`)}
        >CSV</Button>
      </div>

      {loading ? (
        <div className="py-10 flex justify-center"><Spinner size={32} /></div>
      ) : !rows.length ? (
        <EmptyState icon={Database} title="Veri yok" description="Sembol veya tarih aralığını değiştirin." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-dark-700">
          <table className="w-full text-xs">
            <thead className="bg-dark-800 text-gray-400 border-b border-dark-700">
              <tr>
                <th className="px-2 py-2 text-left">Tarih</th>
                <th className="px-2 py-2 text-right">Kapanış</th>
                <th className="px-2 py-2 text-right">Yüksek</th>
                <th className="px-2 py-2 text-right">Düşük</th>
                <th className="px-2 py-2 text-right">AOF</th>
                <th className="px-2 py-2 text-right">Hacim</th>
                <th className="px-2 py-2 text-right">Piy. Değ.</th>
                <th className="px-2 py-2 text-right">USD Kapanış</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-dark-800 hover:bg-dark-800/50">
                  <td className="px-2 py-1.5 text-gray-300">{r.date}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-white">{fmtNum(r.close, 2)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-emerald-300">{fmtNum(r.high, 2)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-rose-300">{fmtNum(r.low, 2)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-gray-300">{fmtNum(r.weightedAvg, 2)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-gray-400">{fmtBigNum(r.volume)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-amber-300">{fmtBigNum(r.marketCap)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-gray-400">{fmtNum(r.closeUsd, 4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data.length > 80 && (
        <div className="text-[11px] text-gray-500 mt-2">En son 80 işlem günü gösteriliyor (toplam {data.length}). Tüm veriyi CSV ile indirebilirsiniz.</div>
      )}
    </Card>
  )
}

// ── Index sekmesi ────────────────────────────────────────────────────────
function IndexTab({ knownIndices }) {
  const [code, setCode] = useState('XU100')
  const [start, setStart] = useState(yearsAgoTr(1))
  const [end, setEnd] = useState(todayTr())
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    if (!code) return
    setLoading(true); setError(null)
    try {
      const r = await api.get(`/isyatirim/index/${code.trim().toUpperCase()}`, { params: { start, end } })
      setData(r.data?.data || [])
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Veri alınamadı')
      setData([])
    } finally { setLoading(false) }
  }, [code, start, end])

  useEffect(() => { fetchData() }, []) // eslint-disable-line

  const onSubmit = (e) => { e.preventDefault(); fetchData() }

  const rows = useMemo(() => [...data].reverse().slice(0, 80), [data])

  const chartSeries = useMemo(
    () => data.map(d => ({ date: d.date, value: d.value })).filter(d => d.date && d.value != null),
    [data]
  )

  const csvHeaders = [
    { key: 'date',  label: 'Tarih' },
    { key: 'index', label: 'Endeks' },
    { key: 'value', label: 'Değer' },
  ]

  // Mini istatistikler
  const stats = useMemo(() => {
    if (!data.length) return null
    const values = data.map(d => d.value).filter(v => v != null)
    if (!values.length) return null
    const first = values[0]
    const last = values[values.length - 1]
    const min = Math.min(...values)
    const max = Math.max(...values)
    const change = last - first
    const changePct = first ? (change / first * 100) : 0
    return { first, last, min, max, change, changePct }
  }, [data])

  return (
    <Card padding="md">
      <form onSubmit={onSubmit} className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-3">
        <select value={code} onChange={(e) => setCode(e.target.value)} className="input">
          {knownIndices.map(idx => (
            <option key={idx.code} value={idx.code}>{idx.code} — {idx.name}</option>
          ))}
        </select>
        <input value={start} onChange={(e) => setStart(e.target.value)} placeholder="01-01-2024" className="input" />
        <input value={end}   onChange={(e) => setEnd(e.target.value)}   placeholder={todayTr()} className="input" />
        <Button type="submit" icon={Search} loading={loading} block>Getir</Button>
      </form>

      {error && (
        <div className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-300">⚠ {error}</div>
      )}

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
          <Stat label="İlk" value={fmtNum(stats.first, 2)} />
          <Stat label="Son" value={fmtNum(stats.last, 2)} />
          <Stat label="Min" value={fmtNum(stats.min, 2)} tone="rose" />
          <Stat label="Max" value={fmtNum(stats.max, 2)} tone="emerald" />
          <Stat label="Değişim" value={`${stats.change >= 0 ? '+' : ''}${fmtNum(stats.changePct, 2)}%`} tone={stats.change >= 0 ? 'emerald' : 'rose'} />
        </div>
      )}

      {chartSeries.length > 1 && (
        <MiniChart
          series={chartSeries}
          title={`${code.toUpperCase()} — Kapanış (${chartSeries.length} gün)`}
          color={stats && stats.change >= 0 ? '#10b981' : '#ef4444'}
          height={240}
        />
      )}

      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-gray-400">
          {loading ? 'Yükleniyor…' : `${data.length} gün`} <span className="text-gray-600">· Kaynak: İş Yatırım IndexHistoricalAll</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={Download}
          disabled={!data.length}
          onClick={() => downloadCsv(data, csvHeaders, `${code}_${start}_${end}.csv`)}
        >CSV</Button>
      </div>

      {loading ? (
        <div className="py-10 flex justify-center"><Spinner size={32} /></div>
      ) : !rows.length ? (
        <EmptyState icon={Database} title="Veri yok" description="Endeks veya tarih aralığını değiştirin." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-dark-700">
          <table className="w-full text-xs">
            <thead className="bg-dark-800 text-gray-400 border-b border-dark-700">
              <tr>
                <th className="px-2 py-2 text-left">Tarih</th>
                <th className="px-2 py-2 text-left">Endeks</th>
                <th className="px-2 py-2 text-right">Değer</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-dark-800 hover:bg-dark-800/50">
                  <td className="px-2 py-1.5 text-gray-300">{r.date}</td>
                  <td className="px-2 py-1.5 text-amber-300">{r.index}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-white">{fmtNum(r.value, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data.length > 80 && (
        <div className="text-[11px] text-gray-500 mt-2">En son 80 işlem günü gösteriliyor (toplam {data.length}). Tüm veriyi CSV ile indirebilirsiniz.</div>
      )}
    </Card>
  )
}

// ── Mali Tablo: hesaplanmış oranlar ─────────────────────────────────────
// İş Yatırım KALEM_ADI'na göre değer bulur. periodKey: 'Q1'|'Q2'|'Q3'|'Q4'
function findItemValue(rows, namePatterns, periodKey = 'Q4') {
  for (const pat of namePatterns) {
    const found = rows.find(r => {
      const name = (r.itemDescTr || '').toLowerCase().replace(/\s+/g, ' ').trim()
      if (pat instanceof RegExp) return pat.test(name)
      return name.includes(String(pat).toLowerCase())
    })
    if (found) {
      const v = found[periodKey]
      if (v != null && Number.isFinite(v) && v !== 0) return v
    }
  }
  return null
}

function calcRatios(rows, periodKey = 'Q4') {
  if (!rows?.length) return null
  const g = (patterns) => findItemValue(rows, patterns, periodKey)

  const totalAssets    = g(['toplam varlık', 'toplam aktif', 'varlıklar toplamı'])
  const currentAssets  = g(['dönen varlıklar', 'i- dönen varlıklar', 'i.dönen varlıklar'])
  const currentLiab    = g(['kısa vadeli yükümlülük', 'iii- kısa vadeli yükümlülükler'])
  const totalLiab      = g(['toplam yükümlülük', 'yükümlülükler toplamı', 'toplam kaynak'])
  const equity         = g(['ana ortaklığa ait özkaynak', 'toplam özkaynak', 'özkaynaklar toplamı', 'özkaynak'])
  const revenue        = g(['hasılat', 'satış geliri', 'net satış', 'satışlar'])
  const grossProfit    = g(['brüt kâr', 'brüt kar'])
  const operatingProfit= g(['esas faaliyet kârı', 'faaliyet kârı', 'faaliyet karı'])
  const netProfit      = g(['dönem net kârı', 'net dönem kârı', 'dönem net kâr', 'net kâr (zarar)', 'dönem net kar'])

  const finalLiab = totalLiab ?? (totalAssets != null && equity != null ? totalAssets - equity : null)
  const r = {}
  if (revenue && grossProfit)     r.grossMargin    = grossProfit / revenue * 100
  if (revenue && operatingProfit) r.opMargin       = operatingProfit / revenue * 100
  if (revenue && netProfit)       r.netMargin      = netProfit / revenue * 100
  if (totalAssets && netProfit)   r.roa            = netProfit / totalAssets * 100
  if (equity && netProfit)        r.roe            = netProfit / equity * 100
  if (currentAssets && currentLiab) r.currentRatio = currentAssets / currentLiab
  if (equity && finalLiab)        r.debtToEquity   = finalLiab / equity
  r._revenue = revenue
  r._netProfit = netProfit
  r._totalAssets = totalAssets
  r._equity = equity
  return Object.keys(r).length > 4 ? r : null // sadece label dışı 0 hesap varsa null dön
}

// En son veri içeren çeyreği bul (Q4 → Q3 → Q2 → Q1). Bir kalemin dolu olması yeterli.
function detectLastFilledPeriod(rows) {
  for (const k of ['Q4', 'Q3', 'Q2', 'Q1']) {
    if (rows?.some(r => r[k] != null && Number.isFinite(r[k]) && r[k] !== 0)) return k
  }
  return 'Q4'
}

function RatiosPanel({ rows, year, periodKey }) {
  const effectiveKey = periodKey || detectLastFilledPeriod(rows)
  const r = useMemo(() => calcRatios(rows, effectiveKey), [rows, effectiveKey])
  if (!r) return null
  const periodLabel = effectiveKey === 'Q4' ? 'Yıllık' : effectiveKey === 'Q3' ? '9 Ay Kümülatif' : effectiveKey === 'Q2' ? '6 Ay Kümülatif' : '3 Ay Kümülatif'

  const Item = ({ label, value, suffix = '%', tone, hint, decimals = 2 }) => {
    const v = value
    const display = v == null || !Number.isFinite(v) ? '—' : `${suffix === '%' && v >= 0 ? '+' : ''}${v.toFixed(decimals)}${suffix}`
    let color = 'text-white'
    if (v != null && tone) {
      if (tone === 'higher-better') color = v >= 0 ? 'text-emerald-300' : 'text-rose-300'
      else if (tone === 'lower-better') color = v <= 1 ? 'text-emerald-300' : v <= 2 ? 'text-amber-300' : 'text-rose-300'
      else if (tone === 'ratio-current') color = v >= 1.5 ? 'text-emerald-300' : v >= 1 ? 'text-amber-300' : 'text-rose-300'
    }
    return (
      <div className="rounded-lg border border-dark-700 bg-dark-900/50 px-2.5 py-2">
        <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
        <div className={`text-base font-bold font-mono ${color}`}>{display}</div>
        {hint && <div className="text-[10px] text-gray-600 mt-0.5">{hint}</div>}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 mb-3">
      <div className="text-[11px] font-bold text-amber-300 mb-2 flex items-center gap-1.5">
        <Calculator size={11} />
        Hesaplanmış Oranlar — {year} ({periodLabel})
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        <Item label="Brüt Kâr Marjı"    value={r.grossMargin}  tone="higher-better" />
        <Item label="Faaliyet Marjı"     value={r.opMargin}    tone="higher-better" />
        <Item label="Net Kâr Marjı"      value={r.netMargin}   tone="higher-better" />
        <Item label="ROA"                value={r.roa}         tone="higher-better" hint="Aktif Kârlılığı" />
        <Item label="ROE"                value={r.roe}         tone="higher-better" hint="Özkaynak Kârlılığı" />
        <Item label="Cari Oran"          value={r.currentRatio} suffix="" decimals={2} tone="ratio-current" hint="Dönen V. / KV Yük." />
        <Item label="Borç/Özkaynak"      value={r.debtToEquity} suffix="" decimals={2} tone="lower-better" hint="Toplam Yük. / Özkaynak" />
      </div>
      <div className="text-[10px] text-gray-500 mt-2 leading-snug">
        ⓘ Oranlar IFRS standart raporlardan otomatik türetilmiştir. Sektör (örn. havayolu, finans) özel
        bilanço yapısı bazı marjları yanıltabilir — ham veriyi tablodan veya CSV'den doğrulayın.
      </div>
    </div>
  )
}

// ── Financials sekmesi ───────────────────────────────────────────────────
function FinancialsTab({ groups, initialSymbol }) {
  const now = new Date()
  const [symbol, setSymbol] = useState(initialSymbol || 'THYAO')
  const [startYear, setStartYear] = useState(now.getFullYear() - 2)
  const [endYear, setEndYear] = useState(now.getFullYear())
  const [exchange, setExchange] = useState('TRY')
  const [group, setGroup] = useState('1')
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchItem, setSearchItem] = useState('')

  const fetchData = useCallback(async () => {
    if (!symbol) return
    setLoading(true); setError(null)
    try {
      const r = await api.get(`/isyatirim/financials/${symbol.trim().toUpperCase()}`, {
        params: { startYear, endYear, exchange, group },
      })
      setData(r.data?.data || [])
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Veri alınamadı')
      setData([])
    } finally { setLoading(false) }
  }, [symbol, startYear, endYear, exchange, group])

  useEffect(() => { fetchData() }, []) // eslint-disable-line

  const onSubmit = (e) => { e.preventDefault(); fetchData() }

  // Filtreli satırlar
  const filtered = useMemo(() => {
    if (!searchItem.trim()) return data
    const q = searchItem.toLowerCase()
    return data.filter(r => (r.itemDescTr || '').toLowerCase().includes(q) || (r.itemCode || '').toLowerCase().includes(q))
  }, [data, searchItem])

  // Yıllara göre grupla
  const grouped = useMemo(() => {
    const byYear = new Map()
    for (const r of filtered) {
      if (!byYear.has(r.year)) byYear.set(r.year, [])
      byYear.get(r.year).push(r)
    }
    return Array.from(byYear.entries()).sort(([a], [b]) => b - a)
  }, [filtered])

  const csvHeaders = [
    { key: 'symbol',         label: 'Sembol' },
    { key: 'year',           label: 'Yıl' },
    { key: 'exchange',       label: 'Döviz' },
    { key: 'financialGroup', label: 'Grup' },
    { key: 'itemCode',       label: 'Kalem Kodu' },
    { key: 'itemDescTr',     label: 'Kalem Adı (TR)' },
    { key: 'Q1',             label: 'Q1 (3 Ay)' },
    { key: 'Q2',             label: 'Q2 (6 Ay)' },
    { key: 'Q3',             label: 'Q3 (9 Ay)' },
    { key: 'Q4',             label: 'Q4 (12 Ay)' },
  ]

  return (
    <Card padding="md">
      <form onSubmit={onSubmit} className="grid grid-cols-2 sm:grid-cols-6 gap-2 mb-3">
        <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="THYAO" className="input" />
        <input type="number" value={startYear} onChange={(e) => setStartYear(parseInt(e.target.value) || now.getFullYear() - 2)} placeholder="Başlangıç yılı" className="input" />
        <input type="number" value={endYear} onChange={(e) => setEndYear(parseInt(e.target.value) || now.getFullYear())} placeholder="Bitiş yılı" className="input" />
        <select value={exchange} onChange={(e) => setExchange(e.target.value)} className="input">
          <option value="TRY">TRY</option>
          <option value="USD">USD</option>
        </select>
        <select value={group} onChange={(e) => setGroup(e.target.value)} className="input">
          {groups.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
        <Button type="submit" icon={Search} loading={loading} block>Getir</Button>
      </form>

      {error && (
        <div className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-300">⚠ {error}</div>
      )}

      <div className="flex items-center justify-between gap-2 mb-2">
        <input
          value={searchItem}
          onChange={(e) => setSearchItem(e.target.value)}
          placeholder="Kalem ara (ör. hasılat, varlık, özkaynak)…"
          className="input flex-1 max-w-xs"
        />
        <div className="text-xs text-gray-400 flex-1 text-center">
          {loading ? 'Yükleniyor…' : `${filtered.length} kalem`} <span className="text-gray-600">· Kaynak: MaliTablo</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={Download}
          disabled={!filtered.length}
          onClick={() => downloadCsv(filtered, csvHeaders, `${symbol}_${startYear}-${endYear}_${exchange}.csv`)}
        >CSV</Button>
      </div>

      {loading ? (
        <div className="py-10 flex justify-center"><Spinner size={32} /></div>
      ) : !grouped.length ? (
        <EmptyState icon={FileSpreadsheet} title="Mali tablo yok" description="Sembol, yıl veya finansal grubu değiştirin." />
      ) : (
        <div className="space-y-4">
          {grouped.map(([year, rows]) => (
            <div key={year}>
              <div className="text-xs font-bold text-amber-300 mb-1.5 flex items-center gap-2">
                <Calendar size={12} /> {year} ({exchange})
              </div>
              <RatiosPanel rows={rows} year={year} />
              <div className="overflow-x-auto rounded-xl border border-dark-700">
                <table className="w-full text-xs">
                  <thead className="bg-dark-800 text-gray-400 border-b border-dark-700">
                    <tr>
                      <th className="px-2 py-2 text-left">Kod</th>
                      <th className="px-2 py-2 text-left">Kalem</th>
                      <th className="px-2 py-2 text-right">Q1 (3 Ay)</th>
                      <th className="px-2 py-2 text-right">Q2 (6 Ay)</th>
                      <th className="px-2 py-2 text-right">Q3 (9 Ay)</th>
                      <th className="px-2 py-2 text-right">Q4 (12 Ay)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 300).map((r, i) => (
                      <tr key={i} className="border-b border-dark-800 hover:bg-dark-800/50">
                        <td className="px-2 py-1.5 text-gray-500 font-mono text-[10px]">{r.itemCode}</td>
                        <td className="px-2 py-1.5 text-gray-200">{r.itemDescTr}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-gray-300">{fmtBigNum(r.Q1)}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-gray-300">{fmtBigNum(r.Q2)}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-gray-300">{fmtBigNum(r.Q3)}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-amber-300">{fmtBigNum(r.Q4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 300 && (
                <div className="text-[11px] text-gray-500 mt-1">{year}: ilk 300 kalem gösteriliyor.</div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ── Yardımcı ─────────────────────────────────────────────────────────────
function Stat({ label, value, tone }) {
  const cls = tone === 'emerald' ? 'text-emerald-300' : tone === 'rose' ? 'text-rose-300' : 'text-white'
  return (
    <div className="rounded-lg bg-dark-800/60 border border-dark-700 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`text-sm font-bold font-mono ${cls}`}>{value}</div>
    </div>
  )
}

// ── Ana sayfa ────────────────────────────────────────────────────────────
export default function IsYatirimVeri() {
  const [searchParams] = useSearchParams()
  const urlSymbol = (searchParams.get('symbol') || '').toUpperCase().trim() || null
  const urlTab    = searchParams.get('tab') // 'stock'|'index'|'financials'
  const [tab, setTab] = useState(urlTab || 'stock')
  const [meta, setMeta] = useState({ indices: [], financialGroups: [] })

  useEffect(() => {
    if (urlTab && urlTab !== tab) setTab(urlTab)
  }, [urlTab]) // eslint-disable-line

  useEffect(() => {
    api.get('/isyatirim/meta')
      .then(r => setMeta({
        indices: r.data?.indices || [],
        financialGroups: r.data?.financialGroups || [],
      }))
      .catch(() => {})
  }, [])

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <PageHeader
        icon={Database}
        eyebrow="Veri Kaynağı"
        title="İş Yatırım Verileri"
        description="isyatirim.com.tr resmi API'sinden hisse fiyatı, endeks ve mali tablo verileri. Python urazakgul/isyatirimhisse paketinin Node.js portu."
      />

      <ScrollableTabBar activeKey={tab}>
        <div className="flex gap-1.5 p-1 bg-dark-900/60 rounded-xl border border-dark-700">
          {TABS.map(t => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                data-tab-key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm rounded-lg whitespace-nowrap transition-all ${
                  active
                    ? 'bg-gold-500/15 text-gold-300 border border-gold-500/30'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-dark-800'
                }`}
              >
                <Icon size={14} />
                {t.label}
              </button>
            )
          })}
        </div>
      </ScrollableTabBar>

      {tab === 'stock'      && <StockTab initialSymbol={urlSymbol} />}
      {tab === 'index'      && <IndexTab knownIndices={meta.indices} />}
      {tab === 'financials' && <FinancialsTab groups={meta.financialGroups} initialSymbol={urlSymbol} />}

      <div className="text-[11px] text-gray-500 px-1 leading-relaxed">
        ⓘ Veriler isyatirim.com.tr'den canlı çekilir, 5 dk önbelleğe alınır.
        Excel/CSV indirme için her sekmedeki <strong>CSV</strong> butonunu kullanın.
        Aşırı istek IP engellemesine yol açabilir.
      </div>
    </div>
  )
}
