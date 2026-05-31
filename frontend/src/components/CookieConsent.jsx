import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cookie, ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react'

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

  const saveSelection = () => {
    saveConsent({ analytics, marketing })
    setVisible(false)
  }

  return (
    <div
      role="dialog"
      aria-label="Çerez tercihleri"
      className="fixed inset-x-0 bottom-0 z-[200] px-2 pb-2 sm:px-4 sm:pb-4"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)' }}
    >
      <div
        className="mx-auto max-w-xl overflow-hidden rounded-xl border border-gold-500/30 bg-dark-900/95 shadow-2xl backdrop-blur-xl"
        style={{ boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(16,185,129,0.15)' }}
      >
        <div className="flex items-center gap-2.5 p-3">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-gold-500/15 text-gold-400">
            <Cookie className="h-3.5 w-3.5" />
          </div>
          <p className="min-w-0 flex-1 text-xs leading-5 text-gray-300">
            Site deneyimi ve reklamlar için çerez kullanıyoruz.{' '}
            <Link to="/privacy-policy" className="text-gold-400 underline-offset-2 hover:underline">
              Gizlilik
            </Link>
          </p>
        </div>

        {showDetails && (
          <div className="border-t border-white/5 px-3 py-2">
            <div className="space-y-1.5">
              <ConsentRow
                icon={<ShieldCheck className="h-3 w-3 text-emerald-400" />}
                title="Zorunlu"
                description="Oturum ve güvenlik için gerekli; her zaman aktif."
                checked
                disabled
              />
              <ConsentRow
                title="Analitik"
                description="Site performansını ölçmek için."
                checked={analytics}
                onChange={setAnalytics}
              />
              <ConsentRow
                title="Reklam"
                description="Daha alakalı reklamlar göstermek için."
                checked={marketing}
                onChange={setMarketing}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-white/5 bg-black/20 px-3 py-2">
          <button
            onClick={() => setShowDetails((s) => !s)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-gray-400 transition hover:bg-white/5 hover:text-white"
          >
            {showDetails ? (
              <>
                Gizle <ChevronUp className="h-3 w-3" />
              </>
            ) : (
              <>
                Tercihleri yönet <ChevronDown className="h-3 w-3" />
              </>
            )}
          </button>

          <div className="flex items-center gap-1.5">
            {showDetails && (
              <button
                onClick={saveSelection}
                className="rounded-lg border border-gold-500/30 bg-gold-500/10 px-3 py-1.5 text-xs font-medium text-gold-300 transition hover:bg-gold-500/15"
              >
                Kaydet
              </button>
            )}
            <button
              onClick={acceptAll}
              className="rounded-lg bg-gradient-to-r from-gold-500 to-gold-600 px-3 py-1.5 text-xs font-semibold text-dark-950 transition hover:from-gold-400 hover:to-gold-500"
            >
              Tümünü kabul et
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
      className={`flex items-center gap-2 rounded-lg border border-white/5 bg-black/20 px-2.5 py-1.5 ${
        disabled ? 'opacity-80' : 'cursor-pointer hover:bg-black/30'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="h-3.5 w-3.5 cursor-pointer accent-gold-500 disabled:cursor-not-allowed"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="text-xs font-medium text-white">{title}</span>
          <span className="text-[10px] text-gray-500">— {description}</span>
        </div>
      </div>
    </label>
  )
}
