"""Altın yapı stratejileri — legacy `gsb` botundan portlanan swing/BOS/CHoCH modelleri.

İki strateji, tek yapısal motoru paylaşır (self-contained; `gsb` paketinden HİÇBİR
şey import edilmez, TA-Lib yoktur):

* ``gold_trend``  — Günlük + H4 trend uyumu → taze H1 BOS ile giriş, H1 CHoCH ile çıkış.
* ``gold_scalp``  — Aynı motor M15 üzerinde; Haftalık karşı-trend engeli + Günlük/H4 uyumu.

Yapısal motor (kısa özet, legacy koda birebir uyumlu):

* SWING: N-bar fraktal pivot. Bir barın HIGH'ı her iki yandaki N barın HIGH'ından
  KESİN olarak büyükse swing High ("H"); LOW'u her iki yandaki N barın LOW'undan
  kesin küçükse swing Low ("L"). Pivot ancak sağındaki N bar kapandığında
  (confirm_index = index + n) kullanılabilir hâle gelir. Eşitlik pivot saymaz.
* BOS/CHoCH: kapanış (close) yalnızca en son ONAYLANMIŞ swing'i KESİN olarak aşarsa
  yapı kırılır (fitil kırmaz — o bir sweep'tir). Mevcut trend yönünde kırılım = BOS
  (devam); trende KARŞI ilk kırılım = CHoCH (trend durumunu çevirir). Motor RAW
  (birleştirilmemiş) onaylı fraktallarla beslenir → tekrar-oynatma güvenli, repaint yok.
* to_alternating: yalnızca son swing High/Low (display/anchor) için; makineye VERİLMEZ.

Tüm hesaplamalar KAPANMIŞ barlar üzerinde yapılır (get_rates'ten gelen oluşmakta olan
son bar atılır). ATR Wilder yöntemiyle strategies.indicators.atr'den gelir.
"""
from __future__ import annotations

import math
from collections import namedtuple
from typing import TYPE_CHECKING

from core.logger import get_logger
from strategies import indicators, registry
from strategies.base import Signal, Strategy

if TYPE_CHECKING:
    from core.mt5_client import MT5Client

log = get_logger(__name__)

# --- lightweight structure records --------------------------------------------
# index: pivot bar; price: high (H) or low (L); kind: "H"|"L"; confirm: index + n.
Swing = namedtuple("Swing", ["index", "price", "kind", "confirm"])
# index: bar whose CLOSE broke; kind: "BOS"|"CHoCH"; direction: "up"|"down";
# level: broken swing price; ref_index: bar index of the broken swing.
StructureEvent = namedtuple(
    "StructureEvent", ["index", "kind", "direction", "level", "ref_index"]
)


# =============================================================================
# Yapısal motor (numpy/pandas, self-contained)
# =============================================================================
def _find_swings(highs, lows, n: int) -> "list[Swing]":
    """Onaylanmış N-bar fraktal pivotların TAMAMI (birleştirilmemiş, causal).

    Legacy find_swings ile birebir: kesin '>' (High) / '<' (Low), her iki yanda
    N komşuya karşı; ilk ve son N bar asla pivot olamaz; aynı bar hem H hem L
    olabilir (H önce). n<1 ya da len<2n+1 ise [] döner.
    """
    n = int(n)
    length = len(highs)
    if n < 1 or length < 2 * n + 1:
        return []
    out: "list[Swing]" = []
    for i in range(n, length - n):
        h = highs[i]
        is_high = True
        for k in range(1, n + 1):
            if not (h > highs[i - k]) or not (h > highs[i + k]):
                is_high = False
                break
        if is_high:
            out.append(Swing(i, float(h), "H", i + n))
        lo = lows[i]
        is_low = True
        for k in range(1, n + 1):
            if not (lo < lows[i - k]) or not (lo < lows[i + k]):
                is_low = False
                break
        if is_low:
            out.append(Swing(i, float(lo), "L", i + n))
    # aynı index'te H önce L sonra; index'e göre kararlı sıralama.
    out.sort(key=lambda s: (s.index, 0 if s.kind == "H" else 1))
    return out


def _detect_events(closes, swings: "list[Swing]"):
    """BOS/CHoCH durum makinesi (close-onaylı, non-repainting).

    Legacy detect_events ile birebir. RAW pivotlarla beslenir. Döner: (events, state).
    """
    ordered = sorted(swings, key=lambda s: (s.confirm, s.index))
    state = "RANGE"
    ref_high = None
    ref_low = None
    si = 0
    events: "list[StructureEvent]" = []
    for bi in range(len(closes)):
        c = closes[bi]
        # ACTIVATION: bi confirm_index'e ulaşan tüm pivotları en-son referans yap.
        while si < len(ordered) and ordered[si].confirm <= bi:
            s = ordered[si]
            si += 1
            if s.kind == "H":
                ref_high = s
            else:
                ref_low = s
        # UP-BREAK (down'dan önce kontrol edilir; kırılınca 'continue').
        if ref_high is not None and c > ref_high.price:
            kind = "CHoCH" if state == "DOWNTREND" else "BOS"
            events.append(StructureEvent(bi, kind, "up", ref_high.price, ref_high.index))
            state = "UPTREND"
            ref_high = None  # tüketildi; yeni onaylı swing high gerekir
            continue
        # DOWN-BREAK.
        if ref_low is not None and c < ref_low.price:
            kind = "CHoCH" if state == "UPTREND" else "BOS"
            events.append(StructureEvent(bi, kind, "down", ref_low.price, ref_low.index))
            state = "DOWNTREND"
            ref_low = None
    return events, state


def _to_alternating(swings: "list[Swing]") -> "list[Swing]":
    """Ardışık aynı-tip pivotları daha uç olana indirger (SADECE display/anchor).

    Legacy to_alternating: H için >= (eşitlikte SONRAKİ), L için <= (eşitlikte SONRAKİ).
    Makineye ASLA verilmez (birleştirme replay-safe değildir).
    """
    out: "list[Swing]" = []
    for s in swings:
        if out and out[-1].kind == s.kind:
            prev = out[-1]
            if s.kind == "H":
                if s.price >= prev.price:
                    out[-1] = s
            else:
                if s.price <= prev.price:
                    out[-1] = s
        else:
            out.append(s)
    return out


def _analyze_structure(df, n: int) -> dict:
    """StructureResult benzeri sözlük: trend_state, last_event, last_swing_high/low."""
    highs = df["high"].to_numpy(dtype=float)
    lows = df["low"].to_numpy(dtype=float)
    closes = df["close"].to_numpy(dtype=float)
    raw = _find_swings(highs, lows, n)
    events, state = _detect_events(closes, raw)
    alt = _to_alternating(raw)
    last_h = None
    last_l = None
    for s in alt:
        if s.kind == "H":
            last_h = s
        else:
            last_l = s
    return {
        "trend_state": state,
        "events": events,
        "last_event": events[-1] if events else None,
        "last_swing_high": last_h,
        "last_swing_low": last_l,
        "n_bars": len(closes),
    }


# =============================================================================
# Ortak strateji tabanı
# =============================================================================
class _GoldStructureStrategy(Strategy):
    """gold_trend ve gold_scalp için paylaşılan giriş/SL/çıkış iskeleti."""

    symbols = ["gold"]

    # Alt sınıflar dolduruyor:
    _entry_n_param = "n_h1"   # giriş TF fraktal gücü parametre anahtarı
    _htf_fetch = 500          # HTF (Günlük/H4/Haftalık) çekilecek bar sayısı
    _entry_fetch = 1000       # giriş TF çekilecek bar sayısı

    # --- güvenli sarmalayıcılar (motora asla exception fırlatma) -------------
    def analyze(self, symbol: str, mt5c: "MT5Client", params: dict) -> Signal:
        try:
            return self._analyze(symbol, mt5c, self.merged_params(params))
        except Exception as exc:  # defensive
            log.exception("Altın yapı analizi hatası (%s): %s", symbol, exc)
            return Signal(direction="none", reason=f"Strateji hatası: {exc}")

    def manage(self, symbol: str, mt5c: "MT5Client", params: dict,
               positions: "list[dict]") -> "list[dict]":
        try:
            return self._manage(symbol, mt5c, self.merged_params(params), positions)
        except Exception as exc:  # defensive
            log.exception("Altın yapı yönetim hatası (%s): %s", symbol, exc)
            return []

    # --- veri yardımcıları ---------------------------------------------------
    @staticmethod
    def _closed(mt5c: "MT5Client", symbol: str, tf: str, count: int):
        """Barları çek ve OLUŞMAKTA olan son barı at; yetersizse None."""
        rates = mt5c.get_rates(symbol, str(tf), int(count))
        if rates is None or len(rates) < 2:
            return None
        return rates.iloc[:-1]

    # --- ortak giriş + yapısal SL --------------------------------------------
    def _build_entry_signal(self, mt5c, symbol, p, direction, entry_tf,
                            n_entry, bias_txt) -> Signal:
        min_bars = int(p["min_bars"])
        df = self._closed(mt5c, symbol, entry_tf, self._entry_fetch)
        if df is None or len(df) < min_bars:
            return Signal(direction="none", reason="Yetersiz veri")

        res = _analyze_structure(df, int(n_entry))
        want = "up" if direction == "buy" else "down"
        ev = res["last_event"]

        # Tetik: son olay KESİN BOS (CHoCH değil) ve giriş yönünde olmalı.
        if ev is None or ev.kind != "BOS" or ev.direction != want:
            return Signal(direction="none",
                          reason=f"{entry_tf} taze devam BOS'u yok ({bias_txt})")

        # Tazelik: BOS son (varsayılan) 2 kapanmış bar içinde olmalı.
        fresh_bars = int(p["bos_fresh_bars"])
        n_closed = len(df)
        if ev.index < n_closed - fresh_bars:
            return Signal(
                direction="none",
                reason=f"{entry_tf} BOS bayat (kırılım bar {ev.index}, son {n_closed - 1})",
            )

        # Yapısal SL: son karşı swing ± ATR tamponu.
        atr_val = float(
            indicators.atr(df["high"], df["low"], df["close"], int(p["atr_period"])).iloc[-1]
        )
        if not math.isfinite(atr_val) or atr_val <= 0:
            return Signal(direction="none", reason="ATR hesaplanamadı")

        anchor = res["last_swing_low"] if direction == "buy" else res["last_swing_high"]
        if anchor is None:
            return Signal(direction="none", reason="Yapısal SL için swing bulunamadı")

        entry_price = float(df["close"].iloc[-1])
        buf = float(p["stop_buffer_atr"]) * atr_val
        if direction == "buy":
            stop = float(anchor.price) - buf
            risk = entry_price - stop
        else:
            stop = float(anchor.price) + buf
            risk = stop - entry_price

        # R-patlaması koruması: SL çok darsa kur (min_stop_atr * ATR).
        min_risk = float(p["min_stop_atr"]) * atr_val
        if risk < min_risk:
            return Signal(
                direction="none",
                reason=f"SL çok dar, kurulum reddedildi (risk {risk:.2f} < {min_risk:.2f})",
            )

        yon = "yukarı" if want == "up" else "aşağı"
        reason = (
            f"{bias_txt}; {entry_tf} taze BOS ({yon}) kırılan seviye @ {float(ev.level):.2f}; "
            f"yapısal SL @ {float(stop):.2f} (ATR {atr_val:.2f}); TP yok — yapı yönetimli çıkış"
        )
        log.info("Altın yapı sinyali (%s): %s -> %s", symbol, direction.upper(), reason)
        return Signal(
            direction=direction,
            reason=reason,
            sl_price=float(stop),
            tp_price=0.0,  # 0 => TP YOK (yapısal/CHoCH çıkış)
        )

    # --- ortak çıkış yönetimi (entry TF'te CHoCH) ----------------------------
    def _manage(self, symbol, mt5c, p, positions) -> "list[dict]":
        if not positions:
            return []
        entry_tf = self.entry_timeframe(p)
        n_entry = int(p[self._entry_n_param])
        df = self._closed(mt5c, symbol, entry_tf, self._entry_fetch)
        if df is None or len(df) < int(p["min_bars"]):
            return []

        res = _analyze_structure(df, n_entry)
        ev = res["last_event"]
        # Yalnızca SON KAPANMIŞ barda oluşan bir CHoCH pozisyonu kapatır.
        if ev is None or ev.kind != "CHoCH" or ev.index != len(df) - 1:
            return []

        actions: "list[dict]" = []
        for pos in positions:
            d = str(pos.get("direction", "")).lower()
            # long'u aşağı-CHoCH, short'u yukarı-CHoCH kapatır.
            if (d == "buy" and ev.direction == "down") or (d == "sell" and ev.direction == "up"):
                actions.append({
                    "action": "close",
                    "ticket": pos.get("ticket"),
                    "reason": "CHoCH (yapısal dönüş) — pozisyon kapatılıyor",
                })
        return actions


# =============================================================================
# TREND modeli (giriş TF = H1)
# =============================================================================
@registry.register
class GoldTrendStrategy(_GoldStructureStrategy):
    name = "gold_trend"
    display_name = "Altın Yapı — TREND (BOS/CHoCH)"
    description = (
        "Günlük ve H4 yapısal trend durumu (BOS/CHoCH makinesi) AYNI yönde uyumluysa, "
        "H1 grafiğinde o yönde TAZE bir Break of Structure (yapı kırılımı) oluştuğunda "
        "piyasa girişi yapılır. SL yapısaldır (giriş yönündeki son karşı swing'in ± ATR "
        "tamponu ötesi); sabit TP yoktur (tp_price=0). Çıkış manage() ile: H1'de pozisyona "
        "karşı bir CHoCH (yapısal dönüş) son kapanmış barda oluşursa pozisyon kapatılır. "
        "Tüm hesaplamalar kapanmış mumlarda yapılır, repaint yoktur."
    )
    _entry_n_param = "n_h1"
    default_params = {
        "tf_entry": "H1",     # entry_timeframe() bunu döndürür
        "tf_daily": "D1",
        "tf_h4": "H4",
        "n_daily": 4,         # Günlük fraktal gücü
        "n_h4": 5,            # H4 fraktal gücü
        "n_h1": 5,            # H1 fraktal gücü (giriş + çıkış)
        "atr_period": 14,     # Wilder ATR (SL tamponu için)
        "stop_buffer_atr": 0.10,  # SL = anchor ± bu * ATR(H1)
        "min_stop_atr": 0.25,     # risk < bu * ATR(H1) ise reddet
        "bos_fresh_bars": 2,      # BOS son bu kadar kapanmış bar içinde olmalı
        "min_bars": 30,           # TF başına minimum kapanmış bar
    }

    def _analyze(self, symbol, mt5c, p) -> Signal:
        min_bars = int(p["min_bars"])
        daily = self._closed(mt5c, symbol, p["tf_daily"], self._htf_fetch)
        h4 = self._closed(mt5c, symbol, p["tf_h4"], self._htf_fetch)
        if daily is None or h4 is None or len(daily) < min_bars or len(h4) < min_bars:
            return Signal(direction="none", reason="Yetersiz veri")

        dres = _analyze_structure(daily, int(p["n_daily"]))
        if dres["trend_state"] not in ("UPTREND", "DOWNTREND"):
            return Signal(direction="none",
                          reason=f"Günlük yapı RANGE — yön yok ({dres['trend_state']})")
        direction = "buy" if dres["trend_state"] == "UPTREND" else "sell"

        h4res = _analyze_structure(h4, int(p["n_h4"]))
        if h4res["trend_state"] != dres["trend_state"]:
            return Signal(
                direction="none",
                reason=(f"D1/H4 uyumsuz (D1 {dres['trend_state']}, H4 {h4res['trend_state']})"),
            )

        bias_txt = f"D1+H4 {dres['trend_state']} uyumu"
        return self._build_entry_signal(
            mt5c, symbol, p, direction, str(p["tf_entry"]), p["n_h1"], bias_txt
        )


# =============================================================================
# SCALP modeli (giriş TF = M15)
# =============================================================================
@registry.register
class GoldScalpStrategy(_GoldStructureStrategy):
    name = "gold_scalp"
    display_name = "Altın Yapı — SCALP (15m BOS)"
    description = (
        "TREND modelinin bir fraktal alt sürümü: Günlük ve H4 aynı yönde uyumlu VE Haftalık "
        "trend bu yöne KARŞI değilse (RANGE veya aynı yön kabul), M15 grafiğinde o yönde TAZE "
        "bir BOS oluştuğunda giriş yapılır. SL yapısaldır (M15 son karşı swing ± ATR tamponu), "
        "sabit TP yoktur (tp_price=0). Çıkış manage() ile: M15'te pozisyona karşı CHoCH son "
        "kapanmış barda oluşursa kapatılır. Haftalık veri (W1) yoksa D1+H4 ile işleme devam eder. "
        "Tüm hesaplamalar kapanmış mumlarda, repaint yoktur."
    )
    _entry_n_param = "n_m15"
    default_params = {
        "tf_entry": "M15",    # entry_timeframe() bunu döndürür
        "tf_weekly": "W1",    # W1 broker/istemcide yoksa Haftalık engel atlanır
        "tf_daily": "D1",
        "tf_h4": "H4",
        "n_weekly": 3,        # Haftalık fraktal gücü
        "n_daily": 4,
        "n_h4": 5,
        "n_m15": 5,           # M15 fraktal gücü (giriş + çıkış)
        "use_weekly": True,   # Haftalık trend KARŞI olmamalı (uygunsa)
        "atr_period": 14,
        "stop_buffer_atr": 0.10,
        "min_stop_atr": 0.25,
        "bos_fresh_bars": 2,
        "min_bars": 30,
    }

    def _analyze(self, symbol, mt5c, p) -> Signal:
        min_bars = int(p["min_bars"])
        daily = self._closed(mt5c, symbol, p["tf_daily"], self._htf_fetch)
        h4 = self._closed(mt5c, symbol, p["tf_h4"], self._htf_fetch)
        if daily is None or h4 is None or len(daily) < min_bars or len(h4) < min_bars:
            return Signal(direction="none", reason="Yetersiz veri")

        dres = _analyze_structure(daily, int(p["n_daily"]))
        if dres["trend_state"] not in ("UPTREND", "DOWNTREND"):
            return Signal(direction="none",
                          reason=f"Günlük yapı RANGE — yön yok ({dres['trend_state']})")
        direction = "buy" if dres["trend_state"] == "UPTREND" else "sell"

        h4res = _analyze_structure(h4, int(p["n_h4"]))
        if h4res["trend_state"] != dres["trend_state"]:
            return Signal(
                direction="none",
                reason=(f"D1/H4 uyumsuz (D1 {dres['trend_state']}, H4 {h4res['trend_state']})"),
            )

        # Haftalık engel: yalnızca KARŞI trend işlemi bloklar (RANGE/aynı yön geçer).
        weekly_txt = ""
        if bool(p.get("use_weekly", True)):
            n_weekly = int(p["n_weekly"])
            weekly = self._closed(mt5c, symbol, p["tf_weekly"], self._htf_fetch)
            if weekly is not None and len(weekly) >= 2 * n_weekly + 10:
                wres = _analyze_structure(weekly, n_weekly)
                opposing = "DOWNTREND" if direction == "buy" else "UPTREND"
                if wres["trend_state"] == opposing:
                    return Signal(
                        direction="none",
                        reason=f"Haftalık trend karşı yönde ({wres['trend_state']}) — işlem yok",
                    )
                if wres["trend_state"] in ("UPTREND", "DOWNTREND"):
                    weekly_txt = f", W1 {wres['trend_state']}"

        bias_txt = f"D1+H4 {dres['trend_state']} uyumu{weekly_txt}"
        return self._build_entry_signal(
            mt5c, symbol, p, direction, str(p["tf_entry"]), p["n_m15"], bias_txt
        )
