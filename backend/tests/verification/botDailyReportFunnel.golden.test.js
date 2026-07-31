'use strict';

/**
 * C2 — günlük raporda "işlem yok" yerine SEBEP.
 *
 * 2026-07-31: rapor 36 bot için düz "işlem yok" dedi. Kullanıcı "botlar neyi
 * atlıyor?" diye sorduğunda cevap rapordan okunamıyordu. Artık her sessiz bot
 * için huninin (C1) hangi kademesinde tıkandığı yazılır.
 */

const botFunnel = require('../../src/services/botFunnel');
const report = require('../../src/services/botDailyReport');
const catalog = require('../../src/services/botCompetition/catalog');

const PRO = catalog.find((e) => e.id === 'pro-robot');       // magic 5702
const FOREX = catalog.find((e) => e.id === 'forex-signals'); // magic 5701 + köprü 550055

beforeEach(() => botFunnel.resetForTest());

// realAgg = [] -> useReal false; gerçek moda geçmek için en az bir satır lazım.
const realRow = (magic, over = {}) => ({
  magic, name: `Magic ${magic}`, trades: 1, tp: 1, sl: 0, net: 10, ...over,
});

describe('günlük rapor huni sebepleri', () => {
  test('hiç sinyal üretmeyen bot için "sinyal üretmedi" yazar', () => {
    const { text } = report.build(Date.now(), null, [realRow(5703)]);
    expect(text).toContain(`${PRO.name} — <i>sinyal üretmedi</i>`);
    expect(text).not.toContain(`${PRO.name} — <i>işlem yok</i>`);
  });

  test('sinyal üretip reddedilen bot için sebep ve sayı yazar', () => {
    botFunnel.noteSignal(5702); botFunnel.noteSignal(5702); botFunnel.noteSignal(5702);
    botFunnel.noteDecision(5702, false, 'risk_budget_too_small');
    botFunnel.noteDecision(5702, false, 'risk_budget_too_small');
    botFunnel.noteDecision(5702, false, 'daily_loss_halt');
    const { text } = report.build(Date.now(), null, [realRow(5703)]);
    expect(text).toContain('3 sinyal, hepsi reddedildi');
    expect(text).toContain('risk_budget_too_small');
  });

  test('botun TÜM magicleri (adanmış köprü dahil) tek sebepte toplanır', () => {
    // Bot 1 sinyali kendi magiciyle, emri adanmış köprü magiciyle üretir.
    botFunnel.noteSignal(FOREX.magic);
    botFunnel.noteDecision(FOREX.dedicatedBridgeMagic, true);
    const { text } = report.build(Date.now(), null, [realRow(5703)]);
    // İki magic ayrı okunsaydı "sinyal üretmedi" derdi; birleşince doğru kademe.
    expect(text).toContain(`${FOREX.name} — <i>1 emir gitti, broker doldurmadı</i>`);
  });

  test('gün toplamının altına huni özeti ve en sık ret sebepleri gelir', () => {
    botFunnel.noteSignal(5702); botFunnel.noteSignal(5704);
    botFunnel.noteDecision(5702, true);
    botFunnel.noteDecision(5704, false, 'symbol_not_available');
    botFunnel.noteFill(5702);
    const { text } = report.build(Date.now(), null, [realRow(5703)]);
    expect(text).toContain('🔎 <b>Huni:</b> 2 sinyal → 1 onay / 1 ret · 1 dolum · 0 kapanış');
    expect(text).toContain('symbol_not_available ×1');
  });

  test('hiç sinyal yoksa huni özeti satırı basılmaz (gürültü yapmaz)', () => {
    const { text } = report.build(Date.now(), null, [realRow(5703)]);
    expect(text).not.toContain('🔎 <b>Huni:</b>');
  });

  test('işlem yapan bot için sebep satırı basılmaz, rakamlar yazılır', () => {
    botFunnel.noteSignal(5702);
    const { text } = report.build(Date.now(), null, [realRow(5702, { trades: 4, tp: 3, sl: 1, net: 55.5 })]);
    expect(text).toContain('4 işlem · 3 TP · 1 SL');
    expect(text).not.toContain(`${PRO.name} — <i>`);
  });

  test('huni servisi patlarsa rapor DÜŞMEZ, eski metne döner', () => {
    const spy = jest.spyOn(botFunnel, 'funnel').mockImplementation(() => {
      throw new Error('funnel-bozuk');
    });
    try {
      const { text } = report.build(Date.now(), null, [realRow(5703)]);
      expect(text).toContain('GÜNLÜK BOT RAPORU');
      expect(text).toContain(`${PRO.name} — <i>işlem yok</i>`);
    } finally { spy.mockRestore(); }
  });
});
