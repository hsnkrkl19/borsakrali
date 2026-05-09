import { useState } from 'react'
import { Megaphone } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import QuickBroadcastModal from './QuickBroadcastModal'

const ADMIN_EMAILS = ['hsnkrkl19@gmail.com']

/**
 * Admin için sürekli erişilebilir kayan bildirim butonu.
 *  - Yalnızca admin (rol veya hardcoded email) görür.
 *  - Sayfa neresi olursa olsun ekranda durur, tıklanınca QuickBroadcastModal açar.
 *  - Theme toggle'la çakışmasın diye sol-alt köşede konumlandırıldı.
 */
export default function AdminBroadcastFAB() {
  const user = useAuthStore((s) => s.user)
  const [open, setOpen] = useState(false)

  const isAdmin = user?.role === 'admin'
    || (user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase()))

  if (!isAdmin) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Bildirim Gönder (Admin)"
        aria-label="Bildirim Gönder"
        className="fixed z-[60] flex items-center gap-2 px-3 py-2 rounded-full select-none transition-all hover:scale-[1.04] active:scale-95"
        style={{
          left: 16,
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
          background: 'linear-gradient(135deg, var(--gold-300), var(--gold-500))',
          color: '#1a1208',
          border: '1px solid rgba(255, 255, 255, 0.25)',
          boxShadow: '0 8px 24px rgba(212, 175, 55, 0.40), inset 0 1px 0 rgba(255,255,255,0.45)',
        }}
      >
        <Megaphone className="w-4 h-4" strokeWidth={2.4} />
        <span className="text-[12px] font-bold uppercase tracking-wider hidden sm:inline">Bildirim Gönder</span>
      </button>

      <QuickBroadcastModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
