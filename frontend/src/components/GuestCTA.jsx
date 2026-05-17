import { Link } from 'react-router-dom'
import { Crown, ArrowRight, Sparkles } from 'lucide-react'
import { useAuthStore } from '../store/authStore'

/**
 * Login OLMAMIS kullanicilar icin "kayit ol / giris yap" cagrisi.
 * Public sayfalarin (Dashboard, Heatmap, Ekonomik Takvim, Site Haritasi)
 * en ustunde gorunur. Login kullanicilar icin null doner.
 *
 * Variant'lar:
 *   - 'banner'  : Genis banner (default, sayfa basinda)
 *   - 'compact' : Kucuk inline kart (sayfa icinde)
 */
export default function GuestCTA({ variant = 'banner', message }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (isAuthenticated) return null

  if (variant === 'compact') {
    return (
      <div className="my-4 rounded-2xl border border-gold-500/20 bg-gradient-to-r from-gold-500/10 to-amber-500/5 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gold-500/20 text-gold-400">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white">
              {message || 'Premium özelliklere ulaşmak için ücretsiz hesap aç'}
            </p>
            <p className="mt-0.5 text-xs text-gray-400">
              Sinyaller, AI skor, takip listesi ve daha fazlası
            </p>
          </div>
          <Link
            to="/register"
            className="inline-flex flex-shrink-0 items-center gap-1 rounded-xl bg-gradient-to-r from-gold-500 to-gold-600 px-3 py-2 text-xs font-semibold text-dark-950 transition hover:from-gold-400 hover:to-gold-500"
          >
            Kayıt Ol <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-gold-500/30 bg-gradient-to-r from-gold-500/15 via-amber-500/10 to-gold-500/15 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-gold-400 to-gold-600 text-dark-950 shadow-lg">
            <Crown className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white sm:text-base">
              Borsa Kralı Premium ile tüm özellikleri kullan
            </h3>
            <p className="mt-1 text-xs text-gray-300 sm:text-sm">
              Günlük AI sinyalleri, takip listesi, AI skor, mali tablo analizi ve daha fazlası.
              Ücretsiz hesap ile başla.
            </p>
          </div>
        </div>
        <div className="flex flex-shrink-0 gap-2">
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-dark-800 px-4 py-2 text-sm font-medium text-gray-200 transition hover:bg-dark-700"
          >
            Giriş
          </Link>
          <Link
            to="/register"
            className="inline-flex items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-gold-500 to-gold-600 px-4 py-2 text-sm font-semibold text-dark-950 transition hover:from-gold-400 hover:to-gold-500"
          >
            Ücretsiz Kayıt Ol <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  )
}
