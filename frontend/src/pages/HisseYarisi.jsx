// ============================================================================
// HİSSE YARIŞI — BIST grafiklerinde araba/motor sürme oyunu
// ----------------------------------------------------------------------------
// Seçilen hissenin fiyat grafiği bir "tepe" pistine dönüşür; oyuncu araç sürer,
// para/yakıt toplar, BorsaPara (BP) kazanır. BP ile araç ve yükseltmeler alınır,
// yeni hisse pistleri açılır. BIST30 ücretsiz, diğerleri kilitli.
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Gamepad2, Trophy, Fuel, Coins, Gauge, RotateCcw, Wrench, TrendingUp,
  Lock, Check, ChevronRight, Volume2, VolumeX, Flame, Search, X, Star, Play,
} from 'lucide-react'
import { RacingEngine } from '../game/RacingEngine'
import {
  VEHICLES, VEHICLE_ORDER, UPGRADES, upgradeCost, effectiveStats,
  STOCK_CATALOG, TIER_LABEL, getStockTier, stockUnlockPrice, isStockFree, stockMeta,
  ACHIEVEMENTS, computeEarnings, formatBP,
  loadSave, persistSave,
} from '../game/gameData'
import { normalizeHistoricalQuotes } from '../utils/chartAnalysis'

const candleCache = {}

async function fetchCandles(symbol) {
  if (candleCache[symbol]) return candleCache[symbol]
  try {
    const res = await fetch(`/api/market/stock/${symbol}/historical?period=5y&interval=1d`)
    if (!res.ok) throw new Error('veri yok')
    const data = await res.json()
    const quotes = data.data || data.quotes || []
    const candles = normalizeHistoricalQuotes(quotes)
    if (candles.length >= 8) { candleCache[symbol] = candles; return candles }
    throw new Error('yetersiz veri')
  } catch {
    return [] // motor sentetik pist üretir
  }
}

export default function HisseYarisi() {
  const [save, setSave] = useState(loadSave)
  const [screen, setScreen] = useState('idle')          // idle | loading | playing | over
  const [hud, setHud] = useState(null)
  const [result, setResult] = useState(null)
  const [modal, setModal] = useState(null)              // null | garage | stocks
  const [dataNote, setDataNote] = useState('')

  const canvasRef = useRef(null)
  const engineRef = useRef(null)
  const wrapRef = useRef(null)

  const mutate = useCallback((fn) => {
    setSave((prev) => {
      const next = fn({ ...prev })
      persistSave(next)
      return next
    })
  }, [])

  const vehicleUpgrades = save.upgrades[save.vehicle] || {}
  const stats = useMemo(() => effectiveStats(save.vehicle, vehicleUpgrades), [save.vehicle, save.upgrades])

  // --- engine lifecycle helpers ---
  const stopEngine = useCallback(() => {
    engineRef.current?.stop()
    engineRef.current = null
  }, [])

  const startRun = useCallback(async () => {
    setModal(null)
    setScreen('loading')
    setDataNote('')
    const candles = await fetchCandles(save.stock)
    if (!candles.length) setDataNote('Canlı grafik verisi alınamadı — örnek pist kullanılıyor.')

    stopEngine()
    const canvas = canvasRef.current
    if (!canvas) { setScreen('idle'); return }
    const engine = new RacingEngine(canvas, {
      candles,
      stats: effectiveStats(save.vehicle, save.upgrades[save.vehicle] || {}),
      sound: save.settings.sound,
      symbol: save.stock,
      name: stockMeta(save.stock).name,
      onState: (s) => setHud(s),
      onEnd: (r) => finishRun(r),
    })
    engineRef.current = engine
    engine.start()
    setScreen('playing')
    setHud(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save.stock, save.vehicle, save.upgrades, save.settings.sound, stopEngine])

  const finishRun = useCallback((r) => {
    const earned = computeEarnings(r)
    setResult({ ...r, earned, newlyAchieved: [] })
    setScreen('over')
    mutate((s) => {
      s.wallet = Math.round(s.wallet + earned)
      s.runs += 1
      s.totalEarned += earned
      s.totalDistance += r.distanceM
      s.stockBest = { ...s.stockBest, [s.stock]: Math.max(s.stockBest[s.stock] || 0, r.distanceM) }
      // başarımlar
      const owned = new Set(s.achievements)
      const newly = []
      for (const a of ACHIEVEMENTS) {
        if (owned.has(a.id)) continue
        const ok = (a.check && a.check(s)) || (a.test && a.test(r))
        if (ok) { owned.add(a.id); newly.push(a) }
      }
      s.achievements = [...owned]
      if (newly.length) setResult((rr) => ({ ...rr, newlyAchieved: newly }))
      return s
    })
  }, [mutate])

  // resize observer
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => engineRef.current?.resize())
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // cleanup on unmount
  useEffect(() => () => stopEngine(), [stopEngine])

  // keyboard controls
  useEffect(() => {
    if (screen !== 'playing') return
    const isTyping = () => {
      const el = document.activeElement
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
    }
    const down = (e) => {
      const eng = engineRef.current
      if (!eng || isTyping()) return
      if (['ArrowRight', 'ArrowUp', 'KeyD', 'KeyW', 'Space'].includes(e.code)) { eng.setInput('gas', true); e.preventDefault() }
      if (['ArrowLeft', 'ArrowDown', 'KeyA', 'KeyS'].includes(e.code)) { eng.setInput('brake', true); e.preventDefault() }
    }
    const up = (e) => {
      const eng = engineRef.current
      if (!eng) return
      if (['ArrowRight', 'ArrowUp', 'KeyD', 'KeyW', 'Space'].includes(e.code)) eng.setInput('gas', false)
      if (['ArrowLeft', 'ArrowDown', 'KeyA', 'KeyS'].includes(e.code)) eng.setInput('brake', false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [screen])

  // Mobil pedal: pointer capture → parmak butondan kayınca güç kesilmez;
  // pointerleave ile bırakma YOK (klasik hill-climb tuzağı). + hafif titreşim.
  const pedalDown = (name) => (e) => {
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* yoksay */ }
    engineRef.current?.setInput(name, true)
    try { navigator.vibrate && navigator.vibrate(8) } catch { /* yoksay */ }
  }
  const pedalUp = (name) => () => engineRef.current?.setInput(name, false)

  // --- shop actions ---
  const buyUpgrade = (upg) => mutate((s) => {
    const lv = (s.upgrades[s.vehicle]?.[upg.key]) || 0
    if (lv >= upg.max) return s
    const cost = upgradeCost(upg, lv)
    if (s.wallet < cost) return s
    s.wallet -= cost
    s.upgrades = { ...s.upgrades, [s.vehicle]: { ...(s.upgrades[s.vehicle] || {}), [upg.key]: lv + 1 } }
    return s
  })

  const buyVehicle = (id) => mutate((s) => {
    if (s.ownedVehicles.includes(id)) { s.vehicle = id; return s }
    const v = VEHICLES[id]
    if (s.wallet < v.price) return s
    s.wallet -= v.price
    s.ownedVehicles = [...s.ownedVehicles, id]
    s.vehicle = id
    return s
  })

  const selectVehicle = (id) => mutate((s) => { if (s.ownedVehicles.includes(id)) s.vehicle = id; return s })

  const unlockStock = (symbol) => mutate((s) => {
    const sym = symbol.toUpperCase()
    if (s.unlockedStocks.includes(sym)) { s.stock = sym; return s }
    const price = stockUnlockPrice(sym)
    if (s.wallet < price) return s
    s.wallet -= price
    s.unlockedStocks = [...s.unlockedStocks, sym]
    s.stock = sym
    return s
  })

  const selectStock = (symbol) => mutate((s) => {
    const sym = symbol.toUpperCase()
    if (s.unlockedStocks.includes(sym)) s.stock = sym
    return s
  })

  const toggleSound = () => mutate((s) => { s.settings = { ...s.settings, sound: !s.settings.sound }; return s })

  const stockInfo = stockMeta(save.stock)
  const vehicle = VEHICLES[save.vehicle]

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
      {/* Başlık + cüzdan */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm" style={{ background: 'linear-gradient(135deg,#10b981,#047857)' }}>
            <Gamepad2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold leading-none" style={{ color: 'var(--text-primary)' }}>Hisse Yarışı</h1>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>BIST grafiğinde gazla, para topla, garajı büyüt</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-bold" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)', color: '#d97706' }}>
            <Coins className="w-4 h-4" /> {formatBP(save.wallet)} <span className="text-[11px] font-medium opacity-70">BP</span>
          </div>
          <button onClick={toggleSound} className="p-2 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)', color: 'var(--text-secondary)' }} aria-label="Ses">
            {save.settings.sound ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Seçim çubuğu */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button onClick={() => setModal('stocks')} disabled={screen === 'playing'} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)', color: 'var(--text-primary)' }}>
          <TrendingUp className="w-4 h-4 text-emerald-500" />
          <span>{stockInfo.symbol}</span>
          <span className="text-[11px] font-normal opacity-60 hidden sm:inline">{stockInfo.name}</span>
          <ChevronRight className="w-3.5 h-3.5 opacity-50" />
        </button>
        <button onClick={() => setModal('garage')} disabled={screen === 'playing'} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)', color: 'var(--text-primary)' }}>
          <span className="text-base leading-none">{vehicle.emoji}</span>
          <span>{vehicle.name}</span>
          <Wrench className="w-3.5 h-3.5 opacity-50" />
        </button>
        <div className="flex-1" />
        {save.stockBest[save.stock] ? (
          <div className="text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1" style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)' }}>
            <Trophy className="w-3.5 h-3.5 text-amber-500" /> Rekor: <b>{save.stockBest[save.stock]}m</b>
          </div>
        ) : null}
      </div>

      {/* OYUN ALANI */}
      <div ref={wrapRef} className="relative rounded-2xl overflow-hidden shadow-lg" style={{ border: '1px solid #2a2e39', height: 'min(68vh, 560px)', minHeight: 380, background: '#131722' }}>
        <style>{`@keyframes hy-pop{0%{transform:translateX(-50%) scale(0) rotate(-8deg);opacity:0}60%{transform:translateX(-50%) scale(1.25) rotate(2deg)}100%{transform:translateX(-50%) scale(1);opacity:1}}.hy-pop{animation:hy-pop .55s cubic-bezier(.2,1.3,.4,1) both}`}</style>
        <canvas ref={canvasRef} className="w-full h-full block touch-none" style={{ width: '100%', height: '100%' }} />

        {/* HUD — TradingView koyu temasına uygun */}
        {screen === 'playing' && hud && (
          <>
            {/* üst-orta istatistik + barlar (sol-üstte motorun çizdiği ticker legend var) */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 pointer-events-none w-[min(90%,340px)]">
              <div className="bg-slate-900/75 backdrop-blur-md rounded-xl px-3.5 py-2 flex items-center gap-3.5 text-sm font-bold text-slate-100 shadow-lg ring-1 ring-white/10">
                <span className="flex items-center gap-1"><Gauge className="w-4 h-4 text-sky-400" />{hud.distanceM}m</span>
                <span className="flex items-center gap-1 text-amber-400"><Coins className="w-4 h-4" />{hud.coins}</span>
                <span className="flex items-center gap-1 text-emerald-300">{hud.speed}<span className="text-[10px] font-medium opacity-70">km/s</span></span>
                {hud.flips > 0 && <span className="flex items-center gap-1 text-orange-400"><Flame className="w-4 h-4" />{hud.flips}</span>}
              </div>
              <div className="w-full bg-slate-900/70 backdrop-blur rounded-lg px-2 py-1.5 ring-1 ring-white/10">
                <div className="flex items-center justify-between text-[10px] font-semibold text-slate-300 mb-1"><span className="flex items-center gap-1"><Fuel className="w-3 h-3" />Yakıt</span><span>{Math.round(hud.fuelPct * 100)}%</span></div>
                <div className="h-2 rounded-full bg-slate-700/60 overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${hud.fuelPct * 100}%`, background: hud.fuelPct < 0.25 ? '#ef4444' : 'linear-gradient(90deg,#22c55e,#10b981)' }} /></div>
              </div>
            </div>

            {hud.airborne && (
              <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-orange-500/90 text-white rounded-xl px-3 py-1 shadow-lg font-extrabold text-sm pointer-events-none whitespace-nowrap">
                HAVADA{hud.flipsThisAir > 0 ? ` · TAKLA x${hud.flipsThisAir}` : ''} 🪂
              </div>
            )}

            {hud.combo > 1 && (
              <div key={hud.comboFlash} className="hy-pop absolute left-1/2 top-1/3 -translate-x-1/2 text-emerald-300 font-black text-4xl pointer-events-none drop-shadow-[0_2px_10px_rgba(16,185,129,0.7)]">
                x{hud.combo} COMBO
              </div>
            )}

            <button onClick={() => { stopEngine(); setScreen('idle') }} className="absolute top-3 right-2 pointer-events-auto bg-slate-900/70 hover:bg-slate-800 text-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 ring-white/10">
              Bitir
            </button>

            {/* PEDALLAR — pointer capture + güvenli alan */}
            <div className="absolute left-3 right-3 flex items-end justify-between pointer-events-none select-none" style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
              <button
                onPointerDown={pedalDown('brake')} onPointerUp={pedalUp('brake')} onPointerCancel={pedalUp('brake')}
                className="pointer-events-auto touch-none w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-red-500/85 active:bg-red-600 text-white font-extrabold text-sm shadow-xl ring-2 ring-white/20 flex flex-col items-center justify-center active:scale-95 transition-transform"
              >
                <span className="text-2xl leading-none">◀</span>FREN
              </button>
              <button
                onPointerDown={pedalDown('gas')} onPointerUp={pedalUp('gas')} onPointerCancel={pedalUp('gas')}
                className="pointer-events-auto touch-none w-24 h-24 sm:w-28 sm:h-28 rounded-full text-white font-extrabold text-base shadow-xl ring-2 flex flex-col items-center justify-center active:scale-95 transition-transform bg-emerald-500/85 active:bg-emerald-600 ring-white/20"
              >
                <span className="text-3xl leading-none">▶</span>GAZ
              </button>
            </div>
          </>
        )}

        {/* IDLE / başlat ekranı — koyu TradingView teması */}
        {(screen === 'idle' || screen === 'loading') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-[#131722]/85 to-[#0c0e15]/92 backdrop-blur-[2px] text-center px-4">
            <div className="text-5xl mb-2 drop-shadow-lg">{vehicle.emoji}</div>
            <h2 className="text-lg font-bold mb-1 text-slate-100">
              {stockInfo.symbol} grafiğinde {vehicle.name}
            </h2>
            <p className="text-xs mb-4 max-w-xs text-slate-400">
              {stockInfo.name} fiyat grafiği senin pistin. Tepelerden uç, takla at, para topla. Yakıtın bitmeden ne kadar gidebilirsin?
            </p>
            <button
              onClick={startRun}
              disabled={screen === 'loading'}
              className="px-7 py-3 rounded-xl font-extrabold text-white shadow-lg flex items-center gap-2 disabled:opacity-60 transition active:scale-95"
              style={{ background: 'linear-gradient(135deg,#26a69a,#0b7d72)' }}
            >
              <Play className="w-5 h-5" /> {screen === 'loading' ? 'Pist hazırlanıyor…' : 'YARIŞ BAŞLASIN'}
            </button>
            <p className="text-[11px] mt-3 text-slate-500">
              ⌨️ Yön tuşları / boşluk · 📱 Ekran pedalları · havada gaz/fren = dön
            </p>
          </div>
        )}

        {/* OVER / sonuç ekranı */}
        {screen === 'over' && result && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4">
            <div className="bg-white rounded-2xl shadow-2xl p-5 w-full max-w-sm text-center">
              <div className="text-3xl mb-1">{result.reason === 'crash' ? '💥' : '⛽'}</div>
              <h3 className="text-lg font-bold text-slate-800">{result.reason === 'crash' ? 'Takla attın!' : 'Yakıt bitti!'}</h3>
              <div className="grid grid-cols-3 gap-2 my-4">
                <ResultStat label="Mesafe" value={`${result.distanceM}m`} icon={<Gauge className="w-4 h-4" />} />
                <ResultStat label="Para" value={result.coins} icon={<Coins className="w-4 h-4" />} />
                <ResultStat label="Takla" value={result.flips} icon={<Flame className="w-4 h-4" />} />
              </div>
              <div className="rounded-xl py-3 mb-3" style={{ background: 'linear-gradient(135deg,#ecfdf5,#d1fae5)' }}>
                <div className="text-xs text-emerald-700 font-semibold">KAZANÇ</div>
                <div className="text-2xl font-extrabold text-emerald-600">+{formatBP(result.earned)} BP</div>
              </div>
              {result.newlyAchieved?.length > 0 && (
                <div className="mb-3 text-left">
                  {result.newlyAchieved.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 text-xs bg-amber-50 text-amber-700 rounded-lg px-2 py-1.5 mb-1">
                      <span className="text-base">{a.emoji}</span> <b>Başarım:</b> {a.name}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={startRun} className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white flex items-center justify-center gap-1.5 active:scale-95 transition" style={{ background: 'linear-gradient(135deg,#10b981,#047857)' }}>
                  <RotateCcw className="w-4 h-4" /> Tekrar
                </button>
                <button onClick={() => { setModal('garage'); setScreen('idle') }} className="px-4 py-2.5 rounded-xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 flex items-center gap-1.5 active:scale-95 transition">
                  <Wrench className="w-4 h-4" /> Garaj
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {dataNote && <p className="text-[11px] mt-2 text-center" style={{ color: 'var(--text-faint,#94a3b8)' }}>{dataNote}</p>}

      {/* Alt bilgi şeridi */}
      <div className="grid grid-cols-3 gap-2 mt-3 text-center">
        <MiniStat label="Toplam Mesafe" value={`${Math.round(save.totalDistance)}m`} />
        <MiniStat label="Toplam Tur" value={save.runs} />
        <MiniStat label="Açık Hisse" value={save.unlockedStocks.length} />
      </div>

      {modal === 'garage' && (
        <GarageModal save={save} stats={stats} onClose={() => setModal(null)}
          onBuyUpgrade={buyUpgrade} onBuyVehicle={buyVehicle} onSelectVehicle={selectVehicle} />
      )}
      {modal === 'stocks' && (
        <StockModal save={save} onClose={() => setModal(null)}
          onUnlock={unlockStock} onSelect={selectStock} />
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------
function ResultStat({ label, value, icon }) {
  return (
    <div className="bg-slate-50 rounded-xl py-2">
      <div className="flex items-center justify-center text-slate-400 mb-0.5">{icon}</div>
      <div className="text-base font-bold text-slate-800">{value}</div>
      <div className="text-[10px] text-slate-500">{label}</div>
    </div>
  )
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-xl py-2" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}>
      <div className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{value}</div>
      <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{label}</div>
    </div>
  )
}

// ============================ GARAJ / MAĞAZA ================================
function GarageModal({ save, stats, onClose, onBuyUpgrade, onBuyVehicle, onSelectVehicle }) {
  const [tab, setTab] = useState('upgrades')
  const vehicle = VEHICLES[save.vehicle]
  const vUpg = save.upgrades[save.vehicle] || {}

  return (
    <ModalShell title="Garaj" wallet={save.wallet} onClose={onClose}>
      <div className="flex gap-2 mb-4">
        <TabBtn active={tab === 'upgrades'} onClick={() => setTab('upgrades')}><Wrench className="w-4 h-4" /> Yükseltmeler</TabBtn>
        <TabBtn active={tab === 'vehicles'} onClick={() => setTab('vehicles')}><Gamepad2 className="w-4 h-4" /> Araçlar</TabBtn>
      </div>

      {tab === 'upgrades' && (
        <div>
          <div className="flex items-center gap-2 mb-3 p-2 rounded-xl bg-emerald-50">
            <span className="text-2xl">{vehicle.emoji}</span>
            <div>
              <div className="font-bold text-slate-800 text-sm">{vehicle.name}</div>
              <div className="text-[11px] text-slate-500">Yükseltmeler bu araca özeldir</div>
            </div>
          </div>
          <div className="space-y-2">
            {UPGRADES.map((upg) => {
              const lv = vUpg[upg.key] || 0
              const maxed = lv >= upg.max
              const cost = upgradeCost(upg, lv)
              const afford = save.wallet >= cost
              return (
                <div key={upg.key} className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-slate-100">
                  <span className="text-xl w-7 text-center">{upg.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800 text-sm">{upg.name}</span>
                      <span className="text-[10px] text-slate-400">Sv.{lv}/{upg.max}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">{upg.desc}</div>
                    <div className="flex gap-0.5 mt-1">
                      {Array.from({ length: upg.max }).map((_, i) => (
                        <div key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i < lv ? '#10b981' : '#e2e8f0' }} />
                      ))}
                    </div>
                  </div>
                  <button
                    disabled={maxed || !afford}
                    onClick={() => onBuyUpgrade(upg)}
                    className="px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed text-white active:scale-95 transition"
                    style={{ background: maxed ? '#94a3b8' : afford ? 'linear-gradient(135deg,#10b981,#047857)' : '#cbd5e1' }}
                  >
                    {maxed ? 'MAX' : `${formatBP(cost)} BP`}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'vehicles' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {VEHICLE_ORDER.map((id) => {
            const v = VEHICLES[id]
            const owned = save.ownedVehicles.includes(id)
            const selected = save.vehicle === id
            const afford = save.wallet >= v.price
            return (
              <div key={id} className={`p-3 rounded-xl border ${selected ? 'border-emerald-400 bg-emerald-50' : 'border-slate-100 bg-white'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">{v.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-800 text-sm flex items-center gap-1">{v.name}{selected && <Check className="w-3.5 h-3.5 text-emerald-500" />}</div>
                    <div className="text-[10px] text-slate-500 truncate">{v.desc}</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1 my-2">
                  <StatBar label="Güç" v={v.enginePower / 5000} />
                  <StatBar label="Tutuş" v={v.grip / 1.8} />
                  <StatBar label="Hız" v={v.topSpeed / 1600} />
                </div>
                {owned ? (
                  <button onClick={() => onSelectVehicle(id)} disabled={selected}
                    className="w-full py-2 rounded-lg text-xs font-bold disabled:opacity-60 text-emerald-700 bg-emerald-100 hover:bg-emerald-200 transition">
                    {selected ? 'Seçili' : 'Seç'}
                  </button>
                ) : (
                  <button onClick={() => onBuyVehicle(id)} disabled={!afford}
                    className="w-full py-2 rounded-lg text-xs font-bold text-white disabled:opacity-50 active:scale-95 transition"
                    style={{ background: afford ? 'linear-gradient(135deg,#f59e0b,#d97706)' : '#cbd5e1' }}>
                    {afford ? `Satın Al · ${formatBP(v.price)} BP` : `${formatBP(v.price)} BP gerekli`}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </ModalShell>
  )
}

function StatBar({ label, v }) {
  return (
    <div>
      <div className="text-[9px] text-slate-400 mb-0.5">{label}</div>
      <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, v * 100)}%` }} />
      </div>
    </div>
  )
}

// ============================ HİSSE SEÇİMİ =================================
function StockModal({ save, onClose, onUnlock, onSelect }) {
  const [q, setQ] = useState('')
  const [checking, setChecking] = useState(null)
  const [notFound, setNotFound] = useState(null)
  const query = q.trim().toUpperCase()

  // Katalog dışı (other) semboller için: ücret almadan ÖNCE verinin gerçekten
  // var olduğunu doğrula. Yoksa 6000 BP harcayıp sentetik pist açma tuzağı olur.
  const tryUnlock = async (sym, tier) => {
    setNotFound(null)
    if (tier !== 'other') { onUnlock(sym); return }
    setChecking(sym)
    const candles = await fetchCandles(sym)
    setChecking(null)
    if (!candles.length) { setNotFound(sym); return }
    onUnlock(sym)
  }

  const list = useMemo(() => {
    if (!query) return STOCK_CATALOG
    const inCatalog = STOCK_CATALOG.filter((s) => s.symbol.includes(query) || s.name.toLocaleUpperCase('tr').includes(query))
    // katalogda yoksa ama geçerli görünen sembolse "diğer" olarak ekle
    const exists = STOCK_CATALOG.some((s) => s.symbol === query)
    if (!exists && /^[A-Z0-9]{3,6}$/.test(query)) {
      return [{ symbol: query, name: 'Aranan hisse', sector: 'Diğer BIST', tier: 'other' }, ...inCatalog]
    }
    return inCatalog
  }, [query])

  return (
    <ModalShell title="Hisse Pisti Seç" wallet={save.wallet} onClose={onClose}>
      <div className="relative mb-3">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sembol veya isim ara: THYAO, Garanti…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 text-slate-800" />
      </div>
      <p className="text-[11px] text-slate-500 mb-3 flex items-center gap-1">
        <Star className="w-3 h-3 text-emerald-500" /> BIST30 ücretsiz · Diğer pistleri BorsaPara ile aç
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[52vh] overflow-y-auto pr-1">
        {list.map((s) => {
          const unlocked = save.unlockedStocks.includes(s.symbol)
          const free = isStockFree(s.symbol)
          const selected = save.stock === s.symbol
          const tier = getStockTier(s.symbol)
          const price = stockUnlockPrice(s.symbol)
          const afford = save.wallet >= price
          const best = save.stockBest[s.symbol]
          return (
            <div key={s.symbol} className={`p-2.5 rounded-xl border flex items-center gap-2 ${selected ? 'border-emerald-400 bg-emerald-50' : 'border-slate-100 bg-white'}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-800 text-sm">{s.symbol}</span>
                  {selected && <Check className="w-3.5 h-3.5 text-emerald-500" />}
                  {free && <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-semibold">FREE</span>}
                </div>
                <div className="text-[11px] text-slate-500 truncate">{s.name}</div>
                <div className="text-[10px] text-slate-400">{TIER_LABEL[tier]}{best ? ` · Rekor ${best}m` : ''}</div>
                {notFound === s.symbol && <div className="text-[10px] text-red-500 font-semibold">Sembol bulunamadı — ücret alınmadı</div>}
              </div>
              {unlocked ? (
                <button onClick={() => { onSelect(s.symbol); onClose() }} disabled={selected}
                  className="px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-60 text-emerald-700 bg-emerald-100 hover:bg-emerald-200 transition whitespace-nowrap">
                  {selected ? 'Seçili' : 'Sür'}
                </button>
              ) : (
                <button onClick={() => tryUnlock(s.symbol, tier)} disabled={!afford || checking === s.symbol}
                  className="px-3 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-50 active:scale-95 transition whitespace-nowrap flex items-center gap-1"
                  style={{ background: afford ? 'linear-gradient(135deg,#f59e0b,#d97706)' : '#cbd5e1' }}>
                  <Lock className="w-3 h-3" /> {checking === s.symbol ? 'Kontrol…' : formatBP(price)}
                </button>
              )}
            </div>
          )
        })}
        {list.length === 0 && <div className="col-span-full text-center text-sm text-slate-400 py-6">Sonuç yok</div>}
      </div>
    </ModalShell>
  )
}

// ============================ ORTAK MODAL ==================================
function ModalShell({ title, wallet, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">{title}</h3>
          <div className="flex items-center gap-2">
            <div className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 font-bold text-sm flex items-center gap-1">
              <Coins className="w-3.5 h-3.5" /> {formatBP(wallet)}
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="p-4 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition ${active ? 'text-white' : 'text-slate-600 bg-slate-100'}`}
      style={active ? { background: 'linear-gradient(135deg,#10b981,#047857)' } : undefined}>
      {children}
    </button>
  )
}
