import { useEffect, useState } from 'react'

/**
 * SSR-safe media query hook.
 * İlk render'da false döner (mobile-first), client mount sonrası gerçek değeri verir.
 *
 * Kullanım:
 *   const isDesktop = useMediaQuery('(min-width: 768px)')
 *   {isDesktop ? <DesktopTable /> : <MobileCard />}
 */
export default function useMediaQuery(query) {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia(query)
    setMatches(mq.matches)
    const handler = (e) => setMatches(e.matches)
    if (mq.addEventListener) {
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
    mq.addListener(handler)
    return () => mq.removeListener(handler)
  }, [query])

  return matches
}
