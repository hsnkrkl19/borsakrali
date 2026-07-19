/**
 * GOLDEN TESTS — tema34ScannerTracker (@tema34sinyal ters-kesişim SONUÇ takibi).
 *
 * TEMA34'ün TP/SL'si yoktur; "sonuç" = AL bölgesine giren (cross_above) hissenin
 * sat bölgesine geçmesi (cross_below). Tracker bunu MUM YENİDEN ÇEKMEDEN doğrudan
 * taramanın up/down listesinden türetir.
 *
 * Kapsam:
 *   1) sync — 1d 'up' → açık kayıt; sonraki 'down' → kapanış (pnl% + kaç gün);
 *      idempotluk (aynı up tekrar → dup yok); 4h/geçersiz TF yok sayılır; takipte
 *      olmayan sembolün 'down'u yok sayılır.
 *
 * supabase mock'lanır; tracker diski tmp'ye yazar (hermetik).
 */

const os = require('os');
const path = require('path');

process.env.TEMA34_TRACKER_DISK_FILE = path.join(os.tmpdir(), `tema34-tracker-test-${process.pid}.json`);
jest.mock('../../src/lib/supabase', () => ({ supabaseAdmin: null, isSupabaseEnabled: () => false }));

const tracker = require('../../src/services/tema34Scanner/tema34ScannerTracker');

// 1d tarama sonucu kurucu.
const tf = (over = {}) => ({ ok: true, tf: '1d', candleDate: '2026-06-29', scanned: 480, up: [], down: [], ...over });
const row = (symbol, close, distancePct = 0.5) => ({ symbol, name: symbol, close, line: close - 0.1, distancePct });

describe('tema34ScannerTracker.sync — kayıt + ters-kesişim kapanışı', () => {
  beforeEach(() => tracker.__resetForTest());

  test('1d "up" (cross_above) → açık pozisyon (entry=close, entryDate=candleDate)', async () => {
    const { opened, closures } = await tracker.sync(tf({ candleDate: '2026-06-20', up: [row('THYAO', 10), row('GARAN', 5)] }));
    expect(opened.sort()).toEqual(['GARAN', 'THYAO']);
    expect(closures).toHaveLength(0);
    const open = await tracker.getOpen();
    expect(open).toHaveLength(2);
    expect(open.find(p => p.symbol === 'THYAO')).toMatchObject({ entry: 10, entryDate: '2026-06-20' });
  });

  test('1d dışı / geçersiz TF yok sayılır', async () => {
    await tracker.sync({ ok: true, tf: '4h', up: [row('THYAO', 10)], down: [] });
    await tracker.sync({ ok: false, tf: '1d', up: [row('X', 1)], down: [] });
    expect(await tracker.getOpen()).toHaveLength(0);
  });

  test('sonraki "down" (cross_below) → kapanış TESPİT + commit ile kapanır', async () => {
    await tracker.sync(tf({ candleDate: '2026-06-20', up: [row('SISE', 40)] }));      // giriş 40
    const { closures } = await tracker.sync(tf({ candleDate: '2026-06-29', down: [row('SISE', 44, -1)] }));  // çıkış 44
    expect(closures).toHaveLength(1);
    expect(closures[0]).toMatchObject({
      symbol: 'SISE', outcome: 'CROSS_DOWN', entry: 40, exit: 44,
      entryDate: '2026-06-20', exitDate: '2026-06-29', daysHeld: 9, pnlPct: 10,
    });
    // ⚠️ detect/commit: sync TESPİT eder ama commit'e (gönderim sonrası) kadar AÇIK kalır
    expect(await tracker.getOpen()).toHaveLength(1);
    tracker.commitClosures(closures);
    expect(await tracker.getOpen()).toHaveLength(0);           // kapandı
    expect((await tracker.getClosedRecent())[0].symbol).toBe('SISE');
  });

  test('KENDİNİ-ONARAN kapanış: geçiş barı kaçsa bile "belowAll" ile kapanış tespit edilir', async () => {
    await tracker.sync(tf({ candleDate: '2026-06-20', up: [row('SISE', 40)] }));
    // down BOŞ (geçiş barı kaçtı) ama sembol o an çizgi altında (belowAll) → yine tespit
    const { closures } = await tracker.sync(tf({ candleDate: '2026-06-30', down: [], belowAll: [row('SISE', 38, -3)] }));
    expect(closures).toHaveLength(1);
    expect(closures[0]).toMatchObject({ symbol: 'SISE', exit: 38, pnlPct: -5 });
  });

  test('zarar senaryosu — çıkış girişin altında → negatif pnl', async () => {
    await tracker.sync(tf({ up: [row('AAA', 100)] }));
    const { closures } = await tracker.sync(tf({ down: [row('AAA', 90)] }));
    expect(closures[0].pnlPct).toBe(-10);
  });

  test('gönderim başarısız senaryosu — commit çağrılmazsa pozisyon AÇIK kalır (retry)', async () => {
    await tracker.sync(tf({ candleDate: '2026-06-20', up: [row('RTY', 50)] }));
    const { closures } = await tracker.sync(tf({ candleDate: '2026-06-29', down: [row('RTY', 48, -1)] }));
    expect(closures).toHaveLength(1);
    // commit ÇAĞRILMADI (gönderim başarısız) → hâlâ açık → sonraki tur tekrar tespit
    expect(await tracker.getOpen()).toHaveLength(1);
    const again = await tracker.sync(tf({ candleDate: '2026-06-30', down: [row('RTY', 47, -1)] }));
    expect(again.closures).toHaveLength(1);
  });

  test('takipte olmayan sembolün "down"u yok sayılır (kapanış yok)', async () => {
    const { closures } = await tracker.sync(tf({ down: [row('ZZZ', 50)] }));
    expect(closures).toHaveLength(0);
  });

  test('idempotluk — aynı "up" ikinci kez → dup açılmaz', async () => {
    await tracker.sync(tf({ up: [row('THYAO', 10)] }));
    const { opened } = await tracker.sync(tf({ up: [row('THYAO', 10)] }));
    expect(opened).toHaveLength(0);
    expect(await tracker.getOpen()).toHaveLength(1);
  });
});
