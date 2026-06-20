// ta4j tarzı teknik analiz API'si (trading-signals tabanlı, backend EKLEMELİ katman).
// apiClient zaten baseURL='/api' → kök yollar kullanılır ('/ta4j/...').
import apiClient from './api'

// Desteklenen indikatör kataloğu (key, label, group, kind, composite, params).
export const getTa4jCatalog = async () => {
  const { data } = await apiClient.get('/ta4j/catalog')
  return data
}

// Sembol için anlık görüntü + yorum (Yahoo/İş Yatırım mumlarıyla).
export const getTa4jAnalysis = async (symbol, { range = '1y', interval = '1d' } = {}) => {
  const sym = String(symbol || '').trim().toUpperCase().replace('.IS', '')
  const { data } = await apiClient.get(`/ta4j/${encodeURIComponent(sym)}`, { params: { range, interval } })
  return data
}

// İstemcinin verdiği mumlar üzerinde hesap (seri veya snapshot). Programatik kullanım.
export const computeTa4j = async (candles, indicators, series = false) => {
  const { data } = await apiClient.post('/ta4j/compute', { candles, indicators, series })
  return data
}
