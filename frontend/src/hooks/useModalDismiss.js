import { useEffect } from 'react'

/**
 * Modal'lar için ortak dismiss davranışı.
 *
 * - ESC tuşuyla kapatır
 * - Açıkken document body scroll'unu kilitler
 * - Cleanup ile her ikisini de geri alır
 *
 * Kullanım:
 *   useModalDismiss(onClose)            // her zaman aktif
 *   useModalDismiss(onClose, { open })  // open=true iken aktif (kontrollü modal'lar için)
 */
export default function useModalDismiss(onClose, { open = true, lockScroll = true } = {}) {
  useEffect(() => {
    if (!open || typeof onClose !== 'function') return

    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)

    let prevOverflow
    if (lockScroll && typeof document !== 'undefined') {
      prevOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', onKey)
      if (lockScroll && typeof document !== 'undefined') {
        document.body.style.overflow = prevOverflow || ''
      }
    }
  }, [open, onClose, lockScroll])
}
