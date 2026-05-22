import clsx from 'clsx'

/**
 * Spinner — design-system loading indicator.
 *
 *   <Spinner />
 *   <Spinner size={28} />
 */
export default function Spinner({ size = 18, className, label = 'Yükleniyor', style }) {
  const border = Math.max(2, Math.round(size / 9))
  return (
    <span
      role="status"
      aria-label={label}
      className={clsx('inline-block animate-spin rounded-full align-[-0.15em]', className)}
      style={{
        width: size,
        height: size,
        borderWidth: border,
        borderStyle: 'solid',
        borderColor: 'var(--border-strong)',
        borderTopColor: 'var(--gold-400)',
        ...style,
      }}
    />
  )
}
