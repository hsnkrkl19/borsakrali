/**
 * Çoklu Zaman Dilimi Sinyalleri — Borsa Krali
 *
 * 7 timeframe (1m/5m/15m/1h/4h/1d/1w) için long+short sinyaller +
 * MTF confluence engine (ağırlıklı agregasyon).
 *
 * Universe partition:
 *   - 1m/5m/15m → top 10 coin (scalping)
 *   - 1h/4h     → top 20 coin (saatlik swing)
 *   - 1d/1w     → top 30 coin (pozisyon)
 *
 * Backend: GET /api/market/crypto/mtf/scanner?tf=...
 *          GET /api/market/crypto/mtf/coin/:symbol
 *          GET /api/market/crypto/mtf/confluence
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  RefreshCw, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus,
  Coins, Layers, Target, Shield, Zap, AlertTriangle, CheckCircle2,
  Sparkles, Clock, ExternalLink, Activity, Info, BarChart3, Wifi, WifiOff,
} from 'lucide-react'
import { io } from 'socket.io-client'
import api from '../services/api'
import { getSocketBase } from '../config'

// ── Yapılandırma ──────────────────────────────────────────────────────────
const TF_LIST = [
  { key: '1m',  label: '1 dk',  tier: 10, color: 'rose' },
  { key: '5m',  label: '5 dk',  tier: 10, color: 'rose' },
  { key: '15m', label: '15 dk', tier: 10, color: 'rose' },
  { key: '1h',  label: '1 saat',tier: 20, color: 'amber' },
  { key: '4h',  label: '4 saat',tier: 20, color: 'amber' },
  { key: '1d',  label: 'Günlük',tier: 30, color: 'emerald' },
  { key: '1w',  label: 'Haftalık',tier: 30, color: 'sky' },
]

const TF_GROUP_LABEL = {
  10: 'Scalping (Top 10)',
  20: 'Swing (Top 20)',
  30: 'Pozisyon (Top 30)',
}

const GRADE_STYLES = {
  MUKEMMEL: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  GUCLU:    'bg-sky-500/20    text-sky-300    border-sky-500/40',
  ORTA:     'bg-amber-500/20  text-amber-300  border-amber-500/40',
  ZAYIF:    'bg-gray-500/20   text-gray-300   border-gray-500/40',
}

const VERDICT_STYLES = {
  STRONG_LONG:  { label: '⇈ STRONG LONG',  color: 'text-emerald-300', bg: 'bg-emerald-500/15', border: 'border-emerald-500/40' },
  LONG:         { label: '↑ LONG',         color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  WEAK_LONG:    { label: '↗ Zayıf Long',   color: 'text-emerald-200', bg: 'bg-emerald-500/5',  border: 'border-emerald-500/20' },
  NEUTRAL:      { label: '— NÖTR',         color: 'text-gray-400',    bg: 'bg-gray-500/10',    border: 'border-gray-500/30' },
  WEAK_SHORT:   { label: '↘ Zayıf Short',  color: 'text-rose-200',    bg: 'bg-rose-500/5',     border: 'border-rose-500/20' },
  SHORT:        { label: '↓ SHORT',        color: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30' },
  STRONG_SHORT: { label: '⇊ STRONG SHORT', color: 'text-rose-300',    bg: 'bg-rose-500/15',    border: 'border-rose-500/40' },
}

const VOLATILITY_STYLES = {
  low:    { label: 'Düşük Vol', color: 'text-sky-300',     bg: 'bg-sky-500/10' },
  normal: { label: 'Normal Vol', color: 'text-emerald-300', bg: 'bg-emerald-500/10' },
  high:   { label: 'Yüksek Vol', color: 'text-amber-300',   bg: 'bg-amber-500/10' },
}

// USD fiyat formatı — kripto fiyatları geniş aralıkta
function formatUsd(value) {
  if (value == null) return '—'
  const v = Number(value)
  if (!isFinite(v)) return '—'
  if (v >= 1000) return `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
  if (v >= 10) return `$${v.toFixed(3)}`
  if (v >= 1) return `$${v.toFixed(4)}`
  if (v >= 0.01) return `$${v.toFixed(5)}`
  return `$${v.toFixed(8)}`
}

function formatPct(value, digits = 2) {
  if (value == null) return '—'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}%`
}

// ─── Ana component ─────────────────────────────────────────────────────────
export default function MTFSinyalleri() {
  const [activeTF, setActiveTF] = useState('4h')
  const [direction, setDirection] = useState('long')   // 'long' | 'short'
  const [view, setView] = useState('scanner')          // 'scanner' | 'confluence' | 'calibration'
  const [scannerData, setScannerData] = useState(null)
  const [confluenceData, setConfluenceData] = useState(null)
  const [calibrationData, setCalibrationData] = useState(null)
  const [calibrationRunning, setCalibrationRunning] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expandedSymbol, setExpandedSymbol] = useState(null)
  const [socketConnected, setSocketConnected] = useState(false)
  const [lastTickAt, setLastTickAt] = useState(null)   // mtf_tick event geliş zamanı
  const socketRef = useRef(null)
  const activeTFRef = useRef(activeTF)
  useEffect(() => { activeTFRef.current = activeTF }, [activeTF])

  const loadScanner = useCallback(async (tf) => {
    try {
      const r = await api.get(`/market/crypto/mtf/scanner?tf=${tf}`)
      setScannerData(r.data)
    } catch (e) {
      const status = e.response?.status
      if (status === 503) setScannerData({ pending: true, timeframe: tf })
      else setScannerData({ error: e.response?.data?.error || e.message, timeframe: tf })
    }
  }, [])

  const loadCalibration = useCallback(async () => {
    try {
      const r = await api.get('/market/crypto/mtf/calibration')
      setCalibrationData(r.data)
    } catch (e) {
      setCalibrationData({ error: e.response?.data?.error || e.message })
    }
  }, [])

  const triggerCalibrationRun = useCallback(async () => {
    setCalibrationRunning(true)
    try {
      // Hafif: sadece aktif TF × 3 gün — UI bloklamasın
      await api.post('/market/crypto/mtf/calibrate', { tfs: [activeTF], daysBack: 3, save: true })
      await loadCalibration()
    } catch (e) {
      // sessiz
    } finally {
      setCalibrationRunning(false)
    }
  }, [activeTF, loadCalibration])

  const loadConfluence = useCallback(async () => {
    try {
      const r = await api.get('/market/crypto/mtf/confluence')
      setConfluenceData(r.data)
    } catch (e) {
      setConfluenceData({ error: e.response?.data?.error || e.message })
    }
  }, [])

  const reloadAll = useCallback(async () => {
    setRefreshing(true)
    try {
      await Promise.all([loadScanner(activeTF), loadConfluence()])
    } finally {
      setRefreshing(false)
    }
  }, [activeTF, loadScanner, loadConfluence])

  // İlk yükleme + TF değişimi
  useEffect(() => {
    setLoading(true)
    Promise.all([loadScanner(activeTF), loadConfluence()])
      .finally(() => setLoading(false))
  }, [activeTF, loadScanner, loadConfluence])

  // Socket.IO bağlantısı — backend mtfLiveLoop tick event'lerini dinle
  useEffect(() => {
    const sock = io(getSocketBase(), {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })
    socketRef.current = sock

    sock.on('connect',    () => setSocketConnected(true))
    sock.on('disconnect', () => setSocketConnected(false))

    // Backend mtfLiveLoop her 10sn tick atar — strategy='crypto_mtf_tick'
    sock.on('new_signal', (msg) => {
      if (msg?.strategy !== 'crypto_mtf_tick') return
      setLastTickAt(new Date().toISOString())
      // Aktif TF tick'in TF'siyle eşleşiyorsa tarayıcı verisini tazele
      if (msg.timeframe === activeTFRef.current) {
        loadScanner(msg.timeframe)
      }
    })

    return () => { sock.disconnect() }
  }, [loadScanner])

  // Polling cadence — Socket.IO yedeği olarak (bağlantı düşerse veya 1m dışı TF'de):
  //   1m  → 10sn (kullanıcı isteği: dakikalık her 10sn güncellensin)
  //   5m  → 30sn
  //   15m → 60sn
  //   1h+ → 2dk
  useEffect(() => {
    const intervalMs =
      activeTF === '1m'  ? 10 * 1000 :
      activeTF === '5m'  ? 30 * 1000 :
      activeTF === '15m' ? 60 * 1000 :
                           2 * 60 * 1000
    const interval = setInterval(() => {
      loadScanner(activeTF)
      if (view === 'confluence') loadConfluence()
    }, intervalMs)
    return () => clearInterval(interval)
  }, [activeTF, view, loadScanner, loadConfluence])

  const triggerGenerate = async () => {
    setRefreshing(true)
    try {
      await api.post('/market/crypto/mtf/generate', { tf: activeTF })
      await loadScanner(activeTF)
      await loadConfluence()
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) {
    return (
      <div className="card p-8 text-center">
        <RefreshCw className="w-6 h-6 text-gold-400 animate-spin mx-auto mb-2" />
        <p className="text-sm text-gray-400">Çoklu zaman sinyalleri yükleniyor...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Üst başlık ────────────────────────────────────────────────── */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Layers className="w-6 h-6 text-gold-400" />
            <div>
              <h3 className="text-white font-bold flex items-center gap-2 flex-wrap">
                Çoklu Zaman Dilimi Sinyalleri
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  AI + Math
                </span>
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                7 timeframe · Confluence engine · Pattern detection · RSI divergence · Volatility regime
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Socket bağlantı durumu */}
            <span
              className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border ${
                socketConnected
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
              }`}
              title={socketConnected
                ? (lastTickAt ? `Son tick: ${new Date(lastTickAt).toLocaleTimeString('tr-TR')}` : 'Socket bağlandı, tick bekleniyor')
                : 'Socket bağlantısı kopuk — polling kullanılıyor'}
            >
              {socketConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {socketConnected ? 'Canlı' : 'Polling'}
            </span>
            {/* 3 modlu görünüm seçici (Scanner ↔ Confluence ↔ Calibration) */}
            <div className="flex items-center gap-0.5 rounded-lg border border-dark-700 bg-dark-800 p-0.5">
              <button
                onClick={() => setView('scanner')}
                className={`text-[10px] px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                  view === 'scanner' ? 'bg-gold-500/20 text-gold-300' : 'text-gray-400 hover:text-white'
                }`}
                title="Scanner"
              ><Layers className="w-3 h-3" />Tarayıcı</button>
              <button
                onClick={() => { setView('confluence'); loadConfluence() }}
                className={`text-[10px] px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                  view === 'confluence' ? 'bg-gold-500/20 text-gold-300' : 'text-gray-400 hover:text-white'
                }`}
                title="Confluence"
              ><BarChart3 className="w-3 h-3" />Confluence</button>
              <button
                onClick={() => { setView('calibration'); loadCalibration() }}
                className={`text-[10px] px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                  view === 'calibration' ? 'bg-gold-500/20 text-gold-300' : 'text-gray-400 hover:text-white'
                }`}
                title="Bayesian Calibration tablosu"
              ><Activity className="w-3 h-3" />Kalibrasyon</button>
            </div>
            <button
              onClick={reloadAll}
              disabled={refreshing}
              className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
              Yenile
            </button>
          </div>
        </div>

        {/* ── TF seçici (gruplandırılmış: scalping / swing / pozisyon) ─ */}
        <div className="space-y-2">
          {[10, 20, 30].map(tier => {
            const tfsInTier = TF_LIST.filter(t => t.tier === tier)
            return (
              <div key={tier} className="space-y-1">
                <div className="flex items-center gap-2 text-[9px] uppercase tracking-wider text-gray-500">
                  <span className="font-semibold">{TF_GROUP_LABEL[tier]}</span>
                  <span className="flex-1 h-px bg-dark-700" />
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {tfsInTier.map(tf => {
                    const isActive = activeTF === tf.key
                    return (
                      <button
                        key={tf.key}
                        onClick={() => setActiveTF(tf.key)}
                        className={`text-xs px-3 py-1.5 rounded-lg border-2 transition-all font-mono font-semibold flex items-center gap-1.5 ${
                          isActive
                            ? `bg-${tf.color}-500/20 border-${tf.color}-500/50 text-${tf.color}-300`
                            : 'bg-dark-800 border-dark-700 text-gray-400 hover:border-dark-600'
                        }`}
                      >
                        <Clock className="w-3 h-3" />
                        {tf.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Bilgi şeridi */}
        <div className="flex items-start gap-2 p-2.5 bg-blue-500/5 border border-blue-500/20 rounded-lg text-[11px]">
          <Info className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
          <p className="text-gray-400 leading-relaxed">
            Her timeframe 12 koşul üzerinden puanlanır (current TF + higher TF + AI/math).{' '}
            <span className="text-white">Confluence</span> 7 TF'in ağırlıklı toplamı:
            uzun TF (1w×12, 1d×10) daha çok ağırlık taşır.{' '}
            {activeTF === '1m'  ? '10 sn' :
             activeTF === '5m'  ? '30 sn' :
             activeTF === '15m' ? '1 dk'  : '2 dk'}'da bir otomatik yenilenir.
          </p>
        </div>
      </div>

      {/* ── Scanner görünümü ────────────────────────────────────────── */}
      {view === 'scanner' && (
        <ScannerView
          data={scannerData}
          activeTF={activeTF}
          direction={direction}
          setDirection={setDirection}
          expandedSymbol={expandedSymbol}
          setExpandedSymbol={setExpandedSymbol}
          onGenerate={triggerGenerate}
          refreshing={refreshing}
          confluenceData={confluenceData}
        />
      )}

      {/* ── Confluence görünümü ─────────────────────────────────────── */}
      {view === 'confluence' && (
        <ConfluenceView
          data={confluenceData}
          expandedSymbol={expandedSymbol}
          setExpandedSymbol={setExpandedSymbol}
        />
      )}

      {/* ── Calibration (Bayesian) görünümü ──────────────────────────── */}
      {view === 'calibration' && (
        <CalibrationView
          data={calibrationData}
          activeTF={activeTF}
          onCalibrate={triggerCalibrationRun}
          running={calibrationRunning}
        />
      )}
    </div>
  )
}

// ─── Scanner görünümü ─────────────────────────────────────────────────────
function ScannerView({ data, activeTF, direction, setDirection, expandedSymbol, setExpandedSymbol, onGenerate, refreshing, confluenceData }) {
  if (data?.pending) {
    return (
      <div className="card p-8 text-center space-y-3">
        <Clock className="w-8 h-8 text-amber-400 mx-auto" />
        <h3 className="text-white font-bold">{activeTF.toUpperCase()} taraması hazırlanıyor</h3>
        <p className="text-xs text-gray-400 max-w-md mx-auto">
          Backend Binance verilerini topluyor, indikatörleri ve AI katmanını hesaplıyor (1-2 dk).
        </p>
        <button onClick={onGenerate} disabled={refreshing} className="btn-primary inline-flex items-center gap-2 text-sm">
          {refreshing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Şimdi üret
        </button>
      </div>
    )
  }
  if (data?.error) {
    return (
      <div className="card p-6 text-center">
        <AlertTriangle className="w-6 h-6 text-red-400 mx-auto mb-2" />
        <p className="text-sm text-red-300">{data.error}</p>
      </div>
    )
  }

  const scanner = data?.scanner
  const longSignals = scanner?.long?.signals || []
  const shortSignals = scanner?.short?.signals || []
  const visibleSignals = direction === 'long' ? longSignals : shortSignals
  const longCount = longSignals.length
  const shortCount = shortSignals.length

  return (
    <>
      {/* Tarama özeti */}
      <div className="card p-3 flex items-center justify-between flex-wrap gap-2 text-[11px]">
        <div className="flex items-center gap-3 text-gray-400">
          <span className="flex items-center gap-1">
            <Coins className="w-3.5 h-3.5 text-gold-400" />
            <span className="text-white font-mono">{scanner?.analyzedCount || 0}</span> / {scanner?.tierLimit || 10} coin
          </span>
          <span className="text-gray-600">·</span>
          <span>Üst TF: <span className="text-white font-mono">{scanner?.higherTimeframe || '—'}</span></span>
          <span className="text-gray-600">·</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {scanner?.generatedAt ? new Date(scanner.generatedAt).toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'}) : '—'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setDirection('long')}
            className={`text-[10px] px-2.5 py-1 rounded-full border font-bold ${
              direction === 'long'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-dark-800 text-gray-500 border-dark-700'
            }`}
          >
            ↑ LONG ({longCount})
          </button>
          <button
            onClick={() => setDirection('short')}
            className={`text-[10px] px-2.5 py-1 rounded-full border font-bold ${
              direction === 'short'
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                : 'bg-dark-800 text-gray-500 border-dark-700'
            }`}
          >
            ↓ SHORT ({shortCount})
          </button>
        </div>
      </div>

      {/* Sinyal kartları */}
      {visibleSignals.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-sm text-gray-400">
            {activeTF.toUpperCase()} timeframe'inde {direction === 'long' ? 'long' : 'short'} sinyal yok.
          </p>
          <p className="text-xs text-gray-500 mt-1">Diğer TF'leri ya da yönü deneyebilirsin.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleSignals.map((sig, idx) => (
            <SignalCard
              key={sig.symbol + idx}
              sig={sig}
              rank={idx + 1}
              direction={direction}
              tf={activeTF}
              expanded={expandedSymbol === sig.symbol}
              onToggle={() => setExpandedSymbol(expandedSymbol === sig.symbol ? null : sig.symbol)}
              confluenceForCoin={confluenceData?.all?.find(c => c.symbol === sig.symbol)}
            />
          ))}
        </div>
      )}
    </>
  )
}

// ─── Tek sinyal kartı ─────────────────────────────────────────────────────
function SignalCard({ sig, rank, direction, tf, expanded, onToggle, confluenceForCoin }) {
  const dirStyle = direction === 'long'
    ? { label: '↑ LONG', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' }
    : { label: '↓ SHORT', color: 'text-rose-400',  bg: 'bg-rose-500/10',     border: 'border-rose-500/30' }
  const gradeColor = GRADE_STYLES[sig.grade] || GRADE_STYLES.ZAYIF

  const ratio = sig.totalScore / (sig.applicableMax || 12)
  const gaugeColor = ratio >= 0.75 ? 'bg-emerald-500'
                  : ratio >= 0.55 ? 'bg-sky-500'
                  : ratio >= 0.35 ? 'bg-amber-500' : 'bg-gray-500'

  // Pattern badges — sadece sinyal yönüyle uyumlu olanları göster
  const patternBadges = []
  const p = sig.patterns || {}
  const isLong = direction === 'long'
  if (p.engulfing) {
    const isBullPattern = p.engulfing.type === 'bullish_engulfing'
    if (isLong === isBullPattern) {
      patternBadges.push({ label: isBullPattern ? 'Boğa Yutması' : 'Ayı Yutması', color: isBullPattern ? 'emerald' : 'rose' })
    }
  }
  if (p.pinBar?.type === 'hammer' && isLong) patternBadges.push({ label: 'Çekiç', color: 'emerald' })
  if (p.pinBar?.type === 'shooting_star' && !isLong) patternBadges.push({ label: 'Vurulan Yıldız', color: 'rose' })
  if (p.harami?.type === 'bullish_harami' && isLong) patternBadges.push({ label: 'Boğa Harami', color: 'emerald' })
  if (p.harami?.type === 'bearish_harami' && !isLong) patternBadges.push({ label: 'Ayı Harami', color: 'rose' })
  if (p.doji?.type === 'long_legged_doji') patternBadges.push({ label: 'Uzun Doji', color: 'amber' })  // doji yön-nötr

  // Divergence badge — sadece sinyal yönüyle uyumlu
  const div = sig.divergence
  const divIsBull = div?.type?.includes('bullish')
  const divBadge = div && (isLong === !!divIsBull) ? {
    label: div.type === 'regular_bullish' ? 'Bullish Diverj.' :
           div.type === 'regular_bearish' ? 'Bearish Diverj.' :
           div.type === 'hidden_bullish'  ? 'Hidden Bull. Div.' :
           div.type === 'hidden_bearish'  ? 'Hidden Bear. Div.' : div.type,
    color: divIsBull ? 'emerald' : 'rose',
  } : null

  // Volatility badge
  const volStyle = VOLATILITY_STYLES[sig.volatility?.regime] || null

  // Conditions by group
  const conditionsByGroup = {}
  for (const c of (sig.conditions || [])) {
    if (!c.applicable) continue
    conditionsByGroup[c.group] = conditionsByGroup[c.group] || []
    conditionsByGroup[c.group].push(c)
  }

  return (
    <div className={`card border-2 ${expanded ? 'border-gold-500/40' : 'border-dark-700'} transition-colors`}>
      <div className="cursor-pointer" onClick={onToggle}>
        {/* Üst satır */}
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="text-gray-500 font-bold w-6 text-center text-sm flex-shrink-0">#{rank}</span>

          {sig.image ? (
            <img src={sig.image} alt={sig.symbol} className="w-8 h-8 rounded-full flex-shrink-0"
              onError={(e) => { e.currentTarget.style.display = 'none' }} />
          ) : (
            <div className="w-8 h-8 rounded-full bg-dark-700 flex items-center justify-center flex-shrink-0">
              <Coins className="w-4 h-4 text-gold-400" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-bold text-white">{sig.symbol}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${dirStyle.bg} ${dirStyle.border} ${dirStyle.color}`}>
                {dirStyle.label}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${gradeColor}`}>
                {sig.grade}
              </span>
              {sig.leverage_suggest > 1 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full border bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30">
                  {sig.leverage_suggest}x
                </span>
              )}
              {volStyle && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${volStyle.bg} ${volStyle.color}`}>
                  {volStyle.label}
                </span>
              )}
              {sig.winProbability && (() => {
                const p = sig.winProbability.probability
                const n = sig.winProbability.samples || 0
                // Confidence-based styling:
                //   n >= 30: kalın bg, "calibrated" ★
                //   n >= 5:  orta bg
                //   n < 5:   açık bg, "prior" işareti
                const isCalibrated = n >= 30
                const isMid = n >= 5
                const cls = isCalibrated
                  ? 'bg-purple-500/25 text-purple-200 border-purple-500/50'
                  : isMid
                  ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                  : 'bg-purple-500/5 text-purple-300/80 border-purple-500/20'
                const tooltip = n === 0
                  ? `Prior (henüz backtest verisi yok): %${(sig.winProbability.prior * 100).toFixed(0)}`
                  : `Bayesian — bucket ${sig.winProbability.bucket}, prior %${(sig.winProbability.prior * 100).toFixed(0)} → posterior %${(p * 100).toFixed(0)} (${n} örneklem, α=${sig.winProbability.posteriorAlpha?.toFixed(2)} β=${sig.winProbability.posteriorBeta?.toFixed(2)})`
                return (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${cls}`} title={tooltip}>
                    %{(p * 100).toFixed(0)} kazanma
                    {n === 0 && <span className="text-[8px] opacity-70 ml-0.5">prior</span>}
                    {n > 0 && n < 5 && <span className="text-[8px] opacity-70 ml-0.5">·n{n}</span>}
                    {isMid && !isCalibrated && <span className="text-[8px] opacity-70 ml-0.5">·n{n}</span>}
                    {isCalibrated && <span className="text-[8px] ml-0.5">★</span>}
                  </span>
                )
              })()}
              {confluenceForCoin && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full border ${VERDICT_STYLES[confluenceForCoin.verdict]?.bg || ''} ${VERDICT_STYLES[confluenceForCoin.verdict]?.border || ''} ${VERDICT_STYLES[confluenceForCoin.verdict]?.color || ''}`}
                  title={`Confluence: ${confluenceForCoin.alignedLong}L / ${confluenceForCoin.alignedShort}S, conf=${confluenceForCoin.confidence}`}
                >
                  MTF: {VERDICT_STYLES[confluenceForCoin.verdict]?.label || confluenceForCoin.verdict}
                </span>
              )}
            </div>
            {sig.name && sig.name !== sig.symbol && (
              <p className="text-[10px] text-gray-500 truncate mt-0.5">{sig.name}</p>
            )}
          </div>

          <div className="flex flex-col items-end flex-shrink-0">
            <div className="text-xl sm:text-2xl font-bold text-white leading-none">{sig.totalScore}</div>
            <div className="text-[9px] sm:text-[10px] text-gray-500 mt-0.5">/ {sig.applicableMax}</div>
            <div className="w-12 h-1 bg-dark-700 rounded-full mt-1 overflow-hidden">
              <div className={`h-full ${gaugeColor} transition-all`} style={{ width: `${ratio * 100}%` }} />
            </div>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
        </div>

        {/* AI/Math rozetleri */}
        {(patternBadges.length > 0 || divBadge) && (
          <div className="flex items-center gap-1.5 flex-wrap mt-2 ml-9">
            {patternBadges.map((b, i) => (
              <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full bg-${b.color}-500/10 text-${b.color}-300 border border-${b.color}-500/30`}>
                {b.label}
              </span>
            ))}
            {divBadge && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full bg-${divBadge.color}-500/10 text-${divBadge.color}-300 border border-${divBadge.color}-500/30`}>
                {divBadge.label}
              </span>
            )}
          </div>
        )}

        {/* Fiyat satırı */}
        <div className="flex items-center gap-x-3 gap-y-1 mt-2 ml-9 text-[11px] text-gray-400 flex-wrap">
          {sig.entry != null && (
            <span className="flex items-center gap-1">
              <Target className="w-3 h-3" />
              Giriş: <span className="text-white font-mono">{formatUsd(sig.entry)}</span>
            </span>
          )}
          {sig.stop != null && (
            <span className="text-rose-300">Stop: <span className="font-mono">{formatUsd(sig.stop)}</span></span>
          )}
          {sig.target1 != null && (
            <span className="text-emerald-300">T1: <span className="font-mono">{formatUsd(sig.target1)}</span></span>
          )}
          {sig.target2 != null && (
            <span className="text-emerald-200">T2: <span className="font-mono">{formatUsd(sig.target2)}</span></span>
          )}
        </div>
      </div>

      {/* Açılır panel */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-dark-700 space-y-3">
          {/* Trade plan */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <PlanCell label="Giriş" value={formatUsd(sig.entry)} icon={Target} color="emerald" />
            <PlanCell label="Stop"  value={formatUsd(sig.stop)}  icon={Shield} color="rose" />
            <PlanCell label="Hedef 1" value={formatUsd(sig.target1)} icon={Sparkles} color="sky" />
            <PlanCell label="Hedef 2" value={formatUsd(sig.target2)} icon={Sparkles} color="emerald" />
          </div>

          {/* İndikatörler */}
          {sig.indicators && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <Indicator label={`${tf} RSI`} value={sig.indicators.current_rsi} digits={0} />
              <Indicator label={`${tf} MACD`} value={sig.indicators.current_macdHist} digits={3} />
              <Indicator label={`${sig.higherTimeframe || ''} RSI`} value={sig.indicators.higher_rsi} digits={0} />
              <Indicator label={`${sig.higherTimeframe || ''} MACD`} value={sig.indicators.higher_macdHist} digits={3} />
            </div>
          )}

          {/* Volatilite + momentum detayı */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
            {sig.volatility && (
              <div className="p-2 rounded-lg bg-dark-800 border border-dark-700">
                <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Volatilite Rejimi</div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] ${VOLATILITY_STYLES[sig.volatility.regime]?.bg || ''} ${VOLATILITY_STYLES[sig.volatility.regime]?.color || ''}`}>
                    {sig.volatility.regime?.toUpperCase()}
                  </span>
                  <span className="text-gray-400 text-[10px]">
                    ATR: {sig.volatility.atrPct?.toFixed(2)}% (z={sig.volatility.zScore})
                  </span>
                </div>
              </div>
            )}
            {sig.momentum && (
              <div className="p-2 rounded-lg bg-dark-800 border border-dark-700">
                <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Momentum İvmesi</div>
                <div className="flex items-center gap-2">
                  <Activity className="w-3 h-3 text-fuchsia-300" />
                  <span className="text-fuchsia-300 text-[10px] capitalize">
                    {sig.momentum.type?.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Koşul rozetleri (gruplandırılmış) */}
          <div className="space-y-2">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">
              Koşullar ({sig.totalScore}/{sig.applicableMax} geçti)
            </div>
            {Object.entries(conditionsByGroup).map(([group, conds]) => (
              <div key={group}>
                <div className="text-[10px] text-gray-500 mb-1 capitalize">{group}</div>
                <div className="flex flex-wrap gap-1">
                  {conds.map(c => (
                    <span
                      key={c.id}
                      title={c.why}
                      className={`text-[10px] px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${
                        c.met
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                          : 'bg-gray-500/10 text-gray-500 border-gray-500/20 line-through'
                      }`}
                    >
                      {c.met ? <CheckCircle2 className="w-2.5 h-2.5" /> : <span className="w-2.5 h-2.5">×</span>}
                      {c.label}
                      {c.required && c.met && <span className="text-[9px] opacity-60">★</span>}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Confluence detayı (varsa) */}
          {confluenceForCoin && (
            <div className="p-2 rounded-lg bg-purple-500/5 border border-purple-500/20">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[10px] text-purple-300 uppercase tracking-wider font-semibold">
                  7-TF Confluence
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${VERDICT_STYLES[confluenceForCoin.verdict]?.bg} ${VERDICT_STYLES[confluenceForCoin.verdict]?.border} ${VERDICT_STYLES[confluenceForCoin.verdict]?.color}`}>
                  {VERDICT_STYLES[confluenceForCoin.verdict]?.label}
                </span>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {TF_LIST.map(tf => {
                  const dir = confluenceForCoin.tfDirections?.[tf.key]
                  const ico = dir === 'long' ? <TrendingUp className="w-2.5 h-2.5" />
                            : dir === 'short' ? <TrendingDown className="w-2.5 h-2.5" />
                            : <Minus className="w-2.5 h-2.5" />
                  const cls = dir === 'long' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : dir === 'short' ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                            : dir === 'no_data' ? 'bg-gray-700/30 text-gray-600 border-gray-700/40'
                            : 'bg-gray-500/10 text-gray-400 border-gray-500/20'
                  return (
                    <span key={tf.key} className={`text-[9px] px-1.5 py-0.5 rounded border inline-flex items-center gap-0.5 ${cls}`}>
                      {ico} {tf.key}
                    </span>
                  )
                })}
              </div>
              <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400">
                <span>Net: <span className="text-white font-mono">{confluenceForCoin.net}</span></span>
                <span>·</span>
                <span>Güven: <span className="text-purple-300 font-mono">{(confluenceForCoin.confidence * 100).toFixed(0)}%</span></span>
                <span>·</span>
                <span>{confluenceForCoin.alignedLong}L / {confluenceForCoin.alignedShort}S</span>
              </div>
            </div>
          )}

          {/* Binance link */}
          <a
            href={`https://www.binance.com/en/trade/${sig.symbol}_USDT`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] text-gold-400 hover:text-gold-300"
          >
            <ExternalLink className="w-3 h-3" />
            Binance'te {sig.symbol}/USDT
          </a>
        </div>
      )}
    </div>
  )
}

// ─── Confluence görünümü ──────────────────────────────────────────────────
function ConfluenceView({ data, expandedSymbol, setExpandedSymbol }) {
  if (data?.error) {
    return (
      <div className="card p-6 text-center">
        <AlertTriangle className="w-6 h-6 text-red-400 mx-auto mb-2" />
        <p className="text-sm text-red-300">{data.error}</p>
      </div>
    )
  }
  const top = data?.top || []
  if (top.length === 0) {
    return (
      <div className="card p-6 text-center">
        <Layers className="w-6 h-6 text-gray-500 mx-auto mb-2" />
        <p className="text-sm text-gray-400">Henüz yeterli TF taraması yok.</p>
        <p className="text-xs text-gray-500 mt-1">Önce her TF için scanner'ı çalıştır.</p>
      </div>
    )
  }

  return (
    <>
      {/* Özet sayaçları */}
      <div className="card p-3 grid grid-cols-3 sm:grid-cols-7 gap-2 text-[10px]">
        <Tally label="STRONG LONG" value={data.strongLong} cls="text-emerald-300 bg-emerald-500/15" />
        <Tally label="LONG" value={data.long} cls="text-emerald-400 bg-emerald-500/10" />
        <Tally label="WEAK LONG" value={data.all?.filter(c => c.verdict === 'WEAK_LONG').length || 0} cls="text-emerald-200 bg-emerald-500/5" />
        <Tally label="NÖTR" value={data.neutral} cls="text-gray-400 bg-gray-500/10" />
        <Tally label="WEAK SHORT" value={data.all?.filter(c => c.verdict === 'WEAK_SHORT').length || 0} cls="text-rose-200 bg-rose-500/5" />
        <Tally label="SHORT" value={data.short} cls="text-rose-400 bg-rose-500/10" />
        <Tally label="STRONG SHORT" value={data.strongShort} cls="text-rose-300 bg-rose-500/15" />
      </div>

      {/* Top confluence list */}
      <div className="space-y-2">
        {top.map((c, idx) => (
          <ConfluenceRow
            key={c.symbol}
            c={c}
            rank={idx + 1}
            expanded={expandedSymbol === c.symbol}
            onToggle={() => setExpandedSymbol(expandedSymbol === c.symbol ? null : c.symbol)}
          />
        ))}
      </div>
    </>
  )
}

function Tally({ label, value, cls }) {
  return (
    <div className={`p-2 rounded-lg flex flex-col items-center text-center ${cls}`}>
      <div className="text-lg font-bold leading-none">{value || 0}</div>
      <div className="text-[9px] uppercase tracking-wider opacity-80 mt-0.5">{label}</div>
    </div>
  )
}

function ConfluenceRow({ c, rank, expanded, onToggle }) {
  const verdict = VERDICT_STYLES[c.verdict] || VERDICT_STYLES.NEUTRAL
  return (
    <div className={`card border-2 ${expanded ? 'border-purple-500/40' : 'border-dark-700'} transition-colors`}>
      <div className="cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-3">
          <span className="text-gray-500 font-bold w-6 text-center text-sm flex-shrink-0">#{rank}</span>

          {c.image ? (
            <img src={c.image} alt={c.symbol} className="w-7 h-7 rounded-full flex-shrink-0"
              onError={(e) => { e.currentTarget.style.display = 'none' }} />
          ) : (
            <div className="w-7 h-7 rounded-full bg-dark-700 flex items-center justify-center flex-shrink-0">
              <Coins className="w-3.5 h-3.5 text-gold-400" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-bold text-white">{c.symbol}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${verdict.bg} ${verdict.border} ${verdict.color}`}>
                {verdict.label}
              </span>
            </div>
            <div className="flex items-center gap-1 flex-wrap mt-1">
              {TF_LIST.map(tf => {
                const dir = c.tfDirections?.[tf.key]
                const cls = dir === 'long' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : dir === 'short' ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                          : dir === 'no_data' ? 'bg-gray-700/30 text-gray-600 border-gray-700/40'
                          : 'bg-gray-500/10 text-gray-400 border-gray-500/20'
                return (
                  <span key={tf.key} className={`text-[9px] px-1.5 py-0.5 rounded border ${cls}`} title={`${tf.label}: ${dir || 'no_data'}`}>
                    {tf.key}
                  </span>
                )
              })}
            </div>
          </div>

          <div className="flex flex-col items-end flex-shrink-0">
            <div className="text-base sm:text-lg font-bold text-white font-mono leading-none">
              {c.net > 0 ? '+' : ''}{c.net?.toFixed(1)}
            </div>
            <div className="text-[9px] text-gray-500 mt-0.5">net skor</div>
            <div className="text-[9px] text-purple-300 mt-0.5">
              %{(c.confidence * 100).toFixed(0)} güven
            </div>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
        </div>
      </div>

      {expanded && (
        <CoinDetailExpanded symbol={c.symbol} confluence={c} />
      )}
    </div>
  )
}

function CoinDetailExpanded({ symbol, confluence }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.get(`/market/crypto/mtf/coin/${symbol}`)
      .then(r => { if (!cancelled) setDetail(r.data) })
      .catch(() => { if (!cancelled) setDetail({ error: true }) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [symbol])

  if (loading) {
    return <div className="mt-3 pt-3 border-t border-dark-700 text-center"><RefreshCw className="w-4 h-4 animate-spin text-gold-400 mx-auto" /></div>
  }
  if (!detail || detail.error) {
    return <div className="mt-3 pt-3 border-t border-dark-700 text-center text-xs text-gray-500">Detay yüklenemedi</div>
  }

  const tfs = detail.timeframes || {}
  return (
    <div className="mt-3 pt-3 border-t border-dark-700 space-y-2">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider">7 Timeframe Detay</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {TF_LIST.map(tf => {
          const data = tfs[tf.key]
          if (!data) return (
            <div key={tf.key} className="p-2 rounded-lg bg-dark-800 border border-dark-700 opacity-50">
              <span className="text-[11px] font-mono text-gray-500">{tf.label} — veri yok</span>
            </div>
          )
          const longSc = data.long?.totalScore
          const shortSc = data.short?.totalScore
          const dir = (longSc || 0) > (shortSc || 0) ? 'long' : (shortSc || 0) > (longSc || 0) ? 'short' : 'neutral'
          const cls = dir === 'long' ? 'border-emerald-500/30 bg-emerald-500/5'
                    : dir === 'short' ? 'border-rose-500/30 bg-rose-500/5'
                    : 'border-dark-700 bg-dark-800 opacity-60'
          const sig = dir === 'long' ? data.long : dir === 'short' ? data.short : null
          return (
            <div key={tf.key} className={`p-2 rounded-lg border ${cls}`}>
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="font-mono font-semibold text-white">{tf.label}</span>
                {sig ? (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${dir === 'long' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
                    {dir === 'long' ? '↑' : '↓'} {sig.totalScore}/{sig.applicableMax}
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/40 text-gray-500" title="Zorunlu koşullar geçmedi (ör. RSI bandı dışı veya EMA dizilimi uyumsuz)">
                    skor yetersiz
                  </span>
                )}
              </div>
              {sig ? (
                <div className="text-[10px] text-gray-400 mt-1 flex flex-wrap gap-x-2">
                  <span>Giriş: <span className="text-white font-mono">{formatUsd(sig.entry)}</span></span>
                  <span className="text-rose-300">S: {formatUsd(sig.stop)}</span>
                  <span className="text-emerald-300">T: {formatUsd(sig.target1)}</span>
                  {sig.leverage_suggest > 1 && (
                    <span className="text-fuchsia-300">{sig.leverage_suggest}x</span>
                  )}
                </div>
              ) : (
                <div className="text-[10px] text-gray-600 mt-1">
                  Bu TF'de zorunlu koşullar karşılanmadı
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="text-[10px] text-gray-500 italic">
        Confluence: net {confluence.net} · güven %{(confluence.confidence * 100).toFixed(0)} ·
        {' '}{confluence.alignedLong} long / {confluence.alignedShort} short hizalı
      </div>
    </div>
  )
}

// ─── Calibration (Bayesian) görünümü ───────────────────────────────────────
function CalibrationView({ data, activeTF, onCalibrate, running }) {
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
            <Activity className="w-3.5 h-3.5 text-purple-300" />
            <span className="text-purple-300 font-semibold">Bayesian Calibration</span>
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

// ─── Yardımcılar ───────────────────────────────────────────────────────────
function PlanCell({ label, value, icon: Icon, color }) {
  const colorMap = {
    emerald: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/5',
    rose:    'text-rose-300 border-rose-500/30 bg-rose-500/5',
    sky:     'text-sky-300 border-sky-500/30 bg-sky-500/5',
  }
  return (
    <div className={`p-2 rounded-lg border ${colorMap[color] || colorMap.sky}`}>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider opacity-70 mb-0.5">
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <div className="text-xs font-mono font-bold">{value}</div>
    </div>
  )
}

function Indicator({ label, value, digits = 2 }) {
  const v = value == null ? '—' : Number(value).toFixed(digits)
  return (
    <div className="p-2 rounded-lg bg-dark-800 border border-dark-700">
      <div className="text-[9px] text-gray-500 uppercase tracking-wider">{label}</div>
      <div className="text-xs font-mono text-white mt-0.5">{v}</div>
    </div>
  )
}
