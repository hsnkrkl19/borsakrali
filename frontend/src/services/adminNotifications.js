import api from './api'

// apiClient üzerinden gidiyor — token interceptor'dan otomatik ekleniyor,
// 401 alırsak refresh akışı tetikleniyor (mobil tarayıcıdaki "Geçersiz token"
// hatası bu yüzden alınıyordu — token'ı refresh etme şansı yoktu).
function unwrap(promise) {
  return promise.then((r) => {
    const data = r.data || {}
    if (data.success === false) {
      throw new Error(data.error || data.message || 'Islem basarisiz')
    }
    return data
  }).catch((err) => {
    // axios hata yapısı → mevcut çağrılar Error.message bekliyor
    if (err?.response) {
      const data = err.response.data || {}
      throw new Error(data.error || data.message || 'Islem basarisiz')
    }
    throw err
  })
}

// İkinci parametre `token` artık kullanılmıyor (apiClient otomatik ekliyor),
// sadece eski çağrı imzasını bozmamak için tutuyoruz.
export async function fetchAdminNotificationSummary(_token) {
  return unwrap(api.get('/admin/notifications/summary'))
}

export async function sendBroadcastNotification(payload, _token) {
  return unwrap(api.post('/admin/notifications/broadcast', payload))
}
