'use strict';

process.env.NODE_ENV = 'test';
const consensus = require('../../src/services/botConsensus');

function pos(botId, symbol, direction, entry = 100, stop = 98, target1 = 104) {
  return { botId, symbol, direction, entry, stop, target1, confidence: 70 };
}

describe('Konsensüs Radarı — grup mantığı', () => {
  beforeEach(() => consensus.resetForTest());

  test('3 farklı bot aynı sembol+yönde → konsensüs; 2 bot → yok', () => {
    const g3 = consensus.findConsensus([
      pos('forex-signals', 'EURUSD', 'long'),
      pos('mt5-trend', 'EURUSD', 'long'),
      pos('mt5-momentum', 'EURUSD', 'long'),
      pos('mt5-trend', 'XAUUSD', 'short'),
      pos('crypto-signals', 'XAUUSD', 'short'),
    ], 3);
    expect(g3.length).toBe(1);
    expect(g3[0].symbol).toBe('EURUSD');
    expect(g3[0].direction).toBe('long');
    expect(g3[0].count).toBe(3);
  });

  test('aynı botun çoklu-TF pozisyonları TEK oy sayılır', () => {
    const g = consensus.findConsensus([
      pos('forex-signals', 'EURUSD', 'long', 100, 98),
      pos('forex-signals', 'EURUSD', 'long', 101, 99),   // aynı bot, farklı TF
      pos('forex-signals', 'EURUSD', 'long', 102, 99.5),
      pos('mt5-trend', 'EURUSD', 'long'),
    ], 3);
    expect(g.length).toBe(0);   // 2 farklı bot < 3 eşik
  });

  test('kendi pozisyonları (consensus-radar) sayılmaz — geri-besleme koruması', () => {
    const g = consensus.findConsensus([
      pos('consensus-radar', 'EURUSD', 'long'),
      pos('forex-signals', 'EURUSD', 'long'),
      pos('mt5-trend', 'EURUSD', 'long'),
    ], 3);
    expect(g.length).toBe(0);
  });

  test('zıt yönler ayrı gruplardır (long konsensüsü short ile karışmaz)', () => {
    const g = consensus.findConsensus([
      pos('a', 'EURUSD', 'long'), pos('b', 'EURUSD', 'long'), pos('c', 'EURUSD', 'long'),
      pos('d', 'EURUSD', 'short'), pos('e', 'EURUSD', 'short'),
    ], 3);
    expect(g.length).toBe(1);
    expect(g[0].direction).toBe('long');
  });

  test('medyan seviyeler + bot sayısıyla artan güven', () => {
    const g = consensus.findConsensus([
      pos('a', 'XAUUSD', 'short', 4000, 4020, 3960),
      pos('b', 'XAUUSD', 'short', 4010, 4030, 3950),
      pos('c', 'XAUUSD', 'short', 4020, 4040, 3940),
    ], 3)[0];
    expect(g.entry).toBe(4010);           // medyan
    expect(g.stop).toBe(4030);
    expect(g.confidence).toBeGreaterThanOrEqual(55 + 3 * 8);
  });

  test('mesaj: AL → ALINABİLİR, SAT → SATILABİLİR + bot etiketleri', () => {
    const [gl] = consensus.findConsensus([
      pos('forex-signals', 'EURUSD', 'long'), pos('mt5-trend', 'EURUSD', 'long'), pos('mt5-momentum', 'EURUSD', 'long'),
    ], 3);
    const mL = consensus.buildMessage(gl);
    expect(mL).toContain('ALINABİLİR');
    expect(mL).toContain('3 bot');
    expect(mL).toContain('Bot 1');        // botLabel çözülüyor
    const [gs] = consensus.findConsensus([
      pos('a', 'XAUUSD', 'short'), pos('b', 'XAUUSD', 'short'), pos('c', 'XAUUSD', 'short'),
    ], 3);
    expect(consensus.buildMessage(gs)).toContain('SATILABİLİR');
  });

  test('run(): sinyal üretir (gün-kilitli id) + push kapalıyken mesaj atmaz', async () => {
    process.env.CONSENSUS_PUSH_DISABLED = '1';
    const r = await consensus.run([
      pos('a', 'EURUSD', 'long'), pos('b', 'EURUSD', 'long'), pos('c', 'EURUSD', 'long'),
    ], { nowMs: Date.UTC(2026, 6, 23) });
    delete process.env.CONSENSUS_PUSH_DISABLED;
    expect(r.signals.length).toBe(1);
    expect(r.signals[0].signalId).toBe('CONS:EURUSD:long:2026-07-23');
    expect(r.signals[0].agreeCount).toBe(3);
    expect(r.alertsSent).toBe(0);
  });
});
