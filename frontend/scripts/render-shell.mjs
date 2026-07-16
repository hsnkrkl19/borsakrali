/**
 * Render deploy shell.
 *
 * The repository already carries prerendered public HTML. Render only needs a
 * fresh SPA bundle for private/tool routes such as /bot; downloading a 170 MB
 * Playwright browser during every free-tier deploy can stall the build.
 * Vite runs with emptyOutDir=false so existing public prerenders remain, then
 * this copies the new index to the noindex SPA fallback used by server-live.
 */
import { copyFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dist = join(here, '..', 'dist')

await copyFile(join(dist, 'index.html'), join(dist, 'spa-shell.html'))
process.stdout.write('[render-build] yeni SPA kabuğu hazır\n')
