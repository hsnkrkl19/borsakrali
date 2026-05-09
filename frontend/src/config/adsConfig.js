/**
 * Google AdSense yapilandirmasi - tek merkezi yer.
 *
 * Onay sonrasi yapilacak:
 *  1) AdSense paneli > Reklamlar > Reklam birimleri > Yeni reklam birimi olustur
 *  2) Her konum icin "Display Ad" / "Responsive" sec
 *  3) Olusan kod icindeki data-ad-slot="1234567890" degerini asagiya yapistir
 *  4) Ilk dolan slot otomatik olarak Layout/MobileNav icinde gorunur olur
 *
 * Slot ID bos ('') ise o konumda hicbir sey render edilmez — boylece onay
 * surecinde bos kutucuk gostermeden script kontrolu yapilabilir.
 *
 * AUTO ADS: AdSense panelinden Auto Ads aktif edilirse vignette (pop-up
 * benzeri tam ekran reklam) ve anchor reklamlar otomatik gosterilir.
 * Bunun icin slot ID gerekmiyor — sadece <head>'deki AdSense script'i yeter.
 */

export const ADSENSE_CLIENT = 'ca-pub-3010697585892821'

export const AD_SLOTS = {
  // Masaustu - Header'in altinda yatay banner
  desktopTop: '',

  // Masaustu - Footer'in ustunde yatay banner
  desktopBottom: '',

  // Mobil - Sticky alt banner (MobileNav'in ustunde)
  mobileBottom: '',

  // Mobil - Header'in altinda banner (sayfa basinda)
  mobileTop: '',

  // Sayfa ici (in-content) - uzun sayfalar arasinda gosterilebilir
  inContent: '',
}

export const ADS_ENABLED = true

// Reklamlari tamamen kapatmak icin: localStorage.setItem('bk-ads-disabled', '1')
export function adsRuntimeDisabled() {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem('bk-ads-disabled') === '1'
  } catch {
    return false
  }
}
