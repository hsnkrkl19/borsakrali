import clsx from 'clsx'

/**
 * Badge — small status pill.
 *
 *   <Badge tone="jade">AL</Badge>
 *   <Badge tone="ember" dot>RİSKLİ</Badge>
 *   <Badge tone="gold" icon={Crown}>PREMIUM</Badge>
 *
 * tone: gold | jade | ember | azure | neutral
 */
const TONE = {
  gold: 'pill-gold',
  jade: 'pill-jade',
  ember: 'pill-ember',
  azure: 'pill-azure',
  neutral: 'pill-neutral',
}

export default function Badge({ tone = 'gold', dot = false, icon: Icon, className, children, ...rest }) {
  return (
    <span className={clsx('pill', TONE[tone] || TONE.gold, className)} {...rest}>
      {dot && <span className="bk-badge-dot" aria-hidden="true" />}
      {Icon && <Icon size={11} strokeWidth={2.6} aria-hidden="true" />}
      {children}
    </span>
  )
}
