# ==========================================================================
#  BORSA KRALI - VPS TEK-TIK BASLATICI (uc botu birden ayaga kaldirir)
# ==========================================================================
#  1) Gold bot        (gold-structure-bot\basla.bat, magic 660066/660067)
#  2) Forex koprusu   (watchdog_forex.ps1,   magic 550055)
#  3) Gun-ici koprusu (watchdog_scanner.ps1, magic 550066)
#
#  HER SEY YALNIZ FTMO 1513908484 hesabinda islem acar (hesap kilidi kodda).
#
#  KULLANIM:
#    1) Asagidaki UC YOLU kendi VPS kurulumuna gore duzenle.
#    2) MT5 terminallerini ac + FTMO hesabina giris yap + Algo Trading AC.
#    3) powershell -ExecutionPolicy Bypass -File vps-kit\vps-basla.ps1
#  DURDURMAK: vps-durdur.ps1  (veya klasorlere STOP dosyasi koy).
# ==========================================================================

$ErrorActionPreference = "Continue"
Write-Host "=== BORSA KRALI VPS BASLATICI ===" -ForegroundColor Cyan

# --- Yollar: script konumundan otomatik (vps-kur.ps1 ile uyumlu) ----------
$KIT_DIR    = $PSScriptRoot
$BRIDGE_DIR = Split-Path $KIT_DIR -Parent
$goldCands  = @("$env:USERPROFILE\Desktop\gold-structure-bot", "C:\gold-structure-bot",
                (Join-Path (Split-Path (Split-Path $BRIDGE_DIR -Parent) -Parent) "gold-structure-bot"))
$GOLD_DIR   = $goldCands | Where-Object { Test-Path (Join-Path $_ "live.py") } | Select-Object -First 1
if (-not $GOLD_DIR) { $GOLD_DIR = $goldCands[0] }

# FTMO terminal yolu: once vps-kur.ps1'in tespit dosyasi, sonra env, sonra elle
$detFile = Join-Path $KIT_DIR "detected_terminal.txt"
if (Test-Path $detFile)         { $FTMO_TERMINAL = (Get-Content $detFile -Raw).Trim() }
elseif ($env:GSB_MT5_TERMINAL)  { $FTMO_TERMINAL = $env:GSB_MT5_TERMINAL }
else                            { $FTMO_TERMINAL = "C:\Program Files\FTMO MetaTrader 5\terminal64.exe" }

if (-not (Test-Path $FTMO_TERMINAL)) {
  Write-Host "!!! FTMO terminal bulunamadi: $FTMO_TERMINAL" -ForegroundColor Red
  Write-Host "    Once 'vps-kur.ps1' calistir (otomatik tespit) veya bu yolu duzelt." -ForegroundColor Yellow
  Read-Host "Devam icin Enter"
}

# STOP dosyalarini kaldir (kopyalanmis olabilir)
foreach ($s in @("$GOLD_DIR\STOP", "$BRIDGE_DIR\STOP", "$BRIDGE_DIR\STOP_SCANNER")) {
  if (Test-Path $s) { Remove-Item $s -Force; Write-Host "STOP kaldirildi: $s" -ForegroundColor DarkGray }
}

# GOLD BOT - GSB_MT5_TERMINAL env'i cocuk proseslere miras kalir
$env:GSB_MT5_TERMINAL = $FTMO_TERMINAL
if (Test-Path "$GOLD_DIR\basla.bat") {
  Write-Host "-> Gold bot baslatiliyor (terminal: $FTMO_TERMINAL)" -ForegroundColor Green
  Start-Process -FilePath "$GOLD_DIR\basla.bat" -WorkingDirectory $GOLD_DIR -WindowStyle Normal
} else {
  Write-Host "!!! gold basla.bat yok: $GOLD_DIR" -ForegroundColor Red
}

Start-Sleep -Seconds 3

# FOREX KOPRUSU (bekci) - terminal_path config.json'dan okunur
if (Test-Path "$BRIDGE_DIR\watchdog_forex.ps1") {
  Write-Host "-> Forex koprusu (550055) baslatiliyor" -ForegroundColor Green
  Start-Process -FilePath "powershell.exe" -ArgumentList "-ExecutionPolicy","Bypass","-File","$BRIDGE_DIR\watchdog_forex.ps1" -WindowStyle Normal
} else { Write-Host "!!! watchdog_forex.ps1 yok" -ForegroundColor Red }

Start-Sleep -Seconds 3

# GUN-ICI KOPRUSU (bekci)
if (Test-Path "$BRIDGE_DIR\watchdog_scanner.ps1") {
  Write-Host "-> Gun-ici koprusu (550066) baslatiliyor" -ForegroundColor Green
  Start-Process -FilePath "powershell.exe" -ArgumentList "-ExecutionPolicy","Bypass","-File","$BRIDGE_DIR\watchdog_scanner.ps1" -WindowStyle Normal
} else { Write-Host "!!! watchdog_scanner.ps1 yok" -ForegroundColor Red }

Start-Sleep -Seconds 2

# GERCEK KAR/ZARAR RAPORLAYICI (yalniz-okur; deftere yazar + Telegram'a P/L basar)
if (Test-Path "$BRIDGE_DIR\run_pnl.bat") {
  Write-Host "-> Gercek P/L raporlayici baslatiliyor (Telegram + defter)" -ForegroundColor Green
  Start-Process -FilePath "$BRIDGE_DIR\run_pnl.bat" -WorkingDirectory $BRIDGE_DIR -WindowStyle Normal
} else { Write-Host "!!! run_pnl.bat yok" -ForegroundColor Yellow }

Write-Host ""
Write-Host "=== 3 bot baslatildi (ayri pencereler) ===" -ForegroundColor Cyan
Write-Host "Her pencerede: login=1513908484 + Hesap kilidi AKTIF gormelisin." -ForegroundColor Yellow
Write-Host "Yanlis hesap gorursen bot islem ACMAZ - terminal_path'i duzelt." -ForegroundColor Yellow
Write-Host "Saglik raporu: python vps-kit\vps_tani.py" -ForegroundColor Gray
