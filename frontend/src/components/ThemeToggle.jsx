import { useEffect, useRef, useState } from 'react'
import { Sun, Moon } from 'lucide-react'
import { applyTheme, getStoredTheme } from '../utils/theme'

/* ─────────────────────────────────────────────────────────────────────
   Sürüklenebilir pozisyon (floating varyantı için)
   ─────────────────────────────────────────────────────────────────────
   localStorage'da:
     bk-theme-toggle-pos = JSON.stringify({ side: 'left'|'right', yRatio })
   yRatio: 0..1 arası, viewport yüksekliğine göre normalize. Resize'da
   aynı görece konumda kalsın diye oran olarak saklıyoruz.
   ───────────────────────────────────────────────────────────────────── */

const POS_KEY = 'bk-theme-toggle-pos'
const EDGE_GAP = 16          // kenardan içeri boşluk (px)
const VERT_MARGIN = 12       // üst/alt güvenli alan (px)
const DRAG_THRESHOLD = 6     // bu mesafeden sonra sürüklemeye geçer (px)

function readStoredPos() {
  if (typeof window === 'undefined') return { side: 'right', yRatio: 0.04 }
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (!raw) return { side: 'right', yRatio: 0.04 }
    const p = JSON.parse(raw)
    return {
      side: p.side === 'left' ? 'left' : 'right',
      yRatio: typeof p.yRatio === 'number' ? clamp01(p.yRatio) : 0.04,
    }
  } catch {
    return { side: 'right', yRatio: 0.04 }
  }
}

function clamp01(n) {
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

/**
 * Sun / Moon theme toggle.
 *
 * - Reads the current theme from localStorage on mount and listens to the
 *   `bk-theme-change` window event so it stays in sync if another component
 *   (e.g. the Settings page) flips the theme.
 * - Accessible: `aria-pressed` reflects the active mode, label is localized.
 *
 * Variants:
 *   • "floating"  — top-right fixed pill, perfect for auth pages.
 *   • "inline"    — block-level button you place inside an existing toolbar.
 *   • "compact"   — circular icon button for the header / mobile nav.
 */
export default function ThemeToggle({ variant = 'inline', className = '' }) {
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark'
    return getStoredTheme()
  })

  useEffect(() => {
    const onChange = (event) => {
      const next = event?.detail?.theme
      if (next === 'light' || next === 'dark') setTheme(next)
    }
    window.addEventListener('bk-theme-change', onChange)
    return () => window.removeEventListener('bk-theme-change', onChange)
  }, [])

  // toggle() — tema değiştirir ve Ripple efekti için tıklama pozisyonunu
  // bir kez 'bk-theme-ripple-origin' window prop'una yazar (ThemeRipple okur).
  const toggle = (e) => {
    const next = theme === 'dark' ? 'light' : 'dark'
    // Tıklama pozisyonunu yakala — overlay buradan yayılır
    const x = (e && (e.clientX ?? e.pageX)) ?? null
    const y = (e && (e.clientY ?? e.pageY)) ?? null
    if (x != null && y != null) {
      window.__bkThemeRippleOrigin = { x, y }
    }
    setTheme(applyTheme(next))
  }

  const isDark = theme === 'dark'
  const Icon = isDark ? Sun : Moon
  const label = isDark ? 'Aydınlık moda geç' : 'Karanlık moda geç'

  if (variant === 'floating') {
    return (
      <FloatingToggle
        theme={theme}
        isDark={isDark}
        label={label}
        onToggle={toggle}
        className={className}
      />
    )
  }

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={!isDark}
        aria-label={label}
        title={label}
        className={
          'flex h-9 w-9 items-center justify-center rounded-full transition-all ' +
          'hover:scale-[1.06] active:scale-95 ' + className
        }
        style={{
          background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.05)',
          border: isDark
            ? '1px solid rgba(212,175,55,0.30)'
            : '1px solid rgba(15,23,42,0.15)',
          color: isDark ? '#fde68a' : '#0f172a',
        }}
      >
        <Icon className="h-4 w-4" strokeWidth={2.2} />
      </button>
    )
  }

  // inline (default)
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={!isDark}
      aria-label={label}
      title={label}
      className={
        'inline-flex items-center gap-2 rounded-xl px-3 py-2 transition-all ' +
        'hover:scale-[1.03] active:scale-95 ' + className
      }
      style={{
        background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.05)',
        border: isDark
          ? '1px solid rgba(212,175,55,0.30)'
          : '1px solid rgba(15,23,42,0.15)',
        color: isDark ? '#fde68a' : '#0f172a',
      }}
    >
      <Icon className="h-4 w-4" strokeWidth={2.2} />
      <span className="text-xs font-semibold">
        {isDark ? 'Aydınlık' : 'Karanlık'}
      </span>
    </button>
  )
}

/* ─────────────────────────────────────────────────────────────────────
   FloatingToggle — sürüklenebilir + kenara yapışan tema düğmesi.

   Davranış:
   • Pointer indiğinde pozisyon bayrak olarak işaretlenir.
   • Pointer DRAG_THRESHOLD (6px) aştığında "drag" moduna geçer; düğme
     parmak/imleci takip eder. Eşiğin altında kalırsa "click" sayılır
     ve tema toggle olur.
   • Pointer kaldırıldığında: yatay olarak en yakın kenara (sol/sağ)
     snap'lenir, dikey pozisyon olduğu yerde bırakılır (üst/alt güvenli
     marjlar arasında clamp). Sonuç localStorage'a yRatio olarak yazılır
     ki resize'lerde aynı görece konumda kalsın.
   • Konum global state'le birden çok floating toggle arasında senkron
     değil — bu sayfada zaten tek tane kullanılıyor.
   ───────────────────────────────────────────────────────────────────── */

function FloatingToggle({ theme, isDark, label, onToggle, className }) {
  const [pos, setPos] = useState(() => readStoredPos())
  const [dragging, setDragging] = useState(false)

  // Drag state'i ref'lerde tutuyoruz ki render tetiklemesin.
  const ref = useRef(null)
  const dragStateRef = useRef({
    active: false,
    moved: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    // Dragging sırasında düğmenin sol-üst köşesinin viewport'a göre konumu (px)
    liveX: 0,
    liveY: 0,
  })

  // Sürükleme sırasında inline px konumunu takip ediyoruz; idle/snap'ten
  // sonra pos.side + pos.yRatio'ya göre hesaplanan değere geri dönüyor.
  const [livePos, setLivePos] = useState(null)

  useEffect(() => {
    const onMove = (e) => {
      const st = dragStateRef.current
      if (!st.active) return
      if (st.pointerId !== e.pointerId) return

      const dx = e.clientX - st.startX
      const dy = e.clientY - st.startY
      if (!st.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      st.moved = true
      setDragging(true)

      const el = ref.current
      const w = el?.offsetWidth || 48
      const h = el?.offsetHeight || 48
      const vw = window.innerWidth
      const vh = window.innerHeight

      const x = clamp(st.liveX + dx, EDGE_GAP, vw - w - EDGE_GAP)
      const y = clamp(st.liveY + dy, VERT_MARGIN, vh - h - VERT_MARGIN)
      setLivePos({ x, y })
    }

    const onUp = (e) => {
      const st = dragStateRef.current
      if (!st.active) return
      if (st.pointerId !== e.pointerId) return

      st.active = false
      const wasDrag = st.moved
      st.moved = false
      st.pointerId = null
      setDragging(false)

      if (!wasDrag) {
        // Tıklama → toggle
        setLivePos(null)
        onToggle()
        return
      }

      // Snap: yatay olarak en yakın kenar; dikey: bırakıldığı yer
      const el = ref.current
      const w = el?.offsetWidth || 48
      const h = el?.offsetHeight || 48
      const vw = window.innerWidth
      const vh = window.innerHeight
      const last = livePos || { x: st.liveX, y: st.liveY }

      const center = last.x + w / 2
      const side = center < vw / 2 ? 'left' : 'right'
      const yClamped = clamp(last.y, VERT_MARGIN, vh - h - VERT_MARGIN)
      const yRatio = clamp01(yClamped / Math.max(1, vh - h))

      const next = { side, yRatio }
      try { localStorage.setItem(POS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      setPos(next)
      setLivePos(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [livePos, onToggle])

  const onPointerDown = (e) => {
    // Sadece sol tıklama / dokunma
    if (e.button !== undefined && e.button !== 0) return
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    dragStateRef.current = {
      active: true,
      moved: false,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      liveX: rect.left,
      liveY: rect.top,
    }
    // pointer capture: parmağı düğmeden dışarı kaydırınca da yakalansın
    try { el.setPointerCapture?.(e.pointerId) } catch { /* ignore */ }
  }

  // Hesaplanan konum
  const positionStyle = (() => {
    if (livePos) {
      return { left: `${livePos.x}px`, top: `${livePos.y}px`, right: 'auto', bottom: 'auto' }
    }
    const vh = (typeof window !== 'undefined') ? window.innerHeight : 800
    const top = clamp(pos.yRatio * vh, VERT_MARGIN, vh - 48 - VERT_MARGIN)
    return pos.side === 'left'
      ? { left: `${EDGE_GAP}px`, top: `${top}px`, right: 'auto', bottom: 'auto' }
      : { right: `${EDGE_GAP}px`, top: `${top}px`, left: 'auto', bottom: 'auto' }
  })()

  return (
    <button
      ref={ref}
      type="button"
      onPointerDown={onPointerDown}
      aria-pressed={!isDark}
      aria-label={label}
      title={dragging ? 'Sürükle…' : label}
      className={
        'fixed z-50 flex items-center gap-2 px-3 py-2 rounded-full select-none ' +
        'backdrop-blur-md shadow-lg ' +
        (dragging
          ? 'cursor-grabbing scale-[1.06] '
          : 'cursor-grab transition-all hover:scale-[1.04] active:scale-95 ') +
        (className || '')
      }
      style={{
        ...positionStyle,
        background: isDark
          ? 'linear-gradient(135deg, rgba(212,175,55,0.18), rgba(255,255,255,0.04))'
          : 'linear-gradient(135deg, rgba(15,23,42,0.06), rgba(15,23,42,0.02))',
        border: isDark
          ? '1px solid rgba(212,175,55,0.35)'
          : '1px solid rgba(15,23,42,0.18)',
        color: isDark ? '#fde68a' : '#0f172a',
        touchAction: 'none', // mobil: dikey scroll yerine drag yakala
        boxShadow: dragging
          ? '0 8px 28px rgba(0,0,0,0.35)'
          : (isDark ? '0 4px 14px rgba(0,0,0,0.30)' : '0 4px 14px rgba(15,23,42,0.10)'),
      }}
    >
      <span className="relative flex h-5 w-5 items-center justify-center">
        <Sun
          className={
            'absolute h-5 w-5 transition-all duration-300 ' +
            (isDark ? 'rotate-0 scale-100 opacity-100' : 'rotate-90 scale-50 opacity-0')
          }
          strokeWidth={2.2}
        />
        <Moon
          className={
            'absolute h-5 w-5 transition-all duration-300 ' +
            (isDark ? '-rotate-90 scale-50 opacity-0' : 'rotate-0 scale-100 opacity-100')
          }
          strokeWidth={2.2}
        />
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] hidden sm:inline">
        {isDark ? 'Aydınlık' : 'Karanlık'}
      </span>
    </button>
  )
}
