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
const dailyGuard = require('./forexDailyGuard');
const statsStore = require('./forexStatsStore');
const brokerPrices = require('./brokerPrices');
const logger = require('../../utils/logger');
const beast = require('../beast/beastIndicators'); // seri-dönen, ileri-bakışsız göstergeler (reversal + trailing)

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

function envNum(name, def) { const v = Number(process.env[name]); return Number.isFinite(v) ? v : def; }

// ── Aşırı-uzama (anti-FOMO) kapısı ──────────────────────────────────────────
// Sorun: güçlü trendde tüm teknikler aynı yönü oyluyor → konfluans+güven yüksek →
// motor fiyat ÇOKTAN uzamışken (tepeden/dipten) yeni pozisyon açıyor = kovalama.
// Kapı: RSI aşırı bölgedeyse VEYA fiyat o TF'in EMA20'sinden çok uzaksa YENİ
// pozisyon açma (mevcutların izi sürmeye devam eder — kapı yalnız açılışa uygulanır).
// Kapatma: FOREX_ANTIFOMO_DISABLED=1. Eşikler env ile ayarlanır.
const antiFomoOff = () => process.env.FOREX_ANTIFOMO_DISABLED === '1';
function extMaxFor(cls) {
  if (cls === 'crypto') return envNum('FOREX_ANTIFOMO_EXT_CRYPTO', 5.0);
  if (cls === 'metal') return envNum('FOREX_ANTIFOMO_EXT_METAL', 3.0);
  if (cls === 'index') return envNum('FOREX_ANTIFOMO_EXT_INDEX', 2.5);
  return envNum('FOREX_ANTIFOMO_EXT_FX', 1.2);  // fx (major pariteler)
}
// Engellenirse { reason } döner (loglanır); değilse null.
// ⚠️ TREND İSTİSNASI (2026-07-06): RSI-aşırı vetosu düşen piyasada TEK YÖNLÜ vana
// oluyordu — RSI saatlerce ≤25 kaldığından TÜM trend-yönlü SHORT'lar veto edilirken
// ters-yön dip-alım LONG'ları hiçbir eşiğe takılmıyordu (gece boyu yalnız-long,
// tamamı zarar). Trend yönle UYUMLU ve güçlüyse (ADX + DI) RSI-aşırı bölge kovalama
// değil TREND DEVAMIdır → RSI vetosu atlanır; EMA20 uzama vetosu HER DURUMDA sürer.
function antiFomoBlock(s) {
  if (antiFomoOff()) return null;
  const ind = s.indicators;
  if (!ind || ind.rsi == null) return null;  // veri yok → fail-open (engelleme)
  const hot = envNum('FOREX_ANTIFOMO_RSI_HOT', 75);
  const cold = envNum('FOREX_ANTIFOMO_RSI_COLD', 25);
  const extMax = extMaxFor(s.class);
  const extPct = (ind.ema20 && s.entry) ? ((s.entry - ind.ema20) / ind.ema20) * 100 : null;
  // Rejim = motorun 4h+1d mutabakatı (s.regime, forexEngineMTF ekler). Giriş-TF'inin
  // kendi ADX/DI'sı KULLANILMAZ: RSI-aşırısı zaten aynı fiyat itişinin ürünü olduğundan
  // kendi kendini onaylıyordu (review) — 15m sıçraması kendini "trend" sanıp vetoyu deler,
  // olayın FOMO girişi geri gelirdi. Rejim yok/ters → veto aynen uygulanır.
  const withTrend = s.regime != null && s.regime === s.direction;
  if (s.direction === 'long') {
    if (ind.rsi >= hot && !withTrend) return { reason: `RSI ${ind.rsi}≥${hot} (aşırı alım)` };
    if (extPct != null && extPct >= extMax) return { reason: `fiyat EMA20'nin +%${extPct.toFixed(1)} üstünde (≥${extMax})` };
  } else if (s.direction === 'short') {
    if (ind.rsi <= cold && !withTrend) return { reason: `RSI ${ind.rsi}≤${cold} (aşırı satım)` };
    if (extPct != null && extPct <= -extMax) return { reason: `fiyat EMA20'nin -%${(-extPct).toFixed(1)} altında (≥${extMax})` };
  }
  return null;
}

// ── Hafta sonu kripto freni ─────────────────────────────────────────────────
// Forex/altın/endeks kapalıyken tek işleyen KRİPTO (7/24). Thin + gap'li piyasada
// FOMO en çok burada vuruyor → hafta sonu yalnız ÇOK yüksek güvenle yeni kripto aç.
// Pencere = trade_guard.py ile birebir: Cuma 23:45 TSI → Pazartesi 03:00 TSI.
// Kapatma: FOREX_WEEKEND_CRYPTO_GATE_DISABLED=1 (eşik: FOREX_WEEKEND_CRYPTO_MIN_CONF).
const TR_OFFSET_MS = 3 * 3600 * 1000;  // Türkiye sabit UTC+3 (DST yok)
function inWeekendWindow(now = Date.now()) {
  const tr = new Date(now + TR_OFFSET_MS);
  const dow = tr.getUTCDay();  // 0=Paz 1=Pzt ... 5=Cuma 6=Cmt
  const min = tr.getUTCHours() * 60 + tr.getUTCMinutes();
  if (dow === 6 || dow === 0) return true;             // Cmt / Paz tam gün
  if (dow === 5 && min >= 23 * 60 + 45) return true;   // Cuma 23:45+
  if (dow === 1 && min < 3 * 60) return true;          // Pzt <03:00
  return false;
}
function weekendCryptoBlock(s) {
  if (process.env.FOREX_WEEKEND_CRYPTO_GATE_DISABLED === '1') return null;
  if (s.class !== 'crypto' || !inWeekendWindow()) return null;
  const minConf = envNum('FOREX_WEEKEND_CRYPTO_MIN_CONF', 85);
  return (s.confidence < minConf)
    ? { reason: `hafta sonu kripto — güven ${s.confidence}<${minConf}` }
    : null;
}

// ── FAZ 1+2: Akıllı trailing + 1dk reversal-exit ("dönüşe kadar tut") ─────────
// HEPSİ VARSAYILAN KAPALI (geri-dönüş güvenli). FOREX_CARRY_TO_REVERSAL=1 ile açılır:
// TP1 artık pozisyonu KAPATMAZ (target2 hard-cap kalır), pozisyon GERÇEK dönüşe kadar
// taşınır; koruma = sinyalden-bağımsız akıllı trailing (kâr kilidi) + 1dk yapı-kırılımı/
// momentum reversal. Adversaryal review'un mustFix'leri gömülü (donuk-trailing, tp=0
// tehlikesi, veri fail-SAFE, whipsaw sağlamlaştırma).
const carryToReversal = () => process.env.FOREX_CARRY_TO_REVERSAL === '1';
const reversalOff = () => process.env.FOREX_REVERSAL_DISABLED === '1';
// Akıllı trailing carry AÇIKKEN ZORUNLU (yoksa TP1 kalkınca kâr geri verilir —
// review #1 kritik); ayrıca tek başına test için FOREX_SMART_TRAIL=1.
const smartTrailOn = () => process.env.FOREX_SMART_TRAIL === '1' || carryToReversal();
const tf5mGuardOn = () => process.env.FOREX_REVERSAL_TF5M_GUARD !== '0'; // vars. AÇIK
const TRAIL_ATR_MULT = () => envNum('FOREX_TRAIL_ATR_MULT', 2.0);
const REV = {
  confirmBars: () => Math.max(1, Math.round(envNum('FOREX_REVERSAL_CONFIRM_BARS', 3))),
  minHoldMin: () => envNum('FOREX_REVERSAL_MIN_HOLD_MIN', 5),
  minProfitR: () => envNum('FOREX_REVERSAL_MIN_PROFIT_R', 0.5),
  stPeriod: () => Math.max(2, Math.round(envNum('FOREX_REVERSAL_ST_PERIOD', 10))),
  stMult: () => envNum('FOREX_REVERSAL_ST_MULT', 4),
  volFrac: () => envNum('FOREX_REVERSAL_VOL_FRAC', 0.8),
  staleSec: () => envNum('FOREX_REVERSAL_STALE_SEC', 120),
  swingLookback: () => Math.max(10, Math.round(envNum('FOREX_REVERSAL_SWING_LOOKBACK', 40))),
};
// Reversal ile kapanan pozisyon KISA cooldown'a girer (trende geri katılabilmek —
// review: uzun cooldown+anti-FOMO trendin kalanını kaçırtır).
const reversalReopenCooldownSec = () => Math.max(0, envNum('FOREX_REVERSAL_REOPEN_COOLDOWN_MIN', 8)) * 60;
// Carry modda pozisyon dönüş sinyali verip ZARARDAYSA tam SL beklemeden kes
// (2026-07-06: reversal-exit +0.5R kâr şartıyla kaybedeni ASLA kesemiyordu →
// her ters-yön pozisyon tam SL'e kadar taşındı). 0/negatif = kapalı.
REV.cutLossR = () => envNum('FOREX_REVERSAL_CUTLOSS_R', 0.3);

// ── KADEMELİ ZARAR-COOLDOWN'U (2026-07-06): düz 30dk cooldown gece boyu
// 30-60dk'da bir aynı yöne yeniden girip zarar döngüsü yarattı (ETH/XAU/XAG 6'şar
// kez). Üst üste zarar eden (enstrüman:yön) artan süreyle kilitlenir:
// 1. zarar → 30dk · 2. → 2 saat · 3.+ → TR-günü sonuna kadar. YALNIZ KAZANÇ sıfırlar;
// haber/hafta-sonu zorunlu kapanışı (nötr) seriye DOKUNMAZ (review: nötr kapanış
// sıfırlasaydı kademeli fren tam haber pencerelerinde delinirdi).
function nextTrMidnightSec(now = nowSec()) {
  const tr = new Date(now * 1000 + TR_OFFSET_MS);
  tr.setUTCHours(24, 0, 0, 0);
  return Math.floor((tr.getTime() - TR_OFFSET_MS) / 1000);
}
function lossCooldownSec(streak) {
  if (streak <= 1) return REOPEN_COOLDOWN_SEC;
  if (streak === 2) return 2 * 3600;
  return Math.max(REOPEN_COOLDOWN_SEC, nextTrMidnightSec() - nowSec()); // 3.+ → gün sonu
}
// Kapanışı sınıflandır + cooldown süresi seç + streak güncelle (state.lossStreak).
// kind: 'loss' (seriyi artır+kilitle) | 'win' (seriyi sıfırla) | 'neutral' (seriye dokunma).
function applyCloseCooldown(key, { kind, outcome }) {
  if (!state.lossStreak) state.lossStreak = {};
  const today = dailyGuard.trDay();
  if (kind === 'loss') {
    const cur = state.lossStreak[key];
    const n = (cur && cur.day === today ? cur.n : 0) + 1; // yeni gün → seri baştan
    state.lossStreak[key] = { n, day: today };
    const cd = lossCooldownSec(n);
    state.cooldownUntil[key] = nowSec() + cd;
    if (n >= 2) logger.warn(`[Forex] kademeli fren: ${key} ${n}. üst üste zarar — ${Math.round(cd / 60)}dk kilit.`);
    return cd;
  }
  if (kind === 'win') delete state.lossStreak[key];
  const cd = outcome === 'REVERSAL' ? reversalReopenCooldownSec() : REOPEN_COOLDOWN_SEC;
  state.cooldownUntil[key] = nowSec() + cd;
  return cd;
}

let state = { counter: 0, open: {}, cooldownUntil: {}, lossStreak: {}, version: 2 };
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
      else { delete state.open[code]; continue; }
    }
    // FAZ1+2 alanları eski/geri-yüklenen kayıtlarda yoksa güvenli backfill (carry/trailing
    // R hesabı bozulmasın; savunmaci — normalde her açılışta yazılır).
    const q = state.open[code];
    if (q) {
      if (!(q.origStopDist > 0) && q.entry != null && q.stop != null) q.origStopDist = Math.abs(q.entry - q.stop);
      if (q.hwm == null && q.entry != null) q.hwm = q.entry;
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
        if (p && p.open) { state = { counter: p.counter || 0, open: p.open || {}, cooldownUntil: p.cooldownUntil || {}, lossStreak: p.lossStreak || {}, version: 2, resetTag: p.resetTag || null }; got = true; }
      }
    } catch (_) {}
  }
  if (!got) {
    try { if (fs.existsSync(DISK_FILE)) { const p = JSON.parse(fs.readFileSync(DISK_FILE, 'utf8')); if (p && p.open) state = { counter: p.counter || 0, open: p.open || {}, cooldownUntil: p.cooldownUntil || {}, lossStreak: p.lossStreak || {}, version: 2, resetTag: p.resetTag || null }; } } catch (_) {}
  }
  sanitizeOpen();
  // Öğrenme + günlük-zarar freni durumunu da restore et (devre-kesiciler deploy'u atlatır)
  try { await learning.restore(); } catch (_) {}
  try { await dailyGuard.restore(); } catch (_) {}
  // Tek-seferlik SIFIRLAMA: FOREX_RESET etiketi değişince TÜM açık sinyaller + sayaç
  // sıfırlanır (kullanıcı "önceki sinyalleri sil, sıfırdan başla"). NO #001'den başlar.
  const tag = process.env.FOREX_RESET;
  if (tag && state.resetTag !== tag) { state = { counter: 0, open: {}, cooldownUntil: {}, lossStreak: {}, version: 2, resetTag: tag }; persist(); }
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
  const dayBlocked = dailyGuard.blockedWithLog(); // günde bir loglar; tur başına tek kontrol
  for (const sigs of groups.values()) {
    sigs.sort((a, b) => b.confidence - a.confidence);
    const basis = sigs[0];
    const id = basis.id, dir = basis.direction, p = basis.precision ?? 4;
    const tfs = sortTfs(sigs.map(s => s.tf));
    const opp = dir === 'long' ? 'short' : 'long';
    // Öğrenme: devre-kesilmiş enstrümanın YENİ pozisyonu gölge (sanal izleme).
    // '__ALL__' = SİSTEM-GENELİ devre kesici (2026-07-06: 28 kapanışlık zarar
    // gecesinde enstrüman-başına 4-6 kapanış hiçbir kesiciyi tetikleyemedi).
    // AYRI çekirdek + SİSTEM-ölçekli eşikler (review: enstrüman kuralları evren
    // genelinde normal varyansla saatler içinde yanlış tetiklenirdi).
    const shadow = learning.modeFor(id) === 'shadow' || learning.global.modeFor('__ALL__') === 'shadow';
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
      // 0) GÜNLÜK ZARAR FRENİ: bugünkü gerçekleşen zarar eşiği aştıysa GERÇEK yeni
      //    pozisyon yok (gölge muaf — öğrenme sürsün; mevcutlar yönetilmeye devam).
      if (!shadow && dayBlocked) continue;
      // 1) Kapanış-sonrası cooldown: aynı enstrüman+yön hemen yeniden açılamaz
      //    (anahtar evrene ayrık: gölge kapanış gerçeği kilitlemez)
      if (!cooldownOff() && (state.cooldownUntil[`${shadow ? 'shadow:' : ''}${id}:${dir}`] || 0) > nowSec()) continue;
      // 2) Ters-yön kilidi: aynı evrende zıt pozisyon açıkken yenisi açılmaz
      //    (köprü hedge karmaşasının KAYNAK çözümü)
      if (!reverseLockOff() && reverseOf.length) continue;
      // 3) Konfluans kapısı: tek TF'lik sinyal ancak çok yüksek güvenle açılır
      if (!confluenceGateOff() && tfs.length < 2 && basis.confidence < SINGLE_TF_MIN_CONF) continue;
      // 4) Aşırı-uzama (anti-FOMO): yön doğru ama fiyat çoktan uzamışsa açma (kovalama)
      const fomo = antiFomoBlock(basis);
      if (fomo) { logger.info(`[Forex] anti-FOMO: ${id} ${dir.toUpperCase()} açılmadı — ${fomo.reason}`); continue; }
      // 5) Hafta sonu kripto: thin/gap'li piyasada yalnız çok yüksek güvenle aç
      const wknd = weekendCryptoBlock(basis);
      if (wknd) { logger.info(`[Forex] ${id} ${dir.toUpperCase()} açılmadı — ${wknd.reason}`); continue; }

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

// ── Sinyalden BAĞIMSIZ akıllı trailing stop ─────────────────────────────────
// Her kapanış turunda 5m ATR (chandelier) + R-kilidiyle stop'u LEHE ilerletir (asla
// gevşetmez). syncPositions'ın taze-sinyale bağlı trail'i güçlü trendde (anti-FOMO/
// cooldown yeni sinyali blokladığında) DONUYORDU → TP1 kalkınca kâr geri veriliyordu
// (review #1 kritik). p.hwm = lehte görülen en uç fiyat. p'yi mutate eder, stop değiştiyse true.
function advanceSmartTrail(p, closed5m) {
  if (!smartTrailOn() || !closed5m || closed5m.length < 15) return false;
  const isLong = p.direction === 'long';
  const dist = p.origStopDist > 0 ? p.origStopDist : Math.abs(p.entry - p.stop);
  if (!(dist > 0)) return false;
  const atrArr = beast.atrSeries(closed5m, 14);
  const atr = atrArr[atrArr.length - 1];
  if (!(atr > 0)) return false;
  let ext = p.hwm != null ? p.hwm : p.entry; // yüksek/düşük su seviyesi
  for (const b of closed5m) {
    if (b.time <= p.issueTimeSec) continue;
    ext = isLong ? Math.max(ext, b.high) : Math.min(ext, b.low);
  }
  p.hwm = ext;
  const price = closed5m[closed5m.length - 1].close;
  const r = ((price - p.entry) * (isLong ? 1 : -1)) / dist;
  const cands = [p.stop];
  if (r >= 2) cands.push(p.entry + (isLong ? 1 : -1) * dist);      // +1R kilit
  else if (r >= 1) cands.push(p.entry);                            // başabaş
  cands.push(isLong ? ext - TRAIL_ATR_MULT() * atr : ext + TRAIL_ATR_MULT() * atr); // chandelier
  let newStop = isLong ? Math.max(...cands) : Math.min(...cands);
  const eps = Math.abs(p.entry) * 1e-9;
  // Chandelier fiyatın ÜSTÜNE (long) / ALTINA (short) çıkamaz → aksi halde sonraki turda
  // tepede aniden-TRAIL stop-out olur (review kritik). Fiyata küçük tampon (0.25·ATR) bırak:
  // pullback chandelier'i aşmışsa temiz bir iz-süren çıkışa dönüşür, market-üstü SL olmaz.
  const buf = Math.max(eps, 0.25 * atr);
  newStop = isLong ? Math.min(newStop, price - buf) : Math.max(newStop, price + buf);
  const better = isLong ? (newStop > p.stop + eps) : (newStop < p.stop - eps);
  if (!better) return false;
  p.stop = +Number(newStop).toFixed(p.precision ?? 4);
  p.stopSetSec = nowSec(); // iz süren stop ileri-yönlü değerlendirilir
  return true;
}

// ── 1dk REVERSAL dedektörü ("dönüşe kadar tut, gerçek dönüşte çık") ──────────
// ÇEKİRDEK = 1m YAPI KIRILIMI (önceki swing dip/tepe kapanışla kırıldı) — pullback
// swing'i kırmaz, GERÇEK dönüş kırar (review: ham Supertrend flip whipsaw yapar).
// + Teyit katmanları (≥1): Supertrend flip / momentum (StochRSI&RSI=TEK oy, korelasyonlu)
// / hacim azalması (yalnız hacimli sınıf). + N-bar teyit + 5m trend-teyit freni.
// Dönüş: { hit, exitPrice, reason, stale }. Veri bayat/yoksa stale:true → çağıran
// carry'yi askıya alır (TP1 tekrar kapatıcı = FAIL-SAFE, review kritik).
async function detectReversal(p, inst, closed5m) {
  try {
    const m1 = await forexKlines.fetchCandles(inst.yahoo, '1m', 300);
    if (!m1 || m1.length < 60) return { hit: false, stale: true };
    const closed = m1.slice(0, -1);
    if (closed.length < 50) return { hit: false, stale: true };
    const last = closed[closed.length - 1];
    if (nowSec() - last.time > REV.staleSec()) return { hit: false, stale: true }; // bayat mum
    const prev = closed[closed.length - 2];
    if (prev && last.time === prev.time) return { hit: false, stale: true }; // Yahoo tekrar-bar artefaktı (aynı timestamp)
    const isLong = p.direction === 'long';
    const CB = REV.confirmBars();
    const n = closed.length - 1;
    const closes = closed.map(c => c.close);
    // 1) ÇEKİRDEK — yapı kırılımı: teyit penceresinden ÖNCEKİ swing'i son CB mum kapanışla kırdı mı
    const sw = beast.recentSwing(closed, n - CB, 3, 3, REV.swingLookback());
    const level = isLong ? sw.swingLow : sw.swingHigh;
    if (level == null) return { hit: false, stale: false };
    for (let k = n - CB + 1; k <= n; k++) {
      if (isLong ? !(closes[k] < level) : !(closes[k] > level)) return { hit: false, stale: false };
    }
    // 2) TEYİT katmanları (≥1)
    const dir1 = beast.supertrendSeries(closed, REV.stPeriod(), REV.stMult()).dir;
    let stFlip = true;
    for (let k = n - CB + 1; k <= n; k++) { if (dir1[k] !== (isLong ? -1 : 1)) { stFlip = false; break; } }
    const kArr = beast.stochRsiSeries(closes).k;
    const rArr = beast.rsiSeries(closes);
    const momentum = isLong
      ? (kArr[n] != null && kArr[n - 1] != null && kArr[n] < kArr[n - 1] && rArr[n] != null && rArr[n - 1] != null && rArr[n] < rArr[n - 1])
      : (kArr[n] != null && kArr[n - 1] != null && kArr[n] > kArr[n - 1] && rArr[n] != null && rArr[n - 1] != null && rArr[n] > rArr[n - 1]);
    const vols = closed.map(c => c.volume || 0);
    const volSum = vols.slice(-20).reduce((a, b) => a + b, 0);
    const hasVol = (inst.class === 'crypto' || inst.class === 'index') && volSum > 0;
    const volFade = hasVol ? (vols[n] < (volSum / 20) * REV.volFrac()) : false;
    const layers = (stFlip ? 1 : 0) + (momentum ? 1 : 0) + (volFade ? 1 : 0);
    if (layers < 1) return { hit: false, stale: false };
    // 3) 5m TREND-TEYİT FRENİ: 5m Supertrend hâlâ pozisyon yönünde → pullback, çıkma
    if (tf5mGuardOn() && closed5m && closed5m.length >= 30) {
      const dir5 = beast.supertrendSeries(closed5m, REV.stPeriod(), REV.stMult()).dir;
      if (dir5[dir5.length - 1] === (isLong ? 1 : -1)) return { hit: false, stale: false };
    }
    return { hit: true, exitPrice: closes[n], reason: `1m yapı kırılımı + ${layers} teyit`, stale: false };
  } catch (_) { return { hit: false, stale: true }; }
}

// Tek pozisyonun kapanış kontrolü + akıllı trailing + carry/reversal (5m mumlar)
// Dönüş: { ev, trailed } — ev=kapanış olayı|null, trailed=akıllı stop ilerledi mi.
async function evalOne(p) {
  const inst = getInstrument(p.instrumentId);
  if (!inst) return { ev: null, trailed: false };
  const candles = await forexKlines.fetchCandles(inst.yahoo, '5m', 300);
  const isLong = p.direction === 'long';
  // YALNIZ KAPANMIŞ mumlar: son mum hâlâ oluşuyor → geçici fitil hayalet TP/SL tetiklemesin.
  const closed = (candles && candles.length) ? candles.slice(0, -1) : [];
  // ARMED kararı ÖNCEKİ turun kanıtına bakar: aynı geçişte hwm güncellenip aynı barın
  // spike'ı hem pozisyonu "arm" edip hem TP1'i kaldırmasın (review kritik bulgusu —
  // aksi halde TP1'e değen tek volatil bar kârı bankalamak yerine carry'ye geçirirdi).
  const hwmPrev = p.hwm;
  // (1) Akıllı trailing — kapanış taramasından ÖNCE (yeni stop taramada kullanılsın)
  const trailed = advanceSmartTrail(p, closed);
  // (2) Carry/reversal hazırlığı: carry AÇIK ise TP1 KAPATMAZ (target2 hard-cap) +
  //     akıllı trailing korur. Reversal exit AYRICA açıksa 1m veri TAZE ise aktif;
  //     veri bayat/yoksa GÜVENLİ FALLBACK → klasik TP1 (fail-SAFE, korumasız taşıma).
  let reversal = null;
  let carrySafe = false;
  if (carryToReversal()) {
    if (reversalOff()) {
      carrySafe = true; // carry açık, reversal exit kapalı → TP2 + akıllı trailing'e bırak
    } else {
      reversal = await detectReversal(p, inst, closed);
      carrySafe = reversal != null && reversal.stale === false; // bayat 1m → klasik TP1'e düş
    }
  }
  // ARMED KAPISI (2026-07-06): carry TP1'i pozisyon KENDİNİ KANITLAYANA kadar
  // kaldırmasın — hiç lehe gitmemiş pozisyon (hwm ilerlememiş) klasik TP1 ile
  // yönetilir; +minProfitR görmüş pozisyon "dönüşe kadar tut"a geçer. Böylece
  // ters açılan işlemler tam-SL'e mahkûm olmaz. Kapatma: FOREX_CARRY_ARM_DISABLED=1.
  const armOff = process.env.FOREX_CARRY_ARM_DISABLED === '1';
  const armed = armOff || (p.origStopDist > 0 && hwmPrev != null
    && ((isLong ? hwmPrev - p.entry : p.entry - hwmPrev) / p.origStopDist) >= REV.minProfitR());
  const carryArmed = carrySafe && armed;
  const tpLevel = carryArmed ? (p.target2 || p.target1) : p.target1; // target2 null ise TP1'e düş (korumasız kalma)
  const tpOutcome = carryArmed ? 'TP2' : 'TP1';
  // (3) Kapanış taraması: iz-süren stop (koruma) + tpLevel
  const stopSince = p.stopSetSec || p.issueTimeSec;
  let outcome = null, exit = null, exitTimeSec = null;
  for (const b of closed) {
    if (b.time <= p.issueTimeSec) continue;
    const slHit = (b.time > stopSince) && (isLong ? b.low <= p.stop : b.high >= p.stop);
    const tpHit = tpLevel != null && (isLong ? b.high >= tpLevel : b.low <= tpLevel);
    if (!slHit && !tpHit) continue;
    // Çıkış fiyatı seviyeye PİNLENMEZ: mum seviyeyi AŞARAK açıldıysa (gap) dolum = açılış.
    const slExit = isLong ? Math.min(p.stop, b.open) : Math.max(p.stop, b.open);
    const tpExit = isLong ? Math.max(tpLevel, b.open) : Math.min(tpLevel, b.open);
    const takeSl = () => { exit = slExit; outcome = (isLong ? exit >= p.entry : exit <= p.entry) ? 'TRAIL' : 'SL'; };
    const takeTp = () => { exit = tpExit; outcome = tpOutcome; };
    if (slHit && tpHit) {
      // Aynı mumda hem stop hem hedef: açılışa daha yakın seviyeye fiyat ÖNCE değmiştir (BUG3).
      const dStop = Math.abs(b.open - p.stop), dTp = Math.abs(b.open - tpLevel);
      if (dTp <= dStop) takeTp(); else takeSl();
    } else if (slHit) { takeSl(); }
    else { takeTp(); }
    exitTimeSec = b.time;
    break;
  }
  // (4) REVERSAL çıkışı — yalnız SL/TP değmediyse + carry-safe + min-tutuş + min-kâr(+0.5R).
  //     Min-kâr şartı: giriş sonrası ilk gürültü erken çıkış yaratmasın (kullanıcının ASIL derdi).
  //     ZARAR TARAFI (REVERSAL_CUT, 2026-07-06): dönüş pozisyonun ALEYHİNE teyit olduysa
  //     ve pozisyon ≥cutLossR zarardaysa tam SL'i bekleme, kes — eski kod kaybedeni
  //     hiçbir koşulda kesemiyordu, her ters işlem tam stop'a taşınıyordu.
  if (!outcome && carrySafe && reversal && reversal.hit) {
    const heldMin = (nowSec() - p.issueTimeSec) / 60;
    const price = closed.length ? closed[closed.length - 1].close : p.entry;
    const rNow = p.origStopDist > 0 ? ((price - p.entry) * (isLong ? 1 : -1)) / p.origStopDist : 0;
    if (heldMin >= REV.minHoldMin()) {
      if (rNow >= REV.minProfitR()) {
        outcome = 'REVERSAL'; exit = reversal.exitPrice; exitTimeSec = nowSec();
      } else if (REV.cutLossR() > 0 && rNow <= -REV.cutLossR()) {
        outcome = 'REVERSAL_CUT'; exit = reversal.exitPrice; exitTimeSec = nowSec();
      }
    }
  }
  // ⚠️ "SÜRE DOLDU" (EXPIRE) kapanışı YOK; çok eskiyenler checkClosures'da SESSİZCE temizlenir.
  if (!outcome) return { ev: null, trailed };
  const dir = isLong ? 1 : -1;
  const pnlPct = +(((exit - p.entry) / p.entry) * 100 * dir).toFixed(3);
  const pnlUsd = p.units != null ? +(p.units * (exit - p.entry) * dir).toFixed(2) : null;
  const rMultiple = p.origStopDist > 0 ? +(((exit - p.entry) * dir) / p.origStopDist).toFixed(2) : null;
  return {
    ev: {
      code: p.code, instrumentId: p.instrumentId, symbol: p.symbol, direction: p.direction,
      tfs: p.tfs, precision: p.precision, entry: p.entry, exit, outcome, pnlPct, pnlUsd,
      rMultiple, origStopDist: p.origStopDist ?? null, confidence: p.confidence ?? null,
      shadow: !!p.shadow, issuedAt: p.issuedAt, issueTimeSec: p.issueTimeSec ?? null,
      exitTimeSec, closedAt: new Date().toISOString(),
    },
    trailed,
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
      const { ev, trailed } = await evalOne(p);
      if (ev) {
        delete state.open[p.code];
        // Kademeli flip-flop freni: zarar serisi artan kilit, kazanç sıfırlar
        // (REVERSAL kazançlı çıkışı KISA cooldown alır — trende geri katılabilmek için).
        const losing = ev.outcome === 'SL' || ev.outcome === 'REVERSAL_CUT' || (ev.pnlUsd != null && ev.pnlUsd < 0);
        applyCloseCooldown(`${p.shadow ? 'shadow:' : ''}${p.instrumentId}:${p.direction}`, { kind: losing ? 'loss' : 'win', outcome: ev.outcome });
        appendClosed(ev);
        const rec = { r: ev.rMultiple, usd: ev.pnlUsd, outcome: ev.outcome, t: ev.exitTimeSec, shadow: ev.shadow };
        try { learning.recordClose(ev.instrumentId, rec); } catch (_) {}
        try { learning.global.recordClose('__ALL__', rec); } catch (_) {}  // sistem-geneli devre kesici (kendi ölçekli kuralları)
        if (!ev.shadow) { try { dailyGuard.recordBackendClose(ev.pnlUsd); } catch (_) {} }
        // GÖLGE kapanışlar Telegram'a/istatistiğe GİTMEZ — yalnız öğrenmeye aktı
        if (!ev.shadow) events.push(ev);
        changed = true;
      } else {
        if (trailed) changed = true; // ilerleyen akıllı stop'u kalıcılaştır
        if (nowSec() - p.issueTimeSec > maxExpire(p.tfs)) { delete state.open[p.code]; changed = true; } // SESSİZ süre temizliği
      }
    } catch (_) {}
  }
  // cooldown sözlüğü şişmesin
  for (const k of Object.keys(state.cooldownUntil)) if (state.cooldownUntil[k] <= nowSec()) delete state.cooldownUntil[k];
  if (changed) persist();
  return events;
}

// Köprü kapatma-teyit geri-kanalı: MT5-tarafı kapanışları (haber/hafta-sonu/stop-out/
// TP2 broker'da dolunca) backend'e senkronlar → backend "hâlâ açık" sanıp aynı kodu
// TERS fiyattan yeniden AÇMAZ (review: bot=telefon desync kritik bulgu).
// ⚠️ ÖĞRENME BESLEMESİ (2026-07-06): broker SL dolumları eskiden buradan SESSİZCE
// düşüyordu → devre kesici tam da onu tetiklemesi gereken zararları HİÇ görmüyordu
// (köprü 60s'de kapanışı backend'den önce yakalar). Artık köprünün yolladığı
// profit/price ile (yoksa broker-fiyat ↔ stop karşılaştırmasıyla) sınıflandırılır
// ve öğrenmeye + kademeli frene akar. Fiili para P/L'i /account-report'ta ayrıca raporlanır.
async function dropClosed(code, reason = 'bridge', extra = {}) {
  await load();
  const p = state.open[code];
  if (!p) return { dropped: false };
  delete state.open[code];
  const dirMul = p.direction === 'long' ? 1 : -1;
  const pnlUsd = Number.isFinite(Number(extra.profit)) ? Number(extra.profit) : null;
  const px = Number.isFinite(Number(extra.price)) ? Number(extra.price) : null;
  let r = null;
  if (px != null && p.origStopDist > 0 && p.entry != null) {
    r = +(((px - p.entry) * dirMul) / p.origStopDist).toFixed(2);
  }
  if (r == null && pnlUsd == null && reason === 'bridge_vanished') {
    // Köprü veri yollamadıysa: taze broker fiyatı stop'un ötesindeyse SL varsay (r=-1).
    try {
      const bp = brokerPrices.get(p.instrumentId);
      const mid = bp && bp.mid > 0 ? bp.mid : null;
      if (mid != null && p.stop != null && (p.direction === 'long' ? mid <= p.stop : mid >= p.stop)) r = -1;
    } catch (_) {}
  }
  // Fiyat yok ama P/L var → kaba kazan/kaybet sinyali (öğrenme penceresi kör kalmasın;
  // yeni köprü fiyatı da yollar, bu yol eski köprü uyumluluğu).
  if (r == null && pnlUsd != null) r = pnlUsd < 0 ? -1 : 1;
  // Sınıflandırma: bilinen zarar → zarar; hiçbir veri yoksa 'bridge_vanished' İHTİYATLA
  // zarar sayılır (vanish tipik olarak broker stop-out'udur; yanlışta fren fazla, az değil).
  // Haber/hafta-sonu/boot zorunlu kapanışı NÖTR: zarar serisini NE artırır NE sıfırlar
  // (review: sıfırlasaydı kademeli fren tam haber pencerelerinde delinirdi).
  const neutralReason = reason === 'news' || reason === 'weekend' || reason === 'boot_reconcile';
  const losing = !neutralReason && ((pnlUsd != null && pnlUsd < 0) || (r != null && r < 0)
    || (pnlUsd == null && r == null && reason === 'bridge_vanished'));
  const kind = neutralReason ? 'neutral' : (losing ? 'loss' : 'win');
  applyCloseCooldown(`${p.shadow ? 'shadow:' : ''}${p.instrumentId}:${p.direction}`, { kind, outcome: losing ? 'SL' : 'TP2' });
  if (!neutralReason && (r != null || pnlUsd != null)) {
    const rec = { r, usd: pnlUsd, outcome: losing ? 'SL' : 'TP2', t: nowSec(), shadow: !!p.shadow };
    try { learning.recordClose(p.instrumentId, rec); } catch (_) {}
    try { learning.global.recordClose('__ALL__', rec); } catch (_) {}
    // Köprünün bildirdiği GERÇEK USD P/L günlük frene de akar (rapor sidecar'ı ölse
    // bile fren kör kalmasın — review kritik bulgusu). Nötr kapanışlar da paradır ama
    // yukarıda elendi; onları /account-report kanalı zaten sayar.
    if (!p.shadow && pnlUsd != null) { try { dailyGuard.recordBridgeClose(pnlUsd); } catch (_) {} }
  }
  // İSTATİSTİK RAPORU DÜZELTMESİ (2026-07-06 kullanıcı bulgusu): gece işlemlerin çoğu
  // BROKER tarafında kapandı (SL dolumu) ve buradan sessizce düşüyordu → 20:00 sinyal
  // raporu gerçekle alakasızdı (yalnız backend'in kendi tespit ettiği kapanışları
  // sayıyordu). Artık köprü kapanışları da kazanç/zarar sayacına akar (nötr dahil —
  // para gerçekleşti; sınıf = P/L işareti).
  const statsOutcome = pnlUsd != null ? (pnlUsd < 0 ? 'SL' : 'TP2')
    : (r != null ? (r < 0 ? 'SL' : 'TP2') : null);
  if (!p.shadow && statsOutcome) { try { statsStore.recordClosure({ outcome: statsOutcome }).catch(() => {}); } catch (_) {} }
  persist();
  logger.info(`[Forex] köprü kapatma teyidi #${code} (${reason}${pnlUsd != null ? ` P/L ${pnlUsd}$` : ''}${r != null ? ` r=${r}` : ''}) — düşürüldü + ${losing ? 'kademeli zarar-freni' : 'cooldown'}`);
  return { dropped: true, instrumentId: p.instrumentId, direction: p.direction };
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

// _lossStreakFor: test görünürlüğü (kademeli fren serisi dışarıdan gözlemlenebilir olsun)
function _lossStreakFor(key) { return (state.lossStreak && state.lossStreak[key] && state.lossStreak[key].n) || 0; }

module.exports = { load, syncPositions, checkClosures, getOpen, getOpenShadow, getRecentClosed, dropClosed, _lossStreakFor };
