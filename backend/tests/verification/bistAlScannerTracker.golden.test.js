/**
 * GOLDEN TESTS — bistAlScannerTracker (@borsasinyal34 AL sinyallerinin TP/SL
 * sonuç takibi).
 *
 * Kapsam:
 *   1) registerSignals — yeni sembol → açık pozisyon; aynı sembol daha yüksek
 *      stop/TP → iz süren güncelleme (yukarı); daha düşük → değişmez.
 *   2) checkClosures — TP1 / SL / EXPIRE tespiti; SAHTE-STOP koruması (önceki
 *      kapanışın %20 altındaki bozuk low reddedilir); İLERİ-YÖNLÜ stop
 *      (yükseltilen stop yalnız konduğu tarihten sonra tetikler).
 *
 * liveDataService + supabase mock'lanır; tracker diski tmp'ye yazar (hermetik).
 */

const os = require('os');
const path = require('path');

process.env.BIST_AL_TRACKER_DISK_FILE = path.join(os.tmpdir(), `bist-al-tracker-test-${process.pid}.json`);

// Supabase kapalı → yalnız disk (tmp). fetchHistoricalData sembol→mum enjekte.
jest.mock('../../src/lib/supabase', () => ({ supabaseAdmin: null, isSupabaseEnabled: () => false }));
const mockHist = {};
jest.mock('../../src/services/liveDataService', () => ({
  fetchHistoricalData: async (symbol) => mockHist[symbol] || null,
}));

const tracker = require('../../src/services/bistAlScanner/bistAlScannerTracker');

const alSig = (symbol, over = {}) => ({
  symbol, name: symbol, direction: 'long', entry: 100, stop: 95, target1: 110, target2: 120,
  rr1: 2, rr2: 4, avgVoteScore: 85, precision: 2, ...over,
});

describe('bistAlScannerTracker.registerSignals — sembol-bazlı kayıt + iz süren güncelleme', () => {
  beforeEach(() => { tracker.__resetForTest(); for (const k of Object.keys(mockHist)) delete mockHist[k]; });

  test('yeni sinyal → açık pozisyon (entry/stop/TP + güç)', async () => {
    const added = await tracker.registerSignals([alSig('THYAO')]);
    expect(added).toEqual(['THYAO']);
    const open = await tracker.getOpen();
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ symbol: 'THYAO', entry: 100, stop: 95, target1: 110, target2: 120, score: 85 });
  });

  test('LONG-only ve entry>0 dışı elenir', async () => {
    const added = await tracker.registerSignals([
      alSig('SHORT', { direction: 'short' }),
      alSig('ZERO', { entry: 0 }),
      alSig('OK'),
    ]);
    expect(added).toEqual(['OK']);
  });

  test('aynı sembol daha yüksek stop/TP → iz süren yukarı güncelleme', async () => {
    await tracker.registerSignals([alSig('THYAO')]);
    await tracker.registerSignals([alSig('THYAO', { stop: 98, target1: 114, target2: 124, avgVoteScore: 88 })]);
    const open = await tracker.getOpen();
    expect(open).toHaveLength(1);                     // yeni pozisyon açılmaz
    expect(open[0].stop).toBe(98);
    expect(open[0].target1).toBe(114);
    expect(open[0].score).toBe(88);
  });

  test('aynı sembol daha DÜŞÜK stop → iz sürmez (yüksek korunur)', async () => {
    await tracker.registerSignals([alSig('THYAO')]);
    await tracker.registerSignals([alSig('THYAO', { stop: 90, target1: 108 })]);
    const open = await tracker.getOpen();
    expect(open[0].stop).toBe(95);
    expect(open[0].target1).toBe(110);
  });
});

describe('bistAlScannerTracker.checkClosures — TP/SL/EXPIRE + sahte-stop', () => {
  beforeEach(() => { tracker.__resetForTest(); for (const k of Object.keys(mockHist)) delete mockHist[k]; });
  const openOne = (symbol) => tracker.registerSignals([alSig(symbol)]);

  test('hedefe ulaşınca TP1 (exit=target1, pnl%)', async () => {
    await openOne('TPS');
    mockHist['TPS'] = [
      { date: '2099-01-02', close: 100, high: 101, low: 99 },
      { date: '2099-01-03', close: 109, high: 112, low: 104 },   // high 112 ≥ 110 → TP1
    ];
    const ev = await tracker.checkClosures();                   // TESPİT (silmez)
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ symbol: 'TPS', outcome: 'TP1', exit: 110, pnlPct: 10 });
    // ⚠️ detect/commit: tespit sonrası hâlâ açık; commit ile (gönderim başarısı sonrası) kapanır
    expect(await tracker.getOpen()).toHaveLength(1);
    tracker.commitClosures(ev);
    expect(await tracker.getOpen()).toHaveLength(0);           // kapandı → open'dan silindi
  });

  test('gönderim başarısız → commit çağrılmazsa açık kalır, yeniden tespit edilir (retry)', async () => {
    await openOne('RTY');
    mockHist['RTY'] = [
      { date: '2099-01-02', close: 100, high: 101, low: 99 },
      { date: '2099-01-03', close: 109, high: 112, low: 104 },   // TP1
    ];
    const ev1 = await tracker.checkClosures();
    expect(ev1).toHaveLength(1);
    expect(await tracker.getOpen()).toHaveLength(1);            // commit yok → açık
    const ev2 = await tracker.checkClosures();                 // sonraki tur yeniden tespit
    expect(ev2).toHaveLength(1);
    expect(ev2[0]).toMatchObject({ symbol: 'RTY', outcome: 'TP1' });
  });

  test('stopa düşünce SL (exit=stop, negatif pnl)', async () => {
    await openOne('SLS');
    mockHist['SLS'] = [
      { date: '2099-01-02', close: 100, high: 101, low: 99 },
      { date: '2099-01-03', close: 94, high: 99, low: 93 },      // low 93 ≤ 95 → SL
    ];
    const ev = await tracker.checkClosures();
    expect(ev[0]).toMatchObject({ outcome: 'SL', exit: 95, pnlPct: -5 });
  });

  test('SAHTE-STOP: önceki kapanışın %20 altı bozuk low reddedilir → kapanış YOK', async () => {
    await openOne('BAD');
    mockHist['BAD'] = [
      { date: '2099-01-02', close: 100, high: 101, low: 99 },
      { date: '2099-01-03', close: 99, high: 101, low: 10 },     // low 10 (prev 100 → <%80) → bozuk
    ];
    const ev = await tracker.checkClosures();
    expect(ev).toHaveLength(0);
    expect((await tracker.getOpen()).find(p => p.symbol === 'BAD')).toBeTruthy();
  });

  test('iz süren stop yükseltildi → ÖNCEKİ günün dibi geriye dönük tetiklemez', async () => {
    await openOne('FWD');
    const p = (await tracker.getOpen())[0];
    p.stop = 98; p.stopSetDate = '2099-06-15';
    mockHist['FWD'] = [
      { date: '2099-06-10', close: 100, high: 101, low: 96 },    // stopSetDate ÖNCESİ → tetiklemez
      { date: '2099-06-20', close: 100, high: 101, low: 99 },    // sonrası low 99 > 98 → tetiklemez
    ];
    expect(await tracker.checkClosures()).toHaveLength(0);
  });

  test('stop yükseltildikten SONRAKİ gün dibe inerse SL', async () => {
    await openOne('FWD2');
    const p = (await tracker.getOpen())[0];
    p.stop = 98; p.stopSetDate = '2099-06-15';
    mockHist['FWD2'] = [
      { date: '2099-06-10', close: 100, high: 101, low: 96 },
      { date: '2099-06-20', close: 100, high: 101, low: 97 },    // sonra: low 97 ≤ 98 → SL
    ];
    const ev = await tracker.checkClosures();
    expect(ev[0]).toMatchObject({ outcome: 'SL', exit: 98 });
  });

  test('süre dolunca EXPIRE (exit=son kapanış)', async () => {
    await openOne('EXP');
    const p = (await tracker.getOpen())[0];
    p.issuedAt = new Date(Date.now() - 30 * 86400000).toISOString();   // 30 gün önce (>20 EXPIRE_DAYS)
    mockHist['EXP'] = [
      { date: '2099-01-02', close: 103, high: 104, low: 99 },          // TP/SL yok
    ];
    const ev = await tracker.checkClosures();
    expect(ev).toHaveLength(1);
    expect(ev[0].outcome).toBe('EXPIRE');
    expect(ev[0].exit).toBe(103);
    tracker.commitClosures(ev);                                // closed'a yazılması commit ile
    const closed = await tracker.getClosedRecent();
    expect(closed[0].symbol).toBe('EXP');
  });
});
