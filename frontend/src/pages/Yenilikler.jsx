import { useNavigate } from 'react-router-dom'
import WelcomeIntro from '../components/home/WelcomeIntro'

/**
 * /yenilikler — Login'deki welcome panelinin standalone hali.
 * Ayarlar > "Yenilikleri tekrar göster" butonuyla buraya yönlendirilir.
 * Hem giriş yapmış hem yapmamış kullanıcılar erişebilir; CTA Dashboard'a atar.
 */
export default function Yenilikler() {
  const navigate = useNavigate()

  const handleContinue = () => {
    // Welcome flag'i zaten Ayarlar'dan temizlenip buraya geldiyse, kullanıcı
    // bu sefer "gördüm" demek için butona basıyor — flag'i set edip ana sayfaya
    // yönlendiriyoruz, bir sonraki çıkışta Login'de welcome paneli görmesin.
    try { localStorage.setItem('bk-welcome-seen-v1', '1') } catch {}
    navigate('/')
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <WelcomeIntro
        onContinue={handleContinue}
        ctaLabel="Siteye Devam Et"
        ctaSubtitle="Yenilikleri tekrar görmek istersen Ayarlar > Hoşgeldin Ekranı kısmından açabilirsin."
      />
    </div>
  )
}
