const fs = require('fs');
const path = require('path');

let playwrightTest;
try {
  playwrightTest = require('@playwright/test');
} catch (error) {
  playwrightTest = require('playwright/test');
}
const { test, expect } = playwrightTest;

const ROOT = 'C:\\Users\\hsnkr\\Desktop\\BorsaKrali-Yayin-Paketi-2026-03-31_16-12-57';
const BASE_URL = 'https://borsakrali.com';
const mode = process.env.CAPTURE_MODE === 's25' ? 's25' : 'safe';
const outputDir =
  mode === 's25'
    ? path.join(ROOT, 'gorseller', 's25-raw')
    : path.join(ROOT, 'gorseller', 'play-safe-9x16');
const authPath = path.join(__dirname, `play-auth-${mode}.json`);

const profile =
  mode === 's25'
    ? {
        viewport: { width: 360, height: 780 },
        screen: { width: 360, height: 780 },
        deviceScaleFactor: 3,
      }
    : {
        viewport: { width: 360, height: 640 },
        screen: { width: 360, height: 640 },
        deviceScaleFactor: 3,
      };

const pages = [
  { file: '01-giris-ekrani.png', url: '/login', auth: false },
  { file: '02-gizlilik-politikasi.png', url: '/privacy-policy', auth: false },
  { file: '03-hesap-silme.png', url: '/account-deletion', auth: false },
  { file: '04-piyasa-kokpiti.png', url: '/?playstorePreview=1', auth: true },
  { file: '05-teknik-analiz-ai.png', url: '/teknik-analiz-ai?playstorePreview=1', auth: true },
  { file: '06-temel-analiz-ai.png', url: '/temel-analiz-ai?playstorePreview=1', auth: true },
  { file: '07-hisse-ai-skor.png', url: '/hisse-ai-skor?playstorePreview=1', auth: true },
  { file: '08-mali-tablolar.png', url: '/mali-tablolar?playstorePreview=1', auth: true },
  { file: '09-kap-analitik.png', url: '/kap-analitik?playstorePreview=1', auth: true },
  { file: '10-ekonomik-takvim.png', url: '/ekonomik-takvim?playstorePreview=1', auth: true },
  { file: '11-ema34-takip.png', url: '/ema34-tarayici?playstorePreview=1', auth: true },
  { file: '12-piyasa-radari.png', url: '/taramalar?playstorePreview=1', auth: true },
  { file: '13-algoritma-performans.png', url: '/algoritma-performans?playstorePreview=1', auth: true },
  { file: '14-finansal-notlar.png', url: '/finansal-notlar?playstorePreview=1', auth: true },
  { file: '15-pro-analiz.png', url: '/pro-analiz?playstorePreview=1', auth: true },
];

test.describe.configure({ mode: 'serial' });
test.setTimeout(600000);

test.use({
  isMobile: true,
  hasTouch: true,
  colorScheme: 'light',
  locale: 'tr-TR',
  timezoneId: 'Europe/Istanbul',
  ...profile,
  userAgent:
    'Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Mobile Safari/537.36',
});

async function waitForApp(page) {
  await page.waitForLoadState('domcontentloaded');
  try {
    await page.waitForLoadState('networkidle', { timeout: 12000 });
  } catch (error) {
    // Background polling can keep requests open; proceed after a pause.
  }
  await page.waitForTimeout(4500);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    localStorage.setItem(
      'bk-update-popup',
      JSON.stringify({ count: 3, lastShown: Date.now() })
    );
  });
  await page.waitForTimeout(500);
}

async function shot(page, name) {
  fs.mkdirSync(outputDir, { recursive: true });
  await page.screenshot({
    path: path.join(outputDir, name),
    fullPage: false,
    type: 'png',
  });
}

test('capture raw store screenshots', async ({ browser }) => {
  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();

  await publicPage.goto(`${BASE_URL}/playstore-auth?target=/?playstorePreview=1`, {
    waitUntil: 'domcontentloaded',
  });
  await waitForApp(publicPage);
  await publicContext.storageState({ path: authPath });
  await publicPage.close();
  await publicContext.close();

  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();
  for (const item of pages.filter((entry) => !entry.auth)) {
    await guestPage.goto(`${BASE_URL}${item.url}`, { waitUntil: 'domcontentloaded' });
    await waitForApp(guestPage);
    await shot(guestPage, item.file);
  }
  await guestPage.close();
  await guestContext.close();

  const authContext = await browser.newContext({ storageState: authPath });
  const authPage = await authContext.newPage();
  for (const item of pages.filter((entry) => entry.auth)) {
    await authPage.goto(`${BASE_URL}${item.url}`, { waitUntil: 'domcontentloaded' });
    await waitForApp(authPage);
    await shot(authPage, item.file);
  }
  await authPage.close();
  await authContext.close();

  if (fs.existsSync(authPath)) {
    fs.unlinkSync(authPath);
  }

  expect(fs.existsSync(path.join(outputDir, '15-pro-analiz.png'))).toBeTruthy();
});
