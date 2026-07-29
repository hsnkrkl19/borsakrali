# -*- coding: utf-8 -*-
"""MT5 client wrapper.

All MetaTrader5 API access goes through this module (Trader additionally
imports MetaTrader5 only for order constants). Importing MetaTrader5 at
module top is safe: it has no side effects until mt5.initialize() is called.
"""

import threading
from datetime import datetime, timezone

import MetaTrader5 as mt5
import pandas as pd

from core.config import MAGIC_NUMBER, ConfigManager
from core.logger import get_logger

log = get_logger(__name__)

# MetaTrader5 exposes a process-global terminal connection.  Research and the
# live engine run in separate threads, therefore every API call shares one
# re-entrant lock so historical reads cannot overlap an order transaction.
MT5_API_LOCK = threading.RLock()

# Timeframe string -> MetaTrader5 constant map (per SPEC).
TIMEFRAME_MAP = {
    "M1": mt5.TIMEFRAME_M1,
    "M5": mt5.TIMEFRAME_M5,
    "M15": mt5.TIMEFRAME_M15,
    "M30": mt5.TIMEFRAME_M30,
    "H1": mt5.TIMEFRAME_H1,
    "H4": mt5.TIMEFRAME_H4,
    "D1": mt5.TIMEFRAME_D1,
    "W1": mt5.TIMEFRAME_W1,
    "MN1": mt5.TIMEFRAME_MN1,
}

# Deal/position enum -> human readable maps.
_POSITION_DIRECTION = {
    mt5.POSITION_TYPE_BUY: "buy",
    mt5.POSITION_TYPE_SELL: "sell",
}

_DEAL_TYPE = {
    code: label
    for attr, label in (
        ("DEAL_TYPE_BUY", "buy"),
        ("DEAL_TYPE_SELL", "sell"),
        ("DEAL_TYPE_BALANCE", "balance"),
        ("DEAL_TYPE_CREDIT", "credit"),
        ("DEAL_TYPE_CHARGE", "charge"),
        ("DEAL_TYPE_CORRECTION", "correction"),
        ("DEAL_TYPE_BONUS", "bonus"),
        ("DEAL_TYPE_COMMISSION", "commission"),
        ("DEAL_TYPE_INTEREST", "interest"),
        ("DEAL_DIVIDEND", "dividend"),
    )
    if (code := getattr(mt5, attr, None)) is not None
}

_DEAL_ENTRY = {
    mt5.DEAL_ENTRY_IN: "in",
    mt5.DEAL_ENTRY_OUT: "out",
    mt5.DEAL_ENTRY_INOUT: "inout",
    mt5.DEAL_ENTRY_OUT_BY: "out_by",
}

_ACCOUNT_TRADE_MODE = {
    getattr(mt5, "ACCOUNT_TRADE_MODE_DEMO", 0): "demo",
    getattr(mt5, "ACCOUNT_TRADE_MODE_CONTEST", 1): "contest",
    getattr(mt5, "ACCOUNT_TRADE_MODE_REAL", 2): "real",
}


def _iso(epoch_seconds) -> str:
    """Convert an MT5 epoch timestamp to an ISO string.

    MT5 encodes server wall-clock times as-if-UTC epochs, so decode them in
    UTC to recover the server wall clock unshifted (decoding with the local
    timezone would add the local UTC offset on top of the server offset).
    """
    try:
        return (
            datetime.fromtimestamp(int(epoch_seconds), tz=timezone.utc)
            .replace(tzinfo=None)
            .isoformat(timespec="seconds")
        )
    except (OSError, OverflowError, ValueError, TypeError):
        return ""


class MT5Client:
    """Thin, defensive wrapper around the MetaTrader5 package."""

    def __init__(self, config: ConfigManager):
        self.config = config
        self._lock = MT5_API_LOCK
        self._positions_cache_lock = threading.RLock()
        self._positions_cache: dict[int | None, list[dict]] = {}
        self._connected = False
        self._symbol_cache: dict | None = None

    # ------------------------------------------------------------------
    # Connection management
    # ------------------------------------------------------------------
    def connect(self) -> bool:
        """Initialize the MT5 terminal connection. Safe to call repeatedly."""
        with self._lock:
            try:
                # Already connected? Cheap re-check instead of re-initializing.
                if self._connected and mt5.terminal_info() is not None:
                    return True
                cfg = self.config.get()
                mt5_path = str(((cfg.get("mt5") or {}).get("path") or "")).strip()
                initialized = mt5.initialize(path=mt5_path) if mt5_path else mt5.initialize()
                if not initialized:
                    self._connected = False
                    log.warning(
                        "MT5 başlatılamadı: %s. Terminalin açık ve oturumun aktif olduğundan emin olun.",
                        mt5.last_error(),
                    )
                    return False
                self._connected = True
                term = mt5.terminal_info()
                if term is not None:
                    log.info(
                        "MT5 terminaline bağlanıldı: %s (build %s), şirket: %s",
                        getattr(term, "name", "?"),
                        getattr(term, "build", "?"),
                        getattr(term, "company", "?"),
                    )
                else:
                    log.warning("MT5 terminal bilgisi alınamadı.")
                acc = mt5.account_info()
                if acc is not None:
                    log.info(
                        "Hesap: %s@%s, bakiye: %.2f %s, kaldıraç: 1:%s",
                        acc.login,
                        acc.server,
                        acc.balance,
                        acc.currency,
                        acc.leverage,
                    )
                else:
                    log.warning(
                        "MT5 hesap bilgisi alınamadı: %s. Terminalde oturum açıldığından emin olun.",
                        mt5.last_error(),
                    )
                return True
            except Exception as exc:  # pragma: no cover - defensive
                self._connected = False
                log.warning("MT5 bağlantısı sırasında hata: %s", exc)
                return False

    def shutdown(self) -> None:
        """Shut the terminal connection down."""
        with self._lock:
            try:
                mt5.shutdown()
                log.info("MT5 bağlantısı kapatıldı.")
            except Exception as exc:  # pragma: no cover - defensive
                log.warning("MT5 bağlantısı kapatılırken hata: %s", exc)
            finally:
                self._connected = False

    def is_connected(self) -> bool:
        """Return True only when the terminal is connected to the trade server."""
        try:
            with self._lock:
                info = mt5.terminal_info()
        except Exception as exc:  # pragma: no cover - defensive
            log.warning("MT5 terminal bilgisi sorgulanırken hata: %s", exc)
            return False
        connected = info is not None and bool(getattr(info, "connected", False))
        with self._lock:
            self._connected = connected
        return connected

    def ensure_connected(self) -> bool:
        """Reconnect if the connection dropped."""
        if self.is_connected():
            return True
        with self._lock:
            self._connected = False
        log.warning("MT5 bağlantısı kopmuş, yeniden bağlanılıyor...")
        return self.connect()

    def terminal_status(self) -> dict:
        """Return the terminal gates used by preflight and every order path."""
        try:
            with self._lock:
                info = mt5.terminal_info()
        except Exception as exc:  # pragma: no cover - defensive
            log.warning("Terminal durumu alınırken hata: %s", exc)
            return {"connected": False, "trade_allowed": False}
        if info is None:
            return {"connected": False, "trade_allowed": False}
        return {
            "connected": bool(getattr(info, "connected", False)),
            "trade_allowed": bool(getattr(info, "trade_allowed", False)),
            "dlls_allowed": bool(getattr(info, "dlls_allowed", False)),
            "build": int(getattr(info, "build", 0) or 0),
            "name": str(getattr(info, "name", "") or ""),
            "path": str(getattr(info, "path", "") or ""),
        }

    # ------------------------------------------------------------------
    # Account / market info
    # ------------------------------------------------------------------
    def account_info(self) -> dict | None:
        try:
            with self._lock:
                acc = mt5.account_info()
        except Exception as exc:  # pragma: no cover - defensive
            log.warning("Hesap bilgisi alınırken hata: %s", exc)
            return None
        if acc is None:
            log.warning("Hesap bilgisi alınamadı: %s", mt5.last_error())
            return None
        if not getattr(acc, "login", 0):
            # Observed live: while the terminal starts up or switches accounts
            # it briefly reports an all-zero AccountInfo. Treat it as "not
            # authorized" so no trade/lot decision is made on a zeroed balance.
            log.warning("MT5 hesabı yetkilendirilmemiş (login=0) — terminalde oturum bekleniyor.")
            return None
        return {
            "login": acc.login,
            "server": acc.server,
            "balance": acc.balance,
            "equity": acc.equity,
            "margin": acc.margin,
            "margin_free": acc.margin_free,
            "currency": acc.currency,
            "profit": acc.profit,
            "leverage": acc.leverage,
            "margin_level": getattr(acc, "margin_level", 0.0),
            "trade_allowed": bool(getattr(acc, "trade_allowed", False)),
            "trade_expert": bool(getattr(acc, "trade_expert", False)),
            "trade_mode": getattr(acc, "trade_mode", None),
            "trade_mode_label": _ACCOUNT_TRADE_MODE.get(
                getattr(acc, "trade_mode", None), "unknown"
            ),
        }

    # symbols config'inde broker sembolü OLMAYAN yapısal anahtarlar.
    _RESERVED_SYMBOL_KEYS = ("auto_detect", "enabled")

    def _custom_symbol_keys(self, sym_cfg: dict) -> dict:
        """Config'te tanımlı gold/btc DIŞI özel sembol anahtarları.

        SINIRSIZ SEMBOL: kullanıcı config'e {"nasdaq": "US100.cash"} gibi yeni
        anahtarlar ekleyebilir; motor enabled+assignments üzerinden bunları da
        işler. Yeni anahtarların verified_assignments kaydı olmadığından
        allow_unverified=false iken otomatik işlem AÇILMAZ (güvenli varsayılan).
        """
        out = {}
        for key, value in (sym_cfg or {}).items():
            if key in self._RESERVED_SYMBOL_KEYS or key in ("gold", "btc"):
                continue
            if isinstance(value, str) and value.strip():
                out[str(key)] = value.strip()
        return out

    def resolve_symbols(self) -> dict:
        """Resolve logical symbol keys to broker symbol names.

        "gold"/"btc" kademeli otomatik algılamayla çözülür; config'e eklenen
        diğer TÜM anahtarlar (sınırsız) yapılandırılmış broker adını kullanır.
        Result is cached after the first successful resolution.
        """
        with self._lock:
            if self._symbol_cache is not None:
                return dict(self._symbol_cache)

        cfg = self.config.get()
        sym_cfg = cfg.get("symbols", {})
        fallback = {
            "gold": sym_cfg.get("gold", "XAUUSD"),
            "btc": sym_cfg.get("btc", "BTCUSD"),
        }
        custom = self._custom_symbol_keys(sym_cfg)

        if not sym_cfg.get("auto_detect", True):
            # Use configured names directly, but still make them visible.
            resolved = {}
            for key, name in {**fallback, **custom}.items():
                if self._select_symbol(name):
                    resolved[key] = name
            log.info(
                "Sembol otomatik algılama kapalı, yapılandırılmış isimler kullanılıyor: altın=%s, btc=%s, özel=%d",
                resolved.get("gold", "YOK"),
                resolved.get("btc", "YOK"),
                len([k for k in resolved if k in custom]),
            )
            with self._lock:
                self._symbol_cache = dict(resolved)
            return resolved

        try:
            with self._lock:
                symbols = mt5.symbols_get()
        except Exception as exc:  # pragma: no cover - defensive
            log.warning("Sembol listesi alınırken hata: %s", exc)
            symbols = None

        if not symbols:
            log.warning(
                "MT5 sembol listesi alınamadı, yapılandırılmış isimler kullanılacak: altın=%s, btc=%s",
                fallback["gold"],
                fallback["btc"],
            )
            resolved = {}
            for key, name in {**fallback, **custom}.items():
                if self._select_symbol(name):
                    resolved[key] = name
            # Do not cache the fallback so a later call can retry detection.
            return resolved

        gold = self._detect_symbol(
            symbols,
            exact="XAUUSD",
            prefix="XAUUSD",
            contains_all=("XAU", "USD"),
            contains_any=("GOLD",),
        )
        btc = self._detect_symbol(
            symbols,
            exact="BTCUSD",
            prefix="BTCUSD",
            contains_all=("BTC", "USD"),
            contains_any=(),
        )

        resolved = {}
        for key, found, fb in (("gold", gold, fallback["gold"]), ("btc", btc, fallback["btc"])):
            if found is None:
                log.warning(
                    "%s için uygun sembol bulunamadı, yapılandırılmış isim kullanılacak: %s",
                    "Altın" if key == "gold" else "BTC",
                    fb,
                )
                resolved[key] = fb
            else:
                resolved[key] = found
            if not self._select_symbol(resolved[key]):
                resolved.pop(key, None)

        # Özel semboller: yapılandırılmış broker adını doğrudan kullan (Market
        # Watch'a eklenebiliyorsa). gold/btc gibi kademeli algılamaya girmezler.
        for key, name in custom.items():
            if self._select_symbol(name):
                resolved[key] = name
            else:
                log.warning("Özel sembol Market Watch'a eklenemedi, atlandı: %s=%s", key, name)

        log.info(
            "Semboller çözümlendi: altın=%s, btc=%s, özel=%d",
            resolved.get("gold", "YOK"),
            resolved.get("btc", "YOK"),
            len([k for k in resolved if k in custom]),
        )
        with self._lock:
            self._symbol_cache = dict(resolved)
        return dict(resolved)

    def clear_symbol_cache(self) -> None:
        """Forget broker symbol resolution after an approved account switch."""
        with self._lock:
            self._symbol_cache = None

    def _detect_symbol(self, symbols, exact: str, prefix: str,
                       contains_all: tuple, contains_any: tuple) -> str | None:
        """Run the tiered symbol-detection algorithm, preferring visible symbols."""
        exact_u = exact.upper()
        prefix_u = prefix.upper()

        def pick(candidates):
            if not candidates:
                return None
            # Exact but disabled/close-only symbols are common beside broker
            # suffix variants (XAUUSD vs XAUUSD.a). Never let an unusable
            # exact name hide a genuinely tradable suffix candidate.
            tradable = [
                s for s in candidates
                if int(getattr(s, "trade_mode", 4) or 0) in (1, 2, 4)
            ]
            if not tradable:
                return None
            visible = [s for s in tradable if getattr(s, "visible", False)]
            chosen = visible[0] if visible else tradable[0]
            return chosen.name

        tiers = [
            [s for s in symbols if s.name.upper() == exact_u],
            [s for s in symbols if s.name.upper().startswith(prefix_u)],
            [s for s in symbols if all(part in s.name.upper() for part in contains_all)],
        ]
        if contains_any:
            tiers.append([s for s in symbols if any(part in s.name.upper() for part in contains_any)])

        for tier in tiers:
            name = pick(tier)
            if name is not None:
                return name
        return None

    def _select_symbol(self, symbol: str) -> bool:
        """Make a symbol visible in Market Watch; log a Turkish warning on failure."""
        try:
            with self._lock:
                selected = mt5.symbol_select(symbol, True)
            if not selected:
                log.warning("Sembol Market Watch'a eklenemedi: %s (%s)", symbol, mt5.last_error())
                return False
            return True
        except Exception as exc:  # pragma: no cover - defensive
            log.warning("Sembol seçilirken hata (%s): %s", symbol, exc)
            return False

    def symbol_info(self, symbol: str) -> dict | None:
        try:
            with self._lock:
                info = mt5.symbol_info(symbol)
        except Exception as exc:  # pragma: no cover - defensive
            log.warning("Sembol bilgisi alınırken hata (%s): %s", symbol, exc)
            return None
        if info is None:
            log.warning("Sembol bilgisi alınamadı: %s (%s)", symbol, mt5.last_error())
            return None
        return {
            "name": info.name,
            "point": info.point,
            "digits": info.digits,
            "spread": info.spread,
            "trade_tick_value": info.trade_tick_value,
            "trade_tick_size": info.trade_tick_size,
            "volume_min": info.volume_min,
            "volume_max": info.volume_max,
            "volume_step": info.volume_step,
            "trade_contract_size": info.trade_contract_size,
            "currency_profit": info.currency_profit,
            "bid": info.bid,
            "ask": info.ask,
            "time": info.time,
            "visible": bool(getattr(info, "visible", False)),
            "trade_mode": int(getattr(info, "trade_mode", 0) or 0),
            "trade_stops_level": int(getattr(info, "trade_stops_level", 0) or 0),
            "trade_freeze_level": int(getattr(info, "trade_freeze_level", 0) or 0),
        }

    def tick(self, symbol: str) -> dict | None:
        try:
            with self._lock:
                t = mt5.symbol_info_tick(symbol)
        except Exception as exc:  # pragma: no cover - defensive
            log.warning("Fiyat bilgisi alınırken hata (%s): %s", symbol, exc)
            return None
        if t is None:
            log.warning("Fiyat bilgisi alınamadı: %s (%s)", symbol, mt5.last_error())
            return None
        return {"bid": t.bid, "ask": t.ask, "time": t.time}

    # ------------------------------------------------------------------
    # Market data
    # ------------------------------------------------------------------
    def get_rates(self, symbol: str, timeframe: str, count: int) -> pd.DataFrame | None:
        tf = TIMEFRAME_MAP.get(timeframe)
        if tf is None:
            log.warning(
                "Geçersiz zaman dilimi: %s (geçerli değerler: %s)",
                timeframe,
                ", ".join(TIMEFRAME_MAP.keys()),
            )
            return None
        try:
            with self._lock:
                rates = mt5.copy_rates_from_pos(symbol, tf, 0, count)
        except Exception as exc:  # pragma: no cover - defensive
            log.warning("Bar verisi alınırken hata (%s %s): %s", symbol, timeframe, exc)
            return None
        if rates is None or len(rates) == 0:
            log.warning(
                "Bar verisi alınamadı: %s %s (%s)", symbol, timeframe, mt5.last_error()
            )
            return None
        df = pd.DataFrame(rates)
        df["time"] = pd.to_datetime(df["time"], unit="s")
        cols = ["time", "open", "high", "low", "close", "tick_volume", "spread"]
        available = [c for c in cols if c in df.columns]
        return df[available]

    # ------------------------------------------------------------------
    # Positions & history
    # ------------------------------------------------------------------
    def positions(self, magic: int | None = MAGIC_NUMBER) -> list[dict]:
        try:
            with self._lock:
                raw = mt5.positions_get()
        except Exception as exc:  # pragma: no cover - defensive
            log.warning("Açık pozisyonlar alınırken hata: %s", exc)
            return []
        if raw is None:
            err = mt5.last_error()
            # (1, 'Success') means simply no positions; anything else is a real problem.
            if err is not None and err[0] not in (1, 0):
                log.warning("Açık pozisyonlar alınamadı: %s", err)
            return []
        result = self._format_positions(raw, magic)
        with self._positions_cache_lock:
            self._positions_cache[magic] = [dict(row) for row in result]
        return result

    def positions_snapshot(
        self,
        magic: int | None = MAGIC_NUMBER,
        timeout_seconds: float = 0.05,
    ) -> list[dict]:
        """Return positions quickly, falling back to the last safe snapshot.

        Research can hold the process-wide MT5 lock during a large history
        request. Panel polling must never queue behind that work.
        """
        acquired = self._lock.acquire(timeout=max(0.0, float(timeout_seconds)))
        if not acquired:
            return self._cached_positions(magic)
        try:
            try:
                raw = mt5.positions_get()
            except Exception as exc:  # pragma: no cover - defensive
                log.warning("Açık pozisyon anlık görüntüsü alınamadı: %s", exc)
                return self._cached_positions(magic)
            if raw is None:
                return self._cached_positions(magic)
            result = self._format_positions(raw, magic)
            with self._positions_cache_lock:
                self._positions_cache[magic] = [dict(row) for row in result]
            return result
        finally:
            self._lock.release()

    def _cached_positions(self, magic: int | None) -> list[dict]:
        with self._positions_cache_lock:
            return [dict(row) for row in self._positions_cache.get(magic, [])]

    @staticmethod
    def _format_positions(raw, magic: int | None) -> list[dict]:
        result = []
        for p in raw:
            if magic is not None and p.magic != magic:
                continue
            result.append({
                "ticket": p.ticket,
                "symbol": p.symbol,
                "direction": _POSITION_DIRECTION.get(p.type, str(p.type)),
                "volume": p.volume,
                "price_open": p.price_open,
                "sl": p.sl,
                "tp": p.tp,
                "profit": p.profit,
                "swap": p.swap,
                "comment": p.comment,
                "magic": p.magic,
                "time": _iso(p.time),
            })
        return result

    def history_deals(self, from_dt: datetime, to_dt: datetime,
                      magic: int | None = MAGIC_NUMBER) -> list[dict]:
        # The MetaTrader5 package shifts naive datetimes by the local UTC
        # offset before querying, while deal times are server wall-clock
        # epochs encoded as-if-UTC. Tag naive bounds as UTC so the wall-clock
        # value passes through unshifted and matches the server clock.
        if from_dt.tzinfo is None:
            from_dt = from_dt.replace(tzinfo=timezone.utc)
        if to_dt.tzinfo is None:
            to_dt = to_dt.replace(tzinfo=timezone.utc)
        try:
            with self._lock:
                raw = mt5.history_deals_get(from_dt, to_dt)
        except Exception as exc:  # pragma: no cover - defensive
            log.warning("İşlem geçmişi alınırken hata: %s", exc)
            return []
        if raw is None:
            err = mt5.last_error()
            if err is not None and err[0] not in (1, 0):
                log.warning("İşlem geçmişi alınamadı: %s", err)
            return []
        result = []
        for d in raw:
            if magic is not None and d.magic != magic:
                continue
            result.append({
                "ticket": d.ticket,
                "order": d.order,
                "position_id": d.position_id,
                "symbol": d.symbol,
                "type": _DEAL_TYPE.get(d.type, str(d.type)),
                "entry": _DEAL_ENTRY.get(d.entry, str(d.entry)),
                "volume": d.volume,
                "price": d.price,
                "profit": d.profit,
                "commission": d.commission,
                "swap": d.swap,
                "fee": d.fee,
                "time": _iso(d.time),
                "comment": d.comment,
                "magic": d.magic,
            })
        return result
