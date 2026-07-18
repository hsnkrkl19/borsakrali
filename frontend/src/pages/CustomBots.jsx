/**
 * CustomBots.jsx — Kullanıcı-tanımlı botlar (Bot Oluştur / Botlarım)
 *
 * /botlar?tab=custom sekmesinde yaşar. Üç görünüm:
 *   list    — oluşturulmuş botların kartları + "Yeni Bot"
 *   builder — bot oluşturma/düzenleme sihirbazı (strateji + parametre + evren +
 *             risk (SL/TP) + pozisyon ayarları)
 *   detail  — tek botun paneli (Genel Bakış / Açık Pozisyonlar / İşlem Geçmişi /
 *             Ayarlar) + İŞLEMLERE MÜDAHALE: elle pozisyon aç / kapat / SL-TP
 *             düzenle. Açma 10:15'ten önce, kapatma 18:00'den sonra engellidir
 *             (BIST işlem saatleri) — sunucu da bunu zorlar.
 *
 * Global model: botlar tüm ziyaretçilere ortaktır (mevcut hazır botlar gibi).
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Wrench, Plus, RefreshCw, TrendingUp, ListChecks, History, Settings,
  ArrowLeft, Trash2, Pause, Play, Pencil, Search, X, Check, AlertTriangle,
  Clock, Lock, Activity, Award, Target, Bot, Layers, Sparkles, ChevronDown, ChevronUp,
  Rewind, BarChart3, Gauge, TrendingDown, Hourglass, Scale, Percent, Trophy,
} from 'lucide-react'
import api from '../services/api'
import { Button, Card, EmptyState, Spinner } from '../components/ui'
import {
  fmtMoney, fmtPct, fmtDate,
  TabHeader, BotTabs, StatCard, Chip, TableShell, HowItWorks, NotesList,
  EquityChart, TradeLedger, exitOutcome,
} from '../components/BotKit'

// ── Sabitler ─────────────────────────────────────────────────────────────────
const STOP_TYPE_OPTS = [
  { v: 'atr', label: 'ATR çarpanı', vlabel: 'Çarpan (×ATR)', hint: 'Giriş − çarpan × ATR' },
  { v: 'percent', label: 'Yüzde (%)', vlabel: 'Yüzde %', hint: 'Giriş × (1 − %/100)' },
  { v: 'none', label: 'Yok', vlabel: '', hint: 'Stop yok (yalnız strateji/süre çıkışı)' },
]
const TARGET_TYPE_OPTS = [
  { v: 'rr', label: 'Risk katı (R)', vlabel: 'R katı', hint: 'Giriş + R × (giriş − stop)' },
  { v: 'percent', label: 'Yüzde (%)', vlabel: 'Yüzde %', hint: 'Giriş × (1 + %/100)' },
  { v: 'atr', label: 'ATR çarpanı', vlabel: 'Çarpan (×ATR)', hint: 'Giriş + çarpan × ATR' },
  { v: 'none', label: 'Yok', vlabel: '', hint: 'Hedef yok' },
]

const DEFAULT_FORM = {
  name: '', description: '', strategyId: 'ema_cross', params: {},
  universe: [],
  risk: { stopType: 'atr', stopValue: 2, targetType: 'rr', targetValue: 2, trailing: true, timeoutDays: 15 },
  sizing: { positionPct: 10, maxPositions: 10, capital: 100000 },
  commissionPct: 0.2, slippagePct: 0.1,
}

// Kapanmış işlemi TradeLedger şekline çevir
function toLedgerTrade(t) {
  return {
    id: t.id, symbol: t.symbol,
    outcome: exitOutcome(t.exitReason, t.realizedPnL),
    buyAt: t.entryDate, sellAt: t.exitDate,
    buyText: `${fmtMoney(t.entryPrice)} ₺`, sellText: `${fmtMoney(t.exitPrice)} ₺`,
    pnlText: fmtPct(t.realizedPnLPct), pnlSubText: `${fmtMoney(t.realizedPnL)} ₺`,
    win: (t.realizedPnL || 0) >= 0, _src: t,
  }
}

// ── Küçük form alanları ──────────────────────────────────────────────────────
function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</span>
      {children}
      {hint && <span className="text-[10.5px] leading-snug text-gray-500">{hint}</span>}
    </label>
  )
}
function NumInput(props) {
  return <input type="number" inputMode="decimal" className="input text-sm" {...props} />
}

// ═══════════════════════════════════════════════════════════════════════════
//  EVREN SEÇİCİ
// ═══════════════════════════════════════════════════════════════════════════
function UniversePicker({ stocks, selected, onChange, max }) {
  const [q, setQ] = useState('')
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const query = q.trim().toUpperCase()
  const filtered = useMemo(() => {
    const base = query
      ? stocks.filter(s => s.symbol.includes(query) || (s.name || '').toUpperCase().includes(query))
      : stocks
    return base.slice(0, 120)
  }, [stocks, query])

  const toggle = (sym) => {
    if (selectedSet.has(sym)) onChange(selected.filter(s => s !== sym))
    else {
      if (selected.length >= max) return
      onChange([...selected, sym])
    }
  }
  const preset = (syms) => onChange([...new Set(syms)].slice(0, max))
  const bist30 = stocks.filter(s => s.market === 'BIST30').map(s => s.symbol)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => preset(bist30)}>BIST30</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => preset(stocks.slice(0, max).map(s => s.symbol))}>İlk {max}</Button>
        <Button type="button" variant="ghost" size="sm" icon={X} onClick={() => onChange([])}>Temizle</Button>
        <span className="ml-auto text-xs font-semibold text-gray-400">{selected.length}/{max} seçili</span>
      </div>

      {selected.length > 0 && (
        <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto rounded-lg border border-dark-700 bg-dark-800/40 p-2">
          {selected.map(sym => (
            <button key={sym} type="button" onClick={() => toggle(sym)}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/25">
              {sym} <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hisse ara (THYAO, banka…)"
          className="input w-full pl-8 text-sm" />
      </div>

      <div className="grid max-h-56 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-dark-700 p-1.5 sm:grid-cols-3">
        {filtered.map(s => {
          const on = selectedSet.has(s.symbol)
          const full = !on && selected.length >= max
          return (
            <button key={s.symbol} type="button" onClick={() => toggle(s.symbol)} disabled={full}
              title={s.name}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                on ? 'bg-emerald-500/15 text-emerald-200' : full ? 'cursor-not-allowed text-gray-600' : 'text-gray-300 hover:bg-white/5'
              }`}>
              <span className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border ${on ? 'border-emerald-400 bg-emerald-500/30' : 'border-gray-600'}`}>
                {on && <Check className="h-2.5 w-2.5 text-emerald-300" />}
              </span>
              <span className="truncate font-medium">{s.symbol}</span>
            </button>
          )
        })}
        {filtered.length === 0 && <div className="col-span-full py-4 text-center text-xs text-gray-500">Eşleşen hisse yok.</div>}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  BOT OLUŞTURMA / DÜZENLEME SİHİRBAZI
// ═══════════════════════════════════════════════════════════════════════════
function BotBuilder({ meta, editBot, onCancel, onSaved }) {
  const strategies = meta?.strategies || []
  const stocks = meta?.universe || []
  const limits = meta?.limits || { MAX_UNIVERSE: 80 }

  const [form, setForm] = useState(() => {
    if (editBot) {
      return {
        name: editBot.name, description: editBot.description || '',
        strategyId: editBot.strategyId, params: { ...editBot.params },
        universe: [...editBot.universe],
        risk: { ...DEFAULT_FORM.risk, ...editBot.risk },
        sizing: { ...editBot.sizing },
        commissionPct: editBot.commissionPct ?? 0.2, slippagePct: editBot.slippagePct ?? 0.1,
      }
    }
    const first = strategies[0]
    return { ...DEFAULT_FORM, strategyId: first?.id || 'ema_cross', params: { ...(first?.defaultParams || {}) } }
  })
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState([])

  const strategy = useMemo(() => strategies.find(s => s.id === form.strategyId), [strategies, form.strategyId])

  const set = (patch) => setForm(f => ({ ...f, ...patch }))
  const setRisk = (patch) => setForm(f => ({ ...f, risk: { ...f.risk, ...patch } }))
  const setSizing = (patch) => setForm(f => ({ ...f, sizing: { ...f.sizing, ...patch } }))

  const onStrategy = (id) => {
    const s = strategies.find(x => x.id === id)
    set({ strategyId: id, params: { ...(s?.defaultParams || {}) } })
  }

  const stopOpt = STOP_TYPE_OPTS.find(o => o.v === form.risk.stopType)
  const targetOpt = TARGET_TYPE_OPTS.find(o => o.v === form.risk.targetType)

  const submit = async () => {
    setErrors([])
    // Hızlı istemci-tarafı kontrol (sunucu yine doğrular)
    const localErr = []
    if (!form.name.trim()) localErr.push('Bot adı zorunlu.')
    if (form.universe.length < 1) localErr.push('En az 1 hisse seçilmeli.')
    if (localErr.length) { setErrors(localErr); return }

    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(), description: form.description.trim(),
        strategyId: form.strategyId, params: form.params,
        universe: form.universe, risk: form.risk, sizing: form.sizing,
        commissionPct: form.commissionPct, slippagePct: form.slippagePct,
      }
      const { data } = editBot
        ? await api.put(`/custom-bots/${editBot.id}`, payload)
        : await api.post('/custom-bots', payload)
      if (data?.ok) onSaved(data.bot)
    } catch (e) {
      const errs = e?.response?.data?.errors
      setErrors(Array.isArray(errs) && errs.length ? errs : [e?.response?.data?.error || 'Kaydedilemedi.'])
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={onCancel}>Geri</Button>
        <h2 className="text-base font-semibold text-white">{editBot ? 'Botu Düzenle' : 'Yeni Bot Oluştur'}</h2>
      </div>

      {errors.length > 0 && (
        <Card tone="ember" padding="sm" className="space-y-1">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-rose-300">
            <AlertTriangle className="h-4 w-4" /> Düzeltilmesi gerekenler
          </div>
          <ul className="list-inside list-disc text-xs text-rose-200/90">
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </Card>
      )}

      {/* 1) Temel */}
      <Card className="space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-gold-300">1 · Temel bilgiler</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Bot adı" className="sm:col-span-2">
            <input value={form.name} maxLength={60} onChange={(e) => set({ name: e.target.value })}
              placeholder="Örn. Bankacılık EMA Avcısı" className="input text-sm" />
          </Field>
          <Field label="Açıklama (opsiyonel)" className="sm:col-span-2">
            <input value={form.description} maxLength={280} onChange={(e) => set({ description: e.target.value })}
              placeholder="Bu botun amacı / mantığı" className="input text-sm" />
          </Field>
        </div>
      </Card>

      {/* 2) Strateji + parametreler */}
      <Card className="space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-gold-300">2 · Strateji (taktik)</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {strategies.map(s => {
            const on = form.strategyId === s.id
            return (
              <button key={s.id} type="button" onClick={() => onStrategy(s.id)}
                className="flex flex-col gap-1 rounded-xl border p-3 text-left transition-all"
                style={{ borderColor: on ? 'var(--gold-400)' : 'var(--border-subtle)', background: on ? 'var(--bg-elevated)' : 'transparent' }}>
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" style={{ color: on ? 'var(--gold-400)' : 'var(--text-muted)' }} />
                  <span className={`text-sm font-semibold ${on ? 'text-white' : 'text-gray-300'}`}>{s.label}</span>
                </div>
                <span className="text-[11px] leading-snug text-gray-500">{s.desc}</span>
              </button>
            )
          })}
        </div>

        {strategy && (
          <div className="rounded-lg border border-dark-700 bg-dark-800/30 p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Parametreler</div>
            <div className="grid gap-3 sm:grid-cols-3">
              {strategy.params.map(p => (
                <Field key={p.key} label={p.label} hint={p.hint}>
                  <NumInput value={form.params[p.key] ?? p.default} min={p.min} max={p.max} step={p.step || 1}
                    onChange={(e) => set({ params: { ...form.params, [p.key]: e.target.value === '' ? '' : Number(e.target.value) } })} />
                </Field>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* 3) Hisse evreni */}
      <Card className="space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-gold-300">3 · Hisse evreni</div>
        <p className="text-xs text-gray-500">Bot bu hisseleri her gün tarayacak. En fazla {limits.MAX_UNIVERSE} hisse.</p>
        <UniversePicker stocks={stocks} selected={form.universe} onChange={(u) => set({ universe: u })} max={limits.MAX_UNIVERSE} />
      </Card>

      {/* 4) Risk: Stop / TP */}
      <Card className="space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-gold-300">4 · Stop-Loss / Take-Profit</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 rounded-lg border border-dark-700 p-3">
            <Field label="Stop tipi" hint={stopOpt?.hint}>
              <select value={form.risk.stopType} onChange={(e) => setRisk({ stopType: e.target.value })} className="input text-sm">
                {STOP_TYPE_OPTS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
              </select>
            </Field>
            {form.risk.stopType !== 'none' && (
              <Field label={stopOpt?.vlabel || 'Değer'}>
                <NumInput value={form.risk.stopValue} min={0.1} step={0.1} onChange={(e) => setRisk({ stopValue: Number(e.target.value) })} />
              </Field>
            )}
          </div>
          <div className="space-y-2 rounded-lg border border-dark-700 p-3">
            <Field label="Hedef tipi" hint={targetOpt?.hint}>
              <select value={form.risk.targetType} onChange={(e) => setRisk({ targetType: e.target.value })} className="input text-sm">
                {TARGET_TYPE_OPTS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
              </select>
            </Field>
            {form.risk.targetType !== 'none' && (
              <Field label={targetOpt?.vlabel || 'Değer'}>
                <NumInput value={form.risk.targetValue} min={0.1} step={0.1} onChange={(e) => setRisk({ targetValue: Number(e.target.value) })} />
              </Field>
            )}
          </div>
        </div>
        {form.risk.targetType === 'rr' && form.risk.stopType === 'none' && (
          <p className="text-[11px] text-amber-300">R-katı hedef için bir stop tanımlamalısın.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={form.risk.trailing} disabled={form.risk.stopType === 'none'}
              onChange={(e) => setRisk({ trailing: e.target.checked })} className="h-4 w-4 accent-emerald-500" />
            İz süren stop (trailing) — kâr büyüdükçe stop yukarı çekilir
          </label>
          <Field label="Zaman aşımı (işgünü, 0 = yok)">
            <NumInput value={form.risk.timeoutDays} min={0} max={250} step={1} onChange={(e) => setRisk({ timeoutDays: Number(e.target.value) })} />
          </Field>
        </div>
      </Card>

      {/* 5) Pozisyon ayarları */}
      <Card className="space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-gold-300">5 · Pozisyon ayarları</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Pozisyon büyüklüğü (% nakit)" hint="Her alımda nakdin bu yüzdesi">
            <NumInput value={form.sizing.positionPct} min={0.5} max={50} step={0.5} onChange={(e) => setSizing({ positionPct: Number(e.target.value) })} />
          </Field>
          <Field label="Maks. eşzamanlı pozisyon">
            <NumInput value={form.sizing.maxPositions} min={1} max={50} step={1} onChange={(e) => setSizing({ maxPositions: Number(e.target.value) })} />
          </Field>
          <Field label="Başlangıç sermayesi (TL)" hint={editBot ? 'Oluşturulduktan sonra değişmez' : 'Sanal sermaye'}>
            <NumInput value={form.sizing.capital} min={1000} step={1000} disabled={!!editBot} onChange={(e) => setSizing({ capital: Number(e.target.value) })} />
          </Field>
        </div>

        <button type="button" onClick={() => setShowAdvanced(s => !s)} className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-300">
          {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />} Gelişmiş
        </button>
        {showAdvanced && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Komisyon (%)" hint="Alış+satış ayrı uygulanır">
              <NumInput value={form.commissionPct} min={0} max={1} step={0.01} onChange={(e) => set({ commissionPct: Number(e.target.value) })} />
            </Field>
            <Field label="Kayma / slippage (%)">
              <NumInput value={form.slippagePct} min={0} max={1} step={0.01} onChange={(e) => set({ slippagePct: Number(e.target.value) })} />
            </Field>
          </div>
        )}
      </Card>

      <div className="flex items-center justify-end gap-2 pb-2">
        <Button variant="ghost" onClick={onCancel}>Vazgeç</Button>
        <Button icon={Check} loading={saving} onClick={submit}>{editBot ? 'Değişiklikleri kaydet' : 'Botu oluştur'}</Button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  PİYASA SAATİ BANNER
// ═══════════════════════════════════════════════════════════════════════════
function MarketHoursBanner({ window: w }) {
  if (!w) return null
  const open = w.canOpen && w.canClose
  return (
    <Card padding="sm" tone={open ? 'jade' : 'neutral'}>
      <div className="flex items-center gap-2 text-xs">
        {open ? <Clock className="h-4 w-4 text-emerald-400" /> : <Lock className="h-4 w-4 text-gray-400" />}
        <span className={open ? 'text-emerald-200' : 'text-gray-400'}>
          {open
            ? <>Borsa açık (TR {w.timeTR}) — elle işlem yapılabilir. Açma {w.openLabel}'ten itibaren, kapatma {w.closeLabel}'e kadar.</>
            : <>Borsa kapalı (TR {w.timeTR}). {w.openReason || w.closeReason || 'İşlem saatleri dışında elle müdahale yapılamaz.'}</>}
        </span>
      </div>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  AÇIK POZİSYON SATIRI + MÜDAHALE
// ═══════════════════════════════════════════════════════════════════════════
function PositionRow({ pos, window: w, onClose, onAdjust, busy }) {
  const [expanded, setExpanded] = useState(false)
  const [mode, setMode] = useState(null) // 'close' | 'adjust' | null
  const [stop, setStop] = useState(pos.currentStop ?? '')
  const [target, setTarget] = useState(pos.currentTarget ?? '')
  const last = pos.lastPrice ?? pos.entryPrice
  const pnlPct = pos.entryPrice ? ((last - pos.entryPrice) / pos.entryPrice) * 100 : 0

  return (
    <>
      <tr className="border-t border-dark-700/60">
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-white">{pos.symbol}</span>
            {pos.source === 'manual' && <Chip tone="info">Elle</Chip>}
          </div>
          {pos.name && <div className="text-[10px] text-gray-500">{pos.name}</div>}
        </td>
        <td className="px-3 py-2.5 text-right text-gray-300">{fmtMoney(pos.entryPrice)}</td>
        <td className="px-3 py-2.5 text-right font-semibold text-white">{fmtMoney(last)}</td>
        <td className="px-3 py-2.5 text-right text-rose-300">{pos.currentStop != null ? fmtMoney(pos.currentStop) : '—'}</td>
        <td className="px-3 py-2.5 text-right text-emerald-300">{pos.currentTarget != null ? fmtMoney(pos.currentTarget) : '—'}</td>
        <td className={`px-3 py-2.5 text-right font-semibold ${pnlPct >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{fmtPct(pnlPct)}</td>
        <td className="px-3 py-2.5">
          <div className="flex items-center justify-end gap-1">
            <button title="SL/TP düzenle" onClick={() => { setMode(mode === 'adjust' ? null : 'adjust'); setStop(pos.currentStop ?? ''); setTarget(pos.currentTarget ?? '') }}
              className="rounded p-1 text-gray-400 hover:bg-white/5 hover:text-white"><Pencil className="h-3.5 w-3.5" /></button>
            <button title={w?.canClose ? 'Pozisyonu kapat' : (w?.closeReason || 'İşlem saati dışı')}
              disabled={!w?.canClose || busy} onClick={() => setMode(mode === 'close' ? null : 'close')}
              className="rounded px-1.5 py-1 text-[11px] font-semibold text-rose-300 enabled:hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:text-gray-600">
              Kapat
            </button>
            <button onClick={() => setExpanded(e => !e)} className="rounded p-1 text-gray-400 hover:bg-white/5">
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </td>
      </tr>

      {mode === 'close' && (
        <tr className="bg-rose-500/[0.04]">
          <td colSpan={7} className="px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-rose-200">{pos.symbol} pozisyonunu {fmtMoney(last)} ₺ civarı piyasa fiyatından kapatmak istiyor musun?</span>
              <Button variant="danger" size="sm" loading={busy} onClick={() => onClose(pos, () => setMode(null))}>Evet, kapat</Button>
              <Button variant="ghost" size="sm" onClick={() => setMode(null)}>Vazgeç</Button>
            </div>
          </td>
        </tr>
      )}

      {mode === 'adjust' && (
        <tr className="bg-white/[0.02]">
          <td colSpan={7} className="px-3 py-2.5">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Yeni stop (boş = kaldır)">
                <NumInput value={stop} step={0.01} className="input w-28 text-sm" onChange={(e) => setStop(e.target.value)} />
              </Field>
              <Field label="Yeni hedef (boş = kaldır)">
                <NumInput value={target} step={0.01} className="input w-28 text-sm" onChange={(e) => setTarget(e.target.value)} />
              </Field>
              <Button size="sm" icon={Check} loading={busy}
                onClick={() => onAdjust(pos, {
                  stop: stop === '' ? null : Number(stop),
                  target: target === '' ? null : Number(target),
                }, () => setMode(null))}>Kaydet</Button>
              <Button variant="ghost" size="sm" onClick={() => setMode(null)}>Vazgeç</Button>
            </div>
            <p className="mt-1 text-[10.5px] text-gray-500">Güncel fiyat {fmtMoney(last)} ₺ — stop bunun altında, hedef üstünde olmalı.</p>
          </td>
        </tr>
      )}

      {expanded && (
        <tr className="bg-white/[0.02]">
          <td colSpan={7} className="px-3 py-3">
            <NotesList notes={pos.notes || []} />
          </td>
        </tr>
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  ELLE POZİSYON AÇMA FORMU
// ═══════════════════════════════════════════════════════════════════════════
function ManualOpenForm({ bot, stocks, window: w, onOpen, busy }) {
  const [open, setOpen] = useState(false)
  const [symbol, setSymbol] = useState('')
  const [sizeTL, setSizeTL] = useState('')
  const [stop, setStop] = useState('')
  const [target, setTarget] = useState('')
  const [adv, setAdv] = useState(false)

  const submit = () => {
    onOpen({
      symbol: symbol.toUpperCase().trim(),
      sizeTL: sizeTL === '' ? undefined : Number(sizeTL),
      stop: stop === '' ? undefined : Number(stop),
      target: target === '' ? undefined : Number(target),
    }, () => { setSymbol(''); setSizeTL(''); setStop(''); setTarget(''); setOpen(false) })
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" icon={Plus} disabled={!w?.canOpen}
        title={w?.canOpen ? 'Elle pozisyon aç' : (w?.openReason || 'İşlem saati dışı')}
        onClick={() => setOpen(true)}>
        Elle pozisyon aç
      </Button>
    )
  }

  return (
    <Card padding="sm" className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gold-300">Elle pozisyon aç</span>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Hisse">
          <input list="bk-universe-list" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="THYAO" className="input text-sm" />
          <datalist id="bk-universe-list">
            {stocks.map(s => <option key={s.symbol} value={s.symbol}>{s.name}</option>)}
          </datalist>
        </Field>
        <Field label="Tutar (TL, boş = varsayılan)" hint={`Varsayılan: nakdin %${bot.sizing.positionPct}'i`}>
          <NumInput value={sizeTL} min={0} step={100} onChange={(e) => setSizeTL(e.target.value)} />
        </Field>
      </div>

      <button type="button" onClick={() => setAdv(a => !a)} className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-300">
        {adv ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />} Stop / Hedef (opsiyonel — boşsa bot kuralları uygulanır)
      </button>
      {adv && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Stop (TL)"><NumInput value={stop} step={0.01} onChange={(e) => setStop(e.target.value)} /></Field>
          <Field label="Hedef (TL)"><NumInput value={target} step={0.01} onChange={(e) => setTarget(e.target.value)} /></Field>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Vazgeç</Button>
        <Button size="sm" icon={Check} loading={busy} disabled={!symbol.trim() || !w?.canOpen} onClick={submit}>Pozisyonu aç (piyasa)</Button>
      </div>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  GERİYE TEST (BACKTEST) PANELİ
//  Botun TANIMINI (strateji + parametre + risk + sizing) geçmiş mumlar üzerinde
//  yeniden oynatır. Backend, canlı motorun AYNI strateji/risk/para modüllerini
//  kullanır → yeşil backtest ile canlı bot tutarlıdır.
// ═══════════════════════════════════════════════════════════════════════════
const BACKTEST_RANGES = [
  { value: '3mo', label: '3 ay' }, { value: '6mo', label: '6 ay' },
  { value: '1y', label: '1 yıl' }, { value: '2y', label: '2 yıl' }, { value: '5y', label: '5 yıl' },
]

function MetricsGrid({ m }) {
  const ret = m.totalReturnPct ?? 0
  const pf = m.profitFactorInf ? '∞' : (m.profitFactor != null ? m.profitFactor.toFixed(2) : '—')
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard icon={Award} label="Toplam Getiri" value={fmtPct(ret)} sub={`${fmtMoney(m.netProfit)} ₺ net`} tone={ret >= 0 ? 'good' : 'bad'} />
      <StatCard icon={TrendingDown} label="Maks. Düşüş" value={`-%${(m.maxDrawdownPct ?? 0).toFixed(1)}`} sub={`${fmtMoney(m.maxDrawdownAbs)} ₺`} tone="bad" />
      <StatCard icon={Target} label="Kazanma Oranı" value={`%${(m.winRate ?? 0).toFixed(1)}`} sub={`${m.winCount || 0} kazanç · ${m.lossCount || 0} kayıp`} tone="gold" />
      <StatCard icon={BarChart3} label="İşlem Sayısı" value={`${m.totalTrades ?? 0}`} sub={`ort. tutuş ${m.avgHoldingBars ?? 0} işgünü`} />
      <StatCard icon={Scale} label="Profit Factor" value={pf} sub="brüt kâr / brüt zarar" tone={(m.profitFactor ?? 0) >= 1 || m.profitFactorInf ? 'good' : 'bad'} />
      <StatCard icon={TrendingUp} label="Yıllık Getiri (CAGR)" value={fmtPct(m.cagrPct ?? 0)} sub="bileşik" tone={(m.cagrPct ?? 0) >= 0 ? 'good' : 'bad'} />
      <StatCard icon={Gauge} label="Sharpe" value={`${(m.sharpe ?? 0).toFixed(2)}`} sub="risk-ayarlı getiri" tone={(m.sharpe ?? 0) >= 1 ? 'good' : 'neutral'} />
      <StatCard icon={Trophy} label="Beklenti / İşlem" value={`${fmtMoney(m.expectancy)} ₺`} sub={`en iyi ${fmtPct(m.bestTradePct)} · en kötü ${fmtPct(m.worstTradePct)}`} tone={(m.expectancy ?? 0) >= 0 ? 'good' : 'bad'} />
    </div>
  )
}

function BacktestResult({ run }) {
  const m = run.metrics || {}
  const ledger = (run.trades || []).map(toLedgerTrade)
  const dr = run.dataRange || {}
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500">
        <span><span className="text-gray-400">Dönem:</span> {dr.from} → {dr.to} ({dr.tradingDays} işgünü)</span>
        <span><span className="text-gray-400">Kapsam:</span> {run.mode === 'single' ? run.symbols?.[0] : `${run.symbolsWithData?.length || run.symbols?.length} hisse`}</span>
        <span><span className="text-gray-400">Sinyal:</span> {run.counts?.entrySignals ?? 0} giriş</span>
        {run.fetchErrors > 0 && <span className="text-amber-400">{run.fetchErrors} hissede veri alınamadı</span>}
      </div>

      <MetricsGrid m={m} />

      <Card>
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Sanal portföy eğrisi</div>
        {(run.equityCurve || []).length > 1
          ? <EquityChart data={run.equityCurve} />
          : <p className="py-8 text-center text-xs text-gray-500">Bu dönemde işlem oluşmadı.</p>}
      </Card>

      {run.openAtEnd?.length > 0 && (
        <Card padding="sm">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Test sonunda hâlâ açık ({run.openAtEnd.length})</div>
          <div className="flex flex-wrap gap-2 text-xs">
            {run.openAtEnd.map(p => (
              <span key={p.symbol} className="rounded-md border border-dark-700 px-2 py-1 text-gray-300">
                {p.symbol} <span className={p.unrealizedPnL >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{fmtPct(p.unrealizedPnLPct)}</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">İşlemler ({run.trades?.length || 0})</div>
        {(run.trades || []).length === 0 ? (
          <Card padding="none"><EmptyState icon={History} title="İşlem yok" description="Bu strateji/aralık kombinasyonunda hiç işlem açılmadı." /></Card>
        ) : (
          <TradeLedger trades={ledger} renderDetail={(lt) => (
            <div className="text-[11px] text-gray-400">
              {lt._src.symbol} · {lt._src.holdingBars ?? '—'} işgünü tutuldu · çıkış: {exitReasonLabel(lt._src.exitReason)}
            </div>
          )} />
        )}
      </div>

      {Array.isArray(run.assumptions) && (
        <div className="rounded-lg border border-dark-700 bg-dark-800/30 p-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            <AlertTriangle className="h-3.5 w-3.5" /> Modelleme varsayımları
          </div>
          <ul className="list-inside list-disc space-y-0.5 text-[11px] leading-snug text-gray-500">
            {run.assumptions.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

function exitReasonLabel(r) {
  return r === 'stop' ? 'stop-loss' : r === 'target' ? 'hedef' : r === 'signal_exit' ? 'strateji çıkışı'
    : r === 'timeout' ? 'zaman aşımı' : (r || '—')
}

function BacktestPanel({ bot, stocks, flash }) {
  const [mode, setMode] = useState('single')
  const [symbol, setSymbol] = useState(bot.universe?.[0] || '')
  const [range, setRange] = useState('1y')
  const [running, setRunning] = useState(false)
  const [run, setRun] = useState(null)
  const [history, setHistory] = useState([])

  const loadHistory = useCallback(async () => {
    try {
      const { data } = await api.get('/backtest/runs', { params: { botId: bot.id, limit: 20 } })
      if (data?.ok) setHistory(data.runs || [])
    } catch (_) {}
  }, [bot.id])

  useEffect(() => { loadHistory() }, [loadHistory])

  const doRun = async () => {
    if (mode === 'single' && !symbol.trim()) { flash('Tek hisse modu için bir hisse seç.', 'bad'); return }
    setRunning(true)
    try {
      const payload = { botId: bot.id, mode, range, ...(mode === 'single' ? { symbol: symbol.toUpperCase().trim() } : {}) }
      // Evren testi 80 hisseye kadar çekim yapabilir → uzun timeout
      const { data } = await api.post('/backtest/run', payload, { timeout: 180000 })
      if (data?.ok) { setRun(data.run); loadHistory() }
    } catch (e) {
      const errs = e?.response?.data?.errors
      flash(Array.isArray(errs) && errs.length ? errs[0] : (e?.response?.data?.error || 'Backtest çalıştırılamadı.'), 'bad')
    } finally { setRunning(false) }
  }

  const openRun = async (id) => {
    try {
      const { data } = await api.get(`/backtest/runs/${id}`)
      if (data?.ok) setRun(data.run)
    } catch (_) { flash('Kayıt yüklenemedi.', 'bad') }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-white">
          <Rewind className="h-4 w-4 text-emerald-400" /> Geriye dönük test (backtest)
        </div>
        <p className="text-[11.5px] leading-snug text-gray-500">
          Bu botun <strong className="text-gray-300">aynı strateji, risk ve para kurallarını</strong> geçmiş mumlar
          üzerinde gün-gün yeniden oynatır. Canlı bot ne yapacaksa backtest de onu yapar — sonuç doğrudan kıyaslanabilir.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Kapsam">
            <div className="flex rounded-lg border border-dark-700 p-0.5">
              <button type="button" onClick={() => setMode('single')}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${mode === 'single' ? 'bg-emerald-500/20 text-emerald-200' : 'text-gray-400 hover:text-gray-200'}`}>
                Tek Hisse
              </button>
              <button type="button" onClick={() => setMode('universe')}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${mode === 'universe' ? 'bg-emerald-500/20 text-emerald-200' : 'text-gray-400 hover:text-gray-200'}`}>
                Tüm Evren ({bot.universe?.length || 0})
              </button>
            </div>
          </Field>

          {mode === 'single' ? (
            <Field label="Hisse">
              <input list="bk-bt-universe" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="THYAO" className="input text-sm" />
              <datalist id="bk-bt-universe">
                {(bot.universe || []).map(s => <option key={s} value={s} />)}
                {stocks.map(s => <option key={s.symbol} value={s.symbol}>{s.name}</option>)}
              </datalist>
            </Field>
          ) : (
            <Field label="Hisse" hint={`Botun ${bot.universe?.length || 0} hisselik evreni taranır`}>
              <div className="input flex items-center text-sm text-gray-400">Tüm evren ({bot.universe?.length || 0} hisse)</div>
            </Field>
          )}

          <Field label="Dönem">
            <select value={range} onChange={(e) => setRange(e.target.value)} className="input text-sm">
              {BACKTEST_RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </Field>
        </div>

        <div className="flex items-center gap-2">
          <Button icon={Rewind} loading={running} onClick={doRun}>
            {running ? 'Oynatılıyor…' : 'Backtest çalıştır'}
          </Button>
          {mode === 'universe' && (bot.universe?.length || 0) > 30 && (
            <span className="text-[10.5px] text-gray-500">Büyük evren — birkaç saniye sürebilir.</span>
          )}
        </div>
      </Card>

      {running && !run && (
        <Card><div className="flex flex-col items-center gap-2 py-10 text-center text-xs text-gray-500">
          <Spinner size={24} /> Geçmiş veri çekiliyor ve strateji bar-bar yeniden oynatılıyor…
        </div></Card>
      )}

      {run && <BacktestResult run={run} />}

      {history.length > 0 && (
        <Card padding="sm">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Geçmiş testler</div>
          <div className="space-y-1">
            {history.map(h => (
              <button key={h.id} onClick={() => openRun(h.id)}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-white/5">
                <span className="flex items-center gap-2 text-gray-300">
                  <span className="font-medium">{h.mode === 'single' ? h.symbols?.[0] : `Evren (${h.symbols?.length})`}</span>
                  <span className="text-gray-500">· {h.period} · {h.totalTrades ?? 0} işlem</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className={`font-semibold ${(h.totalReturnPct ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{fmtPct(h.totalReturnPct ?? 0)}</span>
                  <span className="text-[10px] text-gray-500">{fmtDate(h.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  BOT DETAYI
// ═══════════════════════════════════════════════════════════════════════════
const DETAIL_TABS = [
  { id: 'overview', label: 'Genel Bakış', icon: TrendingUp },
  { id: 'open', label: 'Açık Pozisyonlar', icon: ListChecks },
  { id: 'trades', label: 'İşlem Geçmişi', icon: History },
  { id: 'backtest', label: 'Geriye Test', icon: Rewind },
  { id: 'settings', label: 'Ayarlar', icon: Settings },
]

function BotDetail({ botId, meta, marketWindow, refreshMarket, onBack, onEdit, onDeleted }) {
  const [tab, setTab] = useState('overview')
  const [bot, setBot] = useState(null)
  const [status, setStatus] = useState(null)
  const [positions, setPositions] = useState([])
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const stocks = meta?.universe || []

  const flash = (msg, tone = 'good') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 4000) }

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [s, p, t] = await Promise.all([
        api.get(`/custom-bots/${botId}`),
        api.get(`/custom-bots/${botId}/positions`),
        api.get(`/custom-bots/${botId}/trades`, { params: { limit: 200 } }),
      ])
      if (s.data?.ok) { setBot(s.data.bot); setStatus(s.data.status) }
      if (p.data?.ok) setPositions(p.data.open || [])
      if (t.data?.ok) setTrades(t.data.trades || [])
    } catch (_) {} finally { setLoading(false) }
  }, [botId])

  useEffect(() => { loadAll() }, [loadAll])

  const p = status?.portfolio || {}

  const doRun = async () => {
    setBusy(true)
    try {
      await api.post(`/custom-bots/${botId}/run`)
      flash('Tarama başlatıldı — sonuçlar birkaç saniye içinde yansıyacak.', 'info')
      setTimeout(loadAll, 4000)
    } catch (e) { flash(e?.response?.data?.error || 'Çalıştırılamadı.', 'bad') } finally { setBusy(false) }
  }
  const doTick = async () => {
    setBusy(true)
    try { await api.post(`/custom-bots/${botId}/tick`); await loadAll(); flash('Pozisyonlar kontrol edildi.') }
    catch (e) { flash(e?.response?.data?.error || 'Hata.', 'bad') } finally { setBusy(false) }
  }
  const togglePause = async () => {
    setBusy(true)
    try {
      await api.post(`/custom-bots/${botId}/${bot.status === 'paused' ? 'resume' : 'pause'}`)
      await loadAll()
    } catch (e) { flash(e?.response?.data?.error || 'Hata.', 'bad') } finally { setBusy(false) }
  }
  const doReset = async () => {
    setBusy(true)
    try { await api.post(`/custom-bots/${botId}/reset`); await loadAll(); flash('Bot sıfırlandı.') }
    catch (e) { flash(e?.response?.data?.error || 'Hata.', 'bad') } finally { setBusy(false) }
  }
  const doDelete = async () => {
    setBusy(true)
    try { await api.delete(`/custom-bots/${botId}`); onDeleted() }
    catch (e) { flash(e?.response?.data?.error || 'Silinemedi.', 'bad'); setBusy(false) }
  }

  // Müdahale
  const handleOpen = async (payload, done) => {
    setBusy(true)
    try {
      await refreshMarket()
      const { data } = await api.post(`/custom-bots/${botId}/positions`, payload)
      if (data?.ok) { flash(`${payload.symbol} pozisyonu açıldı.`); done && done(); await loadAll() }
    } catch (e) { flash(e?.response?.data?.error || 'Açılamadı.', 'bad') } finally { setBusy(false) }
  }
  const handleClose = async (pos, done) => {
    setBusy(true)
    try {
      await refreshMarket()
      const { data } = await api.post(`/custom-bots/${botId}/positions/${pos.id}/close`, {})
      if (data?.ok) { flash(`${pos.symbol} kapatıldı (P&L ${fmtMoney(data.result.realizedPnL)} ₺).`); done && done(); await loadAll() }
    } catch (e) { flash(e?.response?.data?.error || 'Kapatılamadı.', 'bad') } finally { setBusy(false) }
  }
  const handleAdjust = async (pos, patch, done) => {
    setBusy(true)
    try {
      const { data } = await api.patch(`/custom-bots/${botId}/positions/${pos.id}`, patch)
      if (data?.ok) { flash(`${pos.symbol} SL/TP güncellendi.`); done && done(); await loadAll() }
    } catch (e) { flash(e?.response?.data?.error || 'Güncellenemedi.', 'bad') } finally { setBusy(false) }
  }

  if (!bot) {
    return <div className="flex items-center justify-center py-20"><Spinner size={28} /></div>
  }

  const folio = positions.reduce((acc, pos) => {
    const cost = pos.entryPrice * pos.shares + (pos.commissionPaid || 0)
    const value = (pos.lastPrice ?? pos.entryPrice) * pos.shares
    acc.cost += cost; acc.value += value; return acc
  }, { cost: 0, value: 0 })
  const ledger = trades.map(toLedgerTrade)

  return (
    <div className="space-y-4">
      {/* Üst başlık */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={onBack}>Botlarım</Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold text-white">{bot.name}</h2>
            <Chip tone={bot.status === 'paused' ? 'warn' : 'good'}>{bot.status === 'paused' ? 'Duraklatıldı' : 'Aktif'}</Chip>
          </div>
          <div className="text-[11px] text-gray-500">{status?.running ? 'Taranıyor…' : `${meta?.strategies?.find(s => s.id === bot.strategyId)?.label || bot.strategyId} · ${bot.universe.length} hisse`}</div>
        </div>
        <Button variant="ghost" size="sm" icon={RefreshCw} loading={loading} onClick={loadAll}>Yenile</Button>
        <Button variant="outline" size="sm" icon={Pencil} onClick={() => onEdit(bot)}>Düzenle</Button>
      </div>

      {toast && (
        <Card padding="sm" tone={toast.tone === 'bad' ? 'ember' : toast.tone === 'info' ? 'neutral' : 'jade'}>
          <span className={`text-xs ${toast.tone === 'bad' ? 'text-rose-200' : toast.tone === 'info' ? 'text-sky-200' : 'text-emerald-200'}`}>{toast.msg}</span>
        </Card>
      )}

      <BotTabs tabs={DETAIL_TABS.map(t => ({ ...t, count: t.id === 'open' ? positions.length : 0 }))} active={tab} onChange={setTab} />

      {/* ── Genel Bakış ── */}
      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard icon={Award} label="Toplam Getiri" value={fmtPct(p.totalRealizedPnLPct)} sub={`${fmtMoney(p.totalRealizedPnL)} TL`} tone={(p.totalRealizedPnLPct || 0) >= 0 ? 'good' : 'bad'} />
            <StatCard icon={Target} label="Kazanma Oranı" value={`%${(p.winRate ?? 0).toFixed(1)}`} sub={`${p.winCount || 0} kazanç · ${p.lossCount || 0} kayıp`} tone="gold" />
            <StatCard icon={Activity} label="Açık Pozisyon" value={`${status?.openCount ?? 0}`} sub={`${fmtMoney(status?.unrealizedPnL)} TL anlık`} />
            <StatCard icon={Bot} label="Sanal Sermaye" value={`${fmtMoney(status?.equity)} TL`} sub={`Nakit ${fmtMoney(p.cash)} · Başlangıç ${fmtMoney(p.capital)}`} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" icon={RefreshCw} loading={busy} onClick={doRun}>Şimdi tara</Button>
            <Button variant="outline" size="sm" icon={Rewind} onClick={() => setTab('backtest')}>Geriye test et</Button>
            <Button variant="ghost" size="sm" loading={busy} onClick={doTick}>Pozisyonları kontrol et</Button>
            <Button variant="ghost" size="sm" icon={bot.status === 'paused' ? Play : Pause} loading={busy} onClick={togglePause}>
              {bot.status === 'paused' ? 'Sürdür' : 'Duraklat'}
            </Button>
          </div>

          <Card>
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Sanal portföy eğrisi</div>
            {(p.equityHistory || []).length > 0
              ? <EquityChart data={p.equityHistory} />
              : <p className="py-8 text-center text-xs text-gray-500">İşlemler oldukça portföy eğrisi burada görünecek.</p>}
          </Card>

          <HowItWorks summary="Bu bot, seçtiğin stratejiyi her gün hisse evreninde tarar ve sanal parayla işler.">
            <strong className="text-gray-200">{meta?.strategies?.find(s => s.id === bot.strategyId)?.label}</strong> stratejisi
            günlük kapanışta giriş/çıkış sinyali üretir. Giriş olunca pozisyon açılır; stop-loss ve hedef seçtiğin
            kurala göre belirlenir ({status && riskText(bot.risk)}). Açık pozisyonlara <strong className="text-gray-200">Açık
            Pozisyonlar</strong> sekmesinden elle de müdahale edebilirsin — borsa işlem saatleri içinde (10:15–18:00).
          </HowItWorks>
        </div>
      )}

      {/* ── Açık Pozisyonlar ── */}
      {tab === 'open' && (
        <div className="space-y-4">
          <MarketHoursBanner window={marketWindow} />
          <div className="flex items-center justify-between gap-2">
            <TabHeader title="Açık pozisyonlar" sub={`${positions.length} pozisyon · maliyet ${fmtMoney(folio.cost)} ₺ · değer ${fmtMoney(folio.value)} ₺`} />
            <ManualOpenForm bot={bot} stocks={stocks} window={marketWindow} onOpen={handleOpen} busy={busy} />
          </div>

          {positions.length === 0 ? (
            <Card padding="none"><EmptyState icon={ListChecks} title="Açık pozisyon yok" description="Bot sinyal verdikçe ya da elle açtıkça pozisyonlar burada görünür." /></Card>
          ) : (
            <TableShell>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
                    <th className="px-3 py-2 font-semibold">Sembol</th>
                    <th className="px-3 py-2 text-right font-semibold">Giriş</th>
                    <th className="px-3 py-2 text-right font-semibold">Son</th>
                    <th className="px-3 py-2 text-right font-semibold">Stop</th>
                    <th className="px-3 py-2 text-right font-semibold">Hedef</th>
                    <th className="px-3 py-2 text-right font-semibold">K/Z</th>
                    <th className="px-3 py-2 text-right font-semibold">Müdahale</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map(pos => (
                    <PositionRow key={pos.id} pos={pos} window={marketWindow} busy={busy}
                      onClose={handleClose} onAdjust={handleAdjust} />
                  ))}
                </tbody>
              </table>
            </TableShell>
          )}
        </div>
      )}

      {/* ── İşlem Geçmişi ── */}
      {tab === 'trades' && (
        <div className="space-y-4">
          <TabHeader title="Kapanan işlemler" sub={`${trades.length} işlem`} />
          {trades.length === 0 ? (
            <Card padding="none"><EmptyState icon={History} title="Kapanmış işlem yok" description="Bot çalıştıkça kapanan işlemler burada listelenir." /></Card>
          ) : (
            <TradeLedger trades={ledger} renderDetail={(lt) => <NotesList notes={lt._src.notes || []} />} />
          )}
        </div>
      )}

      {/* ── Geriye Test (Backtest) ── */}
      {tab === 'backtest' && (
        <BacktestPanel bot={bot} stocks={stocks} flash={flash} />
      )}

      {/* ── Ayarlar ── */}
      {tab === 'settings' && (
        <div className="max-w-2xl space-y-4">
          <Card>
            <div className="divide-y divide-dark-700 text-sm">
              <SettingRow label="Strateji" value={meta?.strategies?.find(s => s.id === bot.strategyId)?.label || bot.strategyId} />
              <SettingRow label="Parametreler" value={Object.entries(bot.params).map(([k, v]) => `${k}: ${v}`).join(' · ')} />
              <SettingRow label="Hisse evreni" value={`${bot.universe.length} hisse`} />
              <SettingRow label="Stop / Hedef" value={riskText(bot.risk)} />
              <SettingRow label="İz süren stop" value={bot.risk.trailing ? 'Açık' : 'Kapalı'} />
              <SettingRow label="Zaman aşımı" value={bot.risk.timeoutDays > 0 ? `${bot.risk.timeoutDays} işgünü` : 'Yok'} />
              <SettingRow label="Pozisyon büyüklüğü" value={`Nakdin %${bot.sizing.positionPct}'i`} />
              <SettingRow label="Maks. pozisyon" value={bot.sizing.maxPositions} />
              <SettingRow label="Başlangıç sermayesi" value={`${fmtMoney(bot.sizing.capital)} TL`} />
              <SettingRow label="Komisyon / slippage" value={`%${bot.commissionPct} / %${bot.slippagePct}`} />
              <SettingRow label="Oluşturulma" value={fmtDate(bot.createdAt)} />
            </div>
          </Card>

          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            {bot.universe.map(s => <span key={s} className="rounded bg-dark-700 px-1.5 py-0.5 text-gray-300">{s}</span>)}
          </div>

          <Card tone="ember" className="space-y-3">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-rose-300"><AlertTriangle className="h-4 w-4" /> Tehlikeli işlemler</div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" loading={busy} onClick={doReset}>Portföyü sıfırla</Button>
              {!confirmDelete ? (
                <Button variant="danger" size="sm" icon={Trash2} onClick={() => setConfirmDelete(true)}>Botu sil</Button>
              ) : (
                <>
                  <span className="text-xs text-gray-400">Bot ve tüm geçmişi silinecek. Emin misin?</span>
                  <Button variant="danger" size="sm" loading={busy} onClick={doDelete}>Evet, sil</Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Vazgeç</Button>
                </>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

function SettingRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-gray-400">{label}</span>
      <span className="text-right font-semibold text-white">{value}</span>
    </div>
  )
}
function riskText(risk) {
  const stop = risk.stopType === 'atr' ? `${risk.stopValue}×ATR altı`
    : risk.stopType === 'percent' ? `%${risk.stopValue} altı` : 'yok'
  const tgt = risk.targetType === 'rr' ? `${risk.targetValue}R`
    : risk.targetType === 'percent' ? `%${risk.targetValue} üstü`
    : risk.targetType === 'atr' ? `${risk.targetValue}×ATR üstü` : 'yok'
  return `Stop ${stop} · Hedef ${tgt}`
}

// ═══════════════════════════════════════════════════════════════════════════
//  BOT LİSTESİ
// ═══════════════════════════════════════════════════════════════════════════
function BotCard({ bot, onClick }) {
  const s = bot.summary
  const pnl = s?.totalRealizedPnLPct ?? 0
  return (
    <Card interactive onClick={onClick} className="cursor-pointer space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-semibold text-white">{bot.name}</span>
            <Chip tone={bot.status === 'paused' ? 'warn' : 'good'}>{bot.status === 'paused' ? 'Durdu' : 'Aktif'}</Chip>
          </div>
          <div className="mt-0.5 text-[11px] text-gray-500">{bot.strategyLabel} · {bot.universeCount} hisse</div>
        </div>
        <Layers className="h-4 w-4 flex-shrink-0 text-gray-600" />
      </div>
      {bot.description && <p className="line-clamp-2 text-[11.5px] leading-snug text-gray-400">{bot.description}</p>}
      <div className="grid grid-cols-3 gap-2 border-t border-dark-700/60 pt-2.5 text-center">
        <div>
          <div className={`text-sm font-bold ${pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{fmtPct(pnl)}</div>
          <div className="text-[9.5px] uppercase tracking-wider text-gray-500">Getiri</div>
        </div>
        <div>
          <div className="text-sm font-bold text-white">{s?.openCount ?? 0}</div>
          <div className="text-[9.5px] uppercase tracking-wider text-gray-500">Açık</div>
        </div>
        <div>
          <div className="text-sm font-bold text-gold-300">%{(s?.winRate ?? 0).toFixed(0)}</div>
          <div className="text-[9.5px] uppercase tracking-wider text-gray-500">İsabet</div>
        </div>
      </div>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  ANA BİLEŞEN
// ═══════════════════════════════════════════════════════════════════════════
export default function CustomBots() {
  const [view, setView] = useState('list')      // list | builder | detail
  const [bots, setBots] = useState([])
  const [meta, setMeta] = useState(null)
  const [marketWindow, setMarketWindow] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [editBot, setEditBot] = useState(null)
  const [loading, setLoading] = useState(true)
  const marketTimer = useRef(null)

  const loadMeta = useCallback(async () => {
    try {
      const [strat, uni] = await Promise.all([
        api.get('/custom-bots/meta/strategies'),
        api.get('/custom-bots/meta/universe'),
      ])
      setMeta({
        strategies: strat.data?.strategies || [],
        risk: strat.data?.risk, limits: strat.data?.limits,
        universe: uni.data?.stocks || [],
      })
    } catch (_) {}
  }, [])

  const loadBots = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/custom-bots')
      if (data?.ok) setBots(data.bots || [])
    } catch (_) {} finally { setLoading(false) }
  }, [])

  const refreshMarket = useCallback(async () => {
    try {
      const { data } = await api.get('/custom-bots/meta/market-hours')
      if (data?.ok) setMarketWindow(data.window)
    } catch (_) {}
  }, [])

  useEffect(() => { loadMeta(); loadBots(); refreshMarket() }, [loadMeta, loadBots, refreshMarket])
  // Piyasa saati durumunu canlı tut (buton aktif/pasif doğru olsun)
  useEffect(() => {
    marketTimer.current = setInterval(refreshMarket, 60000)
    return () => clearInterval(marketTimer.current)
  }, [refreshMarket])

  const openDetail = (id) => { setSelectedId(id); setView('detail') }
  const openBuilder = (bot = null) => { setEditBot(bot); setView('builder') }
  const backToList = () => { setView('list'); setSelectedId(null); setEditBot(null); loadBots() }

  if (!meta) {
    return <div className="flex items-center justify-center py-20"><Spinner size={28} /></div>
  }

  if (view === 'builder') {
    return <BotBuilder meta={meta} editBot={editBot}
      onCancel={() => (editBot ? openDetail(editBot.id) : setView('list'))}
      onSaved={(saved) => { loadBots(); openDetail(saved.id) }} />
  }

  if (view === 'detail' && selectedId) {
    return <BotDetail botId={selectedId} meta={meta} marketWindow={marketWindow} refreshMarket={refreshMarket}
      onBack={backToList} onEdit={(b) => openBuilder(b)} onDeleted={backToList} />
  }

  // ── Liste ──
  return (
    <div className="space-y-4">
      <MarketHoursBanner window={marketWindow} />
      <div className="flex items-center justify-between gap-2">
        <TabHeader title="Botlarım" sub={`${bots.length} bot · sen oluştur, parametreleri sen seç`} />
        <Button icon={Plus} onClick={() => openBuilder(null)}>Yeni Bot</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Spinner size={26} /></div>
      ) : bots.length === 0 ? (
        <Card padding="none">
          <EmptyState icon={Wrench} title="Henüz bot oluşturmadın"
            description="Kendi stratejini seç, parametrelerini ayarla, çalışacağı hisseleri belirle ve stop/hedef kurallarını sen koy."
            action={<Button icon={Plus} onClick={() => openBuilder(null)}>İlk botunu oluştur</Button>} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {bots.map(b => <BotCard key={b.id} bot={b} onClick={() => openDetail(b.id)} />)}
        </div>
      )}

      <HowItWorks summary="Bot oluşturucu nasıl çalışır?">
        Her bot bir <strong className="text-gray-200">strateji</strong> (EMA kesişimi, RSI dönüşü, MACD, Bollinger,
        Supertrend, Donchian kırılımı) ve onun parametrelerini kullanır. Seçtiğin <strong className="text-gray-200">hisse
        evrenini</strong> her gün borsa kapanışından sonra tarar; sinyal verdikçe sanal parayla alım yapar.
        <strong className="text-gray-200"> Stop-loss ve hedef</strong> noktalarını ATR, yüzde veya risk-katı (R) olarak
        sen belirlersin. İstediğin an <strong className="text-gray-200">işlemlere müdahale</strong> edip elle pozisyon
        açabilir/kapatabilirsin — borsa işlem saatleri içinde (açılış 10:15, kapanış 18:00). Tüm portföy sanaldır,
        gerçek para kullanılmaz.
      </HowItWorks>
    </div>
  )
}
