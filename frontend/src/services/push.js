/**
 * Push Notifications — @capacitor/push-notifications + FCM
 *
 * Akış:
 *  1) initializePushNotifications: native cihazda izin iste, FCM register et,
 *     event listener'ları kur (token / notification / actionPerformed).
 *  2) Token alındıktan sonra backend /api/push/register'a gönder.
 *  3) Login state değişince syncStoredPushToken: yeni access token ile aynı
 *     FCM token'ı tekrar kaydet (kullanıcı eşlemesi backend'de güncellensin).
 *
 * Web platformunda hiç çalışmaz — Capacitor.isNativePlatform false ise no-op.
 */

import { getApiBase } from '../config'
import { useAuthStore } from '../store/authStore'

const STORAGE_KEY = 'bk-push-token'
const PLATFORM_KEY = 'bk-push-platform'

function isNativePlatform() {
  return typeof window !== 'undefined'
    && typeof window.Capacitor?.isNativePlatform === 'function'
    && window.Capacitor.isNativePlatform()
}

async function loadPlugin() {
  try {
    const mod = await import('@capacitor/push-notifications')
    return mod.PushNotifications
  } catch (e) {
    console.warn('[Push] @capacitor/push-notifications yüklenemedi:', e?.message || e)
    return null
  }
}

async function loadAppPlugin() {
  try {
    const mod = await import('@capacitor/app')
    return mod.App
  } catch {
    return null
  }
}

async function postToBackend(path, body) {
  const url = `${getApiBase()}/api/push${path}`
  const token = useAuthStore.getState().token
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok && data.success !== false, data }
  } catch (e) {
    console.warn(`[Push] backend ${path} hata:`, e?.message || e)
    return { ok: false, data: null }
  }
}

let initialized = false
let cachedToken = null

/**
 * Push notification altyapısını başlat. Sadece native platformda çalışır.
 * @param {(targetPath: string) => void} onNavigate — bildirime tıklayınca çağrılır
 */
// Hata ve durum bilgilerini geçici olarak window event'i ile yay → UI debug
function debug(label, payload) {
  try { window.dispatchEvent(new CustomEvent('bk-push-debug', { detail: { label, payload } })) } catch { /* ignore */ }
  // Backend'e de yaz (tek seferlik debug; production'da kaldırılabilir)
  try {
    fetch(`${getApiBase()}/api/push/debug-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, payload, ua: navigator.userAgent, ts: Date.now() }),
    }).catch(() => { })
  } catch { /* ignore */ }
}

export async function initializePushNotifications(onNavigate) {
  debug('init:enter', { native: isNativePlatform(), already: initialized })
  if (!isNativePlatform() || initialized) return
  initialized = true

  const Push = await loadPlugin()
  debug('init:plugin-loaded', { hasPlugin: !!Push })
  if (!Push) return

  // İzin iste
  let permission
  try {
    permission = await Push.requestPermissions()
    debug('init:permission', permission)
  } catch (e) {
    debug('init:permission-error', { message: e?.message || String(e) })
    return
  }

  if (permission?.receive !== 'granted') {
    debug('init:permission-not-granted', permission)
    return
  }

  // Token alındığında: localStorage + backend'e kaydet
  Push.addListener('registration', async (registrationToken) => {
    const tokenValue = registrationToken?.value || registrationToken
    debug('registration:event', { tokenLen: typeof tokenValue === 'string' ? tokenValue.length : 0 })
    if (!tokenValue) return
    cachedToken = tokenValue
    try {
      localStorage.setItem(STORAGE_KEY, tokenValue)
      localStorage.setItem(PLATFORM_KEY, 'android')
    } catch { /* ignore */ }

    const r = await postToBackend('/register', {
      pushToken: tokenValue,
      platform: 'android',
      bundleId: 'com.borsakrali.app',
    })
    debug('registration:backend', r)
  })

  Push.addListener('registrationError', (err) => {
    debug('registration:error', { error: err?.error || String(err) })
  })

  // Uygulama AÇIKKEN gelen bildirim — sistem otomatik tepsiye düşürmez,
  // bu yüzden Local Notification'a benzer bir in-app banner göstermek
  // uygulama tasarımına kalmış. Şimdilik sadece kayıt — UI dispatch eder.
  Push.addListener('pushNotificationReceived', (notification) => {
    try {
      window.dispatchEvent(new CustomEvent('bk-push-foreground', { detail: notification }))
    } catch { /* ignore */ }
  })

  // Bildirime tıklandığında — uygulama açılır veya foreground'a gelir.
  // payload.data.path varsa o sayfaya yönlendir.
  Push.addListener('pushNotificationActionPerformed', (action) => {
    const data = action?.notification?.data || {}
    const path = data.path || ''
    if (typeof onNavigate === 'function' && path && path.startsWith('/')) {
      // React Router'a teslim et — küçük gecikme nav state'i için
      setTimeout(() => onNavigate(path), 50)
    }
  })

  // Native register et — bu komut FCM token'ı tetikler
  try {
    await Push.register()
    debug('init:register-called')
  } catch (e) {
    debug('init:register-error', { message: e?.message || String(e) })
  }
}

/**
 * Login state değişince (token yenilendiğinde / kullanıcı değiştiğinde),
 * mevcut FCM token'ı backend'e tekrar kaydet — böylece kullanıcı eşlemesi
 * güncellenir, broadcast doğru kişiye gider.
 */
export async function syncStoredPushToken() {
  if (!isNativePlatform()) return
  let stored
  try { stored = localStorage.getItem(STORAGE_KEY) } catch { stored = null }
  const tokenValue = cachedToken || stored
  if (!tokenValue) return

  await postToBackend('/register', {
    pushToken: tokenValue,
    platform: 'android',
    bundleId: 'com.borsakrali.app',
  })
}
