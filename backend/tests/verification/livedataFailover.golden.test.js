/**
 * FAILOVER TESTS — liveDataService Yahoo → İş Yatırım yedekleme (D1, checklist B)
 * Sağlayıcı (Yahoo) boş/hatalı dönerse İş Yatırım'a düşüş + bayat (stale) işaretleme.
 * axios mock'lanır; isYatirimDataService LAZY require olduğu için jest.mock yakalar.
 */
jest.mock('axios');
jest.mock('../../src/services/isYatirimDataService', () => ({
  fetchIndexData: jest.fn(),
  fetchStockData: jest.fn(),
}));

const axios = require('axios');
const isY = require('../../src/services/isYatirimDataService');
const live = require('../../src/services/liveDataService');

let origErr, origWarn;
beforeAll(() => { origErr = console.error; origWarn = console.warn; console.error = () => {}; console.warn = () => {}; });
afterAll(() => { console.error = origErr; console.warn = origWarn; });
beforeEach(() => { jest.clearAllMocks(); });

describe('fetchBist100 — failover', () => {
  test('Yahoo boş sonuç → İş Yatırım fallback (retry YOK, stale+source)', async () => {
    axios.get.mockResolvedValue({ data: {} });               // chart.result yok
    isY.fetchIndexData.mockResolvedValue([{ value: 100 }, { value: 101 }]);
    const r = await live.fetchBist100();
    expect(axios.get).toHaveBeenCalledTimes(1);              // endeks fetch'i retry yapmaz
    expect(isY.fetchIndexData).toHaveBeenCalledWith('XU100', expect.any(String), expect.any(String));
    expect(r.symbol).toBe('XU100');
    expect(r.source).toBe('isyatirim');
    expect(r.stale).toBe(true);                              // bayat veri "canlı" gibi işaretlenmez
    expect(r.value).toBe(101);
    expect(r.previousClose).toBe(100);
    expect(r.changePercent).toBeCloseTo(1, 2);
    expect(r.high).toBeNull();
  });

  test('Yahoo throw → İş Yatırım fallback (catch yolu)', async () => {
    axios.get.mockRejectedValue(new Error('network'));
    isY.fetchIndexData.mockResolvedValue([{ value: 200 }, { value: 210 }]);
    const r = await live.fetchBist100();
    expect(r.source).toBe('isyatirim');
    expect(r.value).toBe(210);
  });

  test('Yahoo başarılı → fallback YOK, canlı veri (source/stale yok)', async () => {
    axios.get.mockResolvedValue({ data: { chart: { result: [{ meta: {
      regularMarketPrice: 13900, previousClose: 13800,
      regularMarketDayHigh: 14000, regularMarketDayLow: 13700, regularMarketVolume: 1e9,
    } }] } } });
    const r = await live.fetchBist100();
    expect(isY.fetchIndexData).not.toHaveBeenCalled();
    expect(r.value).toBe(13900);
    expect(r.changePercent).toBeCloseTo(0.72, 1);           // (13900-13800)/13800*100
    expect(r.source).toBeUndefined();
    expect(r.stale).toBeUndefined();
  });

  test('Yahoo boş + İş Yatırım da yetersiz (<2 satır) → null', async () => {
    axios.get.mockResolvedValue({ data: {} });
    isY.fetchIndexData.mockResolvedValue([{ value: 100 }]);
    expect(await live.fetchBist100()).toBeNull();
  });
});

describe('fetchBist30 — failover', () => {
  test('Yahoo boş → İş Yatırım fallback XU030 koduyla', async () => {
    axios.get.mockResolvedValue({ data: {} });
    isY.fetchIndexData.mockResolvedValue([{ value: 50 }, { value: 49 }]);
    const r = await live.fetchBist30();
    expect(isY.fetchIndexData).toHaveBeenCalledWith('XU030', expect.any(String), expect.any(String));
    expect(r.symbol).toBe('XU030');
    expect(r.changePercent).toBeCloseTo(-2, 1);             // (49-50)/50*100
    expect(r.stale).toBe(true);
  });
});
