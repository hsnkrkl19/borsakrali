/**
 * forexSignalTracker — POZİSYON birleştirme + iz-süren seviye + yaşam döngüsü.
 *
 * Aynı parite + AYNI YÖN'deki tüm sinyaller (farklı TF'ler ve sonradan yeniden
 * oluşanlar) TEK pozisyonda birleştirilir: tek NO, katkı veren TF'ler listelenir.
 * Yeni sinyal geldikçe seviyeler İZ SÜRER (long: stop yukarı, TP yukarı; short
 * tersi). Farklı yön = AYRI pozisyon (ters sinyal bayrağı korunur).
 *
 * Kapanış: pozisyonun (iz-sürmüş) stop/TP1'i 5m mumlarla kontrol edilir → aynı
 * NO ile teyit. Kalıcılık: Supabase 'bot-state'/'forex/open-signals.json' + disk.
 */

const fs = require('fs');
const path = require('path');
const forexKlines = require('./forexKlines');
const { getInstrument } = require('./forexInstruments');
const learning = require('./forexLearning');

let supa = null, supaEnabled = () => false;
try { const m = require('../../lib/supabase'); supa = m.supabaseAdmin; supaEnabled = m.isSupabaseEnabled; } catch (_) {}

const BUCKET = 'bot-state';
const SUPA_KEY = 'forex/open-signals.json';
const DISK_FILE = process.env.FOREX_OPEN_FILE || path.join(__dirname, '..', '..', 'data', 'forex-open-signals.json');
// Varsayılan: open-signals dosyasının yanı (testler FOREX_OPEN_FILE'ı tmp'e
// yönlendirir — kapanış kaydı da otomatik aynı yere gider, repo data/ kirlenmez)
const CLOSED_FILE = process.env.FOREX_CLOSED_FILE || path.join(path.dirname(DISK_FILE), 'forex-closed-trades.json');
const CLOSED_CAP = 500;

const TF_ORDER = ['5m', '15m', '1h', '4h', '1d'];
const EXPIRE_SEC = { '5m': 3 * 3600, '15m': 6 * 3600, '1h': 18 * 3600, '4h': 2 * 86400, '1d': 4 * 86400 };

// ── Flip-flop fren kapıları (teşhis 2026: cooldown + ters-kilit + konfluans
// yokluğu sürekli aç-kapa üretiyordu). Her biri env ile AYRI kapatılabilir.
const REOPEN_COOLDOWN_SEC = (() => {
  const v = Number(process.env.FOREX_REOPEN_COOLDOWN_MIN);
  return (Number.isFinite(v) && v >= 0 ? v : 30) * 60;
})();
const cooldownOff = () => process.env.FOREX_COOLDOWN_DISABLED === '1';
const reverseLockOff = () => process.env.FOREX_REVERSE_LOCK_DISABLED === '1';
const confluenceGateOff = () => process.env.FOREX_CONFLUENCE_GATE_DISABLED === '1';
const SINGLE_TF_MIN_CONF = (() => {
  const v = Number(process.env.FOREX_SINGLE_TF_MIN_CONF);
  return Number.isFinite(v) && v >= 40 && v <= 100 ? v : 80;
})();

let state = { counter: 0, open: {}, cooldownUntil: {}, version: 2 };
let loaded = false;
let saveTimer = null;

function nowSec() { return Math.floor(Date.now() / 1000); }
function sortTfs(tfs) { return [...new Set(tfs)].sort((a, b) => TF_ORDER.indexOf(a) - TF_ORDER.indexOf(b)); }
function openList() { return Object.values(state.open); }
function findPosition(id, dir) { return openList().find(p => p.instrumentId === id && p.direction === dir); }
function maxExpire(tfs) { return Math.max(...tfs.map(t => EXPIRE_SEC[t] || 86400)); }

// Eski (v1, TF başına kayıt) formatını v2'ye taşı; bozuk/uyumsuzları at.
function sanitizeOpen() {
  for (const code of Object.keys(state.open || {})) {
    const p = state.open[code];
    if (!p || !Array.isArray(p.tfs)) {
      if (p && typeof p.tf === 'string') { p.tfs = [p.tf]; if (p.mt5Symbol == null) p.mt5Symbol = p.instrumentId; delete p.tf; }
      else delete state.open[code];
    }
  }
}

async function load() {
  if (loaded) return;
  loaded = true;
  let got = false;
  if (supaEnabled && supaEnabled()) {
    try {
      const { data } = await Promise.race([
        supa.storage.from(BUCKET).download(SUPA_KEY),
        new Promise((_, rej) => setTimeout(() => rej(new Error('supa-timeout')), 8000)),
      ]);
      if (data) {
        const text = typeof data.text === 'function' ? await data.text() : Buffer.from(await data.arrayBuffer()).toString('utf8');
        const p = JSON.parse(text);
        if (p && p.open) { state = { counter: p.counter || 0, open: p.open || {}, cooldownUntil: p.cooldownUntil || {}, version: 2, resetTag: p.resetTag || null }; got = true; }
      }
    } catch (_) {}
  }
  if (!got) {
    try { if (fs.existsSync(DISK_FILE)) { const p = JSON.parse(fs.readFileSync(DISK_FILE, 'utf8')); if (p && p.open) state = { counter: p.counter || 0, open: p.open || {}, cooldownUntil: p.cooldownUntil || {}, version: 2, resetTag: p.resetTag || null }; } } catch (_) {}
  }
  sanitizeOpen();
  // Öğrenme durumunu da restore et (devre-kesiciler deploy'u atlatır)
  try { await learning.restore(); } catch (_) {}
  // Tek-seferlik SIFIRLAMA: FOREX_RESET etiketi değişince TÜM açık sinyaller + sayaç
  // sıfırlanır (kullanıcı "önceki sinyalleri sil, sıfırdan başla"). NO #001'den başlar.
  const tag = process.env.FOREX_RESET;
  if (tag && state.resetTag !== tag) { state = { counter: 0, open: {}, cooldownUntil: {}, version: 2, resetTag: tag }; persist(); }
}

function persist() {
  try {
    const dir = path.dirname(DISK_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DISK_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (_) {}
  if (supaEnabled && supaEnabled()) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try { await supa.storage.from(BUCKET).upload(SUPA_KEY, Buffer.from(JSON.stringify(state), 'utf8'), { contentType: 'application/json', upsert: true }); } catch (_) {}
    }, 2500);
    if (saveTimer.unref) saveTimer.unref();
  }
}

function nextCode() {
  state.counter = (state.counter || 0) + 1;
  const n = state.counter;
  return String(n % 1000).padStart(3, '0') + String.fromCharCode(65 + Math.floor(n / 1000) % 26);
}

// İz süren STOP — FİYAT bazlı (orijinal risk mesafesi korunur, sadece lehe kayar).
// TP açılışta SABİT kalır (tutarlılık; trailing TP hedefi ulaşılmaz yapıyordu).
// Not: stop sinyalin hesapladığı stop'a göre DEĞİL fiyata göre kayar → düşük
// TF'in dar stop'u pozisyonu bozmaz; kapanış kontrolü stopSetSec ile ileri-yönlü.
function trail(dir, cur, basis, p) {
  const r = (v) => +Number(v).toFixed(p);
  const dist = cur.origStopDist != null ? cur.origStopDist : Math.abs(cur.entry - cur.stop);
  const price = basis.entry; // yeni taramadaki canlı fiyat
  if (dir === 'long') {
    return { stop: r(Math.max(cur.stop, price - dist)), target1: cur.target1, target2: cur.target2 };
  }
  return { stop: r(Math.min(cur.stop, price + dist)), target1: cur.target1, target2: cur.target2 };
}

/**
 * Uygun (eşik üstü) sinyalleri pozisyonlara işle. Olay listesi döner:
 *   { type:'new'|'update', position, addedTfs, stopChanged, tpChanged, prev, reverseOf }
 */
async function syncPositions(eligible) {
  await load();
  const groups = new Map();
  for (const s of (eligible || [])) {
    const k = `${s.id}:${s.direction}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  const events = [];
  for (const sigs of groups.values()) {
    sigs.sort((a, b) => b.confidence - a.confidence);
    const basis = sigs[0];
    const id = basis.id, dir = basis.direction, p = basis.precision ?? 4;
    const tfs = sortTfs(sigs.map(s => s.tf));
    const opp = dir === 'long' ? 'short' : 'long';
    // Öğrenme: devre-kesilmiş enstrümanın YENİ pozisyonu gölge (sanal izleme)
    const shadow = learning.modeFor(id) === 'shadow';
    // Ters bayrağı KENDİ evreninde (gölge, gerçek ters-kilidini tetiklemesin)
    const reverseOf = openList().filter(x => x.instrumentId === id && x.direction === opp && !!x.shadow === shadow).map(x => x.code);
    let existing = findPosition(id, dir);

    // Slot tahliyesi: enstrüman GERÇEĞE dönmüş ama eski GÖLGE pozisyonu slotu
    // işgal ediyorsa sanal pozisyon silinir — gerçek sinyal 4 güne kadar
    // bastırılmasın (gölge paradan bağımsız, sessizce düşer).
    if (!shadow && existing && existing.shadow) {
      delete state.open[existing.code];
      existing = null;
    }

    if (!existing) {
      // ── Flip-flop frenleri (yalnız YENİ pozisyon; mevcutların izi sürer) ──
      // 1) Kapanış-sonrası cooldown: aynı enstrüman+yön hemen yeniden açılamaz
      //    (anahtar evrene ayrık: gölge kapanış gerçeği kilitlemez)
      if (!cooldownOff() && (state.cooldownUntil[`${shadow ? 'shadow:' : ''}${id}:${dir}`] || 0) > nowSec()) continue;
      // 2) Ters-yön kilidi: aynı evrende zıt pozisyon açıkken yenisi açılmaz
      //    (köprü hedge karmaşasının KAYNAK çözümü)
      if (!reverseLockOff() && reverseOf.length) continue;
      // 3) Konfluans kapısı: tek TF'lik sinyal ancak çok yüksek güvenle açılır
      if (!confluenceGateOff() && tfs.length < 2 && basis.confidence < SINGLE_TF_MIN_CONF) continue;

      const code = nextCode();
      const units = (basis.sizing && basis.entry && basis.stop) ? basis.sizing.riskUsd / Math.abs(basis.entry - basis.stop) : null;
      const pos = {
        code, instrumentId: id, symbol: basis.symbol, direction: dir, precision: p,
        entry: basis.entry, stop: basis.stop, target1: basis.target1, target2: basis.target2,
        tfs, confidence: basis.confidence, rr1: basis.rr1, rr2: basis.rr2,
        mt5Symbol: basis.mt5?.symbol || id,
        marginUsd: basis.sizing?.requiredMarginUsd ?? null, marginPct: basis.sizing?.marginPct ?? null, units,
        origStopDist: Math.abs(basis.entry - basis.stop),
        issuedAt: new Date().toISOString(), issueTimeSec: nowSec(), lastUpdateSec: nowSec(), stopSetSec: nowSec(),
      };
      if (shadow) pos.shadow = true;
      state.open[code] = pos;
      events.push({ type: 'new', position: pos, addedTfs: tfs, reverseOf });
    } else {
      const tr = trail(dir, existing, basis, existing.precision ?? 4);
      const stopChanged = tr.stop !== existing.stop;
      const newTfs = tfs.filter(t => !existing.tfs.includes(t));
      const tfChanged = newTfs.length > 0;
      if (stopChanged || tfChanged) {
        const prev = { stop: existing.stop, target1: existing.target1, target2: existing.target2, tfs: existing.tfs.slice() };
        if (stopChanged) { existing.stop = tr.stop; existing.stopSetSec = nowSec(); } // iz süren stop ileri-yönlü değerlendirilir
        // TP sabit (existing.target1/2 değişmez)
        existing.tfs = sortTfs([...existing.tfs, ...tfs]);
        existing.confidence = Math.max(existing.confidence, basis.confidence);
        existing.lastUpdateSec = nowSec();
        events.push({ type: 'update', position: existing, addedTfs: newTfs, stopChanged, tpChanged: false, prev, reverseOf, curPrice: basis.entry });
      }
    }
  }
  if (events.length) persist();
  return events;
}

// Tek pozisyonun kapanış kontrolü (iz-sürmüş stop/TP1, 5m mumlar)
async function evalOne(p) {
  const inst = getInstrument(p.instrumentId);
  if (!inst) return null;
  const candles = await forexKlines.fetchCandles(inst.yahoo, '5m', 300);
  const isLong = p.direction === 'long';
  // Stop, YALNIZ o seviye konduktan sonraki mumlarla değerlendirilir (iz süren
  // stop yukarı kayınca eski geri-çekilmeler geriye dönük "stop" tetiklemesin).
  const stopSince = p.stopSetSec || p.issueTimeSec;
  let outcome = null, exit = null, exitTimeSec = null;
  // YALNIZ KAPANMIŞ mumlar: son mum hâlâ oluşuyor (5m TTL 4dk) → geçici fitil
  // gerçekleşmemiş bir TP/SL'i tetiklerdi (hayalet kapanış + yanlış %).
  const closed = (candles && candles.length) ? candles.slice(0, -1) : [];
  for (const b of closed) {
    if (b.time <= p.issueTimeSec) continue;
    const slHit = (b.time > stopSince) && (isLong ? b.low <= p.stop : b.high >= p.stop);
    const tpHit = isLong ? b.high >= p.target1 : b.low <= p.target1;
    if (!slHit && !tpHit) continue;
    // Çıkış fiyatı seviyeye PİNLENMEZ: mum SEVİYEYİ AŞARAK açıldıysa (hafta sonu
    // gap'i vb.) gerçekleşebilir dolum = açılış fiyatı. Normal içi-mum değişte
    // açılış seviyenin güvenli tarafında olduğundan Math.min/max seviyeyi döndürür.
    const slExit = isLong ? Math.min(p.stop, b.open) : Math.max(p.stop, b.open);
    const tpExit = isLong ? Math.max(p.target1, b.open) : Math.min(p.target1, b.open);
    // TRAIL/SL ayrımı GERÇEK çıkışa göre (gap zararı "kilitli kâr" görünmesin).
    const takeSl = () => { exit = slExit; outcome = (isLong ? exit >= p.entry : exit <= p.entry) ? 'TRAIL' : 'SL'; };
    const takeTp = () => { exit = tpExit; outcome = 'TP1'; };
    if (slHit && tpHit) {
      // Aynı mumda hem stop hem hedef değdi: mum AÇILIŞINA daha yakın seviyeye
      // fiyat ÖNCE değmiştir → kazananı stop'a yazma (BUG3), açılışa göre karar ver.
      const dStop = Math.abs(b.open - p.stop), dTp = Math.abs(b.open - p.target1);
      if (dTp <= dStop) takeTp(); else takeSl();
    } else if (slHit) { takeSl(); }
    else { takeTp(); }
    exitTimeSec = b.time;
    break;
  }
  // ⚠️ "SÜRE DOLDU" (EXPIRE) kapanışı KALDIRILDI (kullanıcı isteği). Pozisyon yalnız
  // TP1 / SL / TRAIL ile kapanır; çok eskiyenler checkClosures'da SESSİZCE temizlenir.
  if (!outcome) return null;
  const dir = isLong ? 1 : -1;
  const pnlPct = +(((exit - p.entry) / p.entry) * 100 * dir).toFixed(3);
  const pnlUsd = p.units != null ? +(p.units * (exit - p.entry) * dir).toFixed(2) : null;
  // R-katsayısı = fiyat hareketi / açılıştaki stop mesafesi (lot'tan bağımsız —
  // öğrenme katmanının ana ölçüsü)
  const rMultiple = p.origStopDist > 0 ? +(((exit - p.entry) * dir) / p.origStopDist).toFixed(2) : null;
  return {
    code: p.code, instrumentId: p.instrumentId, symbol: p.symbol, direction: p.direction,
    tfs: p.tfs, precision: p.precision, entry: p.entry, exit, outcome, pnlPct, pnlUsd,
    rMultiple, origStopDist: p.origStopDist ?? null, confidence: p.confidence ?? null,
    shadow: !!p.shadow, issuedAt: p.issuedAt, issueTimeSec: p.issueTimeSec ?? null,
    exitTimeSec, closedAt: new Date().toISOString(),
  };
}

// Kapanan işlemler KALICI kaydedilir (öğrenme + denetim; eskiden yalnız
// Telegram'a basılıp kayboluyordu — öğrenmenin ön şartı bu dosya).
function appendClosed(ev) {
  try {
    let cur = { trades: [] };
    try { if (fs.existsSync(CLOSED_FILE)) cur = JSON.parse(fs.readFileSync(CLOSED_FILE, 'utf8')) || { trades: [] }; } catch (_) {}
    if (!Array.isArray(cur.trades)) cur.trades = [];
    cur.trades.push(ev);
    if (cur.trades.length > CLOSED_CAP) cur.trades = cur.trades.slice(-CLOSED_CAP);
    const dir = path.dirname(CLOSED_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CLOSED_FILE, JSON.stringify(cur, null, 2), 'utf8');
  } catch (_) {}
}

async function checkClosures() {
  await load();
  const events = [];
  let changed = false;
  for (const p of openList()) {
    try {
      const ev = await evalOne(p);
      if (ev) {
        delete state.open[p.code];
        // Flip-flop freni: kapanan enstrüman+yön cooldown'a girer (evrene ayrık)
        state.cooldownUntil[`${p.shadow ? 'shadow:' : ''}${p.instrumentId}:${p.direction}`] = nowSec() + REOPEN_COOLDOWN_SEC;
        appendClosed(ev);
        try { learning.recordClose(ev.instrumentId, { r: ev.rMultiple, usd: ev.pnlUsd, outcome: ev.outcome, t: ev.exitTimeSec, shadow: ev.shadow }); } catch (_) {}
        // GÖLGE kapanışlar Telegram'a/istatistiğe GİTMEZ — yalnız öğrenmeye aktı
        if (!ev.shadow) events.push(ev);
        changed = true;
      } else if (nowSec() - p.issueTimeSec > maxExpire(p.tfs)) { delete state.open[p.code]; changed = true; } // SESSİZ süre temizliği (mesaj YOK)
    } catch (_) {}
  }
  // cooldown sözlüğü şişmesin
  for (const k of Object.keys(state.cooldownUntil)) if (state.cooldownUntil[k] <= nowSec()) delete state.cooldownUntil[k];
  if (changed) persist();
  return events;
}

// getOpen = yalnız GERÇEK pozisyonlar: köprü beslemesi (/api/forex/positions)
// ve Telegram bu listeden beslenir. Gölge pozisyonlar ayrı sorgulanır.
function getOpen() { return openList().filter(p => !p.shadow); }
function getOpenShadow() { return openList().filter(p => p.shadow); }

function getRecentClosed(limit = 50) {
  try {
    if (fs.existsSync(CLOSED_FILE)) {
      const cur = JSON.parse(fs.readFileSync(CLOSED_FILE, 'utf8'));
      if (cur && Array.isArray(cur.trades)) return cur.trades.slice(-limit).reverse();
    }
  } catch (_) {}
  return [];
}

module.exports = { load, syncPositions, checkClosures, getOpen, getOpenShadow, getRecentClosed };
