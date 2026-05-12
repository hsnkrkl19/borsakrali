// Direct screenshot of the rendered v4.3 popup via Playwright.
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});
const page = await ctx.newPage();
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
// Inject demo authenticated state so UpdatePopup renders
await page.evaluate(() => {
  Object.keys(localStorage).filter(k => k.includes('update-popup')).forEach(k => localStorage.removeItem(k));
  localStorage.setItem('auth-storage', JSON.stringify({
    state: {
      user: { id: 'demo', email: 'demo@borsakrali.com', name: 'Demo', isDemo: true },
      token: 'demo-token-full-access',
      refreshToken: null,
      isAuthenticated: true,
    },
    version: 0,
  }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.popup-modal', { timeout: 12000 });
// Wait a tiny bit for entrance animation to settle
await page.waitForTimeout(800);
// Screenshot while countdown is still active (3s into 4s hold)
const buf1 = await page.screenshot({ type: 'png', fullPage: false });
writeFileSync(resolve(__dirname, '..', 'public', 'icon-options', 'popup-v43-during-countdown.png'), buf1);

// Wait remaining 4s for the close button to enable
await page.waitForTimeout(4500);
const buf2 = await page.screenshot({ type: 'png', fullPage: false });
writeFileSync(resolve(__dirname, '..', 'public', 'icon-options', 'popup-v43-active.png'), buf2);

console.log('saved popup-v43-during-countdown.png + popup-v43-active.png');
await browser.close();
