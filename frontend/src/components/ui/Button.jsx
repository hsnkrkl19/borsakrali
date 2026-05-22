import { forwardRef } from 'react'
import clsx from 'clsx'
import Spinner from './Spinner'

/**
 * Button — the single source of truth for buttons across the app.
 *
 *   <Button>Kaydet</Button>
 *   <Button variant="ghost" size="sm" icon={RefreshCw}>Yenile</Button>
 *   <Button variant="outline" iconRight={ChevronRight}>Detay</Button>
 *   <Button as="a" href="…" target="_blank" icon={ExternalLink}>TradingView</Button>
 *   <Button variant="subtle" icon={X} aria-label="Kapat" />   // icon-only
 *
 * variant: gold (primary) | ghost | outline | subtle | danger
 * size:    sm | md | lg
 * as:      'button' (default) | 'a' | Link — polymorphic element
 */
const ICON_SIZE = { sm: 14, md: 16, lg: 18 }

const Button = forwardRef(function Button(
  {
    as: Tag = 'button',
    variant = 'gold',
    size = 'md',
    type,
    icon: Icon,
    iconRight: IconRight,
    loading = false,
    block = false,
    disabled = false,
    className,
    children,
    ...rest
  },
  ref,
) {
  const iconOnly = children == null || children === false
  const px = ICON_SIZE[size] || ICON_SIZE.md
  const isNativeButton = Tag === 'button'
  const isDisabled = disabled || loading

  return (
    <Tag
      ref={ref}
      type={isNativeButton ? (type || 'button') : type}
      disabled={isNativeButton ? isDisabled : undefined}
      aria-disabled={!isNativeButton && isDisabled ? true : undefined}
      aria-busy={loading || undefined}
      className={clsx(
        'bk-btn',
        `bk-btn--${variant}`,
        `bk-btn--${size}`,
        block && 'bk-btn--block',
        iconOnly && (Icon || IconRight) && 'bk-btn--icon',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Spinner size={px} />
      ) : (
        Icon && <Icon size={px} strokeWidth={2.2} aria-hidden="true" />
      )}
      {children}
      {!loading && IconRight && <IconRight size={px} strokeWidth={2.2} aria-hidden="true" />}
    </Tag>
  )
})

export default Button
