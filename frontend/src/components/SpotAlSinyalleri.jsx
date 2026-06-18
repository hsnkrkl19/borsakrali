/**
 * Spot Al Sinyalleri (≥75 LONG) — Borsa Krali
 *
 * TÜM BIST (510) tüm analiz teknikleriyle 0-100 puanlanır; LONG (spot al) +
 * güven ≥ 75 olanlardan en iyi 10'u NUMARALI sinyal olarak Telegram + uygulama
 * bildirimiyle gider. Bu sayfa o numaralı açık sinyalleri, son kapananları
 * (TP/SL/süre) ve son taramayı gösterir. Veri: GET /api/bist-signals.
 */

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, TrendingUp, Target, Shield, CheckCircle2, XCircle, Clock, Hash, Info } from 'lucide-react'
import api from '../services/api'

const GRADE_STYLES = {
  MUKEMMEL: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  GUCLU:    'bg-sky-500/20    text-sky-300    border-sky-500/40',
  ORTA:     'bg-amber-500/20  text-amber-300  border-amber-500/40',
  ZAYIF:    'bg-gray-500/20   text-gray-300   border-gray-500/40',
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

const OUTCOME_META = {
  TP1:    { label: 'TP (Hedef)', cls: 'text-emerald-400', Icon: CheckCircle2 },
  SL:     { label: 'Stop',       cls: 'text-red-400',     Icon: XCircle },
  EXPIRE: { label: 'Süre doldu', cls: 'text-gray-400',    Icon: Clock },
}

export default function SpotAlSinyalleri() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      const r = await api.get('/bist-signals')
      if (r.data?.success) { setData(r.data); setError(null) }
      else setError(r.data?.error || 'Sinyaller yüklenemedi')
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    } finally {
      setLoading(false); setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 60000) // 1 dk
    return () => clearInterval(t)
  }, [load])

  const open = data?.open || []
  const closed = data?.closedRecent || []
  const scan = data?.lastScan
  const minConf = data?.minConfidence ?? 75
  const preview = (scan?.top || []).filter(s => !open.some(o => o.symbol === s.symbol))

  return (
    <div className="space-y-5">
      {/* Başlık */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg md:text-xl font-bold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            Spot Al Sinyalleri <span className="text-emerald-400">(≥{minConf})</span>
          </h2>
          <p className="text-xs md:text-sm text-gray-400 mt-1">
            Tüm BIST {scan?.scanned ? `(${scan.scanned} hisse)` : ''} tüm analiz teknikleriyle 0-100 puanlanır.
            LONG + güven ≥{minConf} → numaralı sinyal · Telegram + uygulama bildirimi · TP/SL olunca aynı no ile teyit.
          </p>
        </div>
        <button
          onClick={() => { setRefreshing(true); load() }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/30 transition-colors text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Yenile
        </button>
      </div>

      {scan?.generatedAt && (
        <p className="text-[11px] text-gray-500 flex items-center gap-1.5">
          <Clock className="w-3 h-3" /> Son tarama {rel(scan.generatedAt)} · ≥{minConf} alan {scan.qualified ?? 0} hisse
        </p>
      )}

      {loading && <div className="text-center py-10 text-gray-400">Sinyaller yükleniyor…</div>}
      {error && !loading && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300 flex items-center gap-2">
          <Info className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Açık (numaralı) sinyaller */}
      {!loading && (
        <section>
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Açık Sinyaller ({open.length})</h3>
          {open.length === 0 ? (
            <div className="rounded-lg border border-gray-700 bg-gray-800/30 p-4 text-sm text-gray-400">
              Şu an takip edilen açık sinyal yok. Yeni ≥{minConf} LONG sinyali oluştuğunda numaralandırılıp burada + bildirim olarak görünür.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {open.map((p) => (
                <div key={p.code} className="rounded-xl border border-emerald-500/30 bg-gray-800/40 p-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-600/30 text-emerald-200 text-xs font-bold">
                        <Hash className="w-3 h-3" />{p.code}
                      </span>
                      <span className="font-bold">{p.symbol}</span>
                      <span className="text-[10px] uppercase tracking-wide text-emerald-400 font-semibold">LONG</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold ${GRADE_STYLES[p.grade] || GRADE_STYLES.ZAYIF}`}>
                      {p.confidence}/100 {p.grade ? `· ${p.grade}` : ''}
                    </span>
                  </div>
                  {p.name && p.name !== p.symbol && <p className="text-[11px] text-gray-500 mb-2 truncate">{p.name}</p>}
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-gray-500">Giriş</div>
                      <div className="font-semibold">{fmt(p.entry)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 flex items-center gap-1"><Shield className="w-3 h-3" />Stop</div>
                      <div className="font-semibold text-red-300">{fmt(p.stop)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 flex items-center gap-1"><Target className="w-3 h-3" />TP1</div>
                      <div className="font-semibold text-emerald-300">{fmt(p.target1)}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 text-[11px] text-gray-500">
                    <span>TP2 {fmt(p.target2)} · R/R {p.rr1 ?? '—'}</span>
                    <span>{rel(p.issuedAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Son tarama önizleme (henüz pozisyona dönüşmemiş ≥eşik adaylar) */}
      {!loading && preview.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Son Taramada ≥{minConf} Alanlar</h3>
          <div className="flex flex-wrap gap-2">
            {preview.map((s) => (
              <span key={s.symbol} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-emerald-500/25 bg-gray-800/40 text-xs">
                <span className="font-semibold">{s.symbol}</span>
                <span className="text-emerald-400">{s.confidence}</span>
                <span className="text-gray-500">· {fmt(s.entry)}</span>
              </span>
            ))}
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
                    <span className="font-semibold">{c.symbol}</span>
                    <span className={`flex items-center gap-1 ${meta.cls}`}><Icon className="w-3.5 h-3.5" />{meta.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500">{fmt(c.entry)} → {fmt(c.exit)}</span>
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
