import { create } from 'zustand'

export const useMarketStore = create((set) => ({
  bist100: {
    value: 0,
    change: 0,
    changePercent: 0,
    volume: 0,
    trend: 'neutral'
  },
  
  sectors: [],
  stocks: [],
  watchlist: [],
  
  setBist100: (data) => set({ bist100: data }),
  setSectors: (data) => set({ sectors: data }),
  setStocks: (data) => set({ stocks: data }),
  
  addToWatchlist: (stock) => set((state) => ({
    watchlist: [...state.watchlist, stock]
  })),
  
  removeFromWatchlist: (symbol) => set((state) => ({
    watchlist: state.watchlist.filter(s => s.symbol !== symbol)
  })),
}))
