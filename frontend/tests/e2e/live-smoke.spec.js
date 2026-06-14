import { test, expect } from '@playwright/test';

/**
 * Canlı uçtan-uca duman testi (borsakrali.com) — D6/Faz 4.
 * Dağıtılmış uygulamanın tarayıcıda boot ettiğini, içerik render ettiğini ve
 * backend API'sinin veri sunduğunu doğrular. (Backend pipeline E2E'si zaten
 * botEngine.integration.test.js'te; bu, UI+API katmanını kapsar.)
 */

test('ana sayfa: yüklenir, başlık + içerik render eder, JS hatası yok', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const resp = await page.goto('/', { waitUntil: 'domcontentloaded' });
  expect(resp.status(), 'HTTP durumu < 400 olmalı').toBeLessThan(400);

  await expect(page).toHaveTitle(/borsa|bist|kral/i);

  const bodyText = await page.locator('body').innerText();
  expect(bodyText.length, 'gövde anlamlı içerik göstermeli').toBeGreaterThan(50);

  expect(errors, 'sayfada JS hatası olmamalı').toEqual([]);
});

test('backend API: tarayıcıdan /api/market/bist100 gerçek veri döner', async ({ page }) => {
  const r = await page.request.get('/api/market/bist100');
  expect(r.ok(), 'BIST100 endpoint 2xx olmalı').toBeTruthy();
  const j = await r.json();
  expect(j.symbol).toBe('XU100');
  expect(typeof j.value).toBe('number');
  expect(j.value).toBeGreaterThan(0);
});

test('health: backend canlı + Yahoo veri kaynağı', async ({ page }) => {
  const r = await page.request.get('/health');
  expect(r.ok()).toBeTruthy();
  const j = await r.json();
  expect(j.status).toBe('OK');
});
