# ITERATION_REPORT_1.md — TUR 1

> **Tarih:** 2026-06-13 · **Branch:** `verify-and-fix` · **Mod:** Tam otonom döngü
> **Kapsam:** Faz 0 (envanter) + Faz 1 (doğrulama harness'i kuruldu) + yüksek-riskli domainlerde ilk doğrulama geçişi.
> **Guardrail durumu:** ✅ Ayrı branch · ✅ Yalnızca yerel commit (push YOK) · ✅ Gerçek-para/canlı emir YOK · ✅ Çalışan davranış değiştirilmedi (sadece test + belge eklendi) · ✅ Bulgular kanıtla raporlandı.

---

## 1. Skor Tablosu (domain × durum)

| Domain | Durum | Özet |
|---|---|---|
| D1 — Canlı Veri | 🟡 Kısmen | İndikatör girdileri doğrulandı; staleness/failover/null-NaN testleri TUR 2 |
| D2 — Depolama/Cache | 🟡 Kısmen | `createPositionStore` denetlendi (sağlam); gap-detection + race TUR 2 |
| D3 — Teknik Analiz | 🟢 Büyük ölçüde GEÇTİ | **31 golden test ✓**; `formulaService` + `liveDataService` indikatörleri doğrulandı & tutarlı. Look-ahead/repaint TUR 2 |
| D4 — Temel Analiz | 🟢/🟡 | Altman/Piotroski/Beneish golden ✓; oran servisleri + mali tablo parse TUR 2 |
| D5 — Botlar | 🟡 Kısmen | Güvenlik kontrolleri doğrulandı (aşağıda); P&L/exit derin + backtest look-ahead TUR 2 |
| D6 — Frontend | ⚪ İncelenmedi | TUR 3 |
| D7 — Altyapı/Güvenlik | 🟠 Bulgu var | secret-in-git **yanlış alarm düzeltildi**; **dep vuln'ları (4 critical/25 high)**; auth derin TUR 2 |
| D8 — Test/Kalite | 🟡 Kısmen | Harness kuruldu (0→31 test); kapsam genişletilecek; CI yok |

---

## 2. Bulgular (önem dereceli)

### 🟢 Doğrulanan / İyi (kanıtlı)
- **İndikatör çekirdeği doğru.** `formulaService.js` — EMA, RSI(Wilder), MACD(12/26/9), ATR(Wilder), Bollinger(popülasyon σ), Stochastic, Williams%R, OBV, VWAP, CCI, Altman Z, Piotroski, Beneish — **31/31 golden test geçti** (elle türetilmiş kesin değerler / kanonik formül). Edge-case'ler (warm-up→null, bölme-sıfır→nötr) doğru ele alınıyor.
- **İndikatör tutarlılığı.** `liveDataService.js` inline indikatörleri (`calculateEMA/RSI/MACD/ATR/Bollinger/StochRSI/WilliamsR/CCI/OBV`) `formulaService` ile **algoritmik olarak tutarlı**. Eski `macd * 0.8` hatası **gitmiş** (gerçek 9-EMA sinyal hattı). Tek fark: live tarafı RSI/Williams%R/CCI'yi tam sayıya yuvarlıyor (kayıp küçük).
- **Bot güvenlik kontrolleri (D5 — kanıtlı):**
  - **İdempotency ✓** — `findSignalLogBySymbolDatePhase` (sinyal-log dedup) + `findBySymbol(...)→continue` (aynı sembolde çift pozisyon açmaz). Çift cron-tick double-open yapmaz.
  - **Risk limitleri ✓** — `MAX_CONCURRENT_POSITIONS:20` (uygulanıyor), pozisyon boyutu = nakit %'si, **nakit guard** (negatif bakiye yok), **komisyon + slippage modellenmiş** (backtest gerçekçiliği).
  - **Sahte-stop fix ✓** — çıkış, tek anlık fiyatla değil **günün gerçek low/high**'ıyla doğrulanıyor.
  - **Admin-gated ✓** — `/tick`, `/reset`, `/ingest` hepsi `requireAdmin` arkasında; gerçek-emir endpoint'i yok.
- **Secret yönetimi temiz.** `.env`, `.x-cookies.json`, `users.json`, `users.enc`, `.env.production` git'te **YOK** (index + history doğrulandı); yalnızca `.env.example` commit'li. `.gitignore` doğru çalışıyor.

### 🟠 Yüksek
- **Bağımlılık güvenlik açıkları (checklist I).** `npm audit`:
  - **Backend: 47 (4 critical, 16 high, 26 moderate, 1 low)** / 951 dep
  - **Frontend: 18 (0 critical, 9 high, 9 moderate)** / 531 dep
  - **Critical paketler:** `fast-xml-parser` (DoS/entity-injection, **direct**), `protobufjs` (RCE, transitive — firebase-admin/grpc), `form-data` (unsafe boundary, transitive), `request` (SSRF, deprecated transitive).
  - **`axios` (direct, ^1.6.5)** — çok sayıda SSRF/prototype-pollution/ReDoS advisory'si. **En yüksek değerli + görece güvenli upgrade.**
  - **`sequelize` (high, SQLi)** — yalnızca **atıl `server.js`**'te; canlı `server-live.js` DB kullanmıyor → gerçek prod etkisi düşük ama ağaçta.
  - **Aksiyon (TUR 2):** kör `audit fix --force` YOK (kırıcı). Hedefli, test-doğrulamalı upgrade: önce `axios` + `fast-xml-parser`; transitive critical'lar için parent (firebase-admin/twitter-scraper) değerlendir. **Deploy öncesi kullanıcı onayı.**
- **Test kapsamı 0→kısmi.** Kritik finansal modüllerin çoğu hâlâ testsiz; ≥%90 hedefi uzak. Harness kuruldu, genişletilecek. CI pipeline yok.

### 🟡 Orta
- **İndikatör implementasyon tekrarı.** Aynı indikatörler ≥3 yerde (`formulaService`, `liveDataService` inline, `frontend/technicalIndicators`). Şu an tutarlı ama **divergence riski** (biri düzeltilince diğeri unutulur). Bakım borcu — ortak kütüphaneye konsolidasyon önerilir (TUR 3, dikkatli).
- **Bot kill-switch / max-drawdown / günlük-zarar yok.** Portföy seviyesi devre-kesici görülmedi (`CRON_DISABLED` env tüm cron'ları kapatır ama bot-özel pause/kill yok). Paper olduğu için etki düşük; checklist F maddesi olarak açık.
- **Para matematiği float (Decimal değil).** Bot P&L `.toFixed(4)/.toFixed(2)` ile JS float; kümülatif yuvarlama drifti mümkün. Paper → düşük etki.
- **JSON persistence — lock yok.** `createPositionStore` read-modify-write senkron (tek-çağrı atomik) ama engine'in `await` sınırları arasında race mümkün; tek-süreçte düşük olasılık.

---

## 3. Yapılan Tamirler (dosya / ne / neden)

> **Not:** Bu turda **kod davranışı değiştiren tamir YOK** — henüz bir davranış-bug'ı bulunmadı (bulunanlar dökümante edildi). Eklenenler mevcut davranışı değiştirmez (guardrail #3).

| Dosya | Değişiklik | Neden |
|---|---|---|
| `backend/jest.config.js` (yeni) | Jest config — `tests/` ile sınırlı | Harness; ad-hoc `test_*.js`'leri çalıştırmasın |
| `backend/tests/verification/formulaService.golden.test.js` (yeni) | 31 golden test | Finansal çekirdek regresyon ağı |
| `verification/SYSTEM_MAP.md` (yeni→düzeltildi) | Mimari harita; **R1 false-positive düzeltildi** | Faz 0 çıktısı + kanıtsız "kritik" iddiasını geri al |
| `verification/FEATURE_REGISTRY.md` (yeni→düzeltildi) | 8 domain özellik envanteri | Faz 0 çıktısı |
| `verification/ITERATION_REPORT_1.md` (bu dosya) | TUR 1 raporu | Döngü protokolü |

**Commit:** `5585899` (harness + Faz 0 belgeleri). Bu rapor ayrı commit'lenecek.

---

## 4. Test Sonuçları (önce / sonra)

| | Önce | Sonra |
|---|---|---|
| Backend otomatik test | **0** (jest kurulu, test yok) | **31 geçti / 31** (formulaService golden) |
| Çalışma süresi | — | ~0.7 sn |
| Regresyon | — | Çekirdek indikatör + temel skor matematiği kilitlendi |

```
Test Suites: 1 passed, 1 total
Tests:       31 passed, 31 total
```

---

## 5. Kalan Açık Maddeler / Blocker / İnsan Müdahalesi

- **İnsan onayı gerekecek (henüz tetiklenmedi):** dependency upgrade → **prod deploy** (push). Bulunduğunda DUR + sor.
- **Açık (TUR 2):** look-ahead/repaint (scorer'lar), backtest geçerliliği (survivorship/look-ahead), bot exit/P&L derin doğrulama, canlı veri staleness/failover/null-NaN/spike, auth derin (JWT/refresh/guest/admin), kill-switch eksikliği.
- **Açık (TUR 3):** D6 frontend (canlı render/memory leak/sahte-canlı), indikatör konsolidasyonu, CI kurulumu.
- **Blocker:** Yok.

---

## 6. Sonraki Tur Planı (TUR 2)

1. **D5 derin:** bot exit/P&L matematiği satır-satır + backtest look-ahead/survivorship/slippage doğrulama; mümkünse golden P&L testleri. Kill-switch eksikliğini değerlendir.
2. **D3:** scorer'larda look-ahead/repaint denetimi — hesap o anki (oluşmakta olan) bardan sonrasını kullanıyor mu? `liveDataService` indikatörlerini de golden test kapsamına al.
3. **D1:** `liveDataService` staleness/timestamp + failover/retry/timeout + null/negatif/0/NaN/spike + piyasa-kapalı; test edilebilir kısımlara test.
4. **D7:** hedefli dep upgrade planı (axios + fast-xml-parser önce) — yerel test, **deploy onayı iste**. `npm audit` sonrası regresyon.
5. Kabul kriterlerini yeniden değerlendir, ITERATION_REPORT_2 üret.
