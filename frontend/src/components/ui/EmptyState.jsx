import clsx from 'clsx'

/**
 * EmptyState — consistent "nothing here yet" / error placeholder.
 *
 *   <EmptyState icon={Inbox} title="Liste boş" description="…" />
 *   <EmptyState icon={AlertTriangle} tone="ember" title="Hata" action={<Button …/>} />
 *
 * tone: gold (default) | jade | ember
 */
const TONE = {
  gold: { fg: 'var(--gold-400)', bg: 'rgba(16, 185, 129, 0.10)', bd: 'var(--border-gold)' },
  jade: { fg: 'var(--jade)', bg: 'rgba(16, 185, 129, 0.10)', bd: 'rgba(16, 185, 129, 0.30)' },
  ember: { fg: 'var(--ember)', bg: 'rgba(225, 29, 72, 0.10)', bd: 'rgba(225, 29, 72, 0.30)' },
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = 'gold',
  compact = false,
  className,
}) {
  const t = TONE[tone] || TONE.gold
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14',
        className,
      )}
    >
      {Icon && (
        <span
          className="flex items-center justify-center rounded-2xl"
          style={{
            width: compact ? 44 : 56,
            height: compact ? 44 : 56,
            background: t.bg,
            border: `1px solid ${t.bd}`,
          }}
        >
          <Icon size={compact ? 20 : 26} strokeWidth={1.8} style={{ color: t.fg }} aria-hidden="true" />
        </span>
      )}
      {title && (
        <h3 className="font-semibold" style={{ fontSize: compact ? 14 : 16, color: 'var(--text-primary)' }}>
          {title}
        </h3>
      )}
      {description && (
        <p
          className="max-w-sm"
          style={{ fontSize: compact ? 12.5 : 13.5, lineHeight: 1.55, color: 'var(--text-muted)' }}
        >
          {description}
        </p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
