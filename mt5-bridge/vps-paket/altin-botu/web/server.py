"""FastAPI web server for the trading panel.

Exposes the JSON API consumed by web/static/panel.js and serves the
single-page panel. All shared objects (config, MT5 client, risk manager,
trader, journal, engine) are injected by main.py via create_app().
"""

import hashlib
import hmac
import os
import time
from pathlib import Path
from urllib.parse import unquote

import httpx
from fastapi import Body, FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from core.config import MAGIC_NUMBER
from core.execution import is_paper, source as execution_source
from core.logger import get_logger, get_ui_logs

log = get_logger("web.server")

STATIC_DIR = Path(__file__).resolve().parent / "static"

VALID_SYMBOL_KEYS = ("gold", "btc")
VALID_DIRECTIONS = ("buy", "sell")
BORSAKRALI_SESSION_VERIFY_URL = os.environ.get(
    "BORSAKRALI_SESSION_VERIFY_URL",
    "https://borsakrali.com/api/bot/session/verify",
)


async def _verify_borsakrali_admin_token(token: str) -> bool:
    """Ask the site to re-validate its own short-lived admin session."""
    async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
        response = await client.get(
            BORSAKRALI_SESSION_VERIFY_URL,
            headers={
                "Authorization": "Bearer %s" % token,
                "User-Agent": "Altin-Botu-R5/VPS",
            },
        )
    if response.status_code != 200:
        return False
    try:
        payload = response.json()
    except ValueError:
        return False
    return payload.get("ok") is True and payload.get("role") == "admin"


def _mask_config(cfg: dict) -> dict:
    """Mask the web password in an outgoing config copy."""
    web = cfg.get("web")
    if isinstance(web, dict) and web.get("password"):
        web["password"] = "***"
    return cfg


def _strip_masked(data):
    """Recursively remove '***' masked values so they never overwrite real ones."""
    if isinstance(data, dict):
        for key in list(data.keys()):
            value = data[key]
            if isinstance(value, (dict, list)):
                _strip_masked(value)
            elif value == "***":
                del data[key]
    elif isinstance(data, list):
        for item in data:
            _strip_masked(item)
    return data


def _to_float(value, field_name: str):
    """Optional float parsing with a Turkish validation error."""
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Geçersiz sayısal değer: %s" % field_name)


def create_app(config, mt5c, risk, trader, journal, engine, research=None) -> FastAPI:
    """Build the FastAPI application with all panel endpoints."""
    app = FastAPI(title="Altın Botu Panel", docs_url=None, redoc_url=None, openapi_url=None)

    startup_cfg = config.get()
    web_cfg = startup_cfg.get("web", {}) or {}
    if not web_cfg.get("password") and web_cfg.get("host", "127.0.0.1") != "127.0.0.1":
        log.warning(
            "UYARI: web.password boş ve panel %s adresinden dışarıya açık. "
            "Lütfen config.json içinde bir panel şifresi belirleyin!",
            web_cfg.get("host"),
        )

    def _password() -> str:
        try:
            return (config.get().get("web", {}) or {}).get("password", "") or ""
        except Exception:
            return ""

    # Cache only a SHA-256 digest, never the Bearer token itself. A one-minute
    # TTL keeps normal polling light while revocation still takes effect fast.
    site_admin_cache: dict[str, float] = {}

    # ------------------------------------------------------------------ auth
    @app.middleware("http")
    async def auth_middleware(request: Request, call_next):
        path = request.url.path
        if path.startswith("/api/") and path not in ("/api/login", "/api/health"):
            password = _password()
            if password:
                # panel.js sends the token percent-encoded (fetch rejects
                # header values with characters above U+00FF, e.g. Turkish
                # ş/ğ/İ); unquote is a no-op for plain ASCII tokens.
                token = unquote(request.headers.get("X-Auth-Token", ""))
                local_ok = hmac.compare_digest(token.encode("utf-8"), password.encode("utf-8"))
                if not local_ok:
                    authorization = request.headers.get("Authorization", "")
                    parts = authorization.split(None, 1)
                    bearer = parts[1].strip() if len(parts) == 2 and parts[0].lower() == "bearer" else ""
                    if not bearer:
                        return JSONResponse(
                            status_code=401,
                            content={"detail": "Yetkisiz erişim. Lütfen giriş yapın."},
                        )
                    digest = hashlib.sha256(bearer.encode("utf-8")).hexdigest()
                    now = time.monotonic()
                    site_ok = site_admin_cache.get(digest, 0.0) > now
                    if not site_ok:
                        try:
                            site_ok = await _verify_borsakrali_admin_token(bearer)
                        except (httpx.HTTPError, OSError) as exc:
                            log.warning("BorsaKrali admin oturumu doğrulanamadı: %s", exc)
                            return JSONResponse(
                                status_code=503,
                                content={"detail": "BorsaKrali kimlik servisine ulaşılamıyor; işlem güvenli biçimde engellendi."},
                            )
                        if site_ok:
                            site_admin_cache[digest] = now + 60.0
                    if not site_ok:
                        return JSONResponse(
                            status_code=401,
                            content={"detail": "BorsaKrali admin oturumu geçersiz."},
                        )
        return await call_next(request)

    # ------------------------------------------------- exception handlers
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(status_code=400, content={"detail": "Geçersiz istek gövdesi."})

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        detail = exc.detail if isinstance(exc.detail, str) else "İstek işlenemedi."
        return JSONResponse(status_code=exc.status_code, content={"detail": detail})

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        log.error("Sunucu hatası (%s): %s", request.url.path, exc)
        return JSONResponse(status_code=500, content={"detail": "Sunucu hatası: %s" % exc})

    # ------------------------------------------------------------ endpoints
    @app.post("/api/login")
    def api_login(payload: dict = Body(...)):
        password = _password()
        if not password:
            return {"ok": True}
        supplied = str(payload.get("password") or "")
        ok = hmac.compare_digest(supplied.encode("utf-8"), password.encode("utf-8"))
        if not ok:
            log.warning("Panel girişi başarısız: yanlış şifre denemesi.")
        return {"ok": ok}

    @app.get("/api/status")
    def api_status():
        status = engine.status()
        if not isinstance(status, dict):
            status = {}
        # The engine snapshot lags by up to poll_seconds; always report the
        # authoritative config value that actually gates order execution so
        # the panel toggle never flips back to a stale state.
        status["engine_enabled"] = bool(
            ((config.get().get("engine") or {}).get("enabled", False))
        )
        status["execution_mode"] = execution_source(config.get())
        # Never call MT5 from a polling request. The engine publishes a
        # validated snapshot after its own iteration; actual orders still run
        # the fresh, blocking account guard immediately before order_check.
        guard = status.get("account_guard") or {
            "ok": False,
            "reason": "MT5 durum bilgisi bekleniyor; yeni işlemler engelli.",
        }
        status["account_guard"] = {
            "ok": bool(guard.get("ok", False)),
            "reason": str(guard.get("reason") or ""),
        }
        try:
            status["preflight"] = engine.preflight(check_account=False)
        except Exception as exc:
            status["preflight"] = {"ok": False, "error": str(exc)}
        blockers = []
        if not status["engine_enabled"]:
            blockers.append("Otomatik işlem kapalı; Botu Başlat düğmesini kullanın.")
        if not bool(status.get("connected", False)):
            blockers.append("MT5 bağlantısı bekleniyor. Terminali ve internet bağlantısını kontrol edin.")
        if not status["account_guard"]["ok"]:
            reason = status["account_guard"]["reason"]
            if reason and reason not in blockers:
                blockers.append(reason)
        if not bool(status["preflight"].get("ok", False)):
            blocked_rows = status["preflight"].get("blocked") or []
            strategy_reason = (
                str(blocked_rows[0].get("reason") or "") if blocked_rows else ""
            )
            blockers.append(
                strategy_reason
                or "Çalışabilir ve doğrulanmış strateji/sembol eşleşmesi yok."
            )
        market_health = status.get("market_health") or {}
        if market_health and not bool(market_health.get("ready", False)):
            market_blockers = market_health.get("blockers") or []
            blockers.append(
                str(market_blockers[0])
                if market_blockers
                else "Broker sembolü veya canlı mum verisi hazır değil."
            )
        if bool((status.get("limit") or {}).get("hit", False)):
            blockers.append("Günlük risk limiti tetiklendi; yeni işlemler engelli.")
        status["trade_blockers"] = list(dict.fromkeys(blockers))
        status["trade_ready"] = not status["trade_blockers"]
        status["ui_logs"] = get_ui_logs()[:50]
        return status

    @app.get("/api/positions")
    def api_positions():
        cfg = config.get()
        if is_paper(cfg):
            return journal.paper_positions(mt5c)
        snapshot = getattr(mt5c, "positions_snapshot", None)
        return snapshot() if callable(snapshot) else mt5c.positions()

    @app.get("/api/trades")
    def api_trades(limit: int = Query(100, ge=1, le=1000)):
        return journal.trades(limit=limit, source=execution_source(config.get()))

    @app.get("/api/events")
    def api_events(limit: int = Query(100, ge=1, le=1000)):
        return journal.events(limit=limit)

    @app.get("/api/config")
    def api_config_get():
        return _mask_config(config.get())

    @app.post("/api/config")
    def api_config_update(partial: dict = Body(...)):
        _strip_masked(partial)
        new_cfg = config.update(partial)
        try:
            journal.record_event("info", "Ayarlar panelden güncellendi.")
        except Exception as exc:
            log.error("Ayar güncelleme olayı kaydedilemedi: %s", exc)
        return _mask_config(new_cfg)

    @app.post("/api/account/bind_current_demo")
    def api_bind_current_demo_account():
        cfg = config.get()
        if bool((cfg.get("engine") or {}).get("enabled", False)):
            raise HTTPException(
                status_code=409,
                detail="Hesap kilidi değiştirilmeden önce bot durdurulmalıdır.",
            )

        account = mt5c.account_info() or {}
        terminal = mt5c.terminal_status() or {}
        try:
            login = int(account.get("login") or 0)
        except (TypeError, ValueError):
            login = 0
        server = str(account.get("server") or "").strip()
        trade_mode = str(account.get("trade_mode_label") or "").strip().lower()
        if not terminal.get("connected") or login <= 0 or not server:
            raise HTTPException(
                status_code=400,
                detail="Bağlı ve yetkilendirilmiş bir MT5 hesabı bulunamadı.",
            )
        if trade_mode != "demo":
            raise HTTPException(
                status_code=400,
                detail="Yalnızca MT5 tarafından DEMO olarak doğrulanan hesap kilitlenebilir.",
            )
        if mt5c.positions(magic=MAGIC_NUMBER):
            raise HTTPException(
                status_code=409,
                detail="Açık bot pozisyonu varken hesap kilidi değiştirilemez.",
            )

        try:
            new_cfg = config.rebind_demo_account(login, server)
        except (ValueError, RuntimeError) as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        clear_symbols = getattr(mt5c, "clear_symbol_cache", None)
        if callable(clear_symbols):
            clear_symbols()
        try:
            journal.record_event(
                "security",
                f"Demo hesap kilidi bağlı hesaba güncellendi: {login}@{server}",
            )
        except Exception as exc:
            log.error("Hesap kilidi olayı kaydedilemedi: %s", exc)
        log.warning("Demo hesap kilidi güvenli biçimde güncellendi: %s@%s", login, server)
        return {
            "ok": True,
            "message": f"Demo hesap kilitlendi: {login}@{server}",
            "account": {"login": login, "server": server, "trade_mode_label": "demo"},
            "config": _mask_config(new_cfg),
        }

    @app.post("/api/engine/start")
    def api_engine_start():
        # Configuration-only preflight: never wait behind MT5/research here.
        # Fresh demo/account/Algo Trading gates remain mandatory in Trader.
        preflight = engine.preflight(check_account=False)
        if not preflight.get("ok"):
            rows = preflight.get("blocked") or []
            reason = str(rows[0].get("reason") or "") if rows else ""
            raise HTTPException(
                status_code=400,
                detail=reason or "Motor başlatılamadı: çalışabilir doğrulanmış strateji/sembol eşleşmesi yok.",
            )
        config.update({"engine": {"enabled": True}})
        try:
            journal.record_event("info", "Otomatik işlem panelden BAŞLATILDI.")
        except Exception as exc:
            log.error("Olay kaydedilemedi: %s", exc)
        log.info("Otomatik işlem panelden başlatıldı.")
        return {"ok": True, "enabled": True, "preflight": preflight}

    @app.post("/api/engine/stop")
    def api_engine_stop():
        config.update({"engine": {"enabled": False}})
        try:
            journal.record_event("info", "Otomatik işlem panelden DURDURULDU.")
        except Exception as exc:
            log.error("Olay kaydedilemedi: %s", exc)
        log.info("Otomatik işlem panelden durduruldu.")
        return {"ok": True, "enabled": False}

    @app.get("/api/strategies")
    def api_strategies():
        # Local import: package import side-effect registers strategies and
        # keeps web.server free of import cycles.
        from strategies import registry
        return registry.all()

    @app.post("/api/trade/open")
    def api_trade_open(payload: dict = Body(...)):
        symbol_key = payload.get("symbol_key")
        direction = payload.get("direction")
        # SINIRSIZ SEMBOL: sabit gold/btc yerine config'te çözülen HERHANGİ bir
        # sembol anahtarı kabul edilir (özel semboller dahil).
        symbols = mt5c.resolve_symbols() or {}
        if symbol_key not in symbols:
            raise HTTPException(
                status_code=400,
                detail="Geçersiz/çözülemeyen sembol anahtarı: %s (mevcut: %s)"
                % (symbol_key, ", ".join(sorted(symbols.keys())) or "yok"),
            )
        if direction not in VALID_DIRECTIONS:
            raise HTTPException(status_code=400, detail="Geçersiz yön (buy veya sell olmalı).")
        lot = _to_float(payload.get("lot"), "lot")
        sl_price = _to_float(payload.get("sl_price"), "sl_price")
        tp_price = _to_float(payload.get("tp_price"), "tp_price")
        if lot is not None and lot <= 0:
            raise HTTPException(status_code=400, detail="Lot 0'dan büyük olmalıdır.")
        symbol = symbols.get(symbol_key)
        if not symbol:
            raise HTTPException(status_code=400, detail="Sembol çözümlenemedi: %s" % symbol_key)
        return trader.open_trade(
            symbol,
            direction,
            lot=lot,
            sl_price=sl_price,
            tp_price=tp_price,
            comment="manual",
        )

    @app.post("/api/trade/close")
    def api_trade_close(payload: dict = Body(...)):
        try:
            ticket = int(payload.get("ticket"))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Geçerli bir ticket numarası gerekli.")
        return trader.close_position(ticket)

    @app.post("/api/trade/close_all")
    def api_trade_close_all(payload: dict = Body(default={})):
        symbol = None
        if isinstance(payload, dict) and payload.get("symbol_key"):
            symbols = mt5c.resolve_symbols() or {}
            symbol = symbols.get(payload["symbol_key"])  # çözülemezse None → tümü
        return trader.close_all(symbol)

    @app.get("/api/learn")
    def api_learn():
        # Imported inside the handler to avoid import cycles (SPEC requirement).
        from analysis import learner
        return learner.analyze(journal, config)

    @app.get("/api/stats")
    def api_stats():
        return journal.stats(source=execution_source(config.get()))

    @app.get("/api/scoreboard")
    def api_scoreboard():
        from analysis import scoreboard
        return scoreboard.build(journal, source=execution_source(config.get()))

    @app.get("/api/health")
    def api_health():
        # Auth'suz uç (tünel üzerinden herkese açık): yalnız canlılık sinyali
        # döndür. Motor durumu / hesap / araştırma adayları gibi işletim
        # bilgileri kimliksiz sızmasın diye auth'lu /api/status'a bırakıldı.
        return {"ok": True, "mode": "MT5_DEMO_ONLY"}

    @app.get("/api/research/status")
    def api_research_status():
        if research is None:
            raise HTTPException(status_code=503, detail="Araştırma servisi bağlı değil")
        return research.status()

    @app.get("/api/research/latest")
    def api_research_latest():
        if research is None:
            raise HTTPException(status_code=503, detail="Araştırma servisi bağlı değil")
        return research.latest()

    @app.post("/api/research/run")
    def api_research_run():
        if research is None:
            raise HTTPException(status_code=503, detail="Araştırma servisi bağlı değil")
        return research.trigger()

    @app.post("/api/research/approve")
    def api_research_approve(payload: dict = Body(...)):
        if research is None:
            raise HTTPException(status_code=503, detail="Araştırma servisi bağlı değil")
        try:
            return research.approve(
                str(payload.get("symbol_key") or ""),
                str(payload.get("strategy") or ""),
                str(payload.get("reviewer") or ""),
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    @app.post("/api/research/rollback")
    def api_research_rollback(payload: dict = Body(...)):
        if research is None:
            raise HTTPException(status_code=503, detail="Araştırma servisi bağlı değil")
        try:
            return research.rollback(
                str(payload.get("symbol_key") or ""),
                str(payload.get("reviewer") or ""),
                str(payload.get("reason") or ""),
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    # ---------------------------------------------------------- static files
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

    @app.get("/")
    def index():
        return FileResponse(STATIC_DIR / "index.html")

    return app
