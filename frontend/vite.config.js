import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    host: '0.0.0.0',
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '.trycloudflare.com',
      '.ngrok.io',
      '.ngrok-free.dev',
      'lowbred-tonsillary-lucille.ngrok-free.dev'
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  },
  build: {
    // vite 8 (rolldown) varsayılan minifier'ı oxc'tir; 'esbuild' artık ayrı paket
    // gerektirir (ve esbuild = kaldırdığımız dev açığının kaynağı). true → oxc.
    minify: true,
    sourcemap: false,
    target: 'es2018',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // Fonksiyon biçimi — hem rollup (vite ≤6) hem rolldown (vite 7+/8) ile uyumlu.
        // (Obje biçimi rolldown'da "manualChunks is not a function" hatası veriyordu.)
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router-dom)[\\/]/.test(id)) return 'react';
          if (/[\\/]node_modules[\\/](lightweight-charts|recharts)[\\/]/.test(id)) return 'charts';
          if (/[\\/]node_modules[\\/]lucide-react[\\/]/.test(id)) return 'icons';
          return undefined;
        },
      }
    }
  }
})
