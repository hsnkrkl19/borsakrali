#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AI konseyi + beyin advisory sozlesmesi (offline; MT5/ag gerekmez).
Calistir: python _offline_test_runner.py test_ai_council.py"""
import json
import os
import tempfile
import time
from types import SimpleNamespace
from unittest.mock import patch

import account_brain
import ai_council

NOW = time.time()


# ── beyin tarafi: load_advisory_scale ────────────────────────────────────────

def _write(tmp, payload):
    path = os.path.join(tmp, "ai_advisory.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh)
    return path


def t_advisory_clamps_and_neutral_failures():
    with tempfile.TemporaryDirectory() as tmp:
        # Taze temkin -> 0.5
        p = _write(tmp, {"generatedAtSec": NOW, "scale": 0.5})
        assert account_brain.load_advisory_scale(p, NOW) == 0.5
        # "Riski artir" tavsiyesi SESSIZCE 1.0 (AI kural gevsetemez)
        p = _write(tmp, {"generatedAtSec": NOW, "scale": 3.0})
        assert account_brain.load_advisory_scale(p, NOW) == 1.0
        # Asiri kisma tabana oturur (0.25)
        p = _write(tmp, {"generatedAtSec": NOW, "scale": 0.01})
        assert account_brain.load_advisory_scale(p, NOW) == 0.25
        # Bayat dosya NOTR (olu konsey trade'i kisamaz)
        p = _write(tmp, {"generatedAtSec": NOW - 3600, "scale": 0.5})
        assert account_brain.load_advisory_scale(p, NOW) == 1.0
        # Gelecek tarihli dosya da NOTR (saat oynamasi guvene donusmesin)
        p = _write(tmp, {"generatedAtSec": NOW + 3600, "scale": 0.5})
        assert account_brain.load_advisory_scale(p, NOW) == 1.0
        # Bozuk icerik / olmayan dosya NOTR
        bad = os.path.join(tmp, "bozuk.json")
        with open(bad, "w", encoding="utf-8") as fh:
            fh.write("{yarim")
        assert account_brain.load_advisory_scale(bad, NOW) == 1.0
        assert account_brain.load_advisory_scale(os.path.join(tmp, "yok.json"), NOW) == 1.0
        # NaN scale NOTR
        p = _write(tmp, {"generatedAtSec": NOW, "scale": float("nan")})
        assert account_brain.load_advisory_scale(p, NOW) == 1.0
    print("OK advisory: kirpma (<=1.0, >=0.25) + her hatada NOTR")


def t_advisory_scales_entry_risk_but_cannot_block():
    """Temkin yeni giris riskini yarilar ama girisi ENGELLEMEZ; buyuk hesapta
    250$ -> 125$ olur (D2g ile ayni mekanik, bagimsiz carpan)."""
    cfg = account_brain.BrainConfig(race_mode=True, max_trade_risk_usd=250.0)
    snap = account_brain.AccountSnapshot(
        balance=200_000, equity=200_000, start_balance=200_000,
        day_start_equity=200_000, high_water_equity=200_000, as_of=NOW)
    req = account_brain.TradeRequest(
        candidate_id="c1", bot_id="bot-a", symbol="EURUSD", direction="buy",
        timeframe="M15", entry=100, stop=99, target=103,
        signal_strength=0.6, confirmations=2, now_ts=NOW)
    spec = account_brain.SymbolSpec(tick_size=1, tick_value=1, volume_min=0.1,
                                    volume_step=0.1, volume_max=1000)
    normal = account_brain.evaluate_pretrade(snap, (), req, spec, cfg)
    temkin = account_brain.evaluate_pretrade(snap, (), req, spec, cfg,
                                             advisory_scale=0.5)
    assert normal.allowed and temkin.allowed, (normal.reasons, temkin.reasons)
    assert abs(normal.risk_usd - 250.0) < 1e-6, normal.risk_usd
    assert abs(temkin.risk_usd - 125.0) < 1e-6, temkin.risk_usd
    assert temkin.projected["advisory_scale"] == 0.5
    # Carpani 1.0 ustune zorlamak risk BUYUTEMEZ.
    sisik = account_brain.evaluate_pretrade(snap, (), req, spec, cfg,
                                            advisory_scale=99.0)
    assert abs(sisik.risk_usd - 250.0) < 1e-6, sisik.risk_usd
    print("OK advisory: temkin 250$->125$; giris engellenmez; 1.0 ustu buyutemez")


# ── konsey tarafi ────────────────────────────────────────────────────────────

def t_consensus_majority_and_silence():
    o = lambda temkin, guven: {"name": "x", "temkin": temkin, "guven": guven,
                               "yorum": ""}
    # Tek saglayici: onun oyu gecer.
    assert ai_council.consensus([o(True, 0.9), None])["caution"] is True
    assert ai_council.consensus([o(False, 0.9), None])["caution"] is False
    # Iki saglayici 1-1: esitlik TEMKIN yonune duser (guvenli taraf).
    assert ai_council.consensus([o(True, 0.9), o(False, 0.9)])["caution"] is True
    # Dusuk guvenli temkin oyu sayilmaz.
    assert ai_council.consensus([o(True, 0.3), o(False, 0.9)])["caution"] is False
    # Hic cevap yok -> None (gorus DEGIL; dosya guncellenmez).
    assert ai_council.consensus([None, None]) is None
    print("OK konsensus: cogunluk + esitlikte temkin + cevapsizlik gorus degil")


def t_parse_opinion_defensive():
    p = ai_council._parse_opinion
    ok = p("m", '{"temkin": true, "guven": 0.8, "yorum": "riskli gun"}')
    assert ok == {"name": "m", "temkin": True, "guven": 0.8, "yorum": "riskli gun"}
    # Model JSON etrafina laf sokusturursa ilk nesne cekilir.
    ok = p("m", 'Tabii! {"temkin": false, "guven": 1.5, "yorum": "sakin"} umarim')
    assert ok["temkin"] is False and ok["guven"] == 1.0
    # temkin bool degilse gecersiz.
    assert p("m", '{"temkin": "evet"}') is None
    assert p("m", "duz metin") is None
    assert p("m", "") is None and p("m", None) is None
    print("OK parse: JSON disi/curuk cevap gorus sayilmaz")


def t_run_once_writes_atomic_advisory_and_posts():
    with tempfile.TemporaryDirectory() as tmp:
        adv = os.path.join(tmp, "ai_advisory.json")
        hb = os.path.join(tmp, "hb.json")
        with open(hb, "w", encoding="utf-8") as fh:
            json.dump({"equity": 197000, "dailyLossPct": 1.2, "ok": True}, fh)
        cfg = {"backend_url": "https://example.test", "exec_token": "t",
               "ai_advisory_path": adv, "brain_heartbeat_path": hb}
        posted = {}

        def fake_post(url, **kw):
            posted[url] = kw
            return SimpleNamespace(status_code=200, json=lambda: {})

        with patch.object(ai_council, "ask_ollama",
                          return_value={"name": "ollama:t", "temkin": True,
                                        "guven": 0.9, "yorum": "zarar gunu"}), \
             patch.object(ai_council, "ask_gemini", return_value=None), \
             patch.object(ai_council.requests, "get",
                          side_effect=Exception("backend yok")), \
             patch.object(ai_council.requests, "post", side_effect=fake_post):
            result = ai_council.run_once(cfg)
        assert result is not None and result["caution"] is True
        on_disk = json.loads(open(adv, encoding="utf-8").read())
        assert on_disk["scale"] == 0.5 and on_disk["caution"] is True
        assert abs(on_disk["generatedAtSec"] - time.time()) < 30
        assert not os.path.exists(adv + ".tmp"), "atomik yazim tmp birakmamali"
        assert any("/api/bridge/ai-council" in u for u in posted), posted.keys()
        # Beyin bu dosyayi 0.5 olarak okur — uctan uca zincir.
        assert account_brain.load_advisory_scale(adv, time.time()) == 0.5
    print("OK run_once: atomik dosya + backend POST + beyin zinciri")


def t_run_once_all_providers_silent_leaves_file_untouched():
    with tempfile.TemporaryDirectory() as tmp:
        adv = os.path.join(tmp, "ai_advisory.json")
        hb = os.path.join(tmp, "hb.json")
        with open(hb, "w", encoding="utf-8") as fh:
            json.dump({"equity": 1, "ok": True}, fh)
        # Eski bir TEMKIN dosyasi var; konsey cevapsizsa dosyaya DOKUNMAZ,
        # karar dogal bayatlamayla notr'e doner (eski karar tazelenmez!).
        eski = {"generatedAtSec": int(time.time()) - 1700, "scale": 0.5}
        with open(adv, "w", encoding="utf-8") as fh:
            json.dump(eski, fh)
        cfg = {"ai_advisory_path": adv, "brain_heartbeat_path": hb}
        with patch.object(ai_council, "ask_ollama", return_value=None), \
             patch.object(ai_council, "ask_gemini", return_value=None), \
             patch.object(ai_council.requests, "get",
                          side_effect=Exception("yok")):
            assert ai_council.run_once(cfg) is None
        assert json.loads(open(adv, encoding="utf-8").read()) == eski
    print("OK sessizlik: dosya guncellenmez, eski temkin tazelenmez")


def t_gemini_key_fallback():
    """Yedekli anahtar: kota biten (429) anahtar atlanir, sonraki devralir."""
    calls = []

    def fake_post(url, **kw):
        # 2026-08-04: anahtar QUERY STRING yerine BASLIKTA gonderiliyor —
        # requests istisna metni URL'i icerebiliyor ve anahtar duz metin
        # olarak loga dusuyordu. Test bu sozlesmeyi de kilitler.
        assert "key" not in (kw.get("params") or {}), "anahtar URL'e KOYULMAMALI"
        calls.append((kw.get("headers") or {}).get("x-goog-api-key"))
        if len(calls) == 1:
            return SimpleNamespace(status_code=429, text="quota", json=lambda: {})
        return SimpleNamespace(status_code=200, text="", json=lambda: {
            "candidates": [{"content": {"parts": [{
                "text": '{"temkin": true, "guven": 0.8, "yorum": "yedek anahtar"}'}]}}]})

    cfg = {"gemini_api_keys": ["ANAHTAR-1", "ANAHTAR-2"]}
    with patch.object(ai_council.requests, "post", side_effect=fake_post):
        op = ai_council.ask_gemini(cfg, "p")
    assert calls == ["ANAHTAR-1", "ANAHTAR-2"], calls
    assert op and op["temkin"] is True and op["yorum"] == "yedek anahtar"
    # Tekil anahtar + liste + env birlesir, cift saymaz.
    with patch.dict(os.environ, {"GEMINI_API_KEY": "ANAHTAR-2"}):
        keys = ai_council._gemini_keys(
            {"gemini_api_keys": ["ANAHTAR-1"], "gemini_api_key": "ANAHTAR-2"})
    assert keys == ["ANAHTAR-1", "ANAHTAR-2"], keys
    # Sizinti korumasi: hata metninde anahtar gecse bile loga MASKELI duser.
    kaynak = open(os.path.join(os.path.dirname(os.path.abspath(ai_council.__file__)),
                               "ai_council.py"), encoding="utf-8").read()
    assert 'headers={"x-goog-api-key": key}' in kaynak, "anahtar baslikta gitmeli"
    assert 'str(exc).replace(key, "***")' in kaynak, "istisna metni maskelenmeli"
    print("OK gemini yedekleme: 429 atlanir, sonraki anahtar devralir (anahtar loglanmaz)")


def t_gemini_disabled_without_key():
    with patch.dict(os.environ, {}, clear=False):
        os.environ.pop("GEMINI_API_KEY", None)
        assert ai_council.ask_gemini({}, "p") is None
    print("OK gemini: anahtar yoksa sessizce devre disi")


if __name__ == "__main__":
    t_advisory_clamps_and_neutral_failures()
    t_advisory_scales_entry_risk_but_cannot_block()
    t_consensus_majority_and_silence()
    t_parse_opinion_defensive()
    t_run_once_writes_atomic_advisory_and_posts()
    t_run_once_all_providers_silent_leaves_file_untouched()
    t_gemini_key_fallback()
    t_gemini_disabled_without_key()
    print()
    print("TUM AI KONSEYI TESTLERI GECTI - OK")
