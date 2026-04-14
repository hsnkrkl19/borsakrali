import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { initializePushNotifications, syncStoredPushToken } from '../services/push'
import { useAuthStore } from '../store/authStore'

export default function PushNotificationManager() {
  const navigate = useNavigate()
  const token = useAuthStore((state) => state.token)

  useEffect(() => {
    initializePushNotifications((target) => navigate(target))
  }, [navigate])

  useEffect(() => {
    syncStoredPushToken()
  }, [token])

  return null
}
