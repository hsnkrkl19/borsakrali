import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import Layout from './components/Layout'
import UpdatePopup from './components/UpdatePopup'
import PushNotificationManager from './components/PushNotificationManager'
import ErrorBoundary from './components/ErrorBoundary'
import Dashboard from './pages/Dashboard'
import GunlukTespitler from './pages/GunlukTespitler'
import TakipListem from './pages/TakipListem'
import TeknikAnalizAI from './pages/TeknikAnalizAI'
import Ayarlar from './pages/Ayarlar'
import Login from './pages/Login'
import Register from './pages/Register'
import ChangePassword from './pages/ChangePassword'
import PrivacyPolicy from './pages/PrivacyPolicy'
import TermsOfUse from './pages/TermsOfUse'
import AccountDeletion from './pages/AccountDeletion'
import PlayStorePreviewAuth from './pages/PlayStorePreviewAuth'
import LiveHeatmap from './pages/LiveHeatmap'
import ProAnaliz from './pages/ProAnaliz'
import Abonelik from './pages/Abonelik'
import Odeme from './pages/Odeme'
import IstekPaneli from './pages/IstekPaneli'
import EkonomikTakvim from './pages/EkonomikTakvim'
import AdminBildirimler from './pages/AdminBildirimler'

// === BİRLEŞİK SAYFALAR (sadeleştirme) ===
import Tarayicilar from './pages/Tarayicilar'         // Taramalar + EMA34 + Malaysian SNR + Tarama Merkezi
import Notlarim from './pages/Notlarim'               // Teknik Notlar + Finansal Notlar
import SirketAnalizi from './pages/SirketAnalizi'     // Temel Analiz AI + Mali Tablolar + KAP + AI Skor
import Performans from './pages/Performans'           // Algoritma Performans + İnceleme Kütüphanesi
import Kripto from './pages/Kripto'                   // YENİ: Kripto piyasa, watchlist, fiyat alarmı
import EndeksDetay from './pages/EndeksDetay'         // YENİ: Endeks detay grafik sayfası

import { useAuthStore } from './store/authStore'
import { fetchCurrentUser } from './services/auth'
import { applyTheme, getStoredTheme } from './utils/theme'

const FONT_LEVELS = [80, 87, 93, 100, 108, 116]

// === ESKİ URL'LERİ YENİ BİRLEŞİK SAYFALARA YÖNLENDİR ===
// Eski yer imleri / paylaşımlar bozulmasın diye redirect ekledik.
const REDIRECT_MAP = [
  // Tarayıcılar grubu
  { from: '/taramalar',                to: '/tarayicilar?tab=genel' },
  { from: '/ema34-tarayici',           to: '/tarayicilar?tab=ema34' },
  { from: '/malaysian-snr',            to: '/tarayicilar?tab=snr' },
  { from: '/tarama-analiz-merkezi',    to: '/tarayicilar?tab=merkez' },

  // Notlarım grubu
  { from: '/teknik-notlar',            to: '/notlarim?tab=teknik' },
  { from: '/finansal-notlar',          to: '/notlarim?tab=finansal' },

  // Şirket Analizi grubu
  { from: '/temel-analiz-ai',          to: '/sirket-analizi?tab=temel-ai' },
  { from: '/mali-tablolar',            to: '/sirket-analizi?tab=mali' },
  { from: '/kap-analitik',             to: '/sirket-analizi?tab=kap' },
  { from: '/hisse-ai-skor',            to: '/sirket-analizi?tab=ai-skor' },

  // Performans grubu
  { from: '/algoritma-performans',     to: '/performans?tab=algoritma' },
  { from: '/inceleme-kutuphanesi',     to: '/performans?tab=kutuphane' },
]

function App() {
  const { isAuthenticated, token, updateUser, user } = useAuthStore()

  useEffect(() => {
    const saved = localStorage.getItem('bk-font-level')
    if (saved !== null) {
      const idx = Math.max(0, Math.min(FONT_LEVELS.length - 1, parseInt(saved, 10)))
      document.documentElement.style.fontSize = `${FONT_LEVELS[idx]}%`
    }

    applyTheme(getStoredTheme())
  }, [])

  useEffect(() => {
    if (!token) return

    let active = true

    fetchCurrentUser(token)
      .then((data) => {
        if (active && data?.user) {
          updateUser(data.user)
        }
      })
      .catch(() => {
        // Render free instance sleep or temporary network issues should not
        // force a logout. We only refresh the cached user when the backend responds.
      })

    return () => {
      active = false
    }
  }, [token, updateUser])

  return (
    <ErrorBoundary>
    <Router>
      <PushNotificationManager />
      {isAuthenticated && <UpdatePopup />}
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/playstore-auth" element={<PlayStorePreviewAuth />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/gizlilik-politikasi" element={<PrivacyPolicy />} />
        <Route path="/terms-of-use" element={<TermsOfUse />} />
        <Route path="/kullanim-kosullari" element={<TermsOfUse />} />
        <Route path="/account-deletion" element={<AccountDeletion />} />
        <Route path="/hesap-silme" element={<AccountDeletion />} />

        <Route
          path="/*"
          element={
            isAuthenticated ? (
              <Layout>
                <ErrorBoundary>
                <Routes>
                  {/* === ANA SAYFALAR === */}
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/canli-heatmap" element={<LiveHeatmap />} />
                  <Route path="/kripto" element={<Kripto />} />
                  <Route path="/endeks/:symbol" element={<EndeksDetay />} />
                  <Route path="/pro-analiz" element={<ProAnaliz />} />

                  {/* === ANALİZ === */}
                  <Route path="/teknik-analiz-ai" element={<TeknikAnalizAI />} />
                  <Route path="/sirket-analizi" element={<SirketAnalizi />} />
                  <Route path="/tarayicilar" element={<Tarayicilar />} />
                  <Route path="/gunluk-tespitler" element={<GunlukTespitler />} />
                  <Route path="/performans" element={<Performans />} />

                  {/* === KİŞİSEL === */}
                  <Route path="/takip-listem" element={<TakipListem />} />
                  <Route path="/notlarim" element={<Notlarim />} />
                  <Route path="/ekonomik-takvim" element={<EkonomikTakvim />} />

                  {/* === HESAP === */}
                  <Route path="/abonelik" element={<Abonelik />} />
                  <Route path="/odeme" element={<Odeme />} />
                  <Route path="/ayarlar" element={<Ayarlar />} />
                  <Route path="/sifre-degistir" element={<ChangePassword />} />
                  <Route path="/istek-paneli" element={<IstekPaneli />} />

                  {user?.role === 'admin' && (
                    <Route path="/admin-bildirimler" element={<AdminBildirimler />} />
                  )}

                  {/* === ESKİ URL → YENİ URL YÖNLENDİRMELERİ === */}
                  {REDIRECT_MAP.map(r => (
                    <Route key={r.from} path={r.from} element={<Navigate to={r.to} replace />} />
                  ))}

                  {/* Bilinmeyen yollar Dashboard'a */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
                </ErrorBoundary>
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
    </Router>
    </ErrorBoundary>
  )
}

export default App
