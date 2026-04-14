#!/usr/bin/env node
/**
 * BORSA KRALI — All-in-One Launcher v4.0
 * Frontend Build + Backend + Ngrok
 * Per.Tgm. Hasan KIRKIL
 */

const { spawn, execSync, spawnSync } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');
const os = require('os');

const IS_PKG = typeof process.pkg !== 'undefined';
const EXE_DIR = IS_PKG ? path.dirname(process.execPath) : __dirname;

function findProjectRoot(startDir) {
  const marker = path.join(startDir, 'backend', 'src', 'server-live.js');
  if (fs.existsSync(marker)) return startDir;
  const candidates = [
    path.join(os.homedir(), 'Desktop', 'site', 'borsasanati-clone'),
    path.join(os.homedir(), 'Desktop', 'borsasanati-clone'),
    path.join(os.homedir(), 'Documents', 'borsasanati-clone'),
    path.join('C:\\', 'Users', os.userInfo().username, 'Desktop', 'site', 'borsasanati-clone'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'backend', 'src', 'server-live.js'))) return c;
  }
  const configFile = path.join(EXE_DIR, 'borsakrali-path.txt');
  if (fs.existsSync(configFile)) {
    const p = fs.readFileSync(configFile, 'utf8').trim();
    if (fs.existsSync(path.join(p, 'backend', 'src', 'server-live.js'))) return p;
  }
  return null;
}

const ROOT_DIR = findProjectRoot(EXE_DIR);
const BACKEND_DIR = ROOT_DIR ? path.join(ROOT_DIR, 'backend') : null;
const FRONTEND_DIR = ROOT_DIR ? path.join(ROOT_DIR, 'frontend') : null;
const NGROK_EXE = ROOT_DIR && fs.existsSync(path.join(ROOT_DIR, 'ngrok.exe'))
  ? path.join(ROOT_DIR, 'ngrok.exe') : 'ngrok';

const C = {
  reset: '\x1b[0m', bright: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
  red: '\x1b[31m', blue: '\x1b[34m', magenta: '\x1b[35m', white: '\x1b[37m',
};

function now() { return new Date().toLocaleTimeString('tr-TR'); }
function log(msg, color = C.white) {
  process.stdout.write(`${C.cyan}[${now()}]${C.reset} ${color}${msg}${C.reset}\n`);
}

function banner() {
  try { if (process.platform === 'win32') process.stdout.write('\x1Bc'); else console.clear(); } catch {}
  console.log(`${C.bright}${C.yellow}`);
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║       BORSA KRALI v4.0 — All-in-One Launcher               ║');
  console.log('║   Frontend Build + Backend + Ngrok | Per.Tgm. Hasan KIRKIL ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(C.reset);
}

function findNode() {
  if (!IS_PKG) return process.execPath;
  try {
    const result = execSync('where node', { encoding: 'utf8', shell: true }).trim().split('\n')[0].trim();
    if (result && fs.existsSync(result)) return result;
  } catch {}
  const nodePaths = [
    'C:\\Program Files\\nodejs\\node.exe',
    'C:\\Program Files (x86)\\nodejs\\node.exe',
    path.join(os.homedir(), 'AppData\\Roaming\\nvm\\current\\node.exe'),
  ];
  for (const p of nodePaths) { if (fs.existsSync(p)) return p; }
  return 'node';
}

function findNpm() {
  try {
    const result = execSync('where npm', { encoding: 'utf8', shell: true }).trim().split('\n')[0].trim();
    if (result) return result;
  } catch {}
  return 'npm';
}

// Frontend'i derle
function buildFrontend(frontendDir) {
  return new Promise((resolve) => {
    log('▶ Frontend derleniyor (tum degisiklikler dahil edilecek)...', C.yellow);

    if (!fs.existsSync(path.join(frontendDir, 'node_modules'))) {
      log('  Frontend bagimliliklari yukleniyor...', C.white);
      spawnSync('npm', ['install', '--silent'], {
        cwd: frontendDir, stdio: 'inherit', shell: true
      });
    }

    const build = spawn('npm', ['run', 'build'], {
      cwd: frontendDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true
    });

    let output = '';
    build.stdout.on('data', d => { output += d.toString(); });
    build.stderr.on('data', d => { output += d.toString(); });

    build.on('exit', (code) => {
      if (code === 0) {
        log('✅ Frontend derleme basarili! Kripto + Mali Tablolar aktif.', C.green);
        resolve(true);
      } else {
        log('⚠ Frontend derleme hatasi - onceki build kullaniliyor.', C.yellow);
        if (output.includes('error')) {
          const errLine = output.split('\n').find(l => l.includes('error'));
          if (errLine) log(`  ${errLine.trim()}`, C.red);
        }
        resolve(false);
      }
    });

    build.on('error', () => {
      log('⚠ Frontend derlenemedi - onceki build kullaniliyor.', C.yellow);
      resolve(false);
    });
  });
}

function waitForNgrokUrl(maxRetries = 20) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const tryGet = () => {
      const req = http.get({ host: '127.0.0.1', port: 4040, path: '/api/tunnels' }, (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const httpsUrl = json.tunnels?.find(t => t.proto === 'https')?.public_url
              || json.tunnels?.[0]?.public_url;
            if (httpsUrl) return resolve(httpsUrl);
          } catch {}
          attempts++;
          if (attempts < maxRetries) setTimeout(tryGet, 1500);
          else reject(new Error('Ngrok URL alınamadı'));
        });
      });
      req.on('error', () => {
        attempts++;
        if (attempts < maxRetries) setTimeout(tryGet, 1500);
        else reject(new Error('Ngrok bağlantısı kurulamadı'));
      });
      req.setTimeout(2000, () => req.destroy());
      req.end();
    };
    tryGet();
  });
}

function waitForBackend(maxTries = 20) {
  return new Promise((resolve) => {
    let tries = 0;
    const check = () => {
      const req = http.get({ host: '127.0.0.1', port: 5000, path: '/health' }, (res) => {
        resolve(res.statusCode < 500);
      });
      req.on('error', () => {
        tries++;
        if (tries < maxTries) setTimeout(check, 1000);
        else resolve(false);
      });
      req.setTimeout(2000, () => { req.destroy(); });
      req.end();
    };
    setTimeout(check, 2000);
  });
}

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}

async function main() {
  banner();

  if (!ROOT_DIR) {
    log('❌ Proje dizini bulunamadı!', C.red);
    console.log('\n  EXE ile aynı dizinde "borsakrali-path.txt" oluşturun.');
    console.log('  İçine proje yolunu yazın: C:\\Users\\...\\site\\borsasanati-clone\n');
    process.stdin.resume();
    process.stdin.on('data', () => process.exit(1));
    return;
  }

  log(`Proje: ${ROOT_DIR}`, C.cyan);
  const nodePath = findNode();
  console.log('');

  const serverScript = path.join(BACKEND_DIR, 'src', 'server-live.js');

  // ── 1. Frontend derle ──────────────────────────────────────────────
  if (FRONTEND_DIR && fs.existsSync(path.join(FRONTEND_DIR, 'package.json'))) {
    await buildFrontend(FRONTEND_DIR);
  }
  console.log('');

  // ── 2. Backend başlat ──────────────────────────────────────────────
  log('▶ Backend sunucu başlatılıyor (Port 5000)...', C.yellow);

  const backend = spawn(nodePath, [serverScript], {
    cwd: BACKEND_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '5000', NODE_ENV: 'production' },
    shell: false,
  });

  backend.stdout.on('data', (d) => {
    const lines = d.toString().trim().split('\n');
    lines.forEach(line => {
      if (line.trim() && !line.includes(' GET ') && !line.includes(' POST ')) {
        log(`  [Sunucu] ${line.trim()}`, C.green);
      }
    });
  });

  backend.stderr.on('data', (d) => {
    const msg = d.toString().trim();
    if (!msg || msg.includes('ExperimentalWarning') || msg.includes('DeprecationWarning')) return;
    log(`  [Sunucu⚠] ${msg.split('\n')[0].trim()}`, C.yellow);
  });

  backend.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      log(`❌ Backend durdu! Kod: ${code}`, C.red);
      process.stdin.resume();
      process.stdin.on('data', () => process.exit(1));
    }
  });

  log('⏳ Backend hazırlanıyor...', C.white);
  const backendOk = await waitForBackend();
  if (backendOk) {
    log('✅ Backend çalışıyor! (Port 5000 — site + API birlikte)', C.green);
  } else {
    log('⚠ Backend yavaş başlıyor, devam ediliyor...', C.yellow);
  }
  console.log('');

  // ── 3. Ngrok başlat ───────────────────────────────────────────────
  log('▶ Ngrok tüneli başlatılıyor (Port 5000)...', C.yellow);

  let ngrokUrl = null;
  let ngrokProc = null;

  try {
    ngrokUrl = await waitForNgrokUrl(3);
    log('✅ Mevcut ngrok tüneli kullanılıyor!', C.green);
  } catch {
    ngrokProc = spawn(NGROK_EXE, ['http', '5000'], {
      cwd: ROOT_DIR, stdio: ['ignore', 'pipe', 'pipe'], shell: false,
    });
    ngrokProc.on('error', e => log(`❌ Ngrok hatası: ${e.message}`, C.red));

    try {
      ngrokUrl = await waitForNgrokUrl(20);
      log('✅ Ngrok tüneli hazır!', C.green);
    } catch (e) {
      log(`⚠ ${e.message}`, C.yellow);
    }
  }

  // ── 4. Sonuçları göster ───────────────────────────────────────────
  const localIP = getLocalIP();
  console.log('');
  console.log(`${C.bright}${C.green}════════════════════════════════════════════════════════════${C.reset}`);
  console.log('');

  if (ngrokUrl) {
    console.log(`  ${C.bright}${C.green}✅ BORSA KRALI HAZIR!${C.reset}`);
    console.log('');
    console.log(`  ${C.bright}${C.yellow}📡 İNTERNET URL (Herhangi bir ağdan erişilebilir):${C.reset}`);
    console.log(`  ${C.bright}${C.cyan}    ${ngrokUrl}${C.reset}`);
    console.log('');
    console.log(`  ${C.white}🌐 Yerel ağ: http://${localIP}:5000${C.reset}`);
    console.log(`  ${C.white}🏠 Localhost: http://localhost:5000${C.reset}`);
    console.log('');
    console.log(`  ${C.bright}${C.magenta}  ✓ Kripto Para Entegrasyonu: AKTİF${C.reset}`);
    console.log(`  ${C.bright}${C.magenta}  ✓ Mali Tablolar Gerçek Veri: AKTİF${C.reset}`);
    console.log(`  ${C.bright}${C.magenta}  ✓ Tüm Analizler: AKTİF${C.reset}`);

    try {
      fs.writeFileSync(
        path.join(EXE_DIR, 'SUNUCU-URL.txt'),
        `BORSA KRALI Sunucu URL\n${'='.repeat(40)}\nİnternet (Herhangi ağ): ${ngrokUrl}\nYerel Ağ: http://${localIP}:5000\nTarih: ${new Date().toLocaleString('tr-TR')}\n`
      );
    } catch {}
  } else {
    console.log(`  ${C.bright}${C.yellow}⚠ Yalnızca Yerel Ağ Modu${C.reset}`);
    console.log(`  ${C.bright}${C.cyan}    http://${localIP}:5000${C.reset}`);
  }

  console.log('');
  console.log(`${C.bright}${C.green}════════════════════════════════════════════════════════════${C.reset}`);
  console.log('');
  log('Sunucu çalışıyor... Kapatmak için Ctrl+C', C.yellow);

  const cleanup = () => {
    log('Kapatılıyor...', C.yellow);
    try { backend.kill('SIGTERM'); } catch {}
    if (ngrokProc) { try { ngrokProc.kill('SIGTERM'); } catch {} }
    setTimeout(() => process.exit(0), 1500);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  setInterval(() => {}, 60000);
}

main().catch(err => {
  console.error(`${C.red}Launcher hatası: ${err.message}${C.reset}`);
  process.stdin.resume();
  process.stdin.on('data', () => process.exit(1));
});
