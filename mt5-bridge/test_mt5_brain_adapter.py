import json
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import mt5_brain_adapter as adapter


class FakeMT5:
    POSITION_TYPE_BUY = 0
    POSITION_TYPE_SELL = 1
    TRADE_ACTION_DEAL = 1
    ORDER_TYPE_BUY = 0
    ORDER_TYPE_SELL = 1
    ORDER_TIME_GTC = 0
    ORDER_FILLING_IOC = 1
    ORDER_FILLING_FOK = 2
    ORDER_FILLING_RETURN = 3
    TRADE_RETCODE_DONE = 10009
    TRADE_RETCODE_DONE_PARTIAL = 10010

    def __init__(self, positions=()):
        self.positions = list(positions)
        self.sent = []

    def account_info(self):
        return SimpleNamespace(login=1, balance=10_000.0, equity=10_000.0,
                               server="FTMO-Demo", trade_allowed=True)

    def terminal_info(self):
        return SimpleNamespace(trade_allowed=True)

    def positions_get(self):
        return list(self.positions)

    def symbol_info(self, _symbol):
        return info()

    def symbol_info_tick(self, _symbol):
        return SimpleNamespace(bid=100.0, ask=100.1)

    def order_send(self, request):
        self.sent.append(dict(request))
        ticket = str(request.get("position", ""))
        self.positions = [p for p in self.positions if str(p.ticket) != ticket]
        return SimpleNamespace(retcode=self.TRADE_RETCODE_DONE, order=999)


def info():
    return SimpleNamespace(
        name="EURUSD", point=1.0, trade_tick_size=1.0,
        trade_tick_value_loss=100.0, trade_tick_value=100.0,
        trade_contract_size=100.0, volume_min=0.1, volume_step=0.1,
        volume_max=100.0,
    )


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.heartbeat = root / "heartbeat.json"
        self.state = root / "state.json"
        self.outbox = root / "broker-events.json"
        self.stop = root / "STOP_MASTER"
        self.live_heartbeat = root / "canonical-heartbeat.json"
        self.live_state = root / "canonical-state.json"
        self.live_outbox = root / "canonical-outbox.json"
        self.heartbeat.write_text(json.dumps({
            "ok": True, "timeSec": time.time(), "dryRun": True, "login": 1,
            "initialBalance": 10_000, "initialEquity": 10_000,
            "dayStartBalance": 10_000, "dayStartEquity": 10_000,
            "peakEquity": 10_000,
        }), encoding="utf-8")
        self.cfg = {
            "central_brain_enabled": True, "brain_required": True,
            "risk_fail_closed": True, "dry_run": True, "allowed_account": 1,
            "risk_profile": "balanced", "trade_risk_pct": 0.25,
            "min_rr": 2.0, "brain_heartbeat_path": str(self.heartbeat),
            "brain_state_path": str(self.state), "account_tier_max_lot": 1.0,
            "stop_master_path": str(self.stop),
            "broker_event_outbox_path": str(self.outbox),
        }

    def tearDown(self):
        self.tmp.cleanup()

    def evaluate(self, mt5=None, candidate="c1", **changes):
        values = dict(candidate_id=candidate, bot_id="550055", symbol="EURUSD",
                      direction="long", timeframe="M15", entry=100.0,
                      stop=99.0, target=102.0, confidence=90, confirmations=1)
        values.update(changes)
        return adapter.evaluate(mt5 or FakeMT5(), self.cfg, info(), **values)

    def test_legacy_unsafe_values_are_bounded(self):
        cfg = adapter.build_config({
            "risk_profile": "balanced", "risk_pct_max": 1.0,
            "max_portfolio_risk_pct": 8, "max_symbol_side_risk_pct": 3,
            "max_bot_risk_pct": 4, "min_rr": 0.7,
        })
        self.assertEqual(cfg.trade_risk_pct, 0.25)
        self.assertEqual(cfg.max_portfolio_risk_pct, 2.0)
        self.assertEqual(cfg.max_symbol_side_risk_pct, 0.5)
        self.assertEqual(cfg.max_bot_risk_pct, 0.5)
        # Legacy min_rr below the user's 1:3 floor is lifted, never honored.
        self.assertEqual(cfg.min_rr, 3.0)

    def test_adverse_stop_with_zero_broker_risk_metadata_is_unbounded(self):
        position = SimpleNamespace(
            ticket=1, symbol="EURUSD", type=0, volume=.1,
            price_open=100.0, sl=99.0)
        broker = FakeMT5([position])
        broker.order_calc_profit = lambda *_args: 0.0
        broker.symbol_info = lambda _symbol: SimpleNamespace(
            trade_tick_value_loss=0, trade_tick_value=0, trade_tick_size=0,
            point=0, trade_contract_size=0)
        self.assertEqual(adapter._position_risk(broker, position, 10_000), 10_000)

    def test_fresh_matching_brain_allows_and_reserves_safe_lot(self):
        plan = self.evaluate()
        self.assertTrue(plan.allowed, plan.decision.reasons)
        self.assertEqual(plan.lot, 0.2)
        self.assertAlmostEqual(plan.decision.risk_usd, 20.0)
        self.assertTrue(adapter.finalize(plan, False))

    def test_three_bot_consensus_gets_higher_band_risk_without_cap_exemption(self):
        ordinary = self.evaluate(candidate="ordinary", confidence=50, confirmations=1)
        self.assertFalse(ordinary.allowed)  # 0.175% rounds to $10, below $15 floor
        consensus = self.evaluate(candidate="consensus", confidence=50, confirmations=3)
        self.assertTrue(consensus.allowed, consensus.decision.reasons)
        self.assertAlmostEqual(consensus.decision.risk_usd, 20.0)
        self.assertLessEqual(consensus.decision.projected["symbol_side_risk_pct"], 0.5)
        adapter.finalize(consensus, False)

    def test_stale_or_dryrun_mismatch_is_fail_closed(self):
        self.heartbeat.write_text(json.dumps({
            "ok": True, "timeSec": time.time() - 100, "dryRun": True, "login": 1,
        }), encoding="utf-8")
        stale = self.evaluate(candidate="stale")
        self.assertFalse(stale.allowed)
        self.assertIn("heartbeat_stale", stale.decision.reasons[0])
        self.heartbeat.write_text(json.dumps({
            "ok": True, "timeSec": time.time(), "dryRun": False, "login": 1,
        }), encoding="utf-8")
        mismatch = self.evaluate(candidate="mismatch")
        self.assertFalse(mismatch.allowed)
        self.assertIn("dry_run_mismatch", mismatch.decision.reasons[0])

    def test_live_lifecycle_ttl_is_separate_from_heartbeat_liveness(self):
        now = time.time()
        live_cfg = dict(
            self.cfg, dry_run=False, backend_url="https://example.test",
            exec_token="secret", account_server="FTMO-Demo",
            lifecycle_report_max_age_seconds=30)
        heartbeat = {
            "ok": True, "timeSec": now, "dryRun": False, "login": 1,
            "server": "FTMO-Demo", "lastReportSuccessSec": now - 20,
            "initialEquity": 10_000, "dayStartEquity": 10_000,
            "peakEquity": 10_000,
        }
        self.live_heartbeat.write_text(
            json.dumps(heartbeat), encoding="utf-8")
        ready = SimpleNamespace(status_code=200, json=lambda: {"ready": True})
        mt5 = FakeMT5()
        with patch.object(adapter, "HEARTBEAT_PATH", str(self.live_heartbeat)), \
                patch.object(adapter, "STATE_PATH", str(self.live_state)), \
                patch.object(adapter, "EVENT_OUTBOX_PATH", str(self.live_outbox)), \
                patch.object(adapter, "STOP_MASTER", str(self.stop)), \
                patch.object(adapter.requests, "get", return_value=ready), \
                patch.object(adapter.requests, "post",
                             return_value=SimpleNamespace(status_code=200)):
            plan = adapter.evaluate(
                mt5, live_cfg, info(), candidate_id="separate-lifecycle-ttl",
                bot_id="550055", symbol="EURUSD", direction="long",
                timeframe="M15", entry=100.0, stop=99.0, target=102.0,
                confidence=90, confirmations=1)
            self.assertTrue(plan.allowed, plan.decision.reasons)
            # A 20-second lifecycle age is valid even though process heartbeat
            # liveness remains capped at 10 seconds.
            self.assertTrue(adapter.pre_send_check(mt5, live_cfg, plan))

            heartbeat["timeSec"] = time.time()
            heartbeat["lastReportSuccessSec"] = time.time() - 31
            self.live_heartbeat.write_text(
                json.dumps(heartbeat), encoding="utf-8")
            self.assertFalse(adapter.pre_send_check(mt5, live_cfg, plan))
            self.assertTrue(adapter.finalize(plan, False))

    def test_reentry_cooldown_blocks_same_direction_only(self):
        self.heartbeat.write_text(json.dumps({
            "ok": True, "timeSec": time.time(), "dryRun": True, "login": 1,
            "initialBalance": 10_000, "initialEquity": 10_000,
            "dayStartBalance": 10_000, "dayStartEquity": 10_000,
            "peakEquity": 10_000,
            "reentryCooldowns": {
                "EURUSD": {"untilSec": int(time.time()) + 600,
                           "direction": "long"},
            },
        }), encoding="utf-8")
        blocked = self.evaluate(candidate="cooldown-long")
        self.assertFalse(blocked.allowed)
        self.assertIn("reentry_cooldown_active", blocked.decision.reasons[0])
        # Ters yon serbest: gercek donusler sogumaya takilmaz.
        allowed = self.evaluate(candidate="cooldown-short", direction="short",
                                entry=100.0, stop=101.0, target=98.0)
        self.assertTrue(allowed.allowed, allowed.decision.reasons)
        adapter.finalize(allowed, False)

    def test_atomic_reversal_closes_exact_ticket_and_verifies(self):
        position = SimpleNamespace(
            ticket=77, symbol="EURUSD", magic=550055, type=0, volume=0.2,
            price_open=100.0, price_current=100.0, sl=99.0,
        )
        mt5 = FakeMT5([position])
        live_cfg = dict(self.cfg, dry_run=False,
                        backend_url="https://example.test", exec_token="secret")
        self.live_heartbeat.write_text(json.dumps({
            "ok": True, "timeSec": time.time(), "dryRun": False, "login": 1,
            "server": "FTMO-Demo", "lastReportSuccessSec": time.time(),
            "initialEquity": 10_000, "dayStartEquity": 10_000,
            "peakEquity": 10_000,
        }), encoding="utf-8")
        ready = SimpleNamespace(status_code=200, json=lambda: {"ready": True})
        with patch.object(adapter, "HEARTBEAT_PATH", str(self.live_heartbeat)), \
                patch.object(adapter, "STATE_PATH", str(self.live_state)), \
                patch.object(adapter, "EVENT_OUTBOX_PATH", str(self.live_outbox)), \
                patch.object(adapter, "STOP_MASTER", str(self.stop)), \
                patch.object(adapter.requests, "get", return_value=ready), \
                patch.object(adapter.requests, "post",
                             return_value=SimpleNamespace(status_code=200)):
            plan = adapter.evaluate(
                mt5, live_cfg, info(), candidate_id="atomic-reversal",
                bot_id="550055", symbol="EURUSD", direction="short",
                timeframe="M15", entry=100.0, stop=101.0, target=98.0,
                confidence=100, confirmations=2)
            self.assertTrue(plan.allowed, plan.decision.reasons)
            self.assertEqual(plan.decision.close_tickets, ("77",))
            self.assertTrue(adapter.close_for_reversal(
                mt5, live_cfg, plan.decision.close_tickets, plan=plan))
            self.assertTrue(adapter.finalize(plan, False))
        self.assertEqual(mt5.sent[0]["position"], 77)
        self.assertFalse(mt5.positions)

    def test_reversal_notification_dependency_uses_stable_identifier(self):
        position = SimpleNamespace(
            ticket=77, identifier=7007, symbol="EURUSD", magic=550055,
            type=0, volume=0.2, price_open=100.0, price_current=100.0, sl=99.0)
        plan = self.evaluate(
            mt5=FakeMT5([position]), candidate="stable-reversal",
            direction="short", entry=100.0, stop=101.0, target=98.0,
            confidence=100, confirmations=2)
        self.assertTrue(plan.allowed, plan.decision.reasons)
        self.assertEqual(plan.decision.close_tickets, ("77",))
        self.assertEqual(plan.metadata["close_before_open_tickets"], ["7007"])
        self.assertTrue(adapter.finalize(plan, False))

    def test_persistent_stop_blocks_reserve_and_the_immediate_send_gate(self):
        self.stop.write_text("stopped", encoding="utf-8")
        blocked = self.evaluate(candidate="stopped")
        self.assertFalse(blocked.allowed)
        self.assertIn("stop_master_active", blocked.decision.reasons[0])

        self.stop.unlink()
        plan = self.evaluate(candidate="stop-after-reserve")
        self.assertTrue(plan.allowed, plan.decision.reasons)
        self.stop.write_text("stopped", encoding="utf-8")
        self.assertFalse(adapter.pre_send_check(FakeMT5(), self.cfg, plan))
        self.assertTrue(adapter.finalize(plan, False))

    def test_stop_created_during_outbox_flush_is_rechecked_before_send(self):
        plan = self.evaluate(candidate="stop-during-flush")
        self.assertTrue(plan.allowed, plan.decision.reasons)

        def flush_then_ready(_cfg, logger=None):
            self.stop.write_text("manual-stop", encoding="utf-8")
            return True, 0

        with patch.object(adapter, "STOP_MASTER", str(self.stop)), \
                patch.object(adapter, "_broker_event_outbox_ready",
                             side_effect=flush_then_ready):
            self.assertFalse(adapter.pre_send_check(FakeMT5(), self.cfg, plan))
        self.assertTrue(adapter.finalize(plan, False))

    def test_reversal_never_treats_a_reservation_as_a_broker_ticket(self):
        self.assertFalse(adapter.close_for_reversal(
            FakeMT5(), self.cfg, ("reservation:other-candidate",)))

    def test_released_execution_lease_blocks_order_send(self):
        plan = self.evaluate(candidate="released-before-send")
        self.assertTrue(plan.allowed, plan.decision.reasons)
        self.assertTrue(adapter.finalize(plan, False))
        self.assertFalse(adapter.pre_send_check(FakeMT5(), self.cfg, plan))

    def test_live_config_cannot_disable_central_brain(self):
        live_cfg = dict(
            self.cfg, dry_run=False, central_brain_enabled=False,
            backend_url="https://example.test", exec_token="secret")
        self.heartbeat.write_text(json.dumps({
            "ok": True, "timeSec": time.time(), "dryRun": False, "login": 1,
            "server": "FTMO-Demo", "lastReportSuccessSec": time.time(),
            "initialEquity": 10_000, "dayStartEquity": 10_000,
            "peakEquity": 10_000,
        }), encoding="utf-8")
        self.assertTrue(adapter.enabled(live_cfg))
        self.live_heartbeat.write_text(self.heartbeat.read_text(encoding="utf-8"),
                                       encoding="utf-8")
        with patch.object(adapter, "HEARTBEAT_PATH", str(self.live_heartbeat)), \
                patch.object(adapter, "STATE_PATH", str(self.live_state)), \
                patch.object(adapter, "EVENT_OUTBOX_PATH", str(self.live_outbox)), \
                patch.object(adapter, "STOP_MASTER", str(self.stop)):
            plan = adapter.evaluate(
                FakeMT5(), live_cfg, info(), candidate_id="live-cannot-bypass",
                bot_id="550055", symbol="EURUSD", direction="long",
                timeframe="M15", entry=100.0, stop=99.0, target=102.0,
                confidence=90, confirmations=1)
            self.assertTrue(plan.allowed, plan.decision.reasons)
            with patch.object(adapter.requests, "post",
                              return_value=SimpleNamespace(status_code=200)):
                self.assertTrue(adapter.finalize(plan, False))

    def test_live_runtime_paths_ignore_config_overrides(self):
        live_cfg = dict(
            self.cfg, dry_run=False, backend_url="https://example.test",
            exec_token="secret")
        with patch.object(adapter, "HEARTBEAT_PATH", str(self.live_heartbeat)), \
                patch.object(adapter, "STATE_PATH", str(self.live_state)), \
                patch.object(adapter, "EVENT_OUTBOX_PATH", str(self.live_outbox)), \
                patch.object(adapter, "STOP_MASTER", str(self.stop)):
            plan = adapter.evaluate(
                FakeMT5(), live_cfg, info(), candidate_id="ignore-split-brain-path",
                bot_id="550055", symbol="EURUSD", direction="long",
                timeframe="M15", entry=100.0, stop=99.0, target=102.0,
                confidence=90, confirmations=1)
        self.assertFalse(plan.allowed)
        self.assertIn("heartbeat_stale", plan.decision.reasons[0])

    def test_falsy_or_malformed_dry_run_cannot_unlock_legacy_live_path(self):
        for value in (False, 0, None, ""):
            with self.subTest(dry_run=value):
                self.assertTrue(adapter.enabled({
                    "central_brain_enabled": False, "dry_run": value,
                }))
        # Literal true is the only paper value allowed to disable the brain.
        self.assertFalse(adapter.enabled({
            "central_brain_enabled": False, "dry_run": True,
        }))

    @patch.object(adapter.requests, "post")
    def test_acceptance_is_reported_only_after_broker_confirmation(self, post):
        post.return_value = SimpleNamespace(status_code=200)
        self.cfg.update({"backend_url": "https://example.test", "exec_token": "secret"})
        plan = self.evaluate(candidate="broker-confirmed", code="SIG-42")
        self.assertTrue(plan.allowed, plan.decision.reasons)
        post.assert_not_called()

        self.assertTrue(adapter.finalize(
            plan, True, ticket=9876, fill_price=100.15, filled_volume=0.2))
        body = post.call_args.kwargs["json"]
        decision = body["decisions"][0]
        opened = body["open"][0]
        self.assertTrue(decision["accepted"])
        self.assertEqual(decision["code"], "SIG-42")
        self.assertEqual(decision["ticket"], "9876")
        self.assertEqual(opened["positionTicket"], "9876")
        self.assertEqual(opened["entryPrice"], 100.15)
        self.assertEqual(opened["lot"], 0.2)
        self.assertEqual(opened["account"], 1)
        self.assertEqual(opened["accountLogin"], 1)
        self.assertEqual(adapter.broker_event_outbox_count(self.cfg), 0)

    def test_corrupt_broker_outbox_blocks_live_and_latches_close_only(self):
        self.outbox.write_text("{broken", encoding="utf-8")
        live_cfg = dict(
            self.cfg, dry_run=False, backend_url="https://example.test",
            exec_token="secret")
        self.heartbeat.write_text(json.dumps({
            "ok": True, "timeSec": time.time(), "dryRun": False, "login": 1,
            "lastReportSuccessSec": time.time(),
            "initialEquity": 10_000, "dayStartEquity": 10_000,
            "peakEquity": 10_000,
        }), encoding="utf-8")
        with patch.object(adapter, "STOP_MASTER", str(self.stop)), \
                patch.object(adapter, "HEARTBEAT_PATH", str(self.heartbeat)), \
                patch.object(adapter, "STATE_PATH", str(self.state)), \
                patch.object(adapter, "EVENT_OUTBOX_PATH", str(self.outbox)):
            plan = adapter.evaluate(
                FakeMT5(), live_cfg, info(), candidate_id="corrupt-outbox",
                bot_id="550055", symbol="EURUSD", direction="long",
                timeframe="M15", entry=100.0, stop=99.0, target=102.0,
                confidence=90, confirmations=1)
        self.assertFalse(plan.allowed)
        self.assertIn("broker_event_outbox_unreadable", plan.decision.reasons[0])
        stop = json.loads(self.stop.read_text(encoding="utf-8"))
        self.assertTrue(stop["closeOnly"] and stop["emergencyFlatten"])

    @patch.object(adapter.requests, "post")
    def test_broker_fill_commit_failure_is_reported_then_latches_stop(self, post):
        post.return_value = SimpleNamespace(status_code=200)
        self.cfg.update({"backend_url": "https://example.test", "exec_token": "secret"})
        plan = self.evaluate(candidate="commit-failure", code="SIG-COMMIT")
        self.assertTrue(plan.allowed)
        with patch.object(plan.controller, "commit_reservation", return_value=False), \
                patch.object(adapter, "STOP_MASTER", str(self.stop)):
            self.assertFalse(adapter.finalize(
                plan, True, ticket=555, fill_price=100.1, filled_volume=.2))
        self.assertEqual(adapter.broker_event_outbox_count(self.cfg), 0)
        stop = json.loads(self.stop.read_text(encoding="utf-8"))
        self.assertIn("reservation-commit-failed", stop["reason"])

    @patch.object(adapter.requests, "post")
    def test_broker_open_survives_backend_outage_and_retries(self, post):
        post.return_value = SimpleNamespace(status_code=503)
        self.cfg.update({"backend_url": "https://example.test", "exec_token": "secret"})
        plan = self.evaluate(candidate="durable-open", code="SIG-DURABLE")
        self.assertTrue(plan.allowed, plan.decision.reasons)
        self.assertTrue(adapter.finalize(
            plan, True, ticket=444, fill_price=100.2, filled_volume=0.1))
        self.assertEqual(adapter.broker_event_outbox_count(self.cfg), 1)

        post.return_value = SimpleNamespace(status_code=200)
        self.assertTrue(adapter.flush_broker_event_outbox(self.cfg))
        self.assertEqual(adapter.broker_event_outbox_count(self.cfg), 0)
        retried = post.call_args.kwargs["json"]
        self.assertEqual(retried["open"][0]["ticket"], "444")

    @patch.object(adapter.requests, "post")
    def test_central_rejection_is_audit_only_and_reported_immediately(self, post):
        post.return_value = SimpleNamespace(status_code=200)
        self.cfg.update({"backend_url": "https://example.test", "exec_token": "secret"})
        self.heartbeat.write_text(json.dumps({
            "ok": True, "timeSec": time.time() - 100, "dryRun": True, "login": 1,
        }), encoding="utf-8")
        plan = self.evaluate(candidate="rejected", code="SIG-RED")
        self.assertFalse(plan.allowed)
        payload = post.call_args.kwargs["json"]["decisions"][0]
        self.assertFalse(payload["accepted"])
        self.assertEqual(payload["code"], "SIG-RED")
        self.assertIn("heartbeat_stale", payload["reason"])


if __name__ == "__main__":
    unittest.main()
