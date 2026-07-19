'use strict';

const store = require('../../src/services/realResults/store');
const report = require('../../src/services/botDailyReport');

const NOW = Date.now();
const nowSec = Math.floor(NOW / 1000);

describe('Gerçek MT5 Sonuç Deposu', () => {
  beforeEach(() => store._dangerouslyResetForTest());

  test('magic → bot eşlemesi (yarışçı / altın / bilinmeyen)', () => {
    expect(store.magicToBot(5701)).toMatchObject({ botId: 'forex-signals', no: 1, kind: 'competitor' });
    expect(store.magicToBot(5715)).toMatchObject({ no: 15, kind: 'competitor' });
    expect(store.magicToBot(store.GOLD_MAGIC)).toMatchObject({ name: 'Altın Botu', kind: 'gold' });
    expect(store.magicToBot(99999)).toMatchObject({ kind: 'unknown' });
  });

  test('ingest dedup + aggregate (TP/SL reason + kâr/zarar)', () => {
    store.ingest([
      { id: 'd1', magic: 5701, pnl: 12.5, closedSec: nowSec, reason: 5, symbol: 'BTCUSD' }, // TP win
      { id: 'd2', magic: 5701, pnl: -8.0, closedSec: nowSec, reason: 4, symbol: 'BTCUSD' }, // SL loss
      { id: 'd3', magic: 5701, pnl: 4.0, closedSec: nowSec, reason: 0, symbol: 'ETHUSD' },  // manual, pnl>0 → tp
      { id: 'd1', magic: 5701, pnl: 12.5, closedSec: nowSec, reason: 5 }, // dedup — aynı id
    ]);
    const agg = store.aggregate(0);
    const b = agg.find((x) => x.magic === 5701);
    expect(b.trades).toBe(3);
    expect(b.tp).toBe(2);
    expect(b.sl).toBe(1);
    expect(b.net).toBeCloseTo(8.5, 2);
    expect(b.profit).toBeCloseTo(16.5, 2);
    expect(b.loss).toBeCloseTo(-8.0, 2);
    expect(b.name).toBe('Forex Sinyalleri');
    expect(b.no).toBe(1);
  });

  test('aggregate sinceSec filtresi (eski işlem hariç)', () => {
    store.ingest([
      { id: 'old', magic: 5702, pnl: 5, closedSec: nowSec - 3 * 86400 },
      { id: 'new', magic: 5702, pnl: 7, closedSec: nowSec },
    ]);
    const today = store.aggregate(nowSec - 3600);
    const b = today.find((x) => x.magic === 5702);
    expect(b.trades).toBe(1);
    expect(b.net).toBeCloseTo(7, 2);
  });

  test('hasData + summary', () => {
    expect(store.hasData()).toBe(false);
    store.ingest([{ id: 'x', magic: 5703, pnl: 1, closedSec: nowSec }]);
    expect(store.hasData()).toBe(true);
    expect(store.summary().deals).toBe(1);
  });
});

describe('Günlük rapor — gerçek veri öncelikli', () => {
  beforeEach(() => store._dangerouslyResetForTest());

  test('gerçek veri varsa "GERÇEK MT5" başlıklı + gerçek $ gösterir', () => {
    const sinceSec = Math.floor(report.trDayStartMs(NOW) / 1000);
    const realAgg = store.aggregate(sinceSec); // boş
    store.ingest([{ id: 'r1', magic: 5701, pnl: 12.4, closedSec: sinceSec + 60, reason: 5 }]);
    const agg = store.aggregate(sinceSec);
    const { text, useReal, summary } = report.build(NOW, null, agg);
    expect(useReal).toBe(true);
    expect(text).toContain('GERÇEK MT5');
    expect(text).toContain('Bot 1');
    expect(text).toContain('+12.40$');
    expect(summary.trades).toBe(1);
    expect(summary.tp).toBe(1);
  });

  test('gerçek veri yoksa sanal fallback', () => {
    const { text, useReal } = report.build(NOW, null, null);
    expect(useReal).toBe(false);
    expect(text).toContain('sanal');
    expect(text).toContain('Bot 1');
  });
});
