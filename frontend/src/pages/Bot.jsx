/**
 * Bot.jsx — Bot Yönetim Paneli (yalnızca yönetici).
 *
 * Ultra-basit, 4 sekmeli tasarım:
 *   🤖 Botlar      — 15 botu aç/kapat + hangi zaman dilimlerinde çalışacağını seç
 *   ➕ Bot Oluştur — indikatör + zaman dilimi + ICT + parite seçip yeni bot yarat
 *   🏆 Yarış       — hangi bot ne kadar başarılı (şampiyon + lider tablosu)
 *   🥇 Altın Botu  — bağımsız MT5 altın botu izle/yönet
 *
 * Tüm istekler apiClient ile /bot/... (backend admin korumalı; ayrıca istemci kapısı).
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'

const EM = '#0f9d6e'
const cls = (...a) => a.filter(Boolean).join(' ')
const fmt = (v, d = 2) => (v == null || !isFinite(v) ? '—' : Number(v).toLocaleString('tr-TR', { maximumFractionDigits: d, minimumFractionDigits: d }))
const CAT_ICON = { Forex: '💱', Emtia: '🥇', Kripto: '🪙', BIST: '🏛️', MT5: '⚡', ICT: '🎯', Deneysel: '🧪', Tarama: '🔍', Özel: '⭐' }

// ── küçük parçalar ────────────────────────────────────────────────────────────
function Toggle({ on, onClick, busy }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} aria-pressed={on}
      className={cls('relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400',
        on ? 'bg-emerald-500' : 'bg-gray-300', busy && 'opacity-60')}>
      <span className={cls('inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform', on ? 'translate-x-6' : 'translate-x-1')} />
    </button>
  )
}
function Chip({ active, onClick, children, tone = 'emerald' }) {
  const base = 'px-3 py-1.5 rounded-full text-sm font-medium border transition-colors select-none'
  const styles = active
    ? (tone === 'emerald' ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-amber-500 border-amber-500 text-white')
    : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-400'
  return <button type="button" onClick={onClick} className={cls(base, styles, onClick ? 'cursor-pointer' : 'cursor-default')}>{children}</button>
}
function Tag({ children }) { return <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 text-xs">{children}</span> }
function Spinner() { return <div className="flex justify-center py-16"><div className="h-8 w-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" /></div> }
function Msg({ kind, children }) {
  if (!children) return null
  const c = kind === 'err' ? 'bg-rose-50 text-rose-700 border-rose-200' : kind === 'ok' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
  return <div className={cls('rounded-xl border px-4 py-3 text-sm', c)}>{children}</div>
}

// ══════════════════════════════════════════════════════════════════════════════
export default function BotPage() {
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'
  const [tab, setTab] = useState('botlar')

  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto mt-24 text-center px-6">
        <div className="text-5xl mb-4">🔒</div>
        <h1 className="text-2xl font-bold text-gray-800">Yönetici girişi gerekli</h1>
        <p className="text-gray-500 mt-2">Bu panel yalnızca yöneticilere açıktır. Yönetici hesabıyla giriş yap.</p>
      </div>
    )
  }

  const tabs = [
    { id: 'botlar', label: 'Botlar', icon: '🤖' },
    { id: 'olustur', label: 'Bot Oluştur', icon: '➕' },
    { id: 'yaris', label: 'Yarış', icon: '🏆' },
    { id: 'altin', label: 'Altın Botu', icon: '🥇' },
  ]

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-1">
        <span className="text-3xl">👑</span>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-800 tracking-tight">Bot Merkezi</h1>
      </div>
      <p className="text-gray-500 mb-5">Tüm botları tek yerden yönet — çocuk oyuncağı kadar kolay.</p>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cls('flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold whitespace-nowrap transition-colors',
              tab === t.id ? 'bg-emerald-500 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:border-emerald-400')}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {tab === 'botlar' && <BotlarTab />}
      {tab === 'olustur' && <OlusturTab />}
      {tab === 'yaris' && <YarisTab />}
      {tab === 'altin' && <AltinTab />}
    </div>
  )
}

// ── SEKME 1: BOTLAR ───────────────────────────────────────────────────────────
function BotlarTab() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    try { const { data } = await api.get('/bot/builder'); setData(data); setErr('') }
    catch (e) { setErr(e?.response?.status === 403 ? 'Yetki yok.' : 'Bota ulaşılamıyor, yeniden deneniyor…') }
  }, [])
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t) }, [load])

  const toggleEnabled = async (bot) => {
    setBusy(bot.id)
    try { await api.post(`/bot/builder/settings/${bot.id}`, { enabled: !bot.enabled }); await load() }
    catch { setErr('İşlem başarısız.') } finally { setBusy('') }
  }
  const toggleTf = async (bot, tf) => {
    const cur = new Set(bot.selectedTimeframes || [])
    cur.has(tf) ? cur.delete(tf) : cur.add(tf)
    setBusy(bot.id + tf)
    try { await api.post(`/bot/builder/settings/${bot.id}`, { timeframes: [...cur] }); await load() }
    catch { setErr('İşlem başarısız.') } finally { setBusy('') }
  }

  if (err && !data) return <Msg kind="warn">{err}</Msg>
  if (!data) return <Spinner />

  return (
    <div className="space-y-4">
      <Msg kind="err">{err && data ? err : ''}</Msg>
      <p className="text-sm text-gray-500">Her botu <b>aç/kapat</b> ve hangi <b>zaman dilimlerinde</b> işlem açacağını seç. Zaman dilimi seçmezsen <b>hepsi</b> açık kabul edilir.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {data.catalog.map((bot) => (
          <div key={bot.id} className={cls('rounded-2xl border bg-white p-5 transition-shadow hover:shadow-md', bot.enabled ? 'border-gray-200' : 'border-gray-200 opacity-70')}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl">{CAT_ICON[bot.category] || '🤖'}</span>
                  <h3 className="font-bold text-gray-800">{bot.name}</h3>
                </div>
                <div className="text-xs text-gray-400 mt-0.5">{bot.category}{bot.magic ? ` · magic ${bot.magic}` : ''}</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Toggle on={bot.enabled} busy={busy === bot.id} onClick={() => toggleEnabled(bot)} />
                <span className={cls('text-xs font-medium', bot.enabled ? 'text-emerald-600' : 'text-gray-400')}>{bot.enabled ? 'Açık' : 'Kapalı'}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 mt-3">
              {bot.strategies.map((s, i) => <Tag key={i}>{s}</Tag>)}
            </div>

            <div className="mt-4">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Zaman Dilimleri {(!bot.selectedTimeframes || !bot.selectedTimeframes.length) && <span className="text-emerald-500 normal-case">· hepsi açık</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                {bot.availableTimeframes.map((tf) => (
                  <Chip key={tf} active={(bot.selectedTimeframes || []).includes(tf)} onClick={() => toggleTf(bot, tf)}>{tf}</Chip>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── SEKME 2: BOT OLUŞTUR ──────────────────────────────────────────────────────
const emptyForm = { name: '', indicators: [], logic: 'majority', timeframes: ['1h'], ictStrategy: '', pairs: [], atrSlMult: 1.5, atrTpMult: 2.5 }

function OlusturTab() {
  const [meta, setMeta] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try { const { data } = await api.get('/bot/builder'); setMeta(data) } catch { /* sessiz */ }
  }, [])
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t) }, [load])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const toggleArr = (k, v) => setForm((f) => { const s = new Set(f[k]); s.has(v) ? s.delete(v) : s.add(v); return { ...f, [k]: [...s] } })

  const create = async () => {
    setMsg(null)
    if (!form.indicators.length && !form.ictStrategy) return setMsg({ kind: 'err', text: 'En az bir indikatör veya ICT stratejisi seç.' })
    if (!form.pairs.length) return setMsg({ kind: 'err', text: 'En az bir parite seç.' })
    if (!form.timeframes.length) return setMsg({ kind: 'err', text: 'En az bir zaman dilimi seç.' })
    setBusy(true)
    try {
      const { data } = await api.post('/bot/builder/custom', { ...form, ictStrategy: form.ictStrategy || null })
      setMsg({ kind: 'ok', text: `"${data.bot.name}" oluşturuldu (magic ${data.bot.magic}). Sinyal üretmeye başlayacak.` })
      setForm(emptyForm); await load()
    } catch (e) { setMsg({ kind: 'err', text: e?.response?.data?.error || 'Oluşturulamadı.' }) } finally { setBusy(false) }
  }
  const removeBot = async (id) => { try { await api.delete(`/bot/builder/custom/${id}`); await load() } catch { /* */ } }
  const toggleBot = async (b) => { try { await api.patch(`/bot/builder/custom/${b.id}`, { enabled: !b.enabled }); await load() } catch { /* */ } }

  if (!meta) return <Spinner />
  const step = (n, title) => <div className="flex items-center gap-2 mb-3"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white text-xs font-bold">{n}</span><h4 className="font-semibold text-gray-700">{title}</h4></div>

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* SİHİRBAZ */}
      <div className="lg:col-span-3 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 space-y-6">
        <div>
          <h3 className="text-lg font-bold text-gray-800">Yeni Bot Yarat 🛠️</h3>
          <p className="text-sm text-gray-500">Seç, birleştir, işlem aç. Kod yazmadan kendi botun.</p>
        </div>

        <div>{step(1, 'Bot adı')}
          <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Örn: Süper Trend Avcısı"
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
        </div>

        <div>{step(2, 'İndikatörler (birden fazla seçebilirsin)')}
          <div className="grid gap-2 sm:grid-cols-2">
            {meta.indicators.map((ind) => {
              const on = form.indicators.includes(ind.id)
              return (
                <button key={ind.id} type="button" onClick={() => toggleArr('indicators', ind.id)}
                  className={cls('text-left rounded-xl border p-3 transition-colors', on ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-emerald-300')}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-800">{ind.label}</span>
                    <span className={cls('h-5 w-5 rounded-md border flex items-center justify-center text-xs', on ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300')}>{on ? '✓' : ''}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{ind.desc}</div>
                </button>
              )
            })}
          </div>
        </div>

        <div>{step(3, 'Sinyal kuralı')}
          <div className="flex gap-2">
            <button type="button" onClick={() => set('logic', 'all')} className={cls('flex-1 rounded-xl border p-3 text-sm', form.logic === 'all' ? 'border-emerald-500 bg-emerald-50 font-semibold' : 'border-gray-200')}>
              <div className="font-semibold">Hepsi aynı yönde 🔒</div><div className="text-xs text-gray-500">Tüm indikatörler aynı yönü gösterirse (az ama kuvvetli sinyal)</div>
            </button>
            <button type="button" onClick={() => set('logic', 'majority')} className={cls('flex-1 rounded-xl border p-3 text-sm', form.logic === 'majority' ? 'border-emerald-500 bg-emerald-50 font-semibold' : 'border-gray-200')}>
              <div className="font-semibold">Çoğunluk 🗳️</div><div className="text-xs text-gray-500">Çoğu indikatör aynı yönü gösterirse (daha sık sinyal)</div>
            </button>
          </div>
        </div>

        <div>{step(4, 'Zaman dilimleri')}
          <div className="flex flex-wrap gap-2">
            {meta.allTimeframes.map((tf) => <Chip key={tf} active={form.timeframes.includes(tf)} onClick={() => toggleArr('timeframes', tf)}>{tf}</Chip>)}
          </div>
        </div>

        <div>{step(5, 'ICT / SMC stratejisi ekle (opsiyonel)')}
          <select value={form.ictStrategy} onChange={(e) => set('ictStrategy', e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white">
            <option value="">— Yok (yalnız indikatörler) —</option>
            {meta.ictStrategies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <p className="text-xs text-gray-400 mt-1">Seçersen: sinyal ancak ICT stratejisi de aynı yönü onaylarsa açılır (daha güçlü).</p>
        </div>

        <div>{step(6, 'Pariteler')}
          <div className="flex flex-wrap gap-2">
            {meta.pairs.map((p) => <Chip key={p.id} tone="amber" active={form.pairs.includes(p.id)} onClick={() => toggleArr('pairs', p.id)}>{p.symbol}</Chip>)}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">Stop mesafesi (ATR ×)
            <input type="number" step="0.1" min="0.2" value={form.atrSlMult} onChange={(e) => set('atrSlMult', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2" />
          </label>
          <label className="text-sm">Hedef mesafesi (ATR ×)
            <input type="number" step="0.1" min="0.3" value={form.atrTpMult} onChange={(e) => set('atrTpMult', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2" />
          </label>
        </div>

        {msg && <Msg kind={msg.kind}>{msg.text}</Msg>}
        <button onClick={create} disabled={busy}
          className="w-full rounded-xl bg-emerald-500 py-3 font-bold text-white hover:bg-emerald-600 disabled:opacity-60">
          {busy ? 'Oluşturuluyor…' : '⭐ Botu Oluştur'}
        </button>
      </div>

      {/* OLUŞTURULAN BOTLAR */}
      <div className="lg:col-span-2">
        <h3 className="font-bold text-gray-800 mb-3">Oluşturduğun Botlar</h3>
        {(!meta.customBots || !meta.customBots.length) && (
          <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-gray-400 text-sm">Henüz bot oluşturmadın. Soldan bir tane yarat! ⭐</div>
        )}
        <div className="space-y-3">
          {meta.customBots?.map((b) => (
            <div key={b.id} className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-bold text-gray-800">⭐ {b.name}</div>
                  <div className="text-xs text-gray-400">magic {b.magic} · {b.timeframes.join(', ')} · {b.pairs.join(', ')}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Toggle on={b.enabled} onClick={() => toggleBot(b)} />
                  <button onClick={() => removeBot(b.id)} className="text-xs text-rose-500 hover:underline">Sil</button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {b.indicators.map((i) => <Tag key={i}>{i}</Tag>)}
                {b.ictStrategy && <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 text-xs">ICT</span>}
              </div>
              <div className="grid grid-cols-4 gap-2 mt-3 text-center">
                <Stat label="işlem" value={b.stats?.trades ?? 0} />
                <Stat label="kazanma" value={`%${b.stats?.winRate ?? 0}`} />
                <Stat label="net R" value={fmt(b.stats?.netR ?? 0, 2)} tone={(b.stats?.netR ?? 0) >= 0 ? 'up' : 'dn'} />
                <Stat label="açık" value={b.stats?.open ?? 0} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
function Stat({ label, value, tone }) {
  return <div className="rounded-lg bg-gray-50 py-2"><div className={cls('font-bold', tone === 'up' ? 'text-emerald-600' : tone === 'dn' ? 'text-rose-600' : 'text-gray-800')}>{value}</div><div className="text-[10px] uppercase tracking-wide text-gray-400">{label}</div></div>
}

// ── SEKME 3: YARIŞ ────────────────────────────────────────────────────────────
function YarisTab() {
  const [comp, setComp] = useState(null)
  const [custom, setCustom] = useState([])
  const [gold, setGold] = useState(null)   // altın botu gerçek MT5 sonuçları
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      const [c, b] = await Promise.all([api.get('/bot/competition'), api.get('/bot/builder')])
      setComp(c.data); setCustom(b.data?.customLeaderboard || []); setErr('')
    } catch { setErr('Yarış verisi alınamıyor…') }
    // Altın botu ayrı program (doğrudan MT5); gerçek sonuçlarını da buraya al.
    try {
      const [st, stat] = await Promise.all([api.get('/bot/status'), api.get('/bot/stats')])
      setGold({ status: st.data, stats: stat.data })
    } catch { setGold(null) }
  }, [])
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t) }, [load])

  if (err && !comp) return <Msg kind="warn">{err}</Msg>
  if (!comp) return <Spinner />
  const bots = [...(comp.bots || [])].sort((a, b) => (b.score || 0) - (a.score || 0))
  const champ = comp.champion
  const gs = gold?.stats || null

  return (
    <div className="space-y-5">
      <Msg kind="ok">Tüm botlar aynı MT5 demo hesabında işlem açar ve sonuçlarını kaydeder — <b>altın botu doğrudan</b>, <b>diğerleri köprü üzerinden</b>. Hepsi burada.</Msg>

      {gs && (gs.total > 0 || gold?.status?.connected) && (
        <div className="rounded-2xl border-2 border-amber-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-amber-600">🥇 Altın Botu · GERÇEK MT5 sonuçları</div>
              <div className="text-lg font-extrabold text-gray-800">Bağımsız motor · XAUUSD</div>
            </div>
            <span className={cls('text-xs px-2.5 py-1 rounded-full', gold?.status?.engine_enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500')}>{gold?.status?.engine_enabled ? 'çalışıyor' : 'durdu'}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3 text-center">
            <Stat label="işlem" value={gs.total ?? 0} />
            <Stat label="kazanma" value={`%${fmt(gs.win_rate, 0)}`} />
            <Stat label="gerçek kâr" value={`${fmt(gs.total_profit)} $`} tone={(gs.total_profit ?? 0) >= 0 ? 'up' : 'dn'} />
            <Stat label="PF" value={fmt(gs.profit_factor, 2)} />
            <Stat label="kalite" value={fmt(gs.quality_score, 0)} />
          </div>
        </div>
      )}

      {champ && (
        <div className="rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-white p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-amber-600">👑 Şampiyon · geliştirme önceliği</div>
          <div className="text-2xl font-extrabold text-gray-800 mt-1">{champ.name}</div>
          <div className="flex flex-wrap gap-4 mt-2 text-sm">
            <span>Skor: <b className="text-amber-600">{fmt(champ.score ?? champ.champion_score, 1)}</b></span>
            <span>Net R: <b className={cls((champ.net_r ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600')}>{fmt(champ.net_r, 2)}</b></span>
            <span>İşlem: <b>{champ.closed ?? champ.trades ?? 0}</b></span>
            {champ.consistency_score != null && <span>Tutarlılık: <b>{fmt(champ.consistency_score, 0)}</b></span>}
          </div>
        </div>
      )}

      <div>
        <h3 className="font-bold text-gray-800 mb-2">🏆 Lider Tablosu ({comp.summary?.competitors ?? bots.length} bot)</h3>
        <p className="text-sm text-gray-500 mb-3">Her stratejiye eşit ${fmt(comp.summary?.starting_equity, 0)} sanal sermaye. Kim ne kadar başarılı?</p>
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wide">
              <tr><th className="text-left px-4 py-3">#</th><th className="text-left px-4 py-3">Bot</th><th className="text-right px-4 py-3">Skor</th><th className="text-right px-4 py-3">Net R</th><th className="text-right px-4 py-3">Kazanma</th><th className="text-right px-4 py-3">İşlem</th><th className="text-right px-4 py-3">Durum</th></tr>
            </thead>
            <tbody>
              {bots.map((b, i) => (
                <tr key={b.id} className={cls('border-t border-gray-100', b.is_champion && 'bg-amber-50')}>
                  <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{b.is_champion && '👑 '}{b.name}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmt(b.score, 1)}</td>
                  <td className={cls('px-4 py-3 text-right font-mono', (b.net_r ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600')}>{fmt(b.net_r, 2)}</td>
                  <td className="px-4 py-3 text-right font-mono">%{fmt(b.win_rate ?? b.winRate, 0)}</td>
                  <td className="px-4 py-3 text-right font-mono">{b.closed ?? 0}</td>
                  <td className="px-4 py-3 text-right"><span className={cls('text-xs px-2 py-0.5 rounded-full', b.runtime_status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500')}>{b.runtime_status === 'active' ? 'aktif' : 'bekliyor'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {custom.length > 0 && (
        <div>
          <h3 className="font-bold text-gray-800 mb-2">⭐ Senin Botların (MT5 fiyatıyla ölçüm)</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {custom.map((b) => (
              <div key={b.botId} className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="font-bold text-gray-800">{b.name}</div>
                <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                  <Stat label="işlem" value={b.trades} />
                  <Stat label="kazanma" value={`%${b.winRate}`} />
                  <Stat label="net R" value={fmt(b.netR, 2)} tone={b.netR >= 0 ? 'up' : 'dn'} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── SEKME 4: ALTIN BOTU ───────────────────────────────────────────────────────
function AltinTab() {
  const [status, setStatus] = useState(null)
  const [positions, setPositions] = useState([])
  const [offline, setOffline] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const mounted = useRef(true)

  const load = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([api.get('/bot/status'), api.get('/bot/positions')])
      if (!mounted.current) return
      setStatus(s.data); setPositions(Array.isArray(p.data) ? p.data : (p.data?.positions || [])); setOffline(false)
    } catch (e) {
      const st = e?.response?.status
      if (!e?.response || st === 502 || st === 503 || st === 504) setOffline(true)
    }
  }, [])
  useEffect(() => { mounted.current = true; load(); const t = setInterval(load, 5000); return () => { mounted.current = false; clearInterval(t) } }, [load])

  const engineOn = !!status?.engine_enabled
  const toggleEngine = async () => {
    setBusy(true); setNote('')
    try { await api.post(engineOn ? '/bot/engine/stop' : '/bot/engine/start', {}); await load() }
    catch (e) { setNote(e?.response?.data?.error || 'Komut bota ulaşmadı.'); await load() } finally { setBusy(false) }
  }
  const closePos = async (ticket) => {
    setBusy(true)
    try { const { data } = await api.post('/bot/trade/close', { ticket }); if (data && data.ok === false) setNote(data.message || 'Kapatılamadı.'); await load() }
    catch { setNote('Kapatma başarısız.') } finally { setBusy(false) }
  }

  if (offline && !status) return <Msg kind="warn">Altın botuna ulaşılamıyor. VPS'te köprü/bot çalışıyor mu kontrol et — yeniden deneniyor…</Msg>
  if (!status) return <Spinner />
  const acc = status.account || {}
  const guardOk = status.account_guard?.ok

  return (
    <div className="space-y-4">
      {offline && <Msg kind="warn">Bağlantı koptu — son bilinen değerler gösteriliyor.</Msg>}
      {note && <Msg kind="err">{note}</Msg>}

      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400">Otomatik İşlem</div>
            <div className={cls('text-2xl font-extrabold', engineOn ? 'text-emerald-600' : 'text-gray-400')}>{engineOn ? 'ÇALIŞIYOR' : 'DURDU'}</div>
            {status.active_strategy && <div className="text-xs text-gray-400 mt-0.5">Strateji: {status.active_strategy}</div>}
          </div>
          <div className="flex flex-col items-center gap-1">
            <Toggle on={engineOn} busy={busy} onClick={toggleEngine} />
            <span className="text-xs text-gray-400">{engineOn ? 'Durdurmak için tıkla' : 'Başlatmak için tıkla'}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <Kpi label="Bağlantı" value={status.connected ? 'Bağlı' : 'Kopuk'} tone={status.connected ? 'up' : 'dn'} />
          <Kpi label="Hesap" value={acc.login ? `#${acc.login}` : '—'} />
          <Kpi label="Bakiye" value={acc.balance != null ? `${fmt(acc.balance)} $` : '—'} />
          <Kpi label="Hesap Kilidi" value={guardOk ? 'Güvenli' : 'Engel'} tone={guardOk ? 'up' : 'dn'} />
        </div>
      </div>

      <div>
        <h3 className="font-bold text-gray-800 mb-2">Açık İşlemler ({positions.length})</h3>
        {positions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-gray-400 text-sm">Şu an açık işlem yok.</div>
        ) : (
          <div className="space-y-2">
            {positions.map((p) => (
              <div key={p.ticket || p.id} className="rounded-xl border border-gray-200 bg-white p-3 flex items-center justify-between gap-3">
                <div>
                  <span className={cls('text-sm font-bold', (p.type === 0 || p.direction === 'buy' || p.side === 'long') ? 'text-emerald-600' : 'text-rose-600')}>
                    {(p.type === 0 || p.direction === 'buy' || p.side === 'long') ? '▲ AL' : '▼ SAT'}
                  </span>
                  <span className="ml-2 font-semibold text-gray-800">{p.symbol}</span>
                  <span className="ml-2 text-xs text-gray-400">lot {fmt(p.volume ?? p.lot, 2)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cls('font-mono text-sm', (p.profit ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600')}>{fmt(p.profit)} $</span>
                  <button onClick={() => closePos(p.ticket)} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-60">Kapat</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
function Kpi({ label, value, tone }) {
  return <div className="rounded-xl bg-gray-50 p-3"><div className="text-xs text-gray-400">{label}</div><div className={cls('font-bold', tone === 'up' ? 'text-emerald-600' : tone === 'dn' ? 'text-rose-600' : 'text-gray-800')}>{value}</div></div>
}
