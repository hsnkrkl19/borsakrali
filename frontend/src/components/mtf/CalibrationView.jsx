import { RefreshCw, AlertTriangle, Activity, Clock, Sparkles, Info, CheckCircle2 } from 'lucide-react'

/**
 * MTF Calibration sekmesi — Bayesian Beta posterior heatmap.
 * Önceden MTFSinyalleri.jsx içinde 240+ satır helper olarak duruyordu.
 *
 * Sub-component'ler:
 *   - CalibrationView (üst bilgi + manuel tetikleme + heatmap'ler)
 *   - CalibrationProgressBar (canlı progress + ETA + son adım winRate)
 *   - CalibrationHeatmap (TF × bucket grid, prob renkli + samples opacity)
 */

export default function CalibrationView({ data, activeTF, onCalibrate, running, progress }) {
  if (!data) {
    return (
      <div className="card p-8 text-center">
        <RefreshCw className="w-6 h-6 text-gold-400 animate-spin mx-auto mb-2" />
        <p className="text-sm text-gray-400">Calibration yükleniyor...</p>
      </div>
    )
  }
  if (data.error) {
    return (
      <div className="card p-6 text-center">
        <AlertTriangle className="w-6 h-6 text-red-400 mx-auto mb-2" />
        <p className="text-sm text-red-300">{data.error}</p>
      </div>
    )
  }
  const snapshot = data.snapshot || {}
  const tfs = Object.keys(snapshot).sort((a, b) => {
    const order = ['1m', '5m', '15m', '1h', '4h', '1d', '1w']
    return order.indexOf(a) - order.indexOf(b)
  })
  const allBuckets = ['0', '0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9', '1']

  // Toplam istatistik
  let totalSamples = 0, totalBuckets = 0, weightedProbSum = 0
  for (const tf of tfs) {
    for (const dir of ['long', 'short']) {
      const buckets = snapshot[tf]?.[dir] || {}
      for (const b of Object.keys(buckets)) {
        totalSamples += buckets[b].samples || 0
        totalBuckets += 1
        weightedProbSum += (buckets[b].probability || 0) * (buckets[b].samples || 1)
      }
    }
  }
  const avgProb = totalSamples > 0 ? (weightedProbSum / Math.max(totalSamples, 1)) : null

  return (
    <div className="space-y-3">
      {/* Üst bilgi + tetikleme */}
      <div className="card p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1 text-gray-400">
            <Activity className="w-3.5 h-3.5 text-gold-400" />
            <span className="text-gold-400 font-semibold">Bayesian Calibration</span>
          </span>
          <span className="text-gray-600">·</span>
          <span className="text-gray-400">
            <span className="text-white font-mono">{totalBuckets}</span> bucket ·
            <span className="text-white font-mono"> {totalSamples}</span> örneklem
            {avgProb != null && (<>
              <span className="text-gray-600 mx-1">·</span>
              <span>Ağırlıklı ort: <span className="text-white font-mono">{(avgProb * 100).toFixed(1)}%</span></span>
            </>)}
          </span>
          {data.generatedAt && (<>
            <span className="text-gray-600">·</span>
            <span className="text-gray-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(data.generatedAt).toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit'})}
            </span>
          </>)}
        </div>
        <button
          onClick={onCalibrate}
          disabled={running}
          className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1 disabled:opacity-50"
          title={`${activeTF} × 3 gün backtest çalıştır + Bayesian update`}
        >
          {running ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {running ? 'Hesaplanıyor...' : `${activeTF} kalibre et`}
        </button>
      </div>

      {/* Progress bar — calibration çalışırken canlı güncelleme */}
      {progress && progress.phase !== 'completed' && (
        <CalibrationProgressBar progress={progress} />
      )}

      {/* Açıklama */}
      <div className="card p-3 flex items-start gap-2 bg-blue-500/5 border-blue-500/20 text-[11px]">
        <Info className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
        <p className="text-gray-400 leading-relaxed">
          Her hücre <span className="text-white">Beta(α, β)</span> posterior — gerçek backtest verisinden öğrenilmiş kazanma olasılığı.
          Skor oranı 0.0-1.0 bucket'lara ayrılır. Hücre rengi olasılık (yeşil = yüksek), parlaklık örneklem sayısıyla artar.
          Sample yokken sadece prior gösterilir (gri tonu). Otomatik kalibrasyon her 12 saatte bir geniş kapsamda çalışır.
        </p>
      </div>

      {/* Heatmap grid: TF satırları, bucket sütunları */}
      {tfs.length === 0 ? (
        <div className="card p-6 text-center">
          <Activity className="w-6 h-6 text-gray-500 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Henüz kalibrasyon verisi yok.</p>
          <p className="text-xs text-gray-500 mt-1">"{activeTF} kalibre et" ile manuel başlat ya da otomatik çalışmasını bekle (90 sn boot delay).</p>
        </div>
      ) : (
        <div className="space-y-3">
          {['long', 'short'].map(dir => (
            <CalibrationHeatmap
              key={dir}
              direction={dir}
              snapshot={snapshot}
              tfs={tfs}
              allBuckets={allBuckets}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CalibrationProgressBar({ progress }) {
  const { phase, completedSteps, totalSteps, currentTF, currentDate, elapsedMs, step } = progress
  const pct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0
  const elapsedSec = Math.round((elapsedMs || 0) / 1000)
  // ETA: ortalama step süresi × kalan step
  const stepAvgMs = completedSteps > 0 ? (elapsedMs || 0) / completedSteps : 0
  const remainingMs = stepAvgMs * Math.max(0, totalSteps - completedSteps)
  const etaSec = Math.round(remainingMs / 1000)

  const phaseLabel = {
    starting:    'Başlatılıyor',
    started:     'Başlatıldı',
    running:     `${currentTF || ''}@${currentDate || ''} işleniyor`,
    step_done:   'Adım tamamlandı',
    step_error:  'Adım hatası',
    completed:   'Tamamlandı',
  }[phase] || phase

  const lastWinRate = step?.longWinRate != null
    ? `Long ${step.longWinRate}% (${step.longCount}) · Short ${step.shortWinRate}% (${step.shortCount})`
    : null

  return (
    <div className="card p-3 space-y-2 border-gold-400/30">
      <div className="flex items-center justify-between text-[11px] flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <RefreshCw className={`w-3.5 h-3.5 text-gold-400 ${phase === 'running' ? 'animate-spin' : ''}`} />
          <span className="text-gold-400 font-semibold">Calibration</span>
          <span className="text-gray-400">— {phaseLabel}</span>
        </div>
        <div className="text-gray-400 font-mono text-[10px]">
          {completedSteps} / {totalSteps} adım
          {elapsedSec > 0 && <span className="ml-2">· geçen {elapsedSec}sn</span>}
          {etaSec > 0 && phase !== 'completed' && <span className="ml-2">· kalan ~{etaSec}sn</span>}
        </div>
      </div>
      {/* Progress bar */}
      <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-gold-400 to-emerald-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      {lastWinRate && (
        <div className="text-[10px] text-gray-500 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          <span className="text-gray-300">Son adım:</span> {lastWinRate}
        </div>
      )}
    </div>
  )
}

function CalibrationHeatmap({ direction, snapshot, tfs, allBuckets }) {
  const dirLabel = direction === 'long' ? 'LONG' : 'SHORT'
  const dirColor = direction === 'long' ? 'emerald' : 'rose'

  return (
    <div className="card p-3 space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full bg-${dirColor}-500/15 text-${dirColor}-300 border border-${dirColor}-500/30`}>
          {dirLabel}
        </span>
        <span className="text-[10px] text-gray-500">— skor oranı (X) × timeframe (Y)</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]" style={{ minWidth: 520 }}>
          <thead>
            <tr className="text-gray-500">
              <th className="text-left pr-2 py-1 sticky left-0 bg-dark-800">TF</th>
              {allBuckets.map(b => (
                <th key={b} className="text-center px-1 py-1 font-mono">{b}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tfs.map(tf => (
              <tr key={tf}>
                <td className="text-left pr-2 py-1 sticky left-0 bg-dark-800 font-mono font-semibold text-white">{tf}</td>
                {allBuckets.map(b => {
                  const bucket = snapshot[tf]?.[direction]?.[b]
                  if (!bucket) return (
                    <td key={b} className="text-center px-0.5 py-0.5">
                      <div className="rounded bg-dark-800 border border-dark-700 text-gray-700 py-1.5">—</div>
                    </td>
                  )
                  // Color: olasılık → yeşil tonlar (long) / kırmızı (short)
                  const p = bucket.probability ?? 0.5
                  const samples = bucket.samples ?? 0
                  // Confidence intensity: samples log scale → 0-1
                  const intensity = Math.min(1, Math.log10(1 + samples) / 1.7)  // 50 sample ≈ 1.0
                  const baseColor = direction === 'long' ? '0,201,138' : '255,90,90'
                  // Background opacity: prob × intensity
                  const bg = `rgba(${baseColor}, ${0.15 + p * intensity * 0.55})`
                  const border = `rgba(${baseColor}, ${0.30 + intensity * 0.40})`
                  const textColor = p > 0.5 ? 'white' : 'rgba(255,255,255,0.8)'

                  return (
                    <td key={b} className="text-center px-0.5 py-0.5">
                      <div
                        className="rounded border py-1 leading-tight"
                        style={{ background: bg, borderColor: border, color: textColor }}
                        title={`Bucket ${b} · α=${bucket.alpha?.toFixed(2)} β=${bucket.beta?.toFixed(2)} · n=${samples}`}
                      >
                        <div className="font-mono font-bold">{(p * 100).toFixed(0)}%</div>
                        <div className="text-[8px] opacity-70">n{samples}</div>
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
