import { useState } from 'react'
import { useUsageStore } from '../store/usageStore'

/**
 * Özellik kapısı hook'u
 * Kullanım: const { gate, LimitModal } = useFeatureGate()
 * gate() → true: devam et, false: modal açıldı
 */
export function useFeatureGate() {
  const { tryUse, isPremium } = useUsageStore()
  const [showModal, setShowModal] = useState(false)
  const [pendingAction, setPendingAction] = useState(null)

  // Bir işlem yapmadan önce çağır
  // cb: izin verilirse çalışacak fonksiyon (isteğe bağlı)
  const gate = (cb) => {
    if (tryUse()) {
      cb && cb()
      return true
    }
    setPendingAction(() => cb)
    setShowModal(true)
    return false
  }

  // Modal kapatıldığında
  const handleModalClose = (result) => {
    setShowModal(false)
    if (result === true && pendingAction) {
      // Reklam izlendi, işlemi çalıştır
      if (tryUse()) pendingAction()
    }
    setPendingAction(null)
  }

  return { gate, showModal, handleModalClose }
}
