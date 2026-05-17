/**
 * Parça 3 — Bot risk profilleri.
 *
 * Kullanıcı 3 risk kartından birini seçer; arka planda backend strateji ID'sine
 * eşlenir (backend mantığı değişmiyor). strategyId değerleri
 * `backend/src/services/tradingBot/strategies/index.js` ile birebir aynı olmalı.
 */

export const BOT_PROFILES = {
  safe: {
    id: 'safe',
    label: 'Güvenli Bot',
    emoji: '🟢',
    desc: 'Düşük riskli hisseleri takip eder. Yavaş ama istikrarlı.',
    estReturn: 'ayda ~%2-5',
    risk: 'low',
    riskLabel: 'Düşük',
    strategyId: 'bbrsi',
    // Mean-reversion: dip alım, dengeye geri dönüş
    strategyName: 'Alt sınırdan dönüş alımı',
    market: 'bist',
    timeframe: '1d',
    minBudget: 1000,
  },
  fast: {
    id: 'fast',
    label: 'Hızlı Bot',
    emoji: '🟡',
    desc: 'Kısa hareketleri yakalamaya çalışır. Daha çok işlem, daha çok hareket.',
    estReturn: 'ayda ~%5-12',
    risk: 'mid',
    riskLabel: 'Orta',
    strategyId: 'macd-cross',
    strategyName: 'Momentum kesişimi',
    market: 'crypto',
    timeframe: '1h',
    minBudget: 1000,
  },
  bold: {
    id: 'bold',
    label: 'Cesur Bot',
    emoji: '🔴',
    desc: 'Sert hareketleri kovalar. Yüksek kazanç, yüksek risk.',
    estReturn: 'ayda ~%10-30',
    risk: 'high',
    riskLabel: 'Yüksek',
    strategyId: 'nostalgia-lite',
    strategyName: 'Çoklu filtreli agresif giriş',
    market: 'crypto',
    timeframe: '1h',
    minBudget: 2500,
  },
}

export const BOT_PROFILE_LIST = [
  BOT_PROFILES.safe,
  BOT_PROFILES.fast,
  BOT_PROFILES.bold,
]

// localStorage anahtarları — backend canlı bot endpoint'i yok, durumu istemcide
// tutuyoruz. İleride POST /api/bot/start eklenirse, store mantığı korunabilir.
export const BOT_STATE_KEYS = {
  active: 'bk-bot-active',         // '1' aktif, yoksa pasif
  profile: 'bk-bot-profile',       // 'safe' | 'fast' | 'bold'
  budget: 'bk-bot-budget',         // TL (number)
  startedAt: 'bk-bot-started-at',  // ISO date
  acknowledged: 'bk-bot-ack-bold', // Cesur Bot risk onayı (kalıcı)
}

export function getActiveBot() {
  if (typeof window === 'undefined') return null
  try {
    if (localStorage.getItem(BOT_STATE_KEYS.active) !== '1') return null
    const profileId = localStorage.getItem(BOT_STATE_KEYS.profile)
    const profile = BOT_PROFILES[profileId]
    if (!profile) return null
    const budget = Number(localStorage.getItem(BOT_STATE_KEYS.budget)) || 0
    const startedAt = localStorage.getItem(BOT_STATE_KEYS.startedAt) || null
    return { profile, budget, startedAt }
  } catch {
    return null
  }
}

export function startBot({ profileId, budget }) {
  if (typeof window === 'undefined') return false
  if (!BOT_PROFILES[profileId]) return false
  try {
    localStorage.setItem(BOT_STATE_KEYS.active, '1')
    localStorage.setItem(BOT_STATE_KEYS.profile, profileId)
    localStorage.setItem(BOT_STATE_KEYS.budget, String(budget || 0))
    localStorage.setItem(BOT_STATE_KEYS.startedAt, new Date().toISOString())
    return true
  } catch {
    return false
  }
}

export function stopBot() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(BOT_STATE_KEYS.active)
    localStorage.removeItem(BOT_STATE_KEYS.profile)
    localStorage.removeItem(BOT_STATE_KEYS.budget)
    localStorage.removeItem(BOT_STATE_KEYS.startedAt)
  } catch {
    /* ignore */
  }
}

export function isBoldAcknowledged() {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(BOT_STATE_KEYS.acknowledged) === '1'
  } catch {
    return false
  }
}

export function setBoldAcknowledged() {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(BOT_STATE_KEYS.acknowledged, '1') } catch { /* ignore */ }
}
