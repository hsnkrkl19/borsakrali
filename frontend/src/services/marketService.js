import apiClient from './api'

export const marketService = {
  // BIST 100 Verileri
  getBist100: async () => {
    const response = await apiClient.get('/market/bist100')
    return response.data
  },

  // Hisse Detayı
  getStockDetail: async (symbol) => {
    const response = await apiClient.get(`/market/stock/${symbol}`)
    return response.data
  },

  // Sektör Performansları
  getSectorPerformance: async () => {
    const response = await apiClient.get('/market/sectors')
    return response.data
  },

  // Günlük Tespitler
  getDailySignals: async (filters = {}) => {
    const response = await apiClient.get('/market/signals', { params: filters })
    return response.data
  },

  // Taramalar
  getScans: async (type) => {
    const response = await apiClient.get(`/market/scans/${type}`)
    return response.data
  },

  // Harmonik Patternler
  getHarmonicPatterns: async () => {
    const response = await apiClient.get('/market/harmonics')
    return response.data
  },

  // Fibonacci Dönüşleri
  getFibonacciReversals: async () => {
    const response = await apiClient.get('/market/fibonacci')
    return response.data
  },

  // Algoritma Performansları
  getAlgorithmPerformance: async () => {
    const response = await apiClient.get('/market/algorithm-performance')
    return response.data
  },
}

export const analysisService = {
  // Temel Analiz (Altman, Piotroski, vb.)
  getFundamentalAnalysis: async (symbol) => {
    const response = await apiClient.get(`/analysis/fundamental/${symbol}`)
    return response.data
  },

  // Teknik Analiz (RSI, MACD, vb.)
  getTechnicalAnalysis: async (symbol) => {
    const response = await apiClient.get(`/analysis/technical/${symbol}`)
    return response.data
  },

  // AI Skor
  getAIScore: async (symbol) => {
    const response = await apiClient.get(`/analysis/ai-score/${symbol}`)
    return response.data
  },

  // Sektör Analizi
  getSectorAnalysis: async (sector) => {
    const response = await apiClient.get(`/analysis/sector/${sector}`)
    return response.data
  },
}

export const kapService = {
  // KAP Haberleri
  getNews: async (filters = {}) => {
    const response = await apiClient.get('/kap/news', { params: filters })
    return response.data
  },

  // KAP Analizi (AI)
  getNewsAnalysis: async (newsId) => {
    const response = await apiClient.get(`/kap/analysis/${newsId}`)
    return response.data
  },

  // Anomali Tespiti
  getAnomalies: async () => {
    const response = await apiClient.get('/kap/anomalies')
    return response.data
  },

  // Geri Alımlar
  getBuybacks: async () => {
    const response = await apiClient.get('/kap/buybacks')
    return response.data
  },
}

export const userService = {
  // Takip Listesi
  getWatchlist: async () => {
    const response = await apiClient.get('/user/watchlist')
    return response.data
  },

  addToWatchlist: async (symbol) => {
    const response = await apiClient.post('/user/watchlist', { symbol })
    return response.data
  },

  removeFromWatchlist: async (symbol) => {
    const response = await apiClient.delete(`/user/watchlist/${symbol}`)
    return response.data
  },

  // Kullanıcı Ayarları
  getSettings: async () => {
    const response = await apiClient.get('/user/settings')
    return response.data
  },

  updateSettings: async (settings) => {
    const response = await apiClient.put('/user/settings', settings)
    return response.data
  },
}
