/**
 * bistPortfolio/messages — saf, test edilebilir mesaj kurucular (Telegram HTML +
 * uygulama broadcast). AL/SAT/STOP/TP + günlük portföy özeti. İki bot da kullanır;
 * fark yalnız "dialect" (etiket + skor adı). telegramService diakritikleri ASCII'ye
 * çevirdiği için metinler diakritik-güvenli yazılır; sembol/isim HTML-escape edilir.
 */

const TELEGRAM_MAX = 3900;

function htmlEscape(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function fmt(v, p = 2) {
  const n = Number(v);
  return (v == null || !Number.isFinite(n)) ? '-' : n.toLocaleString('tr-TR', { minimumFractionDigits: p, maximumFractionDigits: p });
}
function money(v) { return fmt(v, 0); }
function sign(v) { return v >= 0 ? '+' : ''; }

// dialect: { name, scoreLabel, deepLink }
function kpiLine(kpis) {
  return `Portfoy: ozsermaye <b>${money(kpis.equity)} TL</b> (${sign(kpis.totalReturnPct)}${fmt(kpis.totalReturnPct, 2)}%) · nakit ${money(kpis.cash)} TL · ${kpis.openCount} pozisyon`;
}

// ── AL (pozisyon açıldı) ─────────────────────────────────────────────────────
function buildBuyBlock(pos, dialect) {
  const pr = pos.precision ?? 2;
  const notional = pos.positionSizeTL ?? (pos.entryPrice * pos.shares);
  const scoreTxt = pos.score != null ? ` · ${dialect.scoreLabel} <b>${pos.score}/100</b>` : '';
  return [
    `🟢 <b>${htmlEscape(pos.symbol)}</b> AL${pos.ticket ? ` · #${pos.ticket}` : ''}${scoreTxt}`,
    pos.name && pos.name !== pos.symbol ? htmlEscape(pos.name) : null,
    `Adet: <b>${pos.shares}</b> · Tutar: ${money(notional)} TL`,
    `Giris: <b>${fmt(pos.entryPrice, pr)}</b> | Stop: ${fmt(pos.currentStop, pr)} (risk %${fmt(pos.riskPct, 1)})` +
      (pos.currentTarget != null ? ` | Hedef: ${fmt(pos.currentTarget, pr)} (odul %${fmt(pos.rewardPct, 1)}${pos.rr1 ? `, R/R ${pos.rr1}` : ''})` : ''),
  ].filter(Boolean).join('\n');
}

function buildBuyMessages(opened, kpis, dialect) {
  const header = `🟢 <b>${dialect.name} — YENI ALIM</b>`;
  const footer = `Detay: ${dialect.deepLink}\nNot: Yatirim tavsiyesi degildir. Sanal model portfoy.`;
  const blocks = [header, ...opened.map(p => buildBuyBlock(p, dialect)), kpiLine(kpis), footer];
  return chunk(blocks);
}

// ── SAT / STOP / TP / SÜRE (pozisyon kapandı) ────────────────────────────────
function exitHead(reason) {
  if (reason === 'tp1_partial') return '🟢 <b>TP1 — YARI KAR ALINDI</b>';
  if (reason === 'target') return '✅ <b>TP OLDU (Hedef)</b>';
  if (reason === 'stop') return '🛑 <b>STOP OLDU</b>';
  if (reason === 'signal_exit') return '🔵 <b>SAT (Trend/Sinyal cikisi)</b>';
  if (reason === 'manual_close') return '✋ <b>ELLE KAPATILDI</b>';
  return '⏱️ <b>SURE DOLDU (kapandi)</b>';
}
function buildExitBlock(ev, kpis, dialect) {
  const pr = ev.precision ?? 2;
  const lines = [
    `${exitHead(ev.reason)} — <b>${htmlEscape(ev.symbol)}</b> AL${ev.ticket ? ` · #${ev.ticket}` : ''}`,
    ev.note ? htmlEscape(ev.note) : null,
    `Giris ${fmt(ev.entry, pr)} → Cikis ${fmt(ev.exit, pr)}${ev.exitDate ? ` (${htmlEscape(ev.exitDate)})` : ''}`,
    `Sonuc: <b>${sign(ev.priceReturnPct)}${fmt(ev.priceReturnPct, 2)}%</b> · ${sign(ev.realizedPnL)}${money(ev.realizedPnL)} TL${ev.partial ? ` (${ev.shares} adet)` : ''}`,
  ];
  // Scale-out: kalan pozisyon koşmaya devam ediyor
  if (ev.partial) {
    lines.push(`🏃 Kalan <b>${ev.remainingShares} adet</b> kosuyor · Stop GIRISE cekildi (${fmt(ev.newStop, pr)})${ev.newTarget != null ? ` · Yeni hedef TP2 ${fmt(ev.newTarget, pr)}` : ''} → risk SIFIR`);
  }
  if (kpis) lines.push(kpiLine(kpis));
  return lines.filter(Boolean).join('\n');
}
function buildExitMessages(events, kpis, dialect) {
  return chunk(events.map((ev, i) => buildExitBlock(ev, i === events.length - 1 ? kpis : null, dialect)));
}

// ── Uygulama broadcast (FCM/socket) ──────────────────────────────────────────
function buildBuyBroadcast(pos, dialect) {
  const pr = pos.precision ?? 2;
  return {
    title: `🟢 ${dialect.name}: ${pos.symbol} AL${pos.ticket ? ` #${pos.ticket}` : ''}`,
    body: `${pos.shares} adet @ ${fmt(pos.entryPrice, pr)} · Stop ${fmt(pos.currentStop, pr)} (risk %${fmt(pos.riskPct, 1)})${pos.currentTarget != null ? ` · Hedef ${fmt(pos.currentTarget, pr)}` : ''}`,
    category: 'signal', path: dialect.deepLink, channelId: 'borsa-krali-announcements', topic: 'all',
  };
}
function buildExitBroadcast(ev, dialect) {
  const pr = ev.precision ?? 2;
  const head = ev.reason === 'tp1_partial' ? '🟢 TP1 (yari)' : ev.reason === 'target' ? '✅ TP' : ev.reason === 'stop' ? '🛑 STOP' : ev.reason === 'signal_exit' ? '🔵 SAT' : ev.reason === 'manual_close' ? '✋ Elle kapatildi' : '⏱️ Sure doldu';
  const tail = ev.partial ? ` · kalan ${ev.remainingShares} adet kosuyor, stop girise` : '';
  return {
    title: `${head} · ${dialect.name}: ${ev.symbol}${ev.ticket ? ` #${ev.ticket}` : ''}`,
    body: `${sign(ev.priceReturnPct)}${fmt(ev.priceReturnPct, 2)}% · ${sign(ev.realizedPnL)}${money(ev.realizedPnL)} TL · Giris ${fmt(ev.entry, pr)} → ${fmt(ev.exit, pr)}${tail}`,
    category: 'signal', path: dialect.deepLink, channelId: 'borsa-krali-announcements', topic: 'all',
  };
}

// ── Günlük portföy özeti ─────────────────────────────────────────────────────
function buildDailySummaryMessages({ dateKey, snapshot, closedToday, benchmark }, dialect) {
  const k = snapshot.kpis;
  const m = snapshot.metrics || {};
  const benchLine = benchmark
    ? `\nBIST100: ${sign(benchmark.indexReturnPct)}${fmt(benchmark.indexReturnPct, 2)}% · <b>Alfa: ${sign(benchmark.alphaPct)}${fmt(benchmark.alphaPct, 2)}%</b>`
    : '';
  const metricLine = (m.closedCount > 0)
    ? `\nMax dusus %${fmt(m.maxDrawdownPct, 1)} · PF ${fmt(m.profitFactor, 2)} · beklenti ${sign(m.expectancyTL)}${money(m.expectancyTL)} TL/islem · ort. tutus ${fmt(m.avgHoldDays, 0)}g`
    : '';
  const header =
    `📊 <b>${dialect.name} PORTFOY OZETI</b> — ${htmlEscape(dateKey)}\n` +
    `Ozsermaye: <b>${money(k.equity)} TL</b> (${sign(k.totalReturnPct)}${fmt(k.totalReturnPct, 2)}%) · Nakit: ${money(k.cash)} TL · Acik: ${k.openCount}\n` +
    `Gerceklesen K/Z: ${sign(k.totalRealizedPnL)}${money(k.totalRealizedPnL)} TL · Kazanma: %${fmt(k.winRate, 0)} (${k.winCount}G/${k.lossCount}K)` +
    benchLine + metricLine;

  const openLines = (snapshot.open || []).length
    ? ['<b>Acik pozisyonlar:</b>', ...snapshot.open.map(p => {
        const pr = p.precision ?? 2;
        const mark = p.unrealizedPct >= 0 ? '🟢' : '🔴';
        return `${mark} ${htmlEscape(p.symbol)} ${fmt(p.entryPrice, pr)} → ${fmt(p.lastPrice, pr)} (${sign(p.unrealizedPct)}${fmt(p.unrealizedPct, 2)}%) · Stop ${fmt(p.currentStop, pr)}${p.currentTarget != null ? ` / Hedef ${fmt(p.currentTarget, pr)}` : ''}`;
      })].join('\n')
    : '(acik pozisyon yok)';

  const blocks = [header, openLines];
  if ((closedToday || []).length) {
    blocks.push(['<b>Bugun gerceklesenler:</b>', ...closedToday.map(ev =>
      `${ev.reason === 'tp1_partial' ? '🟢 TP1(yari)' : ev.reason === 'target' ? '✅ TP' : ev.reason === 'stop' ? '🛑 STOP' : ev.reason === 'signal_exit' ? '🔵 SAT' : '⏱️'} ${htmlEscape(ev.symbol)} ${sign(ev.priceReturnPct ?? ev.pnlPct)}${fmt(ev.priceReturnPct ?? ev.pnlPct, 2)}%`)].join('\n'));
  }
  blocks.push(`Detay: ${dialect.deepLink}\nNot: Yatirim tavsiyesi degildir. Sanal model portfoy.`);
  return chunk(blocks);
}

function buildDailySummaryBroadcast({ dateKey, snapshot }, dialect) {
  const k = snapshot.kpis;
  return {
    title: `📊 ${dialect.name} portfoy: ${money(k.equity)} TL (${sign(k.totalReturnPct)}${fmt(k.totalReturnPct, 2)}%)`,
    body: `Acik ${k.openCount} · Gerceklesen ${sign(k.totalRealizedPnL)}${money(k.totalRealizedPnL)} TL · Kazanma %${fmt(k.winRate, 0)}`,
    category: 'signal', path: dialect.deepLink, channelId: 'borsa-krali-announcements', topic: 'all',
  };
}

// ── ≤TELEGRAM_MAX parçalara böl ──────────────────────────────────────────────
function chunk(blocks) {
  const messages = [];
  let cur = '';
  for (const block of blocks) {
    if (!block) continue;
    const candidate = cur ? `${cur}\n\n${block}` : block;
    if (candidate.length > TELEGRAM_MAX && cur) { messages.push(cur); cur = block; }
    else cur = candidate;
  }
  if (cur) messages.push(cur);
  return messages;
}

module.exports = {
  buildBuyBlock, buildBuyMessages, buildExitBlock, buildExitMessages,
  buildBuyBroadcast, buildExitBroadcast,
  buildDailySummaryMessages, buildDailySummaryBroadcast,
  htmlEscape, fmt, money, TELEGRAM_MAX,
};
