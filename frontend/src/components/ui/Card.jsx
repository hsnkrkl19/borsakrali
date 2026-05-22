import clsx from 'clsx'

/**
 * Card — design-system surface.
 *
 *   <Card>…</Card>
 *   <Card tone="jade" accent interactive onClick={…}>…</Card>
 *
 * tone:        neutral | gold | jade | ember
 * padding:     none | sm | md | lg
 * interactive: adds hover-lift + pointer cursor
 * accent:      colored top hairline (requires a non-neutral tone)
 */
const PADDING = {
  none: '',
  sm: 'p-3',
  md: 'p-4 sm:p-5',
  lg: 'p-5 sm:p-6',
}

export default function Card({
  as: Tag = 'div',
  tone = 'neutral',
  padding = 'md',
  interactive = false,
  accent = false,
  className,
  children,
  ...rest
}) {
  return (
    <Tag
      className={clsx(
        'bk-card',
        tone !== 'neutral' && `bk-card--${tone}`,
        interactive && 'bk-card--interactive',
        PADDING[padding] ?? PADDING.md,
        className,
      )}
      {...rest}
    >
      {accent && tone !== 'neutral' && (
        <span className={`bk-card__accent bk-card__accent--${tone}`} aria-hidden="true" />
      )}
      {children}
    </Tag>
  )
}
