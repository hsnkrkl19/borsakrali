/**
 * bistPortfolio/backtestStore — backtest raporunu KALICI tut.
 *
 * Neden: rapor yalnız bellekte tutulunca Render (free tier) boşta uykuya dalıp
 * soğuk başladığında kayboluyor → portföy sayfasındaki "geçmiş kanıt" paneli boş
 * kalıyordu. Disk + Supabase ('bist-al-portfolio/backtest.json', botPersistence
 * FILES beyaz-listesinde) → yeniden başlatmada geri yüklenir.
 */

const fs = require('fs');
const path = require('path');
const botPersistence = require('../botPersistence');

const DATA_ROOT = process.env.BOT_DATA_DIR || path.join(__dirname, '..', '..', 'data');
const SUBDIR = 'bist-al-portfolio';
const FILENAME = 'backtest.json';
const FILE = path.join(DATA_ROOT, SUBDIR, FILENAME);

function save(report) {
  const payload = { at: new Date().toISOString(), report };
  try {
    const dir = path.dirname(FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(payload, null, 2), 'utf8');
  } catch (_) {}
  try { botPersistence.save(SUBDIR, FILENAME, payload); } catch (_) {}
  return payload;
}

function load() {
  try {
    if (fs.existsSync(FILE)) {
      const p = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      if (p && p.report) return p;
    }
  } catch (_) {}
  return null;
}

module.exports = { save, load, FILE, SUBDIR, FILENAME };
