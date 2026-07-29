"""Strategy package.

Importing this package registers all built-in strategies via their
module-level registration side effects.
"""
from strategies import registry  # noqa: F401
from strategies.base import Signal, Strategy  # noqa: F401

# Import strategy modules so their @registry.register decorators run.
from strategies import gold_structure  # noqa: F401
from strategies import technical_setups  # noqa: F401
from strategies import trend_momentum  # noqa: F401

__all__ = [
    "Signal", "Strategy", "registry",
    "trend_momentum", "gold_structure", "technical_setups",
]
