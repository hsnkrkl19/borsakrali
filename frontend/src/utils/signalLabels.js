/**
 * Parça 2 — Sinyal etiket eşlemesi
 *
 * Backend direction + score → UI etiketi (AL / TAKİP ET / BEKLE / ŞİMDİ GİRME / RİSKLİ)
 * + renk + emoji + tek cümle açıklama.
 *
 * Çekirdek mapping locale.js'te. Bu dosya hem Parça 2 spec'i (`mapSignalToLabel(direction, score)`)
 * için tek import noktası, hem de UI bileşenleri için renkleri CSS değişkenlerine
 * çevirir (jade/gold/gray/ember → var(--jade) vb.).
 *
 * Tüm tarayıcı, günlük sinyal ve canlı sinyal sayfaları bu dosyayı kullanır.
 */

import { mapSignalToLabel as coreMap } from './locale'

// Renk token'ları → CSS değişkenleri + Tailwind sınıfları
const COLOR_MAP = {
  jade:  {
    cssVar: 'var(--jade)',
    textClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/10',
    borderClass: 'border-emerald-500/40',
    rgb: '0, 201, 138',
  },
  ember: {
    cssVar: 'var(--ember)',
    textClass: 'text-red-400',
    bgClass: 'bg-red-500/10',
    borderClass: 'border-red-500/40',
    rgb: '255, 59, 70',
  },
  gold:  {
    cssVar: 'var(--gold-400)',
    textClass: 'text-gold-400',
    bgClass: 'bg-gold-400/10',
    borderClass: 'border-gold-400/40',
    rgb: '212, 175, 55',
  },
  gray:  {
    cssVar: 'var(--text-faint)',
    textClass: 'text-gray-400',
    bgClass: 'bg-gray-500/10',
    borderClass: 'border-gray-500/30',
    rgb: '148, 163, 184',
  },
}

/**
 * Asıl Parça 2 API'si.
 * Returns: { label, color, emoji, sentence, cssVar, textClass, bgClass, borderClass, rgb }
 */
export function mapSignalToLabel(direction, score = 0) {
  const base = coreMap(direction, score)
  const colors = COLOR_MAP[base.color] || COLOR_MAP.gray
  return { ...base, ...colors }
}

/**
 * Backend signal objelerinden hangi 4 "pill kategorisi"ne gireceğini belirler:
 *   - strong:    score >= 12 long (= GÜÇLÜ AL)
 *   - new:       score 9-11 long (yeni hareket başlamış)
 *   - risky:     short yön (her score)
 *   - rising:    pozitif günlük değişim + long yön
 * Pill filtreleri için Tarayıcılar/GunlukTespitler kullanır.
 */
export function categorizeSignal(signal) {
  if (!signal) return null
  const dir = (signal.direction || '').toUpperCase()
  const score = Number(signal.totalScore ?? signal.score ?? 0)
  const change = Number(signal.changePercent ?? signal.dailyChange ?? 0)

  const categories = []
  if (dir.includes('LONG') && score >= 12) categories.push('strong')
  if (dir === 'LONG' && score >= 9 && score < 12) categories.push('new')
  if (dir.includes('SHORT')) categories.push('risky')
  if (dir.includes('LONG') && change > 0) categories.push('rising')
  return categories
}

// Pill listesi — Tarayıcılar/GunlukTespitler 4 sade filtre olarak kullanır.
export const FILTER_PILLS = [
  { id: 'strong', label: 'Güçlüler',         predicate: (s) => categorizeSignal(s)?.includes('strong') },
  { id: 'new',    label: 'Yeni Hareketler',  predicate: (s) => categorizeSignal(s)?.includes('new') },
  { id: 'risky',  label: 'Riskliler',        predicate: (s) => categorizeSignal(s)?.includes('risky') },
  { id: 'rising', label: 'Bugün Yükselenler', predicate: (s) => categorizeSignal(s)?.includes('rising') },
]

export default mapSignalToLabel
