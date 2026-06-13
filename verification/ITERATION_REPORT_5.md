# ITERATION_REPORT_5.md — TUR 5 (Test Kapsamı Genişletme + Ölçüm)

> **Tarih:** 2026-06-13 · **Branch:** `main` · **Mod:** Tam otonom
> **Guardrail:** ✅ Yalnız test eklendi (davranış değişmedi)

---

## 1. Sonuç

| | TUR 4 | TUR 5 |
|---|---|---|
| Test | 66 | **104 geçti / 104** (6 suite) |
| `formulaService.js` kapsam | %45 | **%92.7 stmt / %97.1 line / %97.8 func** ✅ ≥%90 |

**Kabul kriteri "kritik finansal modülde ≥%90 kapsam":** `formulaService.js` (çekirdek indikatör matematiği) için **karşılandı**.

---

## 2. Eklenen Testler (+38, davranış değişikliği YOK)

| Dosya | Test | Kapsam |
|---|---|---|
| `fundamentalScores.golden.test.js` (yeni) | 20 | `calculateRatios` (F/K, PD/DD, P/S, EV/EBITDA, borç/özkaynak, cari, asit-test, ROE, ROA, net/brüt/faaliyet marjı), `calculateAltmanZ`, `calculatePiotroskiF`, `pickField/latest/prev` |
| `formulaService.indicators2.golden.test.js` (yeni) | 18 | ADX, Ichimoku, Supertrend, StochasticFull, Fibonacci, priceSaturation, allEMAs, support/resistance, RSI-divergence |

- Hand-derivable olanlar **kesin değer** (Ichimoku 75, Fib 61.8/75/80.9, Stochastic 80/70, oranlar...).
- ADX/Supertrend gibi kompleksler **davranış-özellik** assert'i (yükseliş→bullish, +DI>−DI, geçerli aralık, warm-up→null).
- Negatif kâr → F/K null + ROE negatif (işaret/bölme koruması) doğrulandı.

---

## 3. Test Sonuçları

```
Test Suites: 6 passed, 6 total
Tests:       104 passed, 104 total
```

Kapsam (kritik modüller):
```
formulaService.js           | 92.71% stmt | 97.13% line | 97.77% func   ✅
fundamentalScoresService.js | 50.59% stmt (saf hesaplar kapalı; async Yahoo I/O hariç)
```

---

## 4. Not
- `fundamentalScoresService` saf hesaplar (oranlar/Altman/Piotroski) test edildi; `getFundamentalScores`/`fetchAllFundamentals` (canlı Yahoo I/O) unit-test edilmedi — bunlar mock/entegrasyon gerektirir (TUR 6+ integration adayı).
- `botEngine`/`mtfBacktest` saf fonksiyonları zaten golden test'li (exit/P&L/forward); tam dosya kapsamı async tick/ingest nedeniyle kısmi.

## 5. Kümülatif Durum (TUR 1→5)
- **104 golden test**, 6 suite, hepsi geçiyor.
- Güvenlik: dep critical/high backend 0 (canlı + doğrulandı).
- Doğrulanan: indikatör matematiği (≥%90), bot P&L/exit, backtest look-ahead, auth, frontend canlılık, canlı veri failover.
- Kalan: CI pipeline, integration/E2E, bot kill-switch, lint, vite-8/telegram modernizasyonu.
