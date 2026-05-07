import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'
import { applyTheme, getStoredTheme } from '../utils/theme'

/**
 * Sun / Moon theme toggle.
 *
 * - Reads the current theme from localStorage on mount and listens to the
 *   `bk-theme-change` window event so it stays in sync if another component
 *   (e.g. the Settings page) flips the theme.
 * - Accessible: `aria-pressed` reflects the active mode, label is localized.
 *
 * Variants:
 *   • "floating"  — top-right fixed pill, perfect for auth pages.
 *   • "inline"    — block-level button you place inside an existing toolbar.
 *   • "compact"   — circular icon button for the header / mobile nav.
 */
export default function ThemeToggle({ variant = 'inline', className = '' }) {
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark'
    return getStoredTheme()
  })

  useEffect(() => {
    const onChange = (event) => {
      const next = event?.detail?.theme
      if (next === 'light' || next === 'dark') setTheme(next)
    }
    window.addEventListener('bk-theme-change', onChange)
    return () => window.removeEventListener('bk-theme-change', onChange)
  }, [])

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(applyTheme(next))
  }

  const isDark = theme === 'dark'
  const Icon = isDark ? Sun : Moon
  const label = isDark ? 'Aydınlık moda geç' : 'Karanlık moda geç'

  if (variant === 'floating') {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={!isDark}
        aria-label={label}
        title={label}
        className={
          'fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-full ' +
          'transition-all hover:scale-[1.04] active:scale-95 backdrop-blur-md ' +
          'shadow-lg ' + className
        }
        style={{
          background: isDark
            ? 'linear-gradient(135deg, rgba(212,175,55,0.18), rgba(255,255,255,0.04))'
            : 'linear-gradient(135deg, rgba(15,23,42,0.06), rgba(15,23,42,0.02))',
          border: isDark
            ? '1px solid rgba(212,175,55,0.35)'
            : '1px solid rgba(15,23,42,0.18)',
          color: isDark ? '#fde68a' : '#0f172a',
        }}
      >
        <span className="relative flex h-5 w-5 items-center justify-center">
          <Sun
            className={
              'absolute h-5 w-5 transition-all duration-300 ' +
              (isDark ? 'rotate-0 scale-100 opacity-100' : 'rotate-90 scale-50 opacity-0')
            }
            strokeWidth={2.2}
          />
          <Moon
            className={
              'absolute h-5 w-5 transition-all duration-300 ' +
              (isDark ? '-rotate-90 scale-50 opacity-0' : 'rotate-0 scale-100 opacity-100')
            }
            strokeWidth={2.2}
          />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] hidden sm:inline">
          {isDark ? 'Aydınlık' : 'Karanlık'}
        </span>
      </button>
    )
  }

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={!isDark}
        aria-label={label}
        title={label}
        className={
          'flex h-9 w-9 items-center justify-center rounded-full transition-all ' +
          'hover:scale-[1.06] active:scale-95 ' + className
        }
        style={{
          background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.05)',
          border: isDark
            ? '1px solid rgba(212,175,55,0.30)'
            : '1px solid rgba(15,23,42,0.15)',
          color: isDark ? '#fde68a' : '#0f172a',
        }}
      >
        <Icon className="h-4 w-4" strokeWidth={2.2} />
      </button>
    )
  }

  // inline (default)
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={!isDark}
      aria-label={label}
      title={label}
      className={
        'inline-flex items-center gap-2 rounded-xl px-3 py-2 transition-all ' +
        'hover:scale-[1.03] active:scale-95 ' + className
      }
      style={{
        background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.05)',
        border: isDark
          ? '1px solid rgba(212,175,55,0.30)'
          : '1px solid rgba(15,23,42,0.15)',
        color: isDark ? '#fde68a' : '#0f172a',
      }}
    >
      <Icon className="h-4 w-4" strokeWidth={2.2} />
      <span className="text-xs font-semibold">
        {isDark ? 'Aydınlık' : 'Karanlık'}
      </span>
    </button>
  )
}
