import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'

/**
 * InfoTooltip — Bilgi baloncuğu
 * position:fixed + portal — ekrana sığacak şekilde akıllı konumlandırma
 */
export default function InfoTooltip({ title, description, formula, source, size = 'sm', className = '' }) {
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState({ top: 0, left: 0, above: true })
  const btnRef = useRef(null)

  const calcPos = useCallback(() => {
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const PADDING = 12
    const tipW = Math.min(288, window.innerWidth - PADDING * 2)
    // Estimated tip height (description + formula)
    const estH = formula ? 180 : description && description.length > 80 ? 140 : 100

    // Horizontal: align to button left, clamp to viewport
    let left = r.left
    if (left + tipW > window.innerWidth - PADDING) left = window.innerWidth - tipW - PADDING
    if (left < PADDING) left = PADDING

    // Vertical: prefer above, fallback below
    const spaceAbove = r.top
    const spaceBelow = window.innerHeight - r.bottom

    let top, above
    if (spaceAbove >= estH + 16 || spaceAbove >= spaceBelow) {
      // Show above
      top = r.top - 8
      above = true
    } else {
      // Show below
      top = r.bottom + 8
      above = false
    }

    setPlacement({ top, left, above, tipW })
  }, [formula, description])

  const toggle = (e) => {
    e.stopPropagation()
    if (!open) calcPos()
    setOpen(v => !v)
  }

  // Dışarı tıklayınca / scroll'da kapat
  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (btnRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const closeOnScroll = () => setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    window.addEventListener('scroll', closeOnScroll, true)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
      window.removeEventListener('scroll', closeOnScroll, true)
    }
  }, [open])

  const iconSize = size === 'lg' ? 'w-4 h-4' : 'w-3 h-3'
  const btnSize = size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'

  const { top, left, above, tipW } = placement

  const tooltip = open && createPortal(
    <div
      style={{
        position: 'fixed',
        top: above ? top : top,
        left,
        transform: above ? 'translateY(-100%)' : 'translateY(0)',
        width: tipW || Math.min(288, window.innerWidth - 24),
        zIndex: 99999,
        maxHeight: '70vh',
        overflowY: 'auto',
      }}
      className="bg-dark-800 border border-dark-600 rounded-xl shadow-2xl text-left"
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Arrow — points toward the button */}
      {above ? (
        // Tooltip is above → arrow at bottom points down
        <div className="absolute top-full left-4 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-dark-600" />
      ) : (
        // Tooltip is below → arrow at top points up
        <div className="absolute bottom-full left-4 w-0 h-0 border-l-[6px] border-r-[6px] border-b-[6px] border-l-transparent border-r-transparent border-b-dark-600" />
      )}

      {title && (
        <div className="px-3 py-2 border-b border-dark-700 flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-gold-400 flex-shrink-0" />
          <span className="text-xs font-bold text-gold-400 uppercase tracking-wide">{title}</span>
        </div>
      )}
      <div className="px-3 py-2.5 space-y-2">
        {description && (
          <p className="text-xs text-gray-300 leading-relaxed">{description}</p>
        )}
        {formula && (
          <div className="mt-2">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Formül / Yöntem</p>
            <div className="bg-dark-900 rounded-lg px-2.5 py-2 border border-dark-700">
              <p className="text-[11px] text-cyan-300 font-mono leading-relaxed whitespace-pre-wrap">{formula}</p>
            </div>
          </div>
        )}
        {source && (
          <p className="text-[10px] text-gray-500 border-t border-dark-700 pt-2 mt-2">
            <span className="text-gray-400">{source}</span>
          </p>
        )}
      </div>
    </div>,
    document.body
  )

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className={`${btnSize} rounded-full bg-dark-700 hover:bg-dark-600 border border-dark-500 hover:border-gold-500/50 flex items-center justify-center text-gray-400 hover:text-gold-400 transition-all flex-shrink-0`}
        title={title}
        aria-label={`${title} hakkında bilgi`}
      >
        <Info className={iconSize} />
      </button>
      {tooltip}
    </span>
  )
}
