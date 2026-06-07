/**
 * Premium / oturum gerektiren rotalar için sarmalayıcı.
 *
 * ⚠️ GİRİŞ DUVARI KALDIRILDI (AdSense + "üyelik pasif, herkes direkt giriş").
 * Site artık herkese açık: gelen her ziyaretçi otomatik misafir oturumuyla
 * açılır (bkz. main.jsx + authStore.loginAsGuest), bu yüzden bu sarmalayıcı
 * şimdilik içeriği olduğu gibi geçirir — hiçbir rota /login'e yönlenmez.
 *
 * Üyelik zorunluluğunu geri getirmek için aşağıdaki yorumlu bloğu aç ve bu
 * pass-through satırını kaldır:
 *
 *   import { Navigate, useLocation } from 'react-router-dom'
 *   import { useAuthStore } from '../store/authStore'
 *   const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
 *   const location = useLocation()
 *   if (!isAuthenticated) {
 *     return <Navigate to="/login" state={{ from: location.pathname }} replace />
 *   }
 *   return children
 */
export default function RequireAuth({ children }) {
  return children
}
