/**
 * MTF sinyal görünümleri için ortak biçimlendirme yardımcıları.
 * Önceden MTFSinyalleri.jsx içinde inline duruyordu; alt-bileşenler
 * ayrı dosyalara taşındıkça paylaşılır hale geldi.
 */

export function formatUsd(value) {
  if (value == null) return '—'
  const v = Number(value)
  if (!isFinite(v)) return '—'
  if (v >= 1000) return `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
  if (v >= 10) return `$${v.toFixed(3)}`
  if (v >= 1) return `$${v.toFixed(4)}`
  if (v >= 0.01) return `$${v.toFixed(5)}`
  return `$${v.toFixed(8)}`
}

export function formatPct(value, digits = 2) {
  if (value == null) return '—'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}%`
}

// 7 timeframe + tier (top-N coin sayısı) + renk eşlemesi.
export const TF_LIST = [
  { key: '1m',  label: '1 dk',     tier: 10, color: 'rose' },
  { key: '5m',  label: '5 dk',     tier: 10, color: 'rose' },
  { key: '15m', label: '15 dk',    tier: 10, color: 'rose' },
  { key: '1h',  label: '1 saat',   tier: 20, color: 'amber' },
  { key: '4h',  label: '4 saat',   tier: 20, color: 'amber' },
  { key: '1d',  label: 'Günlük',   tier: 30, color: 'emerald' },
  { key: '1w',  label: 'Haftalık', tier: 30, color: 'sky' },
]
