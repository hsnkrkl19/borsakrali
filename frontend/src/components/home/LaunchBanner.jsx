import { Link } from 'react-router-dom'
import { Wallet, Send, Smartphone, ArrowRight } from 'lucide-react'
import { TELEGRAM_URL, PLAY_URL, FOREX_PATH } from '../../config/links'

/**
 * LaunchBanner — anasayfa üstünde her zaman görünür "Yayında" şeridi.
 * Forex/Parite sekmesine kısa yol + Google Play + Telegram bağlantıları.
 * (Interstitial değil; inline → AdSense uyumlu, misafire de görünür.)
 */
export default function LaunchBanner() {
  return (
    <section
      className="relative overflow-hidden rounded-2xl border p-4 sm:p-5"
      style={{
        background: 'radial-gradient(700px 200px at 0% 0%, rgba(16,185,129,0.16), transparent 60%), var(--bg-card)',
        borderColor: 'var(--border-gold)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
        style={{ background: 'linear-gradient(90deg, transparent, var(--gold-400), transparent)' }} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider mb-2"
            style={{ background: 'rgba(16,185,129,0.12)', color: 'var(--gold-400)', border: '1px solid var(--border-gold)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Yayında
          </div>
          <h3 className="font-bold text-base sm:text-lg leading-tight" style={{ color: 'var(--text-primary)' }}>
            📈 Forex / Parite sinyalleri yayında — MetaTrader5'e hazır
          </h3>
          <p className="text-xs sm:text-[13px] mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            8 enstrüman × 5 zaman dilimi · güven notu + giriş/SL/TP. Telegram kanalında anlık bildirim, mobil uygulamada görüntüle.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          <Link to={FOREX_PATH}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl font-semibold text-[13px] transition-transform hover:scale-[1.03]"
            style={{ background: 'var(--grad-gold-rich)', color: '#fff', boxShadow: 'var(--glow-gold)' }}>
            <Wallet className="w-4 h-4" /> Forex Sinyalleri <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <a href={PLAY_URL} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl font-semibold text-[13px] border transition-colors"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', borderColor: 'var(--border-subtle)' }}>
            <Smartphone className="w-4 h-4" /> Google Play
          </a>
          <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl font-semibold text-[13px] border transition-colors"
            style={{ background: 'rgba(34,158,217,0.12)', color: '#229ed9', borderColor: 'rgba(34,158,217,0.35)' }}>
            <Send className="w-4 h-4" /> Telegram
          </a>
        </div>
      </div>
    </section>
  )
}
