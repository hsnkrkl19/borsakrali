# Borsa Krali FOREX koprusu BEKCISI
# - Windows acilisinda Baslangic kisayolu bunu calistirir.
# - Bot cokerse / MT5 hazir degilken erken cikarsa 60 sn sonra yeniden baslatir.
# - MT5 terminali kapaliysa once onu acar.
# - Tek kopya: bot zaten calisiyorsa sessizce cikar (cift acilis olmaz).
# Durdurmak: mt5-bridge klasorune STOP dosyasi koy (bot emir acmaz)
#            veya bu pencereyi kapat + Baslangic kisayolunu sil (kalici).
$host.UI.RawUI.WindowTitle = "BK-Bekci-Forex (550055)"
Set-Location $PSScriptRoot

# 'borsakrali_mt5\.py' scanner'i YAKALAMAZ (nokta escape'li) - iki bekci karismaz
$zaten = Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
         Where-Object { $_.CommandLine -match 'borsakrali_mt5\.py' }
if ($zaten) {
    Add-Content watchdog_forex.log "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') zaten calisiyor (PID $($zaten.ProcessId)) - bekci cikti"
    exit
}

$MT5_EXE = "C:\Program Files\MetaTrader 5\terminal64.exe"

while ($true) {
    if (-not (Get-Process terminal64 -ErrorAction SilentlyContinue)) {
        if (Test-Path $MT5_EXE) {
            Add-Content watchdog_forex.log "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') MT5 terminali kapali - baslatiliyor"
            Start-Process $MT5_EXE
            Start-Sleep -Seconds 30   # terminal login olsun
        }
    }
    Add-Content watchdog_forex.log "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') bot baslatiliyor"
    & python -X utf8 borsakrali_mt5.py
    Add-Content watchdog_forex.log "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') bot cikti (exit=$LASTEXITCODE) - 60 sn sonra yeniden"
    Start-Sleep -Seconds 60
}
