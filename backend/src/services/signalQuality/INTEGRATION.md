# signalQuality — Entegrasyon Durumu & Rehber

## Şu an ne DURUMDA?

Ortak kalite katmanı **kuruldu, test edildi (55/55) ve 5 motora fail-safe
"shadow gözlem" kancası eklendi.** Kancalar **yayın kararını DEĞİŞTİRMEZ** —
sadece her sinyal için kalibre güveni/rejimi/edge'i hesaplar ve loglar. Yani
canlıya çıkmak sinyal davranışını aynen korur; arka planda kalibrasyon verisi
ve "yeni katman ne derdi" kaydı birikir.

Kancalar eklendi:
- `cryptoSignalsService.js` (cryptoScorer) · `mtfScorer.js` · `proEngine.js`
- `bistSignals/bistScoreEngine.js` · `beast/beastEngine.js`

Her kanca `try { require('.../signalQuality/bridge').observe({...}) } catch(_){}`
biçiminde — tanımsız değişkende bile sinyal akışını kıramaz.

## Mod bayrağı (env: `SIGNAL_QUALITY_MODE`)

- `shadow` (**VARSAYILAN**) — hesapla + logla, kararı değiştirme. Sıfır risk.
- `enforce` — aynısı + `observe()` sonucu döner; motor `res.publish`/`sizeMultiplier`'ı
  kullanmak isterse kullanır (aşağıya bak). Veri birikmeden ÖNERİLMEZ.
- `off` — tamamen devre dışı.

Hiçbir env ayarlamazsan `shadow` çalışır. Canlıya çıkmak güvenlidir.

## Veri nereye yazılır?

`backend/src/data/signalQuality/`
- `calibration.json` — öğrenilen kalibrasyon (Beta-Binomial kovalar). `.gitignore`'da.
- `shadow-YYYY-MM-DD.jsonl` — günlük gözlem logu (tamponlu yazım). `.gitignore`'da.

## Modüller

- `index.js` — public API.
- `regime.js` `calibration.js` `confluence.js` `costModel.js` `unifiedConfidence.js` — çekirdek (Faz 1).
- `bridge.js` — motorların çağırdığı fail-safe köprü (`observe`, `recordOutcome`, `flush`).
- `backtestCost.js` — backtest'e maliyet + doğru yıllıklandırma (Faz 3).
- `walkForward.js` — genişleyen pencere OOS doğrulama + `seedCalibrator` (Faz 3).
- `monitor.js` — namespace başına ECE/Brier/kapsam raporu (Faz 4).

## Kalibratörü "öğretmek" (sonuç kaydı)

İki yol:

1. **Backtest'ten tohumlama (önerilen ilk adım).** Tarihsel (score→win) kayıtlarını
   `walkForward.seedCalibrator(records)` ile Calibrator'a yükleyip `serialize()` çıktısını
   `data/signalQuality/calibration.json`'a yaz. Katman ilk günden kalibre başlar.

2. **Canlı sonuç kaydı.** İlgili tracker kapanışında (ör. `cryptoSignalTracker.evalOne`)
   `bridge.recordOutcome({ namespace, qualityScore }, { win, r })` çağır. `namespace` ve
   `qualityScore`, yayın anında `observe()`'un döndürdüğü değerlerdir; bunları sinyal→pozisyon
   nesnesinde taşımak gerekir. Alternatif: shadow logu ile tracker çıktı loglarını
   `id`/`symbol`+zaman ile eşleyen bir gecelik iş.

## `enforce`'a geçiş (veri biriktikten SONRA)

1. 4–8 hafta shadow çalıştır. `node scripts/signalQuality_monitor.js` ile izle.
2. Bir namespace için `n ≥ 40` ve `ECE` düşük/stabilse o motor için güven duy.
3. İlgili motorda `observe()` dönüşünü kullan: `if (res && !res.publish) continue;`
   ve pozisyon boyutuna `res.sizeMultiplier` uygula. `SIGNAL_QUALITY_MODE=enforce` yap.

## İzleme

`node scripts/signalQuality_monitor.js` — kalibrasyon sağlığı + shadow gözlem sayıları.
Sunucuda haftalık cron'a ekle (script başında örnek var).
