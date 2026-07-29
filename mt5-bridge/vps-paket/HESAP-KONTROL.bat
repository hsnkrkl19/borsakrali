@echo off
chcp 65001 >nul
title BORSA KRALI - HESAP KONTROL (yalniz okur)
cd /d "%~dp0"
echo ============================================================
echo   MT5 HESAP KONTROLU  (hicbir emir gondermez, yalniz okur)
echo ============================================================
echo.
echo Bu, MT5 terminaline baglanip GERCEK hesap numarani yazar.
echo Config dosyalarindaki "allowed_account" bu numarayla AYNI olmali,
echo yoksa kopruler "HESAP KILIDI" deyip kapanir.
echo.

python -X utf8 -c "import MetaTrader5 as m; ok=m.initialize(); ai=m.account_info() if ok else None; ti=m.terminal_info() if ok else None; print('BAGLANTI:', 'OK' if ok else ('HATA ' + str(m.last_error()))); print('HESAP NO :', getattr(ai,'login','?')); print('SUNUCU   :', getattr(ai,'server','?')); print('BAKIYE   :', getattr(ai,'balance','?'), getattr(ai,'currency','')); print('ALGO TRADING:', 'ACIK' if getattr(ti,'trade_allowed',False) else 'KAPALI  <-- MT5 ustundeki Algo Trading dugmesine bas!'); m.shutdown()"

echo.
echo ------------------------------------------------------------
echo Yukaridaki HESAP NO'yu config dosyalarindaki allowed_account ile karsilastir:
echo    mt5-bridge\config.json           (forex koprusu   550055)
echo    mt5-bridge\config_scanner.json   (gun-ici tarayici 550066)
echo    mt5-bridge\config_all.json       (birlesik kopru)
echo    mt5-bridge\config_brain.json     (merkez hesap beyni)
echo Farkliysa dosyalari Not Defteri ile ac ve numarayi duzelt.
echo ------------------------------------------------------------
pause
