'use strict';
const monitor = require('../../src/services/signalQuality/monitor');
const { Calibrator } = require('../../src/services/signalQuality/calibration');

describe('monitor — rapor', () => {
  test('namespace başına n/ECE/bayrak üretir', () => {
    const c = new Calibrator();
    for (let k = 0; k < 40; k++) {
      c.record('cryptoScorer:futures_long:long', 0.8, k % 4 !== 0);
      c.record('cryptoScorer:futures_long:long', 0.3, k % 4 === 0);
      c.record('beast:BTCUSD:long', 0.6, k % 2 === 0);
    }
    const rows = monitor.report(c, { minSamples: 15 });
    expect(rows.length).toBe(2);
    const top = rows[0];
    expect(top.n).toBeGreaterThan(0);
    expect(typeof top.ece).toBe('number');
    expect(typeof top.trustworthy).toBe('boolean');
    expect(Array.isArray(top.flags)).toBe(true);
  });

  test('az örnekli namespace az_ornek bayrağı alır', () => {
    const c = new Calibrator();
    c.record('eng:s:long', 0.5, true);
    const rows = monitor.report(c, { minSamples: 15 });
    expect(rows[0].flags).toContain('az_ornek');
    expect(rows[0].trustworthy).toBe(false);
  });
});

describe('monitor — güvenli disk', () => {
  test('olmayan kalibrasyon yolu boş kalibratör verir', () => {
    const c = monitor.loadCalibrator('/tmp/yok-boyle-bir-dosya-123456.json');
    expect(monitor.report(c)).toEqual([]);
  });
  test('olmayan shadow dizini {} döner', () => {
    expect(monitor.summarizeShadow('/tmp/yok-boyle-dizin-123456')).toEqual({});
  });
});
