# ==========================================================================
#  BORSA KRALI - VPS TEK-KOMUT KURUCU (her seyi otomatik yapar)
# ==========================================================================
#  VPS'te SADECE bunu calistir; gerisini kendisi halleder:
#    1) Python + paketleri (MetaTrader5, requests) kontrol/kurar
#    2) Tum config'leri guvenli orneklerden olusturur; tokeni env/yerel config'ten alir
#    3) FTMO terminalini (1513908484) OTOMATIK bulur + iki config'e yazar
#    4) GSB_MT5_TERMINAL kullanici env'ini kurar (gold bot icin)
#    5) Reboot oto-baslat icin Gorev Zamanlayici gorevi kurar
#    6) Merkez hesap beyni + botlari baslatir, saglik raporu cikarir
#
#  ON KOSUL: FTMO hesabina (1513908484) bir MT5 terminalinde GIRIS yapilmis +
#            Algo Trading ACIK olmali. (YALNIZ FTMO'da acik birak - digerinde kapat.)
#
#  CALISTIR (mt5-bridge\vps-kit klasorunde):
#    powershell -ExecutionPolicy Bypass -File vps-kur.ps1
# ==========================================================================
$ErrorActionPreference = "Stop"
$KIT_DIR    = $PSScriptRoot
$BRIDGE_DIR = Split-Path $KIT_DIR -Parent
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " BORSA KRALI - VPS OTOMATIK KURULUM" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# --- GOLD_DIR bul ---------------------------------------------------------
$goldCandidates = @(
  "$env:USERPROFILE\Desktop\gold-structure-bot",
  "C:\gold-structure-bot", "C:\bots\gold-structure-bot",
  (Join-Path (Split-Path (Split-Path $BRIDGE_DIR -Parent) -Parent) "gold-structure-bot")
)
$GOLD_DIR = $goldCandidates | Where-Object { Test-Path (Join-Path $_ "live.py") } | Select-Object -First 1
if ($GOLD_DIR) { Write-Host "[OK] Gold bot: $GOLD_DIR" -ForegroundColor Green }
else { Write-Host "[!] Gold bot klasoru bulunamadi - gold bot atlanacak (kopruler kurulur)." -ForegroundColor Yellow }

# --- 1) Python + paketler -------------------------------------------------
Write-Host "`n[1/6] Python + paketler..." -ForegroundColor White
$py = (Get-Command python -ErrorAction SilentlyContinue)
if (-not $py) {
  Write-Host "[HATA] python bulunamadi. python.org'dan Python 3 kur (PATH'e ekle), tekrar calistir." -ForegroundColor Red
  exit 1
}
Write-Host "  python: $($py.Source)"
& python -m pip install --quiet --disable-pip-version-check MetaTrader5 requests
if ($LASTEXITCODE -ne 0) { Write-Host "[HATA] pip install basarisiz." -ForegroundColor Red; exit 1 }
Write-Host "  paketler hazir (MetaTrader5, requests)" -ForegroundColor Green

# --- 2) config.json'lar var mi? yoksa ornekten -----------------------------
Write-Host "`n[2/6] Kopru config'leri..." -ForegroundColor White
foreach ($pair in @(
  @("config_all.json","config_all.example.json"),
  @("config.json","config.example.json"),
  @("config_scanner.json","config_scanner.example.json"),
  @("config_brain.json","config_brain.example.json")
)) {
  $cfg = Join-Path $BRIDGE_DIR $pair[0]; $ex = Join-Path $BRIDGE_DIR $pair[1]
  if (-not (Test-Path $cfg)) {
    if (Test-Path $ex) {
      Copy-Item $ex $cfg
      Write-Host "  [!] $($pair[0]) guvenli ornekten olusturuldu (dry-run/balanced)." -ForegroundColor Yellow
    } else { Write-Host "  [!] $($pair[0]) ve ornegi YOK." -ForegroundColor Red }
  } else { Write-Host "  [OK] $($pair[0]) mevcut" }
}

$secretHelper = Join-Path $BRIDGE_DIR "configure-secrets.ps1"
if (-not (Test-Path -LiteralPath $secretHelper -PathType Leaf)) {
  Write-Host "[HATA] configure-secrets.ps1 yok; token guvenli yonlendirilemedi." -ForegroundColor Red
  exit 3
}
& powershell -NoProfile -ExecutionPolicy Bypass -File $secretHelper -BridgeDir $BRIDGE_DIR -RequireToken
if ($LASTEXITCODE -ne 0) {
  Write-Host "BK_EXEC_TOKEN kullanici ortam degiskenini ayarla veya yalniz git-disindaki yerel config'leri doldur; sonra tekrar calistir." -ForegroundColor Yellow
  exit 3
}

# --- 3) FTMO terminalini otomatik bul + config'lere yaz --------------------
Write-Host "`n[3/6] FTMO terminali otomatik tespit..." -ForegroundColor White
& python "$KIT_DIR\vps_tespit_terminal.py"
if ($LASTEXITCODE -ne 0) {
  Write-Host "[HATA] FTMO terminali bulunamadi. FTMO hesabina (1513908484) GIRIS yap, tekrar calistir." -ForegroundColor Red
  exit 1
}
$detFile = Join-Path $KIT_DIR "detected_terminal.txt"
$FTMO_TERMINAL = (Get-Content $detFile -Raw).Trim()
Write-Host "  [OK] FTMO terminal: $FTMO_TERMINAL" -ForegroundColor Green

# Tespit araci config.json'i gunceller. Ayni hesap/terminal kilidini birlesik
# kopruye ve merkez beyne de aktar; token veya risk limitlerine dokunma.
$sourceConfigPath = Join-Path $BRIDGE_DIR "config.json"
$sourceConfig = Get-Content -LiteralPath $sourceConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
foreach ($targetName in @("config_all.json", "config_brain.json")) {
  $targetPath = Join-Path $BRIDGE_DIR $targetName
  if (-not (Test-Path -LiteralPath $targetPath -PathType Leaf)) { continue }
  $targetConfig = Get-Content -LiteralPath $targetPath -Raw -Encoding UTF8 | ConvertFrom-Json
  foreach ($property in @("allowed_account", "terminal_path", "backend_url")) {
    $value = $sourceConfig.$property
    if ($null -eq $targetConfig.PSObject.Properties[$property]) {
      $targetConfig | Add-Member -NotePropertyName $property -NotePropertyValue $value
    } else {
      $targetConfig.$property = $value
    }
  }
  [System.IO.File]::WriteAllText($targetPath, (($targetConfig | ConvertTo-Json -Depth 100) + [Environment]::NewLine), $utf8NoBom)
  Write-Host "  [OK] hesap/terminal kilidi senkron: $targetName" -ForegroundColor Green
}

# --- 4) GSB_MT5_TERMINAL kullanici env'i (gold bot) ------------------------
Write-Host "`n[4/6] Gold bot env (GSB_MT5_TERMINAL)..." -ForegroundColor White
[Environment]::SetEnvironmentVariable("GSB_MT5_TERMINAL", $FTMO_TERMINAL, "User")
$env:GSB_MT5_TERMINAL = $FTMO_TERMINAL
Write-Host "  [OK] kalici env kuruldu" -ForegroundColor Green

# --- 5) Reboot oto-baslat: Gorev Zamanlayici ------------------------------
Write-Host "`n[5/6] Reboot oto-baslat gorevi..." -ForegroundColor White
$baslaPs1 = Join-Path $KIT_DIR "vps-basla.ps1"
try {
  $act = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Minimized -File `"$baslaPs1`""
  $trg = New-ScheduledTaskTrigger -AtLogOn
  $set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
  Register-ScheduledTask -TaskName "BorsaKrali-Botlar" -Action $act -Trigger $trg -Settings $set -Force -RunLevel Highest | Out-Null
  Write-Host "  [OK] 'BorsaKrali-Botlar' gorevi kuruldu (STOP_MASTER yoksa oturum acilinca baslar)" -ForegroundColor Green
} catch {
  Write-Host "  [!] Gorev kurulamadi ($($_.Exception.Message)). Elle kurabilirsin - kurulum devam." -ForegroundColor Yellow
}

# --- 6) Baslat + dogrula --------------------------------------------------
Write-Host "`n[6/6] Botlar baslatiliyor..." -ForegroundColor White
& powershell -NoProfile -ExecutionPolicy Bypass -File $baslaPs1
if ($LASTEXITCODE -eq 2) {
  Write-Host "[DURDU] STOP_MASTER korundu. Kurulum onu silmedi; devam icin vps-devam.ps1 kullan." -ForegroundColor Yellow
}
Start-Sleep -Seconds 20
Write-Host "`n=== Saglik raporu (login=1513908484 dogrulamasi) ===" -ForegroundColor Cyan
if ($GOLD_DIR) { $env:GSB_DIR = $GOLD_DIR }
& python "$KIT_DIR\vps_tani.py" --gunluk 1

Write-Host "`n==================================================" -ForegroundColor Green
Write-Host " KURULUM TAMAM." -ForegroundColor Green
Write-Host " Acilan pencerelerde 'login=1513908484' + 'Hesap kilidi AKTIF' gormelisin." -ForegroundColor Yellow
Write-Host " Saglik raporu icin: python vps-kit\vps_tani.py" -ForegroundColor Gray
Write-Host " Kalici durdur:       powershell -File vps-kit\vps-durdur.ps1" -ForegroundColor Gray
Write-Host " Acik onayla devam:   powershell -File vps-kit\vps-devam.ps1" -ForegroundColor Gray
Write-Host "==================================================" -ForegroundColor Green
