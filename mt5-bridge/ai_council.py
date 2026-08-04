#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI KONSEYI — cok-modelli danisma katmani (2026-08-01).

Yerel Ollama (+ istege bagli Gemini) hesabin durumunu periyodik analiz eder ve
tek bir TAVSIYE dosyasi yazar: ai_advisory.json. Merkez beyin bu dosyayi
yalnizca KISMA yonunde okur (account_brain.load_advisory_scale).

SOZLESME (degistirilecekse once account_brain.py'deki blok guncellenmeli):
  1. AI ASLA islem acmaz, yon secmez, kural gevsetemez.
  2. Tavsiye YALNIZ kisabilir: scale <= 1.0. Konsey "riski artir" derse bile
     dosyaya 1.0 yazilir.
  3. Konsey coker / Ollama kapanir / anahtar yoksa => dosya bayatlar => beyin
     NOTR (1.0) davranir. Olu bir AI sureci trade'i durduramaz.
  4. Karar cogunlukla alinir: cevap veren saglayicilarin yarisi+ temkin derse
     temkin. Hic saglayici cevap vermezse dosya guncellenmez (bayatlamaya
     birakilir) — "cevapsizlik" bir gorus DEGILDIR.

Calistirma:
  python ai_council.py --once     # tek tur (kurulum dogrulamasi)
  python ai_council.py            # dongu (varsayilan 600 sn arayla)

Config: config_all.json okunur (backend_url, exec_token). Istege bagli anahtarlar:
  ai_council_interval_seconds (600), ollama_url (http://localhost:11434),
  ollama_model (kurulu ilk model), gemini_api_key (veya GEMINI_API_KEY env),
  gemini_model (gemini-flash-latest).
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
import time
from pathlib import Path

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
ADVISORY_PATH = os.path.join(HERE, "ai_advisory.json")
HEARTBEAT_PATH = os.path.join(HERE, "account_brain_heartbeat.json")
CONFIG_PATHS = ("config_all.json", "config_brain.json", "config.json")

CAUTION_SCALE = 0.5           # temkin karari yeni giris riskini yariya indirir
OLLAMA_TIMEOUT = 180          # yerel kucuk model CPU'da yavas olabilir
GEMINI_TIMEOUT = 45
BACKEND_TIMEOUT = 15

log = logging.getLogger("ai-konsey")


def load_config():
    for name in CONFIG_PATHS:
        path = os.path.join(HERE, name)
        try:
            with open(path, encoding="utf-8-sig") as fh:
                cfg = json.load(fh)
            if isinstance(cfg, dict):
                cfg["_config_source"] = name
                return cfg
        except FileNotFoundError:
            continue
        except Exception as exc:
            log.warning("%s okunamadi: %s", name, exc)
    return {}


# ── baglam toplama ────────────────────────────────────────────────────────────

def _read_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception:
        return None


def _backend_get(cfg, route):
    """Kopru kanali: /api/bot/* KULLANICI auth'u ister (konseyde yok);
    konsey yalniz FOREX_EXEC_TOKEN ile korunan /api/bridge/* rotalarini okur."""
    base = str(cfg.get("backend_url") or "").rstrip("/")
    token = str(cfg.get("exec_token") or "").strip()
    if not base or not token:
        return None
    try:
        r = requests.get(base + route, timeout=BACKEND_TIMEOUT,
                         headers={"Authorization": "Bearer " + token})
        return r.json() if r.status_code == 200 else None
    except Exception:
        return None


def gather_context(cfg):
    """Beynin gordugu dunyanin ozeti — prompt'a sigacak kadar kucuk.
    Birincil kaynak yerel heartbeat (beyin 2 sn'de bir yazar); backend denetimi
    yalniz bildirim sagligini ekler."""
    ctx = {}
    hb = _read_json(_advisory_sibling(cfg, "heartbeat")) or {}
    for key in ("equity", "balance", "dailyLossPct", "totalDrawdownPct",
                "realizedToday", "floatingPnl", "openPositions", "openRiskUsd",
                "openRiskPct", "ok"):
        if key in hb:
            ctx[key] = hb.get(key)
    audit = _backend_get(cfg, "/api/bridge/audit")
    if isinstance(audit, dict) and audit.get("success"):
        a = audit.get("audit") or {}
        ctx["bildirimSagligi"] = {
            "saglikli": a.get("healthy"),
            "bekleyen": a.get("pendingNotifications"),
            "takili": a.get("stuckNotifications"),
            "yetimKapanis": a.get("closeWithoutOpen"),
        }
        rr = audit.get("realResults") or {}
        if "totalNet" in rr or "trades" in rr:
            ctx["defterOzeti"] = {k: rr.get(k) for k in ("trades", "totalNet")
                                  if k in rr}
    return ctx


def _advisory_sibling(cfg, kind):
    if kind == "heartbeat":
        return str(cfg.get("brain_heartbeat_path") or HEARTBEAT_PATH)
    return str(cfg.get("ai_advisory_path") or ADVISORY_PATH)


# ── saglayicilar ─────────────────────────────────────────────────────────────

PROMPT_SABLON = """Sen bir prop-firm (FTMO) hesabinin risk gozlemcisisin. Hesapta 38 otomatik bot
gercek islem aciyor; deterministik risk kurallari (gunluk %4.5 fren, islem basi
250$ tavan, 3R hedef, iz suren stop) ZATEN calisiyor. Senin isin yalnizca:
mevcut tabloya bakip bugun icin TEMKIN gerekli mi soylemek.

TEMKIN = yeni girislerin riski yariya iner. Islemler durmaz, acik pozisyonlara
dokunulmaz. Supheye dustugunde temkin=false de - gereksiz temkin, botlarin
yarisini sebepsiz kucultur.

HESAP DURUMU (JSON):
<DURUM>

YALNIZCA su JSON ile cevap ver, baska hicbir sey yazma:
{"temkin": true|false, "guven": 0.0-1.0, "yorum": "tek cumle Turkce gerekce"}"""


def build_prompt(ctx):
    # % bicimleme kullanilmaz: sablonda "%4.5" gibi yuzdeler var.
    return PROMPT_SABLON.replace(
        "<DURUM>", json.dumps(ctx, ensure_ascii=False, indent=1))


def _parse_opinion(name, text):
    """Modelin cevabindan ilk JSON nesnesini defansif cek."""
    if not text:
        return None
    match = re.search(r"\{.*?\}", text, re.DOTALL)
    if not match:
        return None
    try:
        raw = json.loads(match.group(0))
    except Exception:
        return None
    if not isinstance(raw, dict) or not isinstance(raw.get("temkin"), bool):
        return None
    try:
        guven = float(raw.get("guven", 0.5))
    except Exception:
        guven = 0.5
    guven = min(1.0, max(0.0, guven))
    return {"name": name, "temkin": raw["temkin"], "guven": guven,
            "yorum": str(raw.get("yorum") or "")[:300]}


def pick_ollama_model(cfg):
    configured = str(cfg.get("ollama_model") or "").strip()
    if configured:
        return configured
    url = str(cfg.get("ollama_url") or "http://localhost:11434").rstrip("/")
    try:
        tags = requests.get(url + "/api/tags", timeout=10).json()
        models = tags.get("models") or []
        return str(models[0]["name"]) if models else ""
    except Exception:
        return ""


def ask_ollama(cfg, prompt):
    url = str(cfg.get("ollama_url") or "http://localhost:11434").rstrip("/")
    model = pick_ollama_model(cfg)
    if not model:
        return None
    try:
        r = requests.post(url + "/api/generate", json={
            "model": model, "prompt": prompt, "stream": False,
            "format": "json", "options": {"temperature": 0.2},
        }, timeout=OLLAMA_TIMEOUT)
        if r.status_code != 200:
            log.warning("ollama %s: %s", r.status_code, r.text[:120])
            return None
        return _parse_opinion("ollama:" + model, (r.json() or {}).get("response"))
    except Exception as exc:
        log.warning("ollama hatasi: %s", exc)
        return None


def _gemini_keys(cfg):
    """Yedekli anahtar listesi: gemini_api_keys > gemini_api_key > env."""
    keys = []
    raw = cfg.get("gemini_api_keys")
    if isinstance(raw, list):
        keys.extend(str(k).strip() for k in raw if str(k or "").strip())
    single = str(cfg.get("gemini_api_key") or "").strip()
    if single and single not in keys:
        keys.append(single)
    env = str(os.environ.get("GEMINI_API_KEY") or "").strip()
    if env and env not in keys:
        keys.append(env)
    return keys


def ask_gemini(cfg, prompt):
    """Anahtarlar sirayla denenir: kota biten (429) / gecersiz (4xx) anahtar
    SESSIZCE atlanir, ilk calisan cevap verir. Anahtar degeri ASLA loglanmaz."""
    keys = _gemini_keys(cfg)
    if not keys:
        return None
    # "latest" takma adi: Google model surumunu emeklige ayirinca 404 yerine
    # otomatik yeni surume gecilir (2.5-flash yeni anahtarlara kapandi bile).
    model = str(cfg.get("gemini_model") or "gemini-flash-latest").strip()
    url = ("https://generativelanguage.googleapis.com/v1beta/models/"
           "%s:generateContent" % model)
    for idx, key in enumerate(keys, 1):
        try:
            r = requests.post(
                url,
                headers={"x-goog-api-key": key},
                json={"contents": [{"parts": [{"text": prompt}]}],
                      "generationConfig": {"responseMimeType": "application/json",
                                           "temperature": 0.2}},
                timeout=GEMINI_TIMEOUT)
            if r.status_code != 200:
                log.warning("gemini anahtar#%d: HTTP %s — sonraki anahtar denenecek",
                            idx, r.status_code)
                continue
            data = r.json() or {}
            parts = (((data.get("candidates") or [{}])[0].get("content") or {})
                     .get("parts") or [{}])
            opinion = _parse_opinion("gemini:" + model, parts[0].get("text"))
            if opinion:
                return opinion
        except Exception as exc:
            # Ikinci savunma: kutuphane hangi metni uretirse uretsin anahtar
            # degeri loga DUSMEZ.
            log.warning("gemini anahtar#%d hatasi: %s", idx,
                        str(exc).replace(key, "***"))
    return None


# ── karar + cikti ────────────────────────────────────────────────────────────

def consensus(opinions):
    """Cevap verenlerin yarisi+ yuksek guvenle temkin derse temkin."""
    voters = [o for o in opinions if o]
    if not voters:
        return None
    caution_votes = sum(1 for o in voters if o["temkin"] and o["guven"] >= 0.5)
    caution = caution_votes * 2 >= len(voters) and caution_votes > 0
    return {"caution": caution, "votes": caution_votes, "total": len(voters)}


def write_advisory(path, caution, opinions, ctx):
    """Atomik yaz; beyin yarim dosya okumasin."""
    payload = {
        "generatedAtSec": int(time.time()),
        "scale": CAUTION_SCALE if caution else 1.0,
        "caution": bool(caution),
        "providers": [o for o in opinions if o],
        "context": {k: ctx.get(k) for k in ("dailyLossPct", "openRiskUsd",
                                            "realizedToday", "bildirimSagligi")
                    if k in ctx},
    }
    tmp = str(path) + ".tmp"
    Path(tmp).write_text(json.dumps(payload, ensure_ascii=False, indent=1),
                         encoding="utf-8")
    os.replace(tmp, path)
    return payload


def post_backend(cfg, payload):
    base = str(cfg.get("backend_url") or "").rstrip("/")
    token = str(cfg.get("exec_token") or "").strip()
    if not base or not token:
        return False
    try:
        r = requests.post(base + "/api/bridge/ai-council", json=payload,
                          headers={"Authorization": "Bearer " + token},
                          timeout=BACKEND_TIMEOUT)
        return r.status_code == 200
    except Exception as exc:
        log.warning("backend POST hatasi: %s", exc)
        return False


def run_once(cfg):
    ctx = gather_context(cfg)
    if not ctx:
        log.warning("baglam bos (heartbeat + backend yok); tavsiye guncellenmedi")
        return None
    prompt = build_prompt(ctx)
    opinions = [ask_ollama(cfg, prompt), ask_gemini(cfg, prompt)]
    verdict = consensus(opinions)
    if verdict is None:
        # Cevapsizlik gorus degildir: dosya GUNCELLENMEZ, dogal bayatlamayla
        # beyin notr'e doner. Eski temkin karari sonsuza kadar yasamaz.
        log.warning("hicbir AI saglayici cevap vermedi; tavsiye bayatlamaya birakildi")
        return None
    payload = write_advisory(_advisory_sibling(cfg, "advisory"),
                             verdict["caution"], opinions, ctx)
    payload["votes"] = verdict
    post_backend(cfg, payload)
    log.info("konsey karari: %s (%d/%d oy) — %s",
             "TEMKIN riski yari" if verdict["caution"] else "normal",
             verdict["votes"], verdict["total"],
             " | ".join((o["name"] + ": " + o["yorum"]) for o in opinions if o))
    return payload


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="tek tur calis ve cik")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")
    cfg = load_config()
    if not cfg:
        log.error("hicbir config bulunamadi (%s)", ", ".join(CONFIG_PATHS))
        return 2
    interval = max(120, int(cfg.get("ai_council_interval_seconds", 600) or 600))
    if args.once:
        result = run_once(cfg)
        print(json.dumps(result, ensure_ascii=False, indent=1) if result
              else "(tavsiye guncellenmedi)")
        return 0 if result else 1
    log.info("AI konseyi basladi — her %d sn'de bir (kaynak: %s)",
             interval, cfg.get("_config_source"))
    while True:
        try:
            run_once(cfg)
        except Exception as exc:
            log.error("konsey turu hatasi (dongu surer): %s", exc)
        time.sleep(interval)


if __name__ == "__main__":
    sys.exit(main() or 0)
