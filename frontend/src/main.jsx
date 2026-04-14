import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/index.css'
import { initAdMob } from './utils/adManager'
import { getApiBase } from './config'

if (typeof window !== 'undefined' && typeof window.fetch === 'function' && !window.__bkFetchPatched) {
  const originalFetch = window.fetch.bind(window)
  const appOrigin = window.location.origin

  const rewriteApiUrl = (url) => {
    const apiBase = getApiBase()
    if (!apiBase) return url
    if (url.startsWith('/api/')) return `${apiBase}${url}`
    if (url.startsWith(`${appOrigin}/api/`)) return `${apiBase}${url.slice(appOrigin.length)}`
    return url
  }

  window.fetch = (input, init) => {
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
  }

  window.__bkFetchPatched = true
}

// AdMob başlatma (Capacitor hazır olduğunda)
document.addEventListener('deviceready', () => { initAdMob() }, false)
// Web için de dene
initAdMob()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
