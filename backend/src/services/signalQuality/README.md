# signalQuality — Ortak Sinyal Kalite Katmanı

Tüm sinyal motorlarını (cryptoScorer, mtfScorer, proEngine, bistScoreEngine, beast)
**tek, olasılığa kalibre edilmiş güven** sözleşmesine bağlayan bağımsız katman.

## Neden?

Motorlar farklı skala kullanıyordu (6/10, 7/12, 0–100) ve eşikleri elle konmuştu;
"%70 güven" gerçek isabetle uyuşmuyordu. Bu katman beş sorunu tek yerde çözer:
olasılık kalibrasyonu, rejim filtresi, indikatör kolinyerliği, işlem maliyeti ve
tutarlı skala.

## Modüller

| Dosya | İş |
|---|---|
| `indicators.js` | EMA / ATR / ADX(Wilder) / Choppiness — test edilmiş TA çekirdeği |
| `regime.js` | trend/chop/high-vol tespiti + sinyal geçiş kapısı (gate) |
| `calibration.js` | ham skor → gerçek olasılık (Beta-Binomial + izotonik + shrinkage) |
| `confluence.js` | kolinyerlik-farkında birleştirme (sahte konsensüsü kırar) |
| `costModel.js` | varlık bazlı maliyet → net R:R + başabaş isabet |
| `unifiedConfidence.js` | hepsini TEK 0–100 skalaya bağlar (`confidence = olasılık × 100`) |
| `bridge.js` | motorların çağırdığı FAIL-SAFE köprü (`observe`, `recordOutcome`) |
| `backtestCost.js` | backtest'e maliyet + doğru yıllıklandırma |
| `walkForward.js` | genişleyen pencere OOS doğrulama + `seedCalibrator` |
| `monitor.js` | namespace başına ECE/Brier/kapsam raporu |

## Kullanım

```js
const sq = require('.'); // signalQuality
const res = sq.evaluateSignal({
  engine, strategy, direction, rawScore, rawScoreScale,
  votes, candles, levels, assetClass, calibrator,
});
// res.confidence (0–100 = olasılık×100), res.grade, res.edge, res.publish, res.reasons
```

Motorlar bunu doğrudan çağırmaz; `bridge.observe({...})` üzerinden **shadow**
modunda (varsayılan, davranış değişmez) çağırır. Ayrıntı: `INTEGRATION.md`.

## Mod bayrağı

`SIGNAL_QUALITY_MODE` = `shadow` (varsayılan) · `enforce` · `off`.

## Test & araçlar

- Testler: `npx jest tests/signalQuality --collectCoverage=false` (55 test).
- Tohumlama: `node scripts/signalQuality_seed.js` → `data/signalQuality/calibration.seed.json`.
- İzleme: `node scripts/signalQuality_monitor.js`.
- Sentetik doğrulama: `node scripts/signalQuality_verify.js`.
