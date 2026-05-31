/**
 * Parça 3 — Risk onay modali.
 *
 * Cesur Bot seçildiğinde veya leverage > 1x kullanıcı tarafından açıldığında
 * "ANLADIM" kelimesini yazma onayı ister. Modal bir kez onaylandığında
 * BOT_STATE_KEYS.acknowledged altında kalıcı saklanır.
 */

import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import useModalDismiss from '../hooks/useModalDismiss'

export default function RiskAcknowledgeModal({ open, onClose, onAcknowledge, title, body }) {
  const [text, setText] = useState('')
  useModalDismiss(onClose, { open })
  if (!open) return null

  const matches = text.trim().toUpperCase() === 'ANLADIM'

  const handleConfirm = () => {
    if (!matches) return
    setText('')
    onAcknowledge?.()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-5 sm:p-6 space-y-4"
        style={{ background: 'var(--bg-card)', borderColor: 'rgba(225, 29, 72, 0.45)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(225, 29, 72, 0.15)' }}
            >
              <AlertTriangle className="w-5 h-5" style={{ color: 'var(--ember)' }} />
            </div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              {title || 'Yüksek risk uyarısı'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="p-1.5 rounded-lg"
            style={{ color: 'var(--text-faint)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {body || (
            <>
              Bu seçim büyük kazanç ihtimali olduğu kadar büyük kayıp ihtimali de taşır.
              Sadece kaybetmeyi göze alabileceğin parayı bağla.
            </>
          )}
        </p>

        <div>
          <label
            className="block text-[12px] uppercase tracking-wider mb-1.5"
            style={{ color: 'var(--text-faint)' }}
          >
            Devam etmek için <span className="font-bold" style={{ color: 'var(--ember)' }}>ANLADIM</span> yaz
          </label>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="ANLADIM"
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
            className="w-full rounded-lg px-3 py-2.5 text-sm font-mono tracking-widest text-center"
            style={{
              background: 'rgba(225, 29, 72, 0.05)',
              border: `1px solid ${matches ? 'var(--jade)' : 'var(--border-main)'}`,
              color: 'var(--text-primary)',
            }}
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold"
            style={{
              background: 'var(--bg-base)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-main)',
            }}
          >
            İptal
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!matches}
            className="flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity"
            style={{
              background: matches ? 'rgba(225, 29, 72, 0.18)' : 'var(--bg-base)',
              color: matches ? 'var(--ember)' : 'var(--text-faint)',
              border: `1px solid ${matches ? 'var(--ember)' : 'var(--border-main)'}`,
              opacity: matches ? 1 : 0.6,
              cursor: matches ? 'pointer' : 'not-allowed',
            }}
          >
            Riski kabul ediyorum
          </button>
        </div>
      </div>
    </div>
  )
}
