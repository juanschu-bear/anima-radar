import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from uuid import UUID

from .repository import RadarRepository

logger = logging.getLogger(__name__)


class JobWorker:
    """Queue worker contract; persistence is supplied by Supabase in the next slice."""

    def __init__(self, repository: RadarRepository | None = None, poll_seconds: float = 3.0) -> None:
        self.repository = repository
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

    async def run_once(self) -> bool:
        if self.repository is None or not self.stages:
            return False

        job = await self.repository.claim_next_job(tuple(self.stages.keys()) or ("discover",))
        if not job:
            return False

        job_id = job.get("id")
        tenant_id = job.get("tenant_id")
        job_type = job.get("type")

        if not isinstance(job_id, str) or not isinstance(job_type, str):
            logger.warning("Skipping malformed job payload: %s", job)
            return False

        try:
            await self.run_stage(job_type, job)
            await self.repository.update_job(UUID(job_id), {"status": "done", "locked_at": None, "error": None})
        except Exception as error:  # noqa: BLE001
            logger.exception("Job %s failed", job_id)
            updates: dict[str, object] = {"status": "failed", "locked_at": None, "error": str(error)}
            if isinstance(tenant_id, str):
                scan_id = None
                payload = job.get("payload")
                if isinstance(payload, dict) and isinstance(payload.get("scan_id"), str):
                    scan_id = payload["scan_id"]
                if scan_id:
                    await self.repository.update_scan(
                        UUID(tenant_id),
                        UUID(scan_id),
                        {"status": "failed", "finished_at": datetime.now(UTC).isoformat(), "error": str(error)},
                    )
            await self.repository.update_job(UUID(job_id), updates)
        return True

    async def run(self) -> None:
        while self._running:
            handled = await self.run_once()
            if not handled:
                await asyncio.sleep(self.poll_seconds)

    def stop(self) -> None:
        self._running = False
