import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import MobileNav from './MobileNav'
import BrandMark from './BrandMark'
import AdSlot from './AdSlot'

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024
      setIsMobile(mobile)
      if (mobile) {
        setSidebarOpen(false)
        setMobileMenuOpen(false)
      } else {
        setSidebarOpen(true)
      }
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden'
      document.body.style.touchAction = 'none'
    } else {
      document.body.style.overflow = ''
      document.body.style.touchAction = ''
    }

    return () => {
      document.body.style.overflow = ''
      document.body.style.touchAction = ''
    }
  }, [mobileMenuOpen])

  return (
    <div className="min-h-screen w-full overflow-x-hidden antialiased selection:bg-gold-500/30 selection:text-gold-200"
      style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}
    >
      <div className="flex min-h-screen w-full min-w-0">
        {!isMobile && (
          <div
            aria-hidden="true"
            className={`shrink-0 transition-[width] duration-300 ${sidebarOpen ? 'w-64' : 'w-20'}`}
          />
        )}

        <div
          className={`
            fixed left-0 top-0 bottom-0 z-[60] transition-transform duration-300 will-change-transform
            ${isMobile
              ? (mobileMenuOpen ? 'translate-x-0 w-64 shadow-2xl shadow-black' : '-translate-x-full w-64')
              : (sidebarOpen ? 'translate-x-0 w-64' : 'translate-x-0 w-20')
            }
          `}
        >
          <Sidebar
            isOpen={isMobile ? true : sidebarOpen}
            onToggle={() => {
              if (isMobile) setMobileMenuOpen(false)
              else setSidebarOpen(!sidebarOpen)
            }}
          />
        </div>

        {isMobile && mobileMenuOpen && (
          <div
            onClick={() => setMobileMenuOpen(false)}
            onTouchStart={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm cursor-pointer touch-none"
          />
        )}

        <div className="flex min-h-screen min-w-0 flex-1 flex-col overflow-x-hidden">
          {!isMobile && <Header />}

          {isMobile && (
            <header
              className="sticky top-0 z-30 flex h-14 items-center justify-between px-4"
              style={{
                background: 'linear-gradient(180deg, var(--bg-card) 0%, var(--bg-base) 100%)',
                borderBottom: '1px solid var(--border-main)',
              }}
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setMobileMenuOpen(true)}
                  className="rounded-lg p-1.5 transition-colors"
                  style={{ color: 'var(--gold-400)' }}
                  aria-label="Menü"
                >
                  <div className="mb-1 h-0.5 w-6" style={{ background: 'currentColor' }}></div>
                  <div className="mb-1 h-0.5 w-6" style={{ background: 'currentColor' }}></div>
                  <div className="h-0.5 w-6" style={{ background: 'currentColor' }}></div>
                </button>

                <div className="flex items-center gap-2">
                  <BrandMark size="sm" className="shadow-glow-gold" />
                  <span className="bg-gradient-to-r from-gold-400 to-gold-600 bg-clip-text text-lg font-bold text-transparent">
                    BORSA KRALI
                  </span>
                </div>
              </div>

              <button
                onClick={() => window.dispatchEvent(new CustomEvent('bk-open-cmdk'))}
                aria-label="Ara"
                className="flex h-9 w-9 items-center justify-center rounded-xl transition-all"
                style={{
                  background: 'rgba(212, 175, 55, 0.10)',
                  border: '1px solid var(--border-gold)',
                  color: 'var(--gold-400)',
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                </svg>
              </button>
            </header>
          )}

          {!isMobile && (
            <AdSlot
              placement="desktopTop"
              className="mx-auto w-full max-w-5xl px-4 pt-3"
            />
          )}

          {isMobile && (
            <AdSlot
              placement="mobileTop"
              className="w-full px-3 pt-2"
            />
          )}

          <main className={`flex-1 w-full min-w-0 max-w-full overflow-x-hidden p-4 md:p-6 ${isMobile ? 'main-mobile-pb' : ''}`}>
            <div className="w-full min-w-0 max-w-full">
              {children}
            </div>
          </main>

          {!isMobile && (
            <AdSlot
              placement="desktopBottom"
              className="mx-auto w-full max-w-5xl px-4 pb-3"
            />
          )}

          {!isMobile && (
            <footer className="bg-dark-900 border-t border-gold-500/10 px-6 py-4">
              <div className="flex flex-col items-center gap-2 text-center">
                <p className="text-sm text-gray-500">
                  Tum haklari saklidir. Yatirim tavsiyesi degildir. Yalnizca egitim amaclidir.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-gray-400">
                  <Link to="/hakkimizda" className="hover:text-white">Hakkimizda</Link>
                  <Link to="/iletisim" className="hover:text-white">Iletisim</Link>
                  <Link to="/egitim" className="hover:text-white">Egitim</Link>
                  <Link to="/privacy-policy" className="hover:text-white">Gizlilik Politikasi</Link>
                  <Link to="/terms-of-use" className="hover:text-white">Kullanim Kosullari</Link>
                  <Link to="/account-deletion" className="hover:text-white">Hesap Silme</Link>
                </div>
              </div>
            </footer>
          )}
        </div>
      </div>

      {isMobile && (
        <div
          className="fixed bottom-16 left-0 right-0 z-40 px-2 pb-1"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 4px)' }}
        >
          <AdSlot placement="mobileBottom" />
        </div>
      )}

      {isMobile && <MobileNav />}
    </div>
  )
}
