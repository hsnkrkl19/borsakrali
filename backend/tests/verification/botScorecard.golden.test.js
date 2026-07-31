'use strict';

/**
 * D1g + D3g — bot karnesi ("yedek adayı") ve enstrüman karnesi.
 *
 * Kullanıcı kararı D4: OTOMATİK ELEME YOK. Rapor yalnız işaret eder,
 * kararı kullanıcı verir. Bu yüzden testler iki şeyi birlikte korur:
 *  1. Zayıf bot GÖRÜNÜR olur (sessizce zarar ettirmeye devam edemez).
 *  2. Örneklem yetersizken bot DAMGALANMAZ (şanssız bir gün eleme sebebi değil).
 */

const raceReport = require('../../src/services/realResults/raceReport');
const store = require('../../src/services/realResults/store');

const bot = (over = {}) => ({
  magic: 5702, name: 'Pro Robot', trades: 30, wins: 9, losses: 21,
  net: -312.4, winRate: 30, ...over,
});

describe('D1g — yedek adayı seçimi', () => {
  test('20+ işlem, net zararda ve düşük isabet → aday', () => {
    const list = raceReport.benchCandidates([bot()]);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Pro Robot');
  });

  test('örneklem yetersizse aday DEĞİL (şanssız gün damgalamaz)', () => {
    expect(raceReport.benchCandidates([bot({ trades: 19 })])).toHaveLength(0);
  });

  test('isabeti düşük ama net KÂRDA olan bot aday değil', () => {
    expect(raceReport.benchCandidates([bot({ net: 540, winRate: 25 })])).toHaveLength(0);
  });

  test('net zararda ama isabeti yüksek bot aday değil (kötü R:R ayrı sorun)', () => {
    expect(raceReport.benchCandidates([bot({ winRate: 62 })])).toHaveLength(0);
  });

  test('adaylar en çok zarar ettirenden başlar', () => {
    const list = raceReport.benchCandidates([
      bot({ magic: 1, name: 'A', net: -100 }),
      bot({ magic: 2, name: 'B', net: -900 }),
      bot({ magic: 3, name: 'C', net: -450 }),
    ]);
    expect(list.map((r) => r.name)).toEqual(['B', 'C', 'A']);
  });
});

describe('rapor metni', () => {
  const today = [{ magic: 5702, name: 'Pro Robot', trades: 3, tp: 2, sl: 1, net: 40 }];

  test('yedek adayları bölümü rakamlarıyla yazılır', () => {
    const msg = raceReport.buildMessage(today, today, '2026-08-01', {
      scorecard: [bot({ trades: 24, winRate: 29, net: -312 })],
    });
    expect(msg).toContain('Yedek adayları');
    expect(msg).toContain('24 işlem');
    expect(msg).toContain('%29 isabet');
    expect(msg).toContain('otomatik eleme yok');
  });

  test('aday yoksa bölüm hiç basılmaz (gürültü yapmaz)', () => {
    const msg = raceReport.buildMessage(today, today, '2026-08-01', {
      scorecard: [bot({ trades: 5 })],
    });
    expect(msg).not.toContain('Yedek adayları');
  });

  test('D3g: en çok zarar ettiren sembol+yön yazılır', () => {
    const msg = raceReport.buildMessage(today, today, '2026-08-01', {
      symbols: [
        { symbol: 'XAUUSD', direction: 'long', trades: 9, wins: 2, net: -820 },
        { symbol: 'EURUSD', direction: 'short', trades: 12, wins: 8, net: 140 },
        { symbol: 'GBPUSD', direction: 'long', trades: 3, wins: 0, net: -40 },
      ],
    });
    expect(msg).toContain('XAUUSD long');
    expect(msg).toContain('-820.00$');
    expect(msg).toContain('%22 isabet');
    expect(msg).not.toContain('EURUSD short');   // kârda
    expect(msg).not.toContain('GBPUSD');         // 5 işlemin altında
  });

  test('extra verilmezse eski rapor biçimi aynen korunur', () => {
    const msg = raceReport.buildMessage(today, today, '2026-08-01');
    expect(msg).toContain('GÜNLÜK YARIŞ RAPORU');
    expect(msg).not.toContain('Yedek adayları');
    expect(msg).not.toContain('zarar ettiren enstrümanlar');
  });
});

describe('store karne fonksiyonları', () => {
  test('scorecard ve aggregateBySymbol dışa açık', () => {
    expect(typeof store.scorecard).toBe('function');
    expect(typeof store.aggregateBySymbol).toBe('function');
    // Veri yokken bile patlamaz, boş dizi döner.
    expect(Array.isArray(store.scorecard(0))).toBe(true);
    expect(Array.isArray(store.aggregateBySymbol(0))).toBe(true);
  });

  test('kazanma sayımı pnl işaretine bakar, MT5 sebep koduna DEĞİL', () => {
    // Beyin kapattığında MT5 sebebi 3 (expert-advisor) döner; TP/SL değil.
    // Karne bu yüzden reason koduna güvenemez.
    const src = require('fs').readFileSync(
      require.resolve('../../src/services/realResults/store.js'), 'utf8');
    const fn = src.slice(src.indexOf('function scorecard'), src.indexOf('function scorecard') + 900);
    expect(fn).toContain('d.pnl > 0');
    expect(fn).not.toContain('reasonCode === 5');
  });
});
