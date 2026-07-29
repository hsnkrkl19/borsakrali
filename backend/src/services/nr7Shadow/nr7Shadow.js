/**
 * 🔬 NR7-XAU GÖLGE BOTU — kenar-lab Tur-1 adayının CANLI İLERİ-TESTİ (SANAL).
 *
 * GERÇEK EMİR AÇMAZ. Amaç: backtest'te tek sağ kalan adayın (günlük NR7 sıkışması →
 * ertesi gün 1h kırılım yönünde gir, stop=dünün karşı ucu, gün sonu çık) gerçek
 * zamanda, geleceği görmeden aynı sayıları üretip üretmediğini ölçmek. ≥4 hafta
 * pozitif + backtest'le tutarlı olmadan GERÇEK emre BAĞLANMAZ (kenar-lab kuralı).
 *
 * Mantık lab'daki nr7() ile BİREBİR: sinyal 1h bar KAPANIŞINDA, dolum SONRAKİ
 * barın AÇILIŞINDA; stop dokunuşu bar H/L ile tespit → çıkış sonraki bar açılışı;
 * gün sonu = günün son barının kapanışı. Maliyet $0.40/oz-turu düşülür.
 *
 * Tasarım: her tur (5 dk) GÜN BAŞTAN deterministik simüle edilir (idempotent) —
 * kaydedilmiş olaylarla fark alınır, yalnız YENİ olaylar Telegram'a gider →
 * restart/deploy güvenli, durum sürüklenmez.
 *
 * Kill: NR7_SHADOW_DISABLED=1 (tamamen) · NR7_SHADOW_PUSH_DISABLED=1 (yalnız log).
 * FOREX_ONLY_MODE'dan MUAF (sanal — emir yolu yok). Kalıcılık: disk + Supabase
 * 'bot-state/nr7-shadow/state.json'.
 */

const fs = require('fs');
const path = require('path');
const forexKlines = require('../forex/forexKlines');
const telegramService = require('../telegramService');
const signalDelivery = require('../signalDelivery');
const competitionManager = require('../botCompetition/competitionManager');
const { paperNotificationSuppressed } = require('../mt5TradeNotifier');
const logger = require('../../utils/logger');

let supa = null, supaEnabled = () => false;
try { const m = require('../../lib/supabase'); supa = m.supabaseAdmin; supaEnabled = m.isSupabaseEnabled; } catch (_) {}

const BUCKET = 'bot-state';
const SUPA_KEY = 'nr7-shadow/state.json';
const DISK_FILE = process.env.NR7_SHADOW_FILE || path.join(__dirname, '..', '..', 'data', 'nr7-shadow.json');

const YAHOO = 'GC=F';
const COST_RT = 0.40;           // $/oz işlem-turu (spread+komisyon+kayma)
const TICK_MS = 5 * 60 * 1000;  // 5 dk

const off = () => process.env.NR7_SHADOW_DISABLED === '1';
const pushOff = () => process.env.NR7_SHADOW_PUSH_DISABLED === '1';

let state = { trades: [], sent: {}, open: null, version: 1 };
let loaded = false;
let timer = null;
let saveTimer = null;

function dayKeyOf(sec) { return new Date(sec * 1000).toISOString().slice(0, 10); }

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    if (fs.existsSync(DISK_FILE)) {
      const p = JSON.parse(fs.readFileSync(DISK_FILE, 'utf8'));
      if (p && Array.isArray(p.trades)) state = { ...state, ...p };
    }
  } catch (_) {}
  if (supaEnabled && supaEnabled()) {
    try {
      const { data } = await Promise.race([
        supa.storage.from(BUCKET).download(SUPA_KEY),
        new Promise((_, rej) => setTimeout(() => rej(new Error('supa-timeout')), 8000)),
      ]);
      if (data) {
        const text = typeof data.text === 'function' ? await data.text() : Buffer.from(await data.arrayBuffer()).toString('utf8');
        const p = JSON.parse(text);
        if (p && typeof p === 'object') {
          // ⚠️ DEDUP (sent) HER ZAMAN birleştirilir — trades sayısına BAKILMAZ.
          // Eski kod `p.trades.length > state.trades.length` kapısına bağlıydı:
          // gün içinde giriş olup henüz KAPANIŞ olmadığında (trades=0) dedup geri
          // YÜKLENMİYOR, Render'da disk de geçici olduğu için her soğuk başlangıç
          // aynı girişi TEKRAR duyuruyordu (2026-07-21: yüzlerce mükerrer mesaj).
          state.sent = { ...(p.sent || {}), ...(state.sent || {}) };
          // İşlem geçmişinde en eksiksiz olan kazanır (deploy taze diski ezmesin)
          if (Array.isArray(p.trades) && p.trades.length > state.trades.length) {
            state = { ...state, ...p, sent: state.sent };
          }
        }
      }
    } catch (_) {}
  }
}

function writeDisk() {
  try {
    const dir = path.dirname(DISK_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DISK_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (_) {}
}

async function uploadSupa() {
  if (!(supaEnabled && supaEnabled())) return;
  try { await supa.storage.from(BUCKET).upload(SUPA_KEY, Buffer.from(JSON.stringify(state), 'utf8'), { contentType: 'application/json', upsert: true }); } catch (_) {}
}

function persist() {
  writeDisk();
  if (supaEnabled && supaEnabled()) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { uploadSupa(); }, 2500);
    if (saveTimer.unref) saveTimer.unref();
  }
}

// Duyuru anında BEKLEYEREK kaydet. Debounce+unref'li yükleme, süreç hemen
// kapanırsa (Render soğuk başlangıç/deploy) HİÇ çalışmıyordu → dedup anahtarı
// Supabase'e ulaşmıyor, sonraki boot aynı olayı tekrar duyuruyordu.
async function persistNow() {
  writeDisk();
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  await uploadSupa();
}

async function say(key, msg) {
  if (state.sent[key]) return;      // dedup: aynı olay bir kez
  state.sent[key] = Math.floor(Date.now() / 1000);
  // sözlük şişmesin: 14 günden eskiyi at
  const cut = Math.floor(Date.now() / 1000) - 14 * 86400;
  for (const k of Object.keys(state.sent)) if (state.sent[k] < cut) delete state.sent[k];
  // Mesajı göndermeden ÖNCE dedup anahtarını KALICI yaz. Bir mesajı kaçırmak,
  // yüzlerce mükerrer mesaj atmaktan iyidir.
  await persistNow();
  logger.info(`[NR7-Gölge] ${msg.replace(/\n/g, ' · ')}`);
  if (pushOff() || paperNotificationSuppressed('nr7-shadow')) return;
  const chat = signalDelivery.signalChannel();
  if (!chat) return;
  try { await telegramService.sendMessage(chat, msg); } catch (e) { logger.error(`[NR7-Gölge] telegram: ${e.message}`); }
}

/** Dünün (son KAPALI günlük bar) NR7 olup olmadığı + sınırları. */
function nr7Setup(daily) {
  if (!daily || daily.length < 9) return null;
  // Son bar oluşuyor olabilir. GC=F 1d serisinde ayrı "kotasyon satırı" YOK
  // (ölçüldü 2026-07-23) → burada closedBars ile slice(0,-1) aynı sonucu verir;
  // yine de tek sözleşmeye bağlanıyor ki Yahoo şekli değişirse sessizce bozulmasın.
  const closed = forexKlines.closedBars(daily, forexKlines.TF_MS['1d']);
  const last7 = closed.slice(-7);
  if (last7.length < 7) return null;
  const ranges = last7.map(b => b.high - b.low);
  const y = last7[6];
  if (ranges[6] > Math.min(...ranges) + 1e-9) return null;
  return { hi: y.high, lo: y.low, nr7Day: dayKeyOf(y.time), tradeDay: null };
}

/**
 * Günü lab.nr7() ile birebir simüle et (kapalı 1h barlar üstünde).
 * Dönen olaylar: [{type:'fill'|'exit', dir, px, timeSec, reason?}] + açık poz.
 */
function simDay(bars, hi, lo) {
  const ev = [];
  let cur = null;      // {dir, stop, entryPx, entryTime}
  let pend = null;     // {dir, stop} — sonraki bar açılışında dolacak
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (pend) {
      cur = { dir: pend.dir, stop: pend.stop, entryPx: b.open, entryTime: b.time };
      ev.push({ type: 'fill', dir: cur.dir, px: b.open, timeSec: b.time });
      pend = null;
    }
    if (cur) {
      const hitSl = cur.dir > 0 ? b.low <= cur.stop : b.high >= cur.stop;
      const lastBar = i === bars.length - 1;
      if (hitSl && !lastBar) {
        // lab: stop dokunan barın kapanışında karar, DOLUM sonraki açılış
        const nb = bars[i + 1];
        ev.push({ type: 'exit', dir: cur.dir, px: nb.open, timeSec: nb.time, reason: 'STOP', entryPx: cur.entryPx });
        cur = null;
        i++; // çıkış barını tükettik (aynı barda yeni dolum lab'da da yok)
        continue;
      }
      if (lastBar) {
        // gün sonu: son barın kapanışıyla çık (gün hâlâ sürüyorsa çağıran karar verir)
        ev.push({ type: 'eod', dir: cur.dir, px: b.close, timeSec: b.time, entryPx: cur.entryPx });
        cur = null;
      }
      continue;
    }
    // pozisyon yok → kırılım ara (bar kapanışıyla)
    if (b.close > hi) pend = { dir: 1, stop: lo };
    else if (b.close < lo) pend = { dir: -1, stop: hi };
  }
  return { events: ev, pending: pend };
}

async function tick(now = Date.now()) {
  if (off()) return { skipped: 'disabled' };
  await load();
  const daily = await forexKlines.fetchCandles(YAHOO, '1d', 30);
  const setup = nr7Setup(daily);
  const today = new Date(now).toISOString().slice(0, 10);
  if (!setup) return { setup: false };
  // NR7 dünse bugün işlem günü. (Hafta sonu/tatilde 1h bar zaten gelmez.)
  const h1 = await forexKlines.fetchCandles(YAHOO, '1h', 80);
  if (!h1 || h1.length < 3) return { setup: true, bars: 0 };
  // ⚠️ slice(0,-1) BURADA YETMİYORDU: GC=F 1h serisinde Yahoo, forming barın
  // ardına bir "anlık kotasyon" satırı ekliyor (canlı ölçüldü) → slice yalnız
  // onu atıp YARIM 1h barı simülasyona sokuyordu. simDay o bardan fill/stop
  // üretince competitionManager.recordOpen kalıcı pozisyon açıyor ve signalId
  // bar saatine sabit olduğu için bar kapanışta çürüse bile geri alınmıyordu.
  const closed = forexKlines.closedBars(h1, forexKlines.TF_MS['1h'])
    .filter(b => dayKeyOf(b.time) === today);
  if (!closed.length) return { setup: true, bars: 0 };
  const dayOver = new Date(now).getUTCHours() >= 22; // GC=F günü ~21:00 UTC biter; 22'den sonra gün kapalı say
  const sim = simDay(closed, setup.hi, setup.lo);

  for (const e of sim.events) {
    const key = `${today}:${e.type}:${e.timeSec}:${e.dir}`;
    if (e.type === 'fill') {
      try {
        competitionManager.recordOpen('nr7-shadow', {
          signalId: key,
          symbol: 'XAUUSD',
          strategy: 'nr7-xau',
          tf: '1h',
          direction: e.dir > 0 ? 'long' : 'short',
          entry: e.px,
          stop: e.dir > 0 ? setup.lo : setup.hi,
          issuedAt: new Date(e.timeSec * 1000).toISOString(),
        });
      } catch (raceError) {
        logger.warn(`[BotYarisi] nr7 açılış kaydı atlandı: ${raceError.message}`);
      }
      await say(key, `🔬 <b>GÖLGE (SANAL) NR7-XAU</b> — gerçek emir DEĞİL\n${e.dir > 0 ? '🟢 LONG' : '🔴 SHORT'} giriş ${e.px.toFixed(2)}\nNR7 günü: ${setup.nr7Day} · stop ${(e.dir > 0 ? setup.lo : setup.hi).toFixed(2)} · çıkış: stop/gün sonu`);
    } else if (e.type === 'exit' || (e.type === 'eod' && dayOver)) {
      const pnl = e.dir * (e.px - e.entryPx) - COST_RT;
      if (!state.sent[key]) {
        try {
          competitionManager.recordClose('nr7-shadow', {
            symbol: 'XAUUSD', strategy: 'nr7-xau', tf: '1h',
            exit: e.px, outcome: e.reason || 'GUN_SONU',
            closedAt: new Date(e.timeSec * 1000).toISOString(),
          });
        } catch (raceError) {
          logger.warn(`[BotYarisi] nr7 kapanış kaydı atlandı: ${raceError.message}`);
        }
        state.trades.push({ day: today, dir: e.dir, entry: e.entryPx, exit: e.px, pnl: +pnl.toFixed(2), reason: e.reason || 'GUN_SONU', t: e.timeSec });
        const n = state.trades.length, w = state.trades.filter(x => x.pnl > 0).length;
        const tot = state.trades.reduce((a, x) => a + x.pnl, 0);
        await say(key, `🔬 <b>GÖLGE NR7-XAU KAPANIŞ</b> (sanal)\n${e.dir > 0 ? 'LONG' : 'SHORT'} ${e.entryPx.toFixed(2)} → ${e.px.toFixed(2)} · <b>${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}$/oz</b> (${e.reason || 'gün sonu'})\nİleri-test: ${n} işlem · isabet %${n ? Math.round(100 * w / n) : 0} · toplam ${tot >= 0 ? '+' : ''}${tot.toFixed(2)}$/oz\n(backtest referansı: işlem-başı +6.9$/oz, PF 1.67)`);
      }
    }
  }
  return { setup: true, bars: closed.length, events: sim.events.length, trades: state.trades.length };
}

function start() {
  if (off()) { logger.info('[NR7-Gölge] NR7_SHADOW_DISABLED=1 — kapalı'); return; }
  if (timer) return;
  timer = setInterval(() => { tick().catch(e => logger.error(`[NR7-Gölge] tick: ${e.message}`)); }, TICK_MS);
  if (timer.unref) timer.unref();
  tick().catch(() => {});
  logger.info('[NR7-Gölge] başladı — 5dk\'da bir sanal NR7-XAU ileri-testi (gerçek emir YOK)');
}

function stop() { if (timer) { clearInterval(timer); timer = null; } }
function summary() { const n = state.trades.length, w = state.trades.filter(x => x.pnl > 0).length; return { n, winRate: n ? Math.round(100 * w / n) : null, totalUsdOz: +state.trades.reduce((a, x) => a + x.pnl, 0).toFixed(2), open: state.open, trades: state.trades.slice(-20) }; }
function _resetForTest() { state = { trades: [], sent: {}, open: null, version: 1 }; loaded = true; }
// Süreç yeniden başlamasını simüle et (loaded=false → sonraki tick load() ile
// diskten/Supabase'ten dedup sözlüğünü geri yükler).
function _setLoadedForTest(v) { loaded = !!v; }

module.exports = { start, stop, tick, summary, nr7Setup, simDay, _resetForTest, _setLoadedForTest, COST_RT };
