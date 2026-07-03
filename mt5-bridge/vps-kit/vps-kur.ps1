# ==========================================================================
#  BORSA KRALI - VPS TEK-KOMUT KURUCU (her seyi otomatik yapar)
# ==========================================================================
#  VPS'te SADECE bunu calistir; gerisini kendisi halleder:
#    1) Python + paketleri (MetaTrader5, requests) kontrol/kurar
#    2) config.json yoksa ornekten olusturur (exec_token'i uyarir)
#    3) FTMO terminalini (1513857844) OTOMATIK bulur + iki config'e yazar
#    4) GSB_MT5_TERMINAL kullanici env'ini kurar (gold bot icin)
#    5) Reboot oto-baslat icin Gorev Zamanlayici gorevi kurar
#    6) Uc botu baslatir + saglik raporu cikarir
#
#  ON KOSUL: FTMO hesabina (1513857844) bir MT5 terminalinde GIRIS yapilmis +
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
foreach ($pair in @(@("config.json","config.example.json"), @("config_scanner.json","config_scanner.example.json"))) {
  $cfg = Join-Path $BRIDGE_DIR $pair[0]; $ex = Join-Path $BRIDGE_DIR $pair[1]
  if (-not (Test-Path $cfg)) {
    if (Test-Path $ex) {
      Copy-Item $ex $cfg
      Write-Host "  [!] $($pair[0]) ornekten olusturuldu - exec_token'i BACKEND FOREX_EXEC_TOKEN ile DOLDUR!" -ForegroundColor Yellow
    } else { Write-Host "  [!] $($pair[0]) ve ornegi YOK." -ForegroundColor Red }
  } else { Write-Host "  [OK] $($pair[0]) mevcut" }
}

# --- 3) FTMO terminalini otomatik bul + config'lere yaz --------------------
Write-Host "`n[3/6] FTMO terminali otomatik tespit..." -ForegroundColor White
& python "$KIT_DIR\vps_tespit_terminal.py"
if ($LASTEXITCODE -ne 0) {
  Write-Host "[HATA] FTMO terminali bulunamadi. FTMO hesabina (1513857844) GIRIS yap, tekrar calistir." -ForegroundColor Red
  exit 1
}
$detFile = Join-Path $KIT_DIR "detected_terminal.txt"
$FTMO_TERMINAL = (Get-Content $detFile -Raw).Trim()
Write-Host "  [OK] FTMO terminal: $FTMO_TERMINAL" -ForegroundColor Green

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
  Write-Host "  [OK] 'BorsaKrali-Botlar' gorevi kuruldu (oturum acilinca baslar)" -ForegroundColor Green
} catch {
  Write-Host "  [!] Gorev kurulamadi ($($_.Exception.Message)). Elle kurabilirsin - kurulum devam." -ForegroundColor Yellow
}

# --- 6) Baslat + dogrula --------------------------------------------------
Write-Host "`n[6/6] Botlar baslatiliyor..." -ForegroundColor White
& powershell -ExecutionPolicy Bypass -File $baslaPs1
Start-Sleep -Seconds 20
Write-Host "`n=== Saglik raporu (login=1513857844 dogrulamasi) ===" -ForegroundColor Cyan
if ($GOLD_DIR) { $env:GSB_DIR = $GOLD_DIR }
& python "$KIT_DIR\vps_tani.py" --gunluk 1

Write-Host "`n==================================================" -ForegroundColor Green
Write-Host " KURULUM TAMAM." -ForegroundColor Green
Write-Host " Acilan pencerelerde 'login=1513857844' + 'Hesap kilidi AKTIF' gormelisin." -ForegroundColor Yellow
Write-Host " Saglik raporu icin: python vps-kit\vps_tani.py" -ForegroundColor Gray
Write-Host " Durdurmak icin:     powershell -File vps-kit\vps-durdur.ps1" -ForegroundColor Gray
Write-Host "==================================================" -ForegroundColor Green
