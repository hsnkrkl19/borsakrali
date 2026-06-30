/**
 * GOLDEN TESTS — brokerPrices (köprünün gönderdiği canlı broker bid/ask deposu).
 * Engine, taze broker fiyatını Yahoo yerine livePrice olarak kullanır (basis giderme).
 */
const bp = require('../../src/services/forex/brokerPrices');

describe('brokerPrices — set/get/mid + geçersiz filtre', () => {
  beforeEach(() => bp.__resetForTest());

  test('geçerli bid/ask saklanır; mid = ortalama; id upper-case', () => {
    const n = bp.set({ xauusd: { bid: 4070.0, ask: 4070.4 } });
    expect(n).toBe(1);
    const p = bp.get('XAUUSD');
    expect(p).not.toBeNull();
    expect(p.mid).toBeCloseTo(4070.2, 4);
    expect(bp.get('xauusd')).not.toBeNull(); // case-insensitive
  });

  test('geçersiz (bid/ask ≤ 0 veya eksik) atlanır', () => {
    const n = bp.set({ A: { bid: 0, ask: 1 }, B: { ask: 2 }, C: { bid: 1.1, ask: 1.2 } });
    expect(n).toBe(1);
    expect(bp.get('A')).toBeNull();
    expect(bp.get('B')).toBeNull();
    expect(bp.get('C').mid).toBeCloseTo(1.15, 4);
  });

  test('bilinmeyen id → null; bozuk girdi → 0 saklanır', () => {
    expect(bp.get('YOK')).toBeNull();
    expect(bp.set(null)).toBe(0);
    expect(bp.set('x')).toBe(0);
  });
});
