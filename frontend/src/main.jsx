import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/index.css'
import { initAdMob } from './utils/adManager'
import { getApiBase } from './config'

// === GLOBAL CRASH GUARD — Beyaz ekran yerine hata mesajı göster ===
function showCrashScreen(message, stack) {
  try {
    const root = document.getElementById('root')
    if (!root) return
    root.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#0a0a0f;color:#fff;font-family:Inter,system-ui,sans-serif">
        <div style="max-width:480px;width:100%;background:#16161f;border:1px solid rgba(245,158,11,0.4);border-radius:18px;padding:28px;text-align:center">
          <div style="font-size:48px;margin-bottom:12px">⚠️</div>
          <h1 style="color:#f59e0b;font-size:20px;margin:0 0 12px">Uygulama başlatılamadı</h1>
          <p style="color:#9ca3af;font-size:14px;margin:0 0 16px;line-height:1.5">${message || 'Bilinmeyen hata'}</p>
          <details style="text-align:left;margin-bottom:18px">
            <summary style="color:#6b7280;font-size:11px;cursor:pointer">Teknik detay</summary>
            <pre style="font-size:10px;color:#6b7280;background:#0a0a0f;padding:8px;border-radius:8px;overflow:auto;max-height:160px;margin-top:6px">${(stack || '').slice(0, 800)}</pre>
          </details>
          <button onclick="location.reload()" style="background:#f59e0b;color:#0a0a0f;font-weight:700;padding:12px 24px;border:none;border-radius:12px;cursor:pointer;font-size:14px">Yeniden Dene</button>
        </div>
      </div>
    `
  } catch (_) { /* noop */ }
}

window.addEventListener('error', (e) => {
  console.error('[window.error]', e.message, e.error)
  if (!document.getElementById('root')?.children.length) {
    showCrashScreen(e.message, e.error?.stack)
  }
})

window.addEventListener('unhandledrejection', (e) => {
  console.error('[unhandledrejection]', e.reason)
  // Network errors → sessizce yut, app çalışmaya devam etsin
  const msg = e.reason?.message || String(e.reason)
  if (msg.includes('Network') || msg.includes('timeout') || msg.includes('fetch')) {
    e.preventDefault()
  }
})

// === FETCH PATCH (relative /api → absolute API_BASE) ===
if (typeof window !== 'undefined' && typeof window.fetch === 'function' && !window.__bkFetchPatched) {
  const originalFetch = window.fetch.bind(window)
  const appOrigin = window.location.origin

  const rewriteApiUrl = (url) => {
    try {
      const apiBase = getApiBase()
      if (!apiBase) return url
      if (typeof url === 'string') {
        if (url.startsWith('/api/')) return `${apiBase}${url}`
        if (url.startsWith(`${appOrigin}/api/`)) return `${apiBase}${url.slice(appOrigin.length)}`
      }
    } catch (_) { /* noop */ }
    return url
  }

  window.fetch = (input, init) => {
    try {
      if (typeof input === 'string') {
        return originalFetch(rewriteApiUrl(input), init)
      }
      if (input instanceof Request) {
        const rewrittenUrl = rewriteApiUrl(input.url)
        if (rewrittenUrl !== input.url) {
          return originalFetch(new Request(rewrittenUrl, input), init)
        }
      }
      return originalFetch(input, init)
    } catch (e) {
      console.warn('[fetch patch] hata:', e?.message)
      return originalFetch(input, init)
    }
  }
  window.__bkFetchPatched = true
}

// === AdMob başlatma — try-catch içinde ===
try {
  document.addEventListener('deviceready', () => { initAdMob().catch(() => {}) }, false)
  initAdMob().catch(() => {})
} catch (e) {
  console.warn('[AdMob init outer] hata:', e?.message)
}

// === REACT MOUNT — try-catch içinde ===
try {
  const rootEl = document.getElementById('root')
  if (!rootEl) {
    showCrashScreen('Uygulama kapsayıcısı bulunamadı (#root yok)', '')
  } else {
    ReactDOM.createRoot(rootEl).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    )
  }
} catch (e) {
  console.error('[React mount] hata:', e)
  showCrashScreen(e?.message || 'React başlatılamadı', e?.stack)
}
