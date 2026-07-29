'use strict';

// Günlük yarış raporu — saf biçimlendirici sözleşmesi.
const raceReport = require('../../src/services/realResults/raceReport');

const row = (name, magic, trades, tp, sl, net) => ({ name, magic, trades, tp, sl, net });

describe('raceReport.buildMessage', () => {
  test('bugünkü lider tablosu net-azalan sırayla, madalyalı ve toplamlı gelir', () => {
    const today = [
      row('Forex Signals', 5701, 3, 2, 1, 120.5),
      row('BK XAU Runner', 5715, 5, 4, 1, 260.0),
      row(null, 999999, 1, 0, 1, -35.25),
    ];
    const total = [
      row('BK XAU Runner', 5715, 40, 28, 12, 1200),
      row('Forex Signals', 5701, 22, 12, 10, 300),
    ];
    const msg = raceReport.buildMessage(today, total, '2026-07-30');
    expect(msg).toContain('GÜNLÜK YARIŞ RAPORU');
    expect(msg).toContain('(2026-07-30)');
    expect(msg).toContain('9</b> gerçek işlem');
    expect(msg).toContain('+345.25$');           // 120.5 + 260 - 35.25
    expect(msg.indexOf('🥇 BK XAU Runner')).toBeGreaterThan(-1);
    expect(msg.indexOf('🥇 BK XAU Runner')).toBeLessThan(msg.indexOf('🥈 Forex Signals'));
    expect(msg).toContain('Magic 999999');        // katalog dışı magic kaybolmaz
    expect(msg).toContain('GENEL: 62 işlem');
    expect(msg).toContain('borsakrali.com/bot');
  });

  test('işlemsiz gün dürüst raporlanır, uydurma satır yok', () => {
    const msg = raceReport.buildMessage([], [], '2026-07-30');
    expect(msg).toContain('Bugün kapanan gerçek işlem yok');
    expect(msg).not.toContain('🥇');
    expect(msg).not.toContain('GENEL');
  });

  test('TR gün başlangıcı sabit UTC+3 ile hesaplanır', () => {
    // 2026-07-30 01:30 TR = 2026-07-29 22:30 UTC → gün başı 2026-07-29 21:00 UTC.
    const nowSec = Date.UTC(2026, 6, 29, 22, 30, 0) / 1000;
    expect(raceReport.trDayStartSec(nowSec)).toBe(Date.UTC(2026, 6, 29, 21, 0, 0) / 1000);
    expect(raceReport.trDateLabel(nowSec)).toBe('2026-07-30');
  });
});
