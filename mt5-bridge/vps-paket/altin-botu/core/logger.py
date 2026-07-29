"""Logging utilities.

Configures the root logger once (console + rotating file) and maintains a
singleton in-memory ring buffer of recent log records for the web panel.
"""

import logging
import logging.handlers
import os
import threading
from collections import deque
from datetime import datetime

LOG_DIR = "data"
LOG_FILE = os.path.join(LOG_DIR, "bot.log")
LOG_FORMAT = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
LOG_MAX_BYTES = 5 * 1024 * 1024
LOG_BACKUP_COUNT = 3
UI_BUFFER_SIZE = 200

_configure_lock = threading.Lock()
_configured = False


class UiLogBuffer:
    """Singleton ring buffer holding the latest log records for the panel.

    Each record is a dict: {"time": iso_str, "level": str, "msg": str}.
    """

    _instance = None
    _instance_lock = threading.Lock()

    def __new__(cls):
        with cls._instance_lock:
            if cls._instance is None:
                instance = super().__new__(cls)
                instance._records = deque(maxlen=UI_BUFFER_SIZE)
                instance._lock = threading.Lock()
                cls._instance = instance
            return cls._instance

    def append(self, record: dict) -> None:
        with self._lock:
            self._records.append(record)

    def snapshot(self) -> list:
        """Return records oldest-first (insertion order)."""
        with self._lock:
            return list(self._records)


class _UiLogHandler(logging.Handler):
    """Logging handler that appends INFO+ records to the UiLogBuffer."""

    def __init__(self):
        super().__init__(level=logging.INFO)
        self._buffer = UiLogBuffer()

    def emit(self, record: logging.LogRecord) -> None:
        try:
            self._buffer.append(
                {
                    "time": datetime.fromtimestamp(record.created).isoformat(
                        timespec="seconds"
                    ),
                    "level": record.levelname,
                    "msg": record.getMessage(),
                }
            )
        except Exception:
            self.handleError(record)


def _configure_root() -> None:
    """Configure the root logger exactly once (thread-safe)."""
    global _configured
    with _configure_lock:
        if _configured:
            return

        os.makedirs(LOG_DIR, exist_ok=True)

        root = logging.getLogger()
        root.setLevel(logging.INFO)
        formatter = logging.Formatter(LOG_FORMAT)

        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.INFO)
        console_handler.setFormatter(formatter)
        root.addHandler(console_handler)

        file_handler = logging.handlers.RotatingFileHandler(
            LOG_FILE,
            maxBytes=LOG_MAX_BYTES,
            backupCount=LOG_BACKUP_COUNT,
            encoding="utf-8",
        )
        file_handler.setLevel(logging.INFO)
        file_handler.setFormatter(formatter)
        root.addHandler(file_handler)

        root.addHandler(_UiLogHandler())

        _configured = True


def get_logger(name: str) -> logging.Logger:
    """Return a named logger; configures the root logger on first call."""
    _configure_root()
    return logging.getLogger(name)


def get_ui_logs() -> list[dict]:
    """Return buffered UI log records, newest first."""
    return list(reversed(UiLogBuffer().snapshot()))
