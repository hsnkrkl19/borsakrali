/**
 * bistPortfolio/benchmark — BIST100 (XU100) kıyası → ALFA.
 * Portföyün özsermaye penceresinde (ilk→son equity tarihi) endeks getirisini
 * ölçer; alfa = portföy getirisi − endeks getirisi. 1 saat cache (endeks günde
 * çok değişmez; Yahoo/İş Yatırım yükü minimize). Endeks çekilemezse null (opsiyonel).
 */

const liveDataService = require('../liveDataService');

let _cache = { at: 0, series: null };
const TTL_MS = 60 * 60 * 1000;

function dateOf(c) { return c && (c.date || (Number.isFinite(c.timestamp) ? new Date(c.timestamp).toISOString().slice(0, 10) : null)); }

async function indexSeries() {
  if (_cache.series && (Date.now() - _cache.at) < TTL_MS) return _cache.series;
  let hist = null;
  try { hist = await liveDataService.fetchHistoricalData('XU100', '1y', '1d'); } catch (_) { hist = null; }
  const series = (Array.isArray(hist) ? hist : [])
    .filter(c => c && Number.isFinite(c.close))
    .map(c => ({ date: dateOf(c), close: c.close }))
    .filter(c => c.date);
  _cache = { at: Date.now(), series };
  return series;
}

// Belirli tarihte (veya ondan hemen ÖNCEKİ en yakın) endeks kapanışı
function closeOnOrBefore(series, dk) {
  let best = null;
  for (const c of series) { if (c.date <= dk) best = c; else break; }
  return best ? best.close : (series[0] ? series[0].close : null);
}

/**
 * @param {Array<{date,equity}>} equityHistory
 * @param {number} portfolioReturnPct  portföyün aynı penceredeki getirisi (%)
 * @returns {Promise<{indexReturnPct, alphaPct, from, to}|null>}
 */
async function compare(equityHistory, portfolioReturnPct) {
  const eh = (equityHistory || []).filter(p => p && p.date && Number.isFinite(p.equity));
  if (eh.length < 2) return null;
  const from = eh[0].date, to = eh[eh.length - 1].date;
  const series = await indexSeries();
  if (!series.length) return null;
  const c0 = closeOnOrBefore(series, from);
  const c1 = closeOnOrBefore(series, to);
  if (!(c0 > 0) || !(c1 > 0)) return null;
  const indexReturnPct = +(((c1 - c0) / c0) * 100).toFixed(2);
  return {
    indexReturnPct,
    alphaPct: +((portfolioReturnPct || 0) - indexReturnPct).toFixed(2),
    from, to,
  };
}

function __clearCache() { _cache = { at: 0, series: null }; }

module.exports = { compare, indexSeries, __clearCache };
