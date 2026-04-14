import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Star, Plus, TrendingUp, TrendingDown, RefreshCw, Search, AlertCircle, X, BarChart2, Activity, Zap, ChevronRight } from 'lucide-react'
import StockChart from '../components/charts/StockChart'
import { getApiBase } from '../config'

const API_BASE = getApiBase() + '/api'

// ─── Sinyal normalize: Türkçe API sinyallerini AL/SAT/NÖTR'e çevir ──────
function normSignal(sig) {
    const s = (sig || '').toLowerCase()
    if (s === 'al' || s === 'buy' || s.includes('alış') || s.includes('pozitif') || s.includes('aşırı satım')) return 'AL'
    if (s === 'sat' || s === 'sell' || s.includes('satış') || s.includes('negatif') || s.includes('aşırı alım')) return 'SAT'
    return 'NÖTR'
}

// ─── InfoBadge: tıkla ile açıklama, ekrana sığacak şekilde ──────────────────
function InfoBadge({ text }) {
    const [open, setOpen] = useState(false)
    const [pos, setPos] = useState({ top: 0, left: 0, above: true })
    const ref = useRef(null)

    const toggle = (e) => {
        e.stopPropagation()
        if (!open && ref.current) {
            const r = ref.current.getBoundingClientRect()
            const PAD = 12
            const tipW = Math.min(256, window.innerWidth - PAD * 2)
            let left = r.left
            if (left + tipW > window.innerWidth - PAD) left = window.innerWidth - tipW - PAD
            if (left < PAD) left = PAD
            const spaceAbove = r.top
            const spaceBelow = window.innerHeight - r.bottom
            const above = spaceAbove > 120 || spaceAbove >= spaceBelow
            setPos({ top: above ? r.top - 6 : r.bottom + 6, left, above, tipW })
        }
        setOpen(v => !v)
    }

    useEffect(() => {
        if (!open) return
        const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
        document.addEventListener('mousedown', close)
        document.addEventListener('touchstart', close)
        window.addEventListener('scroll', () => setOpen(false), true)
        return () => {
            document.removeEventListener('mousedown', close)
            document.removeEventListener('touchstart', close)
        }
    }, [open])

    return (
        <span className="relative inline-block ml-1 align-middle">
            <span
                ref={ref}
                onClick={toggle}
                className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-gray-600 text-gray-500 text-[9px] font-bold cursor-pointer hover:border-gold-500/60 hover:text-gold-400 transition-colors select-none"
            >i</span>
            {open && createPortal(
                <div
                    style={{
                        position: 'fixed',
                        top: pos.top,
                        left: pos.left,
                        transform: pos.above ? 'translateY(-100%)' : 'translateY(0)',
                        width: pos.tipW || 240,
                        zIndex: 99999,
                    }}
                    className="bg-dark-900 border border-dark-600 rounded-lg p-2.5 text-[11px] text-gray-300 shadow-2xl leading-relaxed"
                    onMouseDown={e => e.stopPropagation()}
                >
                    {pos.above
                        ? <div className="absolute top-full left-4 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[5px] border-l-transparent border-r-transparent border-t-dark-600" />
                        : <div className="absolute bottom-full left-4 w-0 h-0 border-l-[5px] border-r-[5px] border-b-[5px] border-l-transparent border-r-transparent border-b-dark-600" />
                    }
                    {text}
                </div>,
                document.body
            )}
        </span>
    )
}

// ─── Sinyal rozeti ─────────────────────────────────────────────────────────
function SignalBadge({ signal, size = 'sm' }) {
    const norm = normSignal(signal)
    const map = {
        'AL':   { cls: 'bg-green-500/20 text-green-400 border-green-500/40', label: 'AL' },
        'SAT':  { cls: 'bg-red-500/20 text-red-400 border-red-500/40', label: 'SAT' },
        'NÖTR': { cls: 'bg-gray-500/20 text-gray-400 border-gray-500/40', label: 'NÖTR' },
    }
    const { cls, label } = map[norm]
    const px = size === 'lg' ? 'px-4 py-1.5 text-base font-bold' : 'px-2 py-0.5 text-xs font-semibold'
    return <span className={`rounded border ${cls} ${px}`}>{label}</span>
}

// ─── RSI Gauge ─────────────────────────────────────────────────────────────
function RsiGauge({ value }) {
    if (value == null) return <span className="text-gray-600">—</span>
    const v = Math.min(100, Math.max(0, value))
    const color = v < 30 ? '#22c55e' : v > 70 ? '#ef4444' : '#f59e0b'
    const zone = v < 30 ? 'Aşırı Satım' : v > 70 ? 'Aşırı Alım' : 'Normal'
    return (
        <div>
            <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-mono font-bold" style={{ color }}>{v.toFixed(1)}</span>
                <span className="text-[10px]" style={{ color }}>{zone}</span>
            </div>
            <div className="w-full h-2 bg-dark-700 rounded-full overflow-hidden relative">
                <div className="absolute left-0 top-0 h-full w-[30%] bg-green-500/20 rounded-l-full" />
                <div className="absolute right-0 top-0 h-full w-[30%] bg-red-500/20 rounded-r-full" />
                <div className="absolute top-0 h-full w-1.5 rounded-full" style={{ left: `calc(${v}% - 3px)`, backgroundColor: color }} />
            </div>
            <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                <span>0</span><span>30</span><span>70</span><span>100</span>
            </div>
        </div>
    )
}

// ─── MACD Görselleştirme ────────────────────────────────────────────────────
function MacdVisual({ macd, signal, histogram }) {
    if (macd == null) return <span className="text-gray-600">—</span>
    const positive = (histogram ?? 0) >= 0
    return (
        <div className="space-y-1.5">
            <div className="flex justify-between items-center">
                <span className="text-[10px] text-gray-500">MACD</span>
                <span className="font-mono text-xs text-white">{macd?.toFixed(3)}</span>
            </div>
            <div className="flex justify-between items-center">
                <span className="text-[10px] text-gray-500">Sinyal</span>
                <span className="font-mono text-xs text-yellow-400">{signal?.toFixed(3)}</span>
            </div>
            <div className="flex justify-between items-center">
                <span className="text-[10px] text-gray-500">Histogram</span>
                <span className={`font-mono text-xs font-bold ${positive ? 'text-green-400' : 'text-red-400'}`}>
                    {positive ? '+' : ''}{histogram?.toFixed(3)}
                </span>
            </div>
            <div className="w-full h-1.5 bg-dark-700 rounded-full overflow-hidden flex">
                <div className="w-1/2 flex justify-end">
                    {!positive && <div className="h-full rounded-l-full bg-red-500" style={{ width: `${Math.min(100, Math.abs(histogram || 0) * 500)}%` }} />}
                </div>
                <div className="w-1/2">
                    {positive && <div className="h-full rounded-r-full bg-green-500" style={{ width: `${Math.min(100, Math.abs(histogram || 0) * 500)}%` }} />}
                </div>
            </div>
        </div>
    )
}

// ─── Bollinger Bant Pozisyon Göstergesi ───────────────────────────────────
function BollingerVisual({ upper, middle, lower, price }) {
    if (!upper || !lower || !price) return <span className="text-gray-600">—</span>
    const range = upper - lower
    const pos = range > 0 ? Math.max(0, Math.min(100, ((price - lower) / range) * 100)) : 50
    const inUpper = price > middle + (upper - middle) * 0.7
    const inLower = price < middle - (middle - lower) * 0.7
    const zone = inUpper ? 'Üst Bant' : inLower ? 'Alt Bant' : 'Orta Bölge'
    const zoneColor = inUpper ? 'text-red-400' : inLower ? 'text-green-400' : 'text-yellow-400'
    return (
        <div>
            <div className="flex justify-between items-center mb-1">
                <span className={`text-xs ${zoneColor}`}>{zone}</span>
                <span className="text-[10px] text-gray-500">BW: {((upper - lower) / middle * 100).toFixed(1)}%</span>
            </div>
            <div className="w-full h-4 bg-dark-700 rounded relative overflow-hidden">
                <div className="absolute left-0 right-0 top-1/2 h-px bg-gray-600" />
                <div className="absolute top-1 bottom-1 w-1.5 rounded-full bg-gold-400"
                    style={{ left: `calc(${pos}% - 3px)` }} />
            </div>
            <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                <span>{lower?.toFixed(1)}</span>
                <span className="text-gray-500">{middle?.toFixed(1)}</span>
                <span>{upper?.toFixed(1)}</span>
            </div>
        </div>
    )
}

// ─── Stochastic RSI Görselleştirme ─────────────────────────────────────────
function StochVisual({ k, d }) {
    if (k == null) return <span className="text-gray-600">—</span>
    const kv = Math.min(100, Math.max(0, k))
    const dv = d != null ? Math.min(100, Math.max(0, d)) : null
    const zone = kv < 20 ? 'Aşırı Satım' : kv > 80 ? 'Aşırı Alım' : 'Normal'
    const zColor = kv < 20 ? '#22c55e' : kv > 80 ? '#ef4444' : '#9ca3af'
    return (
        <div className="space-y-2">
            <div className="flex justify-between items-center">
                <span className="text-[10px] text-gray-500">%K (StochRSI)</span>
                <span className="font-mono text-xs font-bold" style={{ color: zColor }}>{kv.toFixed(1)}</span>
            </div>
            {dv != null && (
                <div className="flex justify-between items-center">
                    <span className="text-[10px] text-gray-500">%D</span>
                    <span className="font-mono text-xs text-yellow-400">{dv.toFixed(1)}</span>
                </div>
            )}
            <div className="w-full h-2 bg-dark-700 rounded-full overflow-hidden relative">
                <div className="absolute left-0 top-0 h-full w-[20%] bg-green-500/15 rounded-l-full" />
                <div className="absolute right-0 top-0 h-full w-[20%] bg-red-500/15 rounded-r-full" />
                <div className="absolute top-0 h-full w-1.5 rounded-full bg-blue-400"
                    style={{ left: `calc(${kv}% - 3px)` }} />
                {dv != null && (
                    <div className="absolute top-0 h-full w-0.5 bg-yellow-400" style={{ left: `${dv}%` }} />
                )}
            </div>
            <div className="text-[10px] text-center" style={{ color: zColor }}>{zone}</div>
        </div>
    )
}

// ─── EMA + SMA Tablosu ─────────────────────────────────────────────────────
function EmaTable({ indicators, currentPrice }) {
    const rows = [
        { label: 'EMA 5',   val: indicators?.ema5 },
        { label: 'EMA 9',   val: indicators?.ema9 },
        { label: 'EMA 21',  val: indicators?.ema21 },
        { label: 'SMA 20',  val: indicators?.sma20 },
        { label: 'EMA 50',  val: indicators?.ema50 },
        { label: 'SMA 50',  val: indicators?.sma50 },
        { label: 'EMA 100', val: indicators?.ema100 },
        { label: 'EMA 200', val: indicators?.ema200 },
        { label: 'SMA 200', val: indicators?.sma200 },
    ].filter(r => r.val != null)

    if (!currentPrice || rows.length === 0) return <p className="text-gray-600 text-sm">Veri yok</p>
    return (
        <div className="space-y-1">
            {rows.map(({ label, val }) => {
                const above = currentPrice > val
                const pct = ((currentPrice - val) / val * 100).toFixed(2)
                return (
                    <div key={label} className="flex items-center justify-between py-1.5 px-2 bg-dark-800/60 rounded-lg">
                        <span className="text-gray-400 text-xs w-16">{label}</span>
                        <span className="font-mono text-xs text-white">{val.toFixed(2)}</span>
                        <span className={`text-xs font-semibold min-w-[58px] text-right ${above ? 'text-green-400' : 'text-red-400'}`}>
                            {above ? '+' : ''}{pct}%
                        </span>
                        <span className={`text-[10px] min-w-[40px] text-right ${above ? 'text-green-500/80' : 'text-red-500/80'}`}>
                            {above ? '▲ Üst' : '▼ Alt'}
                        </span>
                    </div>
                )
            })}
        </div>
    )
}

// ─── Pivot + Destek/Direnç Tablosu ─────────────────────────────────────────
function LevelsTable({ levels, currentPrice }) {
    if (!levels) return <p className="text-gray-600 text-sm">Veri yok</p>
    const rows = [
        { label: 'Direnç 2',  val: levels.resistance, color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20' },
        { label: 'Pivot R2',  val: levels.pivotR2,    color: 'text-orange-400', bg: 'bg-orange-500/5 border-orange-500/10' },
        { label: 'Pivot R1',  val: levels.pivotR1,    color: 'text-orange-300', bg: 'bg-orange-500/5 border-orange-500/10' },
        { label: 'Pivot',     val: levels.pivot,      color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
        { label: 'Pivot S1',  val: levels.pivotS1,    color: 'text-teal-300',   bg: 'bg-teal-500/5 border-teal-500/10' },
        { label: 'Pivot S2',  val: levels.pivotS2,    color: 'text-teal-400',   bg: 'bg-teal-500/5 border-teal-500/10' },
        { label: 'Destek 2',  val: levels.support,    color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20' },
    ].filter(r => r.val != null)

    return (
        <div className="space-y-1">
            {rows.map(({ label, val, color, bg }) => {
                const isCurrentZone = currentPrice && val && Math.abs(val - currentPrice) / currentPrice < 0.01
                const above = currentPrice && val ? currentPrice > val : null
                return (
                    <div key={label} className={`flex items-center justify-between py-1.5 px-2 rounded-lg border ${isCurrentZone ? 'bg-gold-500/15 border-gold-500/30' : bg}`}>
                        <span className={`text-xs font-medium w-20 ${isCurrentZone ? 'text-gold-400' : color}`}>{label}</span>
                        <span className={`font-mono text-sm font-bold ${isCurrentZone ? 'text-gold-400' : color}`}>{val?.toFixed(2)}</span>
                        <div className="flex items-center gap-2">
                            {above != null && (
                                <span className={`text-[10px] ${above ? 'text-green-500/70' : 'text-red-500/70'}`}>
                                    {above ? '▲ üstünde' : '▼ altında'}
                                </span>
                            )}
                            {isCurrentZone && <span className="text-[10px] text-gold-400 font-semibold">← Yakın</span>}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

// ─── Sinyal Listesi ────────────────────────────────────────────────────────
function SignalList({ signals }) {
    if (!signals || signals.length === 0)
        return <p className="text-gray-600 text-sm text-center py-4">Sinyal bulunamadı</p>
    return (
        <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar pr-1">
            {signals.map((s, i) => {
                const norm = normSignal(s.signal)
                return (
                    <div key={i} className="flex items-center justify-between p-2 bg-dark-800/60 rounded-lg text-xs gap-2">
                        <span className="text-gray-300 flex-1 truncate">{s.indicator}</span>
                        <span className="font-mono text-gray-400 w-20 text-right truncate">
                            {typeof s.value === 'number' ? s.value.toFixed(2) : s.value}
                        </span>
                        <span className="text-gray-500 text-[10px] w-20 text-right truncate">{s.signal}</span>
                        <SignalBadge signal={s.signal} />
                    </div>
                )
            })}
        </div>
    )
}

// ─── Ana Teknik Analiz Paneli ──────────────────────────────────────────────
function TechPanel({ data }) {
    if (!data) return null

    const { indicators: ind, levels, trend, momentum, volatility, signals, currentPrice } = data

    // Genel sinyali sinyallerden hesapla
    let buyCount = 0, sellCount = 0
    ;(signals || []).forEach(s => {
        const n = normSignal(s.signal)
        if (n === 'AL') buyCount++
        else if (n === 'SAT') sellCount++
    })
    const overallSignal = buyCount > sellCount ? 'AL' : sellCount > buyCount ? 'SAT' : 'NÖTR'
    const signalCount = (signals || []).length

    const overallCls = overallSignal === 'AL'
        ? 'bg-green-500/10 border-green-500/30'
        : overallSignal === 'SAT'
            ? 'bg-red-500/10 border-red-500/30'
            : 'bg-dark-800 border-dark-700'

    return (
        <div className="space-y-4">
            {/* ── 1. Genel Sinyal Kartı ── */}
            <div className={`rounded-xl border p-4 ${overallCls}`}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <div className="text-xs text-gray-500 mb-1">Genel Sinyal</div>
                        <SignalBadge signal={overallSignal} size="lg" />
                    </div>
                    <div className="flex gap-6">
                        <div className="text-center">
                            <div className="text-xl font-bold text-green-400">{buyCount}</div>
                            <div className="text-[10px] text-gray-500">AL Sinyali</div>
                        </div>
                        <div className="text-center">
                            <div className="text-xl font-bold text-red-400">{sellCount}</div>
                            <div className="text-[10px] text-gray-500">SAT Sinyali</div>
                        </div>
                        <div className="text-center">
                            <div className="text-xl font-bold text-white">{signalCount}</div>
                            <div className="text-[10px] text-gray-500">Toplam</div>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-xs text-gray-500 mb-0.5">Son Fiyat</div>
                        <div className="text-lg font-mono font-bold text-gold-400">{currentPrice?.toFixed(2)} ₺</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">Trend: <span className={`font-semibold ${trend === 'Yukselis' ? 'text-green-400' : trend === 'Dusus' ? 'text-red-400' : 'text-yellow-400'}`}>{trend}</span></div>
                    </div>
                </div>
            </div>

            {/* ── 2. RSI + MACD ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-dark-800/60 rounded-xl border border-dark-700 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-white text-sm flex items-center">
                            RSI (14)
                            <InfoBadge text="Relative Strength Index: 0-30 aşırı satım (al fırsatı), 70-100 aşırı alım (sat fırsatı). 30-70 arası nötrdür. 50 üstü yükseliş momentumu." />
                        </h3>
                        <SignalBadge signal={ind?.rsi < 30 ? 'AL' : ind?.rsi > 70 ? 'SAT' : 'NÖTR'} />
                    </div>
                    <RsiGauge value={ind?.rsi} />
                </div>

                <div className="bg-dark-800/60 rounded-xl border border-dark-700 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-white text-sm flex items-center">
                            MACD
                            <InfoBadge text="Moving Average Convergence Divergence: MACD > Sinyal ise yükseliş baskısı. Histogram pozitif ise momentum artıyor. Sinyal çizgisi kesişimleri al/sat sinyali üretir." />
                        </h3>
                        <SignalBadge signal={(ind?.macdHistogram ?? 0) > 0 ? 'AL' : 'SAT'} />
                    </div>
                    <MacdVisual macd={ind?.macd} signal={ind?.macdSignal} histogram={ind?.macdHistogram} />
                </div>
            </div>

            {/* ── 3. EMA + SMA Tablosu ── */}
            <div className="bg-dark-800/60 rounded-xl border border-dark-700 p-4">
                <h3 className="font-semibold text-white text-sm mb-3 flex items-center">
                    Hareketli Ortalamalar (EMA / SMA)
                    <InfoBadge text="Fiyat EMA/SMA üstündeyse yükseliş trendi, altındaysa düşüş trendi. EMA5 kısa vadeli, EMA200 uzun vadeli trendi gösterir. EMA50/200 kesişimi 'altın/ölüm çarpazı' sinyalidir." />
                </h3>
                <div className="text-[10px] text-gray-500 mb-2 flex justify-end gap-6 px-2">
                    <span>Değer</span><span>Fark%</span><span>Konum</span>
                </div>
                <EmaTable indicators={ind} currentPrice={currentPrice} />
            </div>

            {/* ── 4. Bollinger Bantları ── */}
            <div className="bg-dark-800/60 rounded-xl border border-dark-700 p-4">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-white text-sm flex items-center">
                        Bollinger Bantları
                        <InfoBadge text="Fiyat üst banta yaklaşırsa aşırı alım, alt banta yaklaşırsa aşırı satım. Bantlar daralınca büyük hareket yaklaşıyor (squeeze). Bant genişliği volatiliteyi gösterir." />
                    </h3>
                    <SignalBadge signal={currentPrice > (ind?.bollingerUpper ?? Infinity) ? 'SAT' : currentPrice < (ind?.bollingerLower ?? 0) ? 'AL' : 'NÖTR'} />
                </div>
                <BollingerVisual upper={ind?.bollingerUpper} middle={ind?.bollingerMiddle} lower={ind?.bollingerLower} price={currentPrice} />
            </div>

            {/* ── 5. Stochastic RSI + Williams %R + CCI ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-dark-800/60 rounded-xl border border-dark-700 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-white text-sm flex items-center">
                            Stoch RSI
                            <InfoBadge text="Stochastic RSI: RSI değerini stochastic formülüne uyguluyor. %K < 20 aşırı satım (al), %K > 80 aşırı alım (sat). Normal stochastic'ten daha hassastır." />
                        </h3>
                        <SignalBadge signal={ind?.stochRsiK < 20 ? 'AL' : ind?.stochRsiK > 80 ? 'SAT' : 'NÖTR'} />
                    </div>
                    <StochVisual k={ind?.stochRsiK} d={ind?.stochRsiD} />
                </div>

                <div className="bg-dark-800/60 rounded-xl border border-dark-700 p-4">
                    <h3 className="font-semibold text-white text-sm mb-3 flex items-center">
                        Williams %R
                        <InfoBadge text="Williams Percent Range: -100 ile 0 arasında. -80 ile -100 arası aşırı satım (al), 0 ile -20 arası aşırı alım (sat). RSI'ya benzer ama daha hassastır." />
                    </h3>
                    <div className="text-center">
                        <div className={`text-2xl font-mono font-bold ${(ind?.williamsR ?? -50) < -80 ? 'text-green-400' : (ind?.williamsR ?? -50) > -20 ? 'text-red-400' : 'text-white'}`}>
                            {ind?.williamsR?.toFixed(1) ?? '—'}
                        </div>
                        <div className={`text-xs mt-1 ${(ind?.williamsR ?? -50) < -80 ? 'text-green-400' : (ind?.williamsR ?? -50) > -20 ? 'text-red-400' : 'text-gray-500'}`}>
                            {(ind?.williamsR ?? -50) < -80 ? 'Aşırı Satım' : (ind?.williamsR ?? -50) > -20 ? 'Aşırı Alım' : 'Normal'}
                        </div>
                        <div className="w-full h-1.5 bg-dark-700 rounded-full mt-2 overflow-hidden">
                            <div className={`h-full rounded-full ${(ind?.williamsR ?? -50) < -80 ? 'bg-green-500' : (ind?.williamsR ?? -50) > -20 ? 'bg-red-500' : 'bg-gray-500'}`}
                                style={{ width: `${100 + (ind?.williamsR ?? -50)}%` }} />
                        </div>
                    </div>
                </div>

                <div className="bg-dark-800/60 rounded-xl border border-dark-700 p-4">
                    <h3 className="font-semibold text-white text-sm mb-3 flex items-center">
                        CCI
                        <InfoBadge text="Commodity Channel Index: +100 üstü aşırı alım (sat), -100 altı aşırı satım (al). ±100 arası nötr. Döngüsel hareketleri ve trend dönüşlerini tespit eder." />
                    </h3>
                    <div className="text-center">
                        <div className={`text-2xl font-mono font-bold ${(ind?.cci ?? 0) < -100 ? 'text-green-400' : (ind?.cci ?? 0) > 100 ? 'text-red-400' : 'text-white'}`}>
                            {ind?.cci?.toFixed(1) ?? '—'}
                        </div>
                        <div className={`text-xs mt-1 ${(ind?.cci ?? 0) < -100 ? 'text-green-400' : (ind?.cci ?? 0) > 100 ? 'text-red-400' : 'text-gray-500'}`}>
                            {(ind?.cci ?? 0) < -100 ? 'Aşırı Satım' : (ind?.cci ?? 0) > 100 ? 'Aşırı Alım' : 'Normal'}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── 6. ATR + OBV + Momentum + Volatilite ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    {
                        label: 'ATR',
                        val: ind?.atr?.toFixed(2),
                        tooltip: 'Average True Range: Fiyatın ortalama günlük hareket aralığını gösterir. Yüksek ATR = yüksek volatilite. Stop-loss mesafesini belirlemede kullanılır.',
                        sub: 'Volatilite Ölçüsü', color: 'text-orange-400'
                    },
                    {
                        label: 'OBV',
                        val: ind?.obv != null ? (ind.obv / 1_000_000).toFixed(1) + 'M' : null,
                        tooltip: 'On-Balance Volume: Hacim akışını kümülatif olarak ölçer. Fiyat düşerken OBV artıyorsa kurumsal alım var (bullish divergence). Fiyat artarken OBV düşüyorsa dikkat edin.',
                        sub: 'Kümülatif Hacim', color: 'text-blue-400'
                    },
                    {
                        label: 'Momentum',
                        val: typeof momentum === 'string' ? momentum : (momentum != null ? momentum.toFixed(2) : null),
                        tooltip: 'Fiyat momentumu: Güçlü = yükseliş ivmesi var, Zayıf = düşüş ivmesi var.',
                        sub: null,
                        color: (typeof momentum === 'string')
                            ? (momentum.includes('Güçlü') || momentum.includes('Guclu') ? 'text-green-400' : 'text-red-400')
                            : (momentum > 0 ? 'text-green-400' : 'text-red-400')
                    },
                    {
                        label: 'Volatilite',
                        val: volatility != null ? (typeof volatility === 'number' ? volatility.toFixed(2) + '%' : volatility) : null,
                        tooltip: 'Fiyatın tarihsel volatilitesi. Yüksek volatilite = belirsizlik ve risk. Düşük volatilite = kararlı trend veya sıkışma.',
                        sub: typeof volatility === 'number' ? (volatility > 3 ? 'Yüksek Risk' : volatility > 1.5 ? 'Orta Risk' : 'Düşük Risk') : null,
                        color: typeof volatility === 'number' ? (volatility > 3 ? 'text-red-400' : volatility > 1.5 ? 'text-yellow-400' : 'text-green-400') : 'text-white'
                    },
                ].map(({ label, val, tooltip, sub, color }) => (
                    <div key={label} className="bg-dark-800/60 rounded-xl border border-dark-700 p-3 text-center">
                        <div className="text-[10px] text-gray-500 mb-1 flex items-center justify-center">
                            {label}<InfoBadge text={tooltip} />
                        </div>
                        <div className={`text-lg font-mono font-bold ${color}`}>{val ?? '—'}</div>
                        {sub && <div className={`text-[10px] mt-0.5 ${color}`}>{sub}</div>}
                    </div>
                ))}
            </div>

            {/* ── 7. Pivot Seviyeleri + Destek/Direnç ── */}
            <div className="bg-dark-800/60 rounded-xl border border-dark-700 p-4">
                <h3 className="font-semibold text-white text-sm mb-3 flex items-center">
                    Pivot Seviyeleri / Destek-Direnç
                    <InfoBadge text="Pivot noktası, önceki günün yüksek/düşük/kapanış ortalamasıdır. R1/R2 direnç, S1/S2 destek seviyelerini gösterir. Fiyat bu seviyelere yaklaştığında tepki verebilir." />
                </h3>
                <LevelsTable levels={levels} currentPrice={currentPrice} />
            </div>

            {/* ── 8. Tüm Sinyaller ── */}
            <div className="bg-dark-800/60 rounded-xl border border-dark-700 p-4">
                <h3 className="font-semibold text-white text-sm mb-3 flex items-center">
                    İndikatör Sinyalleri
                    <InfoBadge text="Her teknik indikatörün ürettiği bireysel AL/SAT/NÖTR sinyalleri. Güçlü (strong) sinyaller daha güvenilirdir. Çoğunluk bir yönde ise genel sinyal o yönde oluşur." />
                </h3>
                <SignalList signals={signals} />
            </div>
        </div>
    )
}

// ─── Ana Sayfa ─────────────────────────────────────────────────────────────
export default function TakipListem() {
    const [watchlist, setWatchlist] = useState([])
    const [selectedStock, setSelectedStock] = useState(null)
    const [loading, setLoading] = useState(true)
    const [showAddModal, setShowAddModal] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState([])
    const [searching, setSearching] = useState(false)
    const [activeTab, setActiveTab] = useState('chart')
    const [analysisData, setAnalysisData] = useState(null)
    const [techData, setTechData] = useState(null)
    const [analyzing, setAnalyzing] = useState(false)
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

    useEffect(() => {
        fetchWatchlist()
        const handleResize = () => setIsMobile(window.innerWidth < 768)
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    useEffect(() => {
        if (watchlist.length > 0 && !selectedStock) setSelectedStock(watchlist[0])
    }, [watchlist])

    useEffect(() => {
        if (!selectedStock) return
        if (activeTab === 'patterns') fetchAnalysis(selectedStock.symbol)
        else if (activeTab === 'technical') fetchTechnical(selectedStock.symbol)
    }, [selectedStock, activeTab])

    const fetchWatchlist = async () => {
        setLoading(true)
        try {
            const r = await fetch(`${API_BASE}/user/watchlist`)
            if (!r.ok) throw new Error()
            const data = await r.json()
            setWatchlist(data.watchlist || [])
        } catch {
            setWatchlist([])
        } finally {
            setLoading(false)
        }
    }

    const fetchAnalysis = async (symbol) => {
        setAnalyzing(true)
        try {
            const r = await fetch(`${API_BASE}/market/signals?symbol=${symbol}&limit=10`)
            if (!r.ok) throw new Error()
            setAnalysisData(await r.json())
        } catch {
            setAnalysisData(null)
        } finally {
            setAnalyzing(false)
        }
    }

    const fetchTechnical = async (symbol) => {
        setAnalyzing(true)
        setTechData(null)
        try {
            const r = await fetch(`${API_BASE}/analysis/technical/${symbol}`)
            if (!r.ok) throw new Error()
            setTechData(await r.json())
        } catch {
            setTechData(null)
        } finally {
            setAnalyzing(false)
        }
    }

    const searchStocks = useCallback(async (query) => {
        if (!query) { setSearchResults([]); return }
        setSearching(true)
        try {
            const r = await fetch(`${API_BASE}/market/stocks/search?q=${query}`)
            if (!r.ok) throw new Error()
            setSearchResults((await r.json()).stocks || [])
        } catch {
            setSearchResults([])
        } finally {
            setSearching(false)
        }
    }, [])

    useEffect(() => {
        const t = setTimeout(() => { if (searchQuery) searchStocks(searchQuery) }, 300)
        return () => clearTimeout(t)
    }, [searchQuery, searchStocks])

    const addToWatchlist = async (symbol) => {
        try {
            const r = await fetch(`${API_BASE}/user/watchlist`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol })
            })
            const data = await r.json()
            if (data.success) {
                await fetchWatchlist()
                setShowAddModal(false)
                setSearchQuery('')
                setSearchResults([])
            }
        } catch { /* ignore */ }
    }

    const removeFromWatchlist = async (symbol, e) => {
        e.stopPropagation()
        try {
            const r = await fetch(`${API_BASE}/user/watchlist/${symbol}`, { method: 'DELETE' })
            const data = await r.json()
            if (data.success) {
                const newList = watchlist.filter(s => s.symbol !== symbol)
                setWatchlist(newList)
                if (selectedStock?.symbol === symbol) setSelectedStock(newList[0] || null)
            }
        } catch { /* ignore */ }
    }

    return (
        <div className="h-[calc(100vh-6rem)] flex flex-col md:flex-row gap-4 md:gap-6 overflow-hidden relative">
            {/* LEFT: Watchlist */}
            <div className={`w-full md:w-80 flex flex-col bg-surface-100 rounded-xl border border-gold-500/20 overflow-hidden shrink-0
                ${isMobile && selectedStock ? 'hidden' : 'flex'} h-full`}>
                <div className="p-4 border-b border-gold-500/10 flex items-center justify-between">
                    <div>
                        <h2 className="font-bold text-white">İzleme Listesi</h2>
                        <p className="text-xs text-gray-500">{watchlist.length} hisse</p>
                    </div>
                    <button onClick={() => setShowAddModal(true)}
                        className="p-2 bg-gold-500/10 text-gold-500 hover:bg-gold-500 hover:text-black rounded-lg transition-colors">
                        <Plus className="w-5 h-5" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {loading ? (
                        <div className="flex justify-center p-8"><RefreshCw className="animate-spin text-gray-500" /></div>
                    ) : watchlist.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            <Star className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">Listeniz boş.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-dark-800">
                            {watchlist.map(stock => (
                                <div key={stock.symbol} onClick={() => setSelectedStock(stock)}
                                    className={`p-3 cursor-pointer hover:bg-dark-800/50 transition-colors group relative ${selectedStock?.symbol === stock.symbol ? 'bg-gold-500/10 border-l-4 border-gold-500' : 'border-l-4 border-transparent'}`}>
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold text-white flex items-center gap-2">
                                                {stock.symbol}
                                                {selectedStock?.symbol === stock.symbol && !isMobile && <ChevronRight className="w-3 h-3 text-gold-500" />}
                                            </div>
                                            <div className="text-xs text-gray-400 truncate max-w-[100px]">{stock.name}</div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="text-right">
                                                <div className="font-mono text-white text-sm">{stock.price ? stock.price.toFixed(2) : '-'}</div>
                                                <div className={`text-xs font-bold ${stock.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                    %{stock.changePercent ? stock.changePercent.toFixed(2) : '0.00'}
                                                </div>
                                            </div>
                                            <button onClick={(e) => removeFromWatchlist(stock.symbol, e)}
                                                className="p-1.5 text-gray-600 hover:text-red-500 active:text-red-500 hover:bg-red-500/10 rounded transition-colors flex-shrink-0">
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* RIGHT: Main Content */}
            <div className={`flex-1 flex flex-col min-w-0 bg-surface-100 rounded-xl border border-gold-500/20 overflow-hidden
                ${isMobile && !selectedStock ? 'hidden' : 'flex'} h-full absolute md:relative inset-0 md:inset-auto z-20 md:z-auto`}>
                {selectedStock ? (
                    <>
                        {/* Stock Header */}
                        <div className="p-4 md:p-6 border-b border-gold-500/10 flex flex-wrap items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                {isMobile && (
                                    <button onClick={() => setSelectedStock(null)} className="p-1 -ml-2 text-gray-400 hover:text-white">
                                        <ChevronRight className="w-6 h-6 rotate-180" />
                                    </button>
                                )}
                                <div>
                                    <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-gold-400 to-gold-600 bg-clip-text text-transparent">
                                        {selectedStock.symbol}
                                    </h1>
                                    <p className="text-gray-400 text-xs md:text-sm">{selectedStock.name} • {selectedStock.sector}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 md:gap-6">
                                <div className="text-right">
                                    <div className="text-[10px] md:text-sm text-gray-400">Son Fiyat</div>
                                    <div className="text-lg md:text-2xl font-mono font-bold text-white">{selectedStock.price?.toFixed(2)} ₺</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] md:text-sm text-gray-400">Değişim</div>
                                    <div className={`text-base md:text-xl font-mono font-bold flex items-center gap-1 ${selectedStock.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                        {selectedStock.changePercent >= 0 ? <TrendingUp className="w-4 h-4 md:w-5 md:h-5" /> : <TrendingDown className="w-4 h-4 md:w-5 md:h-5" />}
                                        %{selectedStock.changePercent?.toFixed(2)}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-dark-800">
                            {[
                                { id: 'chart',     label: 'Grafik',        icon: BarChart2 },
                                { id: 'technical', label: 'Teknik Analiz', icon: Activity },
                                { id: 'patterns',  label: 'Formasyonlar',  icon: Zap }
                            ].map(tab => (
                                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors border-b-2 ${activeTab === tab.id
                                        ? 'border-gold-500 text-gold-500 bg-gold-500/5'
                                        : 'border-transparent text-gray-400 hover:text-white hover:bg-dark-800'}`}>
                                    <tab.icon className="w-4 h-4" />
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Tab Content */}
                        <div className="flex-1 overflow-y-auto p-4 bg-dark-950">
                            {activeTab === 'chart' && (
                                <div className="h-full min-h-[500px]">
                                    <StockChart symbol={selectedStock.symbol} />
                                </div>
                            )}

                            {activeTab === 'technical' && (
                                <div>
                                    {analyzing ? (
                                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                                            <RefreshCw className="animate-spin w-8 h-8 text-gold-500" />
                                            <p className="text-gray-500 text-sm">{selectedStock.symbol} teknik analiz hesaplanıyor...</p>
                                        </div>
                                    ) : techData ? (
                                        <TechPanel data={techData} />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-500">
                                            <Activity className="w-12 h-12 opacity-20" />
                                            <p>Teknik analiz verisi alınamadı.</p>
                                            <button onClick={() => fetchTechnical(selectedStock.symbol)}
                                                className="mt-2 px-4 py-2 bg-gold-500/20 text-gold-400 rounded-lg hover:bg-gold-500/30 transition-colors text-sm">
                                                Tekrar Dene
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'patterns' && (
                                <div className="space-y-6">
                                    {analyzing ? (
                                        <div className="text-center py-12"><RefreshCw className="animate-spin w-8 h-8 mx-auto text-gold-500" /></div>
                                    ) : analysisData?.signals?.length > 0 ? (
                                        <div className="grid gap-4">
                                            {analysisData.signals.map((signal, idx) => (
                                                <div key={idx} className="bg-dark-800 p-4 rounded-xl border border-dark-700 flex items-start gap-4">
                                                    <div className={`p-3 rounded-full ${signal.metadata?.signal === 'buy' ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                                                        <Zap className="w-6 h-6" />
                                                    </div>
                                                    <div>
                                                        <h4 className="font-bold text-white text-lg capitalize">{signal.strategy?.replace('_', ' ')}</h4>
                                                        <p className="text-gray-400 text-sm mt-1">
                                                            Tespit Fiyatı: <span className="text-white font-mono">{signal.detectionPrice}</span>
                                                        </p>
                                                        <div className="mt-2 text-xs bg-dark-900 p-2 rounded text-gray-500 font-mono">
                                                            {JSON.stringify(signal.metadata, null, 2)}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                                            <Zap className="w-12 h-12 mb-3 opacity-20" />
                                            <p>Herhangi bir formasyon veya sinyal tespit edilmedi.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500 p-8">
                        <BarChart2 className="w-16 h-16 mb-4 opacity-20" />
                        <h2 className="text-xl font-bold mb-2">Hisse Seçimi Yapın</h2>
                        <p>Detaylı analiz için soldaki listeden bir hisse seçin veya yeni ekleyin.</p>
                    </div>
                )}
            </div>

            {/* Add Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                    <div className="bg-dark-900 rounded-xl max-w-md w-full border border-dark-700 shadow-xl">
                        <div className="p-4 border-b border-dark-700 flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-white">Hisse Ekle</h3>
                            <button onClick={() => { setShowAddModal(false); setSearchQuery(''); setSearchResults([]) }}
                                className="text-gray-500 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-4">
                            <div className="relative mb-4">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                                <input type="text" placeholder="Hisse kodu ara..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                                    className="input w-full pl-10" autoFocus />
                            </div>
                            <div className="max-h-60 overflow-y-auto space-y-2 custom-scrollbar">
                                {searching && <div className="text-center py-4"><RefreshCw className="w-5 h-5 text-primary-500 animate-spin mx-auto" /></div>}
                                {!searching && searchResults.length === 0 && searchQuery && (
                                    <div className="text-center py-4 text-gray-500">
                                        <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                                        <p>Hisse bulunamadı</p>
                                    </div>
                                )}
                                {searchResults.map((stock, idx) => (
                                    <button key={idx} onClick={() => addToWatchlist(stock.symbol)}
                                        className="w-full p-3 bg-dark-800 rounded-lg flex items-center justify-between hover:bg-dark-700 transition-colors text-left">
                                        <div>
                                            <p className="font-semibold text-white">{stock.symbol}</p>
                                            <p className="text-xs text-gray-500">{stock.name}</p>
                                        </div>
                                        <Plus className="w-5 h-5 text-primary-500" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
