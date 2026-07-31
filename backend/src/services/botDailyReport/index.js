'use strict';

/**
 * Günlük Bot Raporu — her akşam Telegram'a tüm botların gün-içi istatistiği.
 *
 * GERÇEK-ÖNCELİKLİ: köprü MT5 deal geçmişini beslediyse (realResults) rapor
 * GERÇEK hesap sonuçlarını gösterir; yoksa kağıt/sanal (competition) sonuçlarına
 * düşer. Örnek: "Bot 1 · Forex — 5 işlem · 3 TP · 2 SL · net +12.40$".
 *
 * Hedef: env TELEGRAM_DAILY_REPORT_CHANNEL yoksa ana sinyal kanalı.
 * Kill: BOT_DAILY_REPORT_DISABLED=1.
 */

const catalog = require('../botCompetition/catalog');
const competitionManager = require('../botCompetition/competitionManager');
const customBotRunner = require('../botBuilder/customBotRunner');
const builderStore = require('../botBuilder/store');
const realResults = require('../realResults/store');
const telegramService = require('../telegramService');
const signalDelivery = require('../signalDelivery');

const COMPETITORS = catalog.filter((e) => e.competitionEligible);

function trDayStartMs(now = Date.now()) {
  const s = new Date(now + 3 * 3600 * 1000);
  return Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()) - 3 * 3600 * 1000;
}
function trDateLabel(now = Date.now()) {
  const d = new Date(now + 3 * 3600 * 1000);
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
}
function usd(v) { const n = Number(v) || 0; return `${n >= 0 ? '+' : ''}${n.toFixed(2)}$`; }
function rr(v) { const n = Number(v) || 0; return `${n >= 0 ? '+' : ''}${n.toFixed(2)}R`; }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

/** Rapor metnini üretir (Telegram HTML). realAgg verilirse GERÇEK, yoksa paper. */
function build(nowMs = Date.now(), goldStats = null, realAgg = null) {
  const sinceMs = trDayStartMs(nowMs);
  const useReal = Array.isArray(realAgg) && realAgg.length > 0;
  const realByMagic = new Map((realAgg || []).map((r) => [Number(r.magic), r]));

  const lines = [];
  lines.push('📊 <b>GÜNLÜK BOT RAPORU</b>');
  lines.push(`🗓️ ${trDateLabel(nowMs)} · ${useReal ? '🟢 GERÇEK MT5' : '⚪ sanal (henüz gerçek veri yok)'}`);
  lines.push('');
  lines.push('<b>— Yarışan Botlar —</b>');

  let dTrades = 0, dTp = 0, dSl = 0, dNet = 0;

  // ÇOK-MOTORLU BOT: bir botun alt motorları MT5'te ayrı magic kullanabilir
  // (bkz. catalog magicByStrategy — Bot 38 Scalp/Swing). Gerçek sonucu tek
  // magic'ten okumak o botun diğer bacağını rapordan DÜŞÜRÜR; hepsi toplanır.
  // Rapora giren her magic isaretlenir; sonda ESLENMEYENLER ayri baslikta
  // gosterilir ve GUN TOPLAMI'na katilir -> rapor toplami ile hesap gercegi
  // yapisal olarak ayrisamaz (2026-07-31: gercek -3.234,88 $ iken rapor
  // -74,51 $ demisti).
  const seenMagics = new Set();

  // ⚠️ dedicatedBridgeMagic ZORUNLU: Bot 1 (forex 550055) ve Bot 5 (tarayici
  // 550066) kendi adanmis koprulerinde islem acar. Bu magic okunmadigi icin
  // o iki botun TUM islemleri hem listeden hem gun toplamindan dusuyordu.
  function magicsOf(entry) {
    return [...new Set([
      Number(entry.magic),
      Number(entry.dedicatedBridgeMagic),
      ...Object.values(entry.magicByStrategy || {}).map(Number),
    ].filter((m) => Number.isFinite(m) && m > 0))];
  }

  // C2: "islem yok" tek basina bir sey anlatmiyordu — sinyal mi cikmadi, beyin
  // mi reddetti, emir mi doldurulmadi belli degildi. Huni sayaclari (C1) bunu
  // tek cumleye cevirir. Huni okunamazsa rapor DUSMEZ, eski metne doner.
  let funnelSvc = null; let funnelData = null;
  try {
    funnelSvc = require('../botFunnel');
    funnelData = funnelSvc.funnel({ days: 1 });
  } catch (_) { funnelSvc = null; funnelData = null; }

  function sessizlikNedeni(entry) {
    if (!funnelSvc || !funnelData) return 'işlem yok';
    const row = {
      signals: 0, accepted: 0, rejected: 0, reasons: {},
      filled: 0, closed: 0, wins: 0, losses: 0, netUsd: 0,
    };
    for (const m of magicsOf(entry)) {
      const part = funnelData.bots[String(m)];
      if (!part) continue;
      row.signals += part.signals; row.accepted += part.accepted;
      row.rejected += part.rejected; row.filled += part.filled;
      row.closed += part.closed; row.wins += part.wins; row.losses += part.losses;
      for (const [reason, count] of Object.entries(part.reasons || {})) {
        row.reasons[reason] = (row.reasons[reason] || 0) + count;
      }
    }
    return funnelSvc.explain(row);
  }

  function realFor(entry) {
    const magics = magicsOf(entry);
    const rows = [];
    for (const m of magics) {
      const row = realByMagic.get(m);
      if (row && row.trades > 0) { rows.push(row); seenMagics.add(m); }
    }
    if (!rows.length) return null;
    return rows.reduce((acc, r) => ({
      trades: acc.trades + r.trades, tp: acc.tp + r.tp,
      sl: acc.sl + r.sl, net: acc.net + r.net,
    }), { trades: 0, tp: 0, sl: 0, net: 0 });
  }

  if (useReal) {
    for (const e of COMPETITORS) {
      const r = realFor(e);
      if (r && r.trades > 0) {
        dTrades += r.trades; dTp += r.tp; dSl += r.sl; dNet += r.net;
        lines.push(`<b>Bot ${e.no}</b> · ${esc(e.name)}`);
        lines.push(`   ${r.trades} işlem · ${r.tp} TP · ${r.sl} SL · net <b>${usd(r.net)}</b>`);
      } else {
        lines.push(`<b>Bot ${e.no}</b> · ${esc(e.name)} — <i>${esc(sessizlikNedeni(e))}</i>`);
      }
    }
    // Özel botlar (gerçek, magic ile)
    const customs = builderStore.listCustom();
    const customReal = customs.map((b) => ({ b, r: realByMagic.get(Number(b.magic)) })).filter((x) => x.r && x.r.trades > 0);
    customReal.forEach(({ b }) => seenMagics.add(Number(b.magic)));
    if (customReal.length) {
      lines.push('');
      lines.push('<b>— Özel Botların —</b>');
      for (const { b, r } of customReal) {
        dTrades += r.trades; dTp += r.tp; dSl += r.sl; dNet += r.net;
        lines.push(`⭐ ${esc(b.name)} — ${r.trades} işlem · ${r.tp} TP · ${r.sl} SL · net <b>${usd(r.net)}</b>`);
      }
    }
    // Altın botu (gerçek, magic 20260707)
    const gr = realByMagic.get(realResults.GOLD_MAGIC);
    if (gr && gr.trades > 0) {
      seenMagics.add(Number(realResults.GOLD_MAGIC));
      dTrades += gr.trades; dTp += gr.tp; dSl += gr.sl; dNet += gr.net;
      lines.push('');
      lines.push('<b>— Altın Botu (gerçek MT5) —</b>');
      lines.push(`🥇 ${gr.trades} işlem · ${gr.tp} TP · ${gr.sl} SL · net <b>${usd(gr.net)}</b>`);
    }
    // ESLENMEYEN MAGIC'LER: katalogda karsiligi olmayan ama hesapta GERCEKTEN
    // islem yapmis magic'ler. Sessizce dusurmek yerine listelenir; boylece
    // "rapor az gosteriyor" durumu bir daha gizlenemez.
    const orphans = (realAgg || []).filter(
      (r) => r && r.trades > 0 && !seenMagics.has(Number(r.magic)));
    if (orphans.length) {
      lines.push('');
      lines.push('<b>— Eşlenmemiş Magic’ler (katalog dışı) —</b>');
      for (const o of orphans) {
        dTrades += o.trades; dTp += o.tp; dSl += o.sl; dNet += o.net;
        lines.push(`❔ ${esc(o.name || `Magic ${o.magic}`)} — ${o.trades} işlem · net <b>${usd(o.net)}</b>`);
      }
    }
  } else {
    // FALLBACK: kağıt/sanal competition
    const comp = competitionManager.dailyBreakdown(sinceMs);
    for (const b of comp) {
      dTrades += b.trades; dTp += b.tp; dSl += b.sl; dNet += b.net;
      if (b.trades > 0) {
        lines.push(`<b>Bot ${b.no}</b> · ${esc(b.name)}`);
        lines.push(`   ${b.trades} işlem · ${b.tp} TP · ${b.sl} SL · net <b>${usd(b.net)}</b> <i>(sanal)</i>`);
      } else {
        lines.push(`<b>Bot ${b.no}</b> · ${esc(b.name)} — <i>işlem yok</i>`);
      }
    }
    const custom = customBotRunner.dailyBreakdown(sinceMs);
    if (custom.length) {
      lines.push('');
      lines.push('<b>— Özel Botların (sanal) —</b>');
      for (const b of custom) lines.push(`⭐ ${esc(b.name)} — ${b.trades} işlem · ${b.tp} TP · ${b.sl} SL · net <b>${rr(b.netR)}</b>`);
    }
    if (goldStats && goldStats.total > 0) {
      lines.push('');
      lines.push('<b>— Altın Botu (gerçek MT5, toplam) —</b>');
      lines.push(`🥇 ${goldStats.total} işlem · %${Math.round(goldStats.win_rate || 0)} kazanma · ${usd(goldStats.total_profit)} · PF ${Number(goldStats.profit_factor || 0).toFixed(2)}`);
    }
  }

  lines.push('');
  lines.push(`📈 <b>GÜN TOPLAMI:</b> ${dTrades} işlem · ${dTp} TP · ${dSl} SL · net <b>${usd(dNet)}</b>`);

  // C2: gunun HUNISI — kac sinyal uretildi, kaci reddedildi, neden. Islem
  // sayisi tek basina "botlar calisti mi?" sorusunu cevaplamiyordu.
  if (funnelData && funnelData.totals.signals > 0) {
    const t = funnelData.totals;
    lines.push(`🔎 <b>Huni:</b> ${t.signals} sinyal → ${t.accepted} onay / ${t.rejected} ret`
      + ` · ${t.filled} dolum · ${t.closed} kapanış`);
    const topReasons = Object.entries(t.reasons || {})
      .sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (topReasons.length) {
      lines.push('   En sık ret sebepleri: '
        + topReasons.map(([r, c]) => `${esc(r)} ×${c}`).join(' · '));
    }
  }

  // MUTABAKAT (2026-07-31): defter toplami ile brokerin gercek gunluk neti
  // karsilastirilir. Fark varsa rapor bunu GIZLEMEZ — "rapor az gosteriyor"
  // durumu bir daha sessizce yasanamaz.
  try {
    const rec = require('../realResults/brokerTruth').reconcile(dNet);
    if (rec.reason === 'broker-anlik-goruntusu-yok') {
      lines.push('⚠️ Mutabakat yapılamadı: brokerdan taze anlık görüntü yok.');
    } else if (rec.ok) {
      lines.push(`✅ Mutabakat: defter ${usd(rec.ledgerNet)} = broker ${usd(rec.brokerNet)}`);
    } else {
      lines.push(`⚠️ <b>MUTABAKATSIZLIK</b> · defter ${usd(rec.ledgerNet)} · `
        + `broker <b>${usd(rec.brokerNet)}</b> · fark ${usd(rec.diff)}`);
      lines.push('   Defter eksik kayıt içeriyor; kayıt hattı incelenmeli.');
    }
  } catch (e) { /* mutabakat raporu dusurmesin */ }
  lines.push('<i>Her akşam güncellenir; sonuçlar günden güne birikir.</i>');

  return { text: lines.join('\n'), useReal, summary: { trades: dTrades, tp: dTp, sl: dSl, net: Number(dNet.toFixed(2)) } };
}

function target() { return process.env.TELEGRAM_DAILY_REPORT_CHANNEL || signalDelivery.signalChannel(); }

/** Raporu oluşturup Telegram'a gönderir. */
async function run(deps = {}) {
  if (process.env.BOT_DAILY_REPORT_DISABLED === '1') return { ok: false, disabled: true };
  const nowMs = deps.nowMs || Date.now();
  const sinceSec = Math.floor(trDayStartMs(nowMs) / 1000);

  let realAgg = null;
  try { if (realResults.hasData()) realAgg = realResults.aggregate(sinceSec); } catch (_) { realAgg = null; }

  // Gerçek veri yoksa altın botu toplamını en iyi çabayla ekle (fallback için).
  let goldStats = null;
  if (!realAgg || !realAgg.length) {
    try {
      const botClient = deps.botClient || require('../botClient');
      if (botClient.isEnabled && botClient.isEnabled()) goldStats = await botClient.get('/api/stats');
    } catch (_) { goldStats = null; }
  }

  const { text, summary, useReal } = build(nowMs, goldStats, realAgg);
  const chat = target();
  if (!chat) return { ok: false, error: 'no-telegram-target' };
  try {
    const send = deps.sendMessage || telegramService.sendMessage;
    const r = await send(chat, text, 'HTML');
    return { ok: !!(r && (r.success || r.ok || r.message_id || r.result)), useReal, summary };
  } catch (e) {
    return { ok: false, error: e.message, summary };
  }
}

module.exports = { run, build, trDayStartMs };
