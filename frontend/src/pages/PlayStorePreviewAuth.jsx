import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function PlayStorePreviewAuth() {
  const navigate = useNavigate()
  const { login } = useAuthStore()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const target = params.get('target') || '/'

    const targetUrl = new URL(target, window.location.origin)
    targetUrl.searchParams.set('playstorePreview', '1')

    localStorage.setItem('bk-update-popup', JSON.stringify({
      count: 2,
      lastShown: Date.now()
    }))

    login({
      firstName: 'Demo',
      lastName: 'Kullanici',
      email: 'demo@borsakrali.com',
      isDemo: true,
      plan: 'pro',
      role: 'demo',
    }, 'demo-token-full-access')

    navigate(`${targetUrl.pathname}${targetUrl.search}`, { replace: true })
  }, [login, navigate])

  return null
}
