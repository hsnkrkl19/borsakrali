/**
 * Bot Persistence — sanal portföyleri Supabase Storage'da kalıcı tutar
 *
 * Sorun: Render ephemeral disk → her deploy/restart'ta bot verisi (data/bot,
 * data/crypto-bot) sıfırlanıyordu. Çözüm: aynı JSON dosyaları Supabase Storage
 * bucket'ında ('bot-state') yedeklenir.
 *
 * Tasarım (senkron store API'sini bozmadan):
 *   - Başlangıçta `loadAll()` → Supabase'ten yerel JSON dosyalarına geri yükler
 *     (cron'lar/istekler okumadan ÖNCE çağrılır).
 *   - Her `writeJSON` → `save()` ile debounce'lu write-through (tick içindeki
 *     çok sayıda yazım tek upload'a toplanır).
 *
 * Supabase kapalıysa (yerel geliştirme, env yok) sessizce yalnız-yerel çalışır.
 * Tablo/DDL gerektirmez — Storage bucket programatik oluşturulur.
 */

const fs = require('fs');
const path = require('path');
const { supabaseAdmin, isSupabaseEnabled } = require('../lib/supabase');

const BUCKET = 'bot-state';
const DATA_ROOT = process.env.BOT_DATA_DIR || path.join(__dirname, '..', 'data');
// Sabit botlar + kullanıcı-tanımlı botların kayıt defteri ('custom-bots/registry.json').
// Kullanıcı botlarının portföyleri ise dinamik 'custom-<id>' alt-dizinlerinde yaşar
// (loadAll, registry.json'ı okuyup bunları runtime'da keşfeder).
const SUBDIRS = ['bot', 'crypto-bot', 'tema34-bot', 'custom-bots', 'crossover-alerts', 'tema34-scanner', 'bist-al-scanner', 'pro-signals', 'altin', 'mt5-scanner', 'news-warning', 'bot-center', 'bot-competition', 'ict-fvg', 'bot-builder', 'bist-al-portfolio', 'bist-portfolio', 'real-results'];
// signal-log.json → BIST/kripto botları; runs.json → TEMA34 botu + EMA34/TEMA34
// kırılım bildirimcisi (state); registry.json → custom bot tanım defteri;
// learning.json → mt5-scanner öğrenme katmanı (kombo istatistik + mod kararları).
// Liste tüm alt-dizinlere uygulanır; olmayan dosyalar loadAll'da sessizce atlanır.
const FILES = ['portfolio.json', 'positions.json', 'trades.json', 'signal-log.json', 'runs.json', 'registry.json', 'learning.json', 'backtest.json'];
const DEBOUNCE_MS = 2500;

// Bir custom bot portföy alt-dizini mi? ('custom-<id>', registry'nin 'custom-bots'u hariç)
function isCustomSubdir(subdir) { return /^custom-[a-z0-9]+$/i.test(subdir) && subdir !== 'custom-bots'; }
function isAllowedSubdir(subdir) { return SUBDIRS.includes(subdir) || isCustomSubdir(subdir); }

let bucketReady = false;
const pending = new Map(); // storageKey -> { data, timer }

function keyOf(subdir, filename) { return `${subdir}/${filename}`; }

async function ensureBucket() {
  if (!isSupabaseEnabled()) return false;
  if (bucketReady) return true;
  try {
    const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
    if (error) throw error;
    if (!buckets?.some(b => b.name === BUCKET)) {
      const { error: createErr } = await supabaseAdmin.storage.createBucket(BUCKET, { public: false });
      if (createErr && !/exist/i.test(createErr.message || '')) throw createErr;
    }
    bucketReady = true;
  } catch (e) {
    console.error('[BotPersistence] bucket hazırlanamadı:', e.message);
  }
  return bucketReady;
}

/**
 * Başlangıç: Supabase'teki kalıcı durumu yerel JSON dosyalarına geri yazar.
 * Asla throw etmez — hata olsa bile sunucu yerel/temiz veriyle açılır.
 */
async function loadAll() {
  if (!isSupabaseEnabled()) {
    console.log('[BotPersistence] Supabase kapalı — yalnız yerel JSON ile çalışılıyor');
    return { enabled: false, restored: 0 };
  }
  let restored = 0, missing = 0;
  // Tek bir (subdir, filename)'i Supabase'ten yerel dosyaya geri yazar.
  async function restoreOne(subdir, filename) {
    const key = keyOf(subdir, filename);
    try {
      const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(key);
      if (error || !data) { missing++; return; }
      const text = typeof data.text === 'function'
        ? await data.text()
        : Buffer.from(await data.arrayBuffer()).toString('utf8');
      JSON.parse(text); // bozuksa atla
      const dir = path.join(DATA_ROOT, subdir);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, filename), text, 'utf8');
      restored++;
    } catch (_) {
      missing++;
    }
  }
  try {
    await ensureBucket();
    for (const subdir of SUBDIRS) {
      for (const filename of FILES) await restoreOne(subdir, filename);
    }
    // Custom bot portföylerini keşfet: az önce geri yüklenen registry.json'ı oku,
    // her bot için 'custom-<id>' alt-dizinini geri yükle (cron'lar okumadan önce).
    try {
      const regPath = path.join(DATA_ROOT, 'custom-bots', 'registry.json');
      if (fs.existsSync(regPath)) {
        const bots = JSON.parse(fs.readFileSync(regPath, 'utf8'));
        if (Array.isArray(bots)) {
          for (const b of bots) {
            if (!b || !b.id) continue;
            for (const filename of FILES) await restoreOne(`custom-${b.id}`, filename);
          }
        }
      }
    } catch (e) {
      console.error('[BotPersistence] custom bot geri yükleme hatası:', e.message);
    }
    console.log(`[BotPersistence] Supabase'ten geri yüklendi: ${restored} dosya (${missing} yok/atlandı)`);
  } catch (e) {
    console.error('[BotPersistence] loadAll hatası:', e.message);
  }
  return { enabled: true, restored };
}

/**
 * Write-through (debounce'lu). createPositionStore.writeJSON'dan çağrılır.
 * Aynı dosyaya ardışık yazımlar tek upload'a toplanır.
 */
function save(subdir, filename, dataObj) {
  if (!isSupabaseEnabled()) return;
  if (!isAllowedSubdir(subdir) || !FILES.includes(filename)) return;
  const key = keyOf(subdir, filename);
  const existing = pending.get(key);
  if (existing?.timer) clearTimeout(existing.timer);
  const timer = setTimeout(() => { flush(key); }, DEBOUNCE_MS);
  if (timer.unref) timer.unref();
  pending.set(key, { data: dataObj, timer });
}

async function flush(key) {
  const entry = pending.get(key);
  if (!entry) return;
  pending.delete(key);
  try {
    if (!(await ensureBucket())) return;
    const body = Buffer.from(JSON.stringify(entry.data, null, 2), 'utf8');
    const { error } = await supabaseAdmin.storage.from(BUCKET).upload(key, body, {
      contentType: 'application/json',
      upsert: true,
    });
    if (error) throw error;
  } catch (e) {
    console.error(`[BotPersistence] kaydetme hatası (${key}):`, e.message);
  }
}

async function flushAll() {
  for (const key of [...pending.keys()]) {
    const e = pending.get(key);
    if (e?.timer) clearTimeout(e.timer);
    await flush(key);
  }
}

/**
 * Bir alt-dizinin tüm yedek dosyalarını Supabase'ten siler. Custom bot
 * silinince çağrılır (orphan bucket nesnesi bırakmaz). Supabase kapalıysa no-op.
 */
async function remove(subdir) {
  // Bekleyen yazımları iptal et (silinen botu tekrar yazma)
  for (const filename of FILES) {
    const key = keyOf(subdir, filename);
    const e = pending.get(key);
    if (e?.timer) clearTimeout(e.timer);
    pending.delete(key);
  }
  if (!isSupabaseEnabled()) return;
  try {
    if (!(await ensureBucket())) return;
    const keys = FILES.map(f => keyOf(subdir, f));
    await supabaseAdmin.storage.from(BUCKET).remove(keys);
  } catch (e) {
    console.error(`[BotPersistence] silme hatası (${subdir}):`, e.message);
  }
}

module.exports = { loadAll, save, flush, flushAll, remove, ensureBucket, BUCKET, SUBDIRS, FILES };
