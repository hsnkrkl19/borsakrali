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
    Comment kaybolursa scanner_state.json (position identifier→kod) yedeğinden çözülür.
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
sys.path.insert(0, HERE)               # yerel modüller (trade_guard) için
CONFIG_PATH = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "config_scanner.json")
STOP_FILES = (os.path.join(HERE, "STOP"), os.path.join(HERE, "STOP_SCANNER"),
              os.path.join(HERE, "STOP_MASTER"))
STATE_PATH = os.path.join(HERE, "scanner_state.json")
NEWS_CACHE = os.path.join(HERE, "news_windows_scanner.json")

import trade_guard  # ortak İŞLEM KORUMASI: hafta sonu (kripto-dışı) + ABD haber molası + günlük zarar freni
import mt5_brain_adapter

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                    handlers=[logging.StreamHandler()])
log = logging.getLogger("bk-mt5-scanner")

BRIDGE_VERSION = "2026-07-06-daily-guard"  # açılış banner'ında loglanır (VPS kod-sürümü teyidi)

COMMENT_PREFIX = "BKG#"
RETCODE_OK = 10009        # TRADE_RETCODE_DONE
RETCODE_PARTIAL = 10010   # TRADE_RETCODE_DONE_PARTIAL — pozisyon KISMEN açık = başarı
RETCODE_BAD_FILLING = 10030

DEFAULTS = {
    "backend_url": "https://borsakrali.com",
    "exec_token": "",
    "poll_seconds": 10,
    "dry_run": True,
    "enabled": True,
    # ── VPS GÜVENLİĞİ (iki terminal / iki hesap) — forex köprüsüyle aynı ─────
    # terminal_path: bağlanılacak terminal64.exe tam yolu (VPS'te birden çok
    #   terminal varsa yanlış hesabı önler). Boşsa çalışan/varsayılan terminal.
    # allowed_account: İZİNLİ hesap no. Ayarlıysa köprü YALNIZ o login'de işlem
    #   açar; başka hesaba bağlıysa REDDEDER. 0 = kapalı (iki hesaplı VPS'te ŞART).
    "terminal_path": "",
    "allowed_account": 0,
    "magic": 550066,
    "deviation_points": 30,
    "max_open_positions": 12,
    "max_lot": 1.0,
    # B3: acik pozisyonlarin TOPLAM riski equity'nin bu %'sini asarsa YENI giris yok (0=kapali):
    "max_portfolio_risk_pct": 2.0,
    "central_brain_enabled": True,
    "brain_required": True,
    "risk_fail_closed": True,
    "risk_profile": "balanced",
    "balanced_risk_pct_min": 0.10,
    "balanced_risk_pct_max": 0.25,
    "aggressive_risk_pct_min": 0.50,
    "aggressive_risk_pct_max": 1.00,
    "max_symbol_direction_risk_pct": 0.50,
    "max_bot_open_risk_pct": 0.50,
    "max_account_open_risk_pct": 2.0,
    "daily_entry_brake_pct": 1.50,
    "daily_flatten_warning_pct": 4.00,
    "daily_flatten_pct": 4.25,
    "daily_hard_limit_pct": 4.50,
    "total_flatten_warning_pct": 9.00,
    "total_flatten_pct": 9.25,
    "total_hard_limit_pct": 9.50,
    "profit_stop_pct": 10.0,
    "min_expected_pnl_usd": 15.0,
    "min_initial_risk_usd": 15.0,
    "same_underlying_one_position": True,
    "reversal_confirmations": 2,
    "reversal_window_seconds": 20,
    "reversal_cooldown_seconds": 15,
    "brain_heartbeat_max_age_seconds": 10,
    # GUNLUK ZARAR DEVRE-KESICISI (2026-07-06 olayi): bugunku (TR) gerceklesen+acik
    # P/L esigi asarsa YENI islem yok. bot = yalniz bu magic; account = hesabin TUMU
    # (forex koprusu + altin botuyla BIRLIKTE FTMO gunluk %5 limitini korur). 0 = kapali.
    "max_daily_loss_pct": 1.5,
    "max_daily_loss_pct_account": 4.5,
    # Az once ZARARLA kapanan sembole bu kadar dakika yeni emir yok (yeniden-giris freni):
    "loss_reopen_cooldown_min": 45,
    "min_rr": 2.0,
    "close_on_backend_close": True,
    "push_prices": False,
    "no_new_after_tr_min": 23 * 60,        # 23:00 TR sonrası yeni işlem yok
    "eod_close_tr_min": 23 * 60 + 45,      # 23:45 TR süpürmesi (2. katman)
    # İŞLEM KORUMASI (trade_guard) — ikisi de vars. AÇIK; config'ten kapatılabilir:
    "weekend_flatten": True,    # Cuma 23:45→Pzt 03:00 TSI: kripto-dışı YENİ işlem yok
    "news_blackout": True,      # ABD önemli verisi ±30 dk: TÜMÜNÜ kapat + açma
    "symbols": {},
}

TR_UTC_OFFSET_HOURS = 3  # Türkiye DST uygulamaz — sabit UTC+3


def tr_minutes_now(now_utc=None):
    now = now_utc or datetime.now(timezone.utc)
    tr = now + timedelta(hours=TR_UTC_OFFSET_HOURS)
    return tr.hour * 60 + tr.minute


def load_config():
    # utf-8-sig: Windows Not Defteri (ve PowerShell Set-Content) UTF-8 kaydederken
    # başa BOM koyar; düz "utf-8" ile json.load "Unexpected UTF-8 BOM" deyip patlar
    # ve köprü hiç açılmaz. utf-8-sig BOM'lu da BOM'suz da okur.
    with open(CONFIG_PATH, "r", encoding="utf-8-sig") as f:
        cfg = json.load(f)
    merged = dict(DEFAULTS)
    merged.update(cfg)
    if not isinstance(merged.get("dry_run"), bool):
        raise ValueError("config dry_run JSON boolean (true/false) olmali")
    if not isinstance(merged.get("central_brain_enabled"), bool):
        raise ValueError("config central_brain_enabled JSON boolean olmali")
    return merged


def code_comment(code):
    return COMMENT_PREFIX + str(code)


def parse_code(comment):
    c = (comment or "").strip()
    return c[len(COMMENT_PREFIX):] if c.startswith(COMMENT_PREFIX) else None


# ── kalıcı durum: tickets (position identifier→meta) + pending + done ────────
def load_state():
    try:
        with open(STATE_PATH, "r", encoding="utf-8") as f:
            d = json.load(f)
        if not isinstance(d, dict):
            return {"tickets": {}, "pending": {}, "done": {}}
        if "tickets" not in d:  # eski düz {ticket: code} şeması → yükselt
            d = {"tickets": {t: {"code": c, "eod": None} for t, c in d.items()},
                 "pending": {}, "done": {}}
        d.setdefault("tickets", {})
        d.setdefault("pending", {})
        d.setdefault("done", {})
        return d
    except Exception:  # noqa
        return {"tickets": {}, "pending": {}, "done": {}}


def save_state(state):
    try:
        tmp = STATE_PATH + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False, indent=1)
        os.replace(tmp, STATE_PATH)  # atomik değiştirme — çökme anında yarım dosya kalmasın
    except Exception as e:  # noqa
        log.error("state yazılamadı: %s", e)


def snap_lot(feed_lots, info, cfg):
    """Feed lotunu broker adımına/limitlerine oturt ve [0.01, 0.15] sert sınırına
    KIRP (2026-07-24 kullanıcı talebi).

    ⚠️ Davranış değişikliği: eskiden tavanı aşan feed lotu 0 dönüp işlemi
    ATLIYORDU ("risk sinyaldekinin üstüne çıkmasın" gerekçesiyle). Tavan 0.15'e
    indiği için bu, backend'in ürettiği neredeyse her sinyali sessizce iptal
    ederdi. AŞAĞI kırpmak riski asla artırmaz — o yüzden reddetmek yerine kırpıyoruz.
    Adım-dışı lot yine AŞAĞI tabanlanır."""
    try:
        lot = float(feed_lots)
    except (TypeError, ValueError):
        return 0.0
    if not lot > 0:
        return 0.0
    # Tarayıcı köprüsü Bot 37 feed'ini taşımaz → konsensüs istisnası yok.
    return trade_guard.clamp_lot(lot, info, None, cfg)


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


# --- PORTFOY RISK FRENI (denetim B3 - 2026-07-05) ---
# Risk matematigi trade_guard'da ORTAK (iki kopru ayni formulu kullansin —
# 2026-07-06 review: kopyalar ayrisirsa iki bot ayni hesapta farkli $ riski uygular).
_contract_size = trade_guard.contract_size
_per_lot_risk_usd = trade_guard.per_lot_risk_usd


def _position_open_risk_usd(pos):
    sl = getattr(pos, "sl", 0) or 0
    if sl <= 0:
        return 0.0
    info = mt5.symbol_info(pos.symbol)
    if info is None:
        return 0.0
    entry = getattr(pos, "price_open", 0) or 0
    return _per_lot_risk_usd(info, abs(entry - sl)) * (getattr(pos, "volume", 0) or 0)


def portfolio_risk_exceeded(cfg, raw_positions):
    """Bizim magic'li acik pozisyonlarin TOPLAM riski >= equity * max_portfolio_risk_pct mi?
    equity bilinmiyorsa fren uygulanmaz (fail-open)."""
    cap_pct = float(cfg.get("max_portfolio_risk_pct", 0) or 0)
    if cap_pct <= 0:
        return False
    ai = mt5.account_info()
    equity = getattr(ai, "equity", None) if ai else None
    if not equity or equity <= 0:
        return False
    total = 0.0
    for p in (raw_positions or []):
        if p.magic == int(cfg["magic"]):
            total += _position_open_risk_usd(p)
    return total >= equity * cap_pct / 100.0


def send_ok(r):
    return r is not None and r.retcode in (RETCODE_OK, RETCODE_PARTIAL)


def send_with_filling(req, allow_return=True):
    """Broker'ın desteklediği filling modunu dene.

    Açılış emirlerinde RETURN kapatılır; RETURN+DONE_PARTIAL kalan hacmi
    bekleyen emre dönüştürüp nihai dolum gibi görünmemelidir.
    """
    last = None
    modes = (mt5.ORDER_FILLING_IOC, mt5.ORDER_FILLING_FOK)
    if allow_return:
        modes += (mt5.ORDER_FILLING_RETURN,)
    for fmode in modes:
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


def position_state_key(pos):
    """MT5 service ticket değişse bile sabit kalan position identifier anahtarı."""
    identifier = getattr(pos, "identifier", 0) or 0
    ticket = getattr(pos, "ticket", 0) or 0
    value = identifier or ticket
    return str(value) if value else ""


def _live_open_position(cfg, symbol, code, is_long, attempts=5, delay_seconds=0.10):
    """Broker sonucundaki order/deal yerine oluşan canlı position kaydını bul."""
    wanted_type = mt5.POSITION_TYPE_BUY if is_long else mt5.POSITION_TYPE_SELL
    total_attempts = max(1, int(attempts))
    for attempt in range(total_attempts):
        raw = mt5.positions_get()
        if raw is not None:
            matches = [
                p for p in raw
                if getattr(p, "magic", None) == int(cfg["magic"])
                and getattr(p, "symbol", None) == symbol
                and getattr(p, "type", None) == wanted_type
                and parse_code(getattr(p, "comment", "")) == str(code)
            ]
            if matches:
                return max(
                    matches,
                    key=lambda p: (
                        int(getattr(p, "time_msc", 0) or 0),
                        int(getattr(p, "time", 0) or 0),
                        int(getattr(p, "ticket", 0) or 0),
                    ),
                )
        if attempt + 1 < total_attempts:
            time.sleep(max(0.0, float(delay_seconds)))
    return None


def _remember_live_position(state, pos, code, eod=None):
    """Canlı pozisyonun sabit kimliğini state'e yaz; mevcut EOD bilgisini koru."""
    key = position_state_key(pos)
    if not key:
        return False
    tickets = state.setdefault("tickets", {})
    cur = tickets.get(key)
    old_eod = cur.get("eod") if isinstance(cur, dict) else None
    identifier = getattr(pos, "identifier", 0) or 0
    meta = {
        "code": str(code),
        "eod": eod if eod is not None else old_eod,
        "ticket": str(getattr(pos, "ticket", 0) or ""),
        "identifier": str(identifier or key),
    }
    pending = state.setdefault("pending", {})
    changed = cur != meta or str(code) in pending
    tickets[key] = meta
    pending.pop(str(code), None)
    return changed


def open_trade(cfg, s, info, state):
    # SON hesap doğrulaması — emir göndermeden hemen önce (tik-içi hesap değişimine karşı)
    if not account_allowed(cfg, mt5.account_info()):
        return
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
    brain_plan = None
    if mt5_brain_adapter.enabled(cfg):
        brain_plan = mt5_brain_adapter.evaluate(
            mt5, cfg, info,
            candidate_id="scanner:%s:%s" % (cfg.get("magic"), code),
            bot_id=str(int(cfg.get("magic") or 0)), symbol=info.name,
            direction="long" if is_long else "short",
            timeframe=s.get("timeframe") or s.get("tf") or "default",
            entry=price, stop=sl, target=tp,
            confidence=s.get("confidence"),
            confirmations=s.get("agreeCount") or s.get("confirmations") or 1,
            # BKG# consumes four of MT5's 31 comment characters.
            code=str(code)[:27],
            logger=log,
        )
        if not brain_plan.allowed:
            return
        if brain_plan.decision.requires_atomic_execution:
            if not mt5_brain_adapter.close_for_reversal(
                    mt5, cfg, brain_plan.decision.close_tickets,
                    logger=log, plan=brain_plan):
                mt5_brain_adapter.finalize(brain_plan, False, logger=log)
                return
        lot = brain_plan.lot
        # Beynin puana gore 3R/4R/5R hedefi TP'yi yalniz UZAKLASTIRABILIR.
        brain_tp = float(getattr(brain_plan.decision, "target", 0) or 0)
        if brain_tp > 0:
            tp = round(max(tp, brain_tp) if is_long else min(tp, brain_tp), d)
        plan_meta = getattr(brain_plan, "metadata", None)
        if isinstance(plan_meta, dict):
            # Telegram/lifecycle satiri brokera giden GERCEK TP'yi tasimali.
            plan_meta["tp"] = tp
    else:
        lot = snap_lot(s.get("lots"), info, cfg)
    if lot <= 0:
        if brain_plan:
            mt5_brain_adapter.finalize(brain_plan, False, logger=log)
        log.warning("#%s %s: feed lotu (%s) broker/emniyet limitlerine uymadı — atlandı.", code, info.name, s.get("lots"))
        return

    label = "LONG" if is_long else "SHORT"
    if cfg["dry_run"]:
        log.info("[DRY] AÇ %s %s %s lot=%s @%.*f SL=%.*f TP=%.*f (tf %s, güven %s)",
                 code, info.name, label, lot, d, price, d, sl, d, tp, s.get("tf"), s.get("confidence"))
        if brain_plan:
            mt5_brain_adapter.finalize(brain_plan, False, logger=log)
        return

    if brain_plan and not mt5_brain_adapter.pre_send_check(
            mt5, cfg, brain_plan, logger=log):
        mt5_brain_adapter.finalize(
            brain_plan, False, logger=log, reason="fail_closed:pre_send_gate")
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
    r = send_with_filling(req, allow_return=False)
    if send_ok(r):
        fill = float(getattr(r, "price", 0) or 0) or price
        filled_volume = float(getattr(r, "volume", 0) or lot)
        broker_ticket = (getattr(r, "order", 0) or getattr(r, "deal", 0))
        if brain_plan:
            finalized = mt5_brain_adapter.finalize(
                brain_plan, True, ticket=broker_ticket, logger=log,
                fill_price=fill, filled_volume=filled_volume)
            if not finalized:
                log.critical(
                    "BROKER DOLUMU VAR AMA BEYIN FINALIZE BASARISIZ: "
                    "code=%s symbol=%s ticket=%s lot=%s",
                    code, info.name, broker_ticket, filled_volume)
        part = " (KISMİ dolum)" if r.retcode == RETCODE_PARTIAL else ""
        log.info("✅ AÇILDI%s %s %s %s lot=%s @%.*f SL=%.*f TP=%.*f ticket=%s",
                 part, code, info.name, label, filled_volume,
                 d, fill, d, sl, d, tp, broker_ticket)
        # order/deal bileti pozisyon bileti değildir. Canlı position identifier
        # state anahtarıdır; görünürlük gecikirse EOD bilgisi pending'de korunur.
        live_pos = _live_open_position(cfg, info.name, code, is_long)
        if live_pos is not None:
            _remember_live_position(
                state, live_pos, code, eod=s.get("eodDeadlineSec"))
        else:
            state.setdefault("pending", {})[code] = {
                "code": code,
                "eod": s.get("eodDeadlineSec"),
                "symbol": info.name,
                "brokerTicket": str(broker_ticket or ""),
                "created": time.time(),
            }
            log.critical(
                "BROKER DOLUMU VAR AMA CANLI POSITION HENUZ BULUNAMADI: "
                "code=%s symbol=%s order/deal=%s; EOD pending state'te korundu.",
                code, info.name, broker_ticket)
        save_state(state)
    else:
        if brain_plan:
            mt5_brain_adapter.finalize(brain_plan, False, logger=log)
        rc = r.retcode if r else "None"
        cm = r.comment if r else mt5.last_error()
        log.error("❌ AÇILAMADI %s %s: retcode=%s %s", code, info.name, rc, cm)


def close_position(cfg, pos, reason):
    # Emir öncesi hesap doğrulaması: yanlış hesaba KAPATMA göndermeyelim
    if not account_allowed(cfg, mt5.account_info()):
        return
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
        partial = " KISMEN" if r.retcode == RETCODE_PARTIAL else ""
        log.info("KAPATMA%s DOLUMU %s %s (%s)", partial,
                 code, pos.symbol, reason)
        return True
    log.error("KAPATILAMADI %s %s: %s", code, pos.symbol, (r.comment if r else mt5.last_error()))
    return False


def poll_feed(cfg):
    url = cfg["backend_url"].rstrip("/") + "/api/mt5-scanner/positions"
    try:
        # Token Authorization header'inda (query-param CDN/access loglarina sizar).
        r = requests.get(url, headers={"Authorization": "Bearer " + cfg["exec_token"]}, timeout=20)
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
    """Pozisyonları canlı ``identifier`` ile kimliklendir ve eski state'i yükselt.

    Position ticket broker servis işlemlerinde değişebilir; identifier sabittir.
    Eski ticket anahtarları ve açılış görünürlük gecikmesindeki pending EOD kaydı,
    canlı identifier anahtarına taşınır. Temizlik reconcile_closures'ta yapılır.
    """
    by_code, unknown = {}, []
    tickets = state.setdefault("tickets", {})
    pending = state.setdefault("pending", {})
    changed = False
    for p in raw_positions:
        if p.magic != int(cfg["magic"]):
            continue
        key = position_state_key(p)
        ticket_key = str(getattr(p, "ticket", 0) or "")
        cur = tickets.get(key)
        legacy = tickets.get(ticket_key) if ticket_key and ticket_key != key else None
        code = parse_code(p.comment)
        if not code:
            for meta in (cur, legacy):
                if isinstance(meta, dict) and meta.get("code"):
                    code = str(meta["code"])
                    break
        if code:
            code = str(code)
            by_code[code] = p
            eod = None
            for meta in (cur, legacy, pending.get(code)):
                if isinstance(meta, dict) and meta.get("eod") is not None:
                    eod = meta.get("eod")
                    break
            # Comment sağlam fakat ticket değişmiş eski kayıtta EOD varsa onu da koru.
            if eod is None:
                for old_meta in tickets.values():
                    if (isinstance(old_meta, dict)
                            and str(old_meta.get("code")) == code
                            and old_meta.get("eod") is not None):
                        eod = old_meta.get("eod")
                        break
            if _remember_live_position(state, p, code, eod=eod):
                changed = True
            # Aynı kodun eski order/ticket anahtarlarını identifier'a taşı.
            for alias, old in list(tickets.items()):
                if (alias != key and isinstance(old, dict)
                        and str(old.get("code")) == code):
                    del tickets[alias]
                    changed = True
        else:
            unknown.append(p)
    if changed:
        save_state(state)
    return by_code, unknown


def reconcile_closures(state, open_position_ids, feed_codes):
    """MT5'te artık AÇIK OLMAYAN position identifier kayıtlarını işle:
    • kodu hâlâ feed'de ise → broker tarafında kapanmış (SL/TP/manuel/bizim
      kapanışımız) → done'a yaz: bu kod bir daha AÇILMAZ (zincirleme stop yok).
    • ticket kaydını sil. Feed'den düşen kodların done kaydı 3 ARDIŞIK dolu-feed'de
      görünmeyince temizlenir (denetim 2026-07-06: tek geçici/eksik feed done'u
      silip broker-kapalı kodun yeniden açılmasına izin veriyordu)."""
    changed = False
    for position_id in list(state["tickets"].keys()):
        if position_id in open_position_ids:
            continue
        meta = state["tickets"].pop(position_id)
        changed = True
        code = (meta or {}).get("code") if isinstance(meta, dict) else meta
        if code:
            # KOŞULSUZ done (review): eskiden yalnız "kod feed'de duruyorsa" yazılıyordu —
            # broker kapanışı tam bir feed boşluğuna/eksikliğine denk gelirse ticket silinip
            # done YAZILMIYOR, feed dönünce stop-out pozisyon yeniden açılıyordu. Kod
            # feed'den kalıcı düşünce 3-strike temizliği kaydı zaten kaldırır.
            state["done"][str(code)] = time.time()
            log.info("#%s: MT5 tarafında kapanmış (broker SL/TP/manuel) — done listesine alındı, YENİDEN AÇILMAZ.", code)
    if feed_codes:  # BOŞ feed'de done'a DOKUNMA (backend geçici arızası silmesin)
        state.setdefault("done_missing", {})
        for code in list(state["done"].keys()):
            if code not in feed_codes:
                miss = int(state["done_missing"].get(code, 0)) + 1
                state["done_missing"][code] = miss
                if miss >= 3:  # 3 ardışık dolu-feed'de yok → yaşam döngüsü gerçekten bitti
                    del state["done"][code]
                    del state["done_missing"][code]
                changed = True
            elif code in state["done_missing"]:
                del state["done_missing"][code]
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


def _mt5_init(cfg):
    """terminal_path verilmişse O terminale bağlan (VPS'te birden çok terminal
    varken yanlış hesaba bağlanmayı önler); yoksa çalışan/varsayılan terminale."""
    path = (cfg.get("terminal_path") or "").strip()
    if path:
        return mt5.initialize(path=path)
    return mt5.initialize()


def account_allowed(cfg, ai):
    """HESAP KİLİDİ: allowed_account ayarlıysa YALNIZ o login kabul edilir.
    FAIL-CLOSED: kilit ayarlıyken hesap bilgisi yoksa (ai None) işleme İZİN YOK."""
    raw_want = cfg.get("allowed_account", 0)
    if type(raw_want) is not int or raw_want < 0:
        log.error("HESAP KILIDI: allowed_account literal JSON integer degil")
        return False
    want = raw_want
    wanted_server = str(cfg.get("account_server") or "").strip().lower()
    if cfg.get("dry_run") is not True and (want <= 0 or not wanted_server):
        log.error("HESAP KILIDI: canli mod allowed_account + account_server gerektirir")
        return False
    if not want:
        return True
    if ai is None:
        log.error("🔒 HESAP KİLİDİ: hesap bilgisi yok — güvenlik için işlem YOK.")
        return False
    if int(ai.login) != want:
        log.error("🔒 HESAP KİLİDİ: bağlı hesap %s ≠ izinli %s — bu köprü İŞLEM AÇMAZ.",
                  ai.login, want)
        return False
    connected_server = str(getattr(ai, "server", "") or "").strip().lower()
    if wanted_server and connected_server != wanted_server:
        log.error("HESAP KILIDI: bagli server %s != izinli %s", connected_server, wanted_server)
        return False
    return True


def autotrading_on():
    """Terminaldeki 'Algo Trading' DÜĞMESİ açık mı? (Ctrl+E). 'AutoTrading
    disabled by client' (retcode 10027) buna bağlıdır — account_info().trade_allowed
    BUNU YANSITMAZ (o hesap-izni; bu terminal-düğmesi)."""
    ti = mt5.terminal_info()
    return bool(ti and ti.trade_allowed)


def try_reconnect(cfg):
    """Terminal koptuysa (account_info None) yeniden bağlanmayı dene.
    Yeniden bağlanmada HESAP KİLİDİNİ yeniden doğrula — VPS'te yanlış terminale
    kapılmasın."""
    try:
        mt5.shutdown()
    except Exception:  # noqa
        pass
    if _mt5_init(cfg):
        ai = mt5.account_info()
        if ai is not None and account_allowed(cfg, ai):
            log.info("Yeniden bağlanıldı: login=%s server=%s", ai.login, ai.server)
            return True
    log.error("MT5 bağlantısı yok / yanlış hesap — terminal açık mı? (%s)", mt5.last_error())
    return False


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
            log.warning("⚠️ AutoTrading DÜĞMESİ KAPALI — terminalde 'Algo Trading'e bas "
                        "(Ctrl+E, YEŞİL olmalı). Buton açılana dek emir YOK; köprü bekliyor.")
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
    guard = trade_guard.NewsGuard(cfg["backend_url"], NEWS_CACHE)  # ABD haber penceresi cache'i
    log.info("⚡ Gün-içi köprü v%s başladı. Yoklama %ss. Koruma: hafta-sonu=%s haber-molası=%s. Semboller: %s",
             BRIDGE_VERSION, cfg["poll_seconds"], cfg.get("weekend_flatten", True), cfg.get("news_blackout", True),
             ", ".join(cfg["symbols"].keys()))
    # ETKİN AYAR BANNER'I: VPS'te hangi kod+ayarın koştuğu logdan kanıtlansın
    log.info("AYAR: portföy freni %%%s · GÜNLÜK FREN bot %%%s / hesap %%%s · zarar-sonrası sembol freni %sdk · max_poz=%s",
             cfg.get("max_portfolio_risk_pct"), cfg.get("max_daily_loss_pct"),
             cfg.get("max_daily_loss_pct_account"), cfg.get("loss_reopen_cooldown_min"),
             cfg.get("max_open_positions"))
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
                if not try_reconnect(cfg):
                    time.sleep(int(cfg["poll_seconds"])); continue
                ai = mt5.account_info()

            # Her tur hesap kilidi: terminal sessizce başka hesaba düşerse işlem yok
            if not account_allowed(cfg, ai):
                time.sleep(int(cfg["poll_seconds"])); continue

            push_broker_prices(cfg)   # fiyat beslemesi AutoTrading'den bağımsız (önce yolla)

            if not cfg["dry_run"]:
                if ai is None or not ai.trade_allowed:
                    log.warning("Hesap yok / trade izni yok — bu tur emir yok.")
                    time.sleep(int(cfg["poll_seconds"])); continue
                if not autotrading_on():
                    log.warning("⚠️ AutoTrading DÜĞMESİ KAPALI (Ctrl+E ile aç) — bu tur emir yok.")
                    time.sleep(int(cfg["poll_seconds"])); continue

            # ⚠️ positions_get None = IPC hatası → TUR ATLANIR (inceleme bulgusu):
            # None'ı boş liste saymak state'i siler + aynı koda ÇİFT açılış açardı.
            raw = mt5.positions_get()
            if raw is None:
                log.error("positions_get None (%s) — tur atlandı (emniyet).", mt5.last_error())
                time.sleep(int(cfg["poll_seconds"])); continue

            tr_min = tr_minutes_now()
            by_code, unknown = identify_positions(cfg, raw, state)
            open_position_ids = {
                position_state_key(p) for p in raw
                if p.magic == int(cfg["magic"]) and position_state_key(p)
            }

            # ── HABER MOLASI (TÜM enstrümanlar, kripto DAHİL): ABD önemli verisi
            #    ±30 dk → EOD süpürmesi gibi tümünü kapat + bu tur yeni açma.
            news_black, news_ev = (guard.blackout_now() if cfg.get("news_blackout", True) else (False, None))
            if news_black:
                remaining = list(by_code.values()) + unknown
                if remaining:
                    log.info("📰 HABER MOLASI (%s) — tüm gün-içi pozisyonlar kapatılıyor.",
                             (news_ev or {}).get("title", "ABD verisi"))
                    for p in remaining:
                        close_position(cfg, p, "haber molası")
                time.sleep(int(cfg["poll_seconds"])); continue

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
            reconcile_closures(state, open_position_ids, feed_codes)

            stop_kill = any(os.path.exists(f) for f in STOP_FILES)
            no_new_window = tr_min >= int(cfg["no_new_after_tr_min"])
            weekend_closed = (trade_guard.in_weekend_closed() if cfg.get("weekend_flatten", True) else False)
            now_epoch = time.time()
            blocked_syms = {p.symbol for p in unknown}  # kimliksiz pozisyonlu sembole yeni açılış yok
            # ── GÜNLÜK ZARAR DEVRE-KESİCİSİ + sembol freni + portföy freni (tur başına 1 kez;
            # deal listesi TEK çekim; broker saat sapması tick'ten ölçülür — review:
            # sapma düzeltilmezse frenler son saatlerin kapanışlarını görmezdi) ──
            skew = trade_guard.server_clock_skew(mt5, cfg)
            turn_deals = trade_guard.fetch_recent_deals(mt5, cfg.get("loss_reopen_cooldown_min", 45), skew=skew)
            daily_blocked, _ = trade_guard.daily_loss_blocked(mt5, cfg, log, deals=turn_deals, positions=raw, skew=skew)
            loss_syms = trade_guard.symbols_with_recent_loss(mt5, cfg["magic"], cfg.get("loss_reopen_cooldown_min", 45), deals=turn_deals, skew=skew)
            portfolio_blocked = portfolio_risk_exceeded(cfg, raw)  # yalnız açılış sonrası yenilenir

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
                        position_id = position_state_key(by_code[code])
                        meta = state["tickets"].get(position_id)
                        if isinstance(meta, dict) and not meta.get("eod") and s.get("eodDeadlineSec"):
                            meta["eod"] = s.get("eodDeadlineSec"); save_state(state)
                        continue
                    if code in state["done"]:
                        continue  # MT5 tarafında kapanmış kod — ASLA yeniden açma
                    if code in state.get("pending", {}):
                        log.warning("#%s: broker dolumu canlı position kimliği bekliyor — çift emir açılmadı.", code)
                        continue
                    # YASAKLI ENSTRÜMAN (2026-07-24): gümüş/XAGUSD'ye YENİ işlem yok.
                    # `code in by_code` kontrolünün ALTINDA → açık pozisyonun EOD/
                    # yönetim akışı yukarıda bozulmadan sürer.
                    if trade_guard.is_banned_symbol(inst, cfg) or trade_guard.is_banned_symbol(broker_sym, cfg):
                        continue
                    if stop_kill:
                        log.warning("STOP dosyası var — #%s açılmadı.", code); continue
                    if daily_blocked:
                        continue  # günlük zarar freni (sebep tur başında loglandı) — yeni işlem yok
                    if broker_sym in loss_syms:
                        log.info("#%s %s: az önce zararla kapandı — yeniden-giriş freni (%sdk).",
                                 code, broker_sym, cfg.get("loss_reopen_cooldown_min", 45)); continue
                    if weekend_closed and not trade_guard.is_crypto(inst):
                        log.info("#%s: hafta sonu penceresi — kripto-dışı yeni işlem yok.", code); continue
                    if no_new_window:
                        log.info("#%s: 23:00 TR sonrası yeni işlem penceresi kapalı — açılmadı.", code); continue
                    ddl = s.get("eodDeadlineSec")
                    if ddl and now_epoch >= float(ddl):
                        log.info("#%s: gün-sonu süresi geçmiş — açılmadı.", code); continue
                    if broker_sym in blocked_syms:
                        log.warning("#%s %s: kimliği çözülemeyen mevcut pozisyon var — çift açılış emniyeti, atlandı.", code, broker_sym); continue
                    if (cfg.get("race_mode") is not True
                            and len(by_code) + len(unknown) >= int(cfg["max_open_positions"])):
                        log.warning("max_open_positions (%s) doldu — #%s atlandı.", cfg["max_open_positions"], code); continue
                    # B3: PORTFOY RISK FRENI - acik toplam risk tavani asildiysa yeni giris yok.
                    # (tur basinda hesaplanir, yalniz acilis sonrasi yenilenir - review IPC bulgusu)
                    if portfolio_blocked:
                        log.warning("PORTFOY RISK FRENI: acik toplam risk >= %%%s equity - #%s acilmadi.",
                                    cfg.get("max_portfolio_risk_pct"), code); continue
                    info = ensure_symbol(broker_sym)
                    if info is None:
                        log.warning("Sembol yok/görünmez: %s (%s) — atlandı.", broker_sym, inst); continue
                    open_trade(cfg, s, info, state)
                    raw2 = mt5.positions_get()
                    if raw2 is not None:
                        by_code, unknown = identify_positions(cfg, raw2, state)
                        blocked_syms = {p.symbol for p in unknown}
                        portfolio_blocked = portfolio_risk_exceeded(cfg, raw2)  # açık risk değişti → yenile
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
