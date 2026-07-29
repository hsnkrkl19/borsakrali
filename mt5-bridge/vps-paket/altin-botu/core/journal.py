"""Trade journal backed by SQLite.

Mirrors MT5 deal history and open positions into a local database so the
panel and the learner can query trades/events/stats without hitting the
MT5 API. `sync` is idempotent and safe to call on every engine loop.
"""

from __future__ import annotations

import os
import json
import sqlite3
import threading
from datetime import date, datetime, time, timedelta
from typing import TYPE_CHECKING, Any

from core.config import MAGIC_NUMBER
from core.execution import paper_balance, paper_currency
from core.logger import get_logger

if TYPE_CHECKING:  # pragma: no cover - only for type hints
    from core.mt5_client import MT5Client

_TRADE_COLUMNS = (
    "position_id", "symbol", "direction", "volume", "open_time", "open_price",
    "sl", "tp", "close_time", "close_price", "profit", "strategy", "comment", "status",
    "source", "open_balance", "close_balance", "mfe", "mae", "exit_reason",
)


class Journal:
    """SQLite-backed journal of trades and bot events."""

    def __init__(self, db_path: str = "data/journal.db"):
        self._log = get_logger("journal")
        self._db_path = db_path
        directory = os.path.dirname(os.path.abspath(db_path))
        if directory:
            os.makedirs(directory, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA synchronous=NORMAL")
            self._create_tables()
        self._log.info("İşlem günlüğü hazır: %s", db_path)

    # ------------------------------------------------------------------ #
    # schema
    # ------------------------------------------------------------------ #
    def _create_tables(self) -> None:
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS trades (
                position_id INTEGER PRIMARY KEY,
                symbol TEXT,
                direction TEXT,
                volume REAL,
                open_time TEXT,
                open_price REAL,
                sl REAL,
                tp REAL,
                close_time TEXT,
                close_price REAL,
                profit REAL,
                strategy TEXT,
                comment TEXT,
                status TEXT,
                source TEXT DEFAULT 'mt5',
                open_balance REAL,
                close_balance REAL,
                mfe REAL DEFAULT 0.0,
                mae REAL DEFAULT 0.0,
                exit_reason TEXT
            )
            """
        )
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                time TEXT,
                kind TEXT,
                message TEXT
            )
            """
        )
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS order_intents (
                intent_key TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                status TEXT NOT NULL,
                payload TEXT,
                result TEXT
            )
            """
        )
        self._ensure_trade_columns()
        self._conn.commit()

    def reserve_order_intent(self, intent_key: str, payload: dict | None = None) -> bool:
        """Atomically reserve an automated signal so restarts cannot duplicate it."""
        if not str(intent_key or "").strip():
            return True
        with self._lock:
            try:
                self._conn.execute(
                    "INSERT INTO order_intents(intent_key, created_at, status, payload) VALUES (?, ?, ?, ?)",
                    (
                        str(intent_key),
                        datetime.now().isoformat(timespec="seconds"),
                        "reserved",
                        json.dumps(payload or {}, ensure_ascii=False, default=str),
                    ),
                )
                self._conn.commit()
                return True
            except sqlite3.IntegrityError:
                return False

    def complete_order_intent(self, intent_key: str, status: str, result: dict | None = None) -> None:
        if not str(intent_key or "").strip():
            return
        with self._lock:
            self._conn.execute(
                "UPDATE order_intents SET status = ?, result = ? WHERE intent_key = ?",
                (
                    str(status or "unknown"),
                    json.dumps(result or {}, ensure_ascii=False, default=str),
                    str(intent_key),
                ),
            )
            self._conn.commit()

    def _ensure_trade_columns(self) -> None:
        """Add columns introduced after the initial journal schema."""
        rows = self._conn.execute("PRAGMA table_info(trades)").fetchall()
        existing = {str(row["name"]) for row in rows}
        additions = {
            "source": "TEXT DEFAULT 'mt5'",
            "open_balance": "REAL",
            "close_balance": "REAL",
            "mfe": "REAL DEFAULT 0.0",
            "mae": "REAL DEFAULT 0.0",
            "exit_reason": "TEXT",
        }
        for name, ddl in additions.items():
            if name not in existing:
                self._conn.execute(f"ALTER TABLE trades ADD COLUMN {name} {ddl}")
        self._conn.execute(
            "UPDATE trades SET source = 'mt5' WHERE source IS NULL OR source = ''"
        )

    # ------------------------------------------------------------------ #
    # helpers
    # ------------------------------------------------------------------ #
    @staticmethod
    def _strategy_from_comment(comment: str | None) -> str:
        c = (comment or "").strip()
        low = c.lower()
        if low.startswith("tm|"):
            name = c[3:].strip()
            return name if name else "unknown"
        if low.startswith("man"):
            return "manual"
        return "unknown"

    @staticmethod
    def _to_float(value: Any) -> float:
        try:
            return float(value or 0.0)
        except (TypeError, ValueError):
            return 0.0

    # ------------------------------------------------------------------ #
    # sync
    # ------------------------------------------------------------------ #
    def sync(self, mt5c: "MT5Client", days: int = 30) -> bool:
        """Rebuild/refresh trade rows from MT5 deal history + open positions.

        Idempotent: rows are keyed by position_id and upserted, so calling
        this on every engine loop is safe. Multiple partial-close ("out")
        deals of one position are aggregated into a single close.

        Returns True only when the sync actually completed, so callers can
        retry (e.g. the first full 30-day backfill) after transient failures.
        """
        try:
            if not mt5c.is_connected():
                return False
            now = datetime.now()
            # Fetch without a magic filter: closing deals created from the
            # terminal UI carry magic 0 even for bot positions. Bot positions
            # are recognized by any of their deals carrying our magic.
            deals = mt5c.history_deals(
                now - timedelta(days=days), now + timedelta(minutes=5), magic=None
            ) or []
            positions = mt5c.positions(magic=MAGIC_NUMBER) or []
        except Exception as exc:  # keep the engine loop alive whatever happens
            self._log.warning("Senkronizasyon için MT5 verisi alınamadı: %s", exc)
            return False

        open_ids: set[int] = set()
        for pos in positions:
            try:
                open_ids.add(int(pos.get("ticket", 0) or 0))
            except (TypeError, ValueError):
                continue

        # Group deals by position_id.
        groups: dict[int, dict] = {}
        for deal in deals:
            try:
                pid = int(deal.get("position_id", 0) or 0)
            except (TypeError, ValueError):
                continue
            if pid <= 0:
                continue  # balance/credit operations etc.
            entry = str(deal.get("entry", "") or "")
            group = groups.setdefault(pid, {"in": [], "out": [], "bot": False})
            try:
                if int(deal.get("magic", 0) or 0) == MAGIC_NUMBER:
                    group["bot"] = True
            except (TypeError, ValueError):
                pass
            if entry == "in":
                group["in"].append(deal)
            elif entry in ("out", "out_by", "inout"):
                # "out_by" (close by) and "inout" (netting reversal) also
                # terminate/realize the position — treat them as closes.
                group["out"].append(deal)

        try:
            with self._lock:
                for pid, group in groups.items():
                    if not group["bot"]:
                        continue  # not one of our positions
                    self._upsert_from_deals(pid, group["in"], group["out"], open_ids)
                for pos in positions:
                    self._upsert_open_position(pos)
                self._conn.commit()
        except sqlite3.Error as exc:
            self._log.error("İşlem günlüğü senkronizasyon hatası: %s", exc)
            return False
        return True

    def _upsert_from_deals(
        self, pid: int, in_deals: list[dict], out_deals: list[dict], open_ids: set[int]
    ) -> None:
        in_deals = sorted(in_deals, key=lambda d: str(d.get("time", "")))
        out_deals = sorted(out_deals, key=lambda d: str(d.get("time", "")))

        # --- open side ---------------------------------------------------
        if in_deals:
            first_in = in_deals[0]
            symbol = str(first_in.get("symbol", "") or "")
            direction = str(first_in.get("type", "") or "")
            volume = round(sum(self._to_float(d.get("volume")) for d in in_deals), 8)
            open_time = str(first_in.get("time", "") or "") or None
            open_price = self._to_float(first_in.get("price"))
            comment = str(first_in.get("comment", "") or "")
        elif out_deals:
            # Opening deal outside the sync window: reconstruct what we can.
            first_out = out_deals[0]
            symbol = str(first_out.get("symbol", "") or "")
            out_type = str(first_out.get("type", "") or "")
            direction = "buy" if out_type == "sell" else "sell"
            volume = round(sum(self._to_float(d.get("volume")) for d in out_deals), 8)
            open_time = None
            open_price = 0.0
            comment = str(first_out.get("comment", "") or "")
        else:
            return

        # --- close side (aggregate partial closes) -----------------------
        if out_deals:
            # Entry commission/fee (charged on the "in" deal by commission-based
            # brokers) is part of the trade's real P/L, so include it here.
            entry_costs = sum(
                self._to_float(d.get("commission")) + self._to_float(d.get("fee"))
                for d in in_deals
            )
            profit = round(
                entry_costs
                + sum(
                    self._to_float(d.get("profit"))
                    + self._to_float(d.get("commission"))
                    + self._to_float(d.get("swap"))
                    + self._to_float(d.get("fee"))
                    for d in out_deals
                ),
                2,
            )
            last_out = out_deals[-1]
            close_price = self._to_float(last_out.get("price"))
            close_time = str(last_out.get("time", "") or "") or None
        else:
            profit = None
            close_price = None
            close_time = None

        if pid in open_ids:
            status = "open"
        elif out_deals:
            status = "closed"
        else:
            # In-deal seen but position is gone and no out-deal in window yet
            # (e.g. closed a moment ago) — next sync will finalize it.
            status = "open"

        if status == "open":
            # A still-open position may have partial closes; never show
            # close-side values on an open row. The full aggregation is
            # rewritten from all out-deals once the position actually closes.
            profit = None
            close_price = None
            close_time = None

        strategy = self._strategy_from_comment(comment)

        if in_deals:
            self._conn.execute(
                """
                INSERT INTO trades (position_id, symbol, direction, volume, open_time,
                                    open_price, sl, tp, close_time, close_price, profit,
                                    strategy, comment, status, source)
                VALUES (?, ?, ?, ?, ?, ?, 0.0, 0.0, ?, ?, ?, ?, ?, ?, 'mt5')
                ON CONFLICT(position_id) DO UPDATE SET
                    symbol=excluded.symbol,
                    direction=excluded.direction,
                    volume=excluded.volume,
                    open_time=excluded.open_time,
                    open_price=excluded.open_price,
                    close_time=excluded.close_time,
                    close_price=excluded.close_price,
                    profit=excluded.profit,
                    strategy=excluded.strategy,
                    comment=excluded.comment,
                    status=excluded.status,
                    source='mt5'
                """,
                (pid, symbol, direction, volume, open_time, open_price,
                 close_time, close_price, profit, strategy, comment, status),
            )
        else:
            # No open info in this window: only refresh the close side and
            # keep whatever open-side data an earlier sync already stored.
            self._conn.execute(
                """
                INSERT INTO trades (position_id, symbol, direction, volume, open_time,
                                    open_price, sl, tp, close_time, close_price, profit,
                                    strategy, comment, status, source)
                VALUES (?, ?, ?, ?, ?, ?, 0.0, 0.0, ?, ?, ?, ?, ?, ?, 'mt5')
                ON CONFLICT(position_id) DO UPDATE SET
                    close_time=excluded.close_time,
                    close_price=excluded.close_price,
                    profit=excluded.profit,
                    status=excluded.status,
                    source='mt5'
                """,
                (pid, symbol, direction, volume, open_time, open_price,
                 close_time, close_price, profit, strategy, comment, status),
            )

    def _upsert_open_position(self, pos: dict) -> None:
        try:
            pid = int(pos.get("ticket", 0) or 0)
        except (TypeError, ValueError):
            return
        if pid <= 0:
            return
        comment = str(pos.get("comment", "") or "")
        self._conn.execute(
            """
            INSERT INTO trades (position_id, symbol, direction, volume, open_time,
                                open_price, sl, tp, close_time, close_price, profit,
                                strategy, comment, status, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, 'open', 'mt5')
            ON CONFLICT(position_id) DO UPDATE SET
                symbol=excluded.symbol,
                direction=excluded.direction,
                volume=excluded.volume,
                open_time=excluded.open_time,
                open_price=excluded.open_price,
                sl=excluded.sl,
                tp=excluded.tp,
                strategy=excluded.strategy,
                comment=excluded.comment,
                status='open',
                source='mt5'
            """,
            (
                pid,
                str(pos.get("symbol", "") or ""),
                str(pos.get("direction", "") or ""),
                self._to_float(pos.get("volume")),
                str(pos.get("time", "") or "") or None,
                self._to_float(pos.get("price_open")),
                self._to_float(pos.get("sl")),
                self._to_float(pos.get("tp")),
                self._strategy_from_comment(comment),
                comment,
            ),
        )

    # ------------------------------------------------------------------ #
    # paper execution
    # ------------------------------------------------------------------ #
    def _next_paper_ticket(self) -> int:
        row = self._conn.execute(
            "SELECT MIN(position_id) AS min_id FROM trades WHERE source = 'paper'"
        ).fetchone()
        try:
            current = int((row["min_id"] if row else 0) or 0)
        except (TypeError, ValueError):
            current = 0
        return current - 1 if current < 0 else -1

    def _paper_balance_unlocked(self, cfg: dict | None = None) -> float:
        row = self._conn.execute(
            "SELECT COALESCE(SUM(profit), 0.0) AS profit "
            "FROM trades WHERE source = 'paper' AND status = 'closed'"
        ).fetchone()
        return round(paper_balance(cfg) + self._to_float(row["profit"] if row else 0.0), 2)

    @staticmethod
    def _paper_close_price(direction: str, info: dict | None) -> float:
        if not info:
            return 0.0
        try:
            bid = float(info.get("bid") or 0.0)
            ask = float(info.get("ask") or 0.0)
        except (TypeError, ValueError):
            return 0.0
        return bid if str(direction).lower() == "buy" else ask

    def _paper_profit(
        self,
        row: dict | sqlite3.Row,
        info: dict | None,
        close_price: float | None = None,
    ) -> tuple[float, float]:
        direction = str(row["direction"] or "").lower()
        if close_price is None:
            close_price = self._paper_close_price(direction, info)
        try:
            close = float(close_price or 0.0)
            open_price = float(row["open_price"] or 0.0)
            volume = float(row["volume"] or 0.0)
        except (TypeError, ValueError):
            return 0.0, float(close_price or 0.0)
        if close <= 0 or open_price <= 0 or volume <= 0:
            return 0.0, close

        delta = close - open_price if direction == "buy" else open_price - close
        profit = 0.0
        if info:
            try:
                tick_value = float(info.get("trade_tick_value") or 0.0)
                tick_size = float(info.get("trade_tick_size") or 0.0)
            except (TypeError, ValueError):
                tick_value = 0.0
                tick_size = 0.0
            if tick_value > 0 and tick_size > 0:
                profit = delta / tick_size * tick_value * volume
            else:
                try:
                    contract_size = float(info.get("trade_contract_size") or 0.0)
                except (TypeError, ValueError):
                    contract_size = 0.0
                if contract_size > 0:
                    profit = delta * contract_size * volume
        return round(profit, 2), close

    def record_paper_open(
        self,
        symbol: str,
        direction: str,
        volume: float,
        open_price: float,
        sl: float,
        tp: float,
        comment: str,
        cfg: dict | None = None,
    ) -> int:
        """Insert a simulated open position and return its negative ticket."""
        with self._lock:
            ticket = self._next_paper_ticket()
            strategy = self._strategy_from_comment(comment)
            balance = self._paper_balance_unlocked(cfg)
            self._conn.execute(
                """
                INSERT INTO trades (position_id, symbol, direction, volume, open_time,
                                    open_price, sl, tp, close_time, close_price, profit,
                                    strategy, comment, status, source, open_balance,
                                    close_balance, mfe, mae, exit_reason)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL,
                        ?, ?, 'open', 'paper', ?, NULL, 0.0, 0.0, NULL)
                """,
                (
                    ticket,
                    str(symbol),
                    str(direction).lower(),
                    float(volume),
                    datetime.now().isoformat(timespec="seconds"),
                    float(open_price),
                    float(sl or 0.0),
                    float(tp or 0.0),
                    strategy,
                    str(comment),
                    balance,
                ),
            )
            self._conn.commit()
        return ticket

    def paper_positions(
        self,
        mt5c: "MT5Client" | None = None,
        symbol: str | None = None,
        strategy: str | None = None,
    ) -> list[dict]:
        query = "SELECT {} FROM trades WHERE source = 'paper' AND status = 'open'".format(
            ", ".join(_TRADE_COLUMNS)
        )
        params: list[Any] = []
        if symbol:
            query += " AND symbol = ?"
            params.append(symbol)
        if strategy:
            query += " AND strategy = ?"
            params.append(strategy)
        query += " ORDER BY open_time DESC, position_id DESC"
        with self._lock:
            rows = self._conn.execute(query, params).fetchall()

        out: list[dict] = []
        for row in rows:
            item = dict(row)
            info = None
            if mt5c is not None:
                try:
                    info = mt5c.symbol_info(str(item.get("symbol") or ""))
                except Exception:
                    info = None
            profit, current_price = self._paper_profit(row, info)
            item.update({
                "ticket": int(item["position_id"]),
                "profit": profit,
                "swap": 0.0,
                "magic": MAGIC_NUMBER,
                "time": item.get("open_time"),
                "price_open": item.get("open_price"),
                "price_current": current_price,
            })
            out.append(item)
        return out

    def close_paper_position(
        self,
        ticket: int,
        mt5c: "MT5Client" | None = None,
        close_price: float | None = None,
        reason: str = "manual",
        cfg: dict | None = None,
    ) -> dict:
        with self._lock:
            row = self._conn.execute(
                "SELECT {} FROM trades WHERE position_id = ? AND source = 'paper'".format(
                    ", ".join(_TRADE_COLUMNS)
                ),
                (int(ticket),),
            ).fetchone()
            if row is None:
                return {"ok": False, "message": f"Paper pozisyon bulunamadi: #{ticket}"}
            if str(row["status"]) != "open":
                return {"ok": False, "message": f"Paper pozisyon zaten kapali: #{ticket}"}

            info = None
            if mt5c is not None:
                try:
                    info = mt5c.symbol_info(str(row["symbol"] or ""))
                except Exception:
                    info = None
            profit, price = self._paper_profit(row, info, close_price)
            close_balance = round(self._paper_balance_unlocked(cfg) + profit, 2)
            self._conn.execute(
                """
                UPDATE trades
                   SET close_time = ?, close_price = ?, profit = ?, status = 'closed',
                       close_balance = ?, exit_reason = ?,
                       mfe = MAX(COALESCE(mfe, 0.0), ?),
                       mae = MIN(COALESCE(mae, 0.0), ?)
                 WHERE position_id = ? AND source = 'paper'
                """,
                (
                    datetime.now().isoformat(timespec="seconds"),
                    price,
                    profit,
                    close_balance,
                    str(reason or "manual"),
                    profit,
                    profit,
                    int(ticket),
                ),
            )
            self._conn.commit()
        return {
            "ok": True,
            "ticket": int(ticket),
            "profit": profit,
            "close_price": price,
            "message": f"Paper pozisyon kapatildi: #{ticket}, K/Z {profit:+.2f}",
        }

    def modify_paper_position(self, ticket: int, sl: float | None, tp: float | None) -> dict:
        with self._lock:
            row = self._conn.execute(
                "SELECT sl, tp FROM trades WHERE position_id = ? AND source = 'paper' AND status = 'open'",
                (int(ticket),),
            ).fetchone()
            if row is None:
                return {"ok": False, "message": f"Paper pozisyon bulunamadi: #{ticket}"}
            sl_val = float(row["sl"] or 0.0) if sl is None else float(sl)
            tp_val = float(row["tp"] or 0.0) if tp is None else float(tp)
            self._conn.execute(
                "UPDATE trades SET sl = ?, tp = ? WHERE position_id = ? AND source = 'paper'",
                (sl_val, tp_val, int(ticket)),
            )
            self._conn.commit()
        return {
            "ok": True,
            "ticket": int(ticket),
            "message": f"Paper pozisyon guncellendi: #{ticket}",
        }

    def close_all_paper(
        self,
        mt5c: "MT5Client" | None = None,
        symbol: str | None = None,
        reason: str = "manual",
        cfg: dict | None = None,
    ) -> dict:
        positions = self.paper_positions(mt5c=mt5c, symbol=symbol)
        closed = 0
        errors: list[str] = []
        for pos in positions:
            result = self.close_paper_position(
                int(pos["ticket"]), mt5c=mt5c, reason=reason, cfg=cfg
            )
            if result.get("ok"):
                closed += 1
            else:
                errors.append(result.get("message", f"#{pos['ticket']} kapatilamadi"))
        return {"ok": not errors, "closed": closed, "errors": errors}

    def update_paper_positions(
        self,
        mt5c: "MT5Client" | None,
        cfg: dict | None = None,
    ) -> None:
        """Refresh paper MFE/MAE and auto-close positions on SL/TP hits."""
        paper = (((cfg or {}).get("execution") or {}).get("paper") or {})
        auto_close = bool(paper.get("auto_close_sl_tp", True))
        positions = self.paper_positions(mt5c=mt5c)
        for pos in positions:
            ticket = int(pos["ticket"])
            profit = self._to_float(pos.get("profit"))
            with self._lock:
                self._conn.execute(
                    """
                    UPDATE trades
                       SET mfe = MAX(COALESCE(mfe, 0.0), ?),
                           mae = MIN(COALESCE(mae, 0.0), ?)
                     WHERE position_id = ? AND source = 'paper' AND status = 'open'
                    """,
                    (profit, profit, ticket),
                )
                self._conn.commit()
            if not auto_close:
                continue
            direction = str(pos.get("direction") or "").lower()
            current = self._to_float(pos.get("price_current"))
            # Geçersiz/eksik fiyat (symbol_info None, terminal açılışı, piyasa
            # kapalı → bid/ask=0) SL/TP kıyaslamasına sokulmaz: aksi halde BUY
            # için "0 <= sl" anında doğru olup tüm açık paper pozisyonlar 0
            # fiyattan sahte SL/TP ile kapanır (go-live kararını besleyen paper
            # istatistiğini bozar). Fiyat yoksa bu turda pozisyonu atla.
            if current <= 0:
                continue
            sl = self._to_float(pos.get("sl"))
            tp = self._to_float(pos.get("tp"))
            reason = ""
            if direction == "buy":
                if sl > 0 and current <= sl:
                    reason = "sl"
                elif tp > 0 and current >= tp:
                    reason = "tp"
            elif direction == "sell":
                if sl > 0 and current >= sl:
                    reason = "sl"
                elif tp > 0 and current <= tp:
                    reason = "tp"
            if reason:
                self.close_paper_position(
                    ticket, mt5c=mt5c, close_price=current,
                    reason=reason, cfg=cfg,
                )

    def paper_account(
        self,
        mt5c: "MT5Client" | None = None,
        cfg: dict | None = None,
    ) -> dict:
        with self._lock:
            balance = self._paper_balance_unlocked(cfg)
        floating = round(sum(self._to_float(p.get("profit")) for p in self.paper_positions(mt5c)), 2)
        return {
            "login": "PAPER",
            "server": "local-sim",
            "balance": balance,
            "equity": round(balance + floating, 2),
            "margin": 0.0,
            "margin_free": round(balance + floating, 2),
            "currency": paper_currency(cfg),
            "profit": floating,
            "leverage": 0,
            "trade_mode_label": "paper",
        }

    def paper_daily_pnl(self, mt5c: "MT5Client" | None = None) -> dict:
        midnight = datetime.combine(date.today(), time.min).isoformat(timespec="seconds")
        with self._lock:
            row = self._conn.execute(
                "SELECT COALESCE(SUM(profit), 0.0) AS profit "
                "FROM trades WHERE source = 'paper' AND status = 'closed' "
                "AND close_time >= ?",
                (midnight,),
            ).fetchone()
        closed = round(self._to_float(row["profit"] if row else 0.0), 2)
        floating = round(sum(self._to_float(p.get("profit")) for p in self.paper_positions(mt5c)), 2)
        return {"closed": closed, "floating": floating, "total": round(closed + floating, 2)}

    # ------------------------------------------------------------------ #
    # events
    # ------------------------------------------------------------------ #
    def record_event(self, kind: str, message: str) -> None:
        try:
            with self._lock:
                self._conn.execute(
                    "INSERT INTO events (time, kind, message) VALUES (?, ?, ?)",
                    (datetime.now().isoformat(timespec="seconds"), str(kind), str(message)),
                )
                self._conn.commit()
        except sqlite3.Error as exc:
            self._log.error("Olay kaydedilemedi: %s", exc)

    def events(self, limit: int = 100) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT id, time, kind, message FROM events ORDER BY id DESC LIMIT ?",
                (int(limit),),
            ).fetchall()
        return [dict(row) for row in rows]

    def close(self) -> None:
        """Close the SQLite connection, mainly for tests and clean shutdowns."""
        with self._lock:
            self._conn.close()

    # ------------------------------------------------------------------ #
    # trades
    # ------------------------------------------------------------------ #
    def trades(
        self,
        limit: int = 200,
        status: str | None = None,
        source: str | None = None,
    ) -> list[dict]:
        query = "SELECT {} FROM trades".format(", ".join(_TRADE_COLUMNS))
        params: list[Any] = []
        where: list[str] = []
        if status is not None:
            where.append("status = ?")
            params.append(status)
        if source is not None:
            where.append("source = ?")
            params.append(str(source))
        if where:
            query += " WHERE " + " AND ".join(where)
        query += " ORDER BY COALESCE(close_time, open_time) DESC, position_id DESC LIMIT ?"
        params.append(int(limit))
        with self._lock:
            rows = self._conn.execute(query, params).fetchall()
        return [dict(row) for row in rows]

    # ------------------------------------------------------------------ #
    # stats
    # ------------------------------------------------------------------ #
    @staticmethod
    def _mini_stats(profits: list[float]) -> dict:
        total = len(profits)
        wins = [p for p in profits if p > 0]
        losses = [p for p in profits if p < 0]
        gross_profit = sum(wins)
        gross_loss = abs(sum(losses))
        total_profit = sum(profits)
        avg_win = gross_profit / len(wins) if wins else 0.0
        avg_loss = gross_loss / len(losses) if losses else 0.0
        if gross_loss > 0:
            profit_factor = round(gross_profit / gross_loss, 2)
        else:
            profit_factor = 99.99 if gross_profit > 0 else 0.0

        equity = 0.0
        peak = 0.0
        max_drawdown = 0.0
        loss_streak = 0
        win_streak = 0
        max_loss_streak = 0
        max_win_streak = 0
        for profit in profits:
            equity += profit
            peak = max(peak, equity)
            max_drawdown = max(max_drawdown, peak - equity)
            if profit < 0:
                loss_streak += 1
                win_streak = 0
            elif profit > 0:
                win_streak += 1
                loss_streak = 0
            else:
                loss_streak = 0
                win_streak = 0
            max_loss_streak = max(max_loss_streak, loss_streak)
            max_win_streak = max(max_win_streak, win_streak)

        expectancy = total_profit / total if total else 0.0
        payoff_ratio = avg_win / avg_loss if avg_loss > 0 else (99.99 if avg_win > 0 else 0.0)
        profit_to_drawdown = (
            total_profit / max_drawdown if max_drawdown > 0
            else (99.99 if total_profit > 0 else 0.0)
        )
        sample_factor = min(total / 30.0, 1.0)
        pf_for_score = min(profit_factor, 3.0)
        pf_part = min(max((pf_for_score - 1.0) / 2.0, 0.0), 1.0) * 45.0
        expectancy_part = 20.0 if expectancy > 0 else 0.0
        drawdown_part = min(max(profit_to_drawdown / 3.0, 0.0), 1.0) * 20.0
        streak_part = max(0.0, 1.0 - (max_loss_streak / max(total, 1))) * 15.0
        quality_score = (pf_part + expectancy_part + drawdown_part + streak_part) * sample_factor
        return {
            "total": total,
            "wins": len(wins),
            "losses": len(losses),
            "win_rate": round(100.0 * len(wins) / total, 2) if total else 0.0,
            "total_profit": round(total_profit, 2),
            "avg_win": round(avg_win, 2),
            "avg_loss": round(avg_loss, 2),
            "profit_factor": profit_factor,
            "expectancy": round(expectancy, 2),
            "payoff_ratio": round(payoff_ratio, 2),
            "max_drawdown": round(max_drawdown, 2),
            "profit_to_drawdown": round(profit_to_drawdown, 2),
            "max_loss_streak": max_loss_streak,
            "max_win_streak": max_win_streak,
            "quality_score": round(max(0.0, min(100.0, quality_score)), 2),
        }

    def stats(self, source: str | None = None) -> dict:
        where = "WHERE status = 'closed'"
        params: list[Any] = []
        if source is not None:
            where += " AND source = ?"
            params.append(str(source))
        with self._lock:
            rows = self._conn.execute(
                "SELECT symbol, direction, strategy, open_time, profit "
                f"FROM trades {where} "
                "ORDER BY COALESCE(close_time, open_time) ASC, position_id ASC",
                params,
            ).fetchall()

        all_profits: list[float] = []
        by_symbol: dict[str, list[float]] = {}
        by_direction: dict[str, list[float]] = {}
        by_strategy: dict[str, list[float]] = {}
        by_hour: dict[int, dict] = {h: {"trades": 0, "profit": 0.0} for h in range(24)}

        for row in rows:
            profit = self._to_float(row["profit"])
            all_profits.append(profit)
            symbol = str(row["symbol"] or "unknown")
            direction = str(row["direction"] or "unknown")
            strategy = str(row["strategy"] or "unknown")
            by_symbol.setdefault(symbol, []).append(profit)
            by_direction.setdefault(direction, []).append(profit)
            by_strategy.setdefault(strategy, []).append(profit)
            open_time = row["open_time"]
            if open_time:
                try:
                    hour = datetime.fromisoformat(str(open_time)).hour
                except ValueError:
                    continue
                by_hour[hour]["trades"] += 1
                by_hour[hour]["profit"] = round(by_hour[hour]["profit"] + profit, 2)

        result = self._mini_stats(all_profits)
        result["source"] = source or "all"
        result["by_symbol"] = {k: self._mini_stats(v) for k, v in by_symbol.items()}
        result["by_direction"] = {k: self._mini_stats(v) for k, v in by_direction.items()}
        result["by_strategy"] = {k: self._mini_stats(v) for k, v in by_strategy.items()}
        result["by_hour"] = by_hour
        return result
