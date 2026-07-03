# ==========================================================================
#  BORSA KRALI - VPS DURDURUCU (uc botu birden durdurur)
# ==========================================================================
#  1) STOP dosyalari koyar (yeni emir acilmaz; acik pozisyon SL/TP broker'da).
#  2) Bekci + bot proseslerini kapatir.
#  Kalici durdurma icin Gorev Zamanlayici gorevini de kapat.
# ==========================================================================
$GOLD_DIR   = "$env:USERPROFILE\Desktop\gold-structure-bot"
$BRIDGE_DIR = "$env:USERPROFILE\Desktop\site\borsasanati-clone\mt5-bridge"

Write-Host "=== BORSA KRALI VPS DURDURUCU ===" -ForegroundColor Cyan

$damga = Get-Date -Format "yyyy-MM-ddTHH:mm:ss"
foreach ($p in @("$GOLD_DIR\STOP", "$BRIDGE_DIR\STOP", "$BRIDGE_DIR\STOP_SCANNER")) {
  "STOP $damga" | Out-File -Encoding ascii $p
}
Write-Host "STOP dosyalari kondu (yeni emir acilmaz)." -ForegroundColor Yellow

$patterns = 'watchdog_forex|watchdog_scanner|borsakrali_mt5|live\.py'
$procs = Get-CimInstance Win32_Process -Filter "Name='python.exe' or Name='powershell.exe' or Name='cmd.exe'" -ErrorAction SilentlyContinue |
         Where-Object { $_.CommandLine -match $patterns }
foreach ($pr in $procs) {
  Write-Host "kapatiliyor PID $($pr.ProcessId): $($pr.Name)" -ForegroundColor DarkGray
  Stop-Process -Id $pr.ProcessId -Force -ErrorAction SilentlyContinue
}

Write-Host "=== Durduruldu. Yeniden baslatmak: vps-basla.ps1 ===" -ForegroundColor Cyan
Write-Host "(MT5 terminalleri ACIK kaldi - acik pozisyon SL/TP broker'da korunur.)" -ForegroundColor Gray
