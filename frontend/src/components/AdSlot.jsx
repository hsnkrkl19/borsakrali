import { useEffect, useRef, useState } from 'react'
import { ADSENSE_CLIENT, AD_SLOTS, ADS_ENABLED, adsRuntimeDisabled } from '../config/adsConfig'
import { hasMarketingConsent } from './CookieConsent'

/**
 * Tek bir AdSense reklam birimini renderlar.
 *
 * Kullanim:
 *   <AdSlot placement="desktopTop" />
 *   <AdSlot placement="mobileBottom" format="auto" />
 *
 * Render olmama kosullari (sessizce null doner):
 *   - ADS_ENABLED = false
 *   - localStorage'da bk-ads-disabled = '1'
 *   - Kullanici reklam cerez iznini reddetmis
 *   - Slot ID henuz konfigure edilmemis (bos string)
 *
 * Boylece AdSense onayi gelmeden once Layout'a slot'lari koyabiliriz —
 * ID'ler dolduruldugu anda reklamlar otomatik gorunmeye baslar.
 */
export default function AdSlot({
  placement,
  format = 'auto',
  fullWidthResponsive = true,
  className = '',
  style,
  layoutKey,
}) {
  const slot = AD_SLOTS[placement]
  const insRef = useRef(null)
  const pushed = useRef(false)
  const [consented, setConsented] = useState(() => hasMarketingConsent())

  useEffect(() => {
    const handler = () => setConsented(hasMarketingConsent())
    window.addEventListener('bk-cookie-consent-change', handler)
    return () => window.removeEventListener('bk-cookie-consent-change', handler)
  }, [])

  useEffect(() => {
    if (!slot || !ADS_ENABLED || adsRuntimeDisabled() || !consented) return
    if (pushed.current) return
    if (typeof window === 'undefined') return

    try {
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
      pushed.current = true
    } catch (err) {
      // AdSense script henuz yuklenmemis olabilir; sessizce gec
    }
  }, [slot, consented])

  if (!ADS_ENABLED || adsRuntimeDisabled()) return null
  if (!slot) return null
  if (!consented) return null

  return (
    <div className={className} style={style} aria-label="Reklam alani">
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: 'block', ...(style || {}) }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive={fullWidthResponsive ? 'true' : 'false'}
        {...(layoutKey ? { 'data-ad-layout-key': layoutKey } : {})}
      />
    </div>
  )
}
