import { useState } from 'react'
import { Target, RefreshCw, Sparkles, Info, AlertTriangle, Activity } from 'lucide-react'
import { formatUsd, TF_LIST } from './utils'

/**
 * MTF Backtest sekmesi — geçmiş tarihli leak-proof Binance simülasyonu.
 * Önceden MTFSinyalleri.jsx içinde 300+ satır helper olarak duruyordu.
 *
 * Sub-component'ler:
 *   - BacktestView (form + run)
 *   - BacktestResults (sonuç özet bar + StatPanel × 2 + BacktestList × 2)
 *   - StatPanel (kâr/zarar oran kartı)
 *   - BacktestList (sonuçlar tablosu)
 */

const OUTCOME_STYLES = {
  hit_target:     { label: '🎯 Hedef · kâr',  color: 'text-emerald-300', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30' },
  hit_stop:       { label: '🛑 Stop · zarar',  color: 'text-rose-300',    bg: 'bg-rose-500/15',    border: 'border-rose-500/30' },
  still_running: { label: '⏳ Açık',    color: 'text-amber-300',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30' },
  no_future_data: { label: '⊘ Veri',    color: 'text-gray-400',    bg: 'bg-gray-500/10',    border: 'border-gray-500/20' },
  no_levels:      { label: '⊘ Seviye',  color: 'text-gray-400',    bg: 'bg-gray-500/10',    border: 'border-gray-500/20' },
}

export default function BacktestView({ activeTF, data, onRun, running }) {
  // Default asOfDate: 7 gün önce (sonuçlar olgunlaşmış olur)
  const defaultDate = (() => {
    const d = new Date(Date.now() - 7 * 24 * 3600 * 1000)
    return d.toISOString().slice(0, 10)
  })()
  const [tf, setTF] = useState(activeTF)
  const [asOf, setAsOf] = useState(defaultDate)
  const [horizon, setHorizon] = useState(0)  // 0 = TF default
  const [feedToCalibration, setFeedToCalibration] = useState(false)

  const HORIZON_DEFAULTS = { '1m': 60, '5m': 60, '15m': 60, '1h': 24, '4h': 30, '1d': 7, '1w': 4 }
  const effectiveHorizon = horizon || HORIZON_DEFAULTS[tf] || 24

  const handleRun = () => {
    onRun({ tf, asOf, horizon: effectiveHorizon, feedToCalibration })
  }

  return (
    <div className="space-y-3">
      {/* Form */}
      <div className="card p-3 space-y-3">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-gold-400" />
          <span className="text-sm font-semibold text-white">Geçmiş Tarihli Backtest</span>
          <span className="text-[10px] text-gray-500">— Binance klines leak-proof simülasyon</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          {/* TF */}
          <div>
            <label className="block text-[9px] text-gray-500 uppercase tracking-wider mb-1">Timeframe</label>
            <select
              value={tf}
              onChange={(e) => setTF(e.target.value)}
              className="w-full bg-dark-800 border border-dark-700 rounded-lg text-xs px-2 py-1.5 text-white font-mono focus:outline-none focus:border-gold-500/50"
            >
              {TF_LIST.map(t => (
                <option key={t.key} value={t.key}>{t.label} (tier {t.tier})</option>
              ))}
            </select>
          </div>
          {/* asOfDate */}
          <div>
            <label className="block text-[9px] text-gray-500 uppercase tracking-wider mb-1">As-of Tarihi</label>
            <input
              type="date"
              value={asOf}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setAsOf(e.target.value)}
              className="w-full bg-dark-800 border border-dark-700 rounded-lg text-xs px-2 py-1.5 text-white font-mono focus:outline-none focus:border-gold-500/50"
            />
          </div>
          {/* Horizon */}
          <div>
            <label className="block text-[9px] text-gray-500 uppercase tracking-wider mb-1">Horizon (mum)</label>
            <input
              type="number"
              min="1"
              max="200"
              placeholder={`Varsayılan: ${HORIZON_DEFAULTS[tf]}`}
              value={horizon || ''}
              onChange={(e) => setHorizon(parseInt(e.target.value, 10) || 0)}
              className="w-full bg-dark-800 border border-dark-700 rounded-lg text-xs px-2 py-1.5 text-white font-mono focus:outline-none focus:border-gold-500/50"
            />
          </div>
          {/* Run */}
          <div className="flex items-end">
            <button
              onClick={handleRun}
              disabled={running}
              className="w-full btn-primary text-xs px-3 py-1.5 flex items-center justify-center gap-1 disabled:opacity-50"
            >
              {running ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {running ? 'Hesaplanıyor...' : 'Backtest Çalıştır'}
            </button>
          </div>
        </div>

        {/* Calibration feed checkbox */}
        <label className="flex items-center gap-2 cursor-pointer group">
          <input
            type="checkbox"
            checked={feedToCalibration}
            onChange={(e) => setFeedToCalibration(e.target.checked)}
            className="rounded border-dark-600 bg-dark-800 text-gold-400 focus:ring-purple-500/30 focus:ring-offset-0 w-3.5 h-3.5"
          />
          <span className="text-[11px] text-gray-400 group-hover:text-gray-300">
            Sonuçları <span className="text-gold-400 font-semibold">kalibrasyona ekle</span> — Beta posterior güncellenir, win probability iyileşir
          </span>
        </label>

        <div className="flex items-start gap-2 p-2 bg-blue-500/5 border border-blue-500/20 rounded-lg text-[11px]">
          <Info className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
          <p className="text-gray-400 leading-relaxed">
            <span className="text-white">Leak-proof:</span> Sinyal seçilen tarihte üretilir (Binance endTime cutoff).
            Sonraki {effectiveHorizon} mum üzerinde target1/stop kontrolü yapılır.
            Calibration bu sonuçları kullanarak Beta posterior günceller.
          </p>
        </div>
      </div>

      {/* Sonuç */}
      {!data && !running && (
        <div className="card p-6 text-center">
          <Target className="w-6 h-6 text-gray-500 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Bir tarih + TF seçip "Backtest Çalıştır"a tıkla.</p>
        </div>
      )}

      {running && (
        <div className="card p-8 text-center">
          <RefreshCw className="w-6 h-6 text-gold-400 animate-spin mx-auto mb-2" />
          <p className="text-sm text-gray-400">Backtest çalışıyor — Binance klines toplanıyor...</p>
          <p className="text-[11px] text-gray-500 mt-1">Tier'a göre 5-15 saniye sürer.</p>
        </div>
      )}

      {data?.error && (
        <div className="card p-6 text-center">
          <AlertTriangle className="w-6 h-6 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-red-300">{data.error}</p>
        </div>
      )}

      {data && !data.error && !running && (
        <BacktestResults data={data} />
      )}
    </div>
  )
}

function BacktestResults({ data }) {
  const longStats  = data.stats?.long  || {}
  const shortStats = data.stats?.short || {}
  const long  = data.longResults  || []
  const short = data.shortResults || []
  // Top 10 her yönde, totalScore'a göre
  const topLong  = [...long].sort((a, b) => b.totalScore - a.totalScore).slice(0, 10)
  const topShort = [...short].sort((a, b) => b.totalScore - a.totalScore).slice(0, 10)

  return (
    <div className="space-y-3">
      {/* Üst bilgi */}
      <div className="card p-3 flex items-center justify-between gap-2 flex-wrap text-[11px]">
        <div className="flex items-center gap-3 text-gray-400">
          <span className="text-white font-mono">{data.tf}</span>
          <span className="text-gray-600">·</span>
          <span>asOf: <span className="text-white font-mono">{data.asOfDate}</span></span>
          <span className="text-gray-600">·</span>
          <span>horizon: <span className="text-white font-mono">{data.horizon}</span> mum</span>
          <span className="text-gray-600">·</span>
          <span>tier: <span className="text-white font-mono">{data.tierLimit}</span></span>
          <span className="text-gray-600">·</span>
          <span>analiz: <span className="text-white font-mono">{data.analyzedCount}</span></span>
        </div>
        {data.calibration && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-gold-400/15 text-gold-400 border border-gold-400/30 flex items-center gap-1">
            <Activity className="w-3 h-3" />
            Calibration: +{data.calibration.updated} update
            {data.calibration.skipped > 0 && <span className="opacity-60">· {data.calibration.skipped} atlandı</span>}
            {data.calibration.saved && <span className="ml-1">★</span>}
          </span>
        )}
      </div>

      {/* Stats — LONG + SHORT yan yana */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <StatPanel direction="long" stats={longStats} totalSignals={long.length} />
        <StatPanel direction="short" stats={shortStats} totalSignals={short.length} />
      </div>

      {/* Long sonuçlar */}
      {topLong.length > 0 && (
        <BacktestList direction="long" signals={topLong} />
      )}

      {/* Short sonuçlar */}
      {topShort.length > 0 && (
        <BacktestList direction="short" signals={topShort} />
      )}
    </div>
  )
}

function StatPanel({ direction, stats, totalSignals }) {
  const cls = direction === 'long' ? 'border-emerald-500/30' : 'border-rose-500/30'
  const dirLabel = direction === 'long' ? '↑ LONG' : '↓ SHORT'
  const dirColor = direction === 'long' ? 'text-emerald-300' : 'text-rose-300'
  return (
    <div className={`card p-3 space-y-2 border ${cls}`}>
      <div className="flex items-center justify-between">
        <span className={`text-sm font-bold ${dirColor}`}>{dirLabel}</span>
        <span className="text-[10px] text-gray-500">{totalSignals} sinyal</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 text-[11px]">
        <div className="p-1.5 rounded bg-dark-800 border border-dark-700">
          <div className="text-[9px] text-gray-500 uppercase">Kârlı Oran</div>
          <div className="text-base font-bold text-white">%{stats.winRate || 0}</div>
        </div>
        <div className="p-1.5 rounded bg-dark-800 border border-dark-700">
          <div className="text-[9px] text-gray-500 uppercase">Ort. Getiri</div>
          <div className={`text-base font-bold ${(stats.avgReturn || 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
            {(stats.avgReturn || 0) >= 0 ? '+' : ''}{stats.avgReturn || 0}%
          </div>
        </div>
        <div className="p-1.5 rounded bg-emerald-500/5 border border-emerald-500/20">
          <div className="text-[9px] text-gray-500 uppercase">Hedef</div>
          <div className="text-base font-bold text-emerald-300">{stats.hitTarget || 0}</div>
        </div>
        <div className="p-1.5 rounded bg-rose-500/5 border border-rose-500/20">
          <div className="text-[9px] text-gray-500 uppercase">Stop</div>
          <div className="text-base font-bold text-rose-300">{stats.hitStop || 0}</div>
        </div>
        <div className="p-1.5 rounded bg-amber-500/5 border border-amber-500/20 col-span-2">
          <div className="text-[9px] text-gray-500 uppercase">Açık (still_running)</div>
          <div className="text-base font-bold text-amber-300">{stats.stillRunning || 0}</div>
        </div>
      </div>
    </div>
  )
}

function BacktestList({ direction, signals }) {
  const dirLabel = direction === 'long' ? 'Long Sinyaller' : 'Short Sinyaller'
  const dirColor = direction === 'long' ? 'text-emerald-300' : 'text-rose-300'
  return (
    <div className="card p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className={`text-sm font-bold ${dirColor}`}>{dirLabel}</span>
        <span className="text-[10px] text-gray-500">— top {signals.length} (skora göre)</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]" style={{ minWidth: 600 }}>
          <thead className="text-gray-500">
            <tr>
              <th className="text-left py-1 px-2">Coin</th>
              <th className="text-center py-1 px-2">Skor</th>
              <th className="text-center py-1 px-2">Sonuç</th>
              <th className="text-right py-1 px-2">Getiri</th>
              <th className="text-right py-1 px-2">Bar</th>
              <th className="text-right py-1 px-2">Giriş</th>
              <th className="text-right py-1 px-2">Stop</th>
              <th className="text-right py-1 px-2">Hedef</th>
            </tr>
          </thead>
          <tbody>
            {signals.map((s, i) => {
              const outcome = OUTCOME_STYLES[s.outcome] || OUTCOME_STYLES.no_levels
              return (
                <tr key={s.symbol + i} className="border-t border-dark-700/50">
                  <td className="py-1.5 px-2 font-mono font-semibold text-white">{s.symbol}</td>
                  <td className="py-1.5 px-2 text-center text-gray-300">{s.totalScore}/{s.applicableMax}</td>
                  <td className="py-1.5 px-2 text-center">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${outcome.bg} ${outcome.border} ${outcome.color}`}>
                      {outcome.label}
                    </span>
                  </td>
                  <td className={`py-1.5 px-2 text-right font-mono font-bold ${(s.returnPct || 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {(s.returnPct || 0) >= 0 ? '+' : ''}{s.returnPct || 0}%
                  </td>
                  <td className="py-1.5 px-2 text-right text-gray-400">{s.bars || '—'}</td>
                  <td className="py-1.5 px-2 text-right text-gray-300 font-mono">{formatUsd(s.entry)}</td>
                  <td className="py-1.5 px-2 text-right text-rose-300/80 font-mono">{formatUsd(s.stop)}</td>
                  <td className="py-1.5 px-2 text-right text-emerald-300/80 font-mono">{formatUsd(s.target1)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
