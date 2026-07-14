/**
 * Bot.jsx — MT5 Altın + BTC canlı işlem botu yönetim paneli (yalnızca yönetici).
 *
 * Sitedeki backend proxy'si üzerinden (/api/bot/*) MT5 DEMO işlem
 * botunu izler ve yönetir. Tüm istekler paylaşılan apiClient ile göreli
 * /bot/... yollarına gider (baseURL zaten /api ile biter). Uç noktalar
 * sunucu tarafında admin korumalıdır; burada ayrıca istemci tarafı kapı da var.
 *
 * Bölümler: üst durum + otomatik işlem anahtarı · açık işlemler · manuel işlem
 * · ayarlar (risk/strateji) · işlem geçmişi + istatistik · analiz & öneriler ·
 * olay günlüğü. status+positions ~2sn, trades+events+stats ~10sn'de bir
 * yoklanır; sekme gizliyken yoklama durur.
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  Bot, ShieldAlert, Power, PlugZap, Wallet, TrendingUp, ListChecks, X,
  Send, Settings, History, Sparkles, ScrollText, AlertTriangle,
  CheckCircle2, Activity, Target, BarChart3, Coins, Bitcoin,
  FlaskConical, LockKeyhole, RotateCcw, RefreshCw,
} from 'lucide-react'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'
import { Card, Button, Badge, EmptyState } from '../components/ui'

// ── Formatlayıcılar (sayfa içi, dışa bağımlılık yok) ────────────────────────
function fmtMoney(v, digits = 2) {
  if (v == null || !isFinite(v)) return '—'
  return Number(v).toLocaleString('tr-TR', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })
}
function fmtNum(v, digits = 2) {
  if (v == null || !isFinite(v)) return '—'
  return Number(v).toLocaleString('tr-TR', { maximumFractionDigits: digits })
}
function fmtDateTime(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return String(iso) }
}
function fmtTime(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleTimeString('tr-TR', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  } catch { return String(iso) }
}
// '' → undefined (boş bırakılan alan gönderilmesin), aksi halde sayı
function toNum(v) {
  if (v === '' || v == null) return undefined
  const n = Number(v)
  return isFinite(n) ? n : undefined
}
const pnlCls = (v) => ((Number(v) || 0) >= 0 ? 'text-emerald-300' : 'text-rose-300')
const apiError = (err, fallback) => (
  err?.response?.data?.error
  || err?.response?.data?.detail
  || err?.response?.data?.message
  || err?.message
  || fallback
)

// Yön rozeti — AL yeşil / SAT kırmızı
function DirBadge({ direction }) {
  const buy = String(direction).toLowerCase() === 'buy'
  return <Badge tone={buy ? 'jade' : 'ember'}>{buy ? 'AL' : 'SAT'}</Badge>
}

const SYMBOL_LABEL = { gold: 'Altın', btc: 'BTC' }
const STRATEGY_SYMBOLS = ['gold', 'btc']

function normalizeStrategyNames(raw, fallback = '') {
  let names = []
  if (Array.isArray(raw)) {
    names = raw
  } else if (raw) {
    names = [raw]
  } else if (fallback) {
    names = [fallback]
  }
  return [...new Set(names.map((item) => String(item).trim()).filter(Boolean))]
}

function supportsSymbol(strategy, symbolKey) {
  const symbols = strategy?.symbols
  return !Array.isArray(symbols) || symbols.includes(symbolKey)
}

// ── Küçük yardımcı: etiketli form alanı ─────────────────────────────────────
function Field({ label, children, hint }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-gray-500">{hint}</span>}
    </label>
  )
}

function SectionTitle({ icon: Icon, title, sub, children }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        {Icon && (
          <span
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
            style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid var(--border-gold)' }}
          >
            <Icon className="h-4 w-4" style={{ color: 'var(--gold-400)' }} aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
          {sub && <p className="text-xs text-gray-500">{sub}</p>}
        </div>
      </div>
      {children && <div className="flex flex-shrink-0 items-center gap-2">{children}</div>}
    </div>
  )
}

// ── Küçük geri bildirim satırı (işlem sonucu) ───────────────────────────────
function Feedback({ kind, text }) {
  if (!text) return null
  const ok = kind === 'ok'
  const Icon = ok ? CheckCircle2 : AlertTriangle
  return (
    <div
      className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
      style={{
        background: ok ? 'rgba(16,185,129,0.10)' : 'rgba(225,29,72,0.10)',
        border: `1px solid ${ok ? 'var(--border-gold)' : 'rgba(225,29,72,0.30)'}`,
        color: ok ? 'var(--jade)' : 'var(--ember)',
      }}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
      <span>{text}</span>
    </div>
  )
}

export default function BotPage() {
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'

  // ── Veri durumu ───────────────────────────────────────────────────────────
  const [status, setStatus] = useState(null)
  const [positions, setPositions] = useState([])
  const [trades, setTrades] = useState([])
  const [events, setEvents] = useState([])
  const [stats, setStats] = useState(null)
  const [scoreboard, setScoreboard] = useState(null)
  const [config, setConfig] = useState(null)
  const [strategies, setStrategies] = useState([])
  const [learn, setLearn] = useState(null)
  const [researchStatus, setResearchStatus] = useState(null)
  const [researchLatest, setResearchLatest] = useState(null)

  const [offline, setOffline] = useState(false)   // proxy 502/503 → bot çevrimdışı
  const [forbidden, setForbidden] = useState(false) // 403 → yetki yok

  // ── Aksiyon durumları ─────────────────────────────────────────────────────
  const [engineBusy, setEngineBusy] = useState(false)
  const [closingAll, setClosingAll] = useState(false)
  const [closingTicket, setClosingTicket] = useState(null)
  const [tradeBusy, setTradeBusy] = useState(false)
  const [tradeMsg, setTradeMsg] = useState(null)   // {kind,text}
  const [cfgBusy, setCfgBusy] = useState(false)
  const [cfgMsg, setCfgMsg] = useState(null)
  const [learnBusy, setLearnBusy] = useState(false)
  const [accountBindBusy, setAccountBindBusy] = useState(false)
  const [accountMsg, setAccountMsg] = useState(null)
  const [researchBusy, setResearchBusy] = useState(false)
  const [researchMsg, setResearchMsg] = useState(null)

  // ── Manuel işlem formu ────────────────────────────────────────────────────
  const [mSymbol, setMSymbol] = useState('gold')
  const [mDir, setMDir] = useState('buy')
  const [mLot, setMLot] = useState('')
  const [mSl, setMSl] = useState('')
  const [mTp, setMTp] = useState('')

  // ── Ayarlar taslağı (config yüklenince doldurulur) ─────────────────────────
  const [form, setForm] = useState(null)
  const setF = (patch) => setForm((f) => ({ ...(f || {}), ...patch }))

  // ── Uçuş halindeki istek koruması ──────────────────────────────────────────
  const fastInFlight = useRef(false)
  const slowInFlight = useRef(false)

  // Hata sınıflandırma — 403 yetki, 502/503/504/network → çevrimdışı
  const classifyError = useCallback((err) => {
    const st = err?.response?.status
    if (st === 403) { setForbidden(true); return }
    if (!err?.response || st === 502 || st === 503 || st === 504) setOffline(true)
  }, [])

  // ── Yükleyiciler ───────────────────────────────────────────────────────────
  const loadFast = useCallback(async () => {
    if (fastInFlight.current) return
    fastInFlight.current = true
    try {
      const [s, p] = await Promise.all([
        api.get('/bot/status'),
        api.get('/bot/positions'),
      ])
      setStatus(s.data || null)
      setPositions(Array.isArray(p.data) ? p.data : [])
      setOffline(false)
      setForbidden(false)
    } catch (err) {
      classifyError(err)
    } finally {
      fastInFlight.current = false
    }
  }, [classifyError])

  const loadSlow = useCallback(async () => {
    if (slowInFlight.current) return
    slowInFlight.current = true
    try {
      const [t, e, st, sb] = await Promise.all([
        api.get('/bot/trades', { params: { limit: 100 } }),
        api.get('/bot/events', { params: { limit: 100 } }),
        api.get('/bot/stats'),
        api.get('/bot/scoreboard'),
      ])
      setTrades(Array.isArray(t.data) ? t.data : [])
      setEvents(Array.isArray(e.data) ? e.data : [])
      setStats(st.data || null)
      setScoreboard(sb.data || null)
    } catch (err) {
      classifyError(err)
    } finally {
      slowInFlight.current = false
    }
  }, [classifyError])

  const loadConfig = useCallback(async () => {
    try {
      const { data } = await api.get('/bot/config')
      setConfig(data || null)
    } catch (err) { classifyError(err) }
  }, [classifyError])

  const loadStrategies = useCallback(async () => {
    try {
      const { data } = await api.get('/bot/strategies')
      setStrategies(Array.isArray(data) ? data : [])
    } catch (err) { classifyError(err) }
  }, [classifyError])

  const loadResearch = useCallback(async () => {
    try {
      const [state, latest] = await Promise.all([
        api.get('/bot/research/status'),
        api.get('/bot/research/latest'),
      ])
      setResearchStatus(state.data || null)
      setResearchLatest(latest.data || null)
    } catch (err) { classifyError(err) }
  }, [classifyError])

  // ── İlk yükleme + yoklama ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return
    loadFast(); loadSlow(); loadConfig(); loadStrategies(); loadResearch()

    const fast = setInterval(() => { if (!document.hidden) loadFast() }, 2000)
    const slow = setInterval(() => { if (!document.hidden) loadSlow() }, 10000)
    const researchPoll = setInterval(() => { if (!document.hidden) loadResearch() }, 10000)
    // Sekme yeniden görünür olduğunda hemen tazele
    const onVis = () => { if (!document.hidden) { loadFast(); loadSlow() } }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      clearInterval(fast)
      clearInterval(slow)
      clearInterval(researchPoll)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [isAdmin, loadFast, loadSlow, loadConfig, loadStrategies, loadResearch])

  // config gelince ayar taslağını (bir kez) doldur
  useEffect(() => {
    if (!config || form) return
    const risk = config.risk || {}
    const trade = config.trade || {}
    const daily = risk.daily_limit || {}
    const syms = config.symbols || {}
    const strat = config.strategy || {}
    const activeStrategy = strat.active ?? strat.name ?? config.active_strategy ?? ''
    const assignmentConfig = strat.assignments || {}
    const strategyAssignments = {
      gold: normalizeStrategyNames(assignmentConfig.gold, activeStrategy || 'gold_trend'),
      btc: normalizeStrategyNames(assignmentConfig.btc, ''),
    }
    const firstSelectedStrategy = STRATEGY_SYMBOLS
      .flatMap((key) => strategyAssignments[key] || [])
      .find(Boolean) || activeStrategy
    const allStrategyParams = strat.params || {}
    const activeParams = allStrategyParams?.[firstSelectedStrategy] || {}
    setForm({
      lotMode: risk.lot_mode === 'fixed' ? 'manual' : (risk.lot_mode ?? trade.lot_mode ?? 'auto'),
      fixedLot: risk.manual_lot ?? '',
      riskPercent: risk.risk_percent ?? risk.percent ?? '',
      defaultSl: trade.default_sl_points ?? trade.sl_points ?? '',
      defaultTp: trade.default_tp_points ?? trade.tp_points ?? '',
      maxOpen: risk.max_open_positions ?? '',
      maxPerSymbol: risk.max_positions_per_symbol ?? '',
      dailyEnabled: true,
      dailyMaxLoss: daily.max_loss ?? daily.maxLoss ?? '',
      dailyMaxProfit: daily.max_profit ?? daily.maxProfit ?? '',
      dailyAction: 'close_all_stop',
      goldEnabled: syms.enabled?.gold ?? true,
      btcEnabled: syms.enabled?.btc ?? true,
      strategyActive: firstSelectedStrategy,
      strategyAssignments,
      strategyParams: { ...activeParams },
    })
  }, [config, form])

  // Seçilen strateji değişince parametre formunu default_params ile birleştir
  const selectedStrategy = useMemo(
    () => strategies.find((s) => s.name === form?.strategyActive) || null,
    [strategies, form?.strategyActive],
  )
  const onStrategyChange = (name) => {
    const strat = strategies.find((s) => s.name === name)
    const defaults = strat?.default_params || {}
    // mevcut config'teki aynı stratejinin parametrelerini koru, yoksa default
    const prev = config?.strategy?.params?.[name] || {}
    setF({ strategyActive: name, strategyParams: { ...defaults, ...prev } })
  }

  const toggleStrategyAssignment = (symbolKey, strategyName) => {
    setForm((current) => {
      const currentAssignments = current?.strategyAssignments || {}
      const selected = normalizeStrategyNames(currentAssignments[symbolKey])
      const exists = selected.includes(strategyName)
      const nextForSymbol = exists
        ? selected.filter((name) => name !== strategyName)
        : [...selected, strategyName]
      const nextAssignments = { ...currentAssignments, [symbolKey]: nextForSymbol }

      const allSelected = STRATEGY_SYMBOLS
        .flatMap((key) => normalizeStrategyNames(nextAssignments[key]))
      let nextActive = current?.strategyActive || ''
      let nextParams = current?.strategyParams || {}
      if (!exists) {
        const strat = strategies.find((s) => s.name === strategyName)
        const defaults = strat?.default_params || {}
        const prev = config?.strategy?.params?.[strategyName] || {}
        nextActive = strategyName
        nextParams = { ...defaults, ...prev }
      } else if (nextActive === strategyName && !allSelected.includes(strategyName)) {
        nextActive = allSelected[0] || ''
        const strat = strategies.find((s) => s.name === nextActive)
        const defaults = strat?.default_params || {}
        const prev = config?.strategy?.params?.[nextActive] || {}
        nextParams = nextActive ? { ...defaults, ...prev } : {}
      }
      return {
        ...(current || {}),
        strategyActive: nextActive,
        strategyParams: nextParams,
        strategyAssignments: nextAssignments,
      }
    })
  }

  // ── Aksiyonlar ─────────────────────────────────────────────────────────────
  const toggleEngine = async () => {
    if (engineBusy) return
    setEngineBusy(true)
    const path = status?.engine_enabled ? '/bot/engine/stop' : '/bot/engine/start'
    // iyimser güncelleme
    setStatus((s) => (s ? { ...s, engine_enabled: !s.engine_enabled } : s))
    try {
      const { data } = await api.post(path)
      setStatus((s) => (s ? { ...s, engine_enabled: !!data?.enabled } : s))
    } catch (err) {
      classifyError(err)
      await loadFast() // gerçek durumu geri al
    } finally {
      setEngineBusy(false)
    }
  }

  const closePosition = async (ticket) => {
    if (!window.confirm('#' + ticket + ' pozisyonu kapatılsın mı?')) return
    setClosingTicket(ticket)
    try {
      await api.post('/bot/trade/close', { ticket })
      await loadFast()
    } catch (err) {
      classifyError(err)
    } finally {
      setClosingTicket(null)
    }
  }

  const closeAll = async () => {
    if (!window.confirm('Tüm açık pozisyonlar kapatılsın mı?')) return
    setClosingAll(true)
    try {
      await api.post('/bot/trade/close_all', {})
      await loadFast()
    } catch (err) {
      classifyError(err)
    } finally {
      setClosingAll(false)
    }
  }

  const submitManualTrade = async (e) => {
    e.preventDefault()
    if (!window.confirm(`${SYMBOL_LABEL[mSymbol]} ${mDir === 'buy' ? 'AL' : 'SAT'} emri gönderilsin mi?`)) return
    setTradeBusy(true)
    setTradeMsg(null)
    try {
      const body = { symbol_key: mSymbol, direction: mDir }
      const lot = toNum(mLot); if (lot !== undefined) body.lot = lot
      const sl = toNum(mSl); if (sl !== undefined) body.sl_price = sl
      const tp = toNum(mTp); if (tp !== undefined) body.tp_price = tp
      const { data } = await api.post('/bot/trade/open', body)
      if (data?.ok) {
        setTradeMsg({ kind: 'ok', text: `İşlem açıldı — bilet #${data.ticket ?? '—'} ${data.message ? '· ' + data.message : ''}` })
        setMLot(''); setMSl(''); setMTp('')
        await loadFast()
      } else {
        setTradeMsg({ kind: 'err', text: data?.message || `İşlem reddedildi (retcode: ${data?.retcode ?? '—'})` })
      }
    } catch (err) {
      classifyError(err)
      setTradeMsg({ kind: 'err', text: apiError(err, 'İşlem gönderilemedi') })
    } finally {
      setTradeBusy(false)
    }
  }

  const saveConfig = async () => {
    if (!form) return
    setCfgBusy(true)
    setCfgMsg(null)
    // NOT: config şeması sunucudan geldiği gibi geri gönderilir (kısmi birleştirme).
    // Anahtar adları çıkarımdır — gerçek şemaya göre gerekiyorsa ayarlanmalı.
    const goldStrategies = normalizeStrategyNames(form.strategyAssignments?.gold, form.strategyActive || 'gold_trend')
    const btcStrategies = normalizeStrategyNames(form.strategyAssignments?.btc, '')
    const activeStrategyForSave = form.strategyActive || goldStrategies[0] || btcStrategies[0] || 'gold_trend'
    const partial = {
      risk: {
        lot_mode: form.lotMode,
        manual_lot: toNum(form.fixedLot),
        risk_percent: toNum(form.riskPercent),
        max_open_positions: toNum(form.maxOpen),
        max_positions_per_symbol: toNum(form.maxPerSymbol),
        daily_limit: {
          enabled: true,
          max_loss: toNum(form.dailyMaxLoss),
          max_profit: toNum(form.dailyMaxProfit),
          action: 'close_all_stop',
        },
      },
      trade: {
        default_sl_points: toNum(form.defaultSl),
        default_tp_points: toNum(form.defaultTp),
      },
      symbols: {
        enabled: { gold: !!form.goldEnabled, btc: !!form.btcEnabled },
      },
      strategy: {
        active: activeStrategyForSave,
        assignments: {
          ...(config?.strategy?.assignments || {}),
          gold: goldStrategies,
          btc: btcStrategies,
        },
        allow_unverified: false,
        params: {
          ...(config?.strategy?.params || {}),
          [activeStrategyForSave]: form.strategyParams || {},
        },
      },
    }
    try {
      const { data } = await api.post('/bot/config', partial)
      if (data) setConfig(data)
      setCfgMsg({ kind: 'ok', text: 'Ayarlar kaydedildi.' })
    } catch (err) {
      classifyError(err)
      setCfgMsg({ kind: 'err', text: apiError(err, 'Ayarlar kaydedilemedi') })
    } finally {
      setCfgBusy(false)
    }
  }

  const runLearn = async () => {
    setLearnBusy(true)
    try {
      const { data } = await api.get('/bot/learn')
      setLearn(data || null)
    } catch (err) {
      classifyError(err)
    } finally {
      setLearnBusy(false)
    }
  }

  const bindCurrentDemoAccount = async () => {
    const account = status?.account || {}
    const login = Number(account.login || 0)
    const server = String(account.server || '')
    const mode = String(account.trade_mode_label || '').toLowerCase()
    if (!login || !server || mode !== 'demo') {
      setAccountMsg({ kind: 'err', text: 'MT5 hesabı demo olarak doğrulanamadı.' })
      return
    }
    if (!window.confirm(
      `${login}@${server} yeni demo hesap kilidi olacak. Motor güvenli biçimde durdurulacak. Devam edilsin mi?`,
    )) return

    setAccountBindBusy(true)
    setAccountMsg(null)
    try {
      if (status?.engine_enabled) await api.post('/bot/engine/stop', {})
      const { data } = await api.post('/bot/account/bind_current_demo', {})
      if (data?.config) setConfig(data.config)
      setAccountMsg({
        kind: 'ok',
        text: `${data?.message || 'Demo hesap kilitlendi.'} Üstteki anahtardan botu yeniden başlatın.`,
      })
      await Promise.all([loadFast(), loadConfig()])
    } catch (err) {
      classifyError(err)
      setAccountMsg({ kind: 'err', text: apiError(err, 'Hesap kilitlenemedi.') })
    } finally {
      setAccountBindBusy(false)
    }
  }

  const runResearch = async () => {
    setResearchBusy(true)
    setResearchMsg(null)
    try {
      await api.post('/bot/research/run', {})
      setResearchMsg({ kind: 'ok', text: 'Walk-forward araştırması sıraya alındı.' })
      await loadResearch()
    } catch (err) {
      classifyError(err)
      setResearchMsg({ kind: 'err', text: apiError(err, 'Araştırma başlatılamadı.') })
    } finally {
      setResearchBusy(false)
    }
  }

  const approveResearch = async (row) => {
    const reviewer = window.prompt('Onaylayan kişi/ad:', '')
    if (!reviewer) return
    if (!window.confirm(
      `${row.symbol_key}/${row.strategy} yalnızca MT5 DEMO champion olarak onaylansın mı?`,
    )) return
    setResearchBusy(true)
    setResearchMsg(null)
    try {
      await api.post('/bot/research/approve', {
        symbol_key: row.symbol_key,
        strategy: row.strategy,
        reviewer,
      })
      setForm(null)
      setResearchMsg({ kind: 'ok', text: 'MT5 demo champion onaylandı ve bot stratejisine bağlandı.' })
      await Promise.all([loadResearch(), loadConfig(), loadFast()])
    } catch (err) {
      classifyError(err)
      setResearchMsg({ kind: 'err', text: apiError(err, 'Aday onaylanamadı.') })
    } finally {
      setResearchBusy(false)
    }
  }

  const rollbackResearch = async (symbolKey) => {
    const reviewer = window.prompt('Rollback yapan kişi/ad:', '')
    if (!reviewer) return
    const reason = window.prompt('Rollback nedeni:', 'performans bozulması')
    if (!reason) return
    setResearchBusy(true)
    setResearchMsg(null)
    try {
      await api.post('/bot/research/rollback', {
        symbol_key: symbolKey,
        reviewer,
        reason,
      })
      setForm(null)
      setResearchMsg({ kind: 'ok', text: 'Önceki doğrulanmış champion geri yüklendi.' })
      await Promise.all([loadResearch(), loadConfig(), loadFast()])
    } catch (err) {
      classifyError(err)
      setResearchMsg({ kind: 'err', text: apiError(err, 'Rollback tamamlanamadı.') })
    } finally {
      setResearchBusy(false)
    }
  }

  // ── Birleşik olay günlüğü (events + ui_logs), en yeni üstte ────────────────
  const mergedLogs = useMemo(() => {
    const a = (events || []).map((e) => ({
      time: e.time, level: e.kind || 'event', msg: e.message, src: 'event',
    }))
    const b = (status?.ui_logs || []).map((l) => ({
      time: l.time, level: l.level || 'log', msg: l.msg, src: 'ui',
    }))
    return [...a, ...b].sort((x, y) => {
      const tx = new Date(x.time).getTime() || 0
      const ty = new Date(y.time).getTime() || 0
      return ty - tx
    }).slice(0, 200)
  }, [events, status?.ui_logs])

  // ── Yetki kapısı (savunma derinliği) ────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <Card tone="ember" accent className="text-center">
          <div className="flex flex-col items-center gap-3 py-6">
            <span
              className="flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{ background: 'rgba(225,29,72,0.10)', border: '1px solid rgba(225,29,72,0.30)' }}
            >
              <ShieldAlert className="h-7 w-7" style={{ color: 'var(--ember)' }} aria-hidden="true" />
            </span>
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              Bu sayfa yalnızca yöneticiye açıktır
            </h1>
            <p className="max-w-sm text-sm text-gray-500">
              İşlem botu kontrol paneline erişmek için yönetici hesabıyla giriş yapmalısınız.
            </p>
          </div>
        </Card>
      </div>
    )
  }

  const acct = status?.account || {}
  const daily = status?.daily || {}
  const limit = status?.limit || {}
  const guard = status?.account_guard || {}
  const connected = !!status?.connected
  const engineOn = !!status?.engine_enabled
  const preflight = status?.preflight || {}
  const blockers = Array.isArray(status?.trade_blockers) ? status.trade_blockers : []
  const tradeReady = !!status?.trade_ready
  const lockedAccount = config?.mt5 || {}
  const liveAccountIsDemo = String(acct.trade_mode_label || '').toLowerCase() === 'demo'
  const sameLockedAccount = Number(acct.login || 0) > 0
    && Number(lockedAccount.login || 0) === Number(acct.login || 0)
    && String(lockedAccount.server || '').toLowerCase() === String(acct.server || '').toLowerCase()
  const scoreRows = Array.isArray(scoreboard?.backtests) ? scoreboard.backtests : []
  const productionRow = scoreRows.find((row) => row?.validation?.status === 'approved' && row?.stability?.status === 'stable')
  const researchRows = Array.isArray(researchLatest?.candidates) ? researchLatest.candidates : []
  const researchRunning = !!researchStatus?.running

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      {/* Başlık */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="flex flex-shrink-0 items-center justify-center rounded-xl"
            style={{ width: 44, height: 44, background: 'rgba(16,185,129,0.10)', border: '1px solid var(--border-gold)' }}
          >
            <Bot size={22} strokeWidth={2} style={{ color: 'var(--gold-400)' }} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="mb-0.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--gold-400)' }}>
              MT5 Demo Bot · Yönetici
            </div>
            <h1 className="text-xl font-bold leading-tight tracking-tight sm:text-2xl" style={{ color: 'var(--text-primary)' }}>
              Altın + BTC İşlem Botu
            </h1>
            <p className="mt-1 text-[13.5px]" style={{ color: 'var(--text-secondary)' }}>
              VPS'teki MT5 demo botunu izle ve yönet — gerçek hesap kod seviyesinde engellidir.
            </p>
          </div>
        </div>
        <Badge tone={connected ? 'jade' : 'ember'} dot>
          {connected ? 'BAĞLI' : 'BAĞLANTI YOK'}
        </Badge>
      </div>

      {/* Çevrimdışı uyarısı — sayfa yine de render olur */}
      {offline && (
        <Card tone="ember" accent padding="sm">
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--ember)' }}>
            <PlugZap className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span><strong>Bot çevrimdışı.</strong> Sunucuya ulaşılamıyor — son bilinen değerler gösteriliyor, yeniden denemeye devam ediliyor.</span>
          </div>
        </Card>
      )}
      {forbidden && (
        <Card tone="ember" accent padding="sm">
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--ember)' }}>
            <ShieldAlert className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span>Sunucu bu isteği reddetti (403). Yönetici yetkiniz doğrulanamadı.</span>
          </div>
        </Card>
      )}

      <Card tone={tradeReady ? 'jade' : 'gold'} accent>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500">İşlem Hazırlığı</div>
            <div className={`mt-1 text-lg font-bold ${tradeReady ? 'text-emerald-300' : 'text-amber-300'}`}>
              {tradeReady ? 'EMİR İÇİN HAZIR' : 'GÜVENLİ BEKLEMEDE'}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {tradeReady
                ? 'MT5 bağlantısı, demo hesap kilidi, strateji ve risk kapıları açık.'
                : 'Aşağıdaki maddeler çözülmeden bot yeni emir göndermez.'}
            </p>
          </div>
          <Badge tone={tradeReady ? 'jade' : 'gold'} dot>{tradeReady ? 'HAZIR' : `${blockers.length} ENGEL`}</Badge>
        </div>
        {!tradeReady && (
          <ul className="mt-3 space-y-1.5 text-xs text-amber-100">
            {(blockers.length ? blockers : ['Motor durum bilgisi bekleniyor.']).map((reason, index) => (
              <li key={`${reason}-${index}`} className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ── 1. ÜST DURUM ─────────────────────────────────────────────────── */}
      <Card>
        <SectionTitle icon={BarChart3} title="Üretim Skoru" sub="Backtest doğrulama + stabilite + motor preflight" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.9fr_1.4fr]">
          <div className="rounded-xl border border-dark-700 p-3">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Çalışabilir eşleşme</div>
            <div className={`text-sm font-bold ${preflight.ok ? 'text-emerald-300' : 'text-rose-300'}`}>
              {preflight.ok ? 'HAZIR' : 'BLOKLU'}
            </div>
            <div className="mt-1 space-y-1 text-xs text-gray-500">
              {(preflight.runnable || []).map((row) => (
                <div key={`${row.symbol_key}-${row.strategy}`}>{row.symbol || row.symbol_key} → {row.strategy}</div>
              ))}
              {(preflight.blocked || []).slice(0, 2).map((row) => (
                <div key={`${row.symbol_key}-${row.strategy}`} className="text-rose-300">{row.symbol || row.symbol_key} → {row.strategy}: {row.reason}</div>
              ))}
              {!preflight.runnable?.length && !preflight.blocked?.length && <div>Preflight bekleniyor.</div>}
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-dark-700">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-dark-800/70 text-[10px] uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-3 py-2">Sembol</th>
                  <th className="px-3 py-2">Strateji</th>
                  <th className="px-3 py-2">Karar</th>
                  <th className="px-3 py-2">Stabilite</th>
                  <th className="px-3 py-2 text-right">Skor</th>
                </tr>
              </thead>
              <tbody>
                {scoreRows.slice(0, 4).map((row) => (
                  <tr key={`${row.symbol}-${row.strategy}`} className="border-t border-dark-700">
                    <td className="px-3 py-2 text-gray-300">{row.symbol || '—'}</td>
                    <td className="px-3 py-2 text-gray-300">{row.strategy || '—'}</td>
                    <td className="px-3 py-2">
                      <Badge tone={row.validation?.status === 'approved' ? 'jade' : row.validation?.status === 'rejected' ? 'ember' : 'gold'}>
                        {row.validation?.status || '—'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-gray-400">{row.stability?.status || '—'}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-200">{fmtNum(row.validation?.score, 1)}</td>
                  </tr>
                ))}
                {!scoreRows.length && (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-center text-gray-500">Skor raporu bekleniyor.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        {productionRow && (
          <p className="mt-3 text-xs text-gray-500">
            Üretim adayı: <span className="font-semibold text-emerald-300">{productionRow.symbol} → {productionRow.strategy}</span>.
            Diğer stratejiler izleme listesinde kalır; motor preflight onayı olmadan otomatik açılmaz.
          </p>
        )}
      </Card>

      <Card>
        {guard.ok === false && (
          <div
            className="mb-4 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm"
            style={{ background: 'rgba(225,29,72,0.12)', border: '1px solid rgba(225,29,72,0.35)', color: 'var(--ember)' }}
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span>
              <strong>YANLIŞ HESAP / bot bağlı değil.</strong>
              {guard.reason ? ` ${guard.reason}` : ' Beklenen MT5 hesabı ile bağlantı doğrulanamadı.'}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
          {/* Sol: hesap + K/Z */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                <PlugZap className="h-3.5 w-3.5" aria-hidden="true" /> Bağlantı
              </div>
              <div className={`text-sm font-bold ${connected ? 'text-emerald-300' : 'text-rose-300'}`}>
                {connected ? 'Bağlı' : 'Kopuk'}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-gray-500">
                {acct.login ? `${acct.login}@${acct.server || '—'}` : '—'}
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                <Activity className="h-3.5 w-3.5" aria-hidden="true" /> Mod
              </div>
              <div className={`text-sm font-bold ${status?.execution_mode === 'mt5' ? 'text-amber-300' : 'text-emerald-300'}`}>
                {String(status?.execution_mode || 'mt5').toUpperCase()}
              </div>
              <div className="mt-0.5 text-[11px] text-gray-500">
                MT5 demo emir
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                <Wallet className="h-3.5 w-3.5" aria-hidden="true" /> Bakiye
              </div>
              <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                {fmtMoney(acct.balance)} {acct.currency || ''}
              </div>
              <div className="mt-0.5 text-[11px] text-gray-500">
                Varlık: {fmtMoney(acct.equity)} {acct.currency || ''}
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" /> Günlük K/Z
              </div>
              <div className={`text-sm font-bold ${pnlCls(daily.total)}`}>
                {fmtMoney(daily.total)} {acct.currency || ''}
              </div>
              <div className="mt-0.5 text-[11px] text-gray-500">
                Kapanan {fmtMoney(daily.closed)} · Açık {fmtMoney(daily.floating)}
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                <Target className="h-3.5 w-3.5" aria-hidden="true" /> Günlük Limit
              </div>
              <div className={`text-sm font-bold ${limit.hit ? 'text-rose-300' : 'text-emerald-300'}`}>
                {limit.hit ? 'ULAŞILDI' : 'Aktif değil'}
              </div>
              <div className="mt-0.5 text-[11px] text-gray-500">
                {limit.hit
                  ? `${limit.kind || ''} · ${limit.action || ''} · ${fmtMoney(limit.pnl)}/${fmtMoney(limit.limit)}`
                  : (limit.limit != null ? `Sınır: ${fmtMoney(limit.limit)}` : 'Sınır tanımsız')}
              </div>
            </div>
          </div>

          {/* Sağ: büyük OTOMATİK İŞLEM anahtarı */}
          <div
            className="flex items-center justify-between gap-3 rounded-xl p-4"
            style={{
              background: engineOn ? 'rgba(16,185,129,0.08)' : 'var(--bg-elevated)',
              border: `1px solid ${engineOn ? 'var(--border-gold)' : 'var(--border-subtle)'}`,
            }}
          >
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Otomatik İşlem</div>
              <div className={`mt-0.5 text-lg font-bold ${engineOn ? 'text-emerald-300' : 'text-gray-400'}`}>
                {engineOn ? 'ÇALIŞIYOR' : 'DURDU'}
              </div>
              {status?.active_strategy && (
                <div className="mt-0.5 truncate text-[11px] text-gray-500">Strateji: {status.active_strategy}</div>
              )}
            </div>
            <button
              type="button"
              onClick={toggleEngine}
              disabled={engineBusy}
              aria-pressed={engineOn}
              aria-label="Otomatik işlemi aç/kapat"
              className="relative inline-flex h-9 w-16 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-60"
              style={{ background: engineOn ? 'var(--gold-400)' : 'var(--border-subtle)' }}
            >
              <span
                className="inline-flex h-7 w-7 transform items-center justify-center rounded-full bg-white shadow transition-transform"
                style={{ transform: engineOn ? 'translateX(30px)' : 'translateX(4px)' }}
              >
                <Power className="h-3.5 w-3.5" style={{ color: engineOn ? 'var(--gold-500)' : 'var(--text-muted)' }} aria-hidden="true" />
              </span>
            </button>
          </div>
        </div>
      </Card>

      {/* ── 2. AÇIK İŞLEMLER ─────────────────────────────────────────────── */}
      <Card padding="none">
        <div className="flex items-center justify-between gap-2 border-b border-dark-700 px-4 py-3">
          <SectionTitle icon={ListChecks} title="Açık İşlemler" sub={`${positions.length} pozisyon`} />
          {positions.length > 0 && (
            <Button variant="danger" size="sm" icon={X} loading={closingAll} onClick={closeAll}>
              Tümünü Kapat
            </Button>
          )}
        </div>
        {positions.length === 0 ? (
          <EmptyState compact icon={ListChecks} title="Açık pozisyon yok" description="Bot pozisyon açtığında burada listelenir." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
                  <th className="px-3 py-2 font-semibold">Bilet</th>
                  <th className="px-3 py-2 font-semibold">Sembol</th>
                  <th className="px-3 py-2 font-semibold">Yön</th>
                  <th className="px-3 py-2 text-right font-semibold">Lot</th>
                  <th className="px-3 py-2 text-right font-semibold">Açılış</th>
                  <th className="px-3 py-2 text-right font-semibold">SL</th>
                  <th className="px-3 py-2 text-right font-semibold">TP</th>
                  <th className="px-3 py-2 text-right font-semibold">Canlı K/Z</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.ticket} className="border-t border-dark-700/60">
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-400">#{p.ticket}</td>
                    <td className="px-3 py-2.5 font-semibold text-white">{p.symbol}</td>
                    <td className="px-3 py-2.5"><DirBadge direction={p.direction} /></td>
                    <td className="px-3 py-2.5 text-right text-gray-300">{fmtNum(p.volume, 2)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-300">{fmtNum(p.price_open, 2)}</td>
                    <td className="px-3 py-2.5 text-right text-rose-300">{p.sl ? fmtNum(p.sl, 2) : '—'}</td>
                    <td className="px-3 py-2.5 text-right text-emerald-300">{p.tp ? fmtNum(p.tp, 2) : '—'}</td>
                    <td className={`px-3 py-2.5 text-right font-semibold ${pnlCls(p.profit)}`}>
                      {fmtMoney(p.profit)}
                      {p.swap ? <div className="text-[10px] font-normal text-gray-500">swap {fmtMoney(p.swap)}</div> : null}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        loading={closingTicket === p.ticket}
                        onClick={() => closePosition(p.ticket)}
                      >
                        Kapat
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── 3. MANUEL İŞLEM ──────────────────────────────────────────────── */}
      <Card>
        <SectionTitle icon={Send} title="Manuel İşlem" sub="Boş bırakılan lot/SL/TP bot varsayılanını kullanır" />
        <form onSubmit={submitManualTrade} className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Field label="Sembol">
              <select className="input text-sm" value={mSymbol} onChange={(e) => setMSymbol(e.target.value)}>
                <option value="gold">Altın</option>
                <option value="btc">BTC</option>
              </select>
            </Field>
            <Field label="Yön">
              <select className="input text-sm" value={mDir} onChange={(e) => setMDir(e.target.value)}>
                <option value="buy">AL</option>
                <option value="sell">SAT</option>
              </select>
            </Field>
            <Field label="Lot" hint="boş = oto">
              <input className="input text-sm" type="number" step="0.01" min="0" placeholder="oto" value={mLot} onChange={(e) => setMLot(e.target.value)} />
            </Field>
            <Field label="SL fiyat" hint="boş = varsayılan">
              <input className="input text-sm" type="number" step="0.01" placeholder="varsayılan" value={mSl} onChange={(e) => setMSl(e.target.value)} />
            </Field>
            <Field label="TP fiyat" hint="boş = varsayılan">
              <input className="input text-sm" type="number" step="0.01" placeholder="varsayılan" value={mTp} onChange={(e) => setMTp(e.target.value)} />
            </Field>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" variant={mDir === 'buy' ? 'gold' : 'danger'} icon={Send} loading={tradeBusy}>
              {mDir === 'buy' ? 'AL Emri Gönder' : 'SAT Emri Gönder'}
            </Button>
            <span className="text-xs text-gray-500">{SYMBOL_LABEL[mSymbol]} · {mDir === 'buy' ? 'AL' : 'SAT'}</span>
          </div>
          {tradeMsg && <Feedback kind={tradeMsg.kind} text={tradeMsg.text} />}
        </form>
      </Card>

      {/* ── 4. AYARLAR ───────────────────────────────────────────────────── */}
      <Card>
        <SectionTitle icon={Settings} title="Ayarlar" sub="Risk, limit, sembol ve strateji">
          <Button variant="gold" size="sm" loading={cfgBusy} disabled={!form} onClick={saveConfig}>
            Kaydet
          </Button>
        </SectionTitle>

        {!form ? (
          <p className="py-6 text-center text-sm text-gray-500">Ayarlar yükleniyor…</p>
        ) : (
          <div className="space-y-5">
            {/* Risk & lot */}
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Risk & Lot</div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Lot modu">
                  <select className="input text-sm" value={form.lotMode} onChange={(e) => setF({ lotMode: e.target.value })}>
                    <option value="auto">Otomatik (risk %)</option>
                    <option value="manual">Sabit lot</option>
                  </select>
                </Field>
                <Field label="Sabit lot" hint="lot modu = sabit">
                  <input className="input text-sm" type="number" step="0.01" min="0" value={form.fixedLot} onChange={(e) => setF({ fixedLot: e.target.value })} />
                </Field>
                <Field label="Risk %" hint="lot modu = oto">
                  <input className="input text-sm" type="number" step="0.1" min="0" value={form.riskPercent} onChange={(e) => setF({ riskPercent: e.target.value })} />
                </Field>
                <Field label="Max açık toplam">
                  <input className="input text-sm" type="number" step="1" min="0" value={form.maxOpen} onChange={(e) => setF({ maxOpen: e.target.value })} />
                </Field>
                <Field label="Max açık / sembol">
                  <input className="input text-sm" type="number" step="1" min="0" value={form.maxPerSymbol} onChange={(e) => setF({ maxPerSymbol: e.target.value })} />
                </Field>
                <Field label="Varsayılan SL (puan)">
                  <input className="input text-sm" type="number" step="1" min="0" value={form.defaultSl} onChange={(e) => setF({ defaultSl: e.target.value })} />
                </Field>
                <Field label="Varsayılan TP (puan)">
                  <input className="input text-sm" type="number" step="1" min="0" value={form.defaultTp} onChange={(e) => setF({ defaultTp: e.target.value })} />
                </Field>
              </div>
            </div>

            {/* Demo-only execution + verified account lock */}
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">MT5 Demo Hesap Kilidi</div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_auto]">
                <div className="rounded-lg border border-dark-700 bg-dark-900/40 px-3 py-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Kilitli Hesap</div>
                  <div className="mt-1 font-mono text-sm font-semibold text-gray-200">
                    {Number(lockedAccount.login || 0) > 0
                      ? `${lockedAccount.login}@${lockedAccount.server || '—'}`
                      : 'Henüz kilitlenmedi'}
                  </div>
                </div>
                <div className="rounded-lg border border-dark-700 bg-dark-900/40 px-3 py-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">MT5'te Açık Hesap</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-sm font-semibold text-gray-200">
                    <span>{acct.login ? `${acct.login}@${acct.server || '—'}` : 'Hesap bekleniyor'}</span>
                    <Badge tone={liveAccountIsDemo ? 'jade' : 'ember'}>{liveAccountIsDemo ? 'DEMO' : 'DOĞRULANMADI'}</Badge>
                  </div>
                </div>
                <Button
                  variant={sameLockedAccount ? 'outline' : 'gold'}
                  icon={LockKeyhole}
                  loading={accountBindBusy}
                  disabled={!liveAccountIsDemo || !acct.login || sameLockedAccount}
                  onClick={bindCurrentDemoAccount}
                >
                  {sameLockedAccount ? 'Hesap Kilitli' : 'Bağlı Demo Hesabına Kilitle'}
                </Button>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Numara elle yazılmaz. İşlem motoru durdurulur, açık bot pozisyonları kontrol edilir ve MT5'in demo doğrulaması zorunlu tutulur.
              </p>
              {accountMsg && <div className="mt-2"><Feedback kind={accountMsg.kind} text={accountMsg.text} /></div>}
            </div>

            {/* Günlük limit */}
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Günlük Limit</div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Durum">
                  <div className="flex h-[38px] items-center gap-2 text-sm font-semibold text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Daima aktif
                  </div>
                </Field>
                <Field label="Max zarar">
                  <input className="input text-sm" type="number" step="0.01" min="0" value={form.dailyMaxLoss} onChange={(e) => setF({ dailyMaxLoss: e.target.value })} />
                </Field>
                <Field label="Max kâr">
                  <input className="input text-sm" type="number" step="0.01" min="0" value={form.dailyMaxProfit} onChange={(e) => setF({ dailyMaxProfit: e.target.value })} />
                </Field>
                <Field label="Davranış">
                  <div className="flex h-[38px] items-center text-sm text-gray-300">Tümünü kapat + durdur</div>
                </Field>
              </div>
            </div>

            {/* Sembol aktifliği */}
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Semboller</div>
              <div className="flex flex-wrap gap-3">
                <label className="flex items-center gap-2 rounded-lg border border-dark-700 px-3 py-2 text-sm text-gray-300">
                  <input type="checkbox" className="h-4 w-4 accent-emerald-500" checked={!!form.goldEnabled} onChange={(e) => setF({ goldEnabled: e.target.checked })} />
                  <Coins className="h-4 w-4 text-gold-300" aria-hidden="true" /> Altın
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-dark-700 px-3 py-2 text-sm text-gray-300">
                  <input type="checkbox" className="h-4 w-4 accent-emerald-500" checked={!!form.btcEnabled} onChange={(e) => setF({ btcEnabled: e.target.checked })} />
                  <Bitcoin className="h-4 w-4 text-gold-300" aria-hidden="true" /> BTC
                </label>
              </div>
            </div>

            {/* Strateji */}
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Strateji</div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {STRATEGY_SYMBOLS.map((symbolKey) => {
                  const selectedNames = normalizeStrategyNames(form.strategyAssignments?.[symbolKey])
                  const options = strategies.filter((strategy) => supportsSymbol(strategy, symbolKey))
                  const verified = normalizeStrategyNames(config?.strategy?.verified_assignments?.[symbolKey])
                  const candidates = normalizeStrategyNames(config?.strategy?.candidate_assignments?.[symbolKey])
                  return (
                    <div key={symbolKey} className="rounded-lg border border-dark-700 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm font-semibold text-gray-200">
                          {symbolKey === 'gold'
                            ? <Coins className="h-4 w-4 text-gold-300" aria-hidden="true" />
                            : <Bitcoin className="h-4 w-4 text-gold-300" aria-hidden="true" />}
                          {SYMBOL_LABEL[symbolKey]}
                        </div>
                        <span className="text-xs text-gray-500">{selectedNames.length} seçili</span>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {options.map((strategy) => {
                          const checked = selectedNames.includes(strategy.name)
                          const isVerified = verified.includes(strategy.name)
                          const isCandidate = candidates.includes(strategy.name)
                          return (
                            <label
                              key={`${symbolKey}-${strategy.name}`}
                              className={`flex min-h-[54px] cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                                checked
                                  ? 'border-emerald-400/70 bg-emerald-500/10 text-emerald-100'
                                  : 'border-dark-700 bg-dark-900/40 text-gray-300 hover:border-dark-600'
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="h-4 w-4 flex-shrink-0 accent-emerald-500"
                                checked={checked}
                                disabled={!isVerified}
                                onChange={() => toggleStrategyAssignment(symbolKey, strategy.name)}
                              />
                              <span className="min-w-0">
                                <span className="block truncate font-medium">{strategy.display_name || strategy.name}</span>
                                <span className="text-[10px] uppercase tracking-wider text-gray-500">
                                  {isVerified ? 'onaylı' : isCandidate ? 'araştırma adayı' : 'doğrulanmamış'}
                                </span>
                              </span>
                            </label>
                          )
                        })}
                        {!options.length && (
                          <div className="rounded-lg border border-dark-700 px-3 py-2 text-xs text-gray-500">Uygun strateji yok.</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-100">
                <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span>Yalnızca doğrulanmış champion stratejiler çalışabilir. Adaylar aşağıdaki araştırma bölümünden onaylanır.</span>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Parametre düzenle">
                  <select className="input text-sm" value={form.strategyActive || ''} onChange={(e) => onStrategyChange(e.target.value)}>
                    <option value="">— seçin —</option>
                    {strategies.map((s) => (
                      <option key={s.name} value={s.name}>{s.display_name || s.name}</option>
                    ))}
                  </select>
                </Field>
                {selectedStrategy?.description && (
                  <div className="flex items-end">
                    <p className="text-xs leading-relaxed text-gray-500">{selectedStrategy.description}</p>
                  </div>
                )}
              </div>

              {selectedStrategy && Object.keys(selectedStrategy.default_params || {}).length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {Object.entries(selectedStrategy.default_params).map(([key, def]) => {
                    const val = form.strategyParams?.[key]
                    const isBool = typeof def === 'boolean'
                    const isNum = typeof def === 'number'
                    const setParam = (v) => setF({ strategyParams: { ...(form.strategyParams || {}), [key]: v } })
                    return (
                      <Field key={key} label={key}>
                        {isBool ? (
                          <label className="flex h-[38px] items-center gap-2 text-sm text-gray-300">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-emerald-500"
                              checked={val ?? def}
                              onChange={(e) => setParam(e.target.checked)}
                            />
                            {val ?? def ? 'Açık' : 'Kapalı'}
                          </label>
                        ) : (
                          <input
                            className="input text-sm"
                            type={isNum ? 'number' : 'text'}
                            step={isNum ? 'any' : undefined}
                            value={val ?? def ?? ''}
                            onChange={(e) => setParam(isNum ? toNum(e.target.value) : e.target.value)}
                          />
                        )}
                      </Field>
                    )
                  })}
                </div>
              )}
            </div>

            {cfgMsg && <Feedback kind={cfgMsg.kind} text={cfgMsg.text} />}
          </div>
        )}
      </Card>

      {/* ── 5. WALK-FORWARD ARAŞTIRMA + İNSAN ONAYI ─────────────────────── */}
      <Card padding="none">
        <div className="border-b border-dark-700 px-4 py-3">
          <SectionTitle
            icon={FlaskConical}
            title="Walk-Forward Araştırma ve Onay"
            sub="Kronolojik fold, final holdout, maliyet stresi ve kontrollü champion geçişi"
          >
            <Button
              variant="gold"
              size="sm"
              icon={RefreshCw}
              loading={researchBusy || researchRunning}
              disabled={researchRunning}
              onClick={runResearch}
            >
              {researchRunning ? 'Araştırma Çalışıyor' : 'Araştırmayı Başlat'}
            </Button>
          </SectionTitle>
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <Badge tone={researchStatus?.last_error ? 'ember' : researchRunning ? 'gold' : 'jade'} dot>
              {researchStatus?.last_error ? 'HATA' : researchRunning ? 'ÇALIŞIYOR' : 'HAZIR'}
            </Badge>
            <span>
              {researchStatus?.last_error
                ? researchStatus.last_error
                : researchRunning
                  ? 'MT5 geçmiş verileri ve walk-forward katları işleniyor.'
                  : `Son tamamlanma: ${fmtDateTime(researchStatus?.last_finished || researchLatest?.generated_at)}`}
            </span>
          </div>
          {researchMsg && <div className="mt-3"><Feedback kind={researchMsg.kind} text={researchMsg.text} /></div>}
        </div>

        {researchRows.length === 0 ? (
          <EmptyState
            compact
            icon={FlaskConical}
            title={researchRunning ? 'Araştırma devam ediyor' : 'Henüz aday raporu yok'}
            description="Sonuçlar hazır olduğunda adaylar ve bütün güvenlik kapıları burada görünür."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
                  <th className="px-3 py-2 font-semibold">Piyasa / Strateji</th>
                  <th className="px-3 py-2 text-right font-semibold">Fold</th>
                  <th className="px-3 py-2 text-right font-semibold">OOS İşlem</th>
                  <th className="px-3 py-2 text-right font-semibold">Holdout PF</th>
                  <th className="px-3 py-2 text-right font-semibold">Holdout %</th>
                  <th className="px-3 py-2 text-right font-semibold">2× Spread %</th>
                  <th className="px-3 py-2 font-semibold">Kapılar</th>
                  <th className="px-3 py-2 text-right font-semibold">Karar</th>
                </tr>
              </thead>
              <tbody>
                {researchRows.map((row) => {
                  const allPass = !!row?.gates?.all_pass
                  const fold = row?.fold_summary || {}
                  const holdout = row?.holdout_metrics || {}
                  const stress = row?.double_spread_metrics || {}
                  return (
                    <tr key={`${row.symbol_key}-${row.strategy}`} className="border-t border-dark-700/60">
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-white">{row.symbol || row.symbol_key}</div>
                        <div className="text-xs text-gray-500">{row.strategy}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-300">{fold.count || 0}</td>
                      <td className="px-3 py-2.5 text-right text-gray-300">{fold.total_oos_trades || 0}</td>
                      <td className="px-3 py-2.5 text-right text-gray-300">{fmtNum(holdout.profit_factor, 2)}</td>
                      <td className={`px-3 py-2.5 text-right ${pnlCls(holdout.total_return_pct)}`}>{fmtNum(holdout.total_return_pct, 2)}</td>
                      <td className={`px-3 py-2.5 text-right ${pnlCls(stress.total_return_pct)}`}>{fmtNum(stress.total_return_pct, 2)}</td>
                      <td className="px-3 py-2.5">
                        <Badge tone={allPass ? 'jade' : 'ember'}>{allPass ? 'ONAYA HAZIR' : 'RED'}</Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant={allPass ? 'gold' : 'outline'}
                            size="sm"
                            disabled={!allPass || researchBusy || positions.length > 0}
                            onClick={() => approveResearch(row)}
                          >
                            Onayla
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            icon={RotateCcw}
                            disabled={researchBusy || positions.length > 0}
                            onClick={() => rollbackResearch(row.symbol_key)}
                          >
                            Geri Al
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-dark-700 px-4 py-3 text-xs text-gray-500">
          Araştırma hiçbir zaman emir göndermez. Aday ancak bütün kapıları geçip yönetici tarafından onaylandığında MT5 demo champion olur; açık bot pozisyonu varken onay ve geri alma engellenir.
        </div>
      </Card>

      {/* ── 6. İŞLEM GEÇMİŞİ + İSTATİSTİK ────────────────────────────────── */}
      <Card padding="none">
        <div className="border-b border-dark-700 px-4 py-3">
          <SectionTitle icon={History} title="İşlem Geçmişi" sub="Son 100 kapanan işlem" />
        </div>

        {/* Mini istatistik */}
        <div className="grid grid-cols-2 gap-px border-b border-dark-700 bg-dark-700 sm:grid-cols-4">
          {[
            { label: 'Toplam İşlem', value: fmtNum(stats?.total ?? stats?.total_trades ?? trades.length, 0), cls: 'text-white' },
            { label: 'Kazanma %', value: stats?.win_rate != null ? `%${fmtNum(stats.win_rate, 1)}` : (stats?.winrate != null ? `%${fmtNum(stats.winrate, 1)}` : '—'), cls: 'text-gold-300' },
            { label: 'Profit Factor', value: fmtNum(stats?.profit_factor ?? stats?.profitFactor, 2), cls: 'text-white' },
            { label: 'Toplam K/Z', value: fmtMoney(stats?.total_profit ?? stats?.net_profit ?? stats?.total_pnl), cls: pnlCls(stats?.total_profit ?? stats?.net_profit ?? stats?.total_pnl) },
          ].map((s) => (
            <div key={s.label} className="bg-dark-900 px-3 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{s.label}</div>
              <div className={`mt-1 text-lg font-bold ${s.cls}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {trades.length === 0 ? (
          <EmptyState compact icon={History} title="Kapanan işlem yok" description="Bot işlem kapattıkça burada görünür." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
                  <th className="px-3 py-2 font-semibold">Sembol</th>
                  <th className="px-3 py-2 font-semibold">Yön</th>
                  <th className="px-3 py-2 text-right font-semibold">Lot</th>
                  <th className="px-3 py-2 font-semibold">Açılış</th>
                  <th className="px-3 py-2 text-right font-semibold">Aç. Fiyat</th>
                  <th className="px-3 py-2 font-semibold">Kapanış</th>
                  <th className="px-3 py-2 text-right font-semibold">Kap. Fiyat</th>
                  <th className="px-3 py-2 font-semibold">Strateji</th>
                  <th className="px-3 py-2 text-right font-semibold">K/Z</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t, i) => (
                  <tr key={t.position_id ?? i} className="border-t border-dark-700/60">
                    <td className="px-3 py-2.5 font-semibold text-white">{t.symbol}</td>
                    <td className="px-3 py-2.5"><DirBadge direction={t.direction} /></td>
                    <td className="px-3 py-2.5 text-right text-gray-300">{fmtNum(t.volume, 2)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-400">{fmtDateTime(t.open_time)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-300">{fmtNum(t.open_price, 2)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-400">{fmtDateTime(t.close_time)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-300">{fmtNum(t.close_price, 2)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-400">{t.strategy || '—'}</td>
                    <td className={`px-3 py-2.5 text-right font-semibold ${pnlCls(t.profit)}`}>{fmtMoney(t.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── 6. ANALİZ & ÖNERİLER ─────────────────────────────────────────── */}
      <Card>
        <SectionTitle icon={Sparkles} title="Analiz & Öneriler" sub={learn?.generated_at ? `Üretim: ${fmtDateTime(learn.generated_at)}` : 'Journal verisine göre öneriler'}>
          <Button variant="outline" size="sm" icon={BarChart3} loading={learnBusy} onClick={runLearn}>
            Analizi Çalıştır
          </Button>
        </SectionTitle>

        {!learn ? (
          <p className="py-4 text-center text-sm text-gray-500">Analizi başlatmak için “Analizi Çalıştır”a basın.</p>
        ) : (
          <div className="space-y-3">
            {(learn.suggestions || []).length === 0 ? (
              <p className="text-sm text-gray-500">Öneri yok — mevcut ayarlar uygun görünüyor.</p>
            ) : (
              <ul className="space-y-2">
                {learn.suggestions.map((s, i) => {
                  const sev = String(s.severity || 'info').toLowerCase()
                  const tone = sev === 'high' || sev === 'critical' ? 'ember'
                    : sev === 'medium' || sev === 'warn' || sev === 'warning' ? 'gold' : 'jade'
                  return (
                    <li key={i} className="flex items-start gap-2.5 rounded-lg border border-dark-700 px-3 py-2.5">
                      <Badge tone={tone}>{(s.severity || 'bilgi').toUpperCase()}</Badge>
                      <span className="text-sm text-gray-300">{s.text}</span>
                    </li>
                  )
                })}
              </ul>
            )}
            {learn.proposed_params && Object.keys(learn.proposed_params).length > 0 && (
              <div className="rounded-lg border border-dark-700 bg-dark-800/40 px-3 py-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Önerilen parametreler</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
                  {Object.entries(learn.proposed_params).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2">
                      <span className="text-gray-500">{k}</span>
                      <span className="font-mono text-gray-200">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ── 7. OLAY GÜNLÜĞÜ ──────────────────────────────────────────────── */}
      <Card padding="none">
        <div className="border-b border-dark-700 px-4 py-3">
          <SectionTitle icon={ScrollText} title="Olay Günlüğü" sub="Bot olayları + arayüz kayıtları · en yeni üstte" />
        </div>
        {mergedLogs.length === 0 ? (
          <EmptyState compact icon={Activity} title="Kayıt yok" description="Bot çalıştıkça olaylar burada akar." />
        ) : (
          <ul className="max-h-96 divide-y divide-dark-700/60 overflow-y-auto">
            {mergedLogs.map((l, i) => {
              const lvl = String(l.level || '').toLowerCase()
              const tone = lvl.includes('err') || lvl.includes('crit') ? 'text-rose-300'
                : lvl.includes('warn') ? 'text-amber-300'
                : lvl.includes('trade') || lvl.includes('order') || lvl.includes('signal') ? 'text-emerald-300'
                : 'text-gray-400'
              return (
                <li key={i} className="flex items-start gap-3 px-4 py-2 text-xs">
                  <span className="w-16 flex-shrink-0 font-mono text-gray-500">{fmtTime(l.time)}</span>
                  <span className={`w-16 flex-shrink-0 font-semibold uppercase ${tone}`}>{l.level}</span>
                  <span className="min-w-0 flex-1 text-gray-300">{l.msg}</span>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
