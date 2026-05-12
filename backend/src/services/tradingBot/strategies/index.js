/**
 * Strategy registry — Borsa Krali Trading Bot
 *
 * 5 kanıtlanmış stratejinin Freqtrade'den Node.js portu. Hepsi long-only;
 * kısa pozisyonu gelecekte ayrı dosyalar olarak ekleyebiliriz.
 */

const bbrsi = require('./bbrsi');
const supertrend = require('./supertrend');
const macdCross = require('./macdCross');
const nostalgiaLite = require('./nostalgiaLite');
const emaRibbon = require('./emaRibbon');
const bbrsiShort = require('./bbrsiShort');
const supertrendShort = require('./supertrendShort');

const REGISTRY = {
  [bbrsi.id]: bbrsi,
  [supertrend.id]: supertrend,
  [macdCross.id]: macdCross,
  [nostalgiaLite.id]: nostalgiaLite,
  [emaRibbon.id]: emaRibbon,
  [bbrsiShort.id]: bbrsiShort,
  [supertrendShort.id]: supertrendShort,
};

function get(id) {
  return REGISTRY[id] || null;
}

function list() {
  return Object.values(REGISTRY).map(s => ({
    id: s.id,
    name: s.name,
    description: s.description,
    timeframe: s.timeframe,
    direction: s.direction,
    warmup: s.warmup,
    params: s.params,
  }));
}

module.exports = { get, list, REGISTRY };
