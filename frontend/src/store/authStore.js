import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
