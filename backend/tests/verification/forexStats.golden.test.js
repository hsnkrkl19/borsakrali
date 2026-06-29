/**
 * GOLDEN TESTS — Forex SONUÇ sayacı + günlük rapor (forexStatsStore).
 * Kullanıcı: TP/SL olaylarını say, 20:00 rapor. TP1→tp, SL→sl, TRAIL→iz-süren.
 */
const os = require('os');
const path = require('path');
process.env.FOREX_STATS_FILE = path.join(os.tmpdir(), `fx-stats-test-${process.pid}.json`);

const s = require('../../src/services/forex/forexStatsStore');

describe('forexStatsStore — TP/SL/iz-süren sayımı', () => {
  beforeEach(() => s.__resetForTest());

  test('recordClosure sonuç bazında sayar (TP1/SL/TRAIL); bilinmeyen yok sayılır', async () => {
    await s.recordOpen(); await s.recordOpen(); await s.recordOpen();
    await s.recordClosure({ outcome: 'TP1' });
    await s.recordClosure({ outcome: 'TP1' });
    await s.recordClosure({ outcome: 'SL' });
    await s.recordClosure({ outcome: 'TRAIL' });
    await s.recordClosure({ outcome: 'EXPIRE' });   // artık üretilmez ama gelse bile sayılmaz
    const st = await s.getStats();
    expect(st.opened).toBe(3);
    expect(st.tp).toBe(2);
    expect(st.sl).toBe(1);
    expect(st.trail).toBe(1);
  });

  test('buildReport — TP/STOP/iz-süren + başarı oranı (kazanan=tp+trail)', async () => {
    await s.recordClosure({ outcome: 'TP1' });
    await s.recordClosure({ outcome: 'TRAIL' });
    await s.recordClosure({ outcome: 'SL' });
    const m = await s.buildReport();
    expect(m).toMatch(/GÜNLÜK RAPOR/);
    expect(m).toContain('✅ 1 TP');
    expect(m).toContain('🛡 1 iz-süren');
    expect(m).toContain('🛑 1 stop');
    expect(m).toMatch(/%67/);          // başarı (1tp+1trail)/(1+1+1)=2/3=%67
  });
});
