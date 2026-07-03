/**
 * altinNotifier — 🥇 ALTIN sinyalleri YALNIZ Telegram KANALI (@borsakraliai).
 *
 * proPushNotifier'ın ALTIN'a uyarlanmış klonu. HER mesaj "🥇 ALTIN" başlığıyla
 * başlar → diğer botlarla (YENİ ROBOT, FOREX, BEAST) ASLA karışmaz. Sinyal NO'ları
 * tracker'dan gelir (AU-<TF>-NNN). Akış:
 *   • Yeni pozisyon → tracker.ingest(snapshot.signals) sonrası "🥇 ALTIN" yeni-sinyal mesajı.
 *   • Kapanış (TP/SL/TRAIL/EXPIRE) → AYNI NO ile teyit.
 *   • Önemli S/R fraktal kırılımı (yalnız 1d/8h/4h) → kırılım bildirimi.
 *   • Haftalık yön (bias) flip → yön-değişti bildirimi.
 *
 * Kanal = signalDelivery.signalChannel(); channelOnly() saygı görür (DM'e DÜŞMEZ).
 * Kill-switch: ALTIN_PUSH_DISABLED=1 → no-op. Modül yüklenirken mesaj GÖNDERMEZ.
 *
 * Soğuma (cooldown):
 *   • core sinyaller: (tf,direction) başına 60 dk
 *   • scalp sinyaller: (tf,direction) başına 30 dk  (ayrı haritalar)
 *   • S/R kırılımı: (tf,level,type) başına 6 sa
 */

const telegramService = require('../telegramService');
const tracker = require('./altinTracker');
const signalDelivery = require('../signalDelivery');
const logger = require('../../utils/logger');

// ── Kanal seçimi (YALNIZ kanal — DM'e DÜŞMEZ) ───────────────────────────────
function chan() {
  // channelOnly() varsayılan AÇIK; kapalıysa (=0) yine kanal kullanılır (bu bot
  // kişisel DM/uygulama push'u HİÇ yapmaz — tüm trafiği kanala yollar).
  try { signalDelivery.channelOnly(); } catch (_) {}
  try { return signalDelivery.signalChannel(); } catch (_) { return ''; }
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout:' + label)), ms)),
  ]);
}

// ── Soğuma haritaları ────────────────────────────────────────────────────────
const CORE_COOLDOWN_MS = 60 * 60 * 1000;
const SCALP_COOLDOWN_MS = 30 * 60 * 1000;
const BREAK_COOLDOWN_MS = 6 * 60 * 60 * 1000;

const lastCorePush = new Map();  // `${tf}:${direction}` → ts
const lastScalpPush = new Map(); // `${tf}:${direction}` → ts
const lastBreakPush = new Map(); // `${tf}:${level}:${type}` → ts

function sigCooldownKey(p) { return `${p.tf}:${p.direction}`; }
function inSigCooldown(p) {
  const map = p.scalp ? lastScalpPush : lastCorePush;
  const ms = p.scalp ? SCALP_COOLDOWN_MS : CORE_COOLDOWN_MS;
  const t = map.get(sigCooldownKey(p));
  return t != null && (Date.now() - t) < ms;
}
function markSigPushed(p) {
  const map = p.scalp ? lastScalpPush : lastCorePush;
  map.set(sigCooldownKey(p), Date.now());
}

function breakKey(b) { return `${b.tf}:${b.level}:${b.type}`; }
function inBreakCooldown(b) {
  const t = lastBreakPush.get(breakKey(b));
  return t != null && (Date.now() - t) < BREAK_COOLDOWN_MS;
}
function markBreakPushed(b) { lastBreakPush.set(breakKey(b), Date.now()); }

// ── Biçimlendirme yardımcıları ───────────────────────────────────────────────
const TF_TR = {
  '1d': 'günlük', '8h': '8 saatlik', '4h': '4 saatlik', '1h': '1 saatlik',
  '15m': '15 dakikalık', '5m': '5 dakikalık', '1m': '1 dakikalık',
};
function tfLabel(tf) { return TF_TR[tf] || tf; }

function fmt(v, p = 1) {
  if (v == null || !Number.isFinite(Number(v))) return '-';
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: p, maximumFractionDigits: p });
}
function dirWord(d) { return d === 'long' ? 'LONG' : 'SHORT'; }
// Kullanıcı isteği: long/short ASLA karışmasın → belirgin YEŞİL/KIRMIZI OK.
function dirArrow(d) { return d === 'long' ? '🟢⬆️' : '🔴⬇️'; }
function biasWord(d) { return d === 'bull' ? 'BOĞA' : d === 'bear' ? 'AYI' : 'NÖTR'; }

// Pozisyon için R/R: |target-entry| / |entry-stop| (tracker bunu saklamaz → hesapla).
function rrOf(p) {
  if (!(p.entry > 0) || p.stop == null || p.target == null) return null;
  const risk = Math.abs(p.entry - p.stop);
  if (!(risk > 0)) return null;
  return +(Math.abs(p.target - p.entry) / risk).toFixed(2);
}

// Orijinal sinyali (tf+yön, en yüksek güven) bul → srNote/srOk gibi meta sağla.
function pickMeta(signals, p) {
  const cand = (signals || []).filter(s => s && s.tf === p.tf && s.direction === p.direction);
  if (!cand.length) return null;
  return cand.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
}

// ── Mesaj kurucular (saf — test edilebilir) ──────────────────────────────────

/**
 * Yeni-sinyal mesajı — "🥇 ALTIN" başlıklı.
 * p    = tracker pozisyonu (code, symbol, tf, direction, entry, stop, target, confidence, wrEst, scalp, label/type)
 * bias = snapshot.bias (haftalık yön satırı için, opsiyonel)
 * meta = orijinal sinyal (srNote için, opsiyonel)
 */
function buildSignalMsg(p, bias, meta, sr) {
  const pr = 1;
  const lines = [];
  // Yön EN BAŞTA, belirgin yeşil/kırmızı okla — long/short karışmaz.
  lines.push(`🥇 <b>ALTIN</b> · ${dirArrow(p.direction)} <b>${dirWord(p.direction)}</b> — ${p.symbol || 'XAU/USD'} · #${p.code}`);
  const desc = p.label || p.type || 'sinyal';
  lines.push(`Zaman dilimi: ${tfLabel(p.tf)} · ${desc}`);
  const wr = p.wrEst != null ? p.wrEst : (meta && meta.wrEst);
  lines.push(`Güven: ${p.confidence}/100${wr != null ? ` (geçmiş WR ~%${Math.round(wr)})` : ''}`);
  if (bias && bias.dir) {
    lines.push(`Haftalık yön: ${biasWord(bias.dir)} (güç ${fmt(bias.strength, 2)})`);
  }
  const rr = rrOf(p);
  lines.push(`Giriş: ${fmt(p.entry, pr)} · SL: ${fmt(p.stop, pr)} · TP: ${fmt(p.target, pr)}${rr != null ? ` (R/R ${fmt(rr, 2)})` : ''}`);
  // Destek/Direnç YALNIZ sinyalde, giriş/TP/SL'den SONRA — gerçek seviyeler.
  if (sr && (sr.nearestSupport || sr.nearestResistance)) {
    const sup = sr.nearestSupport ? fmt(sr.nearestSupport.price, pr) : '-';
    const res = sr.nearestResistance ? fmt(sr.nearestResistance.price, pr) : '-';
    lines.push(`📊 Destek: ${sup} · Direnç: ${res}`);
  }
  if (p.scalp) lines.push(`⚠️ SCALP — düşük güven, sıkı yönet`);
  return lines.join('\n');
}

/**
 * Kapanış / teyit mesajı (AYNI NO) — "🥇 ALTIN" başlıklı.
 * ev = tracker.manageOpen() closure: { code, tf, symbol, direction, entry, exit, pnlPct, outcome, ... }
 */
function buildClosureMsg(ev) {
  // Telegram HTML <span> desteklemez → "renkli kelime" = emoji + kalın işaret.
  const head = ev.outcome === 'TP' ? 'TP ✅'
    : ev.outcome === 'TRAIL' ? 'İZ SÜREN ✅'
    : ev.outcome === 'SL' ? 'STOP 🛑'
    : 'SÜRE DOLDU ⏱️';
  const sign = (ev.pnlPct || 0) >= 0 ? '+' : '';
  const pnl = `${sign}${fmt(ev.pnlPct, 1)}%`;
  const arrow = ev.direction ? dirArrow(ev.direction) + ' ' : '';
  return `🥇 <b>ALTIN</b> · ${arrow}#${ev.code} KAPANDI: <b>${head}</b> <b>${pnl}</b> (${ev.tf})`;
}

/**
 * S/R kırılım mesajı — "🥇 ALTIN" başlıklı.
 * b = { tf, type('resistance_broken'|'support_broken'), dir, level, breakTime }
 */
function buildBreakMsg(b) {
  const isRes = b.type === 'resistance_broken';
  const what = isRes ? 'DİRENÇ' : 'DESTEK';
  const tone = b.dir === 'bull' ? 'boğa' : b.dir === 'bear' ? 'ayı' : '-';
  const lehte = b.dir === 'bull' ? 'trend lehte' : b.dir === 'bear' ? 'trend aleyhte' : '';
  return `🥇 <b>ALTIN</b> — KIRILIM: ${tfLabel(b.tf)} <b>${what}</b> kırıldı @ ${fmt(b.level, 1)} (${tone})${lehte ? ` — ${lehte}` : ''}`;
}

/**
 * Haftalık yön değişti mesajı — "🥇 ALTIN" başlıklı.
 * prevDir = eski yön ('bull'|'bear'|'neutral'); newBias = snapshot.bias
 */
function buildBiasChangeMsg(prevDir, newBias) {
  const reason = (newBias && newBias.weekly && newBias.weekly.reason) || '';
  const strength = newBias ? newBias.strength : null;
  return `🥇 <b>ALTIN</b> — HAFTALIK YÖN DEĞİŞTİ: ${biasWord(prevDir)}→${biasWord(newBias && newBias.dir)}${strength != null ? ` (güç ${fmt(strength, 2)})` : ''}${reason ? `\n${reason}` : ''}`;
}

// ── Ana akış: değerlendir + push ─────────────────────────────────────────────
/**
 * evaluateAndPush(snapshot): snapshot.signals → tracker.ingest → yeni açılan her
 * pozisyon (soğumayı geçerse) "🥇 ALTIN" yeni-sinyal mesajı olarak kanala gider.
 * Dönen: { telegram, considered, opened }.
 */
async function evaluateAndPush(snapshot) {
  if (process.env.ALTIN_PUSH_DISABLED === '1') return { telegram: 0, considered: 0, opened: 0, disabled: true };
  if (!snapshot) return { telegram: 0, considered: 0, opened: 0 };

  const chatId = chan();
  let events = [];
  try { events = await withTimeout(tracker.ingest(snapshot.signals || []), 12000, 'ingest'); }
  catch (e) { logger.error(`[AltinPush] ingest: ${e.message}`); return { telegram: 0, considered: 0, opened: 0 }; }

  let tg = 0, considered = 0, shadowCount = 0;
  for (const p of (events || [])) {
    // Öğrenme devre-kesicisi: GÖLGE pozisyon sanal izlenir, DUYURULMAZ
    // (soğuma haritasına da yazılmaz — gerçeğe dönünce ilk sinyal engellenmesin).
    if (p.shadow) { shadowCount++; continue; }
    considered++;
    if (inSigCooldown(p)) continue;
    markSigPushed(p);
    const meta = pickMeta(snapshot.signals, p);
    const sr = snapshot.perTf && snapshot.perTf[p.tf] && snapshot.perTf[p.tf].sr;
    if (chatId) {
      try {
        const r = await withTimeout(telegramService.sendMessage(chatId, buildSignalMsg(p, snapshot.bias, meta, sr), 'HTML'), 16000, 'tg');
        if (r && r.success) tg++;
      } catch (e) { logger.error(`[AltinPush] tg #${p.code}: ${e.message}`); }
    }
  }
  if (tg) logger.info(`🥇 ALTIN — ${events.length} yeni sinyal · TG ${tg}`);
  return { telegram: tg, considered, opened: (events || []).length, shadow: shadowCount };
}

// ── Kapanış / teyit (aynı NO) ────────────────────────────────────────────────
/**
 * pushClosures(events): tracker.manageOpen() kapanışlarını "🥇 ALTIN" teyitleriyle
 * kanala yollar. Dönen: { telegram }.
 */
async function pushClosures(events) {
  if (process.env.ALTIN_PUSH_DISABLED === '1') return { telegram: 0 };
  const chatId = chan();
  let tg = 0;
  for (const ev of (events || [])) {
    if (chatId) {
      try {
        const r = await withTimeout(telegramService.sendMessage(chatId, buildClosureMsg(ev), 'HTML'), 16000, 'closeTg');
        if (r && r.success) tg++;
      } catch (e) { logger.error(`[AltinPush] closeTg #${ev.code}: ${e.message}`); }
    }
  }
  if (tg) logger.info(`🥇✅ ALTIN kapanış — ${(events || []).length} · TG ${tg}`);
  return { telegram: tg };
}

// ── Önemli S/R kırılımları (yalnız 1d/8h/4h; spam'i önler) ────────────────────
const BREAK_TFS = ['1d', '8h', '4h'];
/**
 * pushBreaks(srBreaks): yalnız üst-TF (1d/8h/4h) anlamlı fraktal kırılımları,
 * (tf,level,type) başına 6sa soğumayla kanala yollar. Dönen: count (gönderilen).
 */
async function pushBreaks(srBreaks) {
  if (process.env.ALTIN_PUSH_DISABLED === '1') return 0;
  const chatId = chan();
  let sent = 0;
  for (const b of (srBreaks || [])) {
    if (!b || !BREAK_TFS.includes(b.tf)) continue;
    if (b.type !== 'resistance_broken' && b.type !== 'support_broken') continue;
    if (inBreakCooldown(b)) continue;
    markBreakPushed(b);
    if (chatId) {
      try {
        const r = await withTimeout(telegramService.sendMessage(chatId, buildBreakMsg(b), 'HTML'), 16000, 'breakTg');
        if (r && r.success) sent++;
      } catch (e) { logger.error(`[AltinPush] breakTg ${b.tf}@${b.level}: ${e.message}`); }
    }
  }
  if (sent) logger.info(`🥇 ALTIN kırılım — ${sent} bildirim`);
  return sent;
}

// ── Haftalık yön değişimi (flip) ─────────────────────────────────────────────
/**
 * pushBiasChange(prevDir, newBias): haftalık yön gerçekten değiştiyse (ve ikisi de
 * 'neutral' değilse, ya da en az biri yönlüyse) kanala bir bildirim yollar.
 * Dönen: { telegram, changed }.
 */
async function pushBiasChange(prevDir, newBias) {
  if (process.env.ALTIN_PUSH_DISABLED === '1') return { telegram: 0, changed: false };
  const newDir = newBias && newBias.dir;
  // Sadece gerçek bir flip: önceki yön bilinir, yeni yön farklı.
  if (!prevDir || !newDir || prevDir === newDir) return { telegram: 0, changed: false };
  const chatId = chan();
  let tg = 0;
  if (chatId) {
    try {
      const r = await withTimeout(telegramService.sendMessage(chatId, buildBiasChangeMsg(prevDir, newBias), 'HTML'), 16000, 'biasTg');
      if (r && r.success) tg++;
    } catch (e) { logger.error(`[AltinPush] biasTg: ${e.message}`); }
  }
  if (tg) logger.info(`🥇 ALTIN haftalık yön ${biasWord(prevDir)}→${biasWord(newDir)}`);
  return { telegram: tg, changed: true };
}

module.exports = {
  evaluateAndPush, pushClosures, pushBreaks, pushBiasChange,
  // Saf mesaj kurucular (test için)
  buildSignalMsg, buildClosureMsg, buildBreakMsg, buildBiasChangeMsg,
};
