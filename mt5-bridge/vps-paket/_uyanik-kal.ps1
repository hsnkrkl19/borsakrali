# ── SISTEM UYANIK TUTUCU (2026-08-11) ────────────────────────────────────────
# Kullanici karari: "menteşe (kapak) kapaninca bilgisayar kapanmasin, islemler
# ve sistemler acik kalsin."
#
# Bu makine Modern Standby (S0 Low Power Idle) kullanir. powercfg ile
# "kapak = hicbir sey yapma" + "uyku = asla" ayarlandi; ama Modern Standby
# sinsidir: kapak kapaninca ekran kapanip sistem AWAY-MODE'a girse bile CPU
# ve arka plan surecleri kisitlanmasin diye bu surec SetThreadExecutionState
# ile sistemi SURE-KLI uyanik + away-mode'da tutar.
#
# ES_CONTINUOUS (0x80000000) | ES_SYSTEM_REQUIRED (0x00000001)
#   | ES_AWAYMODE_REQUIRED (0x00000040) = 0x80000041
# Bu surec yasadigi surece sistem uyumaz. _otobaslat oto-restart eder.

Add-Type -Name Power -Namespace Win -MemberDefinition @'
[DllImport("kernel32.dll", SetLastError = true)]
public static extern uint SetThreadExecutionState(uint esFlags);
'@

$ES = 0x80000041
while ($true) {
  # Bayragi periyodik yenile (bazi surumler tek cagrida dusurebiliyor).
  [void][Win.Power]::SetThreadExecutionState($ES)
  Start-Sleep -Seconds 60
}
