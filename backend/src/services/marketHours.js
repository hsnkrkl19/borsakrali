/**
 * Market Hours — BIST manuel-işlem penceresi koruması
 *
 * Kullanıcı botlardaki işlemlere "müdahale" edebilir (elle pozisyon açma/kapatma).
 * Bu müdahaleler GERÇEK borsa işlem saatlerine uymalı:
 *   - İşlem 10:15'ten ÖNCE AÇILAMAZ  (seans açılış müzayedesi yeni bitmiş olur)
 *   - İşlem 18:00'den SONRA KAPATILAMAZ (seans kapanır)
 * Yani elle açma/kapatma yalnızca 10:15–18:00 (TR), hafta içi, resmi tatil
 * olmayan günlerde mümkündür.
 *
 * Not: cronJobs.js'teki `isBistOpen()` SİNYAL ÜRETİMİ için 09:45–18:30 penceresini
 * kullanır — bu farklı bir amaç. Burada kullanıcının istediği KESİN müdahale
 * penceresi (10:15–18:00) yaşar; ikisi bilinçli olarak ayrıdır.
 *
 * Tatil listesi cronJobs.js ile aynı tutulmalıdır (TR resmi tatilleri yılda bir
 * güncellenir). Saf/yan-etkisiz fonksiyonlar → golden test'lenebilir.
 */

// BIST'in kapalı olduğu 2026 resmi tatil günleri (cronJobs.TR_HOLIDAYS_2026 ile eş).
const TR_HOLIDAYS = new Set([
  '2026-01-01',
  '2026-03-20', '2026-03-21', '2026-03-22',
  '2026-04-23',
  '2026-05-01',
  '2026-05-19',
  '2026-05-26', '2026-05-27', '2026-05-28', '2026-05-29',
  '2026-07-15',
  '2026-08-30',
  '2026-10-28', '2026-10-29',
]);

// Manuel işlem penceresi (TR saatiyle, gün-içi dakika).
const OPEN_MIN = 10 * 60 + 15;  // 10:15 → 615  (bundan önce AÇILAMAZ)
const CLOSE_MIN = 18 * 60;      // 18:00 → 1080 (bundan sonra KAPATILAMAZ)
const OPEN_LABEL = '10:15';
const CLOSE_LABEL = '18:00';

function todayKeyTR(now) {
  return (now || new Date()).toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
}

// TR saat diliminde gün-içi dakika (0–1439).
function minutesNow(now) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now || new Date());
  const hh = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const mm = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  return hh * 60 + mm;
}

// TR saat diliminde haftanın günü (0=Pazar … 6=Cumartesi).
function weekday(now) {
  const s = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Istanbul', weekday: 'short' })
    .format(now || new Date());
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[s] != null ? map[s] : (now || new Date()).getDay();
}

function isHoliday(now) { return TR_HOLIDAYS.has(todayKeyTR(now)); }

function isTradingDay(now) {
  const wd = weekday(now);
  return wd !== 0 && wd !== 6 && !isHoliday(now);
}

function timeLabel(now) {
  const m = minutesNow(now);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// Elle işlem AÇILABİLİR mi? (10:15–18:00, işlem günü)
function canOpenTrade(now) {
  if (!isTradingDay(now)) return false;
  const m = minutesNow(now);
  return m >= OPEN_MIN && m <= CLOSE_MIN;
}

// Elle işlem KAPATILABİLİR mi? (10:15–18:00, işlem günü)
function canCloseTrade(now) {
  if (!isTradingDay(now)) return false;
  const m = minutesNow(now);
  return m >= OPEN_MIN && m <= CLOSE_MIN;
}

function reasonNotOpen(now) {
  if (!isTradingDay(now)) return 'Borsa bugün kapalı (hafta sonu veya resmi tatil). İşlem açılamaz.';
  const m = minutesNow(now);
  if (m < OPEN_MIN) return `İşlem ${OPEN_LABEL}'ten önce açılamaz — borsa işlem saatleri (${OPEN_LABEL}–${CLOSE_LABEL}).`;
  if (m > CLOSE_MIN) return `İşlem ${CLOSE_LABEL}'den sonra açılamaz — seans kapandı.`;
  return null;
}

function reasonNotClose(now) {
  if (!isTradingDay(now)) return 'Borsa bugün kapalı (hafta sonu veya resmi tatil). İşlem kapatılamaz.';
  const m = minutesNow(now);
  if (m > CLOSE_MIN) return `İşlem ${CLOSE_LABEL}'den sonra kapatılamaz — borsa işlem saatleri (${OPEN_LABEL}–${CLOSE_LABEL}).`;
  if (m < OPEN_MIN) return `İşlem ${OPEN_LABEL}'ten önce kapatılamaz — seans açılmadı.`;
  return null;
}

// Frontend için pencere durumu — buton aktif/pasif + mesaj.
function getWindowState(now) {
  return {
    canOpen: canOpenTrade(now),
    canClose: canCloseTrade(now),
    isTradingDay: isTradingDay(now),
    timeTR: timeLabel(now),
    openLabel: OPEN_LABEL,
    closeLabel: CLOSE_LABEL,
    openReason: reasonNotOpen(now),
    closeReason: reasonNotClose(now),
  };
}

// Throw eden koruyucular — route/engine bunları çağırır.
class MarketHoursError extends Error {
  constructor(message) { super(message); this.name = 'MarketHoursError'; this.code = 'MARKET_CLOSED'; }
}
function assertCanOpen(now) {
  if (!canOpenTrade(now)) throw new MarketHoursError(reasonNotOpen(now) || 'İşlem açılamaz.');
}
function assertCanClose(now) {
  if (!canCloseTrade(now)) throw new MarketHoursError(reasonNotClose(now) || 'İşlem kapatılamaz.');
}

module.exports = {
  TR_HOLIDAYS, OPEN_MIN, CLOSE_MIN, OPEN_LABEL, CLOSE_LABEL,
  minutesNow, weekday, isHoliday, isTradingDay,
  canOpenTrade, canCloseTrade, reasonNotOpen, reasonNotClose,
  getWindowState, assertCanOpen, assertCanClose, MarketHoursError,
};
