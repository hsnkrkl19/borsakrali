#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Borsa Krali → MetaTrader 5 köprüsü
==================================
Backend'in ürettiği AÇIK forex sinyallerini (Telegram'daki #kod'ların aynısı)
MT5 terminalinde otomatik işleme çevirir.

Akış (her `poll_seconds` saniyede bir):
  1) GET {backend_url}/api/forex/positions?token=...  → açık pozisyon listesi
  2) MT5'te AÇIK olan (bizim magic) pozisyonlarla karşılaştır (kimlik = comment "BK#kod")
       • feed'de YENİ #kod  → PİYASA emri aç (lot = güven puanına göre; SL/TP = sinyalin
         girişe göre YÜZDE mesafesi, BROKER dolum fiyatına uygulanır — feed'ler farklı
         olduğundan mutlak seviye KULLANILMAZ).
       • stop iz sürdüyse → SL'i lehe yönde güncelle (asla gevşetmez).
       • feed'den düşen #kod → (close_on_backend_close=true ise) kapat; değilse MT5 kendi
         SL/TP'siyle kapatır.

GÜVENLİK:
  • dry_run=true → HİÇBİR emir göndermez, yalnız ne yapacağını loglar (varsayılan).
  • config her turda yeniden okunur → dry_run / enabled'ı yeniden başlatmadan değiştir.
  • Yanına "STOP" adlı dosya koyarsan yeni emir açmaz (acil durdurma).
  • max_open_positions, max_lot tavanları.
  • Kimlik bilgisi burada YOK — MT5 terminaline SEN giriş yaparsın; köprü ona bağlanır.

Kurulum: README.md
"""

import os
import sys
import json
import time
import logging

try:
    import MetaTrader5 as mt5
except ImportError:
    print("MetaTrader5 paketi yok. Kur: pip install MetaTrader5", file=sys.stderr)
    sys.exit(1)

try:
    import requests
except ImportError:
    print("requests paketi yok. Kur: pip install requests", file=sys.stderr)
    sys.exit(1)

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "config.json")
STOP_FILE = os.path.join(HERE, "STOP")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[logging.StreamHandler(), logging.FileHandler(os.path.join(HERE, "bridge.log"), encoding="utf-8")],
)
log = logging.getLogger("bk-mt5")

DEFAULTS = {
    "backend_url": "https://borsakrali.com",
    "exec_token": "",
    "poll_seconds": 60,
    "dry_run": True,
    "enabled": True,
    "magic": 550055,
    "deviation_points": 30,
    "max_open_positions": 8,
    "max_lot": 0.05,
    "lot_min": 0.01,
    "lot_max": 0.03,
    "conf_min": 60,
    "conf_max": 100,
    "close_on_backend_close": False,
    "trail_stops": True,
    "symbols": {},
}


def load_config():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    merged = dict(DEFAULTS)
    merged.update(cfg)
    return merged


def code_comment(code):
    return "BK#" + str(code)


def parse_code(comment):
    c = (comment or "").strip()
    return c[3:] if c.startswith("BK#") else None


def lot_for_confidence(cfg, conf, info):
    lo, hi = float(cfg["lot_min"]), float(cfg["lot_max"])
    cmin, cmax = float(cfg["conf_min"]), float(cfg["conf_max"])
    t = 0.0 if cmax <= cmin else max(0.0, min(1.0, (float(conf) - cmin) / (cmax - cmin)))
    lot = lo + t * (hi - lo)
    lot = min(lot, float(cfg["max_lot"]))
    step = info.volume_step or 0.01
    lot = round(round(lot / step) * step, 2)
    lot = max(info.volume_min, min(info.volume_max, lot))
    # max_lot tavanı broker min/max clamp'inden SONRA doğrulanır: brokerin asgari
    # lotu tavanı aşıyorsa 0 dön (çağıran atlar) — tavanı sessizce aşma.
    if lot > float(cfg["max_lot"]) + 1e-9:
        return 0.0
    return lot


def ensure_symbol(broker_sym):
    info = mt5.symbol_info(broker_sym)
    if info is None:
        return None
    if not info.visible:
        if not mt5.symbol_select(broker_sym, True):
            return None
        info = mt5.symbol_info(broker_sym)
    return info


def min_stop_dist(info):
    # Broker'ın izin verdiği asgari SL/TP mesafesi (fiyat cinsinden).
    lvl = getattr(info, "trade_stops_level", 0) or 0
    return lvl * info.point


def send_with_filling(req):
    """Broker'ın desteklediği filling modunu dene (IOC→FOK→RETURN)."""
    last = None
    for fmode in (mt5.ORDER_FILLING_IOC, mt5.ORDER_FILLING_FOK, mt5.ORDER_FILLING_RETURN):
        req["type_filling"] = fmode
        r = mt5.order_send(req)
        last = r
        if r is None:
            log.error("order_send None — %s", mt5.last_error())
            return None
        if r.retcode == mt5.TRADE_RETCODE_DONE:
            return r
        if r.retcode == 10030:  # Unsupported filling mode → sıradaki modu dene
            continue
        return r  # başka hata → çağıran loglar
    return last


def open_trade(cfg, s, info):
    code = s["code"]
    is_long = s["direction"] == "long"
    tick = mt5.symbol_info_tick(info.name)
    if tick is None or not (tick.ask > 0 and tick.bid > 0):
        log.warning("#%s %s: fiyat alınamadı, atlandı", code, info.name)
        return
    price = tick.ask if is_long else tick.bid

    # SL/TP = sinyalin girişe göre YÜZDE mesafesi (feed farkını nötrler), broker fiyatına uygula
    entry, stop, tp1 = float(s["entry"]), float(s["stop"]), float(s["target1"])
    stop_pct = abs(entry - stop) / entry
    tp_pct = abs(tp1 - entry) / entry
    sl = price * (1 - stop_pct) if is_long else price * (1 + stop_pct)
    tp = price * (1 + tp_pct) if is_long else price * (1 - tp_pct)

    # Broker asgari mesafesine it
    md = min_stop_dist(info)
    if md > 0:
        if is_long:
            sl = min(sl, price - md); tp = max(tp, price + md)
        else:
            sl = max(sl, price + md); tp = min(tp, price - md)
    d = info.digits
    sl, tp = round(sl, d), round(tp, d)
    lot = lot_for_confidence(cfg, s.get("confidence", cfg["conf_min"]), info)
    if lot <= 0:
        log.warning("#%s %s: lot 0 / max_lot tavanı aşıldı — atlandı.", code, info.name)
        return

    label = "LONG" if is_long else "SHORT"
    if cfg["dry_run"]:
        log.info("[DRY] AÇ %s %s %s lot=%s @%.*f SL=%.*f TP=%.*f (güven %s)",
                 code, info.name, label, lot, d, price, d, sl, d, tp, s.get("confidence"))
        return

    req = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": info.name,
        "volume": float(lot),
        "type": mt5.ORDER_TYPE_BUY if is_long else mt5.ORDER_TYPE_SELL,
        "price": price,
        "sl": sl,
        "tp": tp,
        "deviation": int(cfg["deviation_points"]),
        "magic": int(cfg["magic"]),
        "comment": code_comment(code),
        "type_time": mt5.ORDER_TIME_GTC,
    }
    r = send_with_filling(req)
    if r and r.retcode == mt5.TRADE_RETCODE_DONE:
        log.info("✅ AÇILDI %s %s %s lot=%s @%.*f SL=%.*f TP=%.*f ticket=%s",
                 code, info.name, label, lot, d, r.price, d, sl, d, tp, r.order)
    else:
        rc = r.retcode if r else "None"
        cm = r.comment if r else mt5.last_error()
        log.error("❌ AÇILAMADI %s %s: retcode=%s %s", code, info.name, rc, cm)


def maybe_trail(cfg, pos, s):
    # Yön CANLI pozisyondan alınır (feed'den DEĞİL). Feed yönü uyuşmuyorsa (kod
    # tekrar kullanımı / ters sinyal) SL'i yanlış tarafa koymamak için DOKUNMA.
    is_long = pos.type == mt5.POSITION_TYPE_BUY
    if (s["direction"] == "long") != is_long:
        log.warning("TRAIL atlandı %s %s: feed yönü=%s ama pozisyon=%s",
                    parse_code(pos.comment), pos.symbol, s["direction"], "long" if is_long else "short")
        return
    entry, stop = float(s["entry"]), float(s["stop"])
    if not (entry > 0):
        return
    anchor = pos.price_open
    info = mt5.symbol_info(pos.symbol)
    if info is None:
        return
    # İŞARETLİ oran: long stop<giriş → SL fill ALTINDA (zarar); stop girişi geçince
    # (kilitli kâr) → SL fill ÜSTÜNDE (kâr). Short için simetrik. abs() KULLANMA —
    # yoksa kâra geçen stop yanlış tarafa düşer ve iz-süren donar.
    frac = (stop - entry) / entry
    new_sl = anchor * (1 + frac)
    d = info.digits
    new_sl = round(new_sl, d)
    eps = info.point / 2
    cur = pos.sl or 0.0
    favorable = (is_long and (cur == 0 or new_sl > cur + eps)) or \
                ((not is_long) and (cur == 0 or new_sl < cur - eps))
    if not favorable:
        return
    if cfg["dry_run"]:
        log.info("[DRY] TRAIL %s %s SL %.*f → %.*f", parse_code(pos.comment), pos.symbol, d, cur, d, new_sl)
        return
    req = {"action": mt5.TRADE_ACTION_SLTP, "position": pos.ticket,
           "symbol": pos.symbol, "sl": new_sl, "tp": pos.tp}
    r = mt5.order_send(req)
    if r and r.retcode == mt5.TRADE_RETCODE_DONE:
        log.info("🛡 TRAIL %s %s SL → %.*f", parse_code(pos.comment), pos.symbol, d, new_sl)
    else:
        log.error("TRAIL hata %s %s: %s", pos.symbol, parse_code(pos.comment),
                  (r.comment if r else mt5.last_error()))


def close_position(cfg, pos):
    code = parse_code(pos.comment)
    is_long = pos.type == mt5.POSITION_TYPE_BUY
    tick = mt5.symbol_info_tick(pos.symbol)
    if tick is None:
        return
    price = tick.bid if is_long else tick.ask
    if cfg["dry_run"]:
        log.info("[DRY] KAPAT %s %s (backend kapandı)", code, pos.symbol)
        return
    req = {
        "action": mt5.TRADE_ACTION_DEAL, "symbol": pos.symbol, "position": pos.ticket,
        "volume": pos.volume, "type": mt5.ORDER_TYPE_SELL if is_long else mt5.ORDER_TYPE_BUY,
        "price": price, "deviation": int(cfg["deviation_points"]),
        "magic": int(cfg["magic"]), "comment": "BK#close", "type_time": mt5.ORDER_TIME_GTC,
    }
    r = send_with_filling(req)
    if r and r.retcode == mt5.TRADE_RETCODE_DONE:
        log.info("KAPANDI %s %s", code, pos.symbol)
    else:
        log.error("KAPATILAMADI %s %s: %s", code, pos.symbol, (r.comment if r else mt5.last_error()))


def poll_feed(cfg):
    url = cfg["backend_url"].rstrip("/") + "/api/forex/positions"
    try:
        r = requests.get(url, params={"token": cfg["exec_token"]}, timeout=20)
        if r.status_code == 503:
            log.warning("Backend exec-feed KAPALI (FOREX_EXEC_TOKEN env set değil).")
            return None
        if r.status_code == 401:
            log.error("Token yanlış (401). config.exec_token ile backend FOREX_EXEC_TOKEN eşleşmiyor.")
            return None
        r.raise_for_status()
        data = r.json()
        return data.get("positions", [])
    except Exception as e:  # noqa
        log.error("feed alınamadı: %s", e)
        return None


def our_positions(cfg):
    # by_code: comment'ten #kod → pozisyon. by_sym_dir: (sembol, long?) kümesi —
    # comment silinse bile aynı sembol+yönde İKİNCİ pozisyon açılmasını engeller.
    by_code, by_sym_dir = {}, set()
    for p in (mt5.positions_get() or []):
        if p.magic == int(cfg["magic"]):
            by_sym_dir.add((p.symbol, p.type == mt5.POSITION_TYPE_BUY))
            code = parse_code(p.comment)
            if code:
                by_code[code] = p
    return by_code, by_sym_dir


def connect(cfg):
    if not mt5.initialize():
        log.error("MT5'e bağlanılamadı: %s — Terminal açık ve giriş yapılmış mı?", mt5.last_error())
        return False
    ai = mt5.account_info()
    if ai is None:
        log.error("account_info yok — MT5'te bir hesaba giriş yapılmalı.")
        return False
    mode = {0: "DEMO", 1: "CONTEST", 2: "🔴 GERÇEK (REAL)"}.get(ai.trade_mode, str(ai.trade_mode))
    log.info("Bağlandı: login=%s server=%s tür=%s bakiye=%.2f %s algo=%s",
             ai.login, ai.server, mode, ai.balance, ai.currency, ai.trade_allowed)
    if not cfg["dry_run"] and not ai.trade_allowed:
        log.error("Algo Trading KAPALI (terminalde 'Algo Trading' düğmesini aç). Canlı emir açılamaz.")
        return False
    log.info("MOD: %s", "DRY-RUN (emir YOK, sadece log)" if cfg["dry_run"] else "⚡ CANLI EMİR AKTİF")
    return True


def main():
    if not os.path.exists(CONFIG_PATH):
        log.error("config yok: %s (config.example.json'u kopyala)", CONFIG_PATH)
        sys.exit(1)
    cfg = load_config()
    if not cfg["exec_token"]:
        log.error("config.exec_token boş — backend FOREX_EXEC_TOKEN ile aynı olmalı.")
        sys.exit(1)
    if not connect(cfg):
        mt5.shutdown()
        sys.exit(1)

    log.info("Köprü başladı. Yoklama %ss. Semboller: %s", cfg["poll_seconds"], ", ".join(cfg["symbols"].keys()))
    try:
        while True:
            try:
                cfg = load_config()  # her tur taze (dry_run/enabled canlı değişebilir)
            except Exception as e:  # noqa
                log.error("config okunamadı: %s", e)
                time.sleep(cfg["poll_seconds"]); continue

            if not cfg.get("enabled", True):
                log.info("enabled=false — beklemede."); time.sleep(int(cfg["poll_seconds"])); continue

            # Canlı modda Algo Trading iznini HER TUR doğrula: terminalden kapatılırsa
            # (manuel acil durdurma) temiz beklemeye geç, boş emir denemesi yapma.
            if not cfg["dry_run"]:
                ai = mt5.account_info()
                if ai is None or not ai.trade_allowed:
                    log.warning("Algo Trading KAPALI / hesap yok — bu tur emir yok.")
                    time.sleep(int(cfg["poll_seconds"])); continue

            feed = poll_feed(cfg)
            if feed is None:
                time.sleep(int(cfg["poll_seconds"])); continue

            open_by_code, held_sym_dir = our_positions(cfg)
            feed_codes = set()
            stop_kill = os.path.exists(STOP_FILE)

            for s in feed:
                try:
                    code = s["code"]; feed_codes.add(code)
                    inst = s["instrumentId"]
                    entry = float(s["entry"])
                    if not (entry > 0):
                        raise ValueError("entry<=0")
                    broker_sym = cfg["symbols"].get(inst)
                    if not broker_sym:
                        continue  # eşlenmemiş enstrüman → işlem açma
                    if code in open_by_code:
                        if cfg["trail_stops"]:
                            maybe_trail(cfg, open_by_code[code], s)
                        continue
                    # yeni pozisyon
                    is_long = s["direction"] == "long"
                    if (broker_sym, is_long) in held_sym_dir:
                        log.warning("#%s: %s %s zaten açık (comment kayıp olabilir) — çift açılış engellendi.",
                                    code, broker_sym, s["direction"]); continue
                    if stop_kill:
                        log.warning("STOP dosyası var — #%s açılmadı.", code); continue
                    if len(open_by_code) >= int(cfg["max_open_positions"]):
                        log.warning("max_open_positions (%s) doldu — #%s atlandı.", cfg["max_open_positions"], code); continue
                    info = ensure_symbol(broker_sym)
                    if info is None:
                        log.warning("Sembol yok/görünmez: %s (%s) — atlandı.", broker_sym, inst); continue
                    open_trade(cfg, s, info)
                    open_by_code, held_sym_dir = our_positions(cfg)  # sayaç + dedup güncel
                except Exception as e:  # noqa — tek bozuk satır tüm turu düşürmesin
                    log.error("sinyal işlenemedi %s: %s", s.get("code"), e); continue

            if cfg["close_on_backend_close"]:
                for code, p in list(open_by_code.items()):
                    if code not in feed_codes:
                        close_position(cfg, p)

            log.info("tur ok · feed=%d · açık(bizim)=%d%s", len(feed), len(open_by_code),
                     " · [STOP]" if stop_kill else "")
            time.sleep(int(cfg["poll_seconds"]))
    except KeyboardInterrupt:
        log.info("Durduruldu (Ctrl+C).")
    finally:
        mt5.shutdown()


if __name__ == "__main__":
    main()
