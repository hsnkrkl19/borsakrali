const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-competition-'));
process.env.BOT_COMPETITION_DATA_DIR = tempDir;

jest.mock('../../src/services/botPersistence', () => ({ save: jest.fn() }));

const manager = require('../../src/services/botCompetition/competitionManager');

function signal(id, symbol = 'EURUSD', side = 'long') {
  return {
    signalId: id,
    symbol,
    tf: '15m',
    direction: side,
    entry: 100,
    stop: side === 'long' ? 99 : 101,
    target1: side === 'long' ? 102 : 98,
    confidence: 75,
  };
}

describe('Telegram bot yarışı — izole paper yürütme', () => {
  beforeEach(() => {
    delete process.env.CRON_DISABLED;
    delete process.env.FOREX_ONLY_MODE;
    delete process.env.MT5_SCANNER_DISABLED;
    manager.resetForTest();
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.BOT_COMPETITION_DATA_DIR;
  });

  test('14 strateji yarışır; haber ve rapor işlem açamaz', () => {
    const status = manager.status();
    expect(status.summary.competitors).toBe(14);
    expect(status.bots.some((row) => row.id === 'ict-fvg')).toBe(true);
    expect(status.support.map((row) => row.id).sort()).toEqual(['account-report', 'news-warning']);
    expect(() => manager.recordOpen('news-warning', signal('bad'))).toThrow(/işlem stratejisi değildir/i);
    expect(JSON.stringify(status)).not.toMatch(/TOKEN|CHAT_ID|TELEGRAM_BOT_TOKEN/);
  });

  test('bot hesapları izoledir ve aynı sinyal idempotenttir', () => {
    expect(manager.recordOpen('forex-signals', signal('fx-1')).ok).toBe(true);
    expect(manager.recordOpen('forex-signals', signal('fx-1')).skipped).toBe('duplicate');
    expect(manager.recordOpen('pro-robot', signal('pro-1')).ok).toBe(true);

    const closed = manager.recordClose('forex-signals', {
      signalId: 'fx-1', symbol: 'EURUSD', tf: '15m', exit: 102, outcome: 'TP1',
    });
    expect(closed.ok).toBe(true);

    const status = manager.status();
    const fx = status.bots.find((row) => row.id === 'forex-signals');
    const pro = status.bots.find((row) => row.id === 'pro-robot');
    expect(fx.closed).toBe(1);
    expect(fx.open).toBe(0);
    expect(fx.net_r).toBeGreaterThan(1.9);
    expect(pro.open).toBe(1);
    expect(pro.closed).toBe(0);
  });

  test('snapshot fiyatı SL/TP kapanışını yapar ve tekrar pozisyon açmaz', () => {
    manager.observeSnapshot('mt5-scanner', {
      signals: [signal('mt5-1', 'XAUUSD')],
      instruments: [{ id: 'XAUUSD', livePrice: 100 }],
    });
    const result = manager.observeSnapshot('mt5-scanner', {
      signals: [signal('mt5-1', 'XAUUSD')],
      instruments: [{ id: 'XAUUSD', livePrice: 102.1 }],
    });

    const row = manager.status().bots.find((bot) => bot.id === 'mt5-scanner');
    expect(result.ok).toBe(true);
    expect(row.open).toBe(0);
    expect(row.closed).toBe(1);
    expect(row.sample_stage).toBe('collecting');
  });

  test('kaynak id/zaman vermese bile aynı kapanmış snapshot yeniden açılmaz', () => {
    const raw = { symbol: 'BTCUSDT', direction: 'long', entry: 100, stop: 97, target1: 106 };
    expect(manager.observeSnapshot('crypto-signals', { signals: [raw] }).opened).toBe(1);
    expect(manager.recordClose('crypto-signals', { symbol: 'BTCUSDT', exit: 106 }).ok).toBe(true);
    expect(manager.observeSnapshot('crypto-signals', { signals: [raw] }).opened).toBe(0);
    const row = manager.status().bots.find((bot) => bot.id === 'crypto-signals');
    expect(row.open).toBe(0);
    expect(row.closed).toBe(1);
  });

  test('TEMA34 4s ve günlük pozisyonları birbirinden bağımsız izler', () => {
    manager.observeSnapshot('tema34', {
      '4h': { candleDate: '2026-07-16T12:00:00Z', up: [{ symbol: 'ASELS', close: 100 }], down: [] },
      '1d': { candleDate: '2026-07-16', up: [{ symbol: 'ASELS', close: 100 }], down: [] },
    });
    expect(manager.status().bots.find((bot) => bot.id === 'tema34').open).toBe(2);

    manager.observeSnapshot('tema34', {
      '4h': { candleDate: '2026-07-16T16:00:00Z', up: [], down: [{ symbol: 'ASELS', close: 99 }] },
      '1d': { candleDate: '2026-07-16', up: [], down: [] },
    });
    const row = manager.status().bots.find((bot) => bot.id === 'tema34');
    expect(row.open).toBe(1);
    expect(row.closed).toBe(1);
  });

  test('ana yarış ve tek bot ayrı ayrı duraklatılabilir', () => {
    expect(manager.runtimeEnabled('forex-signals')).toBe(true);
    manager.setBotEnabled('forex-signals', false, 'admin');
    expect(manager.runtimeEnabled('forex-signals')).toBe(false);
    expect(manager.recordOpen('forex-signals', signal('paused')).skipped).toBe('competition-disabled');
    manager.setBotEnabled('forex-signals', true, 'admin');
    process.env.MT5_SCANNER_DISABLED = '1';
    expect(manager.runtimeEnabled('mt5-scanner')).toBe(false);
    delete process.env.MT5_SCANNER_DISABLED;
    manager.setMasterEnabled(false, 'admin');
    expect(manager.runtimeEnabled('pro-robot')).toBe(false);
    expect(manager.recordOpen('forex-signals', signal('master-paused')).skipped).toBe('competition-disabled');
    expect(manager.status().blockers.some((row) => row.code === 'competition-paused')).toBe(true);
  });

  test('negatif örnek risk azaltır ama 0.5–1.0 güvenlik bandını aşamaz', () => {
    for (let i = 0; i < 20; i++) {
      manager.recordOpen('forex-signals', signal(`loss-${i}`));
      manager.recordClose('forex-signals', {
        signalId: `loss-${i}`, symbol: 'EURUSD', tf: '15m', exit: 99, outcome: 'SL',
      });
    }
    const row = manager.status().bots.find((bot) => bot.id === 'forex-signals');
    expect(row.closed).toBe(20);
    expect(row.sample_stage).toBe('provisional');
    expect(row.risk_multiplier).toBeGreaterThanOrEqual(0.5);
    expect(row.risk_multiplier).toBeLessThan(1);
  });

  test('gün-bazlı lider tablosu + tutarlılık + şampiyon tespiti', () => {
    // İki gün boyunca hep kazanan bir bot: yüksek tutarlılık + şampiyon adayı.
    const days = ['2026-07-14', '2026-07-15', '2026-07-16'];
    let n = 0;
    for (const day of days) {
      for (let i = 0; i < 6; i++) {
        const id = `w-${day}-${i}`;
        manager.recordOpen('forex-signals', signal(id));
        manager.recordClose('forex-signals', {
          signalId: id, symbol: 'EURUSD', tf: '15m', exit: 102, outcome: 'TP1',
          closedAt: `${day}T1${i}:00:00Z`,
        });
        n++;
      }
    }
    const status = manager.status();
    const fx = status.bots.find((row) => row.id === 'forex-signals');
    expect(fx.closed).toBe(n);
    expect(fx.trading_days).toBe(3);
    expect(fx.positive_days).toBe(3);
    expect(fx.positive_day_rate).toBe(100);
    expect(fx.consistency_score).toBeGreaterThan(0);
    // Gün-bazlı tablo bu botu içerir ve şampiyon o olur.
    expect(status.day_leaderboard[0].id).toBe('forex-signals');
    expect(status.champion).not.toBeNull();
    expect(status.champion.id).toBe('forex-signals');
    expect(fx.is_champion).toBe(true);
    // Hiç kapanışı olmayan bot şampiyon olamaz / gün tablosuna girmez.
    expect(status.day_leaderboard.every((row) => row.trading_days > 0)).toBe(true);
  });

  test('yeterli örnek yokken şampiyon seçilmez', () => {
    manager.recordOpen('forex-signals', signal('one'));
    manager.recordClose('forex-signals', {
      signalId: 'one', symbol: 'EURUSD', tf: '15m', exit: 102, outcome: 'TP1',
      closedAt: '2026-07-16T10:00:00Z',
    });
    expect(manager.status().champion).toBeNull();
  });

  test('yarış katmanı yalnız paper kapsamındadır ve canlı emir bağımlılığı taşımaz', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../src/services/botCompetition/competitionManager.js'),
      'utf8',
    );
    expect(manager.status().execution_scope).toBe('paper_competition_only');
    expect(source).not.toMatch(/botClient|trade\/open|core\/trader|MetaTrader5/);
  });
});
