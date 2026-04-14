/**
 * AdMob Yöneticisi - Borsa Krali
 * Google AdMob entegrasyonu (rewarded + banner)
 *
 * TEST ID'LER (geliştirme için)
 * Gerçek ID'leri buraya ekleyeceksiniz.
 */

// ============================================================
// BURAYA GERÇEK ADMOB ID'LERİNİZİ GİRİN
// ============================================================
export const AD_CONFIG = {
  // Android App ID — AndroidManifest.xml'deki meta-data ile eşleşmeli
  APP_ID: 'ca-app-pub-3940256099942544~3347511713', // TEST — değiştir

  // Rewarded Ad (reklam izle → +5 kullanım)
  REWARDED_UNIT_ID: 'ca-app-pub-3940256099942544/5224354917', // TEST — değiştir

  // Banner Ad (isteğe bağlı, ana sayfada)
  BANNER_UNIT_ID: 'ca-app-pub-3940256099942544/6300978111', // TEST — değiştir

  // Interstitial (isteğe bağlı)
  INTERSTITIAL_UNIT_ID: 'ca-app-pub-3940256099942544/1033173712', // TEST — değiştir
}
// ============================================================

let AdMob = null
let initialized = false

async function getAdMob() {
  if (AdMob) return { mob: AdMob }
  try {
    const { AdMob: _AdMob } = await import('@capacitor-community/admob')
    AdMob = _AdMob
    return { mob: AdMob }
  } catch (e) {
    return { mob: null }
  }
}

export async function initAdMob() {
  if (initialized) return
  const { mob } = await getAdMob()
  if (!mob) return
  try {
    await mob.initialize({
      requestTrackingAuthorization: false,
      testingDevices: [],
      initializeForTesting: false,
    })
    initialized = true
  } catch (e) {
    console.warn('AdMob init hatası:', e)
  }
}

/**
 * Rewarded reklam göster
 * Returns: true = kullanıcı reklamı izledi ve ödül kazandı
 *          false = reklam iptal edildi veya hata
 */
export async function showRewardedAd() {
  const { mob } = await getAdMob()

  // Web / geliştirme ortamında simüle et
  if (!mob) {
    return new Promise((resolve) => {
      setTimeout(() => resolve(true), 2000) // 2 sn simülasyon
    })
  }

  return new Promise(async (resolve) => {
    let earned = false

    try {
      // Rewarded ad yükle
      await mob.prepareRewardVideoAd({
        adId: AD_CONFIG.REWARDED_UNIT_ID,
        isTesting: false,
      })

      // Ödül listener
      mob.addListener('onRewardedVideoAdLoaded', async () => {
        await mob.showRewardVideoAd()
      })

      mob.addListener('onRewardedVideoAdReward', () => {
        earned = true
      })

      mob.addListener('onRewardedVideoAdClosed', () => {
        resolve(earned)
      })

      mob.addListener('onRewardedVideoAdFailedToLoad', () => {
        resolve(false)
      })

    } catch (e) {
      console.error('Rewarded ad hatası:', e)
      resolve(false)
    }
  })
}

/**
 * Banner reklam göster (alt kısım)
 */
export async function showBanner() {
  const { mob } = await getAdMob()
  if (!mob) return
  try {
    const { BannerAdSize, BannerAdPosition } = await import('@capacitor-community/admob')
    await mob.showBanner({
      adId: AD_CONFIG.BANNER_UNIT_ID,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
      isTesting: false,
    })
  } catch (e) {
    console.warn('Banner reklam hatası:', e)
  }
}

export async function hideBanner() {
  const { mob } = await getAdMob()
  if (!mob) return
  try {
    await mob.removeBanner()
  } catch (e) {}
}
