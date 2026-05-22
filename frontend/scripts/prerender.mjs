/**
 * Post-build prerender — `vite build` sonrasında çalışır.
 *
 * dist/ klasörünü lokal olarak servis eder, Playwright Chromium ile her
 * public rotayı açar, JavaScript'in ürettiği gerçek HTML'i diske yazar.
 * Böylece arama motoru / AdSense botu, JS çalıştırmadan içeriği görür.
 *
 * Çıktı:
 *   /                 -> dist/index.html         (üzerine yazılır)
 *   /egitim/foo       -> dist/egitim/foo.html
 *   eski SPA kabuğu   -> dist/spa-shell.html      (noindex fallback için)
 *
 * Hata toleranslıdır: prerender başarısız olursa build ÇÖKMEZ — site SPA
 * olarak çalışmaya devam eder, sadece prerender avantajı olmaz.
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = join(__dirname, '..', 'dist')
const PORT = 4319
const ORIGIN = `http://127.0.0.1:${PORT}`

// Login gerektirmeyen, prerender edilecek public rotalar.
const ROUTES = [
  '/',
  '/ogren',
  // Mevcut eğitim makaleleri
  '/egitim/teknik-analiz-giris',
  '/egitim/bist100-rehberi',
  '/egitim/temel-gostergeler',
  '/egitim/bilanco-okuma',
  '/egitim/destek-direnc',
  '/egitim/yatirim-stratejisi',
  // Yeni kripto & strateji makaleleri
  '/egitim/kripto-para-giris',
  '/egitim/kripto-analiz',
  '/egitim/spot-vs-futures',
  '/egitim/risk-yonetimi',
  '/egitim/portfoy-yonetimi',
  '/egitim/yatirim-psikolojisi',
  '/egitim/maliyet-ortalama',
  '/egitim/funding-rate',
  '/egitim/bitcoin-dominansi',
  '/egitim/trade-plani',
  '/egitim/onchain-analiz',
  '/egitim/yatirim-hatalari',
  // Diğer public sayfalar
  '/hakkimizda',
  '/iletisim',
  '/abonelik',
  '/site-haritasi',
  '/ekonomik-takvim',
  '/sinyaller',
]

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
}

const log = (msg) => process.stdout.write(`[prerender] ${msg}\n`)

// Chromium başlatır; binary yoksa bir kez indirip tekrar dener. Böylece
// Render gibi ortamlarda ayrı bir dashboard adımı gerekmeden çalışır.
async function launchChromium() {
  try {
    return await chromium.launch()
  } catch (err) {
    log(`Chromium başlatılamadı (${err?.message}); binary indiriliyor…`)
    try {
      execSync('npx --yes playwright install chromium', { stdio: 'inherit' })
    } catch { /* indirme başarısız olduysa aşağıdaki launch zaten hata verir */ }
    return await chromium.launch()
  }
}

async function main() {
  if (!existsSync(join(DIST, 'index.html'))) {
    log('dist/index.html bulunamadı — prerender atlanıyor.')
    return
  }

  // Orijinal SPA kabuğunu oku. base:'./' yüzünden bundle asset yolları
  // derin rotalarda kırılır; mutlak (/assets/...) hâle getiriyoruz.
  const rawShell = await readFile(join(DIST, 'index.html'), 'utf8')
  const shell = rawShell.replace(/(src|href)="\.\//g, '$1="/')

  // Prerender edilmemiş (araç/login/SPA) rotalar için noindex kabuğu.
  // server-live.js bunu fallback olarak gönderir; böylece zayıf/araç
  // sayfaları Google kalite değerlendirmesini düşürmez.
  const noindexShell = shell
    .replace(/<meta\s+name="robots"[^>]*>/i, '<meta name="robots" content="noindex, nofollow" />')
    .replace(/<meta\s+name="googlebot"[^>]*>/i, '<meta name="googlebot" content="noindex, nofollow" />')
  await writeFile(join(DIST, 'spa-shell.html'), noindexShell, 'utf8')

  // --- Statik sunucu: dist/ servis eder, bilinmeyen yol -> SPA kabuğu ---
  const server = createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0])
      // API/socket çağrıları prerender sırasında hızlıca başarısız olsun.
      if (urlPath.startsWith('/api/') || urlPath.startsWith('/socket.io')) {
        res.writeHead(503); res.end(); return
      }
      const ext = extname(urlPath)
      if (ext) {
        const filePath = join(DIST, urlPath)
        if (filePath.startsWith(DIST) && existsSync(filePath)) {
          res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
          res.end(await readFile(filePath))
          return
        }
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(shell)
    } catch {
      res.writeHead(500); res.end()
    }
  })
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve))
  log(`statik sunucu ayakta: ${ORIGIN}`)

  let browser
  const results = []
  try {
    browser = await launchChromium()
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

    // Üçüncü taraf isteklerini (reklam, font, analitik) engelle — prerender'ı
    // hızlandırır ve ağ dalgalanmalarına bağımlılığı kaldırır. Script etiketi
    // yine de HTML'de kalır, canlıda normal çalışır.
    await page.route('**/*', (route) => {
      const url = route.request().url()
      if (/googlesyndication|googletagmanager|google-analytics|gstatic|googleapis|doubleclick|adtrafficquality|facebook|connect\.facebook/.test(url)) {
        return route.abort()
      }
      return route.continue()
    })

    for (const route of ROUTES) {
      try {
        await page.goto(`${ORIGIN}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
        await page.waitForFunction(
          () => {
            const r = document.getElementById('root')
            return !!r && r.children.length > 0
          },
          { timeout: 15000 },
        )
      } catch {
        log(`uyarı: ${route} — uygulama mount olmadı, atlanıyor`)
        continue
      }

      // Lazy yüklenen içerik (footer vb.) için sayfayı kaydır.
      await page.evaluate(async () => {
        window.scrollTo(0, document.body.scrollHeight)
        await new Promise((r) => setTimeout(r, 400))
        window.scrollTo(0, 0)
      })
      // Reveal animasyonlarının tamamlanması için bekle.
      await page.waitForTimeout(2000)

      // Animasyon yarım kaldıysa gizli kalan içeriği görünür yap —
      // opacity:0 içerik arama motorunda gizli/cloaking sayılabilir.
      await page.evaluate(() => {
        for (const el of document.querySelectorAll('[style*="opacity"]')) {
          const o = parseFloat(el.style.opacity)
          if (!Number.isNaN(o) && o < 1) el.style.opacity = '1'
        }
        for (const el of document.querySelectorAll('[style*="translate"]')) {
          if (/translate/.test(el.style.transform)) el.style.transform = 'none'
        }
      })

      const html = await page.content()
      results.push({ route, html })
      log(`✓ ${route}  (${(html.length / 1024).toFixed(0)} KB)`)
    }
  } finally {
    if (browser) await browser.close()
    server.close()
  }

  // --- Yakalanan HTML'leri diske yaz ---
  for (const { route, html } of results) {
    const outPath = route === '/'
      ? join(DIST, 'index.html')
      : join(DIST, `${route.replace(/^\//, '')}.html`)
    await mkdir(dirname(outPath), { recursive: true })
    await writeFile(outPath, html, 'utf8')
  }
  log(`tamamlandı — ${results.length}/${ROUTES.length} rota prerender edildi.`)
}

main().catch((err) => {
  // Hata toleranslı: prerender çökse bile build başarılı sayılır.
  process.stdout.write(`[prerender] HATA (build devam ediyor): ${err?.stack || err}\n`)
})
