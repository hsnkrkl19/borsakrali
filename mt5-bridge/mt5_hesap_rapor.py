#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GERÇEK KÂR/ZARAR RAPORLAYICI (FTMO hesabı) → kalıcı defter + Telegram
=====================================================================
FTMO hesabının MT5 deal geçmişinden GERÇEK (broker) kapanan işlem P/L'ini okur:
  1) Her yeni deal'i (açılış + kapanış) pnl_ledger.jsonl'a yazar — HAFTALIK KAYIT
     (biz sonra inceleyip hata tespiti + düzeltme yapacağız).
  2) Yeni GERÇEK kapanışları (realized P/L) backend'e POST'lar → Telegram'a düşer.
  3) Gün sonu (vars. 23:55 TR) günlük gerçek P/L özeti (net/isabet/en iyi-kötü/bakiye).

Sanal/backend muhasebesi DEĞİL — FTMO hesabında gerçekten kazanılan/kaybedilen para.
Köprülerden AYRI, yalnız-OKUR (emir açmaz). config.json'u paylaşır (terminal_path,
allowed_account, exec_token, backend_url). Hesap kilidi: yalnız 1513857844.

Çalıştır:  python mt5_hesap_rapor.py
Durdur:    STOP veya STOP_PNL dosyası.
"""
from __future__ import annotations

import json
import os
import sys
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
CONFIG_PATH = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "config.json")
STATE_PATH = os.path.join(HERE, "pnl_state.json")
LEDGER_PATH = os.path.join(HERE, "pnl_ledger.jsonl")
STOP_FILES = (os.path.join(HERE, "STOP"), os.path.join(HERE, "STOP_PNL"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                    handlers=[logging.StreamHandler()])
log = logging.getLogger("bk-pnl")

TR = timezone(timedelta(hours=3))         # TR = UTC+3 (FTMO server ~aynı), sabit
DEFAULTS = {"backend_url": "https://borsakrali.com", "exec_token": "",
            "terminal_path": "", "allowed_account": 1513857844,
            "poll_seconds": 120, "lookback_days": 4, "daily_report_tr_min": 23 * 60 + 55}


def load_config():
    with open(CONFIG_PATH, encoding="utf-8") as f:
        cfg = json.load(f)
    merged = dict(DEFAULTS)
    merged.update(cfg)
    return merged


def load_state():
    try:
        with open(STATE_PATH, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {"last_ticket": 0, "last_daily_date": None}


def save_state(s):
    tmp = STATE_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(s, f)
    os.replace(tmp, STATE_PATH)


def append_ledger(rows):
    with open(LEDGER_PATH, "a", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def parse_code(comment):
    c = (comment or "").strip()
    for pre in ("BKG#", "BK#"):
        if c.startswith(pre):
            return c[len(pre):]
    return None


def mt5_init(cfg):
    path = (cfg.get("terminal_path") or "").strip()
    ok = mt5.initialize(path=path) if path else mt5.initialize()
    if not ok:
        log.error("MT5 başlatılamadı: %s", mt5.last_error())
        return False
    ai = mt5.account_info()
    if ai is None:
        log.error("account_info yok — MT5'te hesaba giriş yapılmalı.")
        return False
    want = int(cfg.get("allowed_account") or 0)
    if want and int(ai.login) != want:
        log.error("🔒 HESAP KİLİDİ: bağlı %s ≠ izinli %s — rapor DURDU.", ai.login, want)
        return False
    log.info("Bağlandı: login=%s server=%s bakiye=%.2f %s", ai.login, ai.server, ai.balance, ai.currency)
    return True


def post_backend(cfg, payload):
    url = cfg["backend_url"].rstrip("/") + "/api/forex/account-report"
    payload["token"] = cfg["exec_token"]
    try:
        r = requests.post(url, json=payload, timeout=15)
        if r.status_code == 200:
            return True
        log.warning("backend %s: %s", r.status_code, r.text[:120])
    except Exception as e:  # noqa: BLE001
        log.warning("backend POST hata: %s", e)
    return False


def is_close(d):
    """Deal bir POZİSYON KAPANIŞI mı (gerçek P/L taşır)?"""
    return (d.type in (mt5.DEAL_TYPE_BUY, mt5.DEAL_TYPE_SELL)
            and d.entry in (mt5.DEAL_ENTRY_OUT, mt5.DEAL_ENTRY_INOUT, mt5.DEAL_ENTRY_OUT_BY))


def is_open(d):
    return (d.type in (mt5.DEAL_TYPE_BUY, mt5.DEAL_TYPE_SELL)
            and d.entry == mt5.DEAL_ENTRY_IN)


def deal_pnl(d):
    return round(float(d.profit) + float(d.swap) + float(d.commission), 2)


def dir_word(d):
    # Kapanış deal'inde BUY tipi = SHORT pozisyon kapanışı; ters çevir ki yön doğru görünsün
    return "SELL" if d.type == mt5.DEAL_TYPE_BUY else "BUY"


def scan_new_deals(cfg, state):
    """last_ticket'ten büyük tüm deal'leri işle: deftere yaz + yeni kapanışları döndür."""
    frm = datetime.now(timezone.utc) - timedelta(days=int(cfg["lookback_days"]))
    deals = mt5.history_deals_get(frm, datetime.now(timezone.utc) + timedelta(minutes=5))
    if deals is None:
        log.warning("history_deals_get None: %s", mt5.last_error())
        return []
    last = int(state.get("last_ticket", 0))
    fresh = sorted((d for d in deals if int(d.ticket) > last), key=lambda d: d.ticket)
    if not fresh:
        return []
    ledger_rows, closes = [], []
    for d in fresh:
        kind = "close" if is_close(d) else ("open" if is_open(d) else "other")
        row = {
            "ticket": int(d.ticket), "position": int(d.position_id), "kind": kind,
            "symbol": d.symbol, "type": dir_word(d), "volume": float(d.volume),
            "price": float(d.price), "profit_usd": deal_pnl(d) if kind == "close" else 0.0,
            "code": parse_code(d.comment), "comment": d.comment,
            "time": int(d.time), "time_str": datetime.fromtimestamp(d.time, TR).isoformat(timespec="seconds"),
        }
        ledger_rows.append(row)
        if kind == "close":
            closes.append({"symbol": d.symbol, "dir": dir_word(d), "lots": float(d.volume),
                           "profit": deal_pnl(d), "code": parse_code(d.comment)})
    append_ledger(ledger_rows)
    state["last_ticket"] = int(fresh[-1].ticket)
    log.info("%d yeni deal (%d kapanış) deftere yazıldı.", len(fresh), len(closes))
    return closes


def today_realized(cfg):
    """Bugünün (TR) gerçekleşen P/L özeti — günlük rapor için."""
    now_tr = datetime.now(TR)
    start_tr = now_tr.replace(hour=0, minute=0, second=0, microsecond=0)
    deals = mt5.history_deals_get(start_tr.astimezone(timezone.utc), now_tr.astimezone(timezone.utc) + timedelta(minutes=5))
    if deals is None:
        return None
    closes = [d for d in deals if is_close(d)]
    if not closes:
        return {"net": 0.0, "wins": 0, "losses": 0, "best": None, "worst": None}
    pnls = [(d.symbol, deal_pnl(d)) for d in closes]
    net = round(sum(p for _, p in pnls), 2)
    wins = sum(1 for _, p in pnls if p > 0)
    losses = sum(1 for _, p in pnls if p < 0)
    best = max(pnls, key=lambda x: x[1]); worst = min(pnls, key=lambda x: x[1])
    return {"net": net, "wins": wins, "losses": losses,
            "best": {"symbol": best[0], "profit": best[1]},
            "worst": {"symbol": worst[0], "profit": worst[1]}}


def realized_today_running(cfg):
    r = today_realized(cfg)
    return r["net"] if r else None


def stop_engaged():
    return any(os.path.exists(p) for p in STOP_FILES)


def main():
    fh = logging.FileHandler(os.path.join(HERE, "pnl_rapor.log"), encoding="utf-8")
    fh.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logging.getLogger().addHandler(fh)
    if not os.path.exists(CONFIG_PATH):
        log.error("config yok: %s", CONFIG_PATH); sys.exit(1)
    cfg = load_config()
    if not cfg["exec_token"]:
        log.error("exec_token boş — backend FOREX_EXEC_TOKEN ile aynı olmalı."); sys.exit(1)
    if not mt5_init(cfg):
        mt5.shutdown(); sys.exit(1)

    state = load_state()
    log.info("💰 Gerçek P/L raporlayıcı başladı. Yoklama %ss · günlük özet %02d:%02d TR",
             cfg["poll_seconds"], int(cfg["daily_report_tr_min"]) // 60, int(cfg["daily_report_tr_min"]) % 60)
    # İlk açılışta geçmiş deal'leri deftere al AMA Telegram'a basma (spam olmasın):
    # yalnız last_ticket'i şimdiye çek; bundan sonrakiler raporlanır.
    if int(state.get("last_ticket", 0)) == 0:
        deals = mt5.history_deals_get(datetime.now(timezone.utc) - timedelta(days=int(cfg["lookback_days"])),
                                      datetime.now(timezone.utc) + timedelta(minutes=5))
        if deals:
            rows = [{"ticket": int(d.ticket), "position": int(d.position_id),
                     "kind": "close" if is_close(d) else ("open" if is_open(d) else "other"),
                     "symbol": d.symbol, "type": dir_word(d), "volume": float(d.volume),
                     "price": float(d.price), "profit_usd": deal_pnl(d) if is_close(d) else 0.0,
                     "code": parse_code(d.comment), "comment": d.comment, "time": int(d.time),
                     "time_str": datetime.fromtimestamp(d.time, TR).isoformat(timespec="seconds")}
                    for d in sorted(deals, key=lambda x: x.ticket)]
            append_ledger(rows)
            state["last_ticket"] = int(max(d.ticket for d in deals))
            log.info("İlk kayıt: %d geçmiş deal deftere alındı (Telegram'a basılmadı).", len(rows))
            save_state(state)

    while True:
        try:
            if stop_engaged():
                log.info("STOP dosyası — beklemede."); time.sleep(int(cfg["poll_seconds"])); continue
            cfg = load_config()
            ai = mt5.account_info()
            if ai is None or (int(cfg.get("allowed_account") or 0) and int(ai.login) != int(cfg["allowed_account"])):
                log.warning("hesap yok/yanlış — bu tur atlandı."); time.sleep(int(cfg["poll_seconds"])); continue

            closes = scan_new_deals(cfg, state)
            if closes:
                post_backend(cfg, {"kind": "close", "account": int(ai.login), "closes": closes,
                                   "realizedToday": realized_today_running(cfg), "balance": round(ai.balance, 2)})
            # Günlük özet (gün başına bir kez)
            now_tr = datetime.now(TR)
            today_str = now_tr.strftime("%Y-%m-%d")
            if (now_tr.hour * 60 + now_tr.minute) >= int(cfg["daily_report_tr_min"]) and state.get("last_daily_date") != today_str:
                summ = today_realized(cfg) or {"net": 0, "wins": 0, "losses": 0}
                post_backend(cfg, {"kind": "daily", "account": int(ai.login), "date": today_str,
                                   **summ, "balance": round(ai.balance, 2), "equity": round(ai.equity, 2)})
                state["last_daily_date"] = today_str
                log.info("Günlük gerçek P/L özeti gönderildi (%s): net %.2f", today_str, summ.get("net", 0))
            save_state(state)
        except Exception as e:  # noqa: BLE001 — döngü ayakta kalsın
            log.error("cycle hata: %s", e)
        time.sleep(int(cfg["poll_seconds"]))


if __name__ == "__main__":
    main()
