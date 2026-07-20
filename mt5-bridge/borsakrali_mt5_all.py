#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BORSA KRALI — BİRLEŞİK KÖPRÜ (TÜM BOTLAR → MT5)

Site backend'indeki botCompetition'da yarışan + PANELDEN AÇIK olan TÜM botların
açık pozisyonlarını (GET /api/bridge/positions) çeker ve HER BOTU AYRI MAGIC ile
MT5 demo hesabında açar. Böylece tüm botlar aynı anda, ayrı ayrı işlem alır.

- competition = beyin (sinyal + istatistik + şampiyon); bu köprü = kol (MT5 yürütme).
- Bir bot pozisyonu feed'den düşünce (competition kapatınca) köprü MT5'te kapatır.
- Hangi botun GERÇEK işlem açacağı borsakrali.com /bot panelinden enable/disable edilir
  (feed yalnız açık botları içerir). Kapalı bot → köprü ona dokunmaz.

GÜVENLİK:
  • dry_run=true → HİÇBİR emir göndermez, ne yapacağını loglar (VARSAYILAN).
  • allowed_account → yalnız o FTMO demo login'de açar; başka hesapta REDDEDER.
  • trade_guard → hafta sonu (kripto-dışı) + ABD haber molası + günlük zarar freni.
  • MT5'te BULUNMAYAN sembol (ör. BIST hisseleri FTMO'da yoktur) sessizce ATLANIR.
  • Yanına "STOP_ALL" dosyası koyarsan yeni emir açmaz; config her turda okunur.

KULLANIM:  python borsakrali_mt5_all.py [config_all.json]
"""

import json
import logging
import os
import sys
import time
from datetime import datetime, timedelta, timezone

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
sys.path.insert(0, HERE)
CONFIG_PATH = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "config_all.json")
STOP_FILE = os.path.join(HERE, "STOP_ALL")
SHADOW_STATE = os.path.join(HERE, "shadow_positions.json")   # açık gölge pozisyonlar
SHADOW_TRADES = os.path.join(HERE, "shadow_trades.jsonl")    # kapanan gölge işlemler (P/L)

import trade_guard  # ortak İŞLEM KORUMASI + risk matematiği

BRIDGE_VERSION = "2026-07-18-all-bots"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                    handlers=[logging.StreamHandler()])
log = logging.getLogger("bk-all")

DEFAULTS = {
    "backend_url": "https://borsakrali.com",
    "exec_token": "",
    "poll_seconds": 60,
    "dry_run": True,
    "enabled": True,
    "terminal_path": "",
    "allowed_account": 0,
    "deviation_points": 30,
    # Birleşik köprüde ÇOK bot açabilir → toplam tavan + bot-başına tavan küçük tutulur.
    "max_open_total": 20,
    "max_open_per_bot": 3,
    # Lot: sabit-küçük (fixed) VEYA risk-bazlı (risk). VARSAYILAN küçük fixed —
    # çok bot aynı hesapta olduğundan tutucu başla, güven gelince artır.
    "lot_mode": "fixed",
    "fixed_lot": 0.05,
    "risk_pct": 0.25,
    "max_lot": 0.5,
    "min_rr": 0.5,
    "min_confidence": 0,          # feed'de bu güvenin altındakini açma (0 = hepsi)
    "close_on_feed_drift": True,  # feed'den düşen kodu MT5'te kapat (competition kapattı)
    # GÖLGE GÜNLÜĞÜ: gerçek emir açılamasa da (piyasa kapalı/dry_run/sembol yok) her
    # botun sinyalini MT5 FİYATINDAN "açmış gibi" kaydeder, SL/TP'yi MT5 girişine
    # göre kurar, kapanınca R/başarı hesaplar. "Hangi bot ne kadar başarılı" her
    # koşulda net görünür. shadow_trades.jsonl + her tur lider tablosu loglanır.
    "shadow_journal": True,
    # trade_guard korumaları (vars. AÇIK)
    "weekend_flatten": True,
    "news_blackout": True,
    "max_daily_loss_pct": 3.0,
    "max_daily_loss_pct_account": 4.5,
    "loss_reopen_cooldown_min": 45,
    # Sembol takma-adları: feed sembolü → broker sembolü (VPS broker'ına göre düzelt).
    # Boş bırakılırsa otomatik varyant taraması yapılır; bulunamazsa atlanır.
    "symbol_aliases": {},
    # Kategori filtresi: yalnız bu kategorilerden bot aç (boş = hepsi). BIST FTMO'da
    # yok → otomatik atlanır ama açıkça ["Forex","Emtia","Kripto","MT5","ICT"] verilebilir.
    "allow_categories": [],
    # Kategori→lot çarpanı (opsiyonel risk ayarı)
    "category_lot_mult": {},
}

# Feed sembolünü broker sembolüne çözerken denenecek yaygın son ekler/varyantlar.
_SUFFIXES = ("", ".r", ".raw", ".ecn", ".m", ".c", ".pro", "m", "-5", ".a", ".s", "_i")
# Yaygın endeks/emtia adlandırma farkları (broker'a göre config'ten ez).
_BUILTIN_ALIASES = {
    "US100": ("NAS100", "USTEC", "NDX100", "USTECHCASH", "US100.cash"),
    "NAS100": ("US100", "USTEC", "NDX100"),
    "US500": ("SPX500", "SP500", "US500.cash"),
    "SPX500": ("US500", "SP500"),
    "US30": ("DJ30", "DOW", "US30.cash"),
    "GER40": ("DE40", "DAX40", "GER40.cash"),
    "XAUUSD": ("GOLD", "XAUUSD.", "GOLDmicro"),
    "XAGUSD": ("SILVER", "XAGUSD."),
    "BTCUSD": ("BTCUSD.", "BTCUSDT", "Bitcoin"),
    "ETHUSD": ("ETHUSD.", "ETHUSDT", "Ethereum"),
}


def load_config():
    if not os.path.exists(CONFIG_PATH):
        log.warning("config_all.json yok, varsayılanlarla (dry_run) çalışıyor: %s", CONFIG_PATH)
        return dict(DEFAULTS)
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    merged = dict(DEFAULTS)
    merged.update(cfg)
    return merged


def code_comment(code):
    # MT5 comment ~31 karakter; kodu kısalt. Magic zaten botu ayırır.
    return ("A#" + str(code))[:31]


def parse_code(comment):
    c = (comment or "").strip()
    return c[2:] if c.startswith("A#") else None


# ── MT5 bağlantı + hesap kilidi (forex köprüsüyle aynı mantık) ──────────────
def _mt5_init(cfg):
    path = (cfg.get("terminal_path") or "").strip()
    if path:
        return mt5.initialize(path=path)
    return mt5.initialize()


def account_allowed(cfg, ai):
    want = int(cfg.get("allowed_account") or 0)
    if not want:
        return True
    if ai is None:
        return False
    return int(getattr(ai, "login", 0) or 0) == want


def autotrading_on():
    ti = mt5.terminal_info()
    return bool(ti and getattr(ti, "trade_allowed", False))


def connect(cfg):
    if not _mt5_init(cfg):
        log.error("MT5 initialize başarısız: %s", mt5.last_error())
        return False
    ai = mt5.account_info()
    if not account_allowed(cfg, ai):
        log.error("🔒 HESAP KİLİDİ: bağlı hesap %s ≠ izinli %s — köprü işlem AÇMAZ.",
                  getattr(ai, "login", "?"), cfg.get("allowed_account"))
        return False
    if int(cfg.get("allowed_account") or 0):
        log.info("🔒 Hesap kilidi AKTİF: yalnız %s", cfg["allowed_account"])
    if not autotrading_on():
        log.warning("⚠️ MT5 Algo Trading KAPALI — terminalde 'Algo Trading' düğmesini aç.")
    return True


def ensure_symbol(broker_sym):
    info = mt5.symbol_info(broker_sym)
    if info is None:
        return None
    if not info.visible:
        if not mt5.symbol_select(broker_sym, True):
            return None
        info = mt5.symbol_info(broker_sym)
    return info


_symbol_cache = {}
# Piyasa kapalı (retcode 10018) sembolleri: bu zamana kadar tekrar deneme (log spam'ı önler).
_market_closed_until = {}


def resolve_broker_symbol(cfg, feed_sym):
    """Feed sembolünü broker sembol adına çöz. Bulunamazsa None (atlanır)."""
    if feed_sym in _symbol_cache:
        return _symbol_cache[feed_sym]
    base = str(feed_sym or "").strip().upper().replace("/", "").replace("USDT", "USD")
    aliases = dict(_BUILTIN_ALIASES)
    for k, v in (cfg.get("symbol_aliases") or {}).items():
        # config alias: {"THYAO": "THYAO.IS"} → doğrudan; {"US100": ["NAS100"]} → liste
        aliases[str(k).upper()] = (v,) if isinstance(v, str) else tuple(v)
    candidates = [base]
    candidates += list(aliases.get(base, ()))
    tried = set()
    for cand in candidates:
        for suf in _SUFFIXES:
            name = cand + suf
            if name in tried:
                continue
            tried.add(name)
            info = ensure_symbol(name)
            if info is not None and int(getattr(info, "trade_mode", 4) or 0) in (1, 2, 4):
                _symbol_cache[feed_sym] = info.name
                return info.name
    _symbol_cache[feed_sym] = None
    return None


def send_with_filling(req):
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
        if r.retcode == 10030:
            continue
        return r
    return last


def min_stop_dist(info):
    lvl = max(getattr(info, "trade_stops_level", 0) or 0, getattr(info, "trade_freeze_level", 0) or 0)
    return lvl * info.point


def compute_lot(cfg, category, info, entry, stop):
    mode = str(cfg.get("lot_mode", "fixed"))
    if mode == "risk":
        try:
            equity = float(getattr(mt5.account_info(), "equity", 0) or 0)
        except Exception:
            equity = 0.0
        per_lot = trade_guard.per_lot_risk_usd(info, abs(float(entry) - float(stop)))
        lot = (equity * float(cfg.get("risk_pct", 0.25)) / 100.0) / per_lot if per_lot > 0 and equity > 0 else 0.0
    else:
        lot = float(cfg.get("fixed_lot", 0.05))
    mult = float((cfg.get("category_lot_mult") or {}).get(category, 1.0))
    lot *= mult
    step = info.volume_step or 0.01
    lot = round(round(lot / step) * step, 2)
    lot = max(info.volume_min, min(info.volume_max, lot))
    if lot > float(cfg.get("max_lot", 0.5)) + 1e-9:
        lot = float(cfg.get("max_lot", 0.5))
        lot = round(round(lot / step) * step, 2)
    if lot < info.volume_min:
        return 0.0
    return lot


def our_positions(cfg):
    """Bu köprünün açtığı tüm pozisyonlar (comment 'A#' + catalog magic'leri)."""
    out = []
    for p in mt5.positions_get() or []:
        code = parse_code(getattr(p, "comment", ""))
        if code is not None:
            out.append(p)
    return out


def open_from_feed(cfg, s):
    # Dönüş: neden kodu (özet için). "acildi" = MT5'te emir açıldı.
    if not account_allowed(cfg, mt5.account_info()):
        return "hesap_kilidi"
    conf = s.get("confidence")
    if conf is not None and float(conf) < float(cfg.get("min_confidence", 0)):
        return "dusuk_guven"
    cats = cfg.get("allow_categories") or []
    if cats and s.get("category") not in cats:
        return "kategori_disi"
    broker_sym = resolve_broker_symbol(cfg, s["symbol"])
    if not broker_sym:
        return "sembol_yok"
    # Piyasa kapalıysa (son denemede 10018) bu sembolü bir süre atla — log spam'ı önle.
    if _market_closed_until.get(broker_sym, 0) > time.time():
        return "piyasa_kapali"
    info = ensure_symbol(broker_sym)
    if info is None:
        return "sembol_yok"
    is_long = s["direction"] == "long"
    tick = mt5.symbol_info_tick(info.name)
    if tick is None or not (tick.ask > 0 and tick.bid > 0):
        return "fiyat_yok"
    price = tick.ask if is_long else tick.bid
    # SEVİYELER MT5 FİYATINA GÖRE (mutlak): sinyalin risk/ödül MESAFESİNİ koru ama
    # SL/TP'yi MT5 giriş fiyatina yeniden bağla. Böylece fiyat-uzayi uyumsuzlugu
    # (site-Yahoo vs broker) ve 'Invalid stops' (retcode 10016) giderilir.
    sig_entry = float(s["entry"]); sig_stop = float(s["stop"])
    risk = abs(sig_entry - sig_stop)
    reward = abs(float(s["target1"]) - sig_entry) if s.get("target1") else risk * 2
    if risk <= 0:
        return "gecersiz_stop"
    if reward / risk < float(cfg.get("min_rr", 0.5)):
        return "dusuk_rr"
    # Broker asgari stop mesafesi: çok dar stop reddedilmesin diye mesafeye çek
    # (R:R korunur; reward risk oraninca büyütülür).
    md = min_stop_dist(info)
    if md > 0 and risk < md * 1.1:
        rr = reward / risk
        risk = md * 1.2
        reward = risk * rr
    sl = price - risk if is_long else price + risk
    tp1 = price + reward if is_long else price - reward
    d = info.digits
    sl, tp = round(sl, d), round(tp1, d)
    lot = compute_lot(cfg, s.get("category"), info, price, sl)
    if lot <= 0:
        return "lot_sifir"
    magic = int(s.get("magic") or 0)
    label = "LONG" if is_long else "SHORT"
    if cfg["dry_run"]:
        log.info("[DRY] AÇ %s | %s %s lot=%s @%.*f SL=%.*f TP=%.*f magic=%s (%s)",
                 s.get("botName"), info.name, label, lot, d, price, d, sl, d, tp, magic, s["code"])
        return "dry"
    req = {
        "action": mt5.TRADE_ACTION_DEAL, "symbol": info.name, "volume": float(lot),
        "type": mt5.ORDER_TYPE_BUY if is_long else mt5.ORDER_TYPE_SELL,
        "price": price, "sl": sl, "tp": tp, "deviation": int(cfg["deviation_points"]),
        "magic": magic, "comment": code_comment(s["code"]), "type_time": mt5.ORDER_TIME_GTC,
    }
    r = send_with_filling(req)
    if r and r.retcode == mt5.TRADE_RETCODE_DONE:
        log.info("✅ AÇILDI %s | %s %s lot=%s magic=%s ticket=%s", s.get("botName"), info.name, label, lot, magic, r.order)
        return "acildi"
    elif r and r.retcode == getattr(mt5, "TRADE_RETCODE_MARKET_CLOSED", 10018):
        # Piyasa kapalı (hafta sonu / seans dışı): sembolü 15 dk atla, bir kez INFO logla.
        _market_closed_until[info.name] = time.time() + 900
        log.info("⏸ %s piyasa kapalı — 15 dk atlanacak (%s).", info.name, s.get("botName"))
        return "piyasa_kapali"
    else:
        rc = r.retcode if r else "None"
        log.error("❌ AÇILAMADI %s %s: retcode=%s %s", s.get("botName"), info.name, rc, (r.comment if r else mt5.last_error()))
        return "hata:%s" % rc


def close_position(cfg, pos, reason):
    info = mt5.symbol_info(pos.symbol)
    if info is None:
        return
    is_long = pos.type == mt5.POSITION_TYPE_BUY
    tick = mt5.symbol_info_tick(pos.symbol)
    if tick is None:
        return
    price = tick.bid if is_long else tick.ask
    if cfg["dry_run"]:
        log.info("[DRY] KAPAT %s %s (%s)", parse_code(pos.comment), pos.symbol, reason)
        return
    req = {
        "action": mt5.TRADE_ACTION_DEAL, "symbol": pos.symbol, "volume": pos.volume,
        "type": mt5.ORDER_TYPE_SELL if is_long else mt5.ORDER_TYPE_BUY, "position": pos.ticket,
        "price": price, "deviation": int(cfg["deviation_points"]), "magic": int(pos.magic),
        "comment": "close", "type_time": mt5.ORDER_TIME_GTC,
    }
    r = send_with_filling(req)
    if r and r.retcode == mt5.TRADE_RETCODE_DONE:
        log.info("🔒 KAPATILDI %s %s (%s)", parse_code(pos.comment), pos.symbol, reason)
    else:
        log.error("❌ KAPATILAMADI %s %s: %s", parse_code(pos.comment), pos.symbol, (r.retcode if r else mt5.last_error()))


def _backend_base(cfg):
    # borsakrali.com -> www.borsakrali.com'a YÖNLENDİRİR ve requests yönlendirmede
    # Authorization header'ı düşürür (401). Baştan www kullanarak yönlendirmeyi önle.
    base = cfg["backend_url"].rstrip("/")
    if "://borsakrali.com" in base:
        base = base.replace("://borsakrali.com", "://www.borsakrali.com")
    return base


def fetch_feed(cfg):
    url = _backend_base(cfg) + "/api/bridge/positions"
    headers = {"Authorization": "Bearer %s" % cfg["exec_token"]} if cfg.get("exec_token") else {}
    # allow_redirects=False: beklenmedik yönlendirmede token'ı sessizce kaybetme.
    r = requests.get(url, headers=headers, timeout=15, allow_redirects=False)
    r.raise_for_status()
    data = r.json()
    if not data.get("success"):
        return None
    return data


def news_blackout_active(cfg):
    """ABD önemli veri molası: backend /api/market-guard → yoksa statik NFP yedeği."""
    if not bool(cfg.get("news_blackout", True)):
        return False
    try:
        url = _backend_base(cfg) + "/api/market-guard"
        r = requests.get(url, timeout=8)
        if r.ok:
            g = r.json()
            return bool((g.get("blackout") or {}).get("active"))
    except Exception:
        pass
    try:
        return trade_guard._static_news_event() is not None
    except Exception:
        return False


def symbol_guarded(cfg, feed_sym, weekend, news):
    """Hafta sonu (kripto-dışı) + ABD haber molası (kripto-dışı) kapısı."""
    crypto = trade_guard.is_crypto(feed_sym)
    if weekend and bool(cfg.get("weekend_flatten", True)) and not crypto:
        return True
    if news and not crypto:
        return True
    return False


# ── GÖLGE GÜNLÜĞÜ (MT5 fiyatlariyla paper takip; her kosulda çalisir) ─────────
def _shadow_price(cfg, feed_sym):
    """Sembolün MT5 orta fiyati. Piyasa kapaliysa son bilinen fiyati döner."""
    bsym = resolve_broker_symbol(cfg, feed_sym)
    if not bsym:
        return None, None
    info = ensure_symbol(bsym)
    if info is None:
        return None, None
    t = mt5.symbol_info_tick(bsym)
    bid = getattr(t, "bid", 0) or 0
    ask = getattr(t, "ask", 0) or 0
    if not (bid > 0 and ask > 0):
        bid = getattr(info, "bid", 0) or 0  # piyasa kapali: son bilinen
        ask = getattr(info, "ask", 0) or 0
    if not (bid > 0 and ask > 0):
        return None, info
    return (bid + ask) / 2.0, info


def _load_shadow():
    try:
        with open(SHADOW_STATE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _save_shadow(state):
    try:
        tmp = SHADOW_STATE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False)
        os.replace(tmp, SHADOW_STATE)
    except Exception as exc:
        log.warning("gölge durumu kaydedilemedi: %s", exc)


def _append_shadow_trade(rec):
    try:
        with open(SHADOW_TRADES, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    except Exception as exc:
        log.warning("gölge işlem yazilamadi: %s", exc)


def update_shadows(cfg, feed):
    """Her botun sinyalini MT5 fiyatindan 'açmis gibi' takip eder; gerçek emir
    açilsin açilmasin çalisir. SL/TP MT5 girisine göre kurulur (sinyalin R:R'i
    korunur). Kapaninca R hesaplanip shadow_trades.jsonl'e yazilir."""
    if not bool(cfg.get("shadow_journal", True)):
        return
    state = _load_shadow()
    feed_by = {str(p["code"]): p for p in feed}
    now = int(time.time())

    # 1) yeni gölge pozisyonlar (MT5 fiyatiyla aç)
    for code, p in feed_by.items():
        if code in state:
            continue
        price, info = _shadow_price(cfg, p["symbol"])
        if price is None:
            continue
        is_long = p["direction"] == "long"
        sig_entry = float(p["entry"]); sig_stop = float(p["stop"])
        risk = abs(sig_entry - sig_stop)
        reward = abs(float(p["target1"]) - sig_entry) if p.get("target1") else risk * 2
        if risk <= 0:
            continue
        stop = price - risk if is_long else price + risk
        target = price + reward if is_long else price - reward
        state[code] = {
            "botId": p["botId"], "botName": p["botName"], "symbol": p["symbol"],
            "direction": p["direction"], "entry": round(price, 8), "stop": round(stop, 8),
            "target": round(target, 8), "risk": round(risk, 8), "magic": p.get("magic"),
            "confidence": p.get("confidence"), "opened_at": now,
        }
        log.info("📝 GÖLGE AÇ %-22s %s %-8s @%.5f (MT5) SL=%.5f TP=%.5f",
                 p["botName"], p["symbol"], p["direction"], price, stop, target)

    # 2) açik gölgeleri güncelle/kapat (SL/TP MT5 fiyatinda; feed'den düsen = kapat)
    for code in list(state.keys()):
        sh = state[code]; is_long = sh["direction"] == "long"
        price, _ = _shadow_price(cfg, sh["symbol"])
        outcome = None; exit_px = None
        if price is not None:
            if is_long and price <= sh["stop"]:
                outcome, exit_px = "SL", sh["stop"]
            elif is_long and price >= sh["target"]:
                outcome, exit_px = "TP", sh["target"]
            elif (not is_long) and price >= sh["stop"]:
                outcome, exit_px = "SL", sh["stop"]
            elif (not is_long) and price <= sh["target"]:
                outcome, exit_px = "TP", sh["target"]
            elif code not in feed_by:
                outcome, exit_px = "FEED_CLOSE", price  # competition kapatti
        if outcome:
            risk = sh["risk"] or 1e-9
            r = ((exit_px - sh["entry"]) if is_long else (sh["entry"] - exit_px)) / risk
            _append_shadow_trade({
                "ts": now, "botId": sh["botId"], "botName": sh["botName"], "symbol": sh["symbol"],
                "direction": sh["direction"], "entry": sh["entry"], "exit": round(exit_px, 8),
                "outcome": outcome, "r": round(r, 3), "confidence": sh.get("confidence"),
                "opened_at": sh["opened_at"], "closed_at": now,
            })
            log.info("📕 GÖLGE KAPAT %-22s %s %-8s -> %-10s R=%+.2f",
                     sh["botName"], sh["symbol"], sh["direction"], outcome, r)
            del state[code]
    _save_shadow(state)


def shadow_summary():
    """Gölge işlemlerden bot-başi lider tablosu (MT5 fiyatlariyla) — bridge penceresinde."""
    stats = {}
    try:
        with open(SHADOW_TRADES, "r", encoding="utf-8") as f:
            for line in f:
                try:
                    rec = json.loads(line)
                except Exception:
                    continue
                b = rec.get("botName", "?")
                s = stats.setdefault(b, {"n": 0, "w": 0, "netR": 0.0})
                s["n"] += 1; s["netR"] += float(rec.get("r", 0) or 0)
                if float(rec.get("r", 0) or 0) > 0:
                    s["w"] += 1
    except FileNotFoundError:
        return
    if not stats:
        return
    log.info("──── GÖLGE LİDER TABLOSU (MT5 fiyatlariyla, hangi bot ne kadar basarili) ────")
    for b, s in sorted(stats.items(), key=lambda x: -x[1]["netR"]):
        wr = 100 * s["w"] / s["n"] if s["n"] else 0
        log.info("   %-24s islem=%-4d kazanma=%%%-3.0f netR=%+.2f", b, s["n"], wr, s["netR"])


# ── GERÇEK SONUÇ BESLEME (MT5 deal geçmişi → site) ───────────────────────────
_last_results_report = 0.0

def report_real_results(cfg, force=False):
    """MT5 hesabının kapanan işlemlerini (tüm magic'ler: 5701-5715 + custom 5720+
    + altın 20260707) okuyup siteye POST eder. Lider tablosu + günlük rapor
    bunu GERÇEK sonuç olarak kullanır. 5 dk'da bir (throttle)."""
    global _last_results_report
    now = time.time()
    if not force and now - _last_results_report < 300:
        return
    _last_results_report = now
    try:
        start = datetime.now(timezone.utc) - timedelta(days=7)
        end = datetime.now(timezone.utc) + timedelta(hours=6)
        deals = mt5.history_deals_get(start, end)
    except Exception as exc:
        log.warning("deal geçmişi okunamadı: %s", exc)
        return
    if not deals:
        return
    OUT = getattr(mt5, "DEAL_ENTRY_OUT", 1)
    rows = []
    for d in deals:
        if getattr(d, "entry", None) != OUT:
            continue  # yalnız KAPANIŞ deal'leri (P/L bunlarda)
        magic = int(getattr(d, "magic", 0) or 0)
        if magic <= 0:
            continue  # bot işlemi değil (manuel/bilanço)
        pnl = (getattr(d, "profit", 0) or 0) + (getattr(d, "swap", 0) or 0) + (getattr(d, "commission", 0) or 0)
        rows.append({
            "id": str(getattr(d, "ticket", "")),
            "magic": magic,
            "pnl": round(pnl, 2),
            "closedSec": int(getattr(d, "time", 0) or 0),
            "reason": int(getattr(d, "reason", 0) or 0),
            "symbol": str(getattr(d, "symbol", "")),
        })
    if not rows:
        return
    try:
        url = _backend_base(cfg) + "/api/bridge/results"
        headers = {"Authorization": "Bearer %s" % cfg["exec_token"]} if cfg.get("exec_token") else {}
        r = requests.post(url, json={"deals": rows}, headers=headers, timeout=15, allow_redirects=False)
        if r.status_code == 200:
            log.info("📤 Gerçek sonuçlar siteye beslendi: %d kapanan işlem", len(rows))
        else:
            log.warning("gerçek sonuç POST %s: %s", r.status_code, r.text[:120])
    except Exception as exc:
        log.warning("gerçek sonuç POST hatası: %s", exc)


def run_once(cfg):
    if os.path.exists(STOP_FILE):
        log.info("STOP_ALL dosyası var — yeni emir açılmıyor (mevcutlar yönetilir).")
        stop = True
    else:
        stop = False

    # trade_guard: hafta sonu / haber / günlük zarar freni (tek çekimle)
    try:
        deals = trade_guard.fetch_recent_deals(mt5, cfg.get("loss_reopen_cooldown_min", 45))
        positions = mt5.positions_get()
        blocked, why = trade_guard.daily_loss_blocked(mt5, cfg, logger=log, deals=deals, positions=positions)
    except Exception as exc:
        blocked, why = False, None
        log.warning("trade_guard günlük fren okunamadı (fail-open): %s", exc)
    new_orders_allowed = not stop and not blocked
    if blocked:
        log.warning("🛑 Günlük zarar freni AKTİF (%s) — yeni emir yok.", why)

    try:
        data = fetch_feed(cfg)
    except Exception as exc:
        log.error("feed çekilemedi: %s", exc)
        return
    if data is None or not data.get("enabled"):
        log.info("competition kapalı veya feed boş — köprü bekliyor.")
        feed = []
    else:
        feed = data.get("positions") or []

    feed_codes = {str(p["code"]) for p in feed}
    open_pos = our_positions(cfg)
    open_codes = {parse_code(p.comment) for p in open_pos}

    # 1) feed'den düşen (competition kapatmış) pozisyonları MT5'te kapat
    if bool(cfg.get("close_on_feed_drift", True)):
        for p in open_pos:
            code = parse_code(p.comment)
            if code and code not in feed_codes:
                close_position(cfg, p, "competition-kapatti")

    # 2) yeni pozisyonları aç (tavanlar + haftasonu/haber + guard)
    reasons = {}  # neden kodu -> adet (tur özeti için)
    def _bump(k): reasons[k] = reasons.get(k, 0) + 1
    if not new_orders_allowed:
        _bump("stop_veya_gunluk_fren")
    if new_orders_allowed:
        weekend = trade_guard.in_weekend_closed()
        news = news_blackout_active(cfg)
        if weekend:
            log.info("hafta sonu penceresi — kripto-dışı yeni emir yok.")
        if news:
            log.info("ABD haber molası — kripto-dışı yeni emir yok.")
        per_bot = {}
        total_open = len([p for p in open_pos if parse_code(p.comment)])
        # 0 (veya negatif) = SINIRSIZ. Her botun tüm işlemleri açılsın istenirse
        # config'te max_open_total ve max_open_per_bot = 0 yapilir.
        max_total = int(cfg.get("max_open_total", 20))
        max_per_bot = int(cfg.get("max_open_per_bot", 3))
        for s in sorted(feed, key=lambda x: -(x.get("confidence") or 0)):
            code = str(s["code"])
            if code in open_codes:
                _bump("zaten_acik"); continue
            if max_total > 0 and total_open >= max_total:
                _bump("tavan_doldu"); break
            bkey = s.get("botId")
            if max_per_bot > 0 and per_bot.get(bkey, 0) >= max_per_bot:
                _bump("bot_tavani"); continue
            if symbol_guarded(cfg, s["symbol"], weekend, news):
                _bump("guard_hafta_haber"); continue
            res = open_from_feed(cfg, s) or "bilinmiyor"
            _bump(res)
            if res in ("acildi", "dry"):
                per_bot[bkey] = per_bot.get(bkey, 0) + 1
                total_open += 1

    # 3) GÖLGE GÜNLÜĞÜ — her koşulda çalışır (dry_run/piyasa-kapalı/hafta-sonu fark etmez).
    #    Gerçek emir açılmasa da her botun sinyalini MT5 fiyatından "açmış gibi" takip eder.
    try:
        update_shadows(cfg, feed)
        shadow_summary()
    except Exception as exc:
        log.warning("gölge günlüğü hatası: %s", exc)

    # 4) GERÇEK SONUÇLARI SİTEYE BESLE (5 dk'da bir) — lider tablosu/rapor gerçek olsun.
    try:
        report_real_results(cfg)
    except Exception as exc:
        log.warning("gerçek sonuç besleme hatası: %s", exc)

    if feed:
        acildi = reasons.get("acildi", 0) + reasons.get("dry", 0)
        atlanan = {k: v for k, v in reasons.items() if k not in ("acildi", "dry", "zaten_acik")}
        ozet = " · ".join("%s=%d" % (k, v) for k, v in sorted(atlanan.items(), key=lambda x: -x[1]))
        log.info("📋 TUR ÖZETİ: feed %d · AÇILDI %d · zaten-açık %d%s",
                 len(feed), acildi, reasons.get("zaten_acik", 0), (" · atlanan → " + ozet) if ozet else "")


def main():
    fh = logging.FileHandler(os.path.join(HERE, "bridge_all.log"), encoding="utf-8")
    fh.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    log.addHandler(fh)
    cfg = load_config()
    log.info("=== BİRLEŞİK KÖPRÜ v%s === dry_run=%s hesap=%s backend=%s",
             BRIDGE_VERSION, cfg["dry_run"], cfg.get("allowed_account") or "KİLİT YOK", cfg["backend_url"])
    if not cfg.get("exec_token"):
        log.error("exec_token boş — config_all.json'a FOREX_EXEC_TOKEN yaz. Çıkılıyor.")
        return
    if not connect(cfg):
        log.error("Bağlantı/hesap kilidi başarısız — çıkılıyor. (Terminali FTMO demo'ya bağla + Algo Trading aç.)")
        return
    log.info("bağlandı. Poll %ss. Durdurmak: STOP_ALL dosyası veya Ctrl+C.", cfg["poll_seconds"])
    while True:
        try:
            cfg = load_config()
            if cfg.get("enabled", True):
                run_once(cfg)
            else:
                log.info("enabled=false — köprü duraklatıldı.")
        except KeyboardInterrupt:
            log.info("Ctrl+C — çıkılıyor.")
            break
        except Exception as exc:
            log.exception("tur hatası: %s", exc)
        time.sleep(max(10, int(cfg.get("poll_seconds", 60))))


if __name__ == "__main__":
    main()
