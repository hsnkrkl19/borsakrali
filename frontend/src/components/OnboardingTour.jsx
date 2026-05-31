/**
 * Parça 4 — Onboarding turu.
 *
 * 5 adımlı overlay. Her adımda:
 *  - data-tour="<id>" attribute'lu elementi bul
 *  - O elementin etrafını spotlight ile aydınlat
 *  - Yanına/altına popover kart yerleştir
 *  - Klavye: ESC = Geç, → / Enter = İleri, ← = Geri
 *
 * Adımlar (data-tour ID'leri Sidebar/MobileBottomNav/Dashboard'a eklenmiş olmalı):
 *   1. dashboard-card     — Dashboard ilk büyük karar kartı
 *   2. nav-firsatlar      — sidebar/mobile-nav "Fırsatlar" linki
 *   3. nav-sinyaller      — "Canlı Sinyaller" linki
 *   4. nav-botlar         — "Botlar" linki
 *   5. nav-ogren          — "Öğren" linki
 */

import { useEffect, useLayoutEffect, useState } from 'react'
import { useOnboardingStore } from '../store/onboardingStore'

const STEPS = [
  {
    id: 1,
    target: 'dashboard-card',
    title: 'Bugünün güçlü hissesi burada',
    body: 'Sistem her gün senin için en güçlü fırsatı seçer. Ana ekranda 3 büyük kart görürsün — AL, RİSKLİ, TAKİP.',
  },
  {
    id: 2,
    target: 'nav-firsatlar',
    title: 'Tüm fırsatlar burada',
    body: 'Sistem güçlü hisseleri AL, BEKLE, RİSKLİ olarak ayırır. Buradan tam listeye göz at.',
  },
  {
    id: 3,
    target: 'nav-sinyaller',
    title: 'Şu an hareket edenler',
    body: 'Canlı sinyaller şu an piyasada ne hareket ediyor onu söyler. Bildirim açarsan hareket başlayınca seni uyarır.',
  },
  {
    id: 4,
    target: 'nav-botlar',
    title: 'Bot senin yerine fırsat arar',
    body: 'İstersen sadece izle, istersen otomatik işlem yapsın. Riski sen seçersin.',
  },
  {
    id: 5,
    target: 'nav-ogren',
    title: 'Bir şeyi anlamadın mı?',
    body: 'Buradan tek cümlede açıklama bulursun. AL ne demek? Risk nedir? Hepsi kısa kart formatında.',
  },
]

const PADDING = 8       // spotlight elementi ne kadar genişletilsin
const POPOVER_GAP = 12  // popover ile element arası mesafe

function getTargetRect(targetId) {
  if (typeof document === 'undefined') return null
  const el = document.querySelector(`[data-tour="${targetId}"]`)
  if (!el) return null
  const rect = el.getBoundingClientRect()
  // Görünür alandaki konumu ver (scroll dahil değil — fixed overlay ile aynı koordinat sistemi)
  return {
    top: rect.top - PADDING,
    left: rect.left - PADDING,
    width: rect.width + PADDING * 2,
    height: rect.height + PADDING * 2,
  }
}

// Popover'ı, elementin altında veya üstünde, ekrana sığacak şekilde yerleştir
function getPopoverStyle(rect, vw, vh) {
  if (!rect) {
    // Element bulunamadıysa ekranın ortasında merkezle
    return {
      top: vh / 2 - 120,
      left: vw / 2 - 180,
      width: 360,
    }
  }
  const popW = Math.min(360, vw - 32)
  // Önce alta dene
  const spaceBelow = vh - (rect.top + rect.height)
  const placeBelow = spaceBelow > 200 || spaceBelow > rect.top
  const top = placeBelow
    ? rect.top + rect.height + POPOVER_GAP
    : Math.max(16, rect.top - 200 - POPOVER_GAP)
  let left = rect.left + rect.width / 2 - popW / 2
  left = Math.max(16, Math.min(left, vw - popW - 16))
  return { top, left, width: popW }
}

export default function OnboardingTour() {
  const step = useOnboardingStore((s) => s.step)
  const completed = useOnboardingStore((s) => s.completed)
  const next = useOnboardingStore((s) => s.next)
  const prev = useOnboardingStore((s) => s.prev)
  const skip = useOnboardingStore((s) => s.skip)

  const [rect, setRect] = useState(null)
  const [viewport, setViewport] = useState({ vw: 0, vh: 0 })

  const stepDef = STEPS[step - 1] || STEPS[0]
  const visible = !completed

  // Klavye kısayolları
  useEffect(() => {
    if (!visible) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        skip()
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault()
        next()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        prev()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, next, prev, skip])

  // Hedef elementin geometrisini takip et (resize / scroll)
  useLayoutEffect(() => {
    if (!visible) return
    let raf = null
    const recompute = () => {
      setRect(getTargetRect(stepDef.target))
      setViewport({ vw: window.innerWidth, vh: window.innerHeight })
    }
    // Element DOM'a girene kadar bir-kaç frame bekle
    let tries = 0
    const tick = () => {
      recompute()
      tries += 1
      if (!getTargetRect(stepDef.target) && tries < 30) {
        raf = requestAnimationFrame(tick)
      }
    }
    tick()
    const onResize = () => recompute()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [visible, stepDef.target])

  if (!visible) return null

  const isLast = step >= STEPS.length
  const popoverStyle = getPopoverStyle(rect, viewport.vw || 1024, viewport.vh || 768)

  // Spotlight clip-path için 4 dikdörtgen overlay parçası (üst/alt/sol/sağ)
  const spotlight = rect && {
    top: { top: 0, left: 0, right: 0, height: Math.max(0, rect.top) },
    bottom: { top: rect.top + rect.height, left: 0, right: 0, bottom: 0 },
    left: { top: rect.top, left: 0, width: Math.max(0, rect.left), height: rect.height },
    right: { top: rect.top, left: rect.left + rect.width, right: 0, height: rect.height },
    ring: rect,
  }

  return (
    <div
      role="dialog"
      aria-label="Tanıtım turu"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        pointerEvents: 'none',
      }}
    >
      {/* Overlay parçaları — element haricini karart */}
      {spotlight ? (
        <>
          <div style={{ position: 'fixed', background: 'rgba(0,0,0,0.65)', pointerEvents: 'auto', ...spotlight.top }} onClick={skip} />
          <div style={{ position: 'fixed', background: 'rgba(0,0,0,0.65)', pointerEvents: 'auto', ...spotlight.bottom }} onClick={skip} />
          <div style={{ position: 'fixed', background: 'rgba(0,0,0,0.65)', pointerEvents: 'auto', ...spotlight.left }} onClick={skip} />
          <div style={{ position: 'fixed', background: 'rgba(0,0,0,0.65)', pointerEvents: 'auto', ...spotlight.right }} onClick={skip} />
          {/* Spotlight ring */}
          <div
            style={{
              position: 'fixed',
              top: spotlight.ring.top,
              left: spotlight.ring.left,
              width: spotlight.ring.width,
              height: spotlight.ring.height,
              border: '2px solid rgba(16, 185, 129, 0.85)',
              borderRadius: 14,
              boxShadow: '0 0 0 6px rgba(16, 185, 129, 0.25)',
              pointerEvents: 'none',
              transition: 'all 200ms ease',
            }}
          />
        </>
      ) : (
        // Hedef element bulunamazsa tam ekran karart
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', pointerEvents: 'auto' }} onClick={skip} />
      )}

      {/* Popover kart */}
      <div
        style={{
          position: 'fixed',
          top: popoverStyle.top,
          left: popoverStyle.left,
          width: popoverStyle.width,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-gold)',
          borderRadius: 16,
          padding: 16,
          boxShadow: '0 12px 36px rgba(0,0,0,0.45)',
          pointerEvents: 'auto',
          zIndex: 91,
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <span
            className="text-[11px] uppercase tracking-wider font-semibold"
            style={{ color: 'var(--gold-400)' }}
          >
            Tur · Adım {step}/{STEPS.length}
          </span>
          <button
            type="button"
            onClick={skip}
            className="text-[12px] font-semibold"
            style={{ color: 'var(--text-faint)' }}
          >
            Geç
          </button>
        </div>

        <h3
          className="text-base sm:text-lg font-bold mb-1.5"
          style={{ color: 'var(--text-primary)' }}
        >
          {stepDef.title}
        </h3>
        <p
          className="text-[13.5px] leading-relaxed mb-4"
          style={{ color: 'var(--text-secondary)' }}
        >
          {stepDef.body}
        </p>

        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1">
            {STEPS.map((s) => (
              <span
                key={s.id}
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: s.id === step ? 'var(--gold-400)' : 'var(--text-faint)',
                  opacity: s.id === step ? 1 : 0.4,
                }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {step > 1 && (
              <button
                type="button"
                onClick={prev}
                className="text-[12.5px] font-semibold px-3 py-1.5 rounded-lg"
                style={{
                  background: 'var(--bg-base)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-main)',
                }}
              >
                Geri
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="text-[12.5px] font-semibold px-3 py-1.5 rounded-lg"
              style={{
                background: 'var(--gold-400)',
                color: 'var(--bg-canvas)',
                border: '1px solid var(--gold-400)',
              }}
            >
              {isLast ? 'Bitir' : 'İleri →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
