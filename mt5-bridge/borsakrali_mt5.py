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
sys.path.insert(0, HERE)               # yerel modüller (trade_guard) için
CONFIG_PATH = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "config.json")
STOP_FILE = os.path.join(HERE, "STOP")
NEWS_CACHE = os.path.join(HERE, "news_windows.json")

import trade_guard  # ortak İŞLEM KORUMASI: hafta sonu (kripto-dışı) + ABD haber molası + günlük zarar freni

BRIDGE_VERSION = "2026-07-06-daily-guard"  # açılış banner'ında loglanır (VPS kod-sürümü teyidi)

# Konsol her zaman; bridge.log dosyası YALNIZ bot çalışırken (main) — test/diag import'u
# canlı log'u kirletmesin diye FileHandler main()'de eklenir.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                    handlers=[logging.StreamHandler()])
log = logging.getLogger("bk-mt5")

DEFAULTS = {
    "backend_url": "https://borsakrali.com",
    "exec_token": "",
    "poll_seconds": 60,
    "dry_run": True,
    "enabled": True,
    # ── VPS GÜVENLİĞİ (iki terminal / iki hesap) ──────────────────────────
    # terminal_path: bu köprünün bağlanacağı TERMİNAL (terminal64.exe tam yolu).
    #   VPS'te birden çok MT5 kuruluysa YANLIŞ terminale bağlanmayı önler. Boşsa
    #   çalışan/varsayılan terminale bağlanır (tek terminalli PC için yeterli).
    # allowed_account: İZİNLİ hesap numarası. Ayarlıysa köprü YALNIZ bu login'de
    #   işlem açar; başka hesaba bağlıysa bağlanmayı REDDEDER ve her tur atlar.
    #   0 = kilit kapalı (dikkat: iki hesaplı VPS'te MUTLAKA ayarla).
    "terminal_path": "",
    "allowed_account": 0,
    "magic": 550055,
    "deviation_points": 30,
    "max_open_positions": 8,
    "max_lot": 1.1,
    "lot_min": 0.1,
    "lot_max": 1.1,
    "conf_min": 60,
    "conf_max": 100,
    # RISK-BAZLI LOT (B2) + PORTFOY RISK FRENI (B3) - denetim 2026-07-05
    # lot_mode="risk": lot stop MESAFESINE gore boyutlanir -> dolar-riski tum
    #   enstrumanlarda TUTARLI olur. Guven yalniz risk%'i risk_pct_min..max
    #   arasinda olcekler; lotu DOGRUDAN degil. Lot yine max_lot tavaniyla kisilir.
    # lot_mode="confidence": guven->lot (lot_min..lot_max bandi).
    # VARSAYILAN "confidence" (opt-in ilkesi, review 2026-07-06): risk moduna gecis
    # config'e ACIKCA yazilir — VPS config.json zaten "risk" diyor.
    "lot_mode": "confidence",
    "risk_pct_min": 0.5,
    "risk_pct_max": 1.0,
    "max_portfolio_risk_pct": 6.0,
    # GUNLUK ZARAR DEVRE-KESICISI (2026-07-06 olayi: gece -%3.3, hicbir katman durdurmadi).
    # Bugunku (TR) gerceklesen+acik P/L esigi asarsa YENI islem yok (mevcutlar yonetilir).
    # bot = yalniz bu magic'in P/L'i; account = hesabin TUMU (diger botlarla birlikte
    # FTMO gunluk %5 limitini korur). 0 = kapali.
    "max_daily_loss_pct": 3.0,
    "max_daily_loss_pct_account": 4.5,
    # Kopru-tarafi yeniden-giris freni: az once ZARARLA kapanan sembole bu kadar
    # dakika yeni emir yok (backend cooldown'unun broker-tarafi sigortasi).
    "loss_reopen_cooldown_min": 45,
    "min_rr": 0.7,
    "close_on_backend_close": True,
    "trail_stops": True,
    "push_prices": True,
    "allow_hedge": False,
    # İŞLEM KORUMASI (trade_guard) — ikisi de vars. AÇIK; config'ten kapatılabilir:
    "weekend_flatten": True,    # Cuma 23:45→Pzt 03:00 TSI: kripto-dışı kapat + açma
    "news_blackout": True,      # ABD önemli verisi ±30 dk: TÜMÜNÜ kapat + açma
    # FAZ 2: carry_to_reversal — TP1'i broker emrine KOYMA (target2 uzak hard-cap koy) →
    # pozisyon TP1'de erken kapanmaz, backend'in reversal/akıllı-trailing'ine bırakılır.
    # VARSAYILAN KAPALI (geri-dönüş güvenli); backend FOREX_CARRY_TO_REVERSAL ile eşleşmeli.
    "carry_to_reversal": False,
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


# --- RISK-BAZLI LOT + PORTFOY RISK FRENI (denetim B2/B3 - 2026-07-05) ---
# Risk matematigi trade_guard'da ORTAK (iki kopru ayni formulu kullansin —
# 2026-07-06 review: kopyalar ayrisirsa iki bot ayni hesapta farkli $ riski uygular).
_contract_size = trade_guard.contract_size
_per_lot_risk_usd = trade_guard.per_lot_risk_usd


def risk_based_lot(cfg, conf, info, equity, entry_price, stop_price):
    """Lot = (equity * risk%) / (1-lot stop riski). Guven risk%'i
    [risk_pct_min, risk_pct_max] arasinda olcekler. max_lot tavaniyla ve broker
    min/max ile kisilir (taban = broker min; cfg lot_min DEGIL). Eksik veri -> 0.0."""
    try:
        equity = float(equity or 0)
    except (TypeError, ValueError):
        return 0.0
    try:
        stop_dist = abs(float(entry_price) - float(stop_price))
    except (TypeError, ValueError):
        return 0.0
    per_lot = _per_lot_risk_usd(info, stop_dist)
    if equity <= 0 or per_lot <= 0 or stop_dist <= 0:
        return 0.0
    cmin, cmax = float(cfg["conf_min"]), float(cfg["conf_max"])
    rmin = float(cfg.get("risk_pct_min", 0.5))
    rmax = float(cfg.get("risk_pct_max", 1.0))
    t = 0.0 if cmax <= cmin else max(0.0, min(1.0, (float(conf) - cmin) / (cmax - cmin)))
    risk_pct = rmin + t * (rmax - rmin)
    risk_usd = equity * risk_pct / 100.0
    raw = risk_usd / per_lot
    step = info.volume_step or 0.01
    lot = round(raw / step) * step
    lot = min(lot, float(cfg["max_lot"]), info.volume_max or 100.0)
    lot = max(info.volume_min or 0.01, lot)
    lot = round(lot, 2)
    if lot > float(cfg["max_lot"]) + 1e-9:
        return 0.0
    return lot


def compute_lot(cfg, s, info, entry_price, stop_price):
    """lot_mode='risk' -> risk-bazli (veri eksikse guven-lotuna duser).
    lot_mode='confidence' -> eski guven->lot davranisi."""
    conf = s.get("confidence", cfg["conf_min"])
    if str(cfg.get("lot_mode", "risk")).lower() == "risk":
        ai = mt5.account_info()
        equity = getattr(ai, "equity", None) if ai else None
        lot = risk_based_lot(cfg, conf, info, equity, entry_price, stop_price)
        if lot > 0:
            return lot
        log.warning("#%s %s: risk-bazli lot hesaplanamadi (equity/contract/stop yok) - guven-lotuna dusuldu.",
                    s.get("code"), getattr(info, "name", "?"))
    return lot_for_confidence(cfg, conf, info)


def _position_open_risk_usd(cfg, pos):
    sl = getattr(pos, "sl", 0) or 0
    if sl <= 0:
        return 0.0
    info = mt5.symbol_info(pos.symbol)
    if info is None:
        return 0.0
    entry = getattr(pos, "price_open", 0) or 0
    per_lot = _per_lot_risk_usd(info, abs(entry - sl))
    return per_lot * (getattr(pos, "volume", 0) or 0)


def portfolio_risk_exceeded(cfg):
    """Acik pozisyonlarin TOPLAM riski >= equity * max_portfolio_risk_pct mi?
    equity bilinmiyorsa fren uygulanMAZ (fail-open - mevcut davranisi bozmamak icin)."""
    cap_pct = float(cfg.get("max_portfolio_risk_pct", 0) or 0)
    if cap_pct <= 0:
        return False
    ai = mt5.account_info()
    equity = getattr(ai, "equity", None) if ai else None
    if not equity or equity <= 0:
        return False
    total = 0.0
    for p in (mt5.positions_get() or []):
        if p.magic == int(cfg["magic"]):
            total += _position_open_risk_usd(cfg, p)
    return total >= equity * cap_pct / 100.0


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
    # Broker'ın izin verdiği asgari SL/TP mesafesi (fiyat cinsinden) — stops + freeze.
    lvl = max(getattr(info, "trade_stops_level", 0) or 0, getattr(info, "trade_freeze_level", 0) or 0)
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
    # SON hesap doğrulaması — emir göndermeden hemen önce (tik-içi sessiz hesap
    # değişimine karşı; per-tick kontrol yetmez, feed döngüsü uzun sürebilir).
    if not account_allowed(cfg, mt5.account_info()):
        return
    code = s["code"]
    is_long = s["direction"] == "long"
    tick = mt5.symbol_info_tick(info.name)
    if tick is None or not (tick.ask > 0 and tick.bid > 0):
        log.warning("#%s %s: fiyat alınamadı, atlandı", code, info.name)
        return
    price = tick.ask if is_long else tick.bid

    # SL = sinyalin MUTLAK stop'u (felaket koruması; carry modda bile KALIR).
    # Geçerlilik + R:R referansı = target1 (broker TP'si carry'de target2 olsa da
    # "fiyat target1'i geçmişse kovalama" kapısı KORUNUR). Giriş piyasa emriyle
    # broker fiyatından olur → Telegram girişi (geçmiş anlık fiyat) birebir tutmaz.
    sl = float(s["stop"])
    tp1 = float(s["target1"])

    # Geçerlilik: fiyat SL–target1 arasında DOĞRU tarafta olmalı; değilse bayat → ATLA.
    if is_long and not (sl < price < tp1):
        log.info("#%s %s LONG atlandı: fiyat %.5f SL/TP1 (%.5f–%.5f) aralığı dışında (bayat).", code, info.name, price, sl, tp1)
        return
    if (not is_long) and not (tp1 < price < sl):
        log.info("#%s %s SHORT atlandı: fiyat %.5f TP1/SL (%.5f–%.5f) aralığı dışında (bayat).", code, info.name, price, tp1, sl)
        return

    # Kalan risk/ödül: hareketin çoğu olmuşsa (R:R düşük) girme — ETH gibi bayatları eler.
    reward, risk = abs(tp1 - price), abs(price - sl)
    rr = reward / risk if risk > 0 else 0.0
    min_rr = float(cfg.get("min_rr", 0.7))
    if rr < min_rr:
        log.info("#%s %s atlandı: kalan R:R %.2f < %.2f (hareket olmuş).", code, info.name, rr, min_rr)
        return

    # Broker asgari SL/TP mesafesi — bu kadar yakınsa (bayat/dar) broker reddeder → ATLA.
    md = min_stop_dist(info)
    if md > 0 and (risk < md or reward < md):
        log.info("#%s %s atlandı: SL/TP broker min mesafesine (%.5f) çok yakın.", code, info.name, md)
        return

    # Broker'a GİDEN TP: carry modda uzak hard-cap (target2 / ~10R sentetik) → TP1'e
    # değince ERKEN kapanmaz; klasik modda target1. ASLA 0 (0 = geçersiz long + broker/
    # backend-down'da korumasız). target2 feed'de gelir; yoksa risk×10 sentetik emniyet TP.
    if bool(cfg.get("carry_to_reversal", False)):
        t2 = s.get("target2")
        # target2 GEÇERLİ mi: sayı, >0 ve DOĞRU tarafta (long: >price). Değilse ~10R sentetik
        # uzak hard-cap. 'ASLA 0' invariant'ı garanti (0 / None / ters-taraf → sentetiğe düşer).
        valid_t2 = t2 is not None and float(t2) > 0 and (float(t2) > price if is_long else float(t2) < price)
        tp = float(t2) if valid_t2 else (price + (risk * 10.0 if is_long else -risk * 10.0))
    else:
        tp = tp1

    d = info.digits
    sl, tp = round(sl, d), round(tp, d)
    # B2: risk-bazli lot (stop mesafesine gore) - guven yalniz risk%'i olcekler.
    lot = compute_lot(cfg, s, info, price, sl)
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
        fill = r.price if (r.price and r.price > 0) else price  # bazı brokerlar result.price=0 döner
        log.info("✅ AÇILDI %s %s %s lot=%s @%.*f SL=%.*f TP=%.*f ticket=%s",
                 code, info.name, label, lot, d, fill, d, sl, d, tp, r.order)
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
    info = mt5.symbol_info(pos.symbol)
    if info is None:
        return
    d = info.digits
    new_sl = round(float(s["stop"]), d)  # MUTLAK stop (Telegram'ın iz-süren stop'uyla aynı)
    tick = mt5.symbol_info_tick(pos.symbol)
    if tick is None:
        return
    price = tick.bid if is_long else tick.ask  # kapanış tarafı
    md = min_stop_dist(info)
    # SL doğru tarafta ve yeterince uzak olmalı (yoksa broker reddeder / anında kapanır).
    if is_long and not (new_sl < price - md):
        return
    if (not is_long) and not (new_sl > price + md):
        return
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
    # Emir öncesi hesap doğrulaması: yanlış hesaba bağlıysak bir yabancının
    # pozisyonuna KAPATMA göndermeyelim (magic çakışması ihtimaline karşı).
    if not account_allowed(cfg, mt5.account_info()):
        return
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


def notify_backend_closed(cfg, code, reason, profit=None, price=None):
    """Köprü bir pozisyonu kapatınca (haber/hafta sonu/broker stop-out/TP2) backend'e
    bildir → backend 'hâlâ açık' sanıp aynı kodu TERS fiyattan yeniden AÇMASIN
    (bot=telefon desync çözümü). profit/price verilirse backend kapanışı zarar/kazanç
    olarak SINIFLANDIRIR (öğrenme + kademeli fren beslemesi — 2026-07-06 düzeltmesi).
    En iyi çaba: hata sessizce loglanır."""
    try:
        url = cfg["backend_url"].rstrip("/") + "/api/forex/closed"
        body = {"token": cfg["exec_token"], "code": code, "reason": reason}
        if profit is not None:
            body["profit"] = profit
        if price is not None:
            body["price"] = price
        requests.post(url, json=body, timeout=10)
    except Exception as e:  # noqa
        log.warning("kapatma bildirimi gönderilemedi #%s: %s", code, e)


def deal_close_info(ticket):
    """Pozisyonun kapanış P/L'i + son fiyatı (ortak mantık trade_guard'da)."""
    return trade_guard.deal_close_info(mt5, ticket)


def push_broker_prices(cfg):
    """MT5'in CANLI bid/ask'lerini Render'a yolla → engine sinyalleri broker fiyatıyla
    üretsin (Yahoo vadeli basis'ini giderir). instrumentId bazlı."""
    if not cfg.get("push_prices", True):
        return
    prices = {}
    for inst, sym in cfg["symbols"].items():
        try:
            info = mt5.symbol_info(sym)
            if info is None:
                continue
            if not info.visible:
                mt5.symbol_select(sym, True)
            t = mt5.symbol_info_tick(sym)
            if t and t.bid > 0 and t.ask > 0:
                prices[inst] = {"bid": t.bid, "ask": t.ask}
        except Exception:  # noqa
            continue
    if not prices:
        return
    try:
        url = cfg["backend_url"].rstrip("/") + "/api/forex/broker-prices"
        requests.post(url, json={"token": cfg["exec_token"], "prices": prices}, timeout=15)
    except Exception as e:  # noqa
        log.error("broker fiyat gönderilemedi: %s", e)


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


def suppressed_codes(feed, cfg):
    """Hedge yoksa: aynı enstrümanda hem long hem short varsa DÜŞÜK güvenli olanı
    bastır (yüksek güvenli yön açılsın). Çakışmayan (tek yönlü) enstrümana dokunmaz."""
    if cfg.get("allow_hedge", False):
        return set()
    by_inst = {}  # instrumentId -> list of (confidence, code)
    for s in feed:
        by_inst.setdefault(s["instrumentId"], []).append((s.get("confidence", 0), s["code"]))
    supp = set()
    for lst in by_inst.values():
        if len(lst) > 1:  # aynı enstrümanda birden fazla yön → en yükseği tut, gerisini bastır
            lst.sort(reverse=True)  # güvene göre azalan
            for _, code in lst[1:]:
                supp.add(code)
    return supp


def _mt5_init(cfg):
    """terminal_path verilmişse O terminale bağlan (VPS'te birden çok terminal
    varken yanlış hesaba bağlanmayı önler); yoksa çalışan/varsayılan terminale."""
    path = (cfg.get("terminal_path") or "").strip()
    if path:
        return mt5.initialize(path=path)
    return mt5.initialize()


def account_allowed(cfg, ai):
    """HESAP KİLİDİ: allowed_account ayarlıysa YALNIZ o login kabul edilir.
    VPS'te iki hesap açıkken bot yanlış hesaba işlem AÇAMAZ.
    FAIL-CLOSED: kilit ayarlıyken hesap bilgisi yoksa (ai None) işleme İZİN YOK
    (kilit kapalıyken — allowed_account=0 — eski davranış: her zaman izin)."""
    want = int(cfg.get("allowed_account") or 0)
    if not want:
        return True
    if ai is None:
        log.error("🔒 HESAP KİLİDİ: hesap bilgisi yok — güvenlik için işlem YOK.")
        return False
    if int(ai.login) != want:
        log.error("🔒 HESAP KİLİDİ: bağlı hesap %s ≠ izinli %s — bu köprü İŞLEM AÇMAZ.",
                  ai.login, want)
        return False
    return True


def autotrading_on():
    """Terminaldeki 'Algo Trading' DÜĞMESİ açık mı? (Ctrl+E). 'AutoTrading
    disabled by client' (retcode 10027) buna bağlıdır — account_info().trade_allowed
    BUNU YANSITMAZ (o hesap-izni: read-only/investor; bu terminal-düğmesi)."""
    ti = mt5.terminal_info()
    return bool(ti and ti.trade_allowed)


def connect(cfg):
    if not _mt5_init(cfg):
        log.error("MT5'e bağlanılamadı: %s — Terminal açık ve giriş yapılmış mı?", mt5.last_error())
        return False
    ai = mt5.account_info()
    if ai is None:
        log.error("account_info yok — MT5'te bir hesaba giriş yapılmalı.")
        return False
    if not account_allowed(cfg, ai):
        return False        # yanlış hesap: bağlanmayı reddet (dry_run olsa bile)
    mode = {0: "DEMO", 1: "CONTEST", 2: "🔴 GERÇEK (REAL)"}.get(ai.trade_mode, str(ai.trade_mode))
    log.info("Bağlandı: login=%s server=%s tür=%s bakiye=%.2f %s algo=%s",
             ai.login, ai.server, mode, ai.balance, ai.currency, ai.trade_allowed)
    if int(cfg.get("allowed_account") or 0):
        log.info("🔒 Hesap kilidi AKTİF: yalnız %s", cfg["allowed_account"])
    if not cfg["dry_run"]:
        if not ai.trade_allowed:
            log.error("Hesap trade izni YOK (read-only / investor şifresi?). Canlı emir açılamaz.")
            return False
        if not autotrading_on():
            # Buton kapalı: ÇIKMA (watchdog restart döngüsü olmasın) — köprü ayakta
            # kalır, fiyat besler, emir açmaz; buton (Ctrl+E) açılınca sıradaki tur başlar.
            log.warning("⚠️ AutoTrading DÜĞMESİ KAPALI — terminalde 'Algo Trading'e bas "
                        "(Ctrl+E, YEŞİL olmalı). Buton açılana dek emir YOK; köprü bekliyor.")
    log.info("MOD: %s", "DRY-RUN (emir YOK, sadece log)" if cfg["dry_run"] else "⚡ CANLI EMİR AKTİF")
    return True


def main():
    fh = logging.FileHandler(os.path.join(HERE, "bridge.log"), encoding="utf-8")
    fh.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logging.getLogger().addHandler(fh)
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

    guard = trade_guard.NewsGuard(cfg["backend_url"], NEWS_CACHE)  # ABD haber penceresi cache'i
    log.info("Köprü v%s başladı. Yoklama %ss. Koruma: hafta-sonu=%s haber-molası=%s. Semboller: %s",
             BRIDGE_VERSION, cfg["poll_seconds"], cfg.get("weekend_flatten", True), cfg.get("news_blackout", True),
             ", ".join(cfg["symbols"].keys()))
    # ETKİN AYAR BANNER'I: VPS'te hangi kod+ayarın koştuğu logdan kanıtlanabilsin
    # (2026-07-06 dersi: eski kod yeni config anahtarlarını SESSİZCE yok sayıyordu).
    log.info("AYAR: lot_mode=%s (risk %%%s–%%%s) · portföy freni %%%s · GÜNLÜK FREN bot %%%s / hesap %%%s · "
             "zarar-sonrası sembol freni %sdk · carry=%s · max_poz=%s",
             cfg.get("lot_mode"), cfg.get("risk_pct_min"), cfg.get("risk_pct_max"),
             cfg.get("max_portfolio_risk_pct"), cfg.get("max_daily_loss_pct"),
             cfg.get("max_daily_loss_pct_account"), cfg.get("loss_reopen_cooldown_min"),
             cfg.get("carry_to_reversal"), cfg.get("max_open_positions"))
    prev_open_codes = set()  # geçen turda MT5'te açık olan kodlar (desync/vanish tespiti için)
    prev_open_meta = {}      # code → ticket (vanish'te kapanış P/L'ini history'den bulmak için)
    notified_closed = {}     # code → (ts, profit, price): backend'e "kapandı" denen ama feed'de
                             # hâlâ duran kodlar — bildirim kaybolsa bile YENİDEN AÇILMAZ (yapışkan)
    # BOOT RECONCILE: restart anında broker'da kapanmış (stop-out/TP2) ama backend feed'inde
    # HÂLÂ açık görünen kodları bir kez senkronla → ilk turda TERS fiyattan yeniden AÇILMASIN.
    if not cfg["dry_run"]:
        try:
            _bf = poll_feed(cfg)
            if _bf:
                _live_map = our_positions(cfg)[0]
                for _s in _bf:
                    _c = _s.get("code")
                    if _c and _c not in _live_map:
                        log.info("BOOT: #%s feed'de var ama MT5'te yok — backend'e kapandı bildir (yeniden açma).", _c)
                        notify_backend_closed(cfg, _c, "boot_reconcile")
                prev_open_codes = set(_live_map.keys())  # ilk-tur vanished tespiti için tohum
                # ticket'ları da tohumla: ilk turdaki vanish kapanış P/L'ini bulabilsin
                # (review: boşken restart-sonrası ilk kapanış P/L'siz bildiriliyor, backend
                # kazançlı TP2'yi bile ihtiyatla zarar sayıyordu)
                prev_open_meta = {c: p.ticket for c, p in _live_map.items()}
        except Exception as e:  # noqa
            log.warning("boot reconcile atlandı: %s", e)
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
            push_broker_prices(cfg)  # fiyat beslemesi AutoTrading'den bağımsız (önce yolla)

            if not cfg["dry_run"]:
                ai = mt5.account_info()
                if ai is None or not ai.trade_allowed:
                    log.warning("Hesap yok / trade izni yok — bu tur emir yok.")
                    time.sleep(int(cfg["poll_seconds"])); continue
                if not autotrading_on():
                    log.warning("⚠️ AutoTrading DÜĞMESİ KAPALI (Ctrl+E ile aç) — bu tur emir yok.")
                    time.sleep(int(cfg["poll_seconds"])); continue
                # Her tur hesap kilidi (terminal sessizce başka hesaba düşerse koru)
                if not account_allowed(cfg, ai):
                    time.sleep(int(cfg["poll_seconds"])); continue

            # ── İŞLEM KORUMASI (feed'den ÖNCE — pozisyon kapatma feed'e bağlı değil) ──
            news_black, news_ev = (guard.blackout_now() if cfg.get("news_blackout", True) else (False, None))
            weekend_closed = (trade_guard.in_weekend_closed() if cfg.get("weekend_flatten", True) else False)
            if news_black:
                # ABD haber penceresi: TÜM pozisyonları kapat (kripto DAHİL), yeni açma.
                gopen, _g = our_positions(cfg)
                if gopen:
                    log.info("📰 HABER MOLASI (%s) — tüm pozisyonlar kapatılıyor, yeni işlem yok.",
                             (news_ev or {}).get("title", "ABD verisi"))
                for code, p in list(gopen.items()):
                    close_position(cfg, p)
                    _pf, _px = deal_close_info(p.ticket)
                    notify_backend_closed(cfg, code, "news", _pf, _px)  # backend senkron → yeniden açmasın
                    notified_closed[code] = (time.time(), "news", _pf, _px)
                time.sleep(int(cfg["poll_seconds"])); continue
            if weekend_closed:
                # Hafta sonu (Cuma 23:45→Pzt 03:00 TSI): kripto-DIŞI kapat; kripto sürer.
                gopen, _g = our_positions(cfg)
                for code, p in list(gopen.items()):
                    if not trade_guard.is_crypto(trade_guard.inst_for_symbol(cfg, p.symbol)):
                        log.info("🗓 HAFTA SONU — #%s %s (kripto-dışı) kapatılıyor.", code, p.symbol)
                        close_position(cfg, p)
                        _pf, _px = deal_close_info(p.ticket)
                        notify_backend_closed(cfg, code, "weekend", _pf, _px)  # backend senkron
                        notified_closed[code] = (time.time(), "weekend", _pf, _px)

            feed = poll_feed(cfg)
            if feed is None:
                time.sleep(int(cfg["poll_seconds"])); continue

            open_by_code, held_sym_dir = our_positions(cfg)
            # DESYNC KORUMASI: MT5'te artık OLMAYAN ama feed'de DURAN kodlar = backend'in
            # habersiz olduğu köprü/broker kapanışı (haber, hafta sonu, broker stop-out, TP2
            # dolumu). Backend'e bildir → "hâlâ açık" sanıp TERS fiyattan yeniden AÇMASIN.
            # Kapanış P/L'i deal history'den bulunup bildirime eklenir (öğrenme beslemesi).
            feed_code_set = {x.get("code") for x in feed}
            vanished = {c for c in prev_open_codes if c not in open_by_code and c in feed_code_set}
            for c in vanished:
                _pf, _px = deal_close_info(prev_open_meta.get(c)) if prev_open_meta.get(c) else (None, None)
                log.info("#%s: MT5'te yok ama feed'de var (broker/haber/hafta-sonu kapatmış)%s — backend'e bildir, yeniden açma.",
                         c, (" P/L %.2f$" % _pf) if _pf is not None else "")
                notify_backend_closed(cfg, c, "bridge_vanished", _pf, _px)
                notified_closed[c] = (time.time(), "bridge_vanished", _pf, _px)
            supp = suppressed_codes(feed, cfg)  # hedge yoksa: çatışan düşük-güvenli yönleri bastır
            feed_codes = set()
            stop_kill = os.path.exists(STOP_FILE)
            # ── GÜNLÜK ZARAR DEVRE-KESİCİSİ + zarar-sonrası sembol freni + portföy freni ──
            # Deal listesi TUR BAŞINA BİR KEZ çekilir; iki fren de onu kullanır. Broker
            # saat sapması (FTMO EET epokları) tick'ten ölçülür — düzeltilmezse frenler
            # son saatlerin kapanışlarını GÖRMEZDİ (review kritik bulgusu).
            skew = trade_guard.server_clock_skew(mt5, cfg)
            turn_deals = trade_guard.fetch_recent_deals(mt5, cfg.get("loss_reopen_cooldown_min", 45), skew=skew)
            daily_blocked, _ = trade_guard.daily_loss_blocked(mt5, cfg, log, deals=turn_deals, skew=skew)
            loss_syms = trade_guard.symbols_with_recent_loss(mt5, cfg["magic"], cfg.get("loss_reopen_cooldown_min", 45), deals=turn_deals, skew=skew)
            portfolio_blocked = portfolio_risk_exceeded(cfg)  # yalnız açılış SONRASI yenilenir

            for s in feed:
                try:
                    code = s["code"]; feed_codes.add(code)
                    if code in vanished:
                        continue  # broker/haber bu tur kapattı → backend'e bildirdik, yeniden AÇMA
                    if code in notified_closed and code not in open_by_code:
                        # YAPIŞKAN kapanış-teyidi: bildirim kaybolduysa/backend gecikirse bile
                        # kapattığımız kodu ASLA yeniden açma. Yeniden-bildirim 10dk'da bir
                        # (review: her turda bloklayan POST backend-down'da canlı pozisyon
                        # yönetimini geciktirirdi) ve ORİJİNAL sebeple (review: 'news' kapanışı
                        # tekrar-bildirimde 'vanished'a dönüşüp zarar sayılıyordu); açılmama
                        # koruması KOŞULSUZ sürer.
                        _ts, _reason, _pf, _px = notified_closed[code]
                        if time.time() - _ts >= 600:
                            notify_backend_closed(cfg, code, _reason, _pf, _px)
                            notified_closed[code] = (time.time(), _reason, _pf, _px)
                        continue
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
                    # Hafta sonu penceresi: kripto-DIŞI YENİ işlem yok (kripto sürer).
                    if weekend_closed and not trade_guard.is_crypto(inst):
                        log.info("#%s %s: hafta sonu — kripto-dışı yeni işlem yok.", code, broker_sym); continue
                    # yeni pozisyon
                    is_long = s["direction"] == "long"
                    # Hedge yoksa: paritede tek yön. Çatışan düşük-güvenli tarafı VEYA
                    # ters yön zaten açıksa açma (farklı TF'ler ters sinyal üretebiliyor).
                    if code in supp:
                        log.info("#%s %s: çatışan DÜŞÜK güvenli yön — hedge kapalı, açılmadı.", code, broker_sym); continue
                    if (not cfg.get("allow_hedge", False)) and ((broker_sym, (not is_long)) in held_sym_dir):
                        log.info("#%s %s: TERS yön zaten açık — hedge kapalı, açılmadı.", code, broker_sym); continue
                    if (broker_sym, is_long) in held_sym_dir:
                        log.info("#%s: %s %s zaten açık (aynı yönde başka pozisyon/eski kod) — çift açılış engellendi.",
                                 code, broker_sym, s["direction"]); continue
                    if stop_kill:
                        log.warning("STOP dosyası var — #%s açılmadı.", code); continue
                    if daily_blocked:
                        continue  # günlük zarar freni (sebep tur başında loglandı) — yeni işlem yok
                    if broker_sym in loss_syms:
                        log.info("#%s %s: az önce zararla kapandı — köprü yeniden-giriş freni (%sdk).",
                                 code, broker_sym, cfg.get("loss_reopen_cooldown_min", 45)); continue
                    if len(open_by_code) >= int(cfg["max_open_positions"]):
                        log.warning("max_open_positions (%s) doldu — #%s atlandı.", cfg["max_open_positions"], code); continue
                    # B3: PORTFOY RISK FRENI - acik toplam risk tavani asildiysa yeni giris yok.
                    # (tur basinda hesaplanir, yalniz acilis sonrasi yenilenir - review IPC bulgusu)
                    if portfolio_blocked:
                        log.warning("PORTFOY RISK FRENI: acik toplam risk >= %%%s equity - #%s acilmadi.",
                                    cfg.get("max_portfolio_risk_pct"), code); continue
                    info = ensure_symbol(broker_sym)
                    if info is None:
                        log.warning("Sembol yok/görünmez: %s (%s) — atlandı.", broker_sym, inst); continue
                    open_trade(cfg, s, info)
                    open_by_code, held_sym_dir = our_positions(cfg)  # sayaç + dedup güncel
                    portfolio_blocked = portfolio_risk_exceeded(cfg)  # açık risk değişti → yenile
                except Exception as e:  # noqa — tek bozuk satır tüm turu düşürmesin
                    log.error("sinyal işlenemedi %s: %s", s.get("code"), e); continue

            # Backend bir sinyali kapatınca (telefona STOP/TP gider, feed'den düşer) MT5
            # pozisyonunu da kapat → bot = telefon; aynı paritede yeni sinyale yer açılır.
            # ⚠️ Boş feed = backend geçici arızası → toplu kapatma YAPMA (güvenlik).
            if cfg["close_on_backend_close"] and feed:
                for code, p in list(open_by_code.items()):
                    if code not in feed_codes:
                        log.info("#%s %s: backend kapattı (feed'den düştü) — MT5 kapatılıyor.", code, p.symbol)
                        close_position(cfg, p)

            # Tur sonu: MT5'teki güncel açık kod+ticket'ları sakla → gelecek turda vanish
            # tespiti + kapanış P/L araması. Yapışkan kapanış listesi feed'den düşünce temizlenir.
            _cur = our_positions(cfg)[0]
            prev_open_codes = set(_cur.keys())
            prev_open_meta = {c: p.ticket for c, p in _cur.items()}
            notified_closed = {c: v for c, v in notified_closed.items() if c in feed_code_set}
            log.info("tur ok · feed=%d · açık(bizim)=%d%s%s", len(feed), len(prev_open_codes),
                     " · [STOP]" if stop_kill else "", " · [GÜNLÜK FREN]" if daily_blocked else "")
            time.sleep(int(cfg["poll_seconds"]))
    except KeyboardInterrupt:
        log.info("Durduruldu (Ctrl+C).")
    finally:
        mt5.shutdown()


if __name__ == "__main__":
    main()
