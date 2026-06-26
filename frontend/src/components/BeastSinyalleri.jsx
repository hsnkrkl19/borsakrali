/**
 * BEAST Trend Sinyalleri — Borsa Krali
 *
 * Zero-Lag Trend (AlgoAlpha) + Ichimoku bulutu + Scalper Beast konfluans füzyonu.
 * SADECE altın/gümüş/BTC/ETH × 1h/4h/1d (aktif hücreler). Trend-DEVAMI sistemi:
 * üst-TF hizalama kapısı + 8-katman konfluans notu + dar yapısal ATR stop + 2:1 R/R.
 * Veri: GET /api/beast/signals  ·  şeffaflık: GET /api/beast/backtest.
 */

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, TrendingUp, TrendingDown, Target, Shield, Hash, Clock, Info, Zap, BarChart3, CheckCircle2, XCircle } from 'lucide-react'
import api from '../services/api'

const GRADE_STYLES = {
  MUKEMMEL: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  GUCLU:    'bg-sky-500/20    text-sky-300    border-sky-500/40',
  ORTA:     'bg-amber-500/20  text-amber-300  border-amber-500/40',
  ZAYIF:    'bg-gray-500/20   text-gray-300   border-gray-500/40',
}
const OUTCOME_META = {
  TP2:    { label: 'TP2 (Tam hedef)', cls: 'text-emerald-400', Icon: CheckCircle2 },
  TP1:    { label: 'TP1', cls: 'text-emerald-400', Icon: CheckCircle2 },
  TRAIL:  { label: 'İz-süren kâr', cls: 'text-emerald-400', Icon: CheckCircle2 },
  BE:     { label: 'Başabaş', cls: 'text-gray-300', Icon: Shield },
  SL:     { label: 'Stop', cls: 'text-red-400', Icon: XCircle },
  FLIP:   { label: 'Yön değişti', cls: 'text-amber-400', Icon: RefreshCw },
  EXPIRE: { label: 'Süre doldu', cls: 'text-gray-400', Icon: Clock },
}

function fmt(v, p = 2) { return v == null ? '—' : Number(v).toLocaleString('tr-TR', { minimumFractionDigits: p, maximumFractionDigits: p }) }
function rel(iso) {
  if (!iso) return ''
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 90) return 'az önce'
  if (s < 3600) return `${Math.round(s / 60)} dk önce`
  if (s < 86400) return `${Math.round(s / 3600)} sa önce`
  return `${Math.round(s / 86400)} gün önce`
}

function PositionCard({ p }) {
  const isLong = p.direction === 'long'
  const edge = p.edge
  return (
    <div className={`rounded-xl border p-3.5 ${isLong ? 'border-emerald-500/30' : 'border-red-500/30'} bg-gray-800/40`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {p.code && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-700/60 text-gray-200 text-xs font-bold">
              <Hash className="w-3 h-3" />{p.code}
            </span>
          )}
          <span className="font-bold">{p.short}</span>
          <span className="text-[10px] text-gray-400 font-mono">{p.tf}</span>
          <span className={`text-[10px] uppercase tracking-wide font-semibold flex items-center gap-0.5 ${isLong ? 'text-emerald-400' : 'text-red-400'}`}>
            {isLong ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}{isLong ? 'LONG' : 'SHORT'}
          </span>
        </div>
        <span className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold ${GRADE_STYLES[p.grade] || GRADE_STYLES.ZAYIF}`}>
          {p.confidence}/100{p.grade ? ` · ${p.grade}` : ''}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-gray-500">Giriş</div>
          <div className="font-semibold">{fmt(p.entry, p.precision)}</div>
        </div>
        <div>
          <div className="text-gray-500 flex items-center gap-1"><Shield className="w-3 h-3" />Stop</div>
          <div className="font-semibold text-red-300">{fmt(p.stop, p.precision)}{p.slPct ? ` (-${p.slPct}%)` : ''}</div>
        </div>
        <div>
          <div className="text-gray-500 flex items-center gap-1"><Target className="w-3 h-3" />TP1</div>
          <div className="font-semibold text-emerald-300">{fmt(p.target1, p.precision)}{p.tp1Pct ? ` (+${p.tp1Pct}%)` : ''}</div>
        </div>
      </div>
      <div className="flex items-center justify-between mt-2 text-[11px] text-gray-500 flex-wrap gap-y-1">
        <span>TP2 {fmt(p.target2, p.precision)} · R/R {p.rr1 ?? '—'}{p.trigger ? ` · tetik: ${p.trigger}` : ''}</span>
        {edge && edge.pf != null && (
          <span className="text-gray-400">📊 PF {edge.pf} · isabet %{edge.winRate}</span>
        )}
      </div>
      {p.issuedAt && <div className="text-[10px] text-gray-600 mt-1">{rel(p.issuedAt)}</div>}
    </div>
  )
}

export default function BeastSinyalleri() {
  const [data, setData] = useState(null)
  const [bt, setBt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      const [r, b] = await Promise.all([
        api.get('/beast/signals'),
        bt ? Promise.resolve({ data: { ...bt, success: true } }) : api.get('/beast/backtest'),
      ])
      if (r.data?.success) { setData(r.data); setError(null) } else setError(r.data?.error || 'Yüklenemedi')
      if (b.data?.success) setBt(b.data)
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    } finally { setLoading(false); setRefreshing(false) }
  }, [bt])

  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [load])

  const live = data?.signals || []
  const open = data?.open || []
  const closed = data?.closedRecent || []
  // Canlı sinyallerden, zaten açık pozisyona dönüşmüş olanları ayıkla
  const liveOnly = live.filter(s => !open.some(o => o.id === s.id && o.tf === s.tf && o.direction === s.direction))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg md:text-xl font-bold flex items-center gap-2">
            <Zap className="w-5 h-5 text-emerald-400" /> 🔱 BEAST Trend
          </h2>
          <p className="text-xs md:text-sm text-gray-400 mt-1 max-w-2xl">
            Zero-Lag Trend + Ichimoku bulutu + Scalper Beast konfluans füzyonu. <b className="text-gray-300">Sadece altın · gümüş · BTC · ETH</b> ·
            <b> yalnız günlük (1d)</b> — en yüksek isabet için (gürültülü 1h/4h kaldırıldı). Trend-<b>devamı</b> sistemi:
            haftalık trend kapısı + parite başına tek yön (çelişki yok) + dar yapısal stop. Az ama yüksek-isabetli sinyal.
          </p>
        </div>
        <button onClick={() => { setRefreshing(true); load() }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/30 transition-colors text-sm">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Yenile
        </button>
      </div>

      {/* Backtest güvenilirlik bandı */}
      {bt && (
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3 text-xs text-gray-300 flex items-start gap-2">
          <BarChart3 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
          <div>
            <b className="text-emerald-300">Backtest (günlük/1d havuz, ~2 yıl):</b>
            <b> isabet %65, PF 2.40, +0.46R/işlem</b>. En güçlü: ETH 1d %73, Ons Altın 1d %90.
            Az ama net (~ayda 1-3 sinyal). Not: trend sistemi — her sinyal tutmaz, kazançlar kayıplardan büyük olur.
            <span className="text-gray-500"> Push {data?.pushEnabled ? 'açık' : 'kapalı (doğrulama modu)'} · eşik {data?.pushConfidence}.</span>
          </div>
        </div>
      )}

      {loading && <div className="text-center py-10 text-gray-400">Yükleniyor…</div>}
      {error && !loading && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300 flex items-center gap-2">
          <Info className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Açık (takip edilen, numaralı) pozisyonlar */}
      {!loading && (
        <section>
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Açık Sinyaller ({open.length})</h3>
          {open.length === 0 ? (
            <div className="rounded-lg border border-gray-700 bg-gray-800/30 p-4 text-sm text-gray-400">
              Şu an takip edilen açık BEAST sinyali yok. Trend-devamı kurulumu oluştuğunda numaralandırılıp burada görünür.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {open.map((p) => <PositionCard key={p.code} p={p} />)}
            </div>
          )}
        </section>
      )}

      {/* Şu anki canlı kurulumlar (henüz pozisyon değil / eşik altı dahil) */}
      {!loading && liveOnly.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Şu Anki Kurulumlar</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {liveOnly.map((s) => <PositionCard key={`${s.id}-${s.tf}`} p={s} />)}
          </div>
        </section>
      )}

      {/* Son kapananlar */}
      {!loading && closed.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Son Kapananlar</h3>
          <div className="space-y-1.5">
            {closed.map((c, i) => {
              const meta = OUTCOME_META[c.outcome] || OUTCOME_META.EXPIRE
              const Icon = meta.Icon
              return (
                <div key={`${c.code}-${i}`} className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800/30 px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-300 font-bold"><Hash className="w-3 h-3" />{c.code}</span>
                    <span className="font-semibold">{c.short}</span>
                    <span className="text-[10px] text-gray-500 font-mono">{c.tf}</span>
                    <span className={`text-[10px] uppercase ${c.direction === 'long' ? 'text-emerald-400' : 'text-red-400'}`}>{c.direction}</span>
                    <span className={`flex items-center gap-1 ${meta.cls}`}><Icon className="w-3.5 h-3.5" />{meta.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500">{fmt(c.entry, c.precision)} → {fmt(c.exit, c.precision)}</span>
                    <span className={c.pnlPct >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                      {c.pnlPct >= 0 ? '+' : ''}{c.pnlPct}%
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
