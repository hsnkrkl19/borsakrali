/**
 * MTF Confluence Summary Widget — Borsa Krali
 *
 * Dashboard ana sayfasında küçük bir özet kart: en güçlü MTF confluence
 * picks (top 5 STRONG_LONG + top 3 STRONG_SHORT). Hızlı bakış için.
 *
 * Tıklanınca /gunluk-tespitler?tab=mtf'e atlar.
 */

import { useEffect, useState } from 'react'
import { Layers, TrendingUp, TrendingDown, RefreshCw, ChevronRight } from 'lucide-react'
import api from '../services/api'

export default function MTFConfluenceSummary({ navigate }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const r = await api.get('/market/crypto/mtf/confluence')
        if (active) setData(r.data)
      } catch (e) {
        if (active) setData({ error: true })
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    // Her 5 dakikada bir yenile
    const i = setInterval(load, 5 * 60 * 1000)
    return () => { active = false; clearInterval(i) }
  }, [])

  if (loading) {
    return (
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Layers className="w-4 h-4 text-gold-400" />
          <span className="text-xs uppercase tracking-wider font-semibold text-gold-400/80">Kripto — Birleşik Görüntü</span>
        </div>
        <div className="flex items-center justify-center py-3">
          <RefreshCw className="w-4 h-4 text-gold-400 animate-spin" />
        </div>
      </div>
    )
  }

  if (data?.error || !data?.all) {
    return null  // sessizce gizle
  }

  const all = data.all || []
  const strongLongs = all.filter(c => c.verdict === 'STRONG_LONG').slice(0, 5)
  const strongShorts = all.filter(c => c.verdict === 'STRONG_SHORT').slice(0, 3)
  const totalStrong = strongLongs.length + strongShorts.length

  if (totalStrong === 0) {
    return (
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-gold-400" />
            <span className="text-xs uppercase tracking-wider font-semibold text-gold-400/80">Kripto — Birleşik Görüntü</span>
          </div>
          <button
            onClick={() => navigate('/gunluk-tespitler?tab=mtf')}
            className="text-[10px] text-gray-400 hover:text-white flex items-center gap-1"
          >
            Detay <ChevronRight className="w-3 h-3" />
          </button>
        </div>
        <p className="text-xs text-gray-500 text-center py-2">Şu an yüksek-güven STRONG sinyali yok.</p>
      </div>
    )
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-gold-400" />
          <span className="text-xs uppercase tracking-wider font-semibold text-gold-400/80">
            Kripto — Birleşik Görüntü
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gold-400/15 text-gold-400 border border-gold-400/30">
            7 vade
          </span>
        </div>
        <button
          onClick={() => navigate('/gunluk-tespitler?tab=mtf')}
          className="text-[10px] text-gray-400 hover:text-white flex items-center gap-1"
        >
          Tümü <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* STRONG LONG */}
        {strongLongs.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-300 font-semibold uppercase tracking-wider">
              <TrendingUp className="w-3 h-3" />
              Güçlü AL ({strongLongs.length})
            </div>
            <div className="space-y-1">
              {strongLongs.map(c => (
                <button
                  key={c.symbol}
                  onClick={() => navigate('/gunluk-tespitler?tab=mtf')}
                  className="w-full flex items-center justify-between gap-2 p-1.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 hover:bg-emerald-500/10 transition-colors text-[11px]"
                  title={`${c.alignedLong}/${c.alignedLong + c.alignedShort} TF aligned, conf %${(c.confidence * 100).toFixed(0)}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {c.image ? (
                      <img src={c.image} alt={c.symbol} className="w-4 h-4 rounded-full"
                        onError={(e) => { e.currentTarget.style.display = 'none' }} />
                    ) : null}
                    <span className="font-mono font-bold text-white">{c.symbol}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-emerald-300 font-mono font-bold">+{c.net?.toFixed(1)}</span>
                    <span className="text-[9px] text-gold-400">%{(c.confidence * 100).toFixed(0)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STRONG SHORT */}
        {strongShorts.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[10px] text-rose-300 font-semibold uppercase tracking-wider">
              <TrendingDown className="w-3 h-3" />
              Güçlü SAT ({strongShorts.length})
            </div>
            <div className="space-y-1">
              {strongShorts.map(c => (
                <button
                  key={c.symbol}
                  onClick={() => navigate('/gunluk-tespitler?tab=mtf')}
                  className="w-full flex items-center justify-between gap-2 p-1.5 rounded-lg bg-rose-500/5 border border-rose-500/20 hover:bg-rose-500/10 transition-colors text-[11px]"
                  title={`${c.alignedShort}/${c.alignedLong + c.alignedShort} TF aligned, conf %${(c.confidence * 100).toFixed(0)}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {c.image ? (
                      <img src={c.image} alt={c.symbol} className="w-4 h-4 rounded-full"
                        onError={(e) => { e.currentTarget.style.display = 'none' }} />
                    ) : null}
                    <span className="font-mono font-bold text-white">{c.symbol}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-rose-300 font-mono font-bold">{c.net?.toFixed(1)}</span>
                    <span className="text-[9px] text-gold-400">%{(c.confidence * 100).toFixed(0)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="text-[10px] text-gray-500 mt-3 pt-2 border-t border-dark-700/50 flex items-center justify-between">
        <span>{data.totalCoins || 0} coin tarandı</span>
        <span>Kısa + uzun vade birlikte değerlendirildi</span>
      </div>
    </div>
  )
}
