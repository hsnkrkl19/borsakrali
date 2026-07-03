# ==========================================================================
#  BORSA KRALI - VPS TEK-TIK BASLATICI (uc botu birden ayaga kaldirir)
# ==========================================================================
#  1) Gold bot        (gold-structure-bot\basla.bat, magic 660066/660067)
#  2) Forex koprusu   (watchdog_forex.ps1,   magic 550055)
#  3) Gun-ici koprusu (watchdog_scanner.ps1, magic 550066)
#
#  HER SEY YALNIZ FTMO 1513857844 hesabinda islem acar (hesap kilidi kodda).
#
#  KULLANIM:
#    1) Asagidaki UC YOLU kendi VPS kurulumuna gore duzenle.
#    2) MT5 terminallerini ac + FTMO hesabina giris yap + Algo Trading AC.
#    3) powershell -ExecutionPolicy Bypass -File vps-kit\vps-basla.ps1
#  DURDURMAK: vps-durdur.ps1  (veya klasorlere STOP dosyasi koy).
# ==========================================================================

# --- DUZENLE: kendi VPS yollarin -----------------------------------------
$FTMO_TERMINAL = "C:\Program Files\FTMO MetaTrader 5\terminal64.exe"
$GOLD_DIR      = "$env:USERPROFILE\Desktop\gold-structure-bot"
$BRIDGE_DIR    = "$env:USERPROFILE\Desktop\site\borsasanati-clone\mt5-bridge"
# -------------------------------------------------------------------------

$ErrorActionPreference = "Continue"
Write-Host "=== BORSA KRALI VPS BASLATICI ===" -ForegroundColor Cyan

if (-not (Test-Path $FTMO_TERMINAL)) {
  Write-Host "!!! FTMO terminal bulunamadi: $FTMO_TERMINAL" -ForegroundColor Red
  Write-Host "    vps-basla.ps1 icindeki FTMO_TERMINAL yolunu duzelt." -ForegroundColor Yellow
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

Write-Host ""
Write-Host "=== 3 bot baslatildi (ayri pencereler) ===" -ForegroundColor Cyan
Write-Host "Her pencerede: login=1513857844 + Hesap kilidi AKTIF gormelisin." -ForegroundColor Yellow
Write-Host "Yanlis hesap gorursen bot islem ACMAZ - terminal_path'i duzelt." -ForegroundColor Yellow
Write-Host "Saglik raporu: python vps-kit\vps_tani.py" -ForegroundColor Gray
