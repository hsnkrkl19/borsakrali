# Hisse Yarışı — araç sprite'ları (kaynak & lisans)

Tüm sprite'lar **CC0 1.0 (Public Domain)** — atıf zorunlu değil, yine de kaydediyoruz.

- `car_*` (girl), `truck_*`, `orc_*` — "Hill Climb Racing - Car Sprites" by **pzUH**
  - https://opengameart.org/content/hill-climb-racing-car-sprites — CC0 1.0
  - `png/separate/{girl,truck,orc}/` içindeki Body + Wheel dosyalarından türetildi.
- `monster_body.png`, `monster_tire.png` — "MonsterTruck" by **WhiteBirdGames**
  - https://opengameart.org/content/monstertruck — CC0 1.0

Kullanım: `RacingEngine` bu PNG'leri `VEHICLES[*].sprite` üzerinden yükler; gövde
+ tekerlekler bağımsız çizilir (fizik teker pozisyonlarıyla), yükseltme
eklentileri (yay/kanat/egzoz) sprite'ın üstüne bindirilir.
