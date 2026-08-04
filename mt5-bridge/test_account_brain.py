import json
import tempfile
import time
import unittest
from pathlib import Path

from account_brain import (
    AccountBrain,
    AccountSnapshot,
    BrainConfig,
    DecisionAction,
    JsonStateStore,
    OpenRisk,
    RuntimeState,
    SymbolSpec,
    TradeRequest,
    evaluate_pretrade,
    heartbeat_ok,
    canonical_underlying,
    select_account_tier,
)


NOW = 1_800_000_000.0


def snapshot(**changes):
    values = dict(balance=10_000, equity=10_000, start_balance=10_000,
                  day_start_equity=10_000, high_water_equity=10_000,
                  as_of=NOW)
    values.update(changes)
    return AccountSnapshot(**values)


def request(**changes):
    values = dict(candidate_id="c1", bot_id="bot-a", symbol="EURUSD",
                  direction="buy", timeframe="M15", entry=100, stop=99,
                  target=102, signal_strength=0.9, confirmations=2,
                  now_ts=NOW)
    values.update(changes)
    return TradeRequest(**values)


SPEC = SymbolSpec(tick_size=1, tick_value=100, volume_min=0.1,
                  volume_step=0.1, volume_max=10)


class ConfigAndTierTests(unittest.TestCase):
    def test_tier_is_nearest_and_midpoint_goes_up(self):
        self.assertEqual(select_account_tier(10_100), 10_000)
        self.assertEqual(select_account_tier(37_500), 50_000)
        self.assertEqual(select_account_tier(400_000), 200_000)

    def test_profiles_are_bounded_and_aggressive_is_opt_in(self):
        self.assertEqual(BrainConfig().trade_risk_pct, 0.25)
        with self.assertRaises(ValueError):
            BrainConfig(risk_profile="aggressive")
        cfg = BrainConfig(risk_profile="aggressive", aggressive_opt_in=True,
                          trade_risk_pct=1.0)
        self.assertEqual(cfg.trade_risk_pct, 1.0)
        with self.assertRaises(ValueError):
            BrainConfig(min_rr=1.5)

    def test_broker_suffixes_share_one_underlying(self):
        self.assertEqual(canonical_underlying("EURUSDm"), "EURUSD")
        self.assertEqual(canonical_underlying("XAUUSD.raw"), "XAUUSD")
        self.assertEqual(canonical_underlying("GOLDmicro"), "XAUUSD")


class PureDecisionTests(unittest.TestCase):
    def test_happy_path_sizes_down_and_reports_projected_candidate(self):
        result = evaluate_pretrade(snapshot(), (), request(), SPEC, BrainConfig())
        self.assertTrue(result.allowed)
        self.assertEqual(result.action, DecisionAction.ALLOW)
        self.assertAlmostEqual(result.lot, 0.2)
        self.assertAlmostEqual(result.risk_usd, 20)
        # strength 0.9 >= extreme threshold -> the 102 feed target extends to 5R.
        self.assertAlmostEqual(result.target, 105.0)
        self.assertAlmostEqual(result.target_r, 5.0)
        self.assertAlmostEqual(result.reward_usd, 100)
        self.assertAlmostEqual(result.rr, 5.0)
        self.assertAlmostEqual(result.projected["account_open_risk_pct"], 0.2)

    def test_score_based_target_tiers_and_far_target_kept(self):
        weak = evaluate_pretrade(snapshot(), (),
                                 request(signal_strength=0.5), SPEC, BrainConfig())
        self.assertAlmostEqual(weak.target, 103.0)
        self.assertAlmostEqual(weak.rr, 3.0)
        strong = evaluate_pretrade(snapshot(), (),
                                   request(signal_strength=0.8), SPEC, BrainConfig())
        self.assertAlmostEqual(strong.target, 104.0)
        extreme = evaluate_pretrade(snapshot(), (),
                                    request(signal_strength=0.95), SPEC, BrainConfig())
        self.assertAlmostEqual(extreme.target, 105.0)
        far = evaluate_pretrade(snapshot(), (),
                                request(signal_strength=0.5, target=108), SPEC,
                                BrainConfig())
        self.assertAlmostEqual(far.target, 108.0)
        self.assertAlmostEqual(far.rr, 8.0)
        sell = evaluate_pretrade(
            snapshot(), (),
            request(direction="sell", entry=100, stop=101, target=98.0,
                    signal_strength=0.5),
            SPEC, BrainConfig())
        self.assertAlmostEqual(sell.target, 97.0)
        self.assertAlmostEqual(sell.rr, 3.0)

    def test_race_mode_lifts_entry_caps_but_keeps_account_brakes(self):
        cfg = BrainConfig(race_mode=True)
        opened = (OpenRisk("1", "bot-a", "EURUSD", "buy", "M15", 40, 0.5),
                  OpenRisk("2", "bot-b", "EURUSD", "buy", "H1", 40, 0.5))
        # Ayni underlying'de UCUNCU ayni-yon pozisyon + bot-a tavani asilirken
        # bile giris serbest (yaris: her bot islem alir).
        third = evaluate_pretrade(snapshot(), opened, request(), SPEC, cfg)
        self.assertTrue(third.allowed, third.reasons)
        self.assertEqual(third.action, DecisionAction.ALLOW)
        self.assertEqual(third.close_tickets, ())
        # Hedge de serbest: ters yon kapat-ve-dondur istemez.
        hedge = evaluate_pretrade(
            snapshot(), opened,
            request(direction="sell", entry=100, stop=101, target=98,
                    signal_strength=0.5),
            SPEC, cfg)
        self.assertTrue(hedge.allowed, hedge.reasons)
        self.assertEqual(hedge.action, DecisionAction.ALLOW)
        # Kar kontrolu KALIR: gunluk fren yaristayken de yeni girisi keser.
        brake = evaluate_pretrade(snapshot(equity=9_850), (), request(), SPEC, cfg)
        self.assertFalse(brake.allowed)
        self.assertIn("daily_entry_brake_block_new", brake.reasons)
        # $15 tabani ve 3R hedef politikasi da yarista aynen gecerli.
        self.assertGreaterEqual(third.risk_usd, 15.0)
        self.assertGreaterEqual(third.rr, 3.0)



    def test_d2g_regime_halves_new_entry_risk_after_daily_loss(self):
        """D2g: kotu bir gunde ayni boyutta israr etmek cukuru derinlestirir.

        Esik asilinca YENI girislerin riski yariya iner. Bu bir FREN degil
        KISICI'dir: acik pozisyonlara dokunmaz, mutlak %4,5 gunluk fren ve
        %1,5 giris freni aynen yerinde kalir.
        """
        cfg = BrainConfig(race_mode=True, max_trade_risk_usd=250.0)
        # Gercek hesap olcegi (FTMO ~197k): kucuk sentetik hesapta yarilanan
        # butce $15 tabanina takilir ve test rejimi degil tabani olcerdi.
        buyuk = dict(balance=200_000, equity=200_000, start_balance=200_000,
                     day_start_equity=200_000, high_water_equity=200_000)
        ince = SymbolSpec(tick_size=1, tick_value=1, volume_min=0.1,
                          volume_step=0.1, volume_max=1000)

        normal = evaluate_pretrade(snapshot(**buyuk), (), request(), ince, cfg)
        self.assertTrue(normal.allowed, normal.reasons)
        self.assertEqual(normal.projected["risk_scale"], 1.0)
        self.assertAlmostEqual(normal.risk_usd, 250.0, places=6)   # dolar tavani

        # Gun ici -%1,0 (esik 0,75) -> kisici aktif, giris HALA serbest.
        kisik = evaluate_pretrade(
            snapshot(**dict(buyuk, equity=198_000)), (), request(), ince, cfg)
        self.assertTrue(kisik.allowed, kisik.reasons)
        self.assertEqual(kisik.projected["risk_scale"], 0.5)
        self.assertAlmostEqual(kisik.risk_usd, 125.0, places=6)    # 250 -> 125

        # Mutlak giris freni (%1,5) hala TAM olarak devrede — kisici onu
        # yumusatmaz.
        fren = evaluate_pretrade(
            snapshot(**dict(buyuk, equity=196_800)), (), request(), ince, cfg)
        self.assertFalse(fren.allowed)
        self.assertIn("daily_entry_brake_block_new", fren.reasons)

    def test_d2g_threshold_must_precede_the_entry_brake(self):
        """Kisici, giris freninden SONRA devreye girerse hicbir ise yaramaz:
        o noktada zaten hicbir yeni giris yoktur."""
        with self.assertRaises(ValueError):
            BrainConfig(risk_halving_daily_loss_pct=1.5)   # == daily_entry_brake_pct
        with self.assertRaises(ValueError):
            BrainConfig(risk_halving_daily_loss_pct=0.0)
        with self.assertRaises(ValueError):
            BrainConfig(risk_halving_factor=1.0)

    def test_race_mode_still_caps_total_open_risk(self):
        """B3: yaris giris SAYISINI serbest birakir, toplam hesap riskini degil.

        2026-07-31: 20+ pozisyon neredeyse tamami ayni yondeydi; piyasa
        donunce hepsi birden kaybetti. Tavan bunu yapisal olarak onler.
        """
        cfg = BrainConfig(race_mode=True)          # tavan %3
        # 10k equity -> %3 = 300 $ toplam acik risk butcesi.
        # 290 $ dolu: kalan 10 $ < 15 $ tabani -> yeni giris ACILMAZ.
        dolu = tuple(
            OpenRisk(str(i), "bot-%d" % i, "SYM%d" % i, "buy", "M15", 29.0, 0.5)
            for i in range(10))
        red = evaluate_pretrade(snapshot(), dolu, request(), SPEC, cfg)
        self.assertFalse(red.allowed, red.reasons)
        # 100 $ dolu -> 200 $ yer var, giris SERBEST (yaris bozulmaz).
        az = tuple(
            OpenRisk(str(i), "bot-%d" % i, "SYM%d" % i, "buy", "M15", 25.0, 0.5)
            for i in range(4))
        kabul = evaluate_pretrade(snapshot(), az, request(), SPEC, cfg)
        self.assertTrue(kabul.allowed, kabul.reasons)
        self.assertLessEqual(kabul.projected["account_open_risk_pct"], 3.0 + 1e-9)
        # 2026-08-05 kullanici karari ("islem ve risk limitini kaldir"):
        # tavan artik (0, 100] araliginda serbestce ayarlanir; %100 = tavan yok.
        # VARSAYILAN yine %3'tur — yani tavani kaldirmak BILINCLI bir config
        # adimidir, kazara olmaz.
        assert BrainConfig(race_mode=True).race_max_open_risk_pct == 3.0
        BrainConfig(race_mode=True, race_max_open_risk_pct=100.0)   # gecerli
        with self.assertRaises(ValueError):
            BrainConfig(race_mode=True, race_max_open_risk_pct=0)
        with self.assertRaises(ValueError):
            BrainConfig(race_mode=True, race_max_open_risk_pct=101)

    def test_absolute_usd_cap_binds_on_large_accounts(self):
        """B1: yuzde ne derse desin islem basi risk 250 $'i asamaz."""
        # 197k hesap, %0.25 -> 492,5 $ isterdi; tavan 250 $'a kirpar.
        big = snapshot(balance=197_000, equity=197_000, start_balance=197_000,
                       day_start_equity=197_000, high_water_equity=197_000)
        # tick_value 100, stop 1 birim -> 1 lot = 100 $ risk.
        spec = SymbolSpec(tick_size=1, tick_value=100, volume_min=0.01,
                          volume_step=0.01, volume_max=10)
        capped = evaluate_pretrade(big, (), request(), spec, BrainConfig())
        self.assertTrue(capped.allowed, capped.reasons)
        self.assertLessEqual(capped.risk_usd, 250.0 + 1e-9)
        self.assertAlmostEqual(capped.lot, 2.5)          # 250/100
        # Tavan dusurulebilir, yukseltilemez.
        low = evaluate_pretrade(big, (), request(), spec,
                                BrainConfig(max_trade_risk_usd=60))
        self.assertAlmostEqual(low.lot, 0.6)
        with self.assertRaises(ValueError):
            BrainConfig(max_trade_risk_usd=10)           # $15 tabaninin altinda
        with self.assertRaises(ValueError):
            BrainConfig(max_trade_risk_usd=0)

    def test_usd_cap_equalises_dollar_risk_across_instruments(self):
        """B2 ozu: 1 lot altin ile 1 lot EURUSD ayni dolar riskini tasir."""
        big = snapshot(balance=197_000, equity=197_000, start_balance=197_000,
                       day_start_equity=197_000, high_water_equity=197_000)
        # ALTIN benzeri: 1 lot = 1000 $ risk (genis stop)
        altin = SymbolSpec(tick_size=1, tick_value=1000, volume_min=0.01,
                           volume_step=0.01, volume_max=10)
        # FOREX benzeri: 1 lot = 200 $ risk (dar stop)
        forex = SymbolSpec(tick_size=1, tick_value=200, volume_min=0.01,
                           volume_step=0.01, volume_max=10)
        a = evaluate_pretrade(big, (), request(), altin, BrainConfig())
        f = evaluate_pretrade(big, (), request(), forex, BrainConfig())
        self.assertAlmostEqual(a.lot, 0.25)              # 250/1000
        self.assertAlmostEqual(f.lot, 1.25)              # 250/200
        # Lotlar 5 kat farkli ama DOLAR RISKI ayni:
        self.assertAlmostEqual(a.risk_usd, f.risk_usd)
        self.assertLessEqual(a.risk_usd, 250.0 + 1e-9)

    def test_degenerate_feed_target_is_rejected_not_fabricated(self):
        # Price already ran / signal engine sees <1.5R of room: do not invent
        # a 3R target the analysis never predicted.
        stale = evaluate_pretrade(snapshot(), (), request(target=100.5),
                                  SPEC, BrainConfig())
        self.assertFalse(stale.allowed)
        self.assertIn("feed_target_too_close_to_extend", stale.reasons)

    def test_wide_sell_stop_extension_cannot_produce_non_positive_target(self):
        # entry 100, stop 125 (risk 25): 5R extension would need target -25.
        wide = evaluate_pretrade(
            snapshot(), (),
            request(direction="sell", entry=100, stop=125, target=60,
                    signal_strength=0.95),
            SPEC, BrainConfig())
        self.assertFalse(wide.allowed)
        self.assertTrue(
            wide.reasons[0].startswith("extended_target_not_representable"),
            wide.reasons)

    def test_minimum_lot_over_budget_is_rejected_not_upsized(self):
        spec = SymbolSpec(1, 300, 0.1, 0.1, 10)
        result = evaluate_pretrade(snapshot(), (), request(), spec, BrainConfig())
        self.assertFalse(result.allowed)
        self.assertIn("minimum_lot_exceeds_risk_budget", result.reasons)

    def test_sub_15_safe_lot_is_rejected_not_upsized(self):
        cfg = BrainConfig(trade_risk_pct=0.10)
        spec = SymbolSpec(1, 50, 0.1, 0.1, 10)
        result = evaluate_pretrade(snapshot(), (), request(), spec, cfg)
        self.assertFalse(result.allowed)
        self.assertIn("safe_lot_initial_risk_below_minimum_no_upsize", result.reasons)

    def test_tp_dollar_floor_and_rr_are_both_enforced(self):
        # Target extension guarantees reward >= 3 x risk, so the $15 reward
        # floor can only bind through a raised config floor.
        high_floor = evaluate_pretrade(
            snapshot(), (), request(signal_strength=0.5), SPEC,
            BrainConfig(min_expected_profit_usd=100))
        self.assertFalse(high_floor.allowed)
        self.assertIn("expected_profit_below_minimum", high_floor.reasons)
        # A stricter min_rr lifts the required multiple with it.
        rr4 = evaluate_pretrade(snapshot(), (), request(signal_strength=0.5),
                                SPEC, BrainConfig(min_rr=4))
        self.assertTrue(rr4.allowed)
        self.assertAlmostEqual(rr4.target, 104.0)
        self.assertGreaterEqual(rr4.rr, 4.0)
        with self.assertRaises(ValueError):
            BrainConfig(min_rr=2)

    def test_same_underlying_is_one_position_across_timeframes_and_aliases(self):
        opened = OpenRisk("1", "bot-z", "USTEC", "buy", "H1", 20, 0.7)
        candidate = request(symbol="NAS100", timeframe="M5")
        result = evaluate_pretrade(snapshot(), (opened,), candidate, SPEC, BrainConfig())
        self.assertFalse(result.allowed)
        self.assertIn("same_underlying_already_open_across_timeframes", result.reasons)

    def test_reversal_requires_confirmation_hysteresis_and_cooldown(self):
        opened = OpenRisk("77", "bot-z", "EURUSD", "sell", "H1", 20, 0.60)
        good = evaluate_pretrade(snapshot(), (opened,), request(), SPEC, BrainConfig())
        self.assertTrue(good.allowed)
        self.assertEqual(good.action, DecisionAction.CLOSE_AND_REVERSE)
        self.assertEqual(good.close_tickets, ("77",))
        self.assertTrue(good.requires_atomic_execution)
        cooling = evaluate_pretrade(
            snapshot(), (opened,), request(), SPEC, BrainConfig(),
            RuntimeState({"EURUSD": NOW - 2}))
        self.assertFalse(cooling.allowed)
        self.assertIn("reversal_cooldown_active", cooling.reasons)

    def test_projected_bot_risk_includes_candidate(self):
        opened = OpenRisk("1", "bot-a", "GBPUSD", "buy", "M15", 40, 0.5)
        result = evaluate_pretrade(snapshot(), (opened,), request(), SPEC, BrainConfig())
        self.assertFalse(result.allowed)
        # Only $10 remains under the 0.5% bot cap, so a $15 entry cannot be made.
        self.assertIn("safe_lot_initial_risk_below_minimum_no_upsize", result.reasons)

    def test_account_errors_fail_closed(self):
        result = evaluate_pretrade(snapshot(deals_ok=False), (), request(), SPEC,
                                   BrainConfig())
        self.assertFalse(result.allowed)
        self.assertTrue(result.reasons[0].startswith("fail_closed:"))

    def test_warning_flatten_drawdown_and_profit_stop(self):
        entry_brake = evaluate_pretrade(snapshot(equity=9_850), (), request(), SPEC,
                                        BrainConfig())
        self.assertEqual(entry_brake.action, DecisionAction.REJECT)
        self.assertIn("daily_entry_brake_block_new", entry_brake.reasons)
        warning = evaluate_pretrade(snapshot(equity=9_600), (), request(), SPEC,
                                    BrainConfig())
        self.assertEqual(warning.action, DecisionAction.REJECT)
        flatten = evaluate_pretrade(snapshot(equity=9_570), (), request(), SPEC,
                                    BrainConfig())
        self.assertEqual(flatten.action, DecisionAction.FLATTEN_ALL)
        dd = evaluate_pretrade(snapshot(equity=10_880, high_water_equity=12_000),
                               (), request(), SPEC, BrainConfig())
        self.assertEqual(dd.action, DecisionAction.FLATTEN_ALL)
        target = evaluate_pretrade(snapshot(equity=11_000,
                                            day_start_equity=11_000,
                                            high_water_equity=11_000),
                                   (), request(), SPEC, BrainConfig())
        self.assertEqual(target.action, DecisionAction.STOP_PROFIT_TARGET)


class StateAndHeartbeatTests(unittest.TestCase):
    def test_external_heartbeat_is_strict_and_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "heartbeat.json"
            self.assertFalse(heartbeat_ok(path, 10, NOW))
            path.write_text(json.dumps({"ok": True, "timeSec": NOW - 2}),
                            encoding="utf-8")
            self.assertTrue(heartbeat_ok(path, 10, NOW))
            path.write_text(json.dumps({"ok": False, "timeSec": NOW}),
                            encoding="utf-8")
            self.assertFalse(heartbeat_ok(path, 10, NOW))

    def test_locked_reservation_blocks_duplicate_then_release_allows(self):
        with tempfile.TemporaryDirectory() as tmp:
            state_path = Path(tmp) / "state.json"
            heartbeat = Path(tmp) / "heartbeat.json"
            heartbeat.write_text(json.dumps({"ok": True, "timeSec": NOW}),
                                 encoding="utf-8")
            brain = AccountBrain(BrainConfig(), state_path, heartbeat)
            first = brain.evaluate_and_reserve(snapshot(), (), request(), SPEC)
            self.assertTrue(first.allowed)
            duplicate = brain.evaluate_and_reserve(
                snapshot(), (), request(candidate_id="c2"), SPEC)
            self.assertFalse(duplicate.allowed)
            self.assertIn("same_underlying_execution_in_flight",
                          duplicate.reasons)
            opposite = brain.evaluate_and_reserve(
                snapshot(), (), request(candidate_id="c2-reverse", direction="sell",
                                        signal_strength=1.0, confirmations=3), SPEC)
            self.assertFalse(opposite.allowed)
            self.assertIn("same_underlying_execution_in_flight", opposite.reasons)
            self.assertFalse(opposite.close_tickets)
            self.assertTrue(brain.commit_reservation("c1", ticket=123,
                                                     now_ts=NOW))
            self.assertTrue(brain.release_reservation("c1"))
            after_release = brain.evaluate_and_reserve(
                snapshot(), (), request(candidate_id="c3"), SPEC)
            self.assertTrue(after_release.allowed)
            state = JsonStateStore(state_path).read()
            self.assertGreaterEqual(state["version"], 4)

    def test_two_live_observations_confirm_an_ordinary_reversal(self):
        with tempfile.TemporaryDirectory() as tmp:
            state_path = Path(tmp) / "state.json"
            heartbeat = Path(tmp) / "heartbeat.json"
            heartbeat.write_text(json.dumps({"ok": True, "timeSec": NOW}),
                                 encoding="utf-8")
            brain = AccountBrain(BrainConfig(), state_path, heartbeat)
            opened = OpenRisk("77", "bot-z", "EURUSD", "sell", "H1", 20, 0.60)
            first = brain.evaluate_and_reserve(
                snapshot(), (opened,), request(candidate_id="rev1", confirmations=1), SPEC)
            self.assertFalse(first.allowed)
            self.assertIn("reversal_confirmation_count_too_low", first.reasons)
            second = brain.evaluate_and_reserve(
                snapshot(), (opened,), request(candidate_id="rev2", confirmations=1,
                                                now_ts=NOW + 1), SPEC)
            self.assertTrue(second.allowed)
            self.assertEqual(second.action, DecisionAction.CLOSE_AND_REVERSE)


if __name__ == "__main__":
    unittest.main()
