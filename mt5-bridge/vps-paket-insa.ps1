# BORSA KRALI merkezi-beyin VPS paketi inşacısı.
# Beyaz-liste kopyalama + kural taraması + Masaüstü'ne tek ZIP.
# Kullanıcı isteği (2026-07-29): token + hesap no pakete GÖMÜLÜR ki VPS'te
# hiçbir şey elle girilmesin. Token repo'ya asla yazılmaz; inşa anında yerel
# (git-dışı) config.json'dan okunur ve yalnız ZIP içindeki config_all.json'a girer.
param([int]$HesapNo = 1514083666)
$ErrorActionPreference = "Stop"
$SRC = Split-Path -Parent $MyInvocation.MyCommand.Path
$STAMP = (Get-Date).ToString("yyyy-MM-dd")
$STAGE = Join-Path $env:TEMP ("bk-vps-paket-" + $STAMP)
$ZIP = Join-Path ([Environment]::GetFolderPath("Desktop")) "BORSA-KRALI-VPS-MERKEZI-BEYIN-$STAMP.zip"
$ROOTNAME = "BORSA-KRALI-VPS-MERKEZI-BEYIN-$STAMP"
$DST = Join-Path $STAGE $ROOTNAME

if (Test-Path $STAGE) { Remove-Item -Recurse -Force $STAGE }
New-Item -ItemType Directory -Force $DST | Out-Null

# ADIM 1 - paket kökü: vps-paket kök dosyaları (yalnız 1. seviye)
robocopy "$SRC\vps-paket" "$DST" /LEV:1 /XF *.log *.pyc | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy vps-paket kok hatasi: $LASTEXITCODE" }

# ADIM 2 - altin-botu (test/veri/derleme artigi haric)
robocopy "$SRC\vps-paket\altin-botu" "$DST\altin-botu" /E /XD __pycache__ data /XF *.log *.pyc test_*.py | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy altin-botu hatasi: $LASTEXITCODE" }

# ADIM 3 - mt5-bridge BEYAZ LISTE (canli calisma dizininden yalniz bu dosyalar)
$WHITELIST = @(
  "account_brain.py", "borsakrali_account_brain.py", "borsakrali_mt5.py",
  "borsakrali_mt5_all.py", "borsakrali_mt5_scanner.py", "mt5_brain_adapter.py",
  "trade_guard.py", "hesap_guncelle.py", "pozisyon_temizle.py", "preflight.py", "diag.py",
  "diag_trail.py", "requirements.txt", "README.md", "configure-secrets.ps1",
  "brain-start-gate.ps1", "config.example.json", "config_all.example.json",
  "config_brain.example.json", "config_scanner.example.json",
  "risk_profile.aggressive.opt-in.example.json", "run.bat", "run_scanner.bat",
  "watchdog_all.ps1", "watchdog_brain.ps1", "watchdog_forex.ps1",
  "watchdog_gold.ps1", "watchdog_scanner.ps1"
)
New-Item -ItemType Directory -Force "$DST\mt5-bridge" | Out-Null
foreach ($f in $WHITELIST) {
  Copy-Item (Join-Path $SRC $f) (Join-Path "$DST\mt5-bridge" $f)
}

# ADIM 3b - kullanima hazir config_all.json: token yerel git-disi config'ten,
# hesap kilidi parametreden. account_server bos kalir; BASLAT icindeki
# hesap_guncelle.py sunucuyu girisli terminalden otomatik okur. dry_run=true
# baslar (beyin taban cizgisini yazar); canliya gecis tek tik CANLIYA-GEC.bat.
$localCfgPath = Join-Path $SRC "config.json"
if (Test-Path $localCfgPath) {
  $localCfg = Get-Content $localCfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $tok = [string]$localCfg.exec_token
  if ($tok -and $tok -notmatch "(?i)BURAYA|ENV_VEYA|PLACEHOLDER|CHANGE_ME") {
    $all = Get-Content (Join-Path $SRC "config_all.example.json") -Raw -Encoding UTF8 | ConvertFrom-Json
    $all.exec_token = $tok
    $all.allowed_account = $HesapNo
    $all.account_server = ""
    $all.backend_url = "https://www.borsakrali.com"
    $all.terminal_path = ""
    $all.dry_run = $true
    $enc = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText((Join-Path "$DST\mt5-bridge" "config_all.json"),
      ($all | ConvertTo-Json -Depth 100) + [Environment]::NewLine, $enc)
    Write-Host "[OK] config_all.json pakete gomuldu (token + hesap $HesapNo, dry_run=true)"
  } else {
    Write-Host "[!] Yerel config.json'da kullanilabilir token yok - paket tokensiz insa edildi" -ForegroundColor Yellow
  }
} else {
  Write-Host "[!] Yerel config.json yok - paket tokensiz insa edildi" -ForegroundColor Yellow
}

# ADIM 4 - kural taramasi: yasakli dosya kalmamali (cikti BOS olmali)
# (config_all.json bilincli istisna: kullanici istegiyle hazir-dolu gomuluyor)
$bad = Get-ChildItem $DST -Recurse -Force | Where-Object {
  $_.Name -in @("STOP", "STOP_SCANNER", "STOP_MASTER", "scanner_state.json", "MT5") -or
  $_.Name -like "*.log" -or $_.Name -like "*.pyc" -or $_.Name -eq "__pycache__" -or
  $_.Name -like "*.lock" -or $_.Name -like "test_*.py" -or
  ($_.Name -like "config*.json" -and $_.Name -notlike "*.example.json" -and $_.Name -ne "config_all.json")
}
if ($bad) { $bad | ForEach-Object { Write-Host "IHLAL: $($_.FullName)" }; throw "Paket kural taramasi basarisiz" }

# ADIM 5 - token taramasi: config_all.json DISINDA hicbir dosyada gercek token olamaz
$tokenHits = Get-ChildItem $DST -Recurse -File |
  Where-Object { $_.Name -ne "config_all.json" } |
  Select-String -Pattern "exec_token.{0,10}[A-Za-z0-9]{24,}" -SimpleMatch:$false |
  Where-Object { $_.Line -notmatch "ENV_VEYA|BURAYA|CHANGE_ME|PLACEHOLDER" }
if ($tokenHits) { $tokenHits | ForEach-Object { Write-Host "TOKEN SIZINTISI: $($_.Path):$($_.LineNumber)" }; throw "Token taramasi basarisiz" }

# ADIM 6 - Masaustune tek ZIP
if (Test-Path $ZIP) { Remove-Item -Force $ZIP }
Compress-Archive -Path $DST -DestinationPath $ZIP
$size = [math]::Round((Get-Item $ZIP).Length / 1MB, 2)
$count = (Get-ChildItem $DST -Recurse -File).Count
Write-Host "OK: $ZIP ($size MB, $count dosya)"
