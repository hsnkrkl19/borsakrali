from __future__ import annotations

import json
import shutil
import threading
from datetime import datetime, timezone
from pathlib import Path

from core.config import MAGIC_NUMBER
from core.logger import get_logger
from research.runner import run_research
from strategies import registry


class ResearchService:
    """Background research plus audited approval/rollback; never sends orders."""

    def __init__(self, config, mt5c, journal, root: str = "data/research"):
        self.config = config
        self.mt5c = mt5c
        self.journal = journal
        self.root = Path(root)
        self.log = get_logger("research")
        self._lock = threading.RLock()
        self._stop = threading.Event()
        self._trigger = threading.Event()
        self._thread: threading.Thread | None = None
        self._state = {
            "running": False,
            "last_started": None,
            "last_finished": None,
            "last_error": None,
            "last_run_id": None,
        }

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._loop, name="research-service", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._trigger.set()
        if self._thread:
            self._thread.join(timeout=10)

    def trigger(self) -> dict:
        with self._lock:
            if self._state["running"]:
                return {"ok": False, "message": "Araştırma zaten çalışıyor", **self.status()}
        self._trigger.set()
        return {"ok": True, "message": "Araştırma sıraya alındı"}

    def status(self) -> dict:
        with self._lock:
            state = dict(self._state)
        latest = self.latest()
        state["latest_generated_at"] = latest.get("generated_at") if latest else None
        state["candidate_count"] = len(latest.get("candidates") or []) if latest else 0
        state["approved_candidate_count"] = sum(
            bool(row.get("gates", {}).get("all_pass")) for row in (latest.get("candidates") or [])
        ) if latest else 0
        return state

    def latest(self) -> dict:
        path = self.root / "latest.json"
        if not path.exists():
            return {}
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return {}

    def approve(self, symbol_key: str, strategy_name: str, reviewer: str) -> dict:
        reviewer = str(reviewer or "").strip()
        if not reviewer:
            raise ValueError("Onaylayan kişi zorunlu")
        latest = self.latest()
        candidate = next(
            (
                row for row in latest.get("candidates") or []
                if row.get("symbol_key") == symbol_key and row.get("strategy") == strategy_name
            ),
            None,
        )
        if candidate is None:
            raise ValueError("Challenger bulunamadı")
        if not candidate.get("gates", {}).get("all_pass", False):
            failed = [name for name, item in candidate.get("gates", {}).get("checks", {}).items() if not item.get("pass")]
            raise ValueError("Araştırma kapıları geçilmedi: " + ", ".join(failed))
        if candidate.get("execution_scope") != "mt5_demo_only":
            raise ValueError("Aday MT5 demo kapsamına sahip değil")
        registry.get(strategy_name)  # exact live implementation must exist
        if self.mt5c.positions(magic=MAGIC_NUMBER):
            raise ValueError("Açık bot pozisyonu varken champion değiştirilemez")

        champions = self.root / "champions"
        history = self.root / "history"
        champions.mkdir(parents=True, exist_ok=True)
        history.mkdir(parents=True, exist_ok=True)
        champion_path = champions / f"{symbol_key}.json"
        now = datetime.now(timezone.utc).isoformat()
        if champion_path.exists():
            shutil.copy2(champion_path, history / f"{symbol_key}-{now.replace(':', '')}.json")
        approved = dict(candidate)
        approved["kind"] = "mt5_demo_champion"
        approved["approval"] = {"reviewer": reviewer, "approved_at": now}
        pending_path = champion_path.with_suffix(".json.pending")
        pending_path.write_text(
            json.dumps(approved, indent=2, ensure_ascii=False), encoding="utf-8"
        )

        cfg = self.config.get()
        strategy_cfg = cfg.get("strategy") or {}
        verified = dict(strategy_cfg.get("verified_assignments") or {})
        assignments = dict(strategy_cfg.get("assignments") or {})
        params = dict(strategy_cfg.get("params") or {})
        verified[symbol_key] = [strategy_name]
        assignments[symbol_key] = [strategy_name]
        params[strategy_name] = candidate.get("params") or {}
        try:
            self.config.update({
                "strategy": {
                    "active": strategy_name,
                    "verified_assignments": verified,
                    "assignments": assignments,
                    "params": params,
                    "allow_unverified": False,
                }
            })
            pending_path.replace(champion_path)
        except Exception:
            pending_path.unlink(missing_ok=True)
            raise
        self.journal.record_event("approval", f"{symbol_key}/{strategy_name} MT5 DEMO champion onaylandı: {reviewer}")
        return {"ok": True, "champion": approved}

    def rollback(self, symbol_key: str, reviewer: str, reason: str) -> dict:
        if not str(reviewer or "").strip() or not str(reason or "").strip():
            raise ValueError("Onaylayan kişi ve rollback nedeni zorunlu")
        if self.mt5c.positions(magic=MAGIC_NUMBER):
            raise ValueError("Açık bot pozisyonu varken rollback yapılamaz")
        history = self.root / "history"
        versions = sorted(history.glob(f"{symbol_key}-*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
        if not versions:
            raise ValueError("Geri alınacak önceki champion yok")
        restored = json.loads(versions[0].read_text(encoding="utf-8"))
        strategy_name = str(restored["strategy"])
        registry.get(strategy_name)
        champion_path = self.root / "champions" / f"{symbol_key}.json"
        restored["rollback"] = {
            "reviewer": str(reviewer).strip(),
            "reason": str(reason).strip(),
            "restored_at": datetime.now(timezone.utc).isoformat(),
        }
        pending_path = champion_path.with_suffix(".json.pending")
        pending_path.write_text(
            json.dumps(restored, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        cfg = self.config.get()
        strategy_cfg = cfg.get("strategy") or {}
        verified = dict(strategy_cfg.get("verified_assignments") or {})
        assignments = dict(strategy_cfg.get("assignments") or {})
        params = dict(strategy_cfg.get("params") or {})
        verified[symbol_key] = [strategy_name]
        assignments[symbol_key] = [strategy_name]
        params[strategy_name] = restored.get("params") or {}
        try:
            self.config.update({"strategy": {"active": strategy_name, "verified_assignments": verified, "assignments": assignments, "params": params}})
            pending_path.replace(champion_path)
        except Exception:
            pending_path.unlink(missing_ok=True)
            raise
        self.journal.record_event("rollback", f"{symbol_key} champion geri alındı: {reviewer} — {reason}")
        return {"ok": True, "champion": restored}

    def _loop(self) -> None:
        cfg = self.config.get().get("research") or {}
        if bool(cfg.get("run_on_start", True)):
            self._trigger.set()
        while not self._stop.is_set():
            interval = max(1.0, float((self.config.get().get("research") or {}).get("interval_hours", 24) or 24)) * 3600
            fired = self._trigger.wait(timeout=interval)
            self._trigger.clear()
            if self._stop.is_set():
                return
            if not fired and not bool((self.config.get().get("research") or {}).get("enabled", True)):
                continue
            self._execute()

    def _execute(self) -> None:
        with self._lock:
            if self._state["running"]:
                return
            self._state.update({"running": True, "last_started": datetime.now(timezone.utc).isoformat(), "last_error": None})
        try:
            if not self.mt5c.ensure_connected():
                raise RuntimeError("MT5 bağlantısı kurulamadı")
            latest = run_research(self.mt5c, self.config, self.root)
            with self._lock:
                self._state["last_run_id"] = latest.get("run_id")
            self.journal.record_event("research", f"Walk-forward araştırma tamamlandı: {latest.get('run_id')}")
        except Exception as exc:
            self.log.exception("Araştırma servisi hatası: %s", exc)
            with self._lock:
                self._state["last_error"] = str(exc)
            try:
                self.journal.record_event("error", f"Araştırma servisi hatası: {exc}")
            except Exception:
                pass
        finally:
            with self._lock:
                self._state.update({"running": False, "last_finished": datetime.now(timezone.utc).isoformat()})
