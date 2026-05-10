import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

/**
 * Premium / oturum gerektiren rotalar icin sarmalayici.
 *
 * Kullanim:
 *   <Route path="/sinyaller" element={
 *     <RequireAuth>
 *       <GunlukTespitler />
 *     </RequireAuth>
 *   } />
 *
 * Login degilse /login'e yonlendirir, geldigi yeri state'te tutar
 * ki giristen sonra geri donebilelim.
 */
export default function RequireAuth({ children }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  return children
}
