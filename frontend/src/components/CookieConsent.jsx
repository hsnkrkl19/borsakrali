import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cookie, ShieldCheck, X, ChevronDown, ChevronUp } from 'lucide-react'

const STORAGE_KEY = 'bk-cookie-consent-v1'
const CURRENT_VERSION = 1

/**
 * KVKK + GDPR uyumlu cerez onay banner'i.
 *
 * Saklanan yapi:
 *   {
 *     v: 1,                  // surum (politikalar guncellenirse artirilir)
 *     ts: 1730000000000,     // onay tarihi
 *     necessary: true,       // her zaman true
 *     analytics: bool,
 *     marketing: bool        // AdSense / reklam izni
 *   }
 *
 * Diger componentler izinleri okumak icin:
 *   import { hasMarketingConsent } from './CookieConsent'
 *   if (hasMarketingConsent()) { ... }
 */

export function getConsent() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.v !== CURRENT_VERSION) return null
    return parsed
  } catch {
    return null
  }
}

export function hasMarketingConsent() {
  const c = getConsent()
  return !!(c && c.marketing)
}

export function hasAnalyticsConsent() {
  const c = getConsent()
  return !!(c && c.analytics)
}

function saveConsent(payload) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      v: CURRENT_VERSION,
      ts: Date.now(),
      necessary: true,
      ...payload,
    }))
    window.dispatchEvent(new CustomEvent('bk-cookie-consent-change', { detail: payload }))
  } catch {
    // localStorage erisimi engellenmis olabilir; sessizce gec
  }
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [analytics, setAnalytics] = useState(true)
  const [marketing, setMarketing] = useState(true)

  useEffect(() => {
    const stored = getConsent()
    if (!stored) {
      // Ilk acilis — asenkron mount agriligini onlemek icin kucuk bir gecikme
      const t = setTimeout(() => setVisible(true), 600)
      return () => clearTimeout(t)
    }
  }, [])

  if (!visible) return null

  const acceptAll = () => {
    saveConsent({ analytics: true, marketing: true })
    setVisible(false)
  }

  const rejectAll = () => {
    saveConsent({ analytics: false, marketing: false })
    setVisible(false)
  }

  const saveSelection = () => {
    saveConsent({ analytics, marketing })
    setVisible(false)
  }

  return (
    <div
      role="dialog"
      aria-label="Cerez tercihleri"
      className="fixed inset-x-0 bottom-0 z-[200] px-3 pb-3 sm:px-6 sm:pb-6"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)' }}
    >
      <div
        className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-gold-500/30 bg-dark-900/95 shadow-2xl backdrop-blur-xl"
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(212,175,55,0.15)' }}
      >
        <div className="flex items-start gap-3 p-4 sm:p-5">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
            <Cookie className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-white">Cerezleri kullaniyoruz</h2>
            <p className="mt-1 text-sm leading-6 text-gray-300">
              Sitemizin calismasi, kullanim istatistikleri ve kisisellestirilmis reklamlar icin cerezler
              kullaniyoruz. Tercihinizi istediginiz zaman degistirebilirsiniz.{' '}
              <Link to="/privacy-policy" className="text-gold-400 underline-offset-2 hover:underline">
                Gizlilik Politikasi
              </Link>
            </p>
          </div>
          <button
            onClick={rejectAll}
            aria-label="Kapat ve reddet"
            className="hidden rounded-lg p-1 text-gray-400 transition hover:bg-white/5 hover:text-white sm:block"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {showDetails && (
          <div className="border-t border-white/5 px-4 py-3 sm:px-5">
            <div className="space-y-3">
              <ConsentRow
                icon={<ShieldCheck className="h-4 w-4 text-emerald-400" />}
                title="Zorunlu cerezler"
                description="Oturum, guvenlik ve temel site ozelliklerinin calismasi icin gereklidir. Devre disi birakilamaz."
                checked
                disabled
              />
              <ConsentRow
                title="Analitik cerezler"
                description="Sayfa goruntulemeleri ve hata raporlari ile site performansini olcmemize yardimci olur."
                checked={analytics}
                onChange={setAnalytics}
              />
              <ConsentRow
                title="Reklam / Pazarlama cerezleri"
                description="Google AdSense gibi servislerin daha alakali reklamlar gostermesini saglar. Kapatilirsa genel reklamlar gosterilir."
                checked={marketing}
                onChange={setMarketing}
              />
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-white/5 bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <button
            onClick={() => setShowDetails((s) => !s)}
            className="inline-flex items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs text-gray-400 transition hover:bg-white/5 hover:text-white"
          >
            {showDetails ? (
              <>
                Detaylari gizle <ChevronUp className="h-3.5 w-3.5" />
              </>
            ) : (
              <>
                Tercihleri yonet <ChevronDown className="h-3.5 w-3.5" />
              </>
            )}
          </button>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={rejectAll}
              className="rounded-xl border border-white/10 bg-dark-800 px-4 py-2.5 text-sm font-medium text-gray-200 transition hover:bg-dark-700"
            >
              Reddet
            </button>
            {showDetails && (
              <button
                onClick={saveSelection}
                className="rounded-xl border border-gold-500/30 bg-gold-500/10 px-4 py-2.5 text-sm font-medium text-gold-300 transition hover:bg-gold-500/15"
              >
                Secimi kaydet
              </button>
            )}
            <button
              onClick={acceptAll}
              className="rounded-xl bg-gradient-to-r from-gold-500 to-gold-600 px-4 py-2.5 text-sm font-semibold text-dark-950 transition hover:from-gold-400 hover:to-gold-500"
            >
              Tumunu kabul et
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ConsentRow({ icon, title, description, checked, onChange, disabled }) {
  return (
    <label
      className={`flex items-start gap-3 rounded-xl border border-white/5 bg-black/20 p-3 ${
        disabled ? 'opacity-80' : 'cursor-pointer hover:bg-black/30'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="mt-1 h-4 w-4 cursor-pointer accent-gold-500 disabled:cursor-not-allowed"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium text-white">{title}</span>
        </div>
        <p className="mt-1 text-xs leading-5 text-gray-400">{description}</p>
      </div>
    </label>
  )
}
