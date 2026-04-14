const fs = require('fs')
const path = require('path')
const { test, expect, devices } = require('@playwright/test')

const outputDir = process.env.PLAYSTORE_SHOTS_DIR || path.join(__dirname, 'output')

test.use({
  ...devices['Pixel 7'],
  colorScheme: 'light',
  locale: 'tr-TR',
  timezoneId: 'Europe/Istanbul',
})

async function waitForApp(page) {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2500)
}

async function shot(page, name) {
  fs.mkdirSync(outputDir, { recursive: true })
  await page.screenshot({
    path: path.join(outputDir, name),
    fullPage: false,
  })
}

test('capture google play store screenshots', async ({ page }) => {
  await page.goto('https://borsakrali.com/login', { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    localStorage.setItem('bk-update-popup', JSON.stringify({ count: 2, lastShown: Date.now() }))
  })
  await shot(page, '01-login.png')

  await page.getByRole('button', { name: /Demo/i }).click()
  await page.waitForURL(/borsakrali\.com\/?$/)
  await waitForApp(page)
  await shot(page, '02-dashboard.png')

  await page.goto('https://borsakrali.com/teknik-analiz-ai?symbol=THYAO', { waitUntil: 'networkidle' })
  await waitForApp(page)
  await shot(page, '03-teknik-analiz.png')

  await page.goto('https://borsakrali.com/mali-tablolar', { waitUntil: 'networkidle' })
  await waitForApp(page)
  await shot(page, '04-mali-tablolar.png')

  await page.goto('https://borsakrali.com/canli-heatmap', { waitUntil: 'networkidle' })
  await waitForApp(page)
  await shot(page, '05-heatmap.png')

  await page.goto('https://borsakrali.com/account-deletion', { waitUntil: 'networkidle' })
  await waitForApp(page)
  await shot(page, '06-hesap-silme.png')

  expect(fs.existsSync(path.join(outputDir, '06-hesap-silme.png'))).toBeTruthy()
})
