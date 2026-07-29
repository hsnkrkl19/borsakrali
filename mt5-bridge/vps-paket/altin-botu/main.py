"""Entry point for the MT5 Gold/BTC bot.

Builds the shared objects (config, MT5 client, journal, risk, trader,
engine), starts the engine background thread and serves the web panel
with uvicorn in the main thread.

Import-safe: nothing is started at import time; all startup happens in
main() under the __main__ guard.

DAYANIKLILIK: web paneli portu meşgulse (başka altın botu, vs.) bot ARTIK
KAPANMAZ — boş bir port dener; o da yoksa panelsiz (headless) çalışmaya devam
eder. Motor arka plan iş parçacığında işlem açmayı sürdürür. Böylece VPS'te
sürekli açık kalır, elle müdahale gerekmez.
"""


def _find_free_port(bind_host, preferred, span=15):
    """preferred..preferred+span arasında bağlanabilir ilk portu döndür (yoksa None)."""
    import socket
    for candidate in range(int(preferred), int(preferred) + span):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            s.bind((bind_host, candidate))
            return candidate
        except OSError:
            continue
        finally:
            s.close()
    return None


def _keepalive(log):
    """Panel çalışmasa bile motoru canlı tut (arka plan iş parçacığı işlem açar)."""
    import time
    log.info("Motor HEADLESS modda çalışıyor (panel yok). Durdurmak: Ctrl+C.")
    while True:
        time.sleep(3600)


def main() -> None:
    # Imports are done here so that importing this module never starts
    # anything (and never fails on machines without MetaTrader5).
    import uvicorn

    from core.config import ConfigManager
    from core.engine import Engine
    from core.journal import Journal
    from core.logger import get_logger
    from core.mt5_client import MT5Client
    from core.risk import RiskManager
    from core.trader import Trader
    from research import ResearchService
    from web.server import create_app

    log = get_logger("main")

    # Build shared objects in dependency order.
    config = ConfigManager()
    mt5c = MT5Client(config)
    journal = Journal()
    risk = RiskManager(config, mt5c, journal)
    trader = Trader(config, mt5c, risk, journal)
    engine = Engine(config, mt5c, risk, trader, journal)
    research = ResearchService(config, mt5c, journal)

    # Do not block web startup on mt5.initialize(). MT5 may spend its full
    # connection timeout launching/authorizing the terminal. The engine does
    # the same connection and initial journal sync in its background thread,
    # allowing the panel and /api/health to become available immediately.
    engine.start()
    research.start()

    cfg = config.get()
    host = str(cfg["web"]["host"])
    bind_host = "127.0.0.1" if host in ("0.0.0.0", "") else host
    preferred_port = int(cfg["web"]["port"])

    # Panel portu meşgulse boş bir port bul (bot ASLA bu yüzden kapanmaz).
    port = _find_free_port(bind_host, preferred_port)

    try:
        if port is not None:
            if port != preferred_port:
                log.warning("Panel portu %s meşgul — %s kullanılıyor.", preferred_port, port)
            panel_url = f"http://{bind_host}:{port}"
            banner = (
                "\n"
                "==============================================\n"
                "   ALTIN BOTU — MT5 Otomatik İşlem Botu\n"
                f"   Panel adresi: {panel_url}\n"
                "   Durdurmak için: Ctrl+C\n"
                "==============================================\n"
            )
            print(banner)
            log.info("Web paneli başlatılıyor: %s", panel_url)
            app = create_app(config, mt5c, risk, trader, journal, engine, research)
            try:
                uvicorn.run(app, host=host, port=port, log_level="warning")
            except OSError as exc:
                # Kontrolden sonra port kapıldıysa: motoru öldürme, panelsiz devam et.
                log.warning("Panel başlatılamadı (%s) — motor çalışmaya DEVAM ediyor.", exc)
                _keepalive(log)
        else:
            log.warning(
                "%s-%s arası boş panel portu yok — panelsiz (headless) çalışılıyor. "
                "Motor işlem açmayı sürdürür.", preferred_port, preferred_port + 15,
            )
            print(
                "\n==============================================\n"
                "   ALTIN BOTU — MT5 Otomatik İşlem Botu (PANELSİZ)\n"
                "   Panel portu meşgul; motor arka planda çalışıyor.\n"
                "   Durdurmak için: Ctrl+C\n"
                "==============================================\n"
            )
            _keepalive(log)
    except KeyboardInterrupt:
        pass
    finally:
        log.info("Bot kapatılıyor…")
        engine.stop()
        research.stop()
        mt5c.shutdown()
        try:
            journal.close()
        except Exception:
            pass
        log.info("Bot kapatıldı. Hoşça kalın!")


if __name__ == "__main__":
    main()
