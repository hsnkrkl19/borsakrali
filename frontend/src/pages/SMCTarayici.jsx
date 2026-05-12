import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Search, RefreshCw, TrendingUp, TrendingDown, Target, Activity,
  Layers, Zap, GitBranch, ChevronRight, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import api from '../services/api'
import InfoTooltip from '../components/InfoTooltip'

const SMC_TIP = {
  title: 'Smart Money Concepts (SMC) — Kurumsal Akış Analizi',
  description: 'ICT (Inner Circle Trader) çerçevesinden uyarlanmış 5 ana yapı: Swing pivotları, Fair Value Gap (FVG), Break of Structure (BOS), Change of Character (CHoCH), Order Block (OB) ve Liquidity Sweep. Mantık: piyasa kurumsal alıcı/satıcıların izlerini bırakır — likidite havuzlarını süpürür (eşit high/low\'lar), agresif kırılım yapar (BOS/CHoCH) ve geri çekildiğinde son ters mum (OB) veya fiyat boşluğu (FVG) destek olur.',
  formula: '══ Fair Value Gap (FVG) ══\n  Bullish: candle[i-1].high < candle[i+1].low VE orta mum yeşil\n  Bearish: candle[i-1].low > candle[i+1].high VE orta mum kırmızı\n  Mitigation: fiyat gap\'i kapatırsa "mitigated"\n\n══ Break of Structure (BOS) ══\n  Trend devamı — yeni HH (higher high) veya LL (lower low)\n  Close > önceki swing high → bullish BOS\n  Close < önceki swing low  → bearish BOS\n\n══ Change of Character (CHoCH) ══\n  Trend dönüşü — karşı yöndeki swing kırılır\n  Aşağı trendde yeni high önceki high\'ı aşar → bullish CHoCH\n  Yukarı trendde yeni low önceki low\'u kırar  → bearish CHoCH\n\n══ Order Block (OB) ══\n  Agresif BOS/CHoCH öncesi son ters renk mum\n  Bullish OB: yukarı kırılım öncesi son kırmızı mum\n  Bearish OB: aşağı kırılım öncesi son yeşil mum\n  Agresivelik = breakRange / ATR (≥0.8 gerekli)\n\n══ Liquidity Sweep ══\n  Eşit seviyeli (±%0.5 aralık) 2+ swing kümesi = likidite havuzu\n  Wick seviyeyi aştıktan sonra close geri dönerse = sweep\n  Buy-side liquidity (alt küme) sweep → bullish reaction\n  Sell-side liquidity (üst küme) sweep → bearish reaction\n\n══ Sinyal Skoru (0-100) ══\n  Base 50 + bias (±20) + CHoCH bonus (+15) + agresivelik (×10, max 20)\n  + FVG confluence (+10) + sweep confluence (+15) − mesafe ceza\n  Grade: A+ ≥80, A ≥65, B ≥50',
  source: 'joshyattridge/smartmoneyconcepts (MIT) — ICT / Wyckoff çerçevesi',
}

const STRUCTURE_ICON = {
  bos:   { label: 'BOS',   icon: GitBranch, color: 'text-blue-300' },
  choch: { label: 'CHoCH', icon: Zap,        color: 'text-purple-300' },
}

const BIAS_BADGE = {
  bullish: { label: '↑ Bullish Yapı', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  bearish: { label: '↓ Bearish Yapı', color: 'bg-red-500/20 text-red-300 border-red-500/40' },
  neutral: { label: '— Tarafsız',      color: 'bg-gray-500/20 text-gray-300 border-gray-500/40' },
}

const GRADE_COLOR = {
  'A+': 'bg-emerald-500/25 text-emerald-200 border-emerald-500/60',
  'A':  'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  'B':  'bg-amber-500/15 text-amber-300 border-amber-500/40',
  'C':  'bg-gray-500/15 text-gray-400 border-gray-500/30',
}

export default function SMCTarayici() {
  const [searchParams] = useSearchParams()
  const [scope, setScope] = useState('bist30')
  const [scan, setScan] = useState(null)
  const [scanLoading, setScanLoading] = useState(false)
  const [trackInput, setTrackInput] = useState('')
  const [track, setTrack] = useState(null)
  const [trackLoading, setTrackLoading] = useState(false)
  const [filterType, setFilterType] = useState('all') // all | long | short
  const [filterGrade, setFilterGrade] = useState('all') // all | A+ | A | B

  const runScan = async (newScope = scope) => {
    setScanLoading(true)
    setScan(null)
    try {
      const r = await api.get(`/smc/scanner/${newScope}`)
      setScan(r.data)
    } catch (e) {
      setScan({ error: e.response?.data?.error || 'Tarama hatası' })
    } finally {
      setScanLoading(false)
    }
  }

  const runTrack = async (sym) => {
    const s = (sym || trackInput).trim().toUpperCase()
    if (!s) return
    const isCrypto = scope === 'crypto'
    setTrackLoading(true)
    setTrack(null)
    try {
      const r = await api.get(`/smc/${s}${isCrypto ? '?type=crypto' : ''}`)
      setTrack(r.data)
    } catch (e) {
      setTrack({ error: e.response?.data?.error || 'Sembol bulunamadı' })
    } finally {
      setTrackLoading(false)
    }
  }

  useEffect(() => { runScan() }, []) // eslint-disable-line

  useEffect(() => {
    const urlSym = searchParams.get('symbol')
    if (urlSym) {
      const s = urlSym.toUpperCase()
      setTrackInput(s)
      runTrack(s)
    }
    // eslint-disable-next-line
  }, [])

  const filtered = (scan?.results || []).filter(r => {
    if (filterType !== 'all' && r.topSignal?.type !== filterType) return false
    if (filterGrade !== 'all' && r.topSignal?.grade !== filterGrade) return false
    return true
  })

  const counts = {
    total: scan?.results?.length || 0,
    long: scan?.results?.filter(r => r.topSignal?.type === 'long').length || 0,
    short: scan?.results?.filter(r => r.topSignal?.type === 'short').length || 0,
    aPlus: scan?.results?.filter(r => r.topSignal?.grade === 'A+').length || 0,
  }

  return (
    <div className="space-y-6">
      {/* Başlık */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Layers className="w-6 h-6 text-amber-400" />
            Smart Money Concepts (SMC)
            <InfoTooltip size="lg" {...SMC_TIP} />
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Kurumsal akış izi: Order Block · Fair Value Gap · BOS/CHoCH · Likidite Sweep
          </p>
        </div>
        <button onClick={() => runScan(scope)} disabled={scanLoading} className="btn-secondary flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 ${scanLoading ? 'animate-spin' : ''}`} />
          Yenile
        </button>
      </div>

      {/* Kapsam seçici */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-gray-500 mr-1">Kapsam:</span>
        {[
          { id: 'bist30', label: 'BIST30' },
          { id: 'bist100', label: 'BIST100' },
          { id: 'crypto', label: '🪙 Kripto Top 20' },
        ].map(s => (
          <button
            key={s.id}
            onClick={() => { setScope(s.id); runScan(s.id) }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              scope === s.id
                ? s.id === 'crypto'
                  ? 'bg-orange-500 text-white'
                  : 'bg-amber-500 text-slate-950'
                : 'bg-dark-800 text-gray-400 hover:text-white'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Özet kartları */}
      {scan && !scan.error && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card text-center bg-dark-800/50">
            <div className="text-2xl font-bold text-white">{counts.total}</div>
            <div className="text-xs text-gray-500 mt-1">Sinyalli Sembol</div>
          </div>
          <div className="card text-center bg-emerald-500/10">
            <div className="text-2xl font-bold text-emerald-300">{counts.long}</div>
            <div className="text-xs text-gray-500 mt-1">Long Setup</div>
          </div>
          <div className="card text-center bg-red-500/10">
            <div className="text-2xl font-bold text-red-300">{counts.short}</div>
            <div className="text-xs text-gray-500 mt-1">Short Setup</div>
          </div>
          <div className="card text-center bg-amber-500/15">
            <div className="text-2xl font-bold text-amber-300">{counts.aPlus}</div>
            <div className="text-xs text-gray-500 mt-1">A+ Kalite</div>
          </div>
        </div>
      )}

      {/* Filtre satırı */}
      <div className="flex flex-wrap gap-2 items-center text-xs">
        <span className="text-gray-500 mr-1">Yön:</span>
        {['all', 'long', 'short'].map(t => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`px-2.5 py-1 rounded transition-colors ${
              filterType === t ? 'bg-primary-600 text-white' : 'bg-dark-800 text-gray-400 hover:text-white'
            }`}
          >
            {t === 'all' ? 'Tümü' : t === 'long' ? '↑ Long' : '↓ Short'}
          </button>
        ))}
        <span className="text-gray-500 mx-1">Kalite:</span>
        {['all', 'A+', 'A', 'B'].map(g => (
          <button
            key={g}
            onClick={() => setFilterGrade(g)}
            className={`px-2.5 py-1 rounded transition-colors ${
              filterGrade === g ? 'bg-amber-500 text-slate-950' : 'bg-dark-800 text-gray-400 hover:text-white'
            }`}
          >
            {g === 'all' ? 'Hepsi' : g}
          </button>
        ))}
      </div>

      {/* Tarama tablosu */}
      <div className="card !p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-dark-700 flex items-center justify-between">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <Search className="w-4 h-4 text-amber-400" />
            SMC Tarayıcı — {scope.toUpperCase()}
            {scan?.cached && <span className="text-[10px] text-gray-500">(cache)</span>}
          </h3>
          <span className="text-xs text-gray-500">{filtered.length} sonuç</span>
        </div>

        {scanLoading && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-5 h-5 text-amber-400 animate-spin mr-2" />
            <span className="text-gray-400">Taranıyor... (BIST için 30-60 sn)</span>
          </div>
        )}

        {scan?.error && (
          <p className="text-red-400 text-center py-6">{scan.error}</p>
        )}

        {!scanLoading && filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-dark-800/60 text-[11px] uppercase text-gray-500">
                <tr>
                  <th className="text-left px-4 py-2">Sembol</th>
                  <th className="text-left px-2 py-2">Bias</th>
                  <th className="text-left px-2 py-2">Sinyal</th>
                  <th className="text-right px-2 py-2">Skor</th>
                  <th className="text-right px-2 py-2">Giriş</th>
                  <th className="text-right px-2 py-2">Stop</th>
                  <th className="text-right px-2 py-2">Hedef</th>
                  <th className="text-right px-2 py-2">R/R</th>
                  <th className="text-right px-2 py-2">Yapı</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700/50">
                {filtered.map(r => {
                  const t = r.topSignal
                  const bias = BIAS_BADGE[r.bias] || BIAS_BADGE.neutral
                  const SignalIcon = t.type === 'long' ? ArrowUpRight : ArrowDownRight
                  return (
                    <tr key={r.symbol} className="hover:bg-dark-800/40 cursor-pointer"
                      onClick={() => { setTrackInput(r.symbol); runTrack(r.symbol) }}>
                      <td className="px-4 py-2.5 font-bold text-white">
                        {r.symbol}
                        <div className="text-[10px] text-gray-500 font-normal truncate max-w-[140px]">
                          {r.name}
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${bias.color}`}>
                          {bias.label}
                        </span>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className={`flex items-center gap-1 text-xs font-semibold ${t.type === 'long' ? 'text-emerald-300' : 'text-red-300'}`}>
                          <SignalIcon className="w-3.5 h-3.5" />
                          {t.type === 'long' ? 'LONG' : 'SHORT'}
                          <span className="text-[10px] text-gray-400 font-normal">
                            ({t.source === 'order_block' ? 'OB' : 'FVG'})
                          </span>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <span className={`text-[11px] px-1.5 py-0.5 rounded border font-bold ${GRADE_COLOR[t.grade] || GRADE_COLOR.C}`}>
                          {t.grade} · {t.score}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono text-white">{(+t.entry).toFixed(2)}</td>
                      <td className="px-2 py-2.5 text-right font-mono text-red-300">{(+t.stop).toFixed(2)}</td>
                      <td className="px-2 py-2.5 text-right font-mono text-emerald-300">{(+t.target).toFixed(2)}</td>
                      <td className="px-2 py-2.5 text-right text-amber-300">{t.rr}</td>
                      <td className="px-2 py-2.5 text-right text-[11px] text-gray-400">
                        OB:{r.obCount} · FVG:{r.fvgCount}
                      </td>
                      <td className="px-2 py-2.5">
                        <ChevronRight className="w-4 h-4 text-gray-600" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!scanLoading && scan && !scan.error && filtered.length === 0 && (
          <p className="text-gray-500 text-center py-8">Bu filtrede SMC sinyali bulunamadı.</p>
        )}
      </div>

      {/* Tekil sembol takip */}
      <div className="card">
        <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4 text-amber-400" />
          Tekil Sembol SMC Analizi
        </h3>
        <div className="flex gap-2">
          <input
            value={trackInput}
            onChange={e => setTrackInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && runTrack()}
            placeholder={scope === 'crypto' ? 'BTC, ETH, SOL...' : 'THYAO, GARAN, ASELS...'}
            className="flex-1 bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
          />
          <button onClick={() => runTrack()} disabled={trackLoading} className="btn-primary flex items-center gap-2">
            <Search className="w-4 h-4" />
            Analiz Et
          </button>
        </div>

        {trackLoading && (
          <div className="flex items-center justify-center py-6">
            <RefreshCw className="w-5 h-5 text-amber-400 animate-spin" />
            <span className="text-gray-400 ml-2">Hesaplanıyor...</span>
          </div>
        )}

        {track?.error && (
          <p className="text-red-400 mt-4 text-sm">{track.error}</p>
        )}

        {track && !track.error && (
          <div className="mt-4 space-y-4">
            {/* Üst panel: bias + son fiyat + son yapı */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xl font-bold text-white">{track.symbol}</span>
              {track.bias && (
                <span className={`text-xs px-2 py-1 rounded border ${BIAS_BADGE[track.bias]?.color}`}>
                  {BIAS_BADGE[track.bias]?.label}
                </span>
              )}
              <span className="text-gray-400 text-sm">
                Son: <span className="font-mono text-white">{track.lastClose?.toFixed(2)}</span>
              </span>
              <span className="text-gray-500 text-xs">
                {track.candleCount} bar · ATR ≈ {track.atr?.toFixed(2)}
              </span>
            </div>

            {/* Sinyaller */}
            {track.signals && track.signals.length > 0 ? (
              <div>
                <h4 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-1.5">
                  <Target className="w-4 h-4 text-amber-400" /> Aktif Sinyaller ({track.signals.length})
                </h4>
                <div className="space-y-2">
                  {track.signals.map((s, idx) => {
                    const Ic = s.type === 'long' ? TrendingUp : TrendingDown
                    return (
                      <div key={idx} className={`p-3 rounded-lg border ${
                        s.type === 'long'
                          ? 'bg-emerald-500/5 border-emerald-500/30'
                          : 'bg-red-500/5 border-red-500/30'
                      }`}>
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <Ic className={`w-4 h-4 ${s.type === 'long' ? 'text-emerald-400' : 'text-red-400'}`} />
                          <span className={`font-bold text-sm ${s.type === 'long' ? 'text-emerald-300' : 'text-red-300'}`}>
                            {s.type === 'long' ? 'LONG' : 'SHORT'}
                          </span>
                          <span className="text-[11px] text-gray-400">
                            {s.source === 'order_block' ? `Order Block (${s.obSource})` : 'Fair Value Gap'}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ml-auto ${GRADE_COLOR[s.grade]}`}>
                            {s.grade} · {s.score}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          <div>
                            <div className="text-gray-500">Giriş</div>
                            <div className="font-mono font-bold text-white">{s.entry?.toFixed(2)}</div>
                          </div>
                          <div>
                            <div className="text-gray-500">Stop</div>
                            <div className="font-mono font-bold text-red-300">{s.stop?.toFixed(2)}</div>
                          </div>
                          <div>
                            <div className="text-gray-500">Hedef</div>
                            <div className="font-mono font-bold text-emerald-300">{s.target?.toFixed(2)}</div>
                          </div>
                          <div>
                            <div className="text-gray-500">R/R</div>
                            <div className="font-mono font-bold text-amber-300">{s.rr}</div>
                          </div>
                        </div>
                        <div className="text-[10px] text-gray-500 mt-1.5">
                          Yaş: {s.ageBars} bar önce
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Aktif SMC sinyali yok — yapı temiz, fiyat boş bölgede.</p>
            )}

            {/* Yapı (BOS/CHoCH) */}
            {track.structure && track.structure.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-300 mb-2">Son Yapı Olayları</h4>
                <div className="flex flex-wrap gap-2">
                  {track.structure.slice(-5).reverse().map((e, idx) => {
                    const ic = STRUCTURE_ICON[e.type]
                    const Ic = ic?.icon
                    return (
                      <div key={idx} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-dark-800 border border-dark-700 text-xs`}>
                        {Ic && <Ic className={`w-3.5 h-3.5 ${ic.color}`} />}
                        <span className={ic?.color || ''}>{ic?.label}</span>
                        <span className={e.direction === 'bullish' ? 'text-emerald-400' : 'text-red-400'}>
                          {e.direction === 'bullish' ? '↑' : '↓'}
                        </span>
                        <span className="text-gray-400 font-mono">{e.level?.toFixed(2)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Order Block + FVG sayıları */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-dark-800/50 rounded-lg p-3">
                <div className="text-2xl font-bold text-blue-300">{track.orderBlocks?.length || 0}</div>
                <div className="text-[11px] text-gray-500 mt-1">Order Block</div>
              </div>
              <div className="bg-dark-800/50 rounded-lg p-3">
                <div className="text-2xl font-bold text-purple-300">{track.fvgs?.length || 0}</div>
                <div className="text-[11px] text-gray-500 mt-1">Fair Value Gap</div>
              </div>
              <div className="bg-dark-800/50 rounded-lg p-3">
                <div className="text-2xl font-bold text-amber-300">{track.liquidity?.length || 0}</div>
                <div className="text-[11px] text-gray-500 mt-1">Likidite Bölgesi</div>
              </div>
            </div>

            {/* Likidite sweep'leri */}
            {track.liquidity && track.liquidity.some(l => l.sweptIndex) && (
              <div>
                <h4 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-amber-400" /> Likidite Sweep'leri
                </h4>
                <div className="flex flex-wrap gap-2">
                  {track.liquidity.filter(l => l.sweptIndex).slice(-5).map((l, idx) => (
                    <div key={idx} className={`px-2.5 py-1.5 rounded-lg text-xs border ${
                      l.type === 'buy_side'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                        : 'bg-red-500/10 border-red-500/30 text-red-200'
                    }`}>
                      {l.type === 'buy_side' ? '↓ Alt Sweep' : '↑ Üst Sweep'}
                      <span className="font-mono ml-1">{l.level?.toFixed(2)}</span>
                      <span className="text-gray-500 ml-1">({l.count} pivot)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
