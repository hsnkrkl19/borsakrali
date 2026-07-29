@echo off
chcp 65001 >nul
title BORSA KRALI - ESKI POZISYON TEMIZLIGI (bir seferlik)
cd /d "%~dp0"
echo ============================================================
echo   ESKI POZISYON TEMIZLIGI
echo   Merkezi beyin oncesi acilmis TUM acik pozisyonlari kapatir.
echo   Beyin bu eski defter temizlenmeden canliya gecmez.
echo ============================================================
python -X utf8 "mt5-bridge\pozisyon_temizle.py"
echo.
pause
