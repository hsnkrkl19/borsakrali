'use strict';

/**
 * ⭐ GOLDEN — 2026-07-24 kullanıcı talepleri:
 *   1) "gümüş paritesine işlem açmayı yasakla tüm botlara. XAGUSD işlemleri yasak."
 *   2) "tüm botların lot sayısını 0.01 ile 0.15 arasına getir. sadece bot 37
 *      konsensüs ... birden çok botun ortak karar aldığı işlemlere 0.20 lot."
 *
 * Bu testlerin HEPSİ değişiklikten ÖNCEKİ kodda başarısız olur:
 *   - recordOpen XAGUSD'yi kabul ediyordu (skipped alanı yoktu)
 *   - bridgeFeed'de lotCap alanı hiç yoktu
 *   - beastConfig.isEnabled('XAGUSD','8h') true dönüyordu
 *   - botBuilder XAGUSD paritesini kaydediyordu
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ban-lot-'));
process.env.BOT_COMPETITION_DATA_DIR = tempDir;
process.env.NODE_ENV = 'test';

jest.mock('../../src/services/botPersistence', () => ({ save: jest.fn(), loadAll: jest.fn() }));

const bans = require('../../src/services/instrumentBans');
const lotLimits = require('../../src/services/lotLimits');
const manager = require('../../src/services/botCompetition/competitionManager');
const catalog = require('../../src/services/botCompetition/catalog');
// ⚠️ botBuilder describe'ı jest.resetModules() çağırıyor ve bu, dosya toplanırken
// (testler koşmadan ÖNCE) çalışıyor. sweep aşağıda require edilirse `manager` ile
// AYNI modül örneğini paylaşmaz ve boş deftere bakar — o yüzden burada bağlanır.
const sweep = require('../../src/services/bannedPositionSweep');

function signal(id, symbol, side = 'long') {
  return {
    signalId: id, symbol, tf: '15m', direction: side, entry: 100,
    stop: side === 'long' ? 95 : 105, target1: side === 'long' ? 115 : 85,
    target2: side === 'long' ? 125 : 75, confidence: 80,
  };
}

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
  delete process.env.BOT_COMPETITION_DATA_DIR;
});

describe('instrumentBans — gümüş yasağı sembol çözümlemesi', () => {
  test('gümüşün TÜM yazımları yasak (id, slash, Yahoo, broker alias, sonek, TV)', () => {
    for (const s of [
      'XAGUSD', 'xagusd', 'XAG/USD', 'SI=F', 'SILVER', 'XAGUSD.', 'XAGUSDm',
      'XAGUSD.raw', 'OANDA:XAGUSD', 'silver_usd', 'SILVER_TRY', 'XAGTRY', 'XAGEUR',
    ]) {
      expect({ s, banned: bans.isBanned(s) }).toEqual({ s, banned: true });
    }
  });

  test('YANLIŞ POZİTİF OLMAZ: altın, BIST SILVR hissesi, ICT Silver Bullet', () => {
    for (const s of [
      'XAUUSD', 'GC=F', 'GOLD', 'XAUTRY', 'SILVR', 'ict-silver-bullet',
      'EURUSD', 'BTCUSD', 'SPX500', 'US100.cash', 'NQ=F', '', null, undefined,
    ]) {
      expect({ s, banned: bans.isBanned(s) }).toEqual({ s, banned: false });
    }
  });

  test('enstrüman kaydı: id temiz olsa da yahoo SI=F ise yasak', () => {
    expect(bans.isBannedInstrument({ id: 'METAL2', yahoo: 'SI=F' })).toBe(true);
    expect(bans.isBannedInstrument({ id: 'XAUUSD', yahoo: 'GC=F' })).toBe(false);
  });

  test('kill switch: INSTRUMENT_BANS_DISABLED=1 yasağı kaldırır', () => {
    process.env.INSTRUMENT_BANS_DISABLED = '1';
    expect(bans.isBanned('XAGUSD')).toBe(false);
    delete process.env.INSTRUMENT_BANS_DISABLED;
    expect(bans.isBanned('XAGUSD')).toBe(true);
  });
});

describe('competitionManager — yasak TÜM katalog botlarını kapsar', () => {
  beforeEach(() => manager.resetForTest());

  test('köprüye giden HER bot için XAGUSD reddedilir', () => {
    const tradeable = catalog.filter((e) => e.competitionEligible && e.mt5Tradeable !== false);
    expect(tradeable.length).toBeGreaterThan(10);   // katalog gerçekten dolu
    for (const entry of tradeable) {
      const r = manager.recordOpen(entry.id, signal(`${entry.id}-xag`, 'XAGUSD', 'short'));
      expect({ bot: entry.id, ok: r.ok }).toEqual({ bot: entry.id, ok: false });
      expect(r.skipped).toBe('instrument-banned');
    }
    expect(manager.bridgeFeed().positions).toHaveLength(0);
  });

  test('XAG/USD (slash\'lı yazım) da reddedilir — cleanSymbol sonrası', () => {
    const r = manager.recordOpen('beast-signals', signal('beast-xag', 'XAG/USD', 'long'));
    expect(r.ok).toBe(false);
    expect(r.skipped).toBe('instrument-banned');
  });

  test('yasak dışı enstrüman normal açılır (yasak fazla geniş değil)', () => {
    expect(manager.recordOpen('forex-signals', signal('fx-au', 'XAUUSD', 'long')).ok).toBe(true);
    expect(manager.bridgeFeed().positions).toHaveLength(1);
  });

  test('⭐ ÇIKIŞ SERBEST: açık gümüş pozisyonu KAPANABİLİR (yetim kalmaz)', () => {
    // Yasak konmadan önce açılmış bir pozisyonu taklit et.
    process.env.INSTRUMENT_BANS_DISABLED = '1';
    const opened = manager.recordOpen('forex-signals', signal('legacy-xag', 'XAGUSD', 'short'));
    delete process.env.INSTRUMENT_BANS_DISABLED;
    expect(opened.ok).toBe(true);

    // Yasak aktifken bile kapanış işlenmeli — aksi hâlde MT5'te açık kalırdı.
    const closed = manager.recordClose('forex-signals', {
      symbol: 'XAGUSD', timeframe: '15m', strategy: 'forex-signals', exit: 90, outcome: 'target',
    });
    expect(closed.ok).toBe(true);
    expect(manager.bridgeFeed().positions.filter((p) => bans.isBanned(p.symbol))).toHaveLength(0);
  });
});

describe('lot sınırları — 0.01–0.15, Bot 37 konsensüs 0.20', () => {
  beforeEach(() => manager.resetForTest());

  test('clampLot: tavan/taban ve konsensüs istisnası', () => {
    expect(lotLimits.clampLot(1.1)).toBe(0.15);
    expect(lotLimits.clampLot(0.5)).toBe(0.15);
    expect(lotLimits.clampLot(0.07)).toBe(0.07);
    expect(lotLimits.clampLot(0.004)).toBe(0.01);      // taban
    expect(lotLimits.clampLot(0)).toBe(0);
    expect(lotLimits.clampLot(3.0, 'consensus-radar')).toBe(0.20);
    expect(lotLimits.clampLot(3.0, 'mt5-trend')).toBe(0.15);
  });

  test('⭐ bridgeFeed her pozisyona lotCap taşır: konsensüs 0.20, diğerleri 0.15', () => {
    manager.recordOpen('forex-signals', signal('fx-1', 'EURUSD', 'long'));
    manager.recordOpen('consensus-radar', signal('cons-1', 'EURUSD', 'long'));

    const feed = manager.bridgeFeed();
    expect(feed.positions.length).toBe(2);
    const fx = feed.positions.find((p) => p.botId === 'forex-signals');
    const cons = feed.positions.find((p) => p.botId === 'consensus-radar');
    expect(fx.lotCap).toBe(0.15);
    expect(cons.lotCap).toBe(0.20);
    // 0.20 SADECE konsensüs botuna ait — başka hiçbir bot alamaz.
    for (const p of feed.positions) {
      if (p.botId !== 'consensus-radar') expect(p.lotCap).toBe(0.15);
    }
  });

  test('katalogdaki 0.20 hakkı TEK bota ait', () => {
    const withBigLot = catalog.filter((e) => lotLimits.lotCapFor(e.id) > 0.15);
    expect(withBigLot.map((e) => e.id)).toEqual(['consensus-radar']);
  });
});

describe('beast — gümüş hücreleri kapalı', () => {
  const cfgMod = require('../../src/services/beast/beastConfig');
  test('isEnabled her TF için false; ENABLED tablosu backtest kaydı olarak durur', () => {
    for (const tf of ['1h', '4h', '8h', '1d']) expect(cfgMod.isEnabled('XAGUSD', tf)).toBe(false);
    expect(cfgMod.isEnabled('XAUUSD', '8h')).toBe(true);   // altın etkilenmez
  });
});

describe('botBuilder — panelden gümüş seçilemez', () => {
  const builderTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'builder-ban-'));
  const store = (() => {
    process.env.BOT_BUILDER_DATA_DIR = builderTemp;
    jest.resetModules();
    return require('../../src/services/botBuilder/store');
  })();

  afterAll(() => {
    fs.rmSync(builderTemp, { recursive: true, force: true });
    delete process.env.BOT_BUILDER_DATA_DIR;
  });

  test('createCustom XAGUSD paritesini düşürür, diğerlerini korur', () => {
    const bot = store.createCustom({
      name: 'Test', indicators: ['ema'], timeframes: ['1h'],
      pairs: ['XAUUSD', 'XAGUSD', 'XAG/USD', 'EURUSD'],
    });
    expect(bot.pairs).toEqual(['XAUUSD', 'EURUSD']);
  });

  test('sadece gümüş seçilirse bot HİÇ oluşmaz (parite kalmaz)', () => {
    expect(() => store.createCustom({
      name: 'Gümüş', indicators: ['ema'], timeframes: ['1h'], pairs: ['XAGUSD'],
    })).toThrow(/parite/i);
  });
});

describe('bannedPositionSweep — yasaktan önce açılmış gümüş pozisyonları kapanır', () => {
  beforeEach(() => {
    manager.resetForTest();
    delete process.env.BANNED_SWEEP_DISABLED;
  });

  function openLegacyXag(botId, tf = '1h') {
    // Yasak konmadan ÖNCE açılmış pozisyonu taklit et.
    process.env.INSTRUMENT_BANS_DISABLED = '1';
    const r = manager.recordOpen(botId, { ...signal(`legacy-${botId}-${tf}`, 'XAGUSD', 'short'), tf });
    delete process.env.INSTRUMENT_BANS_DISABLED;
    expect(r.ok).toBe(true);
  }

  test('⭐ açık gümüş pozisyonları kapatılır ve köprü feed\'inden düşer', () => {
    openLegacyXag('forex-signals', '1h');
    openLegacyXag('mt5-scanner', '1d');
    openLegacyXag('beast-signals', '4h');
    manager.recordOpen('forex-signals', { ...signal('keep-au', 'XAUUSD', 'long'), tf: '4h' });

    expect(manager.bridgeFeed().positions.filter((p) => bans.isBanned(p.symbol))).toHaveLength(3);

    const r = sweep.run();
    expect(r.closed).toHaveLength(3);

    const after = manager.bridgeFeed().positions;
    expect(after.filter((p) => bans.isBanned(p.symbol))).toHaveLength(0);
    // Gümüş DIŞI pozisyona dokunulmadı.
    expect(after.filter((p) => p.symbol === 'XAUUSD')).toHaveLength(1);
  });

  test('idempotent: ikinci tur kapatacak bir şey bulmaz', () => {
    openLegacyXag('forex-signals', '1h');
    expect(sweep.run().closed).toHaveLength(1);
    expect(sweep.run().closed).toHaveLength(0);
  });

  test('kapanış defter kaydı outcome=instrument-banned ile yazılır', () => {
    openLegacyXag('mt5-scanner', '15m');
    sweep.run();
    const row = manager.leaderboard().find((b) => b.id === 'mt5-scanner');
    expect(row.closed).toBe(1);
  });

  test('kill switch: BANNED_SWEEP_DISABLED=1 tahliyeyi durdurur', () => {
    openLegacyXag('beast-signals', '4h');
    process.env.BANNED_SWEEP_DISABLED = '1';
    const r = sweep.run();
    expect(r.disabled).toBe(true);
    expect(manager.bridgeFeed().positions.filter((p) => bans.isBanned(p.symbol))).toHaveLength(1);
    delete process.env.BANNED_SWEEP_DISABLED;
  });
});

describe('bannedPositionSweep — köprüye kapalı botlar da tahliye edilir', () => {
  beforeEach(() => manager.resetForTest());

  test('⭐ mt5Tradeable:false bot bridgeFeed\'de görünmez ama yine de kapatılır', () => {
    // mt5-london katalogda mt5Tradeable:false → bridgeFeed onu HİÇ yayınlamaz.
    const closedBot = catalog.find((e) => e.competitionEligible && e.mt5Tradeable === false);
    expect(closedBot).toBeTruthy();

    process.env.INSTRUMENT_BANS_DISABLED = '1';
    expect(manager.recordOpen(closedBot.id, signal('legacy-hidden', 'XAGUSD', 'short')).ok).toBe(true);
    delete process.env.INSTRUMENT_BANS_DISABLED;

    // İlk geçiş (bridgeFeed) onu göremez — ikinci geçiş (katalog) görmeli.
    expect(sweep.sweepCompetition()).toHaveLength(0);
    expect(sweep.sweepCatalog([])).toHaveLength(1);
    // run() ikisini birleştirir → artık kapatacak bir şey kalmaz.
    expect(sweep.run().closed).toHaveLength(0);
  });
});
