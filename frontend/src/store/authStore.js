import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ─────────────────────────────────────────────────────────────────────────────
// MİSAFİR (GUEST) OTURUMU — "üyelik pasif, herkes direkt giriş" modeli
//
// AdSense onayı için giriş duvarı kaldırıldı: siteye gelen herkes otomatik
// olarak bir misafir oturumuyla açılır, böylece tüm içerik login olmadan
// gezilebilir. Misafir, backend'in zaten kabul ettiği demo token'ını kullanır
// (server-live.js → DEMO_TOKENS), bu yüzden backend tarafında değişiklik
// gerekmez ve `isDemo: true` sayesinde api.js 401 interceptor'ı oturumu
// kapatmaya çalışmaz.
//
// `isGuest: true` işareti, gerçek hesap açmak isteyenlerin Login/Register
// sayfalarına yine de ulaşabilmesi için (otomatik yönlendirme atlanır) kullanılır.
// Gerçek bir kullanıcı giriş yaptığında kendi token'ı saklanır ve misafir
// önyüklemesi tetiklenmez.
// ─────────────────────────────────────────────────────────────────────────────
export const GUEST_TOKEN = 'demo-token-full-access'

export const GUEST_USER = {
  id: 'guest',
  firstName: 'Misafir',
  lastName: '',
  email: '',
  plan: 'pro',        // tüm özellikler açık — paywall yok
  planExpiry: null,
  role: 'guest',
  isDemo: true,       // demo plumbing'i yeniden kullan (logout döngüsü yok)
  isGuest: true,      // gerçek login/register'a erişime izin veren işaret
}

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,

      // login(user, token) eski imza — refreshToken opsiyonel olarak da
      // alabiliyor (üçüncü parametre veya {refreshToken} obje olarak).
      login: (user, token, refreshToken = null) => set({
        user,
        token,
        refreshToken,
        isAuthenticated: true,
      }),

      // Misafir oturumu başlat / geri dön. Gerçek kullanıcı "çıkış" yaptığında
      // boş/oturumsuz bir state yerine doğrudan misafire döner — böylece
      // login duvarı hiçbir zaman görünmez ve user asla null kalmaz.
      loginAsGuest: () => set({
        user: GUEST_USER,
        token: GUEST_TOKEN,
        refreshToken: null,
        isAuthenticated: true,
      }),

      // Sadece token'ları güncelle (refresh akışı kullanıcıyı değiştirmiyor)
      updateTokens: ({ token, refreshToken }) => set((state) => ({
        token: token || state.token,
        refreshToken: refreshToken || state.refreshToken,
      })),

      logout: () => set({
        user: null,
        token: null,
        refreshToken: null,
        isAuthenticated: false,
      }),

      updateUser: (userData) => set((state) => ({
        user: { ...state.user, ...userData }
      })),
    }),
    {
      name: 'auth-storage',
    }
  )
)
