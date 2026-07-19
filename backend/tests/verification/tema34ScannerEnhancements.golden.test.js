/**
 * GOLDEN TESTS — 2026-07-19 TEMA34/BIST-AL zarar+bildirim düzeltmeleri:
 *   • Motor saf yardımcıları: gün-içi FORMING mum düşürme (A1), giriş filtresi (C),
 *     buildTfResult (up filtreli + belowAll + closeBySymbol).
 *   • Günlük kâr/zarar rapor kurucuları (B) — TEMA34 + BIST AL.
 *
 * Ağ yok: yalnız saf fonksiyonlar test edilir.
 */

const engine = require('../../src/services/tema34Scanner/tema34ScanEngine');
const temaNotifier = require('../../src/services/tema34Scanner/tema34ScannerNotifier');
const bistAlNotifier = require('../../src/services/bistAlScanner/bistAlScannerNotifier');

// Türkiye kalıcı UTC+3 → TR saati = UTC+3. Belirli bir TR anını UTC ile kur.
const trAt = (y, mo, d, hourTR, min = 0) => new Date(Date.UTC(y, mo, d, hourTR - 3, min));

describe('tema34ScanEngine — gün-içi FORMING mum düşürme (A1)', () => {
  test('bugün tarihli mum + seans açık (11:00 TR) → forming, düşürülür', () => {
    const now = trAt(2026, 6, 20, 11, 0);          // TR 2026-07-20 11:00
    expect(engine.isFormingDailyBar('2026-07-20', now)).toBe(true);
    const candles = [
      { date: '2026-07-17', close: 10 },
      { date: '2026-07-20', close: 11 },           // bugün, forming
    ];
    const out = engine.dropFormingDaily(candles, now);
    expect(out).toHaveLength(1);
    expect(out[out.length - 1].date).toBe('2026-07-17');
  });

  test('seans kapandıktan sonra (19:00 TR) → bugünün mumu NİHAİ, korunur', () => {
    const now = trAt(2026, 6, 20, 19, 0);
    expect(engine.isFormingDailyBar('2026-07-20', now)).toBe(false);
    const candles = [{ date: '2026-07-17', close: 10 }, { date: '2026-07-20', close: 11 }];
    expect(engine.dropFormingDaily(candles, now)).toHaveLength(2);
  });

  test('son mum geçmiş gün → forming değil (düşürülmez)', () => {
    const now = trAt(2026, 6, 20, 11, 0);
    expect(engine.isFormingDailyBar('2026-07-17', now)).toBe(false);
    const candles = [{ date: '2026-07-16', close: 9 }, { date: '2026-07-17', close: 10 }];
    expect(engine.dropFormingDaily(candles, now)).toHaveLength(2);
  });
});

describe('tema34ScanEngine — giriş filtresi (C, whipsaw azaltıcı)', () => {
  const prev = { ...process.env };
  afterEach(() => { process.env = { ...prev }; });

  test('1d: yükselen çizgi + likit → geçer; düşen çizgi → elenir', () => {
    delete process.env.TEMA34_FILTER_DISABLED;
    delete process.env.TEMA34_REQUIRE_RISING;
    process.env.TEMA34_MIN_TURNOVER = '50000000';
    expect(engine.passesEntryFilter({ rising: true, turnover: 1e9 }, '1d')).toBe(true);
    expect(engine.passesEntryFilter({ rising: false, turnover: 1e9 }, '1d')).toBe(false);
  });

  test('1d: likidite tabanı altı ELER; ciro bilinmiyorsa (null) ELER', () => {
    process.env.TEMA34_MIN_TURNOVER = '50000000';
    expect(engine.passesEntryFilter({ rising: true, turnover: 1e7 }, '1d')).toBe(false);  // 10M < 50M
    expect(engine.passesEntryFilter({ rising: true, turnover: null }, '1d')).toBe(false);
  });

  test('4h: likidite yok sayılır (yalnız rising)', () => {
    expect(engine.passesEntryFilter({ rising: true, turnover: null }, '4h')).toBe(true);
  });

  test('1d: uzun-trend konfluans — aboveTrend=false ELER; true/null geçer', () => {
    delete process.env.TEMA34_REQUIRE_TREND;
    process.env.TEMA34_MIN_TURNOVER = '50000000';
    expect(engine.passesEntryFilter({ rising: true, turnover: 1e9, aboveTrend: false }, '1d')).toBe(false);
    expect(engine.passesEntryFilter({ rising: true, turnover: 1e9, aboveTrend: true }, '1d')).toBe(true);
    expect(engine.passesEntryFilter({ rising: true, turnover: 1e9, aboveTrend: null }, '1d')).toBe(true);  // MA yok → geçer
  });

  test('TEMA34_REQUIRE_TREND=0 → trend kapısı kapalı (aboveTrend=false yine geçer)', () => {
    process.env.TEMA34_REQUIRE_TREND = '0';
    process.env.TEMA34_MIN_TURNOVER = '50000000';
    expect(engine.passesEntryFilter({ rising: true, turnover: 1e9, aboveTrend: false }, '1d')).toBe(true);
  });

  test('TEMA34_FILTER_DISABLED=1 → ham davranış (her cross_above geçer)', () => {
    process.env.TEMA34_FILTER_DISABLED = '1';
    expect(engine.passesEntryFilter({ rising: false, turnover: null, aboveTrend: false }, '1d')).toBe(true);
  });
});

describe('tema34ScanEngine.buildTfResult — up filtreli + belowAll + closeBySymbol', () => {
  const prev = { ...process.env };
  afterEach(() => { process.env = { ...prev }; });

  const mk = (symbol, signal, close, over = {}) => ({
    symbol, name: symbol, candleDate: '2026-07-18', barTime: 111,
    tema: { signal, lastClose: close, line: close - 0.1, distancePct: 1 },
    rising: over.rising ?? true, aboveNow: signal === 'cross_above' || signal === 'above',
    turnover: over.turnover ?? 1e9,
  });

  test('cross_above filtreden geçenler up; below olanlar belowAll; hepsi closeBySymbol', () => {
    process.env.TEMA34_MIN_TURNOVER = '50000000';
    delete process.env.TEMA34_FILTER_DISABLED;
    const analyses = [
      mk('AUP', 'cross_above', 10),                                  // geçer → up
      mk('BUP', 'cross_above', 5, { rising: false }),                // düşen çizgi → elenir
      mk('CDN', 'cross_below', 8),                                   // down + belowAll
      mk('DBE', 'below', 7),                                         // belowAll
      mk('EAB', 'above', 12),                                        // hiçbiri
    ];
    const r = engine.buildTfResult(analyses, '1d');
    expect(r.up.map(x => x.symbol)).toEqual(['AUP']);
    expect(r.filteredOut).toBe(1);
    expect(r.down.map(x => x.symbol)).toEqual(['CDN']);
    expect(r.belowAll.map(x => x.symbol).sort()).toEqual(['CDN', 'DBE']);
    expect(Object.keys(r.closeBySymbol).sort()).toEqual(['AUP', 'BUP', 'CDN', 'DBE', 'EAB']);
    expect(r.closeBySymbol.CDN).toBe(8);
  });

  test('boş analiz → ok:false', () => {
    expect(engine.buildTfResult([], '1d').ok).toBe(false);
  });
});

describe('tema34ScannerNotifier.buildDailyReportMessages (B) — açık pozisyon K/Z', () => {
  test('yeşil/kırmızı sayımı + ortalama + bugün kapananlar', () => {
    const rows = [
      { symbol: 'AAA', entry: 100, current: 110, pnlPct: 10, days: 3 },
      { symbol: 'BBB', entry: 50, current: 48, pnlPct: -4, days: 1 },
      { symbol: 'CCC', entry: 20, current: null, pnlPct: null, days: 2 },
    ];
    const closedToday = [{ symbol: 'DDD', pnlPct: 6 }];
    const msgs = temaNotifier.buildDailyReportMessages({ dateKey: '2026-07-19', rows, closedToday });
    const all = msgs.join('\n');
    expect(all).toContain('TEMA34 AÇIK POZİSYON DURUMU');
    expect(all).toContain('2026-07-19');
    expect(all).toContain('AAA');
    expect(all).toContain('+10%');
    expect(all).toContain('-4%');
    expect(all).toContain('3 açık · 1 🟢 / 1 🔴'); // rows.length=3, fiyatlı 2 → 1🟢/1🔴
    expect(all).toContain('Bugün kapananlar');
    expect(all).toContain('DDD');
  });

  test('açık pozisyon yoksa boş-durum metni', () => {
    const msgs = temaNotifier.buildDailyReportMessages({ dateKey: '2026-07-19', rows: [], closedToday: [] });
    expect(msgs.join('\n')).toContain('açık AL pozisyonu yok');
  });
});

describe('bistAlScannerNotifier.buildDailyReportMessages (B)', () => {
  test('AL açık pozisyon K/Z + TP/Stop satırı', () => {
    const rows = [
      { symbol: 'THYAO', entry: 100, current: 108, pnlPct: 8, stop: 95, target1: 110, precision: 2 },
      { symbol: 'SISE', entry: 40, current: 38, pnlPct: -5, stop: 38.5, target1: 44, precision: 2 },
    ];
    const msgs = bistAlNotifier.buildDailyReportMessages({ dateKey: '2026-07-19', rows, closedToday: [] });
    const all = msgs.join('\n');
    expect(all).toContain('BIST AL AÇIK POZİSYON DURUMU');
    expect(all).toContain('THYAO');
    expect(all).toContain('+8%');
    expect(all).toContain('TP1');
    expect(all).toContain('Stop');
    expect(all).toContain('2 açık');
  });
});
