'use strict';

/**
 * Günlük raporun magic eşlemesi — 2026-07-31 olayının regresyonu.
 *
 * Gerçek hesap 60+ işlem / −3.234,88 $ gösterirken rapor 18 işlem / −74,51 $
 * dedi. Sebep: rapor `dedicatedBridgeMagic`'i hiç okumuyordu, dolayısıyla
 * Bot 1 (forex köprüsü 550055) ve Bot 5 (tarayıcı 550066) işlemleri hem
 * listeden hem GÜN TOPLAMI'ndan düşüyordu. Katalog dışı magic'ler de sessizce
 * yok sayılıyordu.
 */

const catalog = require('../../src/services/botCompetition/catalog');

describe('günlük rapor magic eşlemesi', () => {
  test('adanmış köprü magicleri katalogda tanımlı (Bot 1 forex, Bot 5 tarayıcı)', () => {
    const forex = catalog.find((e) => e.id === 'forex-signals');
    const scanner = catalog.find((e) => e.id === 'mt5-scanner');
    expect(forex.dedicatedBridgeMagic).toBe(550055);
    expect(scanner.dedicatedBridgeMagic).toBe(550066);
    // Bu magicler bot magicinden FARKLI — tek magic okumak işlemleri düşürür.
    expect(forex.dedicatedBridgeMagic).not.toBe(forex.magic);
    expect(scanner.dedicatedBridgeMagic).not.toBe(scanner.magic);
  });

  test('rapor kaynağı botDailyReport dedicatedBridgeMagic okur', () => {
    const src = require('fs').readFileSync(
      require.resolve('../../src/services/botDailyReport/index.js'), 'utf8');
    // Hatalı kodda bu satır YOKTU; regresyon tam olarak buradan doğdu.
    expect(src).toContain('entry.dedicatedBridgeMagic');
    // Eşlenmeyen magicler sessizce düşürülmemeli.
    expect(src).toContain('seenMagics');
    expect(src).toMatch(/Eşlenmemiş Magic/);
  });

  test('realResults.magicToBot adanmış köprü magicini doğru bota bağlar', () => {
    const store = require('../../src/services/realResults/store');
    const forexBot = store.magicToBot(550055);
    const scannerBot = store.magicToBot(550066);
    expect(forexBot.name).toBeTruthy();
    expect(forexBot.name).not.toMatch(/^Magic /);
    expect(scannerBot.name).toBeTruthy();
    expect(scannerBot.name).not.toMatch(/^Magic /);
  });

  test('her yarışan botun en az bir pozitif magici vardır', () => {
    const competitors = catalog.filter((e) => Number.isFinite(e.no));
    for (const e of competitors) {
      const magics = [
        Number(e.magic),
        Number(e.dedicatedBridgeMagic),
        ...Object.values(e.magicByStrategy || {}).map(Number),
      ].filter((m) => Number.isFinite(m) && m > 0);
      expect(magics.length).toBeGreaterThan(0);
    }
  });
});
