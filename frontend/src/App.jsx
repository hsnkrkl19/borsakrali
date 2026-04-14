import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import Layout from './components/Layout'
import UpdatePopup from './components/UpdatePopup'
import Dashboard from './pages/Dashboard'
import GunlukTespitler from './pages/GunlukTespitler'
import TakipListem from './pages/TakipListem'
import AlgoritmaPerformans from './pages/AlgoritmaPerformans'
import TemelAnalizAI from './pages/TemelAnalizAI'
import TeknikAnalizAI from './pages/TeknikAnalizAI'
import HisseAISkor from './pages/HisseAISkor'
import KAPAnalitik from './pages/KAPAnalitik'
import TeknikNotlar from './pages/TeknikNotlar'
import Taramalar from './pages/Taramalar'
import TaramaAnalizMerkezi from './pages/TaramaAnalizMerkezi'
import IncelemeKutuphanesi from './pages/IncelemeKutuphanesi'
import Ayarlar from './pages/Ayarlar'
import Login from './pages/Login'
import Register from './pages/Register'
import PrivacyPolicy from './pages/PrivacyPolicy'
import TermsOfUse from './pages/TermsOfUse'
import AccountDeletion from './pages/AccountDeletion'
import PlayStorePreviewAuth from './pages/PlayStorePreviewAuth'
import LiveHeatmap from './pages/LiveHeatmap'
import FinancialAnalysis from './pages/FinancialAnalysis'
import ProAnaliz from './pages/ProAnaliz'
import Abonelik from './pages/Abonelik'
import Odeme from './pages/Odeme'
import MalaysianSNR from './pages/MalaysianSNR'
import IstekPaneli from './pages/IstekPaneli'
import FinansalNotlar from './pages/FinansalNotlar'
import EkonomikTakvim from './pages/EkonomikTakvim'
import EMA34Tarayici from './pages/EMA34Tarayici'
import { useAuthStore } from './store/authStore'
import { applyTheme, getStoredTheme } from './utils/theme'

const FONT_LEVELS = [80, 87, 93, 100, 108, 116]

function App() {
  const { isAuthenticated } = useAuthStore()

  useEffect(() => {
    const saved = localStorage.getItem('bk-font-level')
    if (saved !== null) {
      const idx = Math.max(0, Math.min(FONT_LEVELS.length - 1, parseInt(saved, 10)))
      document.documentElement.style.fontSize = `${FONT_LEVELS[idx]}%`
    }

    applyTheme(getStoredTheme())
  }, [])

  return (
    <Router>
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
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/gunluk-tespitler" element={<GunlukTespitler />} />
                  <Route path="/takip-listem" element={<TakipListem />} />
                  <Route path="/algoritma-performans" element={<AlgoritmaPerformans />} />
                  <Route path="/temel-analiz-ai" element={<TemelAnalizAI />} />
                  <Route path="/teknik-analiz-ai" element={<TeknikAnalizAI />} />
                  <Route path="/hisse-ai-skor" element={<HisseAISkor />} />
                  <Route path="/kap-analitik" element={<KAPAnalitik />} />
                  <Route path="/teknik-notlar" element={<TeknikNotlar />} />
                  <Route path="/taramalar" element={<Taramalar />} />
                  <Route path="/tarama-analiz-merkezi" element={<TaramaAnalizMerkezi />} />
                  <Route path="/inceleme-kutuphanesi" element={<IncelemeKutuphanesi />} />
                  <Route path="/ayarlar" element={<Ayarlar />} />
                  <Route path="/canli-heatmap" element={<LiveHeatmap />} />
                  <Route path="/mali-tablolar" element={<FinancialAnalysis />} />
                  <Route path="/pro-analiz" element={<ProAnaliz />} />
                  <Route path="/abonelik" element={<Abonelik />} />
                  <Route path="/odeme" element={<Odeme />} />
                  <Route path="/malaysian-snr" element={<MalaysianSNR />} />
                  <Route path="/istek-paneli" element={<IstekPaneli />} />
                  <Route path="/finansal-notlar" element={<FinansalNotlar />} />
                  <Route path="/ekonomik-takvim" element={<EkonomikTakvim />} />
                  <Route path="/ema34-tarayici" element={<EMA34Tarayici />} />
                </Routes>
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
    </Router>
  )
}

export default App
