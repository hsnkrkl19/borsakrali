/**
 * Emtia Sinyalleri — Borsa Krali
 *
 * Altın & Gümüş için Malaysian SNR scanner sonuçlarını gösteren günlük tespit kartı.
 * Endpoint: GET /api/snr/scanner/commodity
 *   → XAUUSD (Ons Altın), XAGUSD (Ons Gümüş), XAUTRY (Gram Altın), XAGTRY (Gram Gümüş)
 *
 * Üstte 4'lü canlı fiyat şeridi, altında en güçlü destek/direnç sinyalleri.
 */

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  RefreshCw, Coins, TrendingUp, TrendingDown, Minus, Target, ExternalLink,
  Sparkles, AlertCircle,
} from 'lucide-react'
import api from '../services/api'

const GRADE_STYLES = {
  'A+': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  'A':  'bg-sky-500/20    text-sky-300    border-sky-500/40',
  'B':  'bg-amber-500/20  text-amber-300  border-amber-500/40',
}

const STORYLINE_CFG = {
  bullish: { color: 'text-emerald-400', label: 'Yükseliş', icon: TrendingUp },
  bearish: { color: 'text-rose-400',    label: 'Düşüş',    icon: TrendingDown },
  neutral: { color: 'text-gray-400',    label: 'Yatay',    icon: Minus },
}

const SYMBOL_META = {
  XAUUSD: { emoji: '🥇', name: 'Altın (Ons)',   unit: 'USD/oz', priceKey: 'gold_usd' },
  XAGUSD: { emoji: '🥈', name: 'Gümüş (Ons)',  unit: 'USD/oz', priceKey: 'silver_usd' },
  XAUTRY: { emoji: '🏅', name: 'Gram Altın',    unit: 'TL/gr',  priceKey: 'gold_try' },
  XAGTRY: { emoji: '🥈', name: 'Gram Gümüş',   unit: 'TL/gr',  priceKey: 'silver_try' },
}

function fmtNum(value, digits = 2) {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toLocaleString('tr-TR', { maximumFractionDigits: digits })
}

function fmtPct(value, digits = 2) {
  if (value == null || !Number.isFinite(value)) return '—'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}%`
}

export default function EmtiaSinyalleri() {
  const [signals, setSignals] = useState([])
  const [prices, setPrices] = useState({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      const [scanRes, priceRes] = await Promise.allSettled([
        api.get('/snr/scanner/commodity'),
        fetch('/api/market/commodities').then(r => r.json()).catch(() => ({})),
      ])
      if (scanRes.status === 'fulfilled') {
        setSignals(scanRes.value.data?.results || [])
      } else {
        setError('Sinyaller yüklenemedi')
      }
      if (priceRes.status === 'fulfilled') {
        setPrices(priceRes.value || {})
      }
      setUpdatedAt(new Date())
    } catch (e) {
      setError(e.message || 'Veri alınamadı')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const onRefresh = () => { setRefreshing(true); load() }

  if (loading) {
    return (
      <div className="card flex items-center justify-center py-16">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-amber-400 animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">Altın & gümüş SNR sinyalleri yükleniyor...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Başlık + yenile */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Coins className="w-5 h-5 text-yellow-400" />
            Altın & Gümüş Sinyalleri
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Malaysian SNR — body-bazlı destek/direnç bölgeleri (günlük TF)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {updatedAt && (
            <span className="text-[10px] text-gray-500">
              {updatedAt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>
      </div>

      {/* Fiyat şeridi — 4'lü */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {Object.entries(SYMBOL_META).map(([sym, meta]) => {
          const p = prices[meta.priceKey]
          const cp = p?.changePercent
          const up = (cp || 0) >= 0
          return (
            <Link
              key={sym}
              to={`/malaysian-snr?symbol=${sym}&type=commodity`}
              className="card !p-3 hover:border-yellow-500/40 transition-colors group"
            >
              <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mb-1">
                <span>{meta.emoji}</span>
                <span className="truncate">{meta.name}</span>
                <ExternalLink className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-60" />
              </div>
              {p?.price != null ? (
                <>
                  <p className="text-white font-bold text-base">
                    {fmtNum(p.price)} <span className="text-[10px] text-gray-500">{meta.unit}</span>
                  </p>
                  <p className={`text-[11px] font-semibold ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {fmtPct(cp)}
                  </p>
                </>
              ) : (
                <p className="text-xs text-gray-600">—</p>
              )}
            </Link>
          )
        })}
      </div>

      {/* Sinyaller */}
      {error ? (
        <div className="card p-4 bg-rose-500/10 border-rose-500/30 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-400" />
          <p className="text-sm text-rose-300">{error}</p>
        </div>
      ) : signals.length === 0 ? (
        <div className="card p-6 text-center">
          <Sparkles className="w-10 h-10 text-gray-600 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Şu an aktif altın/gümüş sinyali bulunmuyor.</p>
          <p className="text-xs text-gray-600 mt-1">
            Fiyat geçerli destek/direnç bölgesine yaklaştığında burada görünecek.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {signals.map((item, i) => {
            const meta = SYMBOL_META[item.symbol] || { emoji: '🏅', name: item.name, unit: item.unit }
            const story = STORYLINE_CFG[item.storyline] || STORYLINE_CFG.neutral
            const StoryIcon = story.icon
            const sig = item.topSignal
            const isLong = sig.type === 'support'

            return (
              <Link
                key={item.symbol}
                to={`/malaysian-snr?symbol=${item.symbol}&type=commodity`}
                className="card hover:border-yellow-500/40 transition-colors block !p-4"
              >
                <div className="flex items-start gap-3 flex-wrap">
                  <span className="text-2xl">{meta.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white">{item.symbol}</span>
                      <span className="text-xs text-gray-400">{meta.name}</span>
                      {sig.grade && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${GRADE_STYLES[sig.grade]}`}>
                          {sig.grade}
                        </span>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                        isLong ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                               : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      }`}>
                        {isLong ? '🟢 LONG' : '🔴 SHORT'}
                      </span>
                      <span className={`text-[10px] flex items-center gap-1 ${story.color}`}>
                        <StoryIcon className="w-3 h-3" />{story.label}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-2 text-center">
                        <p className="text-[10px] text-gray-500">▶ GİRİŞ</p>
                        <p className="text-blue-300 font-bold text-sm">{fmtNum(sig.entry, 4)}</p>
                      </div>
                      <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-2 text-center">
                        <p className="text-[10px] text-gray-500">✕ STOP</p>
                        <p className="text-rose-300 font-bold text-sm">{fmtNum(sig.stop, 4)}</p>
                      </div>
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2 text-center">
                        <p className="text-[10px] text-gray-500">★ HEDEF</p>
                        <p className="text-emerald-300 font-bold text-sm">{fmtNum(sig.target, 4)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2 flex-wrap text-[11px] text-gray-400">
                      <span className="flex items-center gap-1">
                        <Target className="w-3 h-3" />
                        Skor: <span className="text-white font-bold">{sig.score}</span>
                      </span>
                      {sig.priceDistancePct != null && (
                        <span>
                          Fiyata uzaklık:{' '}
                          <span className={`font-bold ${
                            sig.priceDistancePct < 2 ? 'text-emerald-400'
                            : sig.priceDistancePct < 4 ? 'text-amber-400'
                            : 'text-orange-400'
                          }`}>%{sig.priceDistancePct}</span>
                        </span>
                      )}
                      {sig.daysAgo != null && (
                        <span>Pivot: {sig.daysAgo} gün önce</span>
                      )}
                      {item.lastClose != null && (
                        <span className="ml-auto">
                          Anlık: <span className="text-white font-bold">{fmtNum(item.lastClose, 4)}</span> {meta.unit}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-gray-500 self-start">#{i + 1}</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <p className="text-[10px] text-gray-600 text-center">
        Tüm sinyaller Yahoo Finance günlük verisi (GC=F, SI=F, USDTRY=X) üzerinden Malaysian SNR algoritması
        ile hesaplanır. Yatırım tavsiyesi değildir.
      </p>
    </div>
  )
}
