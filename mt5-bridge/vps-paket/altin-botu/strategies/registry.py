"""Strategy registry.

Strategies register themselves at import time (see strategies/__init__.py,
which imports each strategy module for its registration side effect).
"""
from __future__ import annotations

import copy
import threading

from core.logger import get_logger
from strategies.base import Strategy

log = get_logger(__name__)

_lock = threading.RLock()
_strategies: dict[str, Strategy] = {}


def register(cls: type[Strategy]) -> type[Strategy]:
    """Register a Strategy subclass (usable as a class decorator).

    Instantiates the class once and stores the instance keyed by its
    unique `name`. Returns the class so it can be used as a decorator.
    """
    instance = cls()
    if not instance.name:
        raise ValueError("Strateji kaydı başarısız: 'name' özniteliği boş olamaz")
    with _lock:
        if instance.name in _strategies:
            log.warning("Strateji yeniden kaydediliyor (üzerine yazılıyor): %s", instance.name)
        _strategies[instance.name] = instance
    log.info("Strateji kaydedildi: %s (%s)", instance.name, instance.display_name)
    return cls


def get(name: str) -> Strategy:
    """Return the registered Strategy instance for `name`.

    Raises KeyError with a Turkish message if the strategy is unknown.
    """
    with _lock:
        strategy = _strategies.get(name)
    if strategy is None:
        raise KeyError(f"Strateji bulunamadı: {name}")
    return strategy


def all() -> list[dict]:  # noqa: A001 - name mandated by SPEC
    """Return metadata for all registered strategies (for the web panel)."""
    with _lock:
        items = list(_strategies.values())
    return [
        {
            "name": s.name,
            "display_name": s.display_name,
            "description": s.description,
            "symbols": copy.deepcopy(s.symbols),
            "default_params": copy.deepcopy(s.default_params),
        }
        for s in items
    ]
