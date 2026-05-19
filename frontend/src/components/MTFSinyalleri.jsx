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
  Sparkles, Clock, ExternalLink, Activity, Info, BarChart3, Wifi, WifiOff, Star,
} from 'lucide-react'
import { io } from 'socket.io-client'
import api from '../services/api'
import { getSocketBase } from '../config'
import MTFCoinDetailModal from './MTFCoinDetailModal'
import BacktestView from './mtf/BacktestView'
import CalibrationView from './mtf/CalibrationView'
import ConfluenceView from './mtf/ConfluenceView'
import { formatUsd, formatPct, TF_LIST, VERDICT_STYLES } from './mtf/utils'

const TF_GROUP_LABEL = {
  10: 'Scalping (Top 10)',
  20: 'Swing (Top 20)',
  30: 'Pozisyon (Top 30)',
}

// 7 TF → 3 grup. Üst seviye sade, detay isteyen alt chip ile inebilir.
const TF_GROUPS = [
  { id: 'short',  label: 'Kısa Vade', sub: 'Scalping · 1-15 dk',     tfs: ['1m', '5m', '15m'], defaultTF: '5m', color: 'rose'    },
  { id: 'medium', label: 'Orta Vade', sub: 'Swing · 1-4 saat',       tfs: ['1h', '4h'],         defaultTF: '4h', color: 'amber'   },
  { id: 'long',   label: 'Uzun Vade', sub: 'Pozisyon · günlük+',     tfs: ['1d', '1w'],         defaultTF: '1d', color: 'emerald' },
]
const tfToGroup = (tfKey) => TF_GROUPS.find(g => g.tfs.includes(tfKey)) || TF_GROUPS[1]

const GRADE_STYLES = {
  MUKEMMEL: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  GUCLU:    'bg-sky-500/20    text-sky-300    border-sky-500/40',
  ORTA:     'bg-amber-500/20  text-amber-300  border-amber-500/40',
  ZAYIF:    'bg-gray-500/20   text-gray-300   border-gray-500/40',
}

const VOLATILITY_STYLES = {
  low:    { label: 'Düşük Vol', color: 'text-sky-300',     bg: 'bg-sky-500/10' },
  normal: { label: 'Normal Vol', color: 'text-emerald-300', bg: 'bg-emerald-500/10' },
  high:   { label: 'Yüksek Vol', color: 'text-amber-300',   bg: 'bg-amber-500/10' },
}

// USD fiyat formatı — kripto fiyatları geniş aralıkta
// ─── Ana component ─────────────────────────────────────────────────────────
export default function MTFSinyalleri() {
  const [activeTF, setActiveTF] = useState('4h')
  const [direction, setDirection] = useState('long')   // 'long' | 'short'
  const [view, setView] = useState('scanner')          // 'scanner' | 'confluence' | 'calibration' | 'backtest'
  const [scannerData, setScannerData] = useState(null)
  const [confluenceData, setConfluenceData] = useState(null)
  const [calibrationData, setCalibrationData] = useState(null)
  const [calibrationRunning, setCalibrationRunning] = useState(false)
  const [backtestData, setBacktestData] = useState(null)
  const [backtestRunning, setBacktestRunning] = useState(false)
  const [calibrationProgress, setCalibrationProgress] = useState(null)  // { phase, completedSteps, totalSteps, currentTF, currentDate }
  const [watchlistOnly, setWatchlistOnly] = useState(false)
  const [watchlistSymbols, setWatchlistSymbols] = useState(new Set())
  const [detailSymbol, setDetailSymbol] = useState(null)
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem('bk-mtf-sound') !== 'off' } catch { return true }
  })
  const audioRef = useRef(null)
  const lastSoundAtRef = useRef(0)
  const soundEnabledRef = useRef(true)
  useEffect(() => {
    soundEnabledRef.current = soundEnabled
    try { localStorage.setItem('bk-mtf-sound', soundEnabled ? 'on' : 'off') } catch (_) {}
  }, [soundEnabled])
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

  const runBacktest = useCallback(async ({ tf, asOf, horizon, feedToCalibration }) => {
    setBacktestRunning(true)
    setBacktestData(null)
    try {
      // feedToCalibration aktifse POST /backtest-and-feed kullan
      const r = feedToCalibration
        ? await api.post('/market/crypto/mtf/backtest-and-feed', { tf, asOf, horizon, save: true })
        : await api.get('/market/crypto/mtf/backtest', { params: { tf, asOf, horizon } })
      setBacktestData(r.data)
      // Feed yapıldıysa calibration verisini de tazele
      if (feedToCalibration) loadCalibration()
    } catch (e) {
      setBacktestData({ error: e.response?.data?.error || e.message })
    } finally {
      setBacktestRunning(false)
    }
  }, [loadCalibration])

  const triggerCalibrationRun = useCallback(async () => {
    setCalibrationRunning(true)
    setCalibrationProgress({ phase: 'starting', completedSteps: 0, totalSteps: 0 })
    try {
      // Hafif: sadece aktif TF × 3 gün — UI bloklamasın
      await api.post('/market/crypto/mtf/calibrate', { tfs: [activeTF], daysBack: 3, save: true })
      await loadCalibration()
    } catch (e) {
      // sessiz
    } finally {
      setCalibrationRunning(false)
      // Progress'i 3 sn sonra temizle (kullanıcı son durumu görsün)
      setTimeout(() => setCalibrationProgress(null), 3000)
    }
  }, [activeTF, loadCalibration])

  // Watchlist'i yükle (kullanıcı takip listesi)
  const loadWatchlist = useCallback(async () => {
    try {
      const r = await api.get('/user/watchlist')
      const symbols = (r.data?.watchlist || []).map(s => (s.symbol || s).toUpperCase())
      setWatchlistSymbols(new Set(symbols))
    } catch (e) {
      // takip listesi yoksa sessiz; toggle disabled olur
    }
  }, [])
  useEffect(() => { loadWatchlist() }, [loadWatchlist])

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

    // Audio init — Web Audio API'siz, küçük data URI yeterli (8kHz mono ping)
    if (!audioRef.current) {
      try {
        audioRef.current = new Audio('data:audio/wav;base64,UklGRrAFAABXQVZFZm10IBAAAAABAAEARKwAAESsAAABAAgAZGF0YYwFAACAhI2ZpLG7w8nMzczIwLizp5mNgnNlWUtBOzMuLi41O0VRXmt2gYqRl5ueoaKjo6KhnpqVj4iAd25kWlBHPjctKioqLjU+SVRgbHaAiJCWnJ+ho6OioJyXkYqCemxhVktAOC8oJiUmKjA5RFFcaXSAjJWdpKuwtLa3treyrqilm5GFd2dWRzgsIRoVERAQEhcdJC09SVdmdYWUocGtkH9wYVNGOy4kHRwbHB8mLDM7Q01YZXOAjpqksLrEy9HV1tXSzcfAuLCmnZGGe25iVUlAODAqKCcoKi45RFFebHWAi5OcoaSlpKKgnZmUjoiBeXBnXVNJQDoyLisrKy42P0pXY3B7hY+Xnp+goJ+enJqWko2HgXlybGRcVE5JQz03MzAtKyssLjE2PEFGTFNZX2VrcXh+hIqQlpyhpaiqq6urqaaiopH9foN+enRsZl5VTUQ8MyklJCMmKjE6RVJfa3iAi5SbnqGgnpyZlpKMhX52bWNZTkU8My0qKCgrLzhDT1tnc36Hjpaco6mssLO2t7e3trWzr6yopaCcl5KMhoF7dXBraGRfXFhVUk5LSEZEQ0NEQ0RDREVFR0pNUFRYW19jZ2tucnZ5fH+ChIeJjI+RkpSVlpaXlpaWlpWVk5GPjouHhIB8eHRwbWlmYmBdW1lXVlVUVFNUVFRVVlhZW11gYmVnaWxucXR2eHt9foCBgoOEhYWGhoeHh4eHh4eGhoaFhYSEg4OCgoGBgYCAgIB/f39+fn5+fn5+fn5+fX19fX18fHx7e3p6eXl5eXh4eHd3d3d3d3d3d3d4eHh4eXl5enp7e3x8fX1+fn9/gICBgYKDg4SEhYWGhoeHiIiJiYqKi4uMjI2Njo6Pj5CQkZGSkpOTk5SUlJWVlZWWlpaWl5eXl5eXl5eXl5eXl5eXl5eWlpaWlpWVlZSUlJOTk5KSkpGRkZCQkI+Pj46Ojo2NjY2MjIyMi4uLi4uLi4uLi4uLi4uMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjA==')
        audioRef.current.volume = 0.4
      } catch (_) {}
    }
    const playPing = () => {
      if (!soundEnabledRef.current || !audioRef.current) return
      // Cooldown: 10 sn'de bir, spam etmesin
      const now = Date.now()
      if (now - lastSoundAtRef.current < 10000) return
      lastSoundAtRef.current = now
      audioRef.current.currentTime = 0
      audioRef.current.play().catch(() => {})
    }

    // Backend mtfLiveLoop her 10sn tick atar — strategy='crypto_mtf_tick'
    // mtfBacktestService calibration progress'i — strategy='mtf_calibration_progress'
    sock.on('new_signal', (msg) => {
      if (msg?.strategy === 'crypto_mtf_tick') {
        setLastTickAt(new Date().toISOString())
        if (msg.timeframe === activeTFRef.current) {
          loadScanner(msg.timeframe)
        }
        // Backend confluence değişimini push notif olarak gönderiyor —
        // burada tick metadata'sında yeni STRONG var mı bak (longTop var ise ses)
        const hasNewStrong = (msg.topLong?.length || 0) > 0 || (msg.topShort?.length || 0) > 0
        if (hasNewStrong) playPing()
      } else if (msg?.strategy === 'mtf_calibration_progress') {
        setCalibrationProgress({
          phase: msg.phase,
          completedSteps: msg.completedSteps || 0,
          totalSteps: msg.totalSteps || 0,
          currentTF: msg.currentTF,
          currentDate: msg.currentDate,
          elapsedMs: msg.elapsedMs || 0,
          step: msg.step,
        })
        // 'completed' geldiğinde calibration'ı yeniden yükle
        if (msg.phase === 'completed') {
          loadCalibration()
        }
      }
    })

    return () => { sock.disconnect() }
  }, [loadScanner, loadCalibration])

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
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-gold-400/20 text-gold-400 border border-gold-400/30">
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
              <button
                onClick={() => setView('backtest')}
                className={`text-[10px] px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                  view === 'backtest' ? 'bg-gold-500/20 text-gold-300' : 'text-gray-400 hover:text-white'
                }`}
                title="Geçmiş tarihli backtest"
              ><Target className="w-3 h-3" />Backtest</button>
            </div>
            <button
              onClick={() => setSoundEnabled(s => !s)}
              className={`text-xs px-2 py-1.5 rounded-lg border ${
                soundEnabled
                  ? 'bg-gold-500/15 text-gold-300 border-gold-500/30'
                  : 'bg-dark-800 text-gray-500 border-dark-700'
              }`}
              title={soundEnabled ? 'Ses açık — STRONG sinyalde ping çalar (10sn cooldown)' : 'Ses kapalı'}
            >
              {soundEnabled ? '🔔' : '🔕'}
            </button>
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

        {/* ── 3 vade grubu + aktif grup içi TF chip'leri ─ */}
        <div className="space-y-2">
          {/* Üst seviye: 3 grup */}
          <div className="grid grid-cols-3 gap-2">
            {TF_GROUPS.map(g => {
              const isActive = g.tfs.includes(activeTF)
              const groupColorCls = isActive
                ? (g.color === 'rose'    ? 'bg-rose-500/15 border-rose-500/60 text-rose-200'
                : g.color === 'amber'   ? 'bg-amber-500/15 border-amber-500/60 text-amber-200'
                :                          'bg-emerald-500/15 border-emerald-500/60 text-emerald-200')
                : 'bg-dark-800 border-dark-700 text-gray-400 hover:border-dark-600'
              return (
                <button
                  key={g.id}
                  onClick={() => setActiveTF(g.defaultTF)}
                  className={`rounded-xl border-2 px-3 py-2 text-left transition-all ${groupColorCls}`}
                >
                  <div className="text-sm font-bold leading-tight">{g.label}</div>
                  <div className="text-[10px] opacity-80 mt-0.5">{g.sub}</div>
                </button>
              )
            })}
          </div>

          {/* Alt seviye: aktif grubun TF chip'leri (detay isteyen tıklar) */}
          {(() => {
            const activeGroup = tfToGroup(activeTF)
            if (activeGroup.tfs.length <= 1) return null
            return (
              <div className="flex items-center gap-1.5 flex-wrap pl-1">
                <span className="text-[9px] uppercase tracking-wider text-gray-500">TF:</span>
                {activeGroup.tfs.map(tfKey => {
                  const tf = TF_LIST.find(t => t.key === tfKey)
                  const isActive = activeTF === tfKey
                  return (
                    <button
                      key={tfKey}
                      onClick={() => setActiveTF(tfKey)}
                      className={`text-[11px] px-2 py-0.5 rounded-full border transition-all font-mono font-semibold flex items-center gap-1 ${
                        isActive
                          ? `bg-${tf.color}-500/20 border-${tf.color}-500/50 text-${tf.color}-300`
                          : 'bg-dark-800 border-dark-700 text-gray-500 hover:border-dark-600 hover:text-gray-300'
                      }`}
                    >
                      <Clock className="w-2.5 h-2.5" />
                      {tf.label}
                    </button>
                  )
                })}
              </div>
            )
          })()}
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
          watchlistOnly={watchlistOnly}
          setWatchlistOnly={setWatchlistOnly}
          watchlistSymbols={watchlistSymbols}
          onOpenDetail={setDetailSymbol}
        />
      )}

      {/* ── Confluence görünümü ─────────────────────────────────────── */}
      {view === 'confluence' && (
        <ConfluenceView
          data={confluenceData}
          expandedSymbol={expandedSymbol}
          setExpandedSymbol={setExpandedSymbol}
          watchlistOnly={watchlistOnly}
          setWatchlistOnly={setWatchlistOnly}
          watchlistSymbols={watchlistSymbols}
          onOpenDetail={setDetailSymbol}
        />
      )}

      {/* ── Calibration (Bayesian) görünümü ──────────────────────────── */}
      {view === 'calibration' && (
        <CalibrationView
          data={calibrationData}
          activeTF={activeTF}
          onCalibrate={triggerCalibrationRun}
          running={calibrationRunning}
          progress={calibrationProgress}
        />
      )}

      {/* ── Backtest görünümü ────────────────────────────────────────── */}
      {view === 'backtest' && (
        <BacktestView
          activeTF={activeTF}
          data={backtestData}
          onRun={runBacktest}
          running={backtestRunning}
        />
      )}

      {/* ── Coin detay modalı (Faz 14) ───────────────────────────────── */}
      {detailSymbol && (
        <MTFCoinDetailModal
          symbol={detailSymbol}
          onClose={() => setDetailSymbol(null)}
        />
      )}
    </div>
  )
}

// ─── Scanner görünümü ─────────────────────────────────────────────────────
function ScannerView({ data, activeTF, direction, setDirection, expandedSymbol, setExpandedSymbol, onGenerate, refreshing, confluenceData, watchlistOnly, setWatchlistOnly, watchlistSymbols, onOpenDetail }) {
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
  const allLongSignals  = scanner?.long?.allSignals  || scanner?.long?.signals  || []
  const allShortSignals = scanner?.short?.allSignals || scanner?.short?.signals || []
  // Watchlist filtresi: aktifse sadece takip listesindeki coin'ler
  const filterByWatchlist = (sigs) => watchlistOnly
    ? sigs.filter(s => watchlistSymbols.has((s.symbol || '').toUpperCase()))
    : sigs.slice(0, 10)
  const longSignals  = filterByWatchlist(allLongSignals)
  const shortSignals = filterByWatchlist(allShortSignals)
  const visibleSignals = direction === 'long' ? longSignals : shortSignals
  const longCount  = (watchlistOnly ? filterByWatchlist(allLongSignals)  : allLongSignals.slice(0, 10)).length
  const shortCount = (watchlistOnly ? filterByWatchlist(allShortSignals) : allShortSignals.slice(0, 10)).length
  const watchlistAvailable = watchlistSymbols && watchlistSymbols.size > 0

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
        <div className="flex items-center gap-1 flex-wrap">
          {/* Watchlist filtresi (sadece takipte) */}
          {watchlistAvailable && (
            <button
              onClick={() => setWatchlistOnly(!watchlistOnly)}
              className={`text-[10px] px-2.5 py-1 rounded-full border font-semibold flex items-center gap-1 ${
                watchlistOnly
                  ? 'bg-gold-500/20 text-gold-300 border-gold-500/40'
                  : 'bg-dark-800 text-gray-500 border-dark-700'
              }`}
              title={`Takip listendeki ${watchlistSymbols.size} coin'i filtrele`}
            >
              <Star className="w-2.5 h-2.5" />
              Takipte ({watchlistSymbols.size})
            </button>
          )}
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
              onOpenDetail={onOpenDetail}
            />
          ))}
        </div>
      )}
    </>
  )
}

// ─── Tek sinyal kartı ─────────────────────────────────────────────────────
function SignalCard({ sig, rank, direction, tf, expanded, onToggle, confluenceForCoin, onOpenDetail }) {
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
                <span className="text-[10px] px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/30">
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
                  ? 'bg-gold-400/25 text-gold-300 border-gold-400/50'
                  : isMid
                  ? 'bg-gold-400/15 text-gold-400 border-gold-400/30'
                  : 'bg-gold-400/5 text-gold-400/80 border-gold-400/20'
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
                  <Activity className="w-3 h-3 text-amber-400" />
                  <span className="text-amber-400 text-[10px] capitalize">
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
            <div className="p-2 rounded-lg bg-gold-400/5 border border-gold-400/20">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[10px] text-gold-400 uppercase tracking-wider font-semibold">
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
                <span>Güven: <span className="text-gold-400 font-mono">{(confluenceForCoin.confidence * 100).toFixed(0)}%</span></span>
                <span>·</span>
                <span>{confluenceForCoin.alignedLong}L / {confluenceForCoin.alignedShort}S</span>
              </div>
            </div>
          )}

          {/* Aksiyon butonları */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={(e) => { e.stopPropagation(); onOpenDetail?.(sig.symbol) }}
              className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg bg-gold-400/15 text-gold-400 border border-gold-400/30 hover:bg-gold-400/25"
              title="Bu coin için 7 timeframe full detay modalı"
            >
              <Layers className="w-3 h-3" />
              7-TF Detay
            </button>
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
        </div>
      )}
    </div>
  )
}

// ─── Confluence görünümü ──────────────────────────────────────────────────

// ─── Calibration (Bayesian) görünümü ───────────────────────────────────────


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
