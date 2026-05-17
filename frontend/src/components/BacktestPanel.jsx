/**
 * Backtest Panel — Borsa Krali
 *
 * Kullanıcı geçmiş bir tarih + horizon + strateji seçer; backend o tarihteki
 * candle verisiyle sinyalleri yeniden üretir, sonraki N gün gerçek verisiyle
 * sonucu hesaplar (gelecek sızdırmadan).
 *
 * Çıktı: top-10 hisse + her birinin sonucu (hit_target / hit_stop /
 * still_running / no_trigger) + agrega istatistik (winRate, avgReturn).
 */

import { useState } from 'react'
import { Calendar, Play, RefreshCw, TrendingUp, TrendingDown, Minus, CheckCircle2, XCircle, Clock, AlertCircle, Target } from 'lucide-react'
import api from '../services/api'

const OUTCOME_STYLES = {
  hit_target:    { label: 'Hedef Vurdu',    color: 'emerald', icon: CheckCircle2 },
  hit_stop:      { label: 'Stop Oldu',      color: 'red',     icon: XCircle },
  no_trigger:    { label: 'Tetiklenmedi',   color: 'gray',    icon: Minus },
  still_running: { label: 'Açık Pozisyon',  color: 'blue',    icon: Clock },
  no_levels:     { label: 'Veri Yok',       color: 'gray',    icon: AlertCircle },
}

const DIRECTION_STYLES = {
  long:  { label: '↑ AL',  color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  short: { label: '↓ SAT', color: 'text-red-400',     bg: 'bg-red-500/10' },
}

const STRATEGY_LABELS = {
  trend:     { label: 'Yön Takibi',    sub: 'Anlık giriş · oynaklık-bazlı zarar durdur · 2.5× hedef' },
  reversion: { label: 'Dönüş Bölgesi', sub: 'Bölge girişi · oynaklık-bazlı zarar durdur · kazanç 2× zarar · DENEYSEL' },
}

// Pratik tarihler — geçmiş trade haftaları
function getPresetDates() {
  const presets = []
  const today = new Date()
  for (let i = 1; i <= 4; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i * 7)
    // Sadece haftaiçi seç
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1)
    presets.push({
      label: `${i} hafta önce`,
      value: d.toISOString().slice(0, 10),
    })
  }
  return presets
}

export default function BacktestPanel() {
  const presets = getPresetDates()
  const [asOf, setAsOf] = useState(presets[0].value)
  const [horizon, setHorizon] = useState(10)
  const [activeStrategy, setActiveStrategy] = useState('trend')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const runBacktest = async () => {
    setRunning(true); setError(null); setResult(null)
    try {
      const r = await api.get(`/daily-signals/backtest?asOf=${asOf}&horizon=${horizon}`)
      setResult(r.data)
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    } finally {
      setRunning(false)
    }
  }

  const block = result?.[activeStrategy] || null
  const top10 = block?.top10 || []
  const stats = block?.stats || null
  const allStats = block?.allStats || null

  return (
    <div className="space-y-4">
      {/* ── Açıklama şeridi ──────────────────────────────────────────────── */}
      <div className="card p-4 bg-blue-500/5 border-blue-500/20">
        <div className="flex items-start gap-3">
          <Target className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-white font-bold text-sm mb-1">Backtest — Geçmiş Performans Testi</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Bir tarih seç (örn. geçen Perşembe). Sistem o gün borsa kapanışındaki veriyle sinyalleri yeniden üretir.
              Sonra sonraki N gün gerçek fiyat verisini yürüyerek her sinyalin nasıl gittiğini hesaplar.
              <span className="text-white"> Gelecek veri sızdırılmaz</span> — eski signal'ı bilmiyormuş gibi davranır.
            </p>
          </div>
        </div>
      </div>

      {/* ── Kontroller ───────────────────────────────────────────────────── */}
      <div className="card p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Tarih */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">Test Tarihi (asOf)</label>
            <div className="flex items-center gap-2 bg-dark-800 rounded-lg px-3 py-2 border border-dark-700">
              <Calendar className="w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                className="bg-transparent text-sm text-white outline-none flex-1 [color-scheme:dark]"
                max={new Date().toISOString().slice(0, 10)}
              />
            </div>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {presets.map(p => (
                <button key={p.value} onClick={() => setAsOf(p.value)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border ${asOf === p.value ? 'bg-gold-500/20 border-gold-500/40 text-gold-300' : 'bg-dark-700 border-dark-600 text-gray-400 hover:text-white'}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Horizon */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">Horizon (gün)</label>
            <div className="flex items-center gap-2 bg-dark-800 rounded-lg px-3 py-2 border border-dark-700">
              <input
                type="number"
                min="1" max="30"
                value={horizon}
                onChange={(e) => setHorizon(Math.max(1, Math.min(30, parseInt(e.target.value) || 5)))}
                className="bg-transparent text-sm text-white outline-none flex-1 [color-scheme:dark]"
              />
              <span className="text-xs text-gray-500">trade günü</span>
            </div>
            <div className="flex gap-1 mt-1.5">
              {[5, 10, 20].map(h => (
                <button key={h} onClick={() => setHorizon(h)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border ${horizon === h ? 'bg-gold-500/20 border-gold-500/40 text-gold-300' : 'bg-dark-700 border-dark-600 text-gray-400 hover:text-white'}`}>
                  {h}g
                </button>
              ))}
            </div>
          </div>

          {/* Çalıştır */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">&nbsp;</label>
            <button
              onClick={runBacktest}
              disabled={running}
              className="btn-primary w-full flex items-center justify-center gap-2 py-2 disabled:opacity-50"
            >
              {running
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Çalışıyor...</>
                : <><Play className="w-4 h-4" /> Backtest Başlat</>
              }
            </button>
            <p className="text-[9px] text-gray-600 mt-1">~5-10 saniye sürer (BIST100 taranır)</p>
          </div>
        </div>
      </div>

      {/* ── Hata ────────────────────────────────────────────────────────── */}
      {error && (
        <div className="card border-red-500/30 bg-red-500/10 p-3 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <p className="text-sm text-red-200">{error}</p>
        </div>
      )}

      {/* ── Sonuçlar ────────────────────────────────────────────────────── */}
      {result && (
        <>
          {/* Strateji toggle */}
          <div className="grid grid-cols-2 gap-2">
            {['trend', 'reversion'].map(strat => {
              const meta = STRATEGY_LABELS[strat]
              const block = result[strat]
              const winRate = block?.stats?.winRate || 0
              const avgRet = block?.stats?.avgReturn || 0
              const isActive = activeStrategy === strat
              return (
                <button key={strat}
                  onClick={() => setActiveStrategy(strat)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${isActive ? 'bg-gold-500/10 border-gold-500/40' : 'bg-dark-800 border-dark-700 hover:border-dark-600'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm font-bold ${isActive ? 'text-white' : 'text-gray-300'}`}>{meta.label}</span>
                    <span className={`text-xs font-bold ${avgRet >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                      {avgRet >= 0 ? '+' : ''}{avgRet}%
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-500">
                    Win: {winRate}% · Top {block?.top10?.length || 0}/{block?.allCount || 0}
                  </div>
                  <p className="text-[10px] text-gray-600 mt-1 leading-relaxed">{meta.sub}</p>
                </button>
              )
            })}
          </div>

          {/* Stat kutuları */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center">
              <StatCard label="Hedef Vurdu"   value={stats.hitTarget}   color="emerald" />
              <StatCard label="Stop Oldu"     value={stats.hitStop}     color="red" />
              <StatCard label="Tetiklenmedi"  value={stats.noTrigger}   color="gray" />
              <StatCard label="Açık Pozisyon" value={stats.stillRunning} color="blue" />
              <StatCard label="Kârlı oran"    value={`%${stats.winRate}`} color={stats.winRate >= 50 ? 'emerald' : 'amber'} highlight />
            </div>
          )}

          {/* Performans karşılaştırması (top 10 vs all) */}
          {stats && allStats && (
            <div className="card p-3 space-y-2 text-xs">
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Performans Karşılaştırma</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-gray-400">Top 10 ortalama getiri</p>
                  <p className={`text-lg font-bold ${stats.avgReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {stats.avgReturn >= 0 ? '+' : ''}{stats.avgReturn}%
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">Tüm sinyaller ({allStats.total}) ortalama</p>
                  <p className={`text-lg font-bold ${allStats.avgReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {allStats.avgReturn >= 0 ? '+' : ''}{allStats.avgReturn}%
                  </p>
                </div>
              </div>
              {Math.abs(stats.avgReturn - allStats.avgReturn) > 1 && (
                <p className="text-[10px] text-amber-300 mt-1">
                  ⚠ Top 10 sıralaması, tüm sinyallerden farklı performans veriyor — strateji ayarlanmaya devam edilmeli.
                </p>
              )}
            </div>
          )}

          {/* Top 10 detay listesi */}
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-dark-700 bg-dark-800/50">
              <h4 className="text-sm font-semibold text-white">
                Top 10 — {STRATEGY_LABELS[activeStrategy].label}
                <span className="text-[10px] text-gray-500 ml-2">
                  ({result.asOfDate} → +{result.horizonDays} trade günü)
                </span>
              </h4>
            </div>
            {top10.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500">Bu kriterle sinyal bulunamadı</div>
            ) : (
              <div className="divide-y divide-dark-700/50">
                {top10.map((sig, idx) => (
                  <BacktestRow key={sig.symbol} sig={sig} rank={idx + 1} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function StatCard({ label, value, color, highlight }) {
  return (
    <div className={`bg-dark-800 rounded-lg p-2.5 border ${highlight ? `border-${color}-500/40` : 'border-dark-700'}`}>
      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`text-lg font-bold text-${color}-300`}>{value}</p>
    </div>
  )
}

function BacktestRow({ sig, rank }) {
  const dir = DIRECTION_STYLES[sig.direction] || DIRECTION_STYLES.long
  const out = OUTCOME_STYLES[sig.outcome] || OUTCOME_STYLES.no_levels
  const Icon = out.icon
  return (
    <div className="px-4 py-2.5 flex items-center gap-3 hover:bg-dark-800/30 transition-colors">
      <span className="text-gray-500 font-bold w-6 text-center">#{rank}</span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-white">{sig.symbol}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${dir.bg} ${dir.color}`}>{dir.label}</span>
          <span className="text-[10px] text-gray-500">{sig.totalScore}/{sig.applicableMax}p</span>
          <span className="text-[10px] text-gray-600">{sig.grade}</span>
        </div>
        <div className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-3 flex-wrap">
          <span>Giriş <span className="text-white font-mono">{sig.entry?.toFixed(2)}</span></span>
          <span className="text-red-300">Stop {sig.stop?.toFixed(2)}</span>
          <span className="text-emerald-300">Hedef {sig.target?.toFixed(2)}</span>
          {sig.triggerDay && sig.triggerDay !== 'asOfClose' && (
            <span className="text-blue-300">Tetik: {sig.triggerDay}</span>
          )}
          {sig.exitDay && (
            <span className="text-gray-400">Çıkış: {sig.exitDay} @ {sig.exitPrice?.toFixed?.(2)}</span>
          )}
        </div>
      </div>

      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg bg-${out.color}-500/10 border border-${out.color}-500/30`}>
        <Icon className={`w-3.5 h-3.5 text-${out.color}-400`} />
        <span className={`text-[10px] font-medium text-${out.color}-300`}>{out.label}</span>
      </div>
      <div className="text-right">
        <p className={`text-base font-bold font-mono ${sig.returnPct > 0 ? 'text-emerald-300' : sig.returnPct < 0 ? 'text-red-300' : 'text-gray-400'}`}>
          {sig.returnPct > 0 ? '+' : ''}{sig.returnPct?.toFixed?.(2) ?? '0.00'}%
        </p>
        {sig.bars > 0 && <p className="text-[9px] text-gray-600">{sig.bars} bar</p>}
      </div>
    </div>
  )
}
