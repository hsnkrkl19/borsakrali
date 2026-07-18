'use strict';

/**
 * GOLDEN TESTS — ICT + FVG closed-candle paper signal core.
 *
 * All fixtures are deterministic and network-free. They model the complete
 * top-down sequence: 4h bias -> 1h structure -> 15m sweep/BOS/FVG -> first
 * closed 5m retest/reclaim. No Date.now or random fixture data is used.
 */

const fs = require('fs');
const path = require('path');
const engine = require('../../src/services/ictFvg/ictFvgEngine');

const T0 = 1_700_000_000;

function bullishZoneCandles() {
  const rows = [];
  for (let i = 0; i < 52; i++) {
    const open = 100 + i * 0.2;
    const close = open + 0.15;
    rows.push({
      time: T0 + i * 900,
      open,
      high: close + 0.4,
      low: open - 0.4,
      close,
      volume: 100,
    });
  }

  // Equal lows (109.5), bullish BOS/CHoCH, low sweep (109.2), displacement
  // and finally a 116.0 -> 116.5 bullish FVG.
  const tail = [
    [110.4, 112, 110, 111],
    [111, 114, 110.8, 112.5],
    [112.5, 113, 109.5, 111],
    [111, 115, 110.5, 114.5],
    [114.5, 114.7, 109.5, 111.5],
    [111.5, 116.2, 110.5, 115.5],
    [115.5, 116, 109.2, 114.5],
    [114.5, 119, 114, 118.5],
    [118.5, 120, 116.5, 119],
  ];
  tail.forEach(([open, high, low, close], j) => rows.push({
    time: T0 + (52 + j) * 900,
    open, high, low, close, volume: 100,
  }));
  return rows;
}

function bullishTriggers(zones, confirmed = true) {
  const base = zones[zones.length - 1].time + 900;
  return [
    { time: base, open: 119, high: 119.6, low: 117, close: 119.3, volume: 50 },
    { time: base + 300, open: 119.3, high: 119.5, low: 116.8, close: 117.2, volume: 50 },
    confirmed
      ? { time: base + 600, open: 117.2, high: 118.2, low: 116.3, close: 117.8, volume: 50 }
      : { time: base + 600, open: 117.2, high: 118.2, low: 116.7, close: 117.8, volume: 50 },
  ];
}

function mirrorPrices(rows, pivot = 300) {
  return rows.map((row) => ({
    ...row,
    open: pivot - row.open,
    high: pivot - row.low,
    low: pivot - row.high,
    close: pivot - row.close,
  }));
}

function retime(rows, seconds, endCloseSec) {
  return rows.map((row, i) => ({
    ...row,
    time: endCloseSec - (rows.length - i) * seconds,
  }));
}

function fixture(direction = 'long', confirmed = true) {
  const bullZones = bullishZoneCandles();
  const bullTriggers = bullishTriggers(bullZones, confirmed);
  const zones = direction === 'long' ? bullZones : mirrorPrices(bullZones);
  const triggers = direction === 'long' ? bullTriggers : mirrorPrices(bullTriggers);
  const decisionClose = triggers[triggers.length - 1].time + 300;
  return {
    biasCandles: retime(zones, 4 * 3600, decisionClose),
    structureCandles: retime(zones, 3600, decisionClose),
    zoneCandles: zones,
    triggerCandles: triggers,
  };
}

function analyze(payload, options = {}) {
  return engine.analyzeClosedCandles(payload, { symbol: 'XAUUSD', ...options });
}

function appendForming(rows, seconds, priceShift = 0) {
  const last = rows[rows.length - 1];
  const open = last.close + priceShift;
  return rows.concat([{
    time: last.time + seconds,
    open,
    high: open + 50,
    low: Math.max(0.01, open - 50),
    close: open + 25,
    volume: 999,
    closed: false,
  }]);
}

describe('ictFvgEngine — closed 3-candle FVG detection', () => {
  test('bullish and mirrored bearish gaps have deterministic far edges', () => {
    const bull = bullishZoneCandles();
    const bullGap = engine.detectClosedFvgs(bull).find((row) => row.originTimeSec === bull[59].time);
    expect(bullGap).toMatchObject({ type: 'bullish', bottom: 116, top: 116.5, formedIndex: 60 });

    const bear = mirrorPrices(bull);
    const bearGap = engine.detectClosedFvgs(bear).find((row) => row.originTimeSec === bear[59].time);
    expect(bearGap).toMatchObject({ type: 'bearish', bottom: 183.5, top: 184, formedIndex: 60 });
  });

  test('a pending zone is diagnostic only; it is not reported as a filled trade', () => {
    const result = analyze(fixture('long', false));
    expect(result.diagnostics.htfAlignedFvgs).toBe(1);
    expect(result.diagnostics.confirmedFvgs).toBe(0);
    expect(result.signals).toEqual([]);
  });
});

describe('ictFvgEngine — top-down confirmed fills', () => {
  test('4h + 1h + 15m aligned bullish setup enters at CLOSED 5m close with 2R/3R', () => {
    const result = analyze(fixture('long'));
    expect(result.higherTimeframes.bias.direction).toBe('long');
    expect(result.higherTimeframes.structure.direction).toBe('long');
    expect(result.signals).toHaveLength(1);
    const signal = result.signals[0];

    expect(signal).toMatchObject({
      strategy: 'ict_fvg',
      source: 'ict_fvg_closed_retest',
      symbol: 'XAUUSD',
      direction: 'long',
      entry: 117.8,
      fillPrice: 117.8,
      rr1: 2,
      rr2: 3,
      execution: 'paper_only',
      fillBar: { close: 117.8, closed: true, tf: '5m' },
      fvg: { type: 'bullish', bottom: 116, top: 116.5 },
    });
    expect(signal.signalId).toBe(signal.setupKey);
    expect(signal.signalId).toMatch(/^ICTFVG-[a-f0-9]{20}$/);
    expect(signal.stop).toBeLessThan(signal.entry);
    expect(signal.entry).toBeLessThan(signal.target1);
    expect(signal.target1).toBeLessThan(signal.target2);
    expect((signal.target1 - signal.entry) / (signal.entry - signal.stop)).toBeCloseTo(2, 7);
    expect((signal.target2 - signal.entry) / (signal.entry - signal.stop)).toBeCloseTo(3, 7);
    expect(signal.issuedAt).toBe(new Date(signal.fillTimeSec * 1000).toISOString());
  });

  test('mirrored setup produces a bearish fill with the same risk geometry', () => {
    const result = analyze(fixture('short'));
    expect(result.higherTimeframes.bias.direction).toBe('short');
    expect(result.higherTimeframes.structure.direction).toBe('short');
    expect(result.signals).toHaveLength(1);
    const signal = result.signals[0];
    expect(signal.direction).toBe('short');
    expect(signal.fvg).toMatchObject({ type: 'bearish', bottom: 183.5, top: 184 });
    expect(signal.target2).toBeLessThan(signal.target1);
    expect(signal.target1).toBeLessThan(signal.entry);
    expect(signal.entry).toBeLessThan(signal.stop);
    expect((signal.entry - signal.target1) / (signal.stop - signal.entry)).toBeCloseTo(2, 7);
    expect((signal.entry - signal.target2) / (signal.stop - signal.entry)).toBeCloseTo(3, 7);
  });

  test('configured RR below 2 is clamped to the strategy minimum', () => {
    const signal = analyze(fixture('long'), { minRR: 1, target2RR: 1.5 }).signals[0];
    expect(signal.rr1).toBe(2);
    expect(signal.rr2).toBe(2);
  });
});

describe('ictFvgEngine — higher timeframe gates', () => {
  test('4h disagreement rejects an otherwise valid 1h/15m/5m long', () => {
    const payload = fixture('long');
    payload.biasCandles = mirrorPrices(payload.biasCandles);
    const result = analyze(payload);
    expect(result.higherTimeframes.bias.direction).toBe('short');
    expect(result.higherTimeframes.structure.direction).toBe('long');
    expect(result.diagnostics.alignedFvgs).toBe(1);
    expect(result.diagnostics.htfAlignedFvgs).toBe(0);
    expect(result.signals).toEqual([]);
  });

  test('1h structure disagreement rejects an otherwise valid 4h/15m/5m long', () => {
    const payload = fixture('long');
    payload.structureCandles = mirrorPrices(payload.structureCandles);
    const result = analyze(payload);
    expect(result.higherTimeframes.bias.direction).toBe('long');
    expect(result.higherTimeframes.structure.direction).toBe('short');
    expect(result.signals).toEqual([]);
  });
});

describe('ictFvgEngine — chronology, identity and execution isolation', () => {
  test('same closed inputs are byte-for-byte deterministic; setup key belongs to FVG origin', () => {
    const payload = fixture('long');
    const first = analyze(payload);
    const second = analyze(payload);
    expect(second).toEqual(first);

    const changedFill = fixture('long');
    changedFill.triggerCandles[2] = {
      ...changedFill.triggerCandles[2],
      high: 118.6,
      close: 118.1,
    };
    const changedSignal = analyze(changedFill).signals[0];
    expect(changedSignal.entry).toBe(118.1);
    expect(changedSignal.setupKey).toBe(first.signals[0].setupKey);

    // The same FVG moves to another array index when a provider returns a
    // longer history window. Origin-based identity must not change.
    const longerWindow = fixture('long');
    longerWindow.zoneCandles = [
      { time: T0 - 1800, open: 99.6, high: 100.1, low: 99.2, close: 99.8, volume: 100 },
      { time: T0 - 900, open: 99.8, high: 100.3, low: 99.4, close: 100, volume: 100 },
      ...longerWindow.zoneCandles,
    ];
    expect(analyze(longerWindow).signals[0].setupKey).toBe(first.signals[0].setupKey);
  });

  test('a later retest does not re-emit after the first closed confirmation', () => {
    const payload = fixture('long');
    const last = payload.triggerCandles[payload.triggerCandles.length - 1];
    payload.triggerCandles.push({
      time: last.time + 300,
      open: 117.5,
      high: 118.4,
      low: 116.4,
      close: 117.9,
      volume: 50,
    });
    expect(analyze(payload).signals).toEqual([]);
  });

  test('raw adapter drops forming tails on all four TFs, so future mutations cannot repaint', () => {
    const closed = fixture('long');
    const expected = analyze(closed);
    const rawA = {
      biasCandles: appendForming(closed.biasCandles, 4 * 3600, 0),
      structureCandles: appendForming(closed.structureCandles, 3600, 0),
      zoneCandles: appendForming(closed.zoneCandles, 900, 0),
      triggerCandles: appendForming(closed.triggerCandles, 300, 0),
    };
    const rawB = {
      biasCandles: appendForming(closed.biasCandles, 4 * 3600, 1000),
      structureCandles: appendForming(closed.structureCandles, 3600, -50),
      zoneCandles: appendForming(closed.zoneCandles, 900, 500),
      triggerCandles: appendForming(closed.triggerCandles, 300, -40),
    };
    expect(engine.analyzeRawCandles(rawA, { symbol: 'XAUUSD' })).toEqual(expected);
    expect(engine.analyzeRawCandles(rawB, { symbol: 'XAUUSD' })).toEqual(expected);
  });

  test('engine source contains no broker/order/MT5 client dependency', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../src/services/ictFvg/ictFvgEngine.js'), 'utf8');
    expect(source).not.toMatch(/require\([^)]*(botClient|mt5|trader|broker)/i);
    expect(source).not.toMatch(/\.(sendOrder|placeOrder|openPosition|marketOrder)\s*\(/);
  });
});
