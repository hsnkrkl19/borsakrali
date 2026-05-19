import { useState, useEffect } from 'react'
import { AlertTriangle, Layers, Star, Coins, ChevronUp, ChevronDown, RefreshCw } from 'lucide-react'
import api from '../../services/api'
import { formatUsd, TF_LIST, VERDICT_STYLES } from './utils'

/**
 * MTF Confluence görünümü — ağırlıklı 7 TF agregasyonu.
 * Önceden MTFSinyalleri.jsx içinde 240+ satır helper olarak duruyordu.
 *
 * Sub-component'ler:
 *   - ConfluenceView (özet sayaçları + top 20 liste)
 *   - Tally (verdict bazlı sayaç kutucuğu)
 *   - ConfluenceRow (sembol satırı, 7 TF rozetli + expandable)
 *   - CoinDetailExpanded (expand'de 7 TF detayı + entry/stop/target)
 */

export default function ConfluenceView({ data, expandedSymbol, setExpandedSymbol, watchlistOnly, setWatchlistOnly, watchlistSymbols, onOpenDetail }) {
  if (data?.error) {
    return (
      <div className="card p-6 text-center">
        <AlertTriangle className="w-6 h-6 text-red-400 mx-auto mb-2" />
        <p className="text-sm text-red-300">{data.error}</p>
      </div>
    )
  }
  // Watchlist filtresi: aktifse sadece takip listesindeki coin'ler (top 20'den filtre)
  const allList = data?.all || data?.top || []
  const watchlistAvailable = watchlistSymbols && watchlistSymbols.size > 0
  const top = watchlistOnly && watchlistAvailable
    ? allList.filter(c => watchlistSymbols.has((c.symbol || '').toUpperCase()))
    : (data?.top || [])

  if (top.length === 0) {
    return (
      <div className="card p-6 text-center">
        <Layers className="w-6 h-6 text-gray-500 mx-auto mb-2" />
        <p className="text-sm text-gray-400">
          {watchlistOnly
            ? 'Takip listendeki coin\'ler için MTF confluence verisi yok.'
            : 'Henüz yeterli TF taraması yok.'}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          {watchlistOnly ? 'Filtreyi kapatıp tüm coin\'leri görebilirsin.' : 'Önce her TF için scanner\'ı çalıştır.'}
        </p>
      </div>
    )
  }

  return (
    <>
      {/* Watchlist filter toggle */}
      {watchlistAvailable && (
        <div className="card p-2 flex items-center justify-end">
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
            Sadece takipte ({watchlistSymbols.size})
          </button>
        </div>
      )}

      {/* Özet sayaçları */}
      <div className="card p-3 grid grid-cols-3 sm:grid-cols-7 gap-2 text-[10px]">
        <Tally label="GÜÇLÜ AL" value={data.strongLong} cls="text-emerald-300 bg-emerald-500/15" />
        <Tally label="AL" value={data.long} cls="text-emerald-400 bg-emerald-500/10" />
        <Tally label="ZAYIF AL" value={data.all?.filter(c => c.verdict === 'WEAK_LONG').length || 0} cls="text-emerald-200 bg-emerald-500/5" />
        <Tally label="BEKLE" value={data.neutral} cls="text-gray-400 bg-gray-500/10" />
        <Tally label="ZAYIF SAT" value={data.all?.filter(c => c.verdict === 'WEAK_SHORT').length || 0} cls="text-rose-200 bg-rose-500/5" />
        <Tally label="SAT" value={data.short} cls="text-rose-400 bg-rose-500/10" />
        <Tally label="GÜÇLÜ SAT" value={data.strongShort} cls="text-rose-300 bg-rose-500/15" />
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
            onOpenDetail={onOpenDetail}
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

function ConfluenceRow({ c, rank, expanded, onToggle, onOpenDetail }) {
  const verdict = VERDICT_STYLES[c.verdict] || VERDICT_STYLES.NEUTRAL
  return (
    <div className={`card border-2 ${expanded ? 'border-gold-400/40' : 'border-dark-700'} transition-colors`}>
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
            <div className="text-[9px] text-gold-400 mt-0.5">
              %{(c.confidence * 100).toFixed(0)} güven
            </div>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
        </div>
      </div>

      {expanded && (
        <>
          <CoinDetailExpanded symbol={c.symbol} confluence={c} />
          <div className="mt-3 pt-3 border-t border-dark-700/50">
            <button
              onClick={(e) => { e.stopPropagation(); onOpenDetail?.(c.symbol) }}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-gold-400/15 text-gold-400 border border-gold-400/30 hover:bg-gold-400/25 inline-flex items-center gap-1.5"
              title="Tüm 7 TF + AI/Math katmanı modal'da"
            >
              <Layers className="w-3 h-3" />
              Full Detay Modal
            </button>
          </div>
        </>
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
                    <span className="text-amber-400">{sig.leverage_suggest}x</span>
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
