'use strict';

/**
 * ⭐ GOLDEN — 2026-07-24: "hesap değiştirdim ... botların istatistiklerini sıfırla
 * ve yeni işlemlerle tekrar baştan başlasınlar. eskileri de unut gitsin."
 *
 * Çivilenen değişmezler:
 *   1) İstatistik/işlem geçmişi silinir, bot TANIMLARI korunur.
 *   2) İdempotent: aynı jetonla ikinci açılış hiçbir şey silmez.
 *   3) Supabase kapalıyken ÇALIŞMAZ (jeton saklanamayınca her açılışta silerdi).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stats-reset-'));
process.env.BOT_DATA_DIR = tempRoot;
process.env.NODE_ENV = 'test';

// Supabase sahtesi: bellek içi bucket.
const mockRemote = new Map();
jest.mock('../../src/lib/supabase', () => ({
  isSupabaseEnabled: () => global.__supaOn !== false,
  supabaseAdmin: {
    storage: {
      from: () => ({
        async download(key) {
          if (!mockRemote.has(key)) return { data: null, error: { message: 'yok' } };
          const text = mockRemote.get(key);
          return { data: { text: async () => text }, error: null };
        },
        async upload(key, body) { mockRemote.set(key, body.toString('utf8')); return { data: {}, error: null }; },
        async remove(keys) {
          const hit = keys.filter((k) => mockRemote.has(k));
          hit.forEach((k) => mockRemote.delete(k));
          return { data: hit.map((k) => ({ name: k })), error: null };
        },
      }),
    },
  },
}));

const statsReset = require('../../src/services/statsReset');

function write(rel, content = '{"x":1}') {
  const p = path.join(tempRoot, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  mockRemote.set(rel, content);
}
function exists(rel) { return fs.existsSync(path.join(tempRoot, rel)); }

beforeEach(() => {
  global.__supaOn = true;
  mockRemote.clear();
  fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.mkdirSync(tempRoot, { recursive: true });
  delete process.env.BOT_STATS_RESET;
});

afterAll(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
  delete process.env.BOT_DATA_DIR;
});

describe('statsReset — env jetonu olmadan hiçbir şey yapmaz', () => {
  test('BOT_STATS_RESET yoksa no-op', async () => {
    write('bot-competition/registry.json');
    const r = await statsReset.runIfRequested();
    expect(r.ran).toBe(false);
    expect(r.reason).toBe('env-yok');
    expect(exists('bot-competition/registry.json')).toBe(true);
  });
});

describe('statsReset — sıfırlama kapsamı', () => {
  test('⭐ istatistikler silinir, bot TANIMLARI korunur', async () => {
    // İstatistik / işlem geçmişi
    write('bot-competition/registry.json');           // yarış defteri
    write('real-results/deals.json');                 // gerçek MT5 sonuçları
    write('mt5-notify/notified.json');                // bildirim dedup'ı
    write('mt5-scanner/learning.json');               // öğrenme devre-kesici
    write('bot/trades.json');
    write('bot-builder/runner.json');                 // açık kâğıt pozisyonlar
    write('forex/open-signals.json');                 // ayrı şemalı depo
    write('forex-learning.json');                     // yerel tek dosya
    // TANIMLAR — korunmalı
    write('bot-builder/state.json');                  // custom bot tanımları + TF filtreleri
    write('custom-bots/registry.json');               // BIST custom bot tanımları

    process.env.BOT_STATS_RESET = '2026-07-24';
    const r = await statsReset.runIfRequested();
    expect(r.ran).toBe(true);

    // Yol adı yerelde ve Supabase'te AYNI olanlar → ikisi de gitmeli.
    for (const gone of [
      'bot-competition/registry.json', 'real-results/deals.json', 'mt5-notify/notified.json',
      'mt5-scanner/learning.json', 'bot/trades.json', 'bot-builder/runner.json',
      'forex/open-signals.json',
    ]) {
      expect({ f: gone, local: exists(gone), remote: mockRemote.has(gone) })
        .toEqual({ f: gone, local: false, remote: false });
    }
    // ⚠️ Bazı depoların yerel dosya adı ile Supabase anahtarı FARKLI:
    // yerel 'forex-learning.json' ↔ uzak 'forex/learning.json'. İkisi ayrı
    // listelerden (LOCAL_FILES / STANDALONE_KEYS) temizlenir.
    expect(exists('forex-learning.json')).toBe(false);
    expect(statsReset.STANDALONE_KEYS).toContain('forex/learning.json');
    for (const kept of ['bot-builder/state.json', 'custom-bots/registry.json']) {
      expect({ f: kept, local: exists(kept), remote: mockRemote.has(kept) })
        .toEqual({ f: kept, local: true, remote: true });
    }
  });

  test('custom bot portföyleri sıfırlanır (tanım defteri değil)', async () => {
    write('custom-abc123/portfolio.json');
    write('custom-abc123/trades.json');
    write('custom-bots/registry.json');

    process.env.BOT_STATS_RESET = 'r1';
    await statsReset.runIfRequested();

    expect(exists('custom-abc123/portfolio.json')).toBe(false);
    expect(exists('custom-abc123/trades.json')).toBe(false);
    expect(exists('custom-bots/registry.json')).toBe(true);
  });
});

describe('statsReset — idempotency ve emniyet', () => {
  test('⭐ aynı jetonla ikinci açılış HİÇBİR ŞEY silmez', async () => {
    write('bot-competition/registry.json');
    process.env.BOT_STATS_RESET = 'aynı';
    expect((await statsReset.runIfRequested()).ran).toBe(true);

    // Sıfırlamadan sonra bot yeni işlem yaptı:
    write('bot-competition/registry.json', '{"yeni":true}');
    const second = await statsReset.runIfRequested();
    expect(second.ran).toBe(false);
    expect(second.reason).toBe('zaten-yapildi');
    expect(exists('bot-competition/registry.json')).toBe(true);   // YENİ veri korundu
  });

  test('jeton DEĞİŞİRSE yeniden sıfırlar', async () => {
    process.env.BOT_STATS_RESET = 'ilk';
    await statsReset.runIfRequested();
    write('bot-competition/registry.json');
    process.env.BOT_STATS_RESET = 'ikinci';
    expect((await statsReset.runIfRequested()).ran).toBe(true);
    expect(exists('bot-competition/registry.json')).toBe(false);
  });

  test('⭐ Supabase kapalıyken ÇALIŞMAZ (her açılışta silme döngüsü koruması)', async () => {
    global.__supaOn = false;
    write('bot-competition/registry.json');
    process.env.BOT_STATS_RESET = 'x';
    const r = await statsReset.runIfRequested();
    expect(r.ran).toBe(false);
    expect(r.reason).toBe('supabase-kapali');
    expect(exists('bot-competition/registry.json')).toBe(true);
  });
});

describe('statsReset — anahtar listesi sözleşmesi', () => {
  test('tanım dosyaları silme listesinde OLMAMALI', () => {
    const keys = statsReset.allKeys();
    expect(keys).not.toContain('bot-builder/state.json');
    expect(keys).not.toContain('custom-bots/registry.json');
    expect(keys).not.toContain('bot-center/settings.json');
    // Yarış defteri ve gerçek sonuçlar listede OLMALI
    expect(keys).toContain('bot-competition/registry.json');
    expect(keys).toContain('real-results/deals.json');
    expect(keys).toContain('mt5-notify/notified.json');
  });
});
