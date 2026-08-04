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
STOP_MASTER = os.path.join(HERE, "STOP_MASTER")
SHADOW_STATE = os.path.join(HERE, "shadow_positions.json")   # açık gölge pozisyonlar
SHADOW_TRADES = os.path.join(HERE, "shadow_trades.jsonl")    # kapanan gölge işlemler (P/L)

import trade_guard  # ortak İŞLEM KORUMASI + risk matematiği
import mt5_brain_adapter  # tum kopruler icin TEK hesap-risk/underlying karari

BRIDGE_VERSION = "2026-07-18-all-bots"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                    handlers=[logging.StreamHandler()])
log = logging.getLogger("bk-all")

DEFAULTS = {
    "backend_url": "https://borsakrali.com",
    "exec_token": "",
    "poll_seconds": 10,
    "dry_run": True,
    "enabled": True,
    "terminal_path": "",
    "allowed_account": 0,
    "deviation_points": 30,
    # Birleşik köprüde ÇOK bot açabilir → toplam tavan + bot-başına tavan küçük tutulur.
    # Pozisyon adedi yerine merkez beyin dolar-risk tavanlari son sozdur.
    "max_open_total": 0,
    "max_open_per_bot": 0,
    # Lot: sabit-küçük (fixed) VEYA risk-bazlı (risk). VARSAYILAN küçük fixed —
    # çok bot aynı hesapta olduğundan tutucu başla, güven gelince artır.
    # RISK varsayılan (2026-07-21): seviyeler artık fibo-YAPISAL, yani stop genişliği
    # swing'e göre değişken. Sabit lotta geniş stop orantısız dolar riski doğurur
    # (ölçüldü: XAUUSD'de 0.05 lotta $571). Risk modunda lot otomatik küçülür →
    # HER işlemin dolar riski aynı kalır. Ayrıca dar stop = büyük lot = çok komisyon
    # olduğundan "kuruş işlem" cezası da doğal olarak sınırlanır.
    "lot_mode": "risk",
    "fixed_lot": 0.05,
    "risk_pct": 0.25,
    "max_lot": 1.0,
    # Legacy/paper yolunda yerel nihai R:R tabani. Merkez beyin acikken
    # feed'in uzatilabilir hedef tabani ayri min_feed_rr ile yonetilir.
    "min_rr": 2.0,
    "min_feed_rr": 1.5,
    # TEK HESAP BEYNI: tum kopruler ayni risk/underlying/ters-donus kapisindan gecer.
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
    "min_confidence": 0,          # feed'de bu güvenin altındakini açma (0 = hepsi)
    "close_on_feed_drift": True,  # feed'den düşen kodu MT5'te kapat (competition kapattı)
    # ── FLIP-FLOP / ÇIĞ KORUMASI (çok önemli) ──────────────────────────────────
    # Feed boş/uyku/hata gelince TOPLU KAPATMA yapma; pozisyonu min süre tut; kod
    # ardışık N tur feed'de yoksa kapat; kapanan sembol+yönü bir süre tekrar açma.
    "drift_confirm_turns": 3,       # bir kod kaç ardışık SAĞLIKLI turda yoksa kapatılır
    "min_hold_minutes": 20,         # açılan pozisyon en az bu kadar dk kapatılmaz
    "reopen_cooldown_minutes": 30,  # kapanan sembol+yön bu kadar dk tekrar açılmaz
    "feed_drop_guard_pct": 40,      # feed önceki tura göre %şu kadar düşerse drift-kapatma ATLA (uyku şüphesi)
    # GÖLGE GÜNLÜĞÜ: gerçek emir açılamasa da (piyasa kapalı/dry_run/sembol yok) her
    # botun sinyalini MT5 FİYATINDAN "açmış gibi" kaydeder, SL/TP'yi MT5 girişine
    # göre kurar, kapanınca R/başarı hesaplar. "Hangi bot ne kadar başarılı" her
    # koşulda net görünür. shadow_trades.jsonl + her tur lider tablosu loglanır.
    "shadow_journal": True,
    # trade_guard korumaları (vars. AÇIK)
    "weekend_flatten": True,
    "news_blackout": True,
    "max_daily_loss_pct": 1.5,
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


_authority_logged = False


def _log_authority_once():
    """Yaris modunda kapatma yetkisinin beyinde oldugunu bir kez duyur."""
    global _authority_logged
    if not _authority_logged:
        _authority_logged = True
        log.info("KAPATMA YETKISI BEYINDE: kagit yarisma gercek pozisyonu kapatmaz "
                 "(TP/SL/trail/kar-kilidi/suru-donusu haric).")


def load_config():
    if not os.path.exists(CONFIG_PATH):
        log.warning("config_all.json yok, varsayılanlarla (dry_run) çalışıyor: %s", CONFIG_PATH)
        return dict(DEFAULTS)
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
    # MT5 comment ~31 karakter; kodu kısalt. Magic zaten botu ayırır.
    return ("A#" + str(code))[:29]


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
    raw_want = cfg.get("allowed_account", 0)
    if type(raw_want) is not int or raw_want < 0:
        return False
    want = raw_want
    wanted_server = str(cfg.get("account_server") or "").strip().lower()
    if cfg.get("dry_run") is not True and (want <= 0 or not wanted_server):
        return False
    if not want:
        return True
    if ai is None:
        return False
    if int(getattr(ai, "login", 0) or 0) != want:
        return False
    connected_server = str(getattr(ai, "server", "") or "").strip().lower()
    return not wanted_server or connected_server == wanted_server


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
# FLIP-FLOP KORUMASI durumu
_missing_turns = {}      # code -> ardışık kaç SAĞLIKLI turda feed'de görünmedi
_reopen_until = {}       # "SYMBOL|dir" -> bu zamana kadar tekrar açma (sec)
_prev_feed_count = None  # önceki turun feed büyüklüğü (ani düşüş tespiti)


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


def send_with_filling(req, allow_return=True):
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
        if r.retcode in (
                mt5.TRADE_RETCODE_DONE,
                getattr(mt5, "TRADE_RETCODE_DONE_PARTIAL", 10010)):
            return r
        if r.retcode == 10030:
            continue
        return r
    return last


def min_stop_dist(info):
    lvl = max(getattr(info, "trade_stops_level", 0) or 0, getattr(info, "trade_freeze_level", 0) or 0)
    return lvl * info.point


def compute_lot(cfg, s, info, entry, stop):
    """Lot hesabı. `s` = feed satırı (botId/magic/category taşır) — konsensüs
    botunun 0.20 istisnası için gerekli (2026-07-24)."""
    category = s.get("category") if isinstance(s, dict) else s
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
    # TEK SINIR NOKTASI: [0.01, 0.15] — Bot 37 konsensüs pozisyonları [0.01, 0.20].
    # Konsensüs botu tanımı gereği yalnız ≥3 farklı bot aynı yönde anlaştığında
    # pozisyon açar (botConsensus/index.js findConsensus), yani bu istisna
    # doğrudan "birden çok botun ortak karar aldığı işlemler"e karşılık gelir.
    return trade_guard.clamp_lot(lot, info, s if isinstance(s, dict) else None, cfg)


def our_positions(cfg):
    """Bu köprünün açtığı tüm pozisyonlar (comment 'A#' + catalog magic'leri)."""
    out = []
    raw = mt5.positions_get()
    if raw is None:
        raise RuntimeError("positions_get None: %s" % (mt5.last_error(),))
    for p in raw:
        code = parse_code(getattr(p, "comment", ""))
        if code is not None:
            out.append(p)
    return out


def open_from_feed(cfg, s):
    # Dönüş: neden kodu (özet için). "acildi" = MT5'te emir açıldı.
    if not account_allowed(cfg, mt5.account_info()):
        return "hesap_kilidi"
    # YASAKLI ENSTRÜMAN (2026-07-24): gümüş/XAGUSD'ye YENİ emir açılmaz.
    # Backend feed'i yine de gönderse (eski sürüm / elle kayıt) burada durur.
    # Kapatma yolları (close_position, hafta sonu/haber tahliyesi) muaf → açık
    # gümüş pozisyonu normal şekilde yönetilmeye devam eder.
    if trade_guard.is_banned_symbol(s.get("symbol"), cfg):
        return "yasakli_sembol"
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
    # FLIP-FLOP: az önce kapatılan sembol+yön cooldown süresince tekrar açılmaz.
    if _reopen_until.get("%s|%s" % (broker_sym, s["direction"]), 0) > time.time():
        return "reopen_cooldown"
    info = ensure_symbol(broker_sym)
    if info is None:
        return "sembol_yok"
    is_long = s["direction"] == "long"
    magic = int(s.get("magic") or 0)
    # DEDUP: aynı bot(magic) + sembol + yönde zaten açık pozisyon varsa TEKRAR AÇMA.
    # Çift maruziyet + "No money" margin patlaması önlenir; gölge günlüğü yine ölçer.
    # + KORELASYON TAVANI (2026-07-23): 7 bot aynı anda BTCUSD long açınca tek
    #   sembol düşüşü 7 pozisyonu birden vurur. Sembol+yön başına TÜM botlardan
    #   en fazla max_per_symbol_side (vars. 3) pozisyon açılır.
    _BUY = getattr(mt5, "POSITION_TYPE_BUY", 0)
    same_side_count = 0
    for _op in (mt5.positions_get(symbol=info.name) or []):
        _op_long = getattr(_op, "type", 0) == _BUY
        _op_magic = int(getattr(_op, "magic", 0) or 0)
        if _op_magic == magic and _op_long == is_long:
            return "zaten_acik_sembol"
        if _op_magic > 0 and _op_long == is_long:
            same_side_count += 1
    max_sym_side = int(cfg.get("max_per_symbol_side", 3))
    # KONSENSÜS MUAFİYETİ (2026-07-24): Bot 37 TANIMI GEREĞİ ancak ≥3 farklı bot
    # aynı sembol+yönde pozisyondayken sinyal üretir → korelasyon tavanı onu
    # HER ZAMAN 'sembol_yogunlugu' ile reddederdi (0.20 lot hiç açılmazdı).
    # YARIS MODU: korelasyon tavani da kalkar — 7 bot ayni yonde acabilir
    # (kullanici karari 2026-07-30; ayni botun ayni sembol+yon cifti yine tekil).
    if (cfg.get("race_mode") is not True and max_sym_side > 0
            and same_side_count >= max_sym_side and not trade_guard.is_consensus(s)):
        return "sembol_yogunlugu"
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
    brain_enabled = mt5_brain_adapter.enabled(cfg)
    # Merkez beyin 1.5R+ feed hedefini en az 3R'ye uzatir. Bu adaylari eski
    # yerel 2R filtresinde kesme; beyin kapali paper/dry-run yolunda ise
    # mevcut min_rr semantigini koru.
    rr_floor = float(cfg.get("min_feed_rr", 1.5) if brain_enabled
                     else cfg.get("min_rr", 2.0))
    if reward / risk < rr_floor:
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
    brain_plan = None
    if brain_enabled:
        brain_plan = mt5_brain_adapter.evaluate(
            mt5, cfg, info,
            candidate_id="all:%s:%s" % (magic, s["code"]),
            bot_id=str(magic), symbol=info.name,
            direction="long" if is_long else "short",
            timeframe=s.get("timeframe") or s.get("tf") or "default",
            entry=price, stop=sl, target=tp,
            confidence=s.get("confidence"),
            confirmations=s.get("agreeCount") or s.get("confirmations") or 1,
            # A# consumes two of MT5's 31 comment characters.
            code=str(s.get("code") or "")[:29],
            logger=log,
        )
        if not brain_plan.allowed:
            return "beyin_red:%s" % brain_plan.decision.reasons[0]
        if brain_plan.decision.requires_atomic_execution:
            if not mt5_brain_adapter.close_for_reversal(
                    mt5, cfg, brain_plan.decision.close_tickets,
                    logger=log, plan=brain_plan):
                mt5_brain_adapter.finalize(brain_plan, False, logger=log)
                return "beyin_ters_kapatma_hatasi"
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
        lot = compute_lot(cfg, s, info, price, sl)
    if lot <= 0:
        if brain_plan:
            mt5_brain_adapter.finalize(brain_plan, False, logger=log)
        return "lot_sifir"
    label = "LONG" if is_long else "SHORT"
    if cfg["dry_run"]:
        log.info("[DRY] AÇ %s | %s %s lot=%s @%.*f SL=%.*f TP=%.*f magic=%s (%s)",
                 s.get("botName"), info.name, label, lot, d, price, d, sl, d, tp, magic, s["code"])
        if brain_plan:
            mt5_brain_adapter.finalize(brain_plan, False, logger=log)
        return "dry"
    if brain_plan and not mt5_brain_adapter.pre_send_check(
            mt5, cfg, brain_plan, logger=log):
        mt5_brain_adapter.finalize(
            brain_plan, False, logger=log, reason="fail_closed:pre_send_gate")
        return "beyin_emir_oncesi_red"
    req = {
        "action": mt5.TRADE_ACTION_DEAL, "symbol": info.name, "volume": float(lot),
        "type": mt5.ORDER_TYPE_BUY if is_long else mt5.ORDER_TYPE_SELL,
        "price": price, "sl": sl, "tp": tp, "deviation": int(cfg["deviation_points"]),
        "magic": magic, "comment": code_comment(s["code"]), "type_time": mt5.ORDER_TIME_GTC,
    }
    # Açılışta RETURN yok: kısmi dolum kalan hacmi bekleyen emir olarak bırakamaz.
    r = send_with_filling(req, allow_return=False)
    if r and r.retcode in (
            mt5.TRADE_RETCODE_DONE,
            getattr(mt5, "TRADE_RETCODE_DONE_PARTIAL", 10010)):
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
                    s.get("code"), info.name, broker_ticket, filled_volume)
        partial = " (KISMİ dolum)" if r.retcode == getattr(
            mt5, "TRADE_RETCODE_DONE_PARTIAL", 10010) else ""
        log.info("✅ AÇILDI%s %s | %s %s lot=%s magic=%s ticket=%s",
                 partial, s.get("botName"), info.name, label,
                 filled_volume, magic, broker_ticket)
        return "acildi"
    elif r and r.retcode == getattr(mt5, "TRADE_RETCODE_MARKET_CLOSED", 10018):
        if brain_plan:
            mt5_brain_adapter.finalize(brain_plan, False, logger=log)
        # Piyasa kapalı (hafta sonu / seans dışı): sembolü 15 dk atla, bir kez INFO logla.
        _market_closed_until[info.name] = time.time() + 900
        log.info("⏸ %s piyasa kapalı — 15 dk atlanacak (%s).", info.name, s.get("botName"))
        return "piyasa_kapali"
    elif r and r.retcode == getattr(mt5, "TRADE_RETCODE_NO_MONEY", 10019):
        if brain_plan:
            mt5_brain_adapter.finalize(brain_plan, False, logger=log)
        return "no_money"
    elif r and r.retcode == 10027:
        if brain_plan:
            mt5_brain_adapter.finalize(brain_plan, False, logger=log)
        # Algo Trading terminalde KAPALI — hiçbir emir geçmez; turu durdur (spam önle).
        return "algo_kapali"
    else:
        if brain_plan:
            mt5_brain_adapter.finalize(brain_plan, False, logger=log)
        rc = r.retcode if r else "None"
        log.error("❌ AÇILAMADI %s %s: retcode=%s %s", s.get("botName"), info.name, rc, (r.comment if r else mt5.last_error()))
        return "hata:%s" % rc


def close_position(cfg, pos, reason):
    if not account_allowed(cfg, mt5.account_info()):
        return False
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
    if r and r.retcode in (
            mt5.TRADE_RETCODE_DONE,
            getattr(mt5, "TRADE_RETCODE_DONE_PARTIAL", 10010)):
        partial = " KISMEN" if r.retcode == getattr(
            mt5, "TRADE_RETCODE_DONE_PARTIAL", 10010) else ""
        log.info("🔒 KAPATMA%s DOLUMU %s %s (%s)", partial,
                 parse_code(pos.comment), pos.symbol, reason)
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


def _flatten_for_risk_windows(cfg):
    """
    Haber molasi / hafta sonu penceresinde ACIK pozisyonlari kapat.

    Kripto MUAFTIR — bu dosyadaki symbol_guarded() ile AYNI ayrim. Girise izin
    verilen bir enstrumani cikista zorla kapatmak asimetrik olurdu (acamiyorum
    ama kapatiyorum). Gun-ici tarayici (borsakrali_mt5_scanner.py) haberde
    kriptoyu da kapatir; o bot gun-ici, bu kopru cok gunluk pozisyon tasir.
    """
    news = news_blackout_active(cfg)
    weekend = bool(cfg.get("weekend_flatten", True)) and trade_guard.in_weekend_closed()
    if not news and not weekend:
        return
    try:
        open_pos = our_positions(cfg)
    except Exception as exc:
        log.error("tahliye icin pozisyonlar okunamadi: %s", exc)
        return
    if not open_pos:
        return
    hedef = [pos for pos in open_pos if not trade_guard.is_crypto(getattr(pos, "symbol", ""))]
    if not hedef:
        return
    sebep = "haber molasi" if news else "hafta sonu tahliyesi"
    log.warning("%s — birlesik kopru: %d kripto-disi pozisyon kapatiliyor.",
                "📰 HABER MOLASI" if news else "🌙 HAFTA SONU", len(hedef))
    for pos in hedef:
        close_position(cfg, pos, sebep)


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
    if mt5_brain_adapter.enabled(cfg):
        # Exact entry+exit commission/fee/swap lifecycle has one owner. Sending
        # this legacy close first could produce an approximate Telegram that a
        # later exact daemon row cannot retract.
        return
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
        headers = {"Authorization": "Bearer %s" % cfg["exec_token"]} if cfg.get("exec_token") else {}
        # /state ucu hem lider tablosunu besler HEM kapanışı Telegram'a duyurur
        # (SİNYAL = İŞLEM 1:1). Site kendi dedup'ını tutar → tekrar mesaj olmaz.
        url = _backend_base(cfg) + "/api/bridge/state"
        r = requests.post(url, json={"closed": rows}, headers=headers, timeout=20, allow_redirects=False)
        if r.status_code == 200:
            log.info("📤 Gerçek sonuçlar siteye beslendi: %d kapanan işlem (kapanış Telegram'a gider)", len(rows))
        else:
            log.warning("gerçek sonuç POST %s: %s", r.status_code, r.text[:120])
    except Exception as exc:
        log.warning("gerçek sonuç POST hatası: %s", exc)


_notified_open = set()      # bu süreçte siteye bildirilmiş açık ticket'lar
_last_state_report = 0.0


def report_mt5_state(cfg):
    """SİNYAL = İŞLEM (1:1). BU KÖPRÜNÜN açtığı GERÇEK açık pozisyonları siteye
    bildirir; site daha önce duyurulmamışlar için Telegram mesajı atar.
    Kaynak MT5'in kendisi olduğundan 'sinyal var işlem yok' durumu imkânsızdır.
    Her turda çalışır (açılış anında duyurulsun diye).

    SAHİPLİK (2026-07-24 düzeltmesi): eskiden `magic > 0` olan HER pozisyon
    bildiriliyordu → adanmış köprülerin (forex 550055, tarayıcı 550066) ve
    platform dışı standalone altın botunun (20260707) işlemleri de bu köprünün
    ağzından duyuruluyor, Telegram'da "🤖 Magic 550055" başlığıyla çıkıyordu.
    Artık ölçüt our_positions() ile AYNI: comment 'A#…' = bu köprünün açtığı.
    (Kapanışlar farklı: report_real_results BİLEREK tüm hesabı tarar — lider
    tablosu gerçek sonuçları magic→bot eşlemesiyle doğru sahibine yazar.)"""
    global _last_state_report
    if mt5_brain_adapter.enabled(cfg):
        # Broker-open outbox + account daemon are the sole live lifecycle path.
        return
    now = time.time()
    if now - _last_state_report < 25:      # aynı turda çift göndermeyi önle
        return
    _last_state_report = now
    try:
        positions = our_positions(cfg)
    except Exception as exc:
        log.warning("pozisyon okunamadı (durum bildirimi): %s", exc)
        return

    open_rows = []
    for p in positions:
        magic = int(getattr(p, "magic", 0) or 0)
        if magic <= 0:
            continue                        # bot işlemi değil
        ticket = str(getattr(p, "ticket", ""))
        if not ticket:
            continue
        is_long = getattr(p, "type", 0) == getattr(mt5, "POSITION_TYPE_BUY", 0)
        open_rows.append({
            "ticket": ticket,
            "magic": magic,
            "symbol": str(getattr(p, "symbol", "")),
            "direction": "long" if is_long else "short",
            "lot": float(getattr(p, "volume", 0) or 0),
            "price": float(getattr(p, "price_open", 0) or 0),
            "sl": float(getattr(p, "sl", 0) or 0),
            "tp": float(getattr(p, "tp", 0) or 0),
            "openedSec": int(getattr(p, "time", 0) or 0),
        })

    # Yalnız YENİ açılanları yolla (site de ayrıca dedup yapar — çift emniyet).
    fresh = [r for r in open_rows if r["ticket"] not in _notified_open]
    if not fresh:
        return
    try:
        url = _backend_base(cfg) + "/api/bridge/state"
        headers = {"Authorization": "Bearer %s" % cfg["exec_token"]} if cfg.get("exec_token") else {}
        r = requests.post(url, json={"open": fresh}, headers=headers, timeout=30, allow_redirects=False)
        if r.status_code == 200:
            for row in fresh:
                _notified_open.add(row["ticket"])
            log.info("📣 MT5 durumu siteye bildirildi: %d yeni açık işlem (Telegram'a sinyal gider)", len(fresh))
        else:
            log.warning("durum POST %s: %s", r.status_code, r.text[:120])
    except Exception as exc:
        log.warning("durum POST hatası: %s", exc)


def run_once(cfg):
    if os.path.exists(STOP_FILE) or os.path.exists(STOP_MASTER):
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
        blocked = bool(cfg.get("risk_fail_closed", cfg.get("central_brain_enabled", False)))
        why = "risk verisi okunamadi"
        log.error("trade_guard günlük fren okunamadı (%s): %s",
                  "fail-closed" if blocked else "fail-open", exc)
    new_orders_allowed = not stop and not blocked
    if blocked:
        log.warning("🛑 Günlük zarar freni AKTİF (%s) — yeni emir yok.", why)

    # ── F5 (2026-08-01 dusman incelemesi): FEED'DEN BAGIMSIZ TAHLIYE ──────────
    # Bulgu: B4 yaris modunda tek kapatma cagrisini (feed-drift) devre disi
    # birakti ve `paper_close_allowed()` docstring'i "gun-sonu supurmesi, hafta
    # sonu tahliyesi, haber molasi AYRI risk katmanlaridir ve her zaman calisir"
    # diyordu. Bu ifade BU DOSYA icin YANLISTI: all.py'de haber/hafta sonu
    # yalnizca YENI EMRI engelliyordu, acik pozisyona hic dokunmuyordu. Yaris
    # modunda birlesik kopruden hicbir cikis yolu kalmiyordu.
    #
    # Bu katmanlar KAGIT YARISMADAN bagimsizdir: sinyal feed'ine, race_mode'a ve
    # paper_close_allowed()'a BAKMAZ. Kullanicinin risk kurallari (haber ±30 dk,
    # hafta sonu tahliyesi) bunlari zaten sart kosuyor.
    try:
        _flatten_for_risk_windows(cfg)
    except Exception as exc:
        log.error("risk penceresi tahliyesi hatasi: %s", exc)

    global _prev_feed_count
    try:
        data = fetch_feed(cfg)
    except Exception as exc:
        # Feed hatası (Render uyku/502/timeout) → HİÇBİR ŞEY YAPMA. Kapatma YOK
        # (çığ önlenir). Pozisyonlar SL/TP + min-hold ile korunur.
        log.warning("feed çekilemedi (%s) — bu tur atlandı, kapatma YOK.", exc)
        return

    # Feed SAĞLIKLI mı? enabled=True + geçerli. Değilse toplu kapatma YAPMA.
    feed_healthy = bool(data and data.get("enabled"))
    feed = (data.get("positions") or []) if feed_healthy else []
    feed_codes = {str(p["code"]) for p in feed}
    open_pos = our_positions(cfg)
    open_codes = {parse_code(p.comment) for p in open_pos}

    # Ani-düşüş koruması: feed önceki tura göre çok düştüyse ŞÜPHELİ (uyku) → drift-kapatma atla.
    now = time.time()
    drop_pct = int(cfg.get("feed_drop_guard_pct", 40))
    suspicious = False
    if feed_healthy and _prev_feed_count and _prev_feed_count > 5:
        if len(feed) < _prev_feed_count * (1 - drop_pct / 100.0):
            suspicious = True
            log.warning("⚠️ feed ani düştü (%d → %d) — TOPLU KAPATMA ATLANDI (uyku/geçici hata şüphesi).",
                        _prev_feed_count, len(feed))
    if feed_healthy:
        _prev_feed_count = len(feed)

    if not feed_healthy:
        log.info("feed sağlıksız (enabled=%s) — bu tur açma/kapama YOK, mevcut pozisyonlar korunur.",
                 bool(data and data.get("enabled")))

    # 1) feed'den düşen pozisyonları kapat — ÇOK KATMANLI: feed sağlıklı + şüpheli
    #    değil + kod ARDIŞIK N tur yok + pozisyon min-hold'u geçmiş ise kapat.
    min_hold = float(cfg.get("min_hold_minutes", 20)) * 60
    confirm = int(cfg.get("drift_confirm_turns", 3))
    BUY = getattr(mt5, "POSITION_TYPE_BUY", 0)
    # YARIS MODU (kullanici karari 2026-07-31): GERCEK pozisyonu yalniz beyin ya da
    # broker kapatir (TP / SL / iz suren stop / kar kilidi / suru donusu). Kagit
    # yarismanin sinyali bitti diye gercek islemi kapatmak, beynin 3R hedefini ve
    # trail'ini devreye giremeden oldururdu -> kurusluk kapanislar.
    drift_close_ok = trade_guard.paper_close_allowed(cfg)
    if not drift_close_ok:
        _log_authority_once()
    if feed_healthy and not suspicious and drift_close_ok:
        for p in open_pos:
            code = parse_code(p.comment)
            if not code:
                continue
            if code in feed_codes:
                _missing_turns.pop(code, None)   # feed'de görüldü → sayaç sıfırla
                continue
            age = now - (getattr(p, "time", 0) or 0)
            if age < min_hold:
                continue                          # yeni açılmış → hemen kapatma (flip-flop önle)
            _missing_turns[code] = _missing_turns.get(code, 0) + 1
            if _missing_turns[code] >= confirm:   # ardışık N tur yok → gerçekten kapandı
                close_position(cfg, p, "competition-kapatti")
                _missing_turns.pop(code, None)
                sdir = "long" if p.type == BUY else "short"
                _reopen_until["%s|%s" % (p.symbol, sdir)] = now + float(cfg.get("reopen_cooldown_minutes", 30)) * 60

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
        # Restart/poll siniri bot tavanini sifirlamasin: mevcutlardan tohumla.
        per_bot = {}
        for _p in open_pos:
            _magic = str(int(getattr(_p, "magic", 0) or 0))
            per_bot[_magic] = per_bot.get(_magic, 0) + 1
        total_open = len([p for p in open_pos if parse_code(p.comment)])
        # 0 (veya negatif) = SINIRSIZ. Her botun tüm işlemleri açılsın istenirse
        # config'te max_open_total ve max_open_per_bot = 0 yapilir.
        # YARIS MODU: pozisyon-sayisi tavanlari devre disi (0 = sinirsiz) —
        # her botun her sinyali islem olur; risk kontrolu beyinde.
        race = cfg.get("race_mode") is True
        max_total = 0 if race else int(cfg.get("max_open_total", 20))
        max_per_bot = 0 if race else int(cfg.get("max_open_per_bot", 3))
        for s in sorted(feed, key=lambda x: -(x.get("confidence") or 0)):
            code = str(s["code"])
            if code in open_codes:
                _bump("zaten_acik"); continue
            if max_total > 0 and total_open >= max_total:
                _bump("tavan_doldu"); break
            bkey = str(int(s.get("magic") or 0)) if s.get("magic") else str(s.get("botId"))
            if max_per_bot > 0 and per_bot.get(bkey, 0) >= max_per_bot:
                _bump("bot_tavani"); continue
            if symbol_guarded(cfg, s["symbol"], weekend, news):
                _bump("guard_hafta_haber"); continue
            res = open_from_feed(cfg, s) or "bilinmiyor"
            _bump(res)
            if res in ("acildi", "dry"):
                per_bot[bkey] = per_bot.get(bkey, 0) + 1
                total_open += 1
            elif res == "no_money":
                # Margin doldu → bu tur yeni emir DURDUR (spam yok, mevcutlar korunur).
                log.warning("💰 Margin doldu — bu tur yeni emir durduruldu (%d açık). Tavan/lot düşür.", total_open)
                break
            elif res == "algo_kapali":
                log.warning("🛑 ALGO TRADING KAPALI — MT5 terminalinde üstteki 'Algo Trading' düğmesine bas. Bu tur emir denenmeyecek.")
                break

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

    # 5) SİNYAL = İŞLEM (1:1): MT5'te GERÇEKTEN açılan her işlemi siteye bildir →
    #    Telegram'a sinyal olarak gider. Sinyal/işlem sapması imkânsız hale gelir.
    try:
        report_mt5_state(cfg)
    except Exception as exc:
        log.warning("durum bildirimi hatası: %s", exc)

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
