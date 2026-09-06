import asyncio
import logging
from collections.abc import Awaitable, Callable

logger = logging.getLogger(__name__)


class JobWorker:
    """Queue worker contract; persistence is supplied by Supabase in the next slice."""

    def __init__(self, poll_seconds: float = 3.0) -> None:
        self.poll_seconds = poll_seconds
        self._running = True
        self.stages: dict[str, Callable[[dict[str, object]], Awaitable[None]]] = {}

    def register(self, name: str, handler: Callable[[dict[str, object]], Awaitable[None]]) -> None:
        self.stages[name] = handler

    async def run_stage(self, name: str, payload: dict[str, object]) -> None:
        handler = self.stages.get(name)
        if handler is None:
            raise ValueError(f"Unknown job stage: {name}")
        await handler(payload)

    async def run(self) -> None:
        while self._running:
            # The SQL queue and idempotent stage handlers land next; keep the loop cancellable now.
            await asyncio.sleep(self.poll_seconds)

    def stop(self) -> None:
        self._running = False
