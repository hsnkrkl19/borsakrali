# ITERATION_REPORT_3.md — TUR 3 (Bağımlılık Açıkları — AGRESİF)

> **Tarih:** 2026-06-13 · **Branch:** `verify-and-fix` · **Mod:** Tam otonom · **Yaklaşım:** Agresif (kullanıcı seçimi)
> **Guardrail:** ✅ Branch · ✅ Yalnız yerel commit (**PUSH/DEPLOY YOK**) · ✅ Her adımda test+boot doğrulaması · ✅ Kaynak kod davranışı değişmedi (yalnız bağımlılıklar)

---

## 1. Sonuç — Kritik/Yüksek = 0 (backend), dev-only kaldı (frontend)

| | Önce | Sonra | Critical | High |
|---|---|---|---|---|
| **Backend** | 47 | **17** | **4 → 0** ✅ | **16 → 0** ✅ |
| **Frontend** | 18 | **2** | **0 → 0** ✅ | **9 → 1** (dev-only) |

**Kabul kriteri "kritik açık = 0":** backend ✅ tam; frontend ✅ (kalan 1 high yalnız dev-server, prod'u etkilemez).

---

## 2. Yapılan Değişiklikler (yalnız bağımlılık — kaynak kod değişmedi)

### Backend (`backend/package.json` + lock)
| Değişiklik | Tür | Neden |
|---|---|---|
| `axios` ^1.6.5 → **^1.17.0** | direct bump | SSRF/prototype-pollution/ReDoS advisory'leri |
| `fast-xml-parser` ^4.3.4 → **^5.8.0** | direct (major) | **critical** DoS/entity-injection; tek kullanım `webScraperService` (XMLParser opsiyonları v5-uyumlu, boot+build ile doğrulandı) |
| `overrides.protobufjs` 7.5.4 → **7.6.4** | override | firebase-admin/grpc altı **critical** RCE; major 7 korundu (gRPC uyumlu) |
| `overrides node-telegram-bot-api.form-data` → **2.5.5** | nested override | `request` zinciri **critical** form-data (aynı major 2, API-uyumlu) |
| **`bcrypt` (native) KALDIRILDI** | remove | **Kullanılmıyor** (tüm kodda yalnız `bcryptjs`, o da telegram-bot.js'te). `tar` + `@mapbox/node-pre-gyp` **high**'ları gitti; native-compile yok (Render build hızlanır) |
| `npm audit fix` (semver-safe) | auto | lodash/minimatch/undici/picomatch/qs/tough-cookie... |

### Frontend (`frontend/package.json` + lock)
| Değişiklik | Neden |
|---|---|
| `axios` ^1.6.5 → **^1.17.0** | shipped bundle SSRF/proto-pollution |
| `npm audit fix` (semver-safe) | socket.io-parser, lodash, minimatch, picomatch, flatted, @xmldom/xmldom, rollup |

---

## 3. Doğrulama (kanıt)

- **Backend — her dep adımından sonra:**
  - `52/52 golden test geçti` (formulaService + botEngine + mtfBacktest)
  - Sunucu boot smoke-test → **HTTP 200** (cron/MTF/liquidation/telegram init dahil, hata yok). `bcrypt` kaldırma boot ile ampirik doğrulandı (authService eksik-modül hatası vermeden yüklendi).
- **Frontend:** `vite build` → **BUILD OK** (throwaway `dist-verify` outDir; **commit'li `frontend/dist` hiç değiştirilmedi** — prerender/AdSense tuzağı önlendi).

---

## 4. Kalan (düşük risk — belgelendi)

| Kalan | Önem | Neden bırakıldı |
|---|---|---|
| Backend 17 moderate | moderate | Kritik/yüksek değil; çoğu transitive, semver-safe fix yok |
| Frontend `esbuild` + 1 moderate | high (dev-only) | **Yalnız `vite dev` (geliştirme sunucusu)** — prod build çıktısını / borsakrali.com'u / mobil app'i ETKİLEMEZ. Fix yalnız **vite 8** (major, 3 sürüm atlama → build+prerender pipeline riski). Ayrı, dikkatli test'li görev olarak önerildi |
| `node-telegram-bot-api@0.64` `request` zinciri | (form-data critical FİX'lendi) | `request` deprecated, yamasız; tam temizlik için `node-telegram-bot-api@1.1.0` (major) gerek — ayrı process + güvenilir api.telegram.org endpoint → düşük gerçek risk; telegram-test'li ayrı görev |

---

## 5. ⛔ DEPLOY KAPISI (insan onayı)

Tüm değişiklikler **`verify-and-fix` branch'inde, yalnız yerel**. `main`'e **push/deploy YAPILMADI**.

Bu dependency değişiklikleri prod'a gitmeden:
- Bu commit'ler `main`'e merge + push edilmeli (Render auto-deploy tetikler).
- `frontend/dist` dokunulmadığı için frontend yeniden build gerektirmez (Render zaten frontend build etmiyor).
- **Onayın gerekiyor.** (Bkz. sonraki adım.)

**Commit'ler (TUR 3):** `11922bb` (backend), `db971a6` (frontend).

---

## 6. Sonraki (TUR 4 önerisi)
- Deploy onayı → merge/push (veya kullanıcı kendi yapar).
- D6 frontend (sahte-canlı bildirim / memory-leak), auth derin yetki, scorer canlı-bar repaint.
- (Opsiyonel, ayrı test'li) vite 8 mig(frontend dev highs), node-telegram-bot-api 1.1.0.
