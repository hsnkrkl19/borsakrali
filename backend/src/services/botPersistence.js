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
const SUBDIRS = ['bot', 'crypto-bot'];
const FILES = ['portfolio.json', 'positions.json', 'trades.json', 'signal-log.json'];
const DEBOUNCE_MS = 2500;

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
  try {
    await ensureBucket();
    for (const subdir of SUBDIRS) {
      for (const filename of FILES) {
        const key = keyOf(subdir, filename);
        try {
          const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(key);
          if (error || !data) { missing++; continue; }
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
  if (!SUBDIRS.includes(subdir) || !FILES.includes(filename)) return;
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

module.exports = { loadAll, save, flush, flushAll, ensureBucket, BUCKET, SUBDIRS, FILES };
