# ITERATION_REPORT_2.md — TUR 2

> **Tarih:** 2026-06-13 · **Branch:** `verify-and-fix` · **Mod:** Tam otonom döngü
> **Kapsam:** D5 (bot P&L/exit derin), D3 (look-ahead/backtest), D1 (canlı veri sağlamlığı).
> **Guardrail:** ✅ Branch · ✅ Yalnız yerel commit (push YOK) · ✅ Davranış değiştiren tamir YOK (sadece +10 test) · ✅ Kanıtlı.

---

## 1. Skor Tablosu (güncel)

| Domain | TUR 1 | TUR 2 | Not |
|---|---|---|---|
| D1 — Canlı Veri | 🟡 | 🟢/🟡 | retry+failover+timestamp+stale-flag ✓; kaynak null/NaN validasyon gap |
| D2 — Depolama | 🟡 | 🟡 | store sağlam; race/gap-detection açık |
| D3 — Teknik Analiz | 🟢 | 🟢 | **backtest look-ahead TEMİZ (golden)**; indikatör 4-kopya (bakım) |
| D4 — Temel Analiz | 🟢/🟡 | 🟢/🟡 | golden ✓; oran servisleri açık |
| D5 — Botlar | 🟡 | 🟢/🟡 | **P&L doğru + exit golden (52 test)**; kill-switch/cost-realism gap |
| D6 — Frontend | ⚪ | ⚪ | TUR 3 |
| D7 — Altyapı/Güvenlik | 🟠 | 🟠 | dep vuln'ları (aksiyon bekliyor) |
| D8 — Test/Kalite | 🟡 | 🟡 | 0→**52 test**; CI yok |

---

## 2. Bulgular

### 🟢 Doğrulanan (kanıtlı)
- **Bot P&L matematiği doğru.** `closePosition`: `realizedPnL = shares·(exit−entry) − girişKom − çıkışKom`; nakit korunumu (cash_final = cash_init + realizedPnL); win/loss/winRate tutarlı. İncelemeyle + golden ile doğrulandı.
- **Sahte-stop exit logic kilitlendi** — `detectBistExit` + `priceInBand` 11 golden test (gün low/high doğrulama, bozuk-tick reddi, giriş-günü koruması).
- **Backtest look-ahead TEMİZ** — `mtfBacktestService`: sinyal context `endTime=cutoff`, outcome `startTime=cutoff+1` (kesişmez); aynı-bar stop+target → **tutucu stop-önce**. `evaluateForward`/`aggregateStats` golden test'li.
- **Canlı veri sağlamlığı** — Yahoo retry (3x) + İş Yatırım failover (hisse+endeks) + evrensel `timestamp` + endeks fallback'te **`stale:true`** (bayat veri canlı gösterilmiyor).

### 🟠 Yüksek (aksiyon bekliyor)
- **Bağımlılık açıkları** (TUR 1'den taşındı) — backend 4 critical/16 high, frontend 9 high. **TUR 3'ün hedefi.** Konservatif plan: `axios` + `fast-xml-parser` (direct) güncelle → test + sunucu smoke-test → deploy onayı.

### 🟡 Orta (sim-realism / bakım — davranış bug'ı değil)
- **Backtest survivorship bias** — `getTopNTradable` *bugünün* evrenini geçmişe uygular; delist olanlar dışlanır → sonuçlar survivor-yanlı.
- **Backtest maliyet yok** — `evaluateForward` komisyon/slippage uygulamaz (canlı bot uygular). Kalibrasyon için kabul edilebilir; kullanıcıya "getiri" olarak sunulursa iyimser.
- **Exit-fill optimizmi** — bot stop/target'ı *tam* o fiyattan doldurur (gap-through çıkış slippage'i yok); sonuçları hafif iyimserleştirir.
- **İndikatör 4-kopya** — formulaService / liveDataService / mtfBacktest / frontend; tutarlı ama divergence riski → konsolidasyon önerilir.
- **Kaynak fiyat validasyonu** — null/0/NaN/spike kaynakta yakalanmıyor; bot `priceInBand` ile korunuyor ama diğer tüketiciler (dashboard/sinyal) değil.
- **Bot kill-switch/max-drawdown/günlük-zarar yok** (paper→düşük etki); para matematiği float; retry sabit-gecikme (exponential değil).

---

## 3. Yapılan Tamirler

> Yine **kod davranışı değiştiren tamir YOK** — bulunan her şey ya doğru ya da dökümante edilmiş sim-realism/bakım notu. Eklenen: **+10 golden test** (mevcut davranışı değiştirmez).

| Dosya | Değişiklik |
|---|---|
| `tests/verification/botEngine.exit.golden.test.js` (yeni) | 11 test — exit/sahte-stop/priceInBand |
| `tests/verification/mtfBacktest.golden.test.js` (yeni) | 10 test — evaluateForward/aggregateStats |

**Commits:** `4445133` (exit testleri), `b5eafd0` (backtest testleri).

---

## 4. Test Sonuçları (önce / sonra)

| | TUR 1 sonu | TUR 2 sonu |
|---|---|---|
| Test | 31 | **52 geçti / 52** |
| Süre | ~0.7 sn | ~1 sn |

```
Test Suites: 3 passed, 3 total
Tests:       52 passed, 52 total
```

---

## 5. Kalan / Blocker / İnsan Onayı

- **İnsan onayı (TUR 3):** dep upgrade → **prod deploy**. Konservatif upgrade'i yerel yapıp test edeceğim; deploy'u onayınla.
- **Açık:** D6 frontend (canlı render/memory-leak/sahte-canlı bildirim), auth derin (JWT/refresh/guest/admin yetki), scorer canlı-bar repaint, fundamentalScoresService oranları, CI kurulumu.
- **Blocker:** Yok.

---

## 6. Sonraki Tur (TUR 3)
1. **Bağımlılık açıkları (onaylı yaklaşım):** axios + fast-xml-parser güncelle → 52 test + boot smoke-test → kanıt → deploy onayı iste.
2. **D6 / auth:** frontend canlı-veri sahte-canlı bildirimi + auth yetki sınırları.
3. (Opsiyonel) backtest'e komisyon/slippage + survivorship notu; kaynak fiyat validasyonu; bot kill-switch.
