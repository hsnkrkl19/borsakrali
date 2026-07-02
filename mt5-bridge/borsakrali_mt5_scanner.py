#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Borsa Krali ⚡ MT5 GÜN-İÇİ Tarayıcı → MetaTrader 5 köprüsü
==========================================================
Backend'in MT5 Gün-içi Tarayıcı pozisyonlarını (Telegram'daki #Gxx kodların
aynısı) MT5 terminalinde OTOMATİK işleme çevirir. Forex köprüsünden
(borsakrali_mt5.py, magic 550055) TAMAMEN AYRI çalışır — magic 550066.

Forex köprüsünden farklar (tasarım gereği):
  • LOT backend'den AYNEN alınır (backend broker adımına oturtup Telegram'da
    aynısını gösteriyor) — güven-puanı lot'u YOK. Adım-dışı lot AŞAĞI tabanlanır.
  • SL/TP SABİT (iz-süren YOK): Telegram = MT5 hep birebir.
  • Aynı sembolde AYNI yönde birden çok pozisyon OLABİLİR (farklı TF kodları,
    örn. GBT01 1h + GBT02 15m) — kimlik kesinlikle #kod (comment "BKG#...").
    Comment kaybolursa scanner_state.json (ticket→kod) yedeğinden çözülür.
  • GÜN-İÇİ failsafe İKİ katman:
      1) Açılışta her pozisyonun gün-sonu vakti (eodDeadlineSec) state'e yazılır;
         süresi geçen pozisyon HER TURDA kapatılır (pencere/feed'den bağımsız).
      2) TR 23:45+ süpürmesi: bizim TÜM pozisyonlar (kimliksizler dahil) kapatılır.
    TR 23:00'ten sonra YENİ pozisyon açılmaz. (TR = UTC+3 sabit, DST yok.)
  • done-kodları: MT5 tarafında kapanan (broker SL/TP / manuel / bizim kapattığımız)
    bir kod, backend feed'inde hâlâ dursa bile ASLA yeniden açılmaz → zincirleme
    stop / bütçe-dışı gizli risk engellenir. Kod feed'den düşünce kayıt temizlenir.
  • push_prices vars. KAPALI (forex köprüsü zaten broker fiyatı basıyor; YALNIZ
    bu köprü çalışıyorsa true yap — yoksa endeks/altın seviyeleri Yahoo vadeli
    basis'i kadar kayar).

Aynen korunan güvenlik seti:
  • dry_run=true varsayılan (emir YOK, yalnız log) — config her tur taze okunur.
  • STOP veya STOP_SCANNER dosyası → yeni emir yok (acil durdurma).
  • Bayat/kovalama koruması: fiyat SL–TP aralığı dışında VEYA kalan R:R < min_rr
    VEYA broker asgari stop mesafesine çok yakın → AÇMA.
  • close_on_backend_close: feed'den düşen kod MT5'te de kapanır (bot=telefon).
    Boş feed = olası backend arızası → toplu kapatma YAPILMAZ (gün-sonu katmanı
    yine de saklanan vakitle kapatır).
  • positions_get() None (IPC hatası) → TUR ATLANIR (ne açılış ne kapanış ne
    state temizliği — çift açılış imkânsız).
  • Partial fill (10010) BAŞARI sayılır (pozisyon kısmen açık — kimlik yazılır).
  • Terminal koptu ise her turda yeniden bağlanma denenir.
  • max_open_positions, max_lot tavanı, canlıda her tur trade_allowed kontrolü.
  • Kimlik bilgisi yok — MT5 terminaline SEN girersin, köprü bağlanır.

Çalıştır: run_scanner.bat  (veya: python borsakrali_mt5_scanner.py [config yolu])
"""

import os
import sys
import json
import time
import logging
from datetime import datetime, timezone, timedelta

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
CONFIG_PATH = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "config_scanner.json")
STOP_FILES = (os.path.join(HERE, "STOP"), os.path.join(HERE, "STOP_SCANNER"))
STATE_PATH = os.path.join(HERE, "scanner_state.json")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                    handlers=[logging.StreamHandler()])
log = logging.getLogger("bk-mt5-scanner")

COMMENT_PREFIX = "BKG#"
RETCODE_OK = 10009        # TRADE_RETCODE_DONE
RETCODE_PARTIAL = 10010   # TRADE_RETCODE_DONE_PARTIAL — pozisyon KISMEN açık = başarı
RETCODE_BAD_FILLING = 10030

DEFAULTS = {
    "backend_url": "https://borsakrali.com",
    "exec_token": "",
    "poll_seconds": 60,
    "dry_run": True,
    "enabled": True,
    "magic": 550066,
    "deviation_points": 30,
    "max_open_positions": 12,
    "max_lot": 10.0,              # emniyet tavanı — feed lotu bunu aşarsa AÇILMAZ (kırpılmaz)
    "min_rr": 0.7,
    "close_on_backend_close": True,
    "push_prices": False,
    "no_new_after_tr_min": 23 * 60,        # 23:00 TR sonrası yeni işlem yok
    "eod_close_tr_min": 23 * 60 + 45,      # 23:45 TR süpürmesi (2. katman)
    "symbols": {},
}

TR_UTC_OFFSET_HOURS = 3  # Türkiye DST uygulamaz — sabit UTC+3


def tr_minutes_now(now_utc=None):
    now = now_utc or datetime.now(timezone.utc)
    tr = now + timedelta(hours=TR_UTC_OFFSET_HOURS)
    return tr.hour * 60 + tr.minute


def load_config():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    merged = dict(DEFAULTS)
    merged.update(cfg)
    return merged


def code_comment(code):
    return COMMENT_PREFIX + str(code)


def parse_code(comment):
    c = (comment or "").strip()
    return c[len(COMMENT_PREFIX):] if c.startswith(COMMENT_PREFIX) else None


# ── kalıcı durum: tickets (ticket→{code,eod}) + done (kod→zaman) ─────────────
def load_state():
    try:
        with open(STATE_PATH, "r", encoding="utf-8") as f:
            d = json.load(f)
        if not isinstance(d, dict):
            return {"tickets": {}, "done": {}}
        if "tickets" not in d:  # eski düz {ticket: code} şeması → yükselt
            d = {"tickets": {t: {"code": c, "eod": None} for t, c in d.items()}, "done": {}}
        d.setdefault("tickets", {})
        d.setdefault("done", {})
        return d
    except Exception:  # noqa
        return {"tickets": {}, "done": {}}


def save_state(state):
    try:
        tmp = STATE_PATH + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False, indent=1)
        os.replace(tmp, STATE_PATH)  # atomik değiştirme — çökme anında yarım dosya kalmasın
    except Exception as e:  # noqa
        log.error("state yazılamadı: %s", e)


def snap_lot(feed_lots, info, cfg):
    """Feed lotunu broker adımına/limitlerine oturt. Emniyet: max_lot tavanını
    aşan feed lotu KIRPILMAZ, 0 döner (çağıran atlar). Adım-dışı lot AŞAĞI
    tabanlanır (risk sinyaldekinin üstüne asla çıkmaz)."""
    try:
        lot = float(feed_lots)
    except (TypeError, ValueError):
        return 0.0
    if not lot > 0:
        return 0.0
    if lot > float(cfg["max_lot"]) + 1e-9:
        return 0.0
    step = info.volume_step or 0.01
    snapped = round(int(lot / step + 1e-9) * step, 2)
    if snapped <= 0:
        return 0.0
    if snapped < (info.volume_min or 0.01) - 1e-9 or snapped > (info.volume_max or 1e9) + 1e-9:
        return 0.0
    return snapped


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
    lvl = max(getattr(info, "trade_stops_level", 0) or 0, getattr(info, "trade_freeze_level", 0) or 0)
    return lvl * info.point


def send_ok(r):
    return r is not None and r.retcode in (RETCODE_OK, RETCODE_PARTIAL)


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
        if send_ok(r):
            return r
        if r.retcode == RETCODE_BAD_FILLING:
            continue
        return r
    return last


def open_trade(cfg, s, info, state):
    code = str(s["code"])
    is_long = s["direction"] == "long"
    tick = mt5.symbol_info_tick(info.name)
    if tick is None or not (tick.ask > 0 and tick.bid > 0):
        log.warning("#%s %s: fiyat alınamadı, atlandı", code, info.name)
        return
    price = tick.ask if is_long else tick.bid

    sl, tp = float(s["stop"]), float(s["target1"])  # MUTLAK — Telegram ile aynı

    # Bayat/kovalama koruması: fiyat SL–TP aralığında doğru tarafta olmalı.
    if is_long and not (sl < price < tp):
        log.info("#%s %s LONG atlandı: fiyat %.5f SL/TP (%.5f–%.5f) dışı (bayat).", code, info.name, price, sl, tp)
        return
    if (not is_long) and not (tp < price < sl):
        log.info("#%s %s SHORT atlandı: fiyat %.5f TP/SL (%.5f–%.5f) dışı (bayat).", code, info.name, price, tp, sl)
        return

    reward, risk = abs(tp - price), abs(price - sl)
    rr = reward / risk if risk > 0 else 0.0
    if rr < float(cfg.get("min_rr", 0.7)):
        log.info("#%s %s atlandı: kalan R:R %.2f < %.2f (hareket olmuş).", code, info.name, rr, cfg.get("min_rr", 0.7))
        return

    md = min_stop_dist(info)
    if md > 0 and (risk < md or reward < md):
        log.info("#%s %s atlandı: SL/TP broker min mesafesine (%.5f) çok yakın.", code, info.name, md)
        return

    d = info.digits
    sl, tp = round(sl, d), round(tp, d)
    lot = snap_lot(s.get("lots"), info, cfg)
    if lot <= 0:
        log.warning("#%s %s: feed lotu (%s) broker/emniyet limitlerine uymadı — atlandı.", code, info.name, s.get("lots"))
        return

    label = "LONG" if is_long else "SHORT"
    if cfg["dry_run"]:
        log.info("[DRY] AÇ %s %s %s lot=%s @%.*f SL=%.*f TP=%.*f (tf %s, güven %s)",
                 code, info.name, label, lot, d, price, d, sl, d, tp, s.get("tf"), s.get("confidence"))
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
    if send_ok(r):
        fill = r.price if (r.price and r.price > 0) else price
        part = " (KISMİ dolum)" if r.retcode == RETCODE_PARTIAL else ""
        log.info("✅ AÇILDI%s %s %s %s lot=%s @%.*f SL=%.*f TP=%.*f ticket=%s",
                 part, code, info.name, label, lot, d, fill, d, sl, d, tp, r.order)
        # kimlik + gün-sonu yedeği: comment kaybolsa da restart'ta çözülür,
        # gün-sonu kapanışı pencere/feed'den bağımsız garanti edilir.
        if r.order:
            state["tickets"][str(r.order)] = {"code": code, "eod": s.get("eodDeadlineSec")}
            save_state(state)
    else:
        rc = r.retcode if r else "None"
        cm = r.comment if r else mt5.last_error()
        log.error("❌ AÇILAMADI %s %s: retcode=%s %s", code, info.name, rc, cm)


def close_position(cfg, pos, reason):
    code = parse_code(pos.comment) or "?"
    is_long = pos.type == mt5.POSITION_TYPE_BUY
    tick = mt5.symbol_info_tick(pos.symbol)
    if tick is not None and (tick.bid > 0 and tick.ask > 0):
        price = tick.bid if is_long else tick.ask
    else:
        # tick alınamadı — SESSİZ vazgeçME (inceleme bulgusu): pozisyonun kendi
        # güncel fiyatıyla dene; piyasa emrinde broker zaten anlık fiyattan doldurur.
        price = getattr(pos, "price_current", 0.0) or 0.0
        log.warning("KAPAT %s %s: tick alınamadı (%s) — price_current=%.5f ile deneniyor.",
                    code, pos.symbol, mt5.last_error(), price)
        if not price > 0:
            log.error("KAPATILAMADI %s %s: fiyat yok — sonraki turda tekrar denenecek.", code, pos.symbol)
            return False
    if cfg["dry_run"]:
        log.info("[DRY] KAPAT %s %s (%s)", code, pos.symbol, reason)
        return True
    req = {
        "action": mt5.TRADE_ACTION_DEAL, "symbol": pos.symbol, "position": pos.ticket,
        "volume": pos.volume, "type": mt5.ORDER_TYPE_SELL if is_long else mt5.ORDER_TYPE_BUY,
        "price": price, "deviation": int(cfg["deviation_points"]),
        "magic": int(cfg["magic"]), "comment": "BKG#close", "type_time": mt5.ORDER_TIME_GTC,
    }
    r = send_with_filling(req)
    if send_ok(r):
        log.info("KAPANDI %s %s (%s)", code, pos.symbol, reason)
        return True
    log.error("KAPATILAMADI %s %s: %s", code, pos.symbol, (r.comment if r else mt5.last_error()))
    return False


def poll_feed(cfg):
    url = cfg["backend_url"].rstrip("/") + "/api/mt5-scanner/positions"
    try:
        r = requests.get(url, params={"token": cfg["exec_token"]}, timeout=20)
        if r.status_code == 503:
            log.warning("Backend exec-feed KAPALI (FOREX_EXEC_TOKEN env set değil).")
            return None
        if r.status_code == 401:
            log.error("Token yanlış (401). config_scanner.exec_token backend FOREX_EXEC_TOKEN ile eşleşmiyor.")
            return None
        r.raise_for_status()
        data = r.json()
        return data.get("positions", [])
    except Exception as e:  # noqa
        log.error("feed alınamadı: %s", e)
        return None


def push_broker_prices(cfg):
    """Vars. KAPALI (forex köprüsü zaten basıyor). Yalnız bu köprü çalışıyorsa aç."""
    if not cfg.get("push_prices", False):
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


def identify_positions(cfg, raw_positions, state):
    """Bizim magic'li pozisyonları kimliklendir. raw_positions = mt5.positions_get()
    SONUCU (None ise çağıran turu atlar — burada None GELMEZ varsayılır).
    Kimlik: comment BKG#kod → state tickets yedeği → 'unknown'.
    Dönen: by_code {kod: pos}, unknown [pos]. State'e öğrenilen kimlikler yazılır
    (ticket temizliği burada YAPILMAZ — kapananlar reconcile_closures'ta işlenir)."""
    by_code, unknown = {}, []
    changed = False
    for p in raw_positions:
        if p.magic != int(cfg["magic"]):
            continue
        code = parse_code(p.comment)
        if not code:
            meta = state["tickets"].get(str(p.ticket))
            code = meta.get("code") if isinstance(meta, dict) else None
        if code:
            by_code[str(code)] = p
            cur = state["tickets"].get(str(p.ticket))
            if not isinstance(cur, dict) or cur.get("code") != str(code):
                state["tickets"][str(p.ticket)] = {"code": str(code),
                                                   "eod": (cur or {}).get("eod") if isinstance(cur, dict) else None}
                changed = True
        else:
            unknown.append(p)
    if changed:
        save_state(state)
    return by_code, unknown


def reconcile_closures(state, open_tickets, feed_codes):
    """MT5'te artık AÇIK OLMAYAN ticket kayıtlarını işle:
    • kodu hâlâ feed'de ise → broker tarafında kapanmış (SL/TP/manuel/bizim
      kapanışımız) → done'a yaz: bu kod bir daha AÇILMAZ (zincirleme stop yok).
    • ticket kaydını sil. Feed'den düşen kodların done kaydını da temizle
      (yaşam döngüsü bitti; MT5_RESET sonrası kod tekrar kullanımına hazır)."""
    changed = False
    for t in list(state["tickets"].keys()):
        if t in open_tickets:
            continue
        meta = state["tickets"].pop(t)
        changed = True
        code = (meta or {}).get("code") if isinstance(meta, dict) else meta
        if code and feed_codes is not None and str(code) in feed_codes:
            state["done"][str(code)] = time.time()
            log.info("#%s: MT5 tarafında kapanmış (broker SL/TP/manuel) — done listesine alındı, YENİDEN AÇILMAZ.", code)
    if feed_codes is not None:
        for code in list(state["done"].keys()):
            if code not in feed_codes:
                del state["done"][code]
                changed = True
    if changed:
        save_state(state)


def past_deadline_positions(state, by_code, now_epoch=None):
    """Saklanan gün-sonu vakti (eod) geçmiş AÇIK pozisyonlar — pencereden ve
    feed'den bağımsız kapatılırlar (1. katman failsafe)."""
    now = now_epoch if now_epoch is not None else time.time()
    out = []
    seen = set()
    for meta in state["tickets"].values():
        if not isinstance(meta, dict):
            continue
        code, eod = meta.get("code"), meta.get("eod")
        if code and eod and now >= float(eod) and code in by_code and code not in seen:
            out.append(by_code[code])
            seen.add(code)
    return out


def try_reconnect():
    """Terminal koptuysa (account_info None) yeniden bağlanmayı dene."""
    try:
        mt5.shutdown()
    except Exception:  # noqa
        pass
    if mt5.initialize():
        ai = mt5.account_info()
        if ai is not None:
            log.info("Yeniden bağlanıldı: login=%s server=%s", ai.login, ai.server)
            return True
    log.error("MT5 bağlantısı yok — terminal açık mı? (%s)", mt5.last_error())
    return False


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
    log.info("MOD: %s · magic=%s", "DRY-RUN (emir YOK, sadece log)" if cfg["dry_run"] else "⚡ CANLI EMİR AKTİF", cfg["magic"])
    return True


def main():
    fh = logging.FileHandler(os.path.join(HERE, "scanner_bridge.log"), encoding="utf-8")
    fh.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logging.getLogger().addHandler(fh)
    if not os.path.exists(CONFIG_PATH):
        log.error("config yok: %s (config_scanner.example.json'u kopyala)", CONFIG_PATH)
        sys.exit(1)
    cfg = load_config()
    if not cfg["exec_token"]:
        log.error("config_scanner.exec_token boş — backend FOREX_EXEC_TOKEN ile aynı olmalı.")
        sys.exit(1)
    if not connect(cfg):
        mt5.shutdown()
        sys.exit(1)

    state = load_state()
    log.info("⚡ Gün-içi köprü başladı. Yoklama %ss. Semboller: %s",
             cfg["poll_seconds"], ", ".join(cfg["symbols"].keys()))
    try:
        while True:
            try:
                cfg = load_config()  # her tur taze (dry_run/enabled canlı değişebilir)
            except Exception as e:  # noqa
                log.error("config okunamadı: %s", e)
                time.sleep(int(DEFAULTS["poll_seconds"])); continue

            if not cfg.get("enabled", True):
                log.info("enabled=false — beklemede."); time.sleep(int(cfg["poll_seconds"])); continue

            # Bağlantı sağlığı: koptuysa yeniden bağlan (terminal restart'ına dayanıklılık)
            ai = mt5.account_info()
            if ai is None:
                if not try_reconnect():
                    time.sleep(int(cfg["poll_seconds"])); continue
                ai = mt5.account_info()

            if not cfg["dry_run"] and (ai is None or not ai.trade_allowed):
                log.warning("Algo Trading KAPALI / hesap yok — bu tur emir yok.")
                time.sleep(int(cfg["poll_seconds"])); continue

            push_broker_prices(cfg)

            # ⚠️ positions_get None = IPC hatası → TUR ATLANIR (inceleme bulgusu):
            # None'ı boş liste saymak state'i siler + aynı koda ÇİFT açılış açardı.
            raw = mt5.positions_get()
            if raw is None:
                log.error("positions_get None (%s) — tur atlandı (emniyet).", mt5.last_error())
                time.sleep(int(cfg["poll_seconds"])); continue

            tr_min = tr_minutes_now()
            by_code, unknown = identify_positions(cfg, raw, state)
            open_tickets = {str(p.ticket) for p in raw if p.magic == int(cfg["magic"])}

            # ── failsafe 1. katman: saklanan gün-sonu vakti geçen pozisyonu HER
            #    TURDA kapat (pencere kaçsa / feed boş olsa / gece yarısı geçse bile)
            for p in past_deadline_positions(state, by_code):
                close_position(cfg, p, "gün-sonu (saklanan vakit)")

            # ── failsafe 2. katman: 23:45+ süpürmesi — kimliksizler dahil her şey
            if tr_min >= int(cfg["eod_close_tr_min"]):
                remaining = list(by_code.values()) + unknown
                # 1. katmanda kapatılanlar positions_get'te hâlâ görünüyor olabilir;
                # close_position idempotent değil ama başarısız kapanış zaten loglanır.
                if remaining:
                    log.info("🌙 Gün sonu (%02d:%02d TR) — tüm gün-içi pozisyonlar kapatılıyor.", tr_min // 60, tr_min % 60)
                    for p in remaining:
                        close_position(cfg, p, "gün sonu süpürmesi")
                time.sleep(int(cfg["poll_seconds"])); continue

            feed = poll_feed(cfg)
            if feed is None:
                # feed yok → açılış/kapanış kararı YOK; ama broker-kapanışı tespiti
                # için ticket temizliği feed'siz de yapılabilir mi? Hayır — kodun
                # feed'de olup olmadığını bilemeyiz → done kararı verilemez. Bekle.
                time.sleep(int(cfg["poll_seconds"])); continue

            feed_codes = {str(s.get("code")) for s in feed}
            # MT5'te kapananları işle: feed'de duran kod → done (yeniden açma!)
            reconcile_closures(state, open_tickets, feed_codes)

            stop_kill = any(os.path.exists(f) for f in STOP_FILES)
            no_new_window = tr_min >= int(cfg["no_new_after_tr_min"])
            now_epoch = time.time()
            blocked_syms = {p.symbol for p in unknown}  # kimliksiz pozisyonlu sembole yeni açılış yok

            for s in feed:
                try:
                    code = str(s["code"])
                    inst = s["instrumentId"]
                    broker_sym = cfg["symbols"].get(inst)
                    if not broker_sym:
                        continue  # eşlenmemiş enstrüman
                    if code in by_code:
                        # açık — gün-sonu vaktini state'e işle (comment'ten benimsenen
                        # eski pozisyonların eod'u boş olabilir)
                        t = str(by_code[code].ticket)
                        meta = state["tickets"].get(t)
                        if isinstance(meta, dict) and not meta.get("eod") and s.get("eodDeadlineSec"):
                            meta["eod"] = s.get("eodDeadlineSec"); save_state(state)
                        continue
                    if code in state["done"]:
                        continue  # MT5 tarafında kapanmış kod — ASLA yeniden açma
                    if stop_kill:
                        log.warning("STOP dosyası var — #%s açılmadı.", code); continue
                    if no_new_window:
                        log.info("#%s: 23:00 TR sonrası yeni işlem penceresi kapalı — açılmadı.", code); continue
                    ddl = s.get("eodDeadlineSec")
                    if ddl and now_epoch >= float(ddl):
                        log.info("#%s: gün-sonu süresi geçmiş — açılmadı.", code); continue
                    if broker_sym in blocked_syms:
                        log.warning("#%s %s: kimliği çözülemeyen mevcut pozisyon var — çift açılış emniyeti, atlandı.", code, broker_sym); continue
                    if len(by_code) + len(unknown) >= int(cfg["max_open_positions"]):
                        log.warning("max_open_positions (%s) doldu — #%s atlandı.", cfg["max_open_positions"], code); continue
                    info = ensure_symbol(broker_sym)
                    if info is None:
                        log.warning("Sembol yok/görünmez: %s (%s) — atlandı.", broker_sym, inst); continue
                    open_trade(cfg, s, info, state)
                    raw2 = mt5.positions_get()
                    if raw2 is not None:
                        by_code, unknown = identify_positions(cfg, raw2, state)
                        blocked_syms = {p.symbol for p in unknown}
                except Exception as e:  # noqa — tek bozuk satır turu düşürmesin
                    log.error("sinyal işlenemedi %s: %s", s.get("code"), e); continue

            # Backend kapattı (TP/SL/gün-sonu tespiti, feed'den düştü) → MT5'i de kapat.
            # ⚠️ Boş feed = olası backend arızası → toplu kapatma YAPMA; gün-sonu
            #    1. katmanı saklanan vakitle yine de kapatır.
            if cfg["close_on_backend_close"] and feed:
                for code, p in list(by_code.items()):
                    if code not in feed_codes:
                        log.info("#%s %s: backend kapattı (feed'den düştü) — MT5 kapatılıyor.", code, p.symbol)
                        if close_position(cfg, p, "backend kapattı"):
                            state["done"][code] = time.time()
                            save_state(state)

            log.info("tur ok · feed=%d · açık(bizim)=%d · done=%d%s%s", len(feed), len(by_code) + len(unknown),
                     len(state["done"]), " · [STOP]" if stop_kill else "", " · [23:00+ yeni işlem yok]" if no_new_window else "")
            time.sleep(int(cfg["poll_seconds"]))
    except KeyboardInterrupt:
        log.info("Durduruldu (Ctrl+C).")
    finally:
        mt5.shutdown()


if __name__ == "__main__":
    main()
