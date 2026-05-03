/**
 * AdMob Yöneticisi - DEVRE DIŞI
 *
 * AdMob plugin native crash sebep olduğu için kaldırıldı.
 * Tüm fonksiyonlar no-op / simülasyon modunda çalışır.
 *
 * Geri açmak için:
 * 1) `npm install @capacitor-community/admob`
 * 2) Gerçek AdMob ID'lerini AD_CONFIG'e ekle
 * 3) AndroidManifest.xml'deki meta-data yorumlarını kaldır
 * 4) Bu dosyayı eski haline getir
 */

export const AD_CONFIG = {
  APP_ID: '',
  REWARDED_UNIT_ID: '',
  BANNER_UNIT_ID: '',
  INTERSTITIAL_UNIT_ID: '',
}

export async function initAdMob() {
  // no-op
}

/**
 * Rewarded reklam göster (simülasyon modu)
 * Web ve native — her zaman simülasyon (2 sn bekle, ödül ver)
 */
export async function showRewardedAd() {
  return new Promise((resolve) => {
    setTimeout(() => resolve(true), 2000)
  })
}

export async function showBannerAd() {
  // no-op
}

export async function hideBannerAd() {
  // no-op
}
