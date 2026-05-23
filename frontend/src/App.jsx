import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import Layout from './components/Layout'
import UpdatePopup from './components/UpdatePopup'
import PushNotificationManager from './components/PushNotificationManager'
import ErrorBoundary from './components/ErrorBoundary'
import BackButtonHandler from './components/BackButtonHandler'
import CommandPalette from './components/CommandPalette'
import OnboardingTour from './components/OnboardingTour'
import ToastHost from './components/ToastHost'
import AnnouncementsManager from './components/AnnouncementsManager'
import AdminBroadcastFAB from './components/AdminBroadcastFAB'
import CookieConsent from './components/CookieConsent'
import RequireAuth from './components/RequireAuth'
import ThemeRipple from './components/ThemeRipple'
import MobileBottomNav from './components/MobileBottomNav'
import PageTransition from './components/PageTransition'
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
import Hakkimizda from './pages/Hakkimizda'
import Iletisim from './pages/Iletisim'
import PlayStorePreviewAuth from './pages/PlayStorePreviewAuth'
import Sinyaller from './pages/Sinyaller'
import ProAnaliz from './pages/ProAnaliz'
import Abonelik from './pages/Abonelik'
import Odeme from './pages/Odeme'
import IstekPaneli from './pages/IstekPaneli'
import EkonomikTakvim from './pages/EkonomikTakvim'
import AdminBildirimler from './pages/AdminBildirimler'
import Bildirimler from './pages/Bildirimler'
import Egitim from './pages/Egitim'
import TeknikAnalizGiris from './pages/egitim/TeknikAnalizGiris'
import Bist100Rehberi from './pages/egitim/Bist100Rehberi'
import TemelGostergeler from './pages/egitim/TemelGostergeler'
import BilancoOkuma from './pages/egitim/BilancoOkuma'
import DestekDirenc from './pages/egitim/DestekDirenc'
import YatirimStratejisi from './pages/egitim/YatirimStratejisi'
// Kripto & strateji eğitim makaleleri (AdSense içerik genişletmesi)
import KriptoParaGiris from './pages/egitim/KriptoParaGiris'
import KriptoAnaliz from './pages/egitim/KriptoAnaliz'
import OnchainAnaliz from './pages/egitim/OnchainAnaliz'
import SpotVsFutures from './pages/egitim/SpotVsFutures'
import FundingRate from './pages/egitim/FundingRate'
import BitcoinDominansi from './pages/egitim/BitcoinDominansi'
import RiskYonetimi from './pages/egitim/RiskYonetimi'
import PortfoyYonetimi from './pages/egitim/PortfoyYonetimi'
import MaliyetOrtalama from './pages/egitim/MaliyetOrtalama'
import YatirimPsikolojisi from './pages/egitim/YatirimPsikolojisi'
import TradePlani from './pages/egitim/TradePlani'
import YatirimHatalari from './pages/egitim/YatirimHatalari'

// === BİRLEŞİK SAYFALAR (sadeleştirme) ===
import Tarayicilar from './pages/Tarayicilar'         // Taramalar + EMA34 Wave + TEMA34 + Malaysian SNR + Tarama Merkezi
import Notlarim from './pages/Notlarim'               // Teknik Notlar + Finansal Notlar
import SirketAnalizi from './pages/SirketAnalizi'     // Temel Analiz AI + Mali Tablolar + KAP + AI Skor
import Performans from './pages/Performans'           // Algoritma Performans + İnceleme Kütüphanesi
import Kripto from './pages/Kripto'                   // YENİ: Kripto piyasa, watchlist, fiyat alarmı
import EndeksDetay from './pages/EndeksDetay'         // YENİ: Endeks detay grafik sayfası
import DCFDegerleme from './pages/DCFDegerleme'       // YENİ: dexter DCF değerleme
import KriptoDegerleme from './pages/KriptoDegerleme' // YENİ: kripto composite valuation
import SiteHaritasi from './pages/SiteHaritasi'       // Site haritasi (eski Yenilikler yerine)
import GunSonuPerformans from './pages/GunSonuPerformans' // YENİ: günün sinyallerinin gün sonu performansı
import TradingBot from './pages/TradingBot' // YENİ v5.1: Freqtrade port + sınama katmanı
import Yenilikler from './pages/Yenilikler' // YENİ v5.2: Hoşgeldin / yenilikler ekranı (tekrar göster)
import HisseMerkezi from './pages/HisseMerkezi' // YENİ v5.3: Tek çatı altında hisse detayları
import IsYatirimVeri from './pages/IsYatirimVeri' // YENİ v5.4: İş Yatırım hisse/endeks/mali tablo veri arayüzü
import BorsapyMerkezi from './pages/BorsapyMerkezi' // YENİ v5.5: TEFAS+TCMB+Banka kurları+Enflasyon (borsapy esinli)

// === PARÇA 1 WRAPPER'LARI (21→6 sekme sadeleştirmesi) ===
import Firsatlar from './pages/Firsatlar' // Tarayıcılar + Günlük Sinyaller
import Botlar    from './pages/Botlar'    // Trading Bot + Paper Trading
import Ogren     from './pages/Ogren'     // Eğitim alias
import Hesabim   from './pages/Hesabim'   // Ayarlar + Takip + Notlar + Abonelik

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
  { from: '/tema34-tarayici',          to: '/tarayicilar?tab=tema34' },
  { from: '/malaysian-snr',            to: '/tarayicilar?tab=snr' },
  { from: '/tarama-analiz-merkezi',    to: '/tarayicilar?tab=merkez' },
  { from: '/x-gundem',                 to: '/tarayicilar?tab=x-gundem' },
  { from: '/haberler',                 to: '/tarayicilar?tab=haberler' },
  { from: '/haber-akisi',              to: '/tarayicilar?tab=haberler' },

  // Notlarım grubu
  { from: '/teknik-notlar',            to: '/notlarim?tab=teknik' },
  { from: '/finansal-notlar',          to: '/notlarim?tab=finansal' },

  // Şirket Analizi grubu
  { from: '/temel-analiz-ai',          to: '/sirket-analizi?tab=temel-ai' },
  { from: '/mali-tablolar',            to: '/sirket-analizi?tab=mali' },
  { from: '/kap-analitik',             to: '/sirket-analizi?tab=kap' },
  { from: '/hisse-ai-skor',            to: '/sirket-analizi?tab=ai-skor' },
  { from: '/dcf',                      to: '/dcf-degerleme' },

  // Performans grubu
  { from: '/algoritma-performans',     to: '/performans?tab=algoritma' },
  { from: '/inceleme-kutuphanesi',     to: '/performans?tab=kutuphane' },

  // === Parça 1: 21→6 sekme — eski URL'ler yeni wrapper'lara yönlenir ===
  // Backward compat: AdSense ve eski yer imleri bozulmasın diye eski yollar
  // hâlâ erişilebilir kalır; sadece kullanıcıyı yeni URL'e ulaştırır.
  // Not: /teknik-analiz-ai bilerek redirect edilmedi — Sinyaller sayfası
  // henüz ?tab=ai görünümünü içermiyor (Parça 2 işi). /abonelik public
  // kalmaya devam ediyor (paywall öncesi fiyat ekranı).
  { from: '/tarayicilar',              to: '/firsatlar?tab=genel'        },
  { from: '/gunluk-tespitler',         to: '/firsatlar?tab=gunluk'       },
  { from: '/trading-bot',              to: '/botlar?tab=trading'         },
  { from: '/paper-trading',            to: '/botlar?tab=paper'           },
  { from: '/egitim',                   to: '/ogren'                      },
  { from: '/ayarlar',                  to: '/hesabim?tab=ayarlar'        },
  { from: '/takip-listem',             to: '/hesabim?tab=takip'          },
  { from: '/notlarim',                 to: '/hesabim?tab=notlar'         },
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
    // Demo modunda token sahte — /me'yi çağırırsak 401 alır, api.js
    // interceptor refresh deneyip oturumu kapatır ve Login'e yönlendirir.
    // Demo kullanıcıyı backend doğrulamasından muaf tutuyoruz.
    if (user?.isDemo || token === 'demo-token-full-access') return

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
  }, [token, updateUser, user?.isDemo])

  return (
    <ErrorBoundary>
    <Router>
      <BackButtonHandler />
      <PushNotificationManager />
      <ThemeRipple />
      <MobileBottomNav />
      {isAuthenticated && <CommandPalette />}
      {isAuthenticated && <AnnouncementsManager />}
      {isAuthenticated && <AdminBroadcastFAB />}
      {isAuthenticated && <UpdatePopup />}
      <OnboardingTour />
      <ToastHost />
      <CookieConsent />
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
        <Route path="/hakkimizda" element={<Hakkimizda />} />
        <Route path="/about" element={<Hakkimizda />} />
        <Route path="/iletisim" element={<Iletisim />} />
        <Route path="/contact" element={<Iletisim />} />

        <Route
          path="/*"
          element={
            <Layout>
              <ErrorBoundary>
              <PageTransition>
              <Routes>
                {/* === HERKESE ACIK SAYFALAR (login gerektirmez, AdSense uyumu) === */}
                <Route path="/" element={<Dashboard />} />
                {/* Sinyaller — Komuta merkezi (BIST + Kripto özet) */}
                <Route path="/sinyaller" element={<Sinyaller />} />
                {/* Eski heatmap URL → yeni sinyaller sayfasına (heatmap alt sekme) */}
                <Route path="/canli-heatmap" element={<Navigate to="/sinyaller?tab=heatmap" replace />} />
                <Route path="/ekonomik-takvim" element={<EkonomikTakvim />} />
                <Route path="/is-yatirim-veri" element={<IsYatirimVeri />} />
                {/* Borsapy Veri Merkezi — public (TEFAS + TCMB + banka kurları + enflasyon) */}
                <Route path="/borsapy" element={<BorsapyMerkezi />} />
                <Route path="/veri-merkezi" element={<Navigate to="/borsapy" replace />} />
                <Route path="/site-haritasi" element={<SiteHaritasi />} />
                <Route path="/endeks/:symbol" element={<EndeksDetay />} />
                <Route path="/yenilikler" element={<Yenilikler />} />

                {/* Birleşik hisse detay sayfası — tüm taramalar/analizler/X yorumları tek çatı */}
                <Route path="/hisse/:symbol" element={<HisseMerkezi />} />
                <Route path="/hisse" element={<HisseMerkezi />} />

                {/* === EGITIM / BLOG (public, AdSense icin kritik icerik) === */}
                {/* Parça 1: /egitim eski URL'i REDIRECT_MAP üzerinden /ogren'e gider; alt sayfalar burada kalır. */}
                <Route path="/ogren" element={<Ogren />} />
                <Route path="/egitim/teknik-analiz-giris" element={<TeknikAnalizGiris />} />
                <Route path="/egitim/bist100-rehberi" element={<Bist100Rehberi />} />
                <Route path="/egitim/temel-gostergeler" element={<TemelGostergeler />} />
                <Route path="/egitim/bilanco-okuma" element={<BilancoOkuma />} />
                <Route path="/egitim/destek-direnc" element={<DestekDirenc />} />
                <Route path="/egitim/yatirim-stratejisi" element={<YatirimStratejisi />} />
                {/* Kripto & strateji makaleleri — public, prerender edilir */}
                <Route path="/egitim/kripto-para-giris" element={<KriptoParaGiris />} />
                <Route path="/egitim/kripto-analiz" element={<KriptoAnaliz />} />
                <Route path="/egitim/onchain-analiz" element={<OnchainAnaliz />} />
                <Route path="/egitim/spot-vs-futures" element={<SpotVsFutures />} />
                <Route path="/egitim/funding-rate" element={<FundingRate />} />
                <Route path="/egitim/bitcoin-dominansi" element={<BitcoinDominansi />} />
                <Route path="/egitim/risk-yonetimi" element={<RiskYonetimi />} />
                <Route path="/egitim/portfoy-yonetimi" element={<PortfoyYonetimi />} />
                <Route path="/egitim/maliyet-ortalama" element={<MaliyetOrtalama />} />
                <Route path="/egitim/yatirim-psikolojisi" element={<YatirimPsikolojisi />} />
                <Route path="/egitim/trade-plani" element={<TradePlani />} />
                <Route path="/egitim/yatirim-hatalari" element={<YatirimHatalari />} />

                {/* === PREMIUM / KISISEL — login zorunlu === */}
                <Route path="/kripto" element={<RequireAuth><Kripto /></RequireAuth>} />
                <Route path="/pro-analiz" element={<RequireAuth><ProAnaliz /></RequireAuth>} />
                <Route path="/teknik-analiz-ai" element={<RequireAuth><TeknikAnalizAI /></RequireAuth>} />
                <Route path="/sirket-analizi" element={<RequireAuth><SirketAnalizi /></RequireAuth>} />
                <Route path="/dcf-degerleme" element={<RequireAuth><DCFDegerleme /></RequireAuth>} />
                <Route path="/kripto-degerleme" element={<RequireAuth><KriptoDegerleme /></RequireAuth>} />
                <Route path="/performans" element={<RequireAuth><Performans /></RequireAuth>} />
                <Route path="/gun-sonu-performans" element={<RequireAuth><GunSonuPerformans /></RequireAuth>} />

                {/* === PARÇA 1 WRAPPER'LARI — sadeleştirilmiş üst sekmeler === */}
                <Route path="/firsatlar" element={<RequireAuth><Firsatlar /></RequireAuth>} />
                <Route path="/botlar"    element={<RequireAuth><Botlar    /></RequireAuth>} />
                <Route path="/hesabim"   element={<RequireAuth><Hesabim   /></RequireAuth>} />

                {/* === HESAP === */}
                <Route path="/abonelik" element={<Abonelik />} />
                <Route path="/odeme" element={<RequireAuth><Odeme /></RequireAuth>} />
                <Route path="/sifre-degistir" element={<RequireAuth><ChangePassword /></RequireAuth>} />
                <Route path="/istek-paneli" element={<RequireAuth><IstekPaneli /></RequireAuth>} />
                <Route path="/bildirimler" element={<RequireAuth><Bildirimler /></RequireAuth>} />

                {user?.role === 'admin' && (
                  <Route path="/admin-bildirimler" element={<AdminBildirimler />} />
                )}

                {/* === ESKI URL -> YENI URL YONLENDIRMELERI === */}
                {REDIRECT_MAP.map(r => (
                  <Route key={r.from} path={r.from} element={<Navigate to={r.to} replace />} />
                ))}

                {/* Bilinmeyen yollar Dashboard'a */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              </PageTransition>
              </ErrorBoundary>
            </Layout>
          }
        />
      </Routes>
    </Router>
    </ErrorBoundary>
  )
}

export default App
