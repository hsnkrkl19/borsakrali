# ITERATION_REPORT_7.md — TUR 7 (Kalan Maddeler — "Hepsini Bitir")

> **Tarih:** 2026-06-14 · **Branch:** `main` · **Mod:** Tam otonom + Ultracode
> **Guardrail:** ✅ Her değişiklik test+boot ile doğrulandı · ✅ Davranış-değişikliği deploy'u onaylı · ✅ Kanıtlı

Bir understand+design workflow (6 ajan) ile bot motorları + test/upgrade seam'leri haritalandı, sonra her madde uygulanıp doğrulandı.

---

## 1. Tamamlanan maddeler

### ✅ Bot kill-switch + max-drawdown + günlük-zarar (D5, checklist F)
- **`botRiskGuard.js`** (yeni, saf): manuel pause + tepe-noktası drawdown (%25) + günlük zarar (%10) devre kesici.
- 3 bot motorunun **OPEN yollarına** guard: BIST `ingestSnapshot` + `tick` (pending→open fill), Kripto `ingestSnapshot`, TEMA34 `runDaily` girişleri.
- **Çıkış/yönetim halt'tan bağımsız** — halted portföy her zaman kapatılabilir (risk azaltılır, kilitlenmez).
- `tradingEnabled` portföy alanı (createPositionStore + tema34Store) + `setTradingEnabled`; **pause/resume admin endpoint** (3 route); `getStatus.risk`.
- **11 golden + 3 integration test** (temp `BOT_DATA_DIR` full-cycle: sinyal→giriş→tick→kâr-kapanış + kill-switch gating). Paper; gerçek-para yok.
- **CANLIDA** (deploy edildi, `/api/trading-bot/status` 200 + portföy doğrulandı).

### ✅ Integration testleri (Faz 4)
`botEngine.integration.test.js` — tam pipeline + kill-switch davranışı uçtan uca.

### ✅ Failover testleri (D1, checklist B)
`livedataFailover.golden.test.js` (5) — `fetchBist100/30` Yahoo boş/throw → İş Yatırım fallback (`stale:true`, `source:'isyatirim'`), retry-yok asimetrisi; Yahoo başarılı→fallback yok; İş Yatırım yetersiz→null.

### ✅ node-telegram-bot-api kaldırıldı (güvenlik)
Kaynak **hiçbir yerde import etmiyor** (telegram axios ile dirket HTTP). Kaldırınca **−122 paket** + deprecated `request` zinciri tamamen gitti. **Backend audit moderate 17→11, critical/high 0.** CANLIDA.

### ⏸️ vite 5→8 — ATTEMPTED, sonra ERTELENDI (kanıtlı)
- vite 8 + plugin-react 6 **yerelde (Windows) çalıştı**: build OK (10 chunk), **frontend audit 0/0/0** (esbuild dev açıkları temizlendi). Config rolldown'a uyarlandı (manualChunks fonksiyon biçimi + `minify:true`/oxc).
- **ANCAK:** Linux CI'da `npm ci` rolldown/emnapi **native-dep lockfile uyumsuzluğu** ile başarısız (Windows'ta üretilen lock Linux'ta senkron dışı — `@emnapi/*` drift; 2 kez kırmızı). Windows'tan güvenilir cross-platform lock üretilip doğrulanamıyor.
- **Karar:** geri alındı (vite 5'e dönüldü) → CI yeşil. Kazanım yalnız **DEV-ONLY** esbuild/vite açığı (prod/shipped/mobil app ETKİLENMEZ); maliyet kırmızı CI → kötü takas.
- **Öneri:** vite 8, Linux'ta-üretilen-lock ile ayrı + dikkatli bir görev olarak yapılmalı (ya da CI lock-üretimini Linux'a taşı).

---

## 2. Test & Audit (final)
```
Backend:  Test Suites: 9 passed · Tests: 123 passed   (104 → 123)
Backend audit:  critical=0  high=0  moderate=11
Frontend audit: critical=0  high=1(esbuild, DEV-ONLY)  moderate=1   (vite-5)
```
Yeni testler: botRiskGuard (11) + botEngine.integration (3) + livedataFailover (5) = +19.

## 3. Deploy
- Commit'ler: kill-switch (`30e36c2`) · failover (`9e7f12e`) · telegram-removal (`88d1124`) → push + Render deploy LIVE (`2e3f73b` tabanlı). borsakrali.com sağlıklı (health OK, bot-status 200, bist100 gerçek veri). Backend CI yeşil.
- vite-8 (`2e3f73b`)+lock-fix(`75c653a`) → CI frontend kırmızı → **revert (`0f3f453`)** → CI yeşil (vite-5).

## 4. Kabul Kriterleri (TUR 1→7 kümülatif)
| Kriter | Durum |
|---|---|
| Golden finansal testler | ✅ 123 |
| Kritik modül ≥%90 kapsam (CI kilidi) | ✅ formulaService %92.7 |
| CI yeşil + her commit | ✅ (vite-8 revert sonrası) |
| Güvenlik critical=0 (backend canlı + CI kilidi) | ✅ |
| Auth/authorization | ✅ |
| Bot paper full-cycle + P&L + **kill-switch + max-drawdown** | ✅ **(tamamlandı)** |
| Look-ahead/repaint yok | ✅ |
| Dış API failover testi | ✅ |
| Integration test | ✅ |
| secret kodda değil | ✅ |
| Linter | CI'da geçiyor (info) |

**Kalan (bilinçli ertelenmiş, blocker değil):** vite-8 (cross-platform lock), E2E browser testleri (Playwright altyapısı), backend 11 moderate dep (kritik değil), frontend esbuild dev-only high.
