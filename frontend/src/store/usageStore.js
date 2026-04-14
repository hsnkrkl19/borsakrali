import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const AD_REWARD = 5
export const DAILY_LIMIT = 10 // Free plan default

// Plan limit lookup
const PLAN_LIMITS = {
  free:            { daily: 10,   monthly: null,  hasAds: true },
  starter_monthly: { daily: null, monthly: null,  hasAds: true },
  pro_monthly:     { daily: null, monthly: null,  hasAds: false },
  elite_once:      { daily: null, monthly: 50,    hasAds: true },
  premium_once:    { daily: null, monthly: 150,   hasAds: true },
  lifetime:        { daily: null, monthly: null,  hasAds: false },
}

export const PLAN_DISPLAY_NAMES = {
  free: 'Ücretsiz',
  starter_monthly: 'Başlangıç',
  pro_monthly: 'Pro',
  elite_once: 'Elite',
  premium_once: 'Premium',
  lifetime: 'Ömür Boyu',
}

export const useUsageStore = create(
  persist(
    (set, get) => ({
      plan:           'free',
      planExpiry:     null,
      dailyCount:     0,
      monthlyCount:   0,
      bonusCount:     0,
      lastDayReset:   null,
      lastMonthReset: null,

      // Günlük & aylık sıfırlama kontrolü
      _checkReset() {
        const today = new Date().toDateString()
        const thisMonth = new Date().getFullYear() + '-' + new Date().getMonth()
        const s = get()
        const updates = {}
        if (s.lastDayReset !== today) {
          updates.dailyCount = 0
          updates.bonusCount = 0
          updates.lastDayReset = today
        }
        if (s.lastMonthReset !== thisMonth) {
          updates.monthlyCount = 0
          updates.lastMonthReset = thisMonth
        }
        if (Object.keys(updates).length > 0) set(updates)
      },

      // Kalan kullanım hakkı
      getRemaining() {
        const s = get()
        s._checkReset()
        const limits = PLAN_LIMITS[s.plan] || PLAN_LIMITS.free
        if (limits.daily === null && limits.monthly === null) return Infinity
        if (limits.monthly !== null) {
          return Math.max(0, limits.monthly - get().monthlyCount)
        }
        return Math.max(0, limits.daily + get().bonusCount - get().dailyCount)
      },

      // Günlük limit (display için)
      getDailyLimit() {
        const s = get()
        const limits = PLAN_LIMITS[s.plan] || PLAN_LIMITS.free
        return limits.daily
      },

      // Aylık limit (display için)
      getMonthlyLimit() {
        const s = get()
        const limits = PLAN_LIMITS[s.plan] || PLAN_LIMITS.free
        return limits.monthly
      },

      // Premium mi?
      get isPremium() {
        const p = get().plan
        return p !== 'free'
      },

      // Reklam göster mi?
      hasAds() {
        const limits = PLAN_LIMITS[get().plan] || PLAN_LIMITS.free
        return limits.hasAds
      },

      // Kullanım denemesi — true: izin verildi, false: limit doldu
      tryUse() {
        const s = get()
        const limits = PLAN_LIMITS[s.plan] || PLAN_LIMITS.free
        // Unlimited plans
        if (limits.daily === null && limits.monthly === null) return true
        s._checkReset()
        const remaining = s.getRemaining()
        if (remaining <= 0) return false
        if (limits.monthly !== null) {
          set(st => ({ monthlyCount: st.monthlyCount + 1 }))
        } else {
          set(st => ({ dailyCount: st.dailyCount + 1 }))
        }
        return true
      },

      // Reklam izlendikten sonra bonus ekle
      addBonus(amount = AD_REWARD) {
        set(st => ({ bonusCount: st.bonusCount + amount }))
      },

      // Plan güncelle
      setPlan(plan, expiry = null) {
        set({ plan: plan || 'free', planExpiry: expiry || null })
      },

      // Eski API uyumu
      setPremium(val) {
        set({ plan: val ? 'lifetime' : 'free' })
      },
    }),
    { name: 'bk-usage-v2' }
  )
)
