/**
 * locale.js — Borsa Krali UI sözlüğü (Parça 5 / UX dönüşümü)
 *
 * Tek bir yerde:
 *   - Aksiyon/etiket sözcükleri (AL / SAT / BEKLE / TAKİP ET / RİSKLİ)
 *   - Finansal kavram çevirileri (Stop Loss → Zarar Durdur vb.)
 *   - HTTP/error → sade Türkçe metin
 *   - Push bildirim şablonları
 *   - Sayı/yüzde/saat formatlayıcıları
 *
 * Bu dosya tek dilli (TR) — i18n switch ileride lib/i18n.js üstünden eklenir.
 * Helper'lar pure; yan etkisi yok.
 */

// ── A. Aksiyon Sözlüğü ────────────────────────────────────────────────────
export const ACTIONS = {
  buy: 'AL',
  sell: 'SAT',
  hold: 'BEKLE',
  watch: 'TAKİP ET',
  riskyEntry: 'ŞİMDİ GİRME',
  risky: 'RİSKLİ',
  subscribe: 'Premium’a Geç',
  signIn: 'Giriş Yap',
  signUp: 'Kayıt Ol',
  logout: 'Çıkış Yap',
  cancel: 'İptal',
  confirm: 'Onayla',
  save: 'Kaydet',
  delete: 'Sil',
  edit: 'Düzenle',
  add: 'Ekle',
  refresh: 'Yenile',
  search: 'Ara',
  filter: 'Süz',
  settings: 'Ayarlar',
  help: 'Yardım',
  loading: 'Yükleniyor…',
  submit: 'Gönder',
  continue: 'Devam Et',
  back: 'Geri',
  close: 'Kapat',
  open: 'Aç',
}

// ── B. Sinyal Etiketi Eşlemesi ───────────────────────────────────────────
// Backend direction + score → UI etiketi + renk + kısa cümle
// Detaylı versiyonu Parça 2'de SignalRow ile birlikte kullanılır.
export function mapSignalToLabel(direction, score = 0) {
  const dir = (direction || '').toString().toUpperCase()
  const s = Number(score) || 0
  if (dir === 'STRONG_LONG' || (dir === 'LONG' && s >= 12)) {
    return { label: 'AL', color: 'jade', emoji: '🟢', sentence: 'Güçlü yükseliş sinyali.' }
  }
  if (dir === 'LONG') {
    return { label: 'AL', color: 'jade', emoji: '🟢', sentence: 'Yükseliş başladı.' }
  }
  if (dir === 'WEAK_LONG') {
    return { label: 'TAKİP ET', color: 'gold', emoji: '🟡', sentence: 'Yatay seyir, çıkış olabilir.' }
  }
  if (dir === 'NEUTRAL' || !dir) {
    return { label: 'BEKLE', color: 'gray', emoji: '⚪', sentence: 'Net yön yok, beklemede kal.' }
  }
  if (dir === 'WEAK_SHORT') {
    return { label: 'TAKİP ET', color: 'gold', emoji: '🟡', sentence: 'Zayıflama belirtisi.' }
  }
  if (dir === 'SHORT' && s < 12) {
    return { label: 'ŞİMDİ GİRME', color: 'ember', emoji: '🔴', sentence: 'Düşüş baskısı var.' }
  }
  if (dir === 'STRONG_SHORT' || (dir === 'SHORT' && s >= 12)) {
    return { label: 'RİSKLİ', color: 'ember', emoji: '🔴', sentence: 'Sert düşüş sinyali.' }
  }
  return { label: 'BEKLE', color: 'gray', emoji: '⚪', sentence: 'Net yön yok, beklemede kal.' }
}

// Güven skoru (0..1) → "Güçlü" / "Orta" / "Zayıf"
export function mapConfidence(value) {
  const v = Number(value) || 0
  if (v >= 0.7) return 'Güçlü'
  if (v >= 0.4) return 'Orta'
  return 'Zayıf'
}

// ── C. Finansal Kavram Sözlüğü ───────────────────────────────────────────
export const FINANCE = {
  stopLoss: 'Zarar Durdur',
  takeProfit: 'Kâr Al',
  trailingStop: 'Akıllı Zarar Durdur',
  positionSize: 'İşlem Büyüklüğü',
  leverage: 'Kaldıraç',
  maxDrawdown: 'En kötü dönemde düşüş',
  winRate: 'Kârlı işlem oranı',
  portfolio: 'Portföy',
  watchlist: 'Takip Listesi',
  alert: 'Alarm',
  notification: 'Bildirim',
  price: 'Fiyat',
  order: 'Emir',
  trade: 'İşlem',
  fee: 'Komisyon',
  margin: 'Teminat',
}

// Risk/Reward sayısal değer → cümle
export function describeRiskReward(ratio) {
  const r = Number(ratio)
  if (!Number.isFinite(r) || r <= 0) return 'Risk/kazanç dengesi belirsiz.'
  const rounded = r >= 10 ? Math.round(r) : Math.round(r * 10) / 10
  return `Kazanç ihtimali zarardan ~${rounded} kat fazla.`
}

// ── D. Hata Sözlüğü (HTTP status + özel kodlar → kullanıcı dostu metin) ──
const ERROR_MESSAGES = {
  network: 'İnternet bağlantısı yok gibi görünüyor.',
  timeout: 'İşlem uzun sürdü, tekrar dener misin?',
  unauthorized: 'Oturum süren doldu, tekrar gir.',
  forbidden: 'Bu özelliği görmek için giriş yapman lazım.',
  premium: 'Bu özellik Premium üyelere özel.',
  notFound: 'Aradığını bulamadık.',
  validation: 'Eksik veya hatalı bilgi var.',
  rateLimit: 'Çok hızlı tıkladın, birkaç saniye bekle.',
  serverError: 'Sistemde bir sorun var, biraz sonra dene.',
  generic: 'Bir şeyler ters gitti, tekrar dener misin?',
  noData: 'Henüz veri yok.',
  noResults: 'Sonuç bulunamadı.',
  emptyOpportunities: 'Henüz güçlü fırsat bulunamadı. Yeni fırsat çıktığında burada göreceksin.',
}

export function getErrorMessage(key) {
  return ERROR_MESSAGES[key] || ERROR_MESSAGES.generic
}

// Axios error / fetch Response → sade Türkçe metin
export function mapApiError(error) {
  if (!error) return ERROR_MESSAGES.generic

  // Network / timeout
  const msg = (error.message || '').toLowerCase()
  if (error.code === 'ERR_NETWORK' || msg.includes('network')) return ERROR_MESSAGES.network
  if (msg.includes('timeout') || error.code === 'ECONNABORTED') return ERROR_MESSAGES.timeout

  const status = error.response?.status || error.status
  const serverMsg = error.response?.data?.error || error.response?.data?.message

  // Premium gate (backend açık şekilde planRequired döner)
  if (status === 403 && error.response?.data?.planRequired) return ERROR_MESSAGES.premium

  switch (status) {
    case 400: return serverMsg || ERROR_MESSAGES.validation
    case 401: return ERROR_MESSAGES.unauthorized
    case 403: return ERROR_MESSAGES.forbidden
    case 404: return ERROR_MESSAGES.notFound
    case 408: return ERROR_MESSAGES.timeout
    case 422: return serverMsg || ERROR_MESSAGES.validation
    case 429: return ERROR_MESSAGES.rateLimit
    case 500:
    case 502:
    case 503:
    case 504:
      return ERROR_MESSAGES.serverError
    default:
      return serverMsg || ERROR_MESSAGES.generic
  }
}

// ── E. Push Bildirim Şablonları ──────────────────────────────────────────
// Backend'de de aynı dil kullanılır; burası referans + opsiyonel render.
export const PUSH_TEMPLATES = {
  signalBuy: (symbol, price) => price
    ? `${symbol} için al sinyali — yükseliş başladı. (${price} TL)`
    : `${symbol} için al sinyali — yükseliş başladı.`,
  signalSell: (symbol) => `${symbol} için düşüş sinyali — dikkat.`,
  dailyReady: 'Bugünkü fırsat listesi hazır.',
  botOpenedLong: (symbol, price) => price
    ? `Bot ${symbol} aldı (${price} TL).`
    : `Bot ${symbol} aldı.`,
  botClosedPosition: (pct) => `Bot satış yaptı. Kâr: %${pct}`,
  stopLossHit: 'Zarar durdurma çalıştı, çıkıldı.',
  takeProfitHit: 'Kâr hedefine ulaşıldı, satıldı.',
  alertPriceCrossed: (symbol, price) => `Alarmın çaldı: ${symbol} ${price} TL’yi geçti.`,
  subscriptionExpiring: (days) => `Aboneliğin ${days} gün sonra bitiyor.`,
  subscriptionRenewed: 'Aboneliğin yenilendi.',
  cryptoBuy: (symbol) => `${symbol} için al sinyali — güçlü yükseliş.`,
  marketOpenTitle: '📈 Borsa açıldı',
  marketOpenBody: 'BIST seansı başladı. Bugünün fırsatları seni bekliyor.',
  marketCloseTitle: '📉 Borsa kapandı',
  marketCloseBody: 'Seans bitti. Gün sonu raporu hazır.',
}

// ── F. Boş Ekran Cümleleri ──────────────────────────────────────────────
export const EMPTY_STATES = {
  opportunities: 'Henüz güçlü fırsat bulunamadı. Yeni fırsat çıktığında burada göreceksin.',
  watchlist: 'Henüz takip ettiğin hisse yok. Fırsatlar’dan bir hisseye gir, kalp ikonuna bas.',
  notes: 'Henüz not eklemedin. İstediğin hissede not tutabilirsin.',
  notifications: 'Bildirim yok. Fırsat çıkınca burada görünür.',
  tradeHistory: 'Henüz işlem yok. Bot ilk fırsatı bulduğunda burada görürsün.',
  generic: 'Henüz veri yok.',
}

// ── G. Başarı Toast Şablonları ──────────────────────────────────────────
export const SUCCESS_TEMPLATES = {
  addedToWatchlist: (symbol) => `✓ ${symbol} takip listene eklendi.`,
  removedFromWatchlist: (symbol) => `✓ ${symbol} takip listenden çıkarıldı.`,
  noteSaved: '✓ Not kaydedildi.',
  alertCreated: '✓ Alarm kuruldu. Fiyat geldiğinde haber vereceğim.',
  botStarted: '✓ Bot çalışıyor.',
  botStopped: '✓ Bot durduruldu.',
  passwordChanged: '✓ Şifren güncellendi.',
  settingsSaved: '✓ Ayarlar kaydedildi.',
}

// ── H. Vade Eşlemesi (Timeframe → İnsan dili) ───────────────────────────
const TF_GROUP = {
  '1m': 'kısa vade', '5m': 'kısa vade', '15m': 'kısa vade',
  '1h': 'orta vade', '4h': 'orta vade',
  '1d': 'uzun vade', '1w': 'uzun vade',
}
export function tfToHuman(tf) {
  return TF_GROUP[tf] || tf || 'vade'
}

// ── I. Yazım Yardımcıları ───────────────────────────────────────────────
// "47.20 TL" — sayı + birim arası boşluk var
export function formatPriceTRY(value, digits = 2) {
  const v = Number(value)
  if (!Number.isFinite(v)) return '-'
  return `${v.toFixed(digits)} TL`
}

// "%2.3" — yüzde işaretinden sonra boşluksuz
export function formatPercent(value, digits = 2) {
  const v = Number(value)
  if (!Number.isFinite(v)) return '-'
  const sign = v > 0 ? '+' : ''
  return `${sign}%${v.toFixed(digits)}`
}

// "17 Mayıs 2026" — UI tarih formatı
const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
                   'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
export function formatDateTR(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getDate()} ${TR_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

// "14:32" — 24 saat formatı
export function formatTimeTR(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike)
  if (Number.isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

export default {
  ACTIONS, FINANCE, ERROR_MESSAGES, PUSH_TEMPLATES, EMPTY_STATES, SUCCESS_TEMPLATES,
  mapSignalToLabel, mapConfidence, describeRiskReward, getErrorMessage, mapApiError,
  tfToHuman, formatPriceTRY, formatPercent, formatDateTR, formatTimeTR,
}
