import clsx from 'clsx'

/**
 * PageHeader — consistent title block for every page.
 *
 *   <PageHeader
 *     icon={Activity}
 *     eyebrow="Canlı"
 *     title="Sinyaller"
 *     description="BIST + Kripto komuta merkezi"
 *     actions={<Button …/>}
 *   />
 */
export default function PageHeader({ icon: Icon, eyebrow, title, description, actions, className }) {
  return (
    <div className={clsx('flex flex-wrap items-start justify-between gap-x-4 gap-y-3', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span
            className="flex flex-shrink-0 items-center justify-center rounded-xl"
            style={{
              width: 44,
              height: 44,
              background: 'rgba(16, 185, 129, 0.10)',
              border: '1px solid var(--border-gold)',
            }}
          >
            <Icon size={22} strokeWidth={2} style={{ color: 'var(--gold-400)' }} aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <div
              className="mb-0.5 text-[11px] font-bold uppercase tracking-[0.14em]"
              style={{ color: 'var(--gold-400)' }}
            >
              {eyebrow}
            </div>
          )}
          <h1
            className="text-xl font-bold leading-tight tracking-tight sm:text-2xl"
            style={{ color: 'var(--text-primary)' }}
          >
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-[13.5px]" style={{ color: 'var(--text-secondary)' }}>
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
