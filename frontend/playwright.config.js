import { defineConfig, devices } from '@playwright/test';

// Canlı (borsakrali.com) uçtan-uca duman testi config'i.
// Çalıştır: cd frontend && npx playwright test
// (Tarayıcı yoksa: npx playwright install chromium)
// Canlı veriye bağlı olduğu için ana CI'ya BAĞLI DEĞİL — manuel/opsiyonel E2E.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45000,
  expect: { timeout: 15000 },
  retries: 1,
  reporter: 'line',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://borsakrali.com',
    headless: true,
    ignoreHTTPSErrors: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
