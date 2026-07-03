/**
 * proPushNotifier — YENİ ROBOT sinyalleri YALNIZ Telegram KANALI (@borsakraliai).
 *
 * forexPushNotifier'ın markalı + kalite-kapılı klonu. Eski forex ile AYNI kanala
 * gider ama HER mesaj "🤖 YENİ ROBOT" başlığıyla başlar → eski forex (FOREX ...)
 * sinyalleriyle ASLA karışmaz. Sinyal NO'ları tracker'dan gelir (YB01/YA01/YS01/
 * YE01). Aynı enstrüman+yön sinyalleri tek pozisyonda birleşir:
 *   • Yeni pozisyon → "🤖 YENİ ROBOT" yeni-sinyal mesajı (#NO).
 *   • R-merdiveni stop yükselince (≥4h) → AYNI NO ile "güncelleme".
 *   • Kapanış (TP1/STOP/İZ-SÜREN/SÜRE) → AYNI NO ile teyit.
 *
 * Kalite kapısı (VARSAYILAN AÇIK; PRO_QUALITY_GATE=0 ile kapatılır): bir sinyal
 * yalnız (a) güven ≥ eşik VE (b) backtest-kalitesi (örneklem ≥12 ise winRate≥45
 * || PF≥1 || expectancy>0; örneklem azsa PASS) ise push edilir.
 *
 * Kill-switch: PRO_PUSH_DISABLED=1 → no-op.
 */

const telegramService = require('../telegramService');
const tracker = require('./proSignalTracker');
const statsStore = require('./proStatsStore');
const signalLog = require('./proSignalLog');
const logger = require('../../utils/logger');

const MIN_SAMPLE = 12;

// Push eşiği: önce proSelfTest.getPushThreshold() (varsa), yoksa env, yoksa 60.
// proSelfTest bu modül yazılırken henüz olmayabilir → defansif lazy-require.
function getPushThreshold() {
  try {
    const st = require('./proSelfTest');
    if (st && typeof st.getPushThreshold === 'function') {
      const t = st.getPushThreshold();
      if (Number.isFinite(t)) return t;
    }
  } catch (_) { /* proSelfTest yok/yüklenemedi → env'e düş */ }
  return Number(process.env.PRO_PUSH_CONFIDENCE) || 60;
}

function withTimeout(promise, ms, label) {
  return Promise.race([Promise.resolve(promise), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout:' + label)), ms))]);
}

// Kalite kapısı — VARSAYILAN AÇIK (PRO_QUALITY_GATE=0 ile kapatılır).
// Döner: { passed, reasons:[] } — adli log için gerekçeler de tutulur.
function qualityGate(s, threshold) {
  const reasons = [];
  const conf = Number(s.confidence);
  const confOk = Number.isFinite(conf) && conf >= threshold;
  if (!confOk) reasons.push(`conf ${conf}<${threshold}`);

  // Kapı kapalıysa yalnız güven eşiğine bakılır (forex'in çalışan akış kalıbı).
  if (process.env.PRO_QUALITY_GATE === '0') {
    return { passed: confOk, reasons };
  }

  // Backtest-kalitesi: örneklem henüz ısınmadıysa (yok/<12) ENGELLEME — güven
  // eşiği + kalibrasyon zaten backtest'i yansıtır. Yeterli örneklem varsa kenar şartı.
  let btOk = true;
  if (s.sampleSize != null && s.sampleSize >= MIN_SAMPLE) {
    const wr = s.historicalWinRate;
    const pf = s.profitFactor;
    const exp = s.historicalAvgReturn; // expectancy ~ ortalama getiri
    btOk = (wr != null && wr >= 45) || (pf != null && pf >= 1) || (exp != null && exp > 0);
    if (!btOk) reasons.push(`bt wr=${wr} pf=${pf} exp=${exp} n=${s.sampleSize}`);
  }
  return { passed: confOk && btOk, reasons };
}

// ── Spam koruması: (enstrüman, yön) başına 30 dk soğuma ─────────────────────
const COOLDOWN_MS = 30 * 60 * 1000;
const lastPushAt = new Map(); // key: `${id}:${direction}` → ts
function cooldownKey(p) { return `${p.instrumentId || p.id}:${p.direction}`; }
function inCooldown(p) {
  const t = lastPushAt.get(cooldownKey(p));
  return t != null && (Date.now() - t) < COOLDOWN_MS;
}
function markPushed(p) { lastPushAt.set(cooldownKey(p), Date.now()); }

// ── Biçimlendirme yardımcıları (forexPushNotifier'dan kopya) ────────────────
function fmt(v, p) { return v == null ? '-' : Number(v).toLocaleString('en-US', { minimumFractionDigits: p, maximumFractionDigits: p }); }
function usd(v, d = 0) { return v == null ? '-' : (v < 0 ? '-$' : '$') + Math.abs(Number(v)).toLocaleString('en-US', { maximumFractionDigits: d }); }
function dirWord(d) { return d === 'long' ? 'LONG' : 'SHORT'; }
function chan() { return require('../signalDelivery').signalChannel(); } // YALNIZ kanal — DM'e düşmez

function metrics(p) {
  const dir = p.direction === 'long' ? 1 : -1, u = p.units;
  return {
    slPnl: u != null ? +(u * (p.stop - p.entry) * dir).toFixed(2) : null,
    tp1: u != null ? +(u * (p.target1 - p.entry) * dir).toFixed(2) : null,
    tp2: u != null ? +(u * (p.target2 - p.entry) * dir).toFixed(2) : null,
  };
}

function isManageableTfs(tfs) { return Array.isArray(tfs) && tfs.some(t => t === '4h' || t === '1d'); }

// Tekniklerin kısa özeti (votes/conditions'tan); meta yoksa boş döner.
function techniquesSummary(meta) {
  if (!meta) return '';
  if (Array.isArray(meta.votes) && meta.votes.length) {
    const parts = meta.votes
      .filter(v => v && v.vote && v.vote !== 'neutral')
      .slice(0, 6)
      .map(v => `${v.technique}${v.vote ? ` ${v.vote === 'long' ? '▲' : v.vote === 'short' ? '▼' : ''}` : ''}`.trim());
    if (parts.length) return parts.join(', ');
  }
  if (Array.isArray(meta.conditions) && meta.conditions.length) {
    return meta.conditions.slice(0, 6).map(c => (typeof c === 'string' ? c : (c && c.label) || '')).filter(Boolean).join(', ');
  }
  return '';
}

// Geçmiş (backtest) satırı: "Geçmiş: %64 (n=22, PF 1.8)" — veri varsa.
function historyLine(meta) {
  if (!meta) return '';
  const wr = meta.historicalWinRate, n = meta.sampleSize, pf = meta.profitFactor;
  if (n == null || n < 1) return '';
  const bits = [];
  if (wr != null) bits.push(`%${Math.round(wr)}`);
  const extra = [];
  extra.push(`n=${n}`);
  if (pf != null) extra.push(`PF ${Number(pf).toFixed(1)}`);
  return `Geçmiş: ${bits.length ? bits.join(' ') : '—'} (${extra.join(', ')})`;
}

/**
 * Yeni-sinyal mesajı — "🤖 YENİ ROBOT" başlıklı.
 * p   = tracker pozisyonu (code, symbol, direction, tfs, entry, stop, target*, rr*, confidence, units, margin*)
 * meta= orijinal sinyal (grade/güven bandı + backtest + teknikler + MT5 emri için)
 */
function buildNew(p, reverseOf, meta) {
  const pr = p.precision ?? 4; const m = metrics(p);
  const grade = meta && (meta.grade || meta.confidenceBand);
  const lines = [];
  if (reverseOf && reverseOf.length) lines.push(`🔴⚠️ <b>TERS SİNYAL</b> — zıt yönde açık pozisyon var (#${reverseOf.join(', #')})`);
  lines.push(`🤖 <b>YENİ ROBOT</b> — ${p.symbol} ${dirWord(p.direction)} · <b>#${p.code}</b>`);
  lines.push(`Güven: <b>${p.confidence}/100</b>${grade ? ` (${grade})` : ''}`);
  const hist = historyLine(meta);
  if (hist) lines.push(hist);
  lines.push(`TF birleşik: ${p.tfs.join(', ')}`);
  lines.push(`Giriş: <b>${fmt(p.entry, pr)}</b> (piyasa)`);
  lines.push(`SL: ${fmt(p.stop, pr)} · TP1: ${fmt(p.target1, pr)} (R/R ${p.rr1}) · TP2: ${fmt(p.target2, pr)} (R/R ${p.rr2})`);
  lines.push(`💼 Marj: ${usd(p.marginUsd)} (${p.marginPct}%) · Risk: ${usd(m.slPnl != null ? -Math.min(0, m.slPnl) : null, 0)}`);
  lines.push(`Muhtemel: TP1 ${usd(m.tp1)} · TP2 ${usd(m.tp2)}`);
  const tech = techniquesSummary(meta);
  if (tech) lines.push(`Teknikler: ${tech}`);
  if (isManageableTfs(p.tfs)) lines.push(`🪜 Yönetim: +1.5R'de stop girişe (BE), sonra her +0.5R'de kâr kilitlenir`);
  const mt5sym = (meta && meta.mt5 && meta.mt5.symbol) || p.mt5Symbol || p.instrumentId;
  lines.push(`🤖 MT5: <code>${p.direction === 'long' ? 'BUY' : 'SELL'} ${mt5sym} @PİYASA · SL ${fmt(p.stop, pr)} · TP1 ${fmt(p.target1, pr)} · TP2 ${fmt(p.target2, pr)}</code>`);
  return lines.join('\n');
}

// R-merdiveni stop güncellemesi (aynı NO) — "🤖 YENİ ROBOT" başlıklı.
function buildManage(ev) {
  const p = ev.position, pr = p.precision ?? 4;
  const stageTxt = ev.lockR === 0 ? 'stop GİRİŞE çekildi (BE — artık risksiz)' : `kâr +${ev.lockR}R kilitlendi`;
  return [
    `🤖 <b>YENİ ROBOT</b> 🪜 GÜNCELLEME — <b>#${p.code}</b> ${p.symbol} ${dirWord(p.direction)}`,
    `Fiyat +${ev.reachedR}R'ye ulaştı → ${stageTxt}`,
    `İz süren STOP: ${fmt(ev.prevStop, pr)} → <b>${fmt(p.stop, pr)}</b>`,
    `🤖 MT5 güncelle: <code>SL ${fmt(p.stop, pr)}</code> (TP1 ${fmt(p.target1, pr)} / TP2 ${fmt(p.target2, pr)} aynı)`,
  ].join('\n');
}

// Kapanış / teyit (aynı NO) — "🤖 YENİ ROBOT" başlıklı.
function buildClosureTelegram(ev) {
  const pr = ev.precision ?? 4;
  const mins = Math.max(1, Math.round((Date.now() - new Date(ev.issuedAt).getTime()) / 60000));
  const sure = mins >= 60 ? `${Math.floor(mins / 60)}s ${mins % 60}dk` : `${mins}dk`;
  const head = ev.outcome === 'TP1' ? '✅ <b>TP1 OLDU</b>'
    : ev.outcome === 'TRAIL' ? '✅ <b>İZ SÜREN STOP — kilitli kârla kapandı</b>'
    : ev.outcome === 'SL' ? '🛑 <b>STOP OLDU</b>'
    : '⏱️ <b>SÜRE DOLDU (kapandı)</b>';
  const sign = ev.pnlPct >= 0 ? '+' : '';
  return [
    `🤖 <b>YENİ ROBOT</b> — ${head} · <b>#${ev.code}</b> ${ev.symbol} ${dirWord(ev.direction)} (${(ev.tfs || []).join(', ')})`,
    `Giriş ${fmt(ev.entry, pr)} → Çıkış ${fmt(ev.exit, pr)}`,
    `Sonuç: <b>${sign}${ev.pnlPct}%</b>${ev.pnlUsd != null ? ` (${usd(ev.pnlUsd, 2)})` : ''} · süre ${sure}`,
  ].join('\n');
}

// Orijinal sinyali (id+yön, en yüksek güven) bul → pozisyona meta sağla.
function pickMeta(signals, p) {
  const id = p.instrumentId || p.id;
  const cand = (signals || []).filter(s => (s.id === id) && s.direction === p.direction);
  if (!cand.length) return null;
  return cand.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
}

// ── Ana akış: değerlendir + push ────────────────────────────────────────────
async function evaluateAndPush(signals) {
  if (process.env.PRO_PUSH_DISABLED === '1') return { telegram: 0, considered: 0, disabled: true };
  const chatId = chan();
  const threshold = getPushThreshold();

  // Kalite kapısı: güven eşiği + backtest-kalitesi (gerekçeleri logla).
  const gateById = new Map(); // id:dir → en iyi sinyalin gate sonucu (log için)
  const eligible = (signals || []).filter(s => {
    const g = qualityGate(s, threshold);
    const k = `${s.id}:${s.direction}`;
    const prev = gateById.get(k);
    if (!prev || (s.confidence || 0) > (prev.confidence || 0)) gateById.set(k, { ...g, confidence: s.confidence });
    return g.passed && !inCooldown({ instrumentId: s.id, direction: s.direction });
  });

  let events = [];
  try { events = await withTimeout(tracker.syncPositions(eligible), 12000, 'sync'); }
  catch (e) { logger.error(`[ProPush] sync: ${e.message}`); return { telegram: 0, considered: 0, eligible: eligible.length }; }

  let tg = 0, sent = 0, shadowCount = 0;
  for (const ev of events) { // syncPositions YALNIZ 'new' döndürür
    const p = ev.position;
    // Öğrenme devre-kesicisi: GÖLGE pozisyon sanal izlenir, DUYURULMAZ —
    // halka açık istatistiğe (statsStore) ve adli loga da yazılmaz, cooldown'a
    // işaretlenmez (gerçeğe dönünce ilk gerçek sinyal engellenmesin).
    if (p.shadow) { shadowCount++; continue; }
    const meta = pickMeta(eligible, p);
    statsStore.recordOpen(p).catch(() => {});
    // Adli log: karar bağlamı + kapı sonucu.
    try {
      const gate = gateById.get(`${p.instrumentId}:${p.direction}`) || { passed: true, reasons: [] };
      signalLog.append({
        code: p.code, ts: p.issuedAt, instrumentId: p.instrumentId, symbol: p.symbol, direction: p.direction,
        tfs: p.tfs, confidence: p.confidence, rawConfidence: meta?.rawConfidence, calibratedDelta: meta?.confidenceCalibration?.delta,
        votes: meta?.votes, conditions: meta?.conditions,
        levels: { entry: p.entry, stop: p.stop, target1: p.target1, target2: p.target2, rr1: p.rr1, rr2: p.rr2 },
        backtest: meta ? { winRate: meta.historicalWinRate, profitFactor: meta.profitFactor, expectancy: meta.historicalAvgReturn, sampleSize: meta.sampleSize, band: meta.historyBand } : null,
        gate: { passed: gate.passed, reasons: gate.reasons },
        outcome: null,
      });
    } catch (_) {}
    markPushed(p);
    if (chatId) {
      try {
        const r = await withTimeout(telegramService.sendMessage(chatId, buildNew(p, ev.reverseOf, meta), 'HTML'), 16000, 'tg');
        if (r?.success) { tg++; sent++; }
      } catch (e) { logger.error(`[ProPush] tg #${p.code}: ${e.message}`); }
    }
  }
  if (tg) logger.info(`🤖 YENİ ROBOT — ${events.length} yeni sinyal · TG ${tg} (eşik ${threshold})`);
  return { telegram: tg, considered: sent, shadow: shadowCount, eligible: eligible.length, threshold, chatSet: !!chatId };
}

// ── R-merdiveni stop güncellemeleri (≥4h) ───────────────────────────────────
async function pushManagementUpdates(events) {
  if (process.env.PRO_PUSH_DISABLED === '1') return { telegram: 0 };
  const chatId = chan();
  let tg = 0, shadowCount = 0;
  for (const ev of (events || [])) {
    // GÖLGE pozisyonun izi (stop) manageOpenPositions'da sürer (sanal gerçekçilik)
    // ama DUYURULMAZ — halka açık kanala sızmaz.
    if (ev.position?.shadow) { shadowCount++; continue; }
    if (chatId) { try { const r = await withTimeout(telegramService.sendMessage(chatId, buildManage(ev), 'HTML'), 16000, 'mgmtTg'); if (r?.success) tg++; } catch (e) { logger.error(`[ProPush] mgmtTg #${ev.position.code}: ${e.message}`); } }
  }
  if (tg) logger.info(`🤖🪜 YENİ ROBOT stop güncelleme — ${events.length} · TG ${tg}`);
  return { telegram: tg, shadow: shadowCount };
}

// ── Kapanış / teyit (aynı NO) ───────────────────────────────────────────────
async function pushClosures(events) {
  if (process.env.PRO_PUSH_DISABLED === '1') return { telegram: 0 };
  const chatId = chan();
  let tg = 0;
  for (const ev of (events || [])) {
    statsStore.recordClosure(ev).catch(() => {});
    // Adli log: aynı kodun outcome'unu yama.
    try { signalLog.patchOutcome(ev.code, { result: ev.outcome, exit: ev.exit, pnlPct: ev.pnlPct, pnlUsd: ev.pnlUsd, closedAt: new Date().toISOString() }); } catch (_) {}
    if (chatId) { try { const r = await withTimeout(telegramService.sendMessage(chatId, buildClosureTelegram(ev), 'HTML'), 16000, 'closeTg'); if (r?.success) tg++; } catch (e) { logger.error(`[ProPush] closeTg #${ev.code}: ${e.message}`); } }
  }
  if (tg) logger.info(`🤖✅ YENİ ROBOT kapanış — ${events.length} · TG ${tg}`);
  return { telegram: tg };
}

// ── Günlük istatistik (enstrüman bazlı long/short başarı) — yalnız kanal ─────
async function pushStats() {
  if (process.env.PRO_PUSH_DISABLED === '1') return { telegram: 0 };
  const chatId = chan();
  let msg = '';
  try { msg = await statsStore.buildStatsMessage(); } catch (e) { logger.error(`[ProPush] stats build: ${e.message}`); return { telegram: 0 }; }
  let tg = 0;
  if (chatId) { try { const r = await withTimeout(telegramService.sendMessage(chatId, msg, 'HTML'), 16000, 'statsTg'); if (r?.success) tg++; } catch (e) { logger.error(`[ProPush] statsTg: ${e.message}`); } }
  logger.info(`🤖📊 YENİ ROBOT istatistik paylaşıldı — TG ${tg}`);
  return { telegram: tg };
}

module.exports = {
  evaluateAndPush, pushManagementUpdates, pushClosures, pushStats,
  buildNew, buildManage, buildClosureTelegram, qualityGate, getPushThreshold,
};
