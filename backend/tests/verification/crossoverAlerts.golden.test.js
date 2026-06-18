/**
 * GOLDEN TESTS — EMA34/TEMA34 "ilk kırılım" bildirim sistemi.
 *
 * Kapsam:
 *   1) crossoverIndicators — Pine-style EMA/TEMA serisi (seed = ilk kapanış) +
 *      classifyCross dört durum (cross_above/cross_below/above/below) + null guard.
 *   2) crossoverScanner.scanAll — özel evren + mock'lanmış Yahoo verisiyle
 *      kovalama (up/down) + sayaç tutarlılığı + fetchError sayımı.
 *   3) crossoverNotifier saf kurucular — Telegram bölüm/parçalama, broadcast
 *      gövdesi, topSyms özetleme.
 *
 * liveDataService (ESM/interval) ve botPersistence (Supabase) mock'lanır → modül
 * izole & hızlı; saf fonksiyonlar test edilir.
 */

jest.mock('../../src/services/botPersistence', () => ({
  save: () => {},
  loadAll: async () => {},
}));

const ind = require('../../src/services/crossover/crossoverIndicators');

// ── 1) Indicators ──────────────────────────────────────────────────────────
describe('crossoverIndicators — EMA/TEMA serisi', () => {
  test('EMA seed = ilk kapanış, uzunluk korunur', () => {
    const closes = [10, 11, 12, 13, 14];
    const ema = ind.calcEMASeries(closes, 3);
    expect(ema).toHaveLength(5);
    expect(ema[0]).toBe(10);                 // Pine seed
    expect(ema[ema.length - 1]).toBeGreaterThan(10);
  });

  test('TEMA seed = ilk kapanış, uzunluk korunur', () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + i);
    const tema = ind.calcTEMASeries(closes, 34);
    expect(tema).toHaveLength(50);
    expect(tema[0]).toBe(100);
    // sürekli yükselen seri → TEMA da sonda yükselir
    expect(tema[49]).toBeGreaterThan(tema[0]);
  });

  test('boş girişte boş dizi', () => {
    expect(ind.calcEMASeries([], 34)).toEqual([]);
    expect(ind.calcTEMASeries([], 34)).toEqual([]);
  });
});

describe('crossoverIndicators — classifyCross (açık line dizisiyle, deterministik)', () => {
  // closes ve line'ı elle veriyoruz → float gürültüsü yok, dört durum kesin.
  test('cross_above — önceki altta, son üstte', () => {
    const closes = [10, 10, 12];
    const line = [11, 11, 11];     // prev 10<=11, last 12>11
    const r = ind.classifyCross(closes, line);
    expect(r.signal).toBe('cross_above');
    expect(r.aboveNow).toBe(true);
    expect(r.abovePrev).toBe(false);
    expect(r.distancePct).toBeCloseTo(((12 - 11) / 11) * 100, 1);
  });

  test('cross_below — önceki üstte, son altta', () => {
    const closes = [12, 12, 10];
    const line = [11, 11, 11];     // prev 12>11, last 10<=11
    expect(ind.classifyCross(closes, line).signal).toBe('cross_below');
  });

  test('above — iki bar da çizgi üstünde (kesişim değil)', () => {
    const closes = [12, 13, 14];
    const line = [11, 11, 11];
    expect(ind.classifyCross(closes, line).signal).toBe('above');
  });

  test('below — iki bar da çizgi altında (kesişim değil)', () => {
    const closes = [9, 8, 7];
    const line = [11, 11, 11];
    expect(ind.classifyCross(closes, line).signal).toBe('below');
  });

  test('null guard — uzunluk uyuşmazlığı / kısa dizi / NaN', () => {
    expect(ind.classifyCross([1, 2, 3], [1, 2])).toBeNull();        // uzunluk farkı
    expect(ind.classifyCross([1], [1])).toBeNull();                 // <2 bar
    expect(ind.classifyCross([1, NaN], [1, 1])).toBeNull();         // finite değil
  });
});

// ── 2) Scanner ─────────────────────────────────────────────────────────────
// Yahoo fetch'i mock'la: sembole göre farklı mum desenleri döndür.
const mockHist = {};
jest.mock('../../src/services/liveDataService', () => ({
  fetchHistoricalData: async (symbol) => mockHist[symbol] || null,
}));

const scanner = require('../../src/services/crossover/crossoverScanner');

// Belirtilen kapanış dizisinden mum dizisi (date + close) üret.
function candles(closes, lastDate = '2026-06-18') {
  const n = closes.length;
  return closes.map((c, i) => ({
    // son bar lastDate; öncekiler gün gün geriye (sıralama yalnız son tarih için önemli)
    date: i === n - 1 ? lastDate : `2026-01-${String((i % 27) + 1).padStart(2, '0')}`,
    close: c,
  }));
}

// Çizgisinin altına dalıp son barda sıçrayan → cross_above üreten seri.
function upCrossCloses() {
  const arr = Array.from({ length: 130 }, (_, i) => 100 - i * 0.1); // hafif düşüş → fiyat çizgi altında
  arr[arr.length - 2] = 60;     // derin dip (önceki bar belirgin altta)
  arr[arr.length - 1] = 95;     // son bar lagging EMA/TEMA üstüne sıçrar
  return arr;
}

describe('crossoverScanner.scanAll — kovalama + sayaçlar', () => {
  beforeEach(() => { for (const k of Object.keys(mockHist)) delete mockHist[k]; });

  test('cross_above sembol up kovasına düşer; sayaçlar tutarlı; az-mumlu atlanır', async () => {
    mockHist['UPONE'] = candles(upCrossCloses());                 // kırılım adayı
    mockHist['RISER'] = candles(Array.from({ length: 130 }, (_, i) => 50 + i)); // sürekli yükseliş → 'above', kesişim değil
    mockHist['SHORTY'] = candles([1, 2, 3]);                       // <100 mum → atlanır (fetchError)
    // NODATA hiç tanımlı değil → null → fetchError

    const universe = [
      { symbol: 'UPONE', name: 'Up One' },
      { symbol: 'RISER', name: 'Riser' },
      { symbol: 'SHORTY', name: 'Shorty' },
      { symbol: 'NODATA', name: 'No Data' },
    ];
    const res = await scanner.scanAll(universe);

    expect(res.ok).toBe(true);
    expect(res.scanned).toBe(2);              // UPONE + RISER (SHORTY/NODATA elendi)
    expect(res.fetchErrors).toBe(2);
    expect(res.candleDate).toBe('2026-06-18');

    // UPONE en az bir indikatörde yukarı kırılım kovasında olmalı
    const upSymbols = [...res.tema34.up, ...res.ema34.up].map(r => r.symbol);
    expect(upSymbols).toContain('UPONE');
    // RISER sürekli yükseliş → 'above' → hiçbir kovada değil
    const allBucketed = [
      ...res.tema34.up, ...res.tema34.down, ...res.ema34.up, ...res.ema34.down,
    ].map(r => r.symbol);
    expect(allBucketed).not.toContain('RISER');

    // counts dizilerle birebir tutarlı
    expect(res.counts.temaUp).toBe(res.tema34.up.length);
    expect(res.counts.temaDown).toBe(res.tema34.down.length);
    expect(res.counts.emaUp).toBe(res.ema34.up.length);
    expect(res.counts.emaDown).toBe(res.ema34.down.length);

    // kova satırı bildirim alanlarını taşır
    const row = res.tema34.up.concat(res.ema34.up).find(r => r.symbol === 'UPONE');
    expect(row).toMatchObject({ symbol: 'UPONE' });
    expect(typeof row.close).toBe('number');
    expect(typeof row.distancePct).toBe('number');
  });

  test('hiç veri yoksa ok=false', async () => {
    const res = await scanner.scanAll([{ symbol: 'NONE', name: 'x' }]);
    expect(res.ok).toBe(false);
    expect(res.scanned).toBe(0);
  });
});

// ── 3) Notifier saf kurucular ───────────────────────────────────────────────
const notifier = require('../../src/services/crossover/crossoverNotifier');

describe('crossoverNotifier — saf kurucular', () => {
  const baseResult = () => ({
    candleDate: '2026-06-18', scanned: 480, fetchErrors: 3,
    tema34: {
      up: [{ symbol: 'THYAO', close: 312.5, line: 311, distancePct: 0.5 },
           { symbol: 'GARAN', close: 5.1, line: 5.0, distancePct: 2 }],
      down: [{ symbol: 'SISE', close: 40, line: 41, distancePct: -2 }],
    },
    ema34: {
      up: [{ symbol: 'ASELS', close: 50, line: 49, distancePct: 1 }],
      down: [],
    },
    counts: { temaUp: 2, temaDown: 1, emaUp: 1, emaDown: 0 },
  });

  test('topSyms — boş, ≤3, >3', () => {
    expect(notifier.topSyms([])).toBe('—');
    expect(notifier.topSyms([{ symbol: 'A' }, { symbol: 'B' }])).toBe('A, B');
    expect(notifier.topSyms([{ symbol: 'A' }, { symbol: 'B' }, { symbol: 'C' }, { symbol: 'D' }, { symbol: 'E' }]))
      .toBe('A, B, C +2');
  });

  test('buildTelegramSection — boş kova boş string; dolu kova başlık+sayı+satır', () => {
    expect(notifier.buildTelegramSection('🟢', 'X', [])).toBe('');
    const s = notifier.buildTelegramSection('🟢', 'TEMA34 Up', [{ symbol: 'THYAO', close: 312.5, distancePct: 0.5 }]);
    expect(s).toContain('TEMA34 Up');
    expect(s).toContain('(1)');
    expect(s).toContain('THYAO');
    expect(s).toContain('+0.5%');
  });

  test('buildTelegramMessages — header + footer içerir, tek mesaja sığar', () => {
    const msgs = notifier.buildTelegramMessages(baseResult());
    expect(msgs.length).toBe(1);
    expect(msgs[0]).toContain('GÜNLÜK KIRILIM TARAMASI');
    expect(msgs[0]).toContain('2026-06-18');
    expect(msgs[0]).toContain(notifier.DEEP_LINK);
    expect(msgs[0]).toContain('THYAO');
  });

  test('buildTelegramMessages — çok büyük liste birden fazla mesaja bölünür (≤4096)', () => {
    const big = baseResult();
    big.tema34.up = Array.from({ length: 80 }, (_, i) => ({
      symbol: `SYM${i}`, close: 100 + i, distancePct: 0.1,
    }));
    big.ema34.up = Array.from({ length: 80 }, (_, i) => ({
      symbol: `EMA${i}`, close: 100 + i, distancePct: 0.1,
    }));
    big.ema34.down = Array.from({ length: 80 }, (_, i) => ({
      symbol: `DWN${i}`, close: 100 + i, distancePct: -0.1,
    }));
    const msgs = notifier.buildTelegramMessages(big);
    expect(msgs.length).toBeGreaterThan(1);
    for (const m of msgs) expect(m.length).toBeLessThanOrEqual(4096);
  });

  test('buildBroadcast — başlık toplam sayı, body topSyms, path/topic', () => {
    const b = notifier.buildBroadcast(baseResult());
    expect(b.title).toContain('4 hisse');         // 2+1+1+0
    expect(b.body).toContain('THYAO');
    expect(b.body).toContain('ASELS');
    expect(b.body).toContain('—');                // ema34.down boş
    expect(b.path).toBe(notifier.DEEP_LINK);
    expect(b.topic).toBe('all');
    expect(b.body.length).toBeLessThanOrEqual(500);
  });
});
