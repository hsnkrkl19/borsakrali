import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { mapSignalToLabel } from '../utils/signalLabels'

/**
 * Parça 2 — Sade sinyal satırı
 *
 * Üstte: emoji + sembol (bold) + " — " + etiket (renkli, bold)
 * Altında: tek cümle açıklama
 * [Detay ↓] tıklanırsa accordion: advancedData içindeki ham sayılar gösterilir.
 *
 * Tüm Tarayıcılar / GunlukTespitler / Sinyaller sayfaları bu satırı kullanır.
 */
export default function SignalRow({
  symbol,
  direction,
  score = 0,
  sentence,           // Backend cümle gönderirse onu kullan, yoksa mapping'den
  changePercent,      // Günlük yüzde değişim (opsiyonel)
  price,              // Fiyat (opsiyonel — başlığın altına TL olarak yazılır)
  advancedData,       // { rsi, macd, ema, atr, hacim, ... } — Detay expand içeriği
  onClick,            // Satıra tıklanma (opsiyonel — modal aç vs.)
  rightSlot,          // Sağ tarafa özel içerik (örn. sembol logosu, mini sparkline)
}) {
  const [expanded, setExpanded] = useState(false)
  const meta = mapSignalToLabel(direction, score)
  const text = sentence || meta.sentence

  const hasAdvanced = advancedData && Object.keys(advancedData).length > 0
  const changeStr = changePercent != null
    ? `${changePercent >= 0 ? '+' : ''}${Number(changePercent).toFixed(2)}%`
    : null
  const priceStr = price != null
    ? `${Number(price).toLocaleString('tr-TR', { maximumFractionDigits: 4 })} TL`
    : null

  return (
    <div
      className="rounded-xl border transition-colors"
      style={{
        background: 'var(--bg-card)',
        borderColor: 'var(--border-main)',
      }}
    >
      <button
        type="button"
        onClick={onClick || (() => hasAdvanced && setExpanded(v => !v))}
        className="w-full text-left p-3 sm:p-4 flex items-start gap-3"
      >
        {/* Sol: emoji */}
        <span className="text-2xl leading-none flex-shrink-0 mt-0.5" aria-hidden="true">
          {meta.emoji}
        </span>

        {/* Orta: sembol + etiket + cümle */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span
              className="font-bold text-[15px] sm:text-base tracking-tight"
              style={{ color: 'var(--text-primary)' }}
            >
              {symbol}
            </span>
            <span
              className="text-[10px] sm:text-[11px]"
              style={{ color: 'var(--text-faint)' }}
            >
              ──
            </span>
            <span
              className="font-bold text-[13px] sm:text-[14px] uppercase tracking-wider"
              style={{ color: meta.cssVar }}
            >
              {meta.label}
            </span>
            {changeStr && (
              <span
                className="ml-auto text-[12px] font-bold num-tabular"
                style={{ color: Number(changePercent) >= 0 ? 'var(--jade)' : 'var(--ember)' }}
              >
                {changeStr}
              </span>
            )}
          </div>
          <p
            className="text-[12.5px] sm:text-[13px] mt-1 leading-snug"
            style={{ color: 'var(--text-secondary)' }}
          >
            {text}
          </p>
          {priceStr && (
            <p
              className="text-[11px] mt-0.5 num-tabular"
              style={{ color: 'var(--text-faint)' }}
            >
              {priceStr}
            </p>
          )}
        </div>

        {/* Sağ: opsiyonel slot + detay toggle */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {rightSlot}
          {hasAdvanced && (
            <span
              className="inline-flex items-center gap-0.5 text-[11px] font-semibold rounded-md px-2 py-1"
              style={{
                color: 'var(--gold-400)',
                background: 'rgba(212, 175, 55, 0.08)',
              }}
            >
              Detay {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </span>
          )}
        </div>
      </button>

      {/* Genişleyen detay (advancedData) — gelişmiş kullanıcı için ham sayılar */}
      {expanded && hasAdvanced && (
        <div
          className="px-3 sm:px-4 pb-3 pt-1 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11.5px]"
          style={{ borderTop: '1px solid var(--border-main)' }}
        >
          {Object.entries(advancedData).map(([k, v]) => {
            if (v == null || v === '') return null
            const display = typeof v === 'number' ? v.toLocaleString('tr-TR', { maximumFractionDigits: 4 }) : String(v)
            return (
              <div key={k} className="flex flex-col">
                <span
                  className="uppercase tracking-wider text-[9px]"
                  style={{ color: 'var(--text-faint)' }}
                >
                  {k}
                </span>
                <span
                  className="font-semibold num-tabular"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {display}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Boş state — Parça 2 spec'i.
 * Tüm sinyal listeleri veri yoksa bu cümleyi gösterir.
 */
export function SignalRowEmpty({ message, ctaHref = '/hesabim?tab=ayarlar' }) {
  return (
    <div
      className="rounded-xl border p-6 text-center space-y-2"
      style={{
        background: 'var(--bg-card)',
        borderColor: 'var(--border-main)',
      }}
    >
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        {message || 'Henüz güçlü fırsat bulunamadı.'}
      </p>
      <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
        Yeni fırsat çıktığında burada göreceksin.
      </p>
      <a
        href={ctaHref}
        className="inline-flex items-center gap-1 text-[12px] font-semibold mt-2"
        style={{ color: 'var(--gold-400)' }}
      >
        Bildirim aç →
      </a>
    </div>
  )
}
