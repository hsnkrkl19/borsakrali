/**
 * forexLearning — forex sinyal sisteminin öğrenen katmanı (enstrüman düzeyi).
 *
 * Kombo = enstrümanId (forex pozisyonları çok-TF birleşik olduğundan TF-düzeyi
 * atıf belirsiz; enstrüman-düzeyi dürüst ölçek). Kapanışlar (TP1/SL/TRAIL)
 * R-katsayısıyla akar (R = fiyat-hareketi / origStopDist — lot'tan bağımsız).
 *
 *   • DEVRE KESİCİ: son 15 kapanışta n>=10, toplam R <= -4, PF < 0.85 → GÖLGE:
 *     enstrümanın YENİ pozisyonları sanal izlenir (Telegram YOK, KÖPRÜ YOK).
 *   • GERİ AÇILMA: gölgede n>=8, +R, PF >= 1.05 → gerçeğe döner.
 *   • Risk çarpanı YOK: lot kararı köprüde (güven → 0.01-0.03); burada kenar
 *     kesme/açma yeterli.
 *
 * Kill: FOREX_LEARNING_DISABLED=1.
 * Kalıcılık: disk + Supabase 'bot-state/forex/learning.json' — devre-kesici
 * durumu deploy'lar arası YAŞAMALI (yalnız-disk kalsaydı her Render deploy'u
 * tüm kesicileri 'gerçek'e sıfırlardı; open-signals ile aynı desen).
 */

const fs = require('fs');
const path = require('path');
const { createLearning } = require('../learning/outcomeLearning');

let supa = null, supaEnabled = () => false;
try { const m = require('../../lib/supabase'); supa = m.supabaseAdmin; supaEnabled = m.isSupabaseEnabled; } catch (_) {}

const BUCKET = 'bot-state';
const SUPA_KEY = 'forex/learning.json';

// Varsayılan: open-signals dosyasıyla aynı dizin (testler FOREX_OPEN_FILE'ı
// tmp'e yönlendirince öğrenme durumu da otomatik oraya gider)
const baseDir = process.env.FOREX_OPEN_FILE
  ? path.dirname(process.env.FOREX_OPEN_FILE)
  : path.join(__dirname, '..', '..', 'data');
const FILE = process.env.FOREX_LEARNING_FILE || path.join(baseDir, 'forex-learning.json');

function mkPersistRemote(supaKey) {
  let saveTimer = null;
  return function persistRemote(state) {
    if (!(supaEnabled && supaEnabled())) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try { await supa.storage.from(BUCKET).upload(supaKey, Buffer.from(JSON.stringify(state), 'utf8'), { contentType: 'application/json', upsert: true }); } catch (_) {}
    }, 2500);
    if (saveTimer.unref) saveTimer.unref();
  };
}

const core = createLearning({
  name: 'forex',
  file: FILE,
  disabledEnv: 'FOREX_LEARNING_DISABLED',
  rules: {
    roll: 40,
    disableWindow: 15, disableMinN: 10, disableSumR: -4, disablePf: 0.85,
    enableMinN: 8, enablePf: 1.05,
    multEnabled: false,
  },
  persist: mkPersistRemote(SUPA_KEY),
});

// ── SİSTEM-GENELİ ('__ALL__') devre kesici — AYRI çekirdek, SİSTEM ölçekli kurallar ──
// 2026-07-06 olayı: 28 kapanışlık zarar gecesinde enstrüman-başına 4-6 kapanış
// per-enstrüman kesiciyi tetikleyemedi. Tek '__ALL__' anahtarı per-enstrüman
// kurallarla (15 pencere/10 minN/-4R) kullanılamaz: ~15 enstrümanlı evrende 15
// kapanış SAATLER içinde dolar, normal varyans (haber sıçramasında 8×-0.5R) bile
// tüm sistemi karartırdı (review). Eşikler felaket-serisi ölçeğinde: son 30
// kapanışta n≥20, toplam ≤ -12R, PF<0.75 → sistem gölgeye; gölgede 10 kapanış
// +R & PF≥1.05 → geri. Olay gecesi (~28 kapanış, ~-15..20R) tetiklerdi.
const GLOBAL_FILE = process.env.FOREX_LEARNING_GLOBAL_FILE || path.join(baseDir, 'forex-learning-global.json');
const SUPA_KEY_GLOBAL = 'forex/learning-global.json';
const globalCore = createLearning({
  name: 'forex-global',
  file: GLOBAL_FILE,
  disabledEnv: 'FOREX_LEARNING_DISABLED',
  rules: {
    roll: 60,
    disableWindow: 30, disableMinN: 20, disableSumR: -12, disablePf: 0.75,
    enableMinN: 10, enablePf: 1.05,
    multEnabled: false,
  },
  persist: mkPersistRemote(SUPA_KEY_GLOBAL),
});

// Boot restore (forexSignalTracker.load() çağırır, best-effort): Supabase'ten
// indir → diske yaz → çekirdeği diskten yeniden yükle. İndirme başarısızsa
// mevcut disk hali kullanılır (fail-safe).
let restored = false;
async function restoreOne(supaKey, file, target) {
  try {
    const { data } = await Promise.race([
      supa.storage.from(BUCKET).download(supaKey),
      new Promise((_, rej) => setTimeout(() => rej(new Error('supa-timeout')), 8000)),
    ]);
    if (!data) return;
    const text = typeof data.text === 'function' ? await data.text() : Buffer.from(await data.arrayBuffer()).toString('utf8');
    const p = JSON.parse(text);
    if (p && p.combos) {
      const dir = path.dirname(file);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(p, null, 2), 'utf8');
      target.reloadFromDisk();
    }
  } catch (_) {}
}
async function restore() {
  if (restored) return;
  restored = true;
  if (!(supaEnabled && supaEnabled())) return;
  await restoreOne(SUPA_KEY, FILE, core);
  await restoreOne(SUPA_KEY_GLOBAL, GLOBAL_FILE, globalCore);
}

module.exports = { ...core, restore, global: globalCore };
