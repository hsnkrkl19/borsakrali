'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ict-fvg-tracker-'));
process.env.ICT_FVG_TRACKER_FILE = path.join(tempDir, 'positions.json');

jest.mock('../../src/services/forex/forexKlines', () => ({ fetchCandles: jest.fn() }));
jest.mock('../../src/services/botPersistence', () => ({ save: jest.fn() }));
jest.mock('../../src/services/telegramService', () => ({ sendMessage: jest.fn() }));
jest.mock('../../src/services/signalDelivery', () => ({ signalChannel: jest.fn(() => '@fallback_channel') }));

const forexKlines = require('../../src/services/forex/forexKlines');
const telegramService = require('../../src/services/telegramService');
const tracker = require('../../src/services/ictFvg/ictFvgTracker');
const notifier = require('../../src/services/ictFvg/ictFvgNotifier');

function signal(overrides = {}) {
  const direction = overrides.direction || 'long';
  const fillPrice = overrides.fillPrice ?? 100;
  const fillTimeSec = overrides.fillTimeSec ?? 1_700_000_000;
  const n = overrides.n || '1';
  return {
    signalId: `ICTFVG:XAUUSD:${n}`,
    setupKey: `ICTFVG:XAUUSD:${n}`,
    instrumentId: 'XAUUSD',
    symbol: 'XAU/USD',
    direction,
    entry: 99, // zone price: tracker must use the confirmed 5m fill close instead.
    fillPrice,
    fillTimeSec,
    fillTf: '5m',
    fillBar: { time: fillTimeSec, close: fillPrice, closed: true, tf: '5m' },
    stop: direction === 'long' ? fillPrice - 2 : fillPrice + 2,
    target1: direction === 'long' ? fillPrice + 4 : fillPrice - 4,
    target2: direction === 'long' ? fillPrice + 6 : fillPrice - 6,
    timeframe: '5m',
    zoneTimeframe: '15m',
    strategy: 'ict_fvg',
    barKey: `bar-${n}`,
    precision: 2,
    confidence: 82,
    ...overrides,
  };
}

function bar(time, { low = 99, high = 101, close = 100 } = {}) {
  return { time, open: 100, low, high, close, volume: 1 };
}

describe('ICT/FVG bağımsız paper tracker', () => {
  beforeEach(() => {
    delete process.env.ICT_FVG_PUSH_DISABLED;
    delete process.env.TELEGRAM_ICT_FVG_CHANNEL;
    tracker.__resetForTest();
    forexKlines.fetchCandles.mockReset();
    telegramService.sendMessage.mockReset();
    telegramService.sendMessage.mockResolvedValue({ success: true });
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.ICT_FVG_TRACKER_FILE;
  });

  test('yalnız kimlikli, teyitli 5dk kapanışından açar; zone entry kullanmaz ve dedup yapar', async () => {
    const s = signal();
    const first = await tracker.syncSignals([s]);
    expect(first.opened).toHaveLength(1);
    expect(first.opened[0]).toMatchObject({
      signalId: s.signalId,
      setupKey: s.setupKey,
      entry: 100,
      fillTimeSec: s.fillTimeSec,
      fillTf: '5m',
    });

    const duplicate = await tracker.syncSignals([s]);
    expect(duplicate.opened).toHaveLength(0);
    expect(duplicate.skipped[0].reason).toBe('duplicate');
    expect(await tracker.getOpen()).toHaveLength(1);

    const missingIdentity = await tracker.syncSignals([{ ...signal({ n: 'bad' }), signalId: '' }]);
    expect(missingIdentity.skipped[0].reason).toBe('missing-identity');
    const formingFill = await tracker.syncSignals([signal({ n: 'forming', fillBar: { time: 1_700_000_300, close: 100, closed: false, tf: '5m' } })]);
    expect(formingFill.skipped[0].reason).toBe('invalid-levels-or-fill');
  });

  test('yalnız fill sonrasındaki KAPALI 5dk mumları tarar; oluşan son mumu yok sayar', async () => {
    const t = 1_700_000_000;
    await tracker.syncSignals([signal({ fillTimeSec: t })]);
    forexKlines.fetchCandles.mockResolvedValue([
      bar(t, { low: 95, high: 105 }),       // fill mumu: geriye dönük hit sayılmaz
      bar(t + 300),
      bar(t + 600, { high: 105 }),          // newest/forming: sayılmaz
    ]);
    expect(await tracker.checkClosures()).toHaveLength(0);
    expect(await tracker.getOpen()).toHaveLength(1);

    forexKlines.fetchCandles.mockResolvedValue([
      bar(t),
      bar(t + 300),
      bar(t + 600, { high: 105 }),          // artık kapalı
      bar(t + 900),                          // oluşan son mum
    ]);
    const closures = await tracker.checkClosures();
    expect(closures).toHaveLength(1);
    expect(closures[0]).toMatchObject({ outcome: 'TP1', exit: 104, signalId: 'ICTFVG:XAUUSD:1' });
  });

  test('aynı kapalı mum SL ve TP1 gördüyse ihtiyatlı biçimde SL yazar', async () => {
    const t = 1_700_000_000;
    await tracker.syncSignals([signal({ fillTimeSec: t })]);
    forexKlines.fetchCandles.mockResolvedValue([
      bar(t),
      bar(t + 300, { low: 97, high: 105 }),
      bar(t + 600),
    ]);
    const closures = await tracker.checkClosures();
    expect(closures[0]).toMatchObject({ outcome: 'SL', exit: 98, rMultiple: -1 });
  });

  test('6 saat sonunda en son kapalı 5dk mumunun kapanışından EXPIRE eder', async () => {
    const t = 1_700_000_000;
    await tracker.syncSignals([signal({ fillTimeSec: t })]);
    forexKlines.fetchCandles.mockResolvedValue([
      bar(t),
      bar(t + tracker.EXPIRE_SEC, { close: 101.25, high: 101.5, low: 99 }),
      bar(t + tracker.EXPIRE_SEC + 300),
    ]);
    const closures = await tracker.checkClosures();
    expect(closures[0]).toMatchObject({
      outcome: 'EXPIRE',
      exit: 101.25,
      exitTimeSec: t + tracker.EXPIRE_SEC,
      setupKey: 'ICTFVG:XAUUSD:1',
      instrumentId: 'XAUUSD',
      tf: '5m',
      strategy: 'ict_fvg',
    });
  });

  test('ters sinyal eski pozisyonu kesin kimlikle FLIP kapatır, sonra yenisini açar', async () => {
    const t = 1_700_000_000;
    await tracker.syncSignals([signal({ fillTimeSec: t })]);
    const result = await tracker.syncSignals([signal({
      n: '2', direction: 'short', fillPrice: 95, fillTimeSec: t + 300,
      fillBar: { time: t + 300, close: 95, closed: true, tf: '5m' },
      stop: 97, target1: 91, target2: 89,
    })]);
    expect(result.closures).toHaveLength(1);
    expect(result.closures[0]).toMatchObject({
      outcome: 'FLIP',
      exit: 95,
      signalId: 'ICTFVG:XAUUSD:1',
      setupKey: 'ICTFVG:XAUUSD:1',
    });
    expect(result.opened[0]).toMatchObject({ direction: 'short', signalId: 'ICTFVG:XAUUSD:2' });
    expect(await tracker.getOpen()).toHaveLength(1);
  });

  test('disk durumu yeniden yüklenince açık pozisyon ve dedup kimlikleri korunur', async () => {
    const s = signal();
    await tracker.syncSignals([s]);
    await tracker.__reloadForTest();
    expect(await tracker.getOpen()).toHaveLength(1);
    const duplicate = await tracker.syncSignals([s]);
    expect(duplicate.skipped[0].reason).toBe('duplicate');
  });
});

describe('ICT/FVG Telegram notifier', () => {
  beforeEach(() => {
    delete process.env.ICT_FVG_PUSH_DISABLED;
    delete process.env.TELEGRAM_ICT_FVG_CHANNEL;
    tracker.__resetForTest();
    telegramService.sendMessage.mockReset();
    telegramService.sendMessage.mockResolvedValue({ success: true });
  });

  test('özel ICT kanalı fallback kanalından önceliklidir ve paper uyarısı taşır', async () => {
    process.env.TELEGRAM_ICT_FVG_CHANNEL = '@ict_fvg_channel';
    const result = await notifier.evaluateAndPush([signal()]);
    expect(result.opened).toHaveLength(1);
    expect(result.telegram).toBe(1);
    expect(telegramService.sendMessage).toHaveBeenCalledWith(
      '@ict_fvg_channel',
      expect.stringMatching(/ICT \/ FVG[\s\S]*Paper yarış kaydıdır; gerçek emir değildir/),
      'HTML',
    );
  });

  test('ICT_FVG_PUSH_DISABLED yalnız pushı kapatır; tracker yine pozisyon açar', async () => {
    process.env.ICT_FVG_PUSH_DISABLED = '1';
    const result = await notifier.evaluateAndPush([signal()]);
    expect(result.disabled).toBe(true);
    expect(result.opened).toHaveLength(1);
    expect(await tracker.getOpen()).toHaveLength(1);
    expect(telegramService.sendMessage).not.toHaveBeenCalled();
  });

  test('özel kanal yoksa mevcut signal-channel fallback kullanılır', async () => {
    await notifier.evaluateAndPush([signal()]);
    expect(telegramService.sendMessage).toHaveBeenCalledWith(
      '@fallback_channel', expect.any(String), 'HTML',
    );
  });
});
