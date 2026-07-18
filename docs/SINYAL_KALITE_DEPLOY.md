# signalQuality — Canlıya Alma (Deploy) Runbook

## Durum

Tüm kod hazır ve **55/55 test geçiyor.** 5 motora eklenen kancalar **shadow**
modunda (varsayılan): sinyal davranışı **aynen korunur**, arka planda kalibrasyon
verisi + gözlem logu birikir. Bu yüzden canlıya çıkmak **düşük risklidir.**

> **Neden bu adımı sizin makinenizden yapıyoruz?** Çalıştığım ortam salt-okunur
> bir kopya üzerinde ve GitHub kimlik bilgisine/erişimine sahip değil; bu yüzden
> `git push` ve Render deploy'u buradan yapılamıyor. Aşağıdaki komutlar sizin
> makinenizde (gerçek repo + kimlik bilgileriniz) çalışır. Üretim finansal sistem
> için son push'u insanın onaylaması zaten doğru kontroldür.

## Değişen dosyalar (özet)

Yeni: `backend/src/services/signalQuality/` (11 modül + INTEGRATION.md + .gitignore),
`backend/tests/signalQuality/` (7 test dosyası), `backend/scripts/signalQuality_verify.js`,
`backend/scripts/signalQuality_monitor.js`, `docs/SINYAL_KALITE_RAPORU.md`, bu dosya.

Düzenlenen (yalnız fail-safe shadow kancası eklendi): `cryptoSignalsService.js`,
`mtfScorer.js`, `proSignals/proEngine.js`, `bistSignals/bistScoreEngine.js`,
`beast/beastEngine.js`.

## Adımlar

### 1) Testleri çalıştır (yeşil olmalı)
```bash
cd backend
npx jest tests/signalQuality --collectCoverage=false
```

### 2) Yalnızca bu işin dosyalarını sahnele
> Repo başka (ilgisiz) değişiklikler de içeriyor olabilir; bu yüzden `-A` KULLANMA.
```bash
git add backend/src/services/signalQuality \
        backend/tests/signalQuality \
        backend/src/data/signalQuality/.gitignore \
        backend/src/data/signalQuality/calibration.seed.json \
        backend/scripts/signalQuality_verify.js \
        backend/scripts/signalQuality_monitor.js \
        backend/scripts/signalQuality_seed.js \
        backend/src/services/cryptoSignalsService.js \
        backend/src/services/mtfScorer.js \
        backend/src/services/proSignals/proEngine.js \
        backend/src/services/bistSignals/bistScoreEngine.js \
        backend/src/services/beast/beastEngine.js \
        docs/SINYAL_KALITE_RAPORU.md \
        docs/SINYAL_KALITE_DEPLOY.md
```

### 3) Sahnelenen değişikliği gözden geçir
```bash
git diff --cached --stat
git diff --cached backend/src/services/mtfScorer.js   # kanca fail-safe mi, teyit
```
Motor dosyalarında yalnız `signalQuality/bridge` `observe(...)` blokları eklenmiş
olmalı (her biri `try/catch` içinde). Başka mantık değişmemeli.

### 4) Commit
```bash
git commit -m "feat(signalQuality): ortak kalibrasyon+rejim+maliyet katmani + 5 motora shadow kanca (fail-safe, varsayilan shadow)"
```

### 5) Push → Render otomatik deploy
```bash
git push origin main
```
Ana Node servisi Render panosundan bu repoya bağlı ve `main`'e push'ta otomatik
build+deploy eder (`start: node src/server-live.js`). Render panosundan
"Events/Logs"tan deploy'u izleyebilirsin.

### 6) Ortam değişkeni (opsiyonel)
Hiçbir şey ayarlamana gerek yok — `SIGNAL_QUALITY_MODE` yoksa **shadow** çalışır.
İstersen Render → Environment'a açıkça `SIGNAL_QUALITY_MODE=shadow` ekle (netlik için).
`enforce`'a **şimdi geçme**; önce veri biriksin (bkz. INTEGRATION.md).

### 7) Deploy sonrası doğrulama
- Render loglarında hata yok, servis "live".
- Birkaç tarama sonrası dosya oluşmalı: `backend/src/data/signalQuality/shadow-YYYY-MM-DD.jsonl`.
- Rapor: `node scripts/signalQuality_monitor.js` (kalibrasyon sağlığı + gözlem sayıları).
- Telegram/kanal sinyalleri **eskisi gibi** akmalı (davranış değişmedi).

## Geri alma (rollback)
Sorun olursa: Render panosundan bir önceki deploy'a "Rollback", veya
```bash
git revert <commit-hash> && git push origin main
```
Kanca fail-safe olduğu için sinyal akışını bozması beklenmez; yine de shadow
tamamen kapatmak istersen Render env'e `SIGNAL_QUALITY_MODE=off` ekleyip yeniden
deploy et.

## Kalibratör TOHUMLANDI (hazır)
Katman ilk günden gerçek olasılık üretsin diye tarihsel backtest/istatistik
verisinden tohumlandı: **1.627 örnek, 17 namespace, 4 motor** →
`backend/src/data/signalQuality/calibration.seed.json` (repoya dahil, yukarıdaki
`git add`'de var). Bridge, canlı `calibration.json` yoksa bu seed'i yükler.

Kaynaklar → namespace:
- `bist-signals-backtest.json` → `bistScoreEngine:trend:long` (n=1253, ECE 0.0009).
- `crypto-mtf/calibration.json` → `mtfScorer:<TF>:<dir>` (1h/4h; n=245).
- `pro-signals-stats.json` → `proEngine:<inst>:<dir>` (gerçek, az örnek n=9).
- `beast EDGE` → `beast:<inst>:<dir>` (backtest-türevi HAFİF PRIOR, n=120).
- Kripto (cryptoScorer) seedsiz — bucketed backtest yok, canlı shadow ile kalibre olacak.

Az örnekli namespace'ler `monitor`'da `az_ornek`/`dar_kapsam` işaretli (doğru davranış;
canlı veri biriktikçe güçlenir). Yeniden üretmek: `node scripts/signalQuality_seed.js`.
Doğrulama: `node scripts/signalQuality_monitor.js`.
