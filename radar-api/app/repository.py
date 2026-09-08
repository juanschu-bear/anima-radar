from __future__ import annotations

from datetime import UTC, datetime
from typing import Protocol
from uuid import UUID

from .models import ScanCreate


class RadarRepository(Protocol):
    async def enqueue_scan(self, tenant_id: UUID, scan: ScanCreate) -> UUID: ...
    async def get_scan(self, tenant_id: UUID, scan_id: UUID) -> dict[str, object] | None: ...
    async def claim_next_job(self, job_types: tuple[str, ...] = ("discover",)) -> dict[str, object] | None: ...
    async def update_job(self, job_id: UUID, updates: dict[str, object]) -> dict[str, object] | None: ...
    async def update_scan(self, tenant_id: UUID, scan_id: UUID, updates: dict[str, object]) -> dict[str, object] | None: ...


class SupabaseRepository:
    """REST repository boundary; credentials are supplied only on the API side."""

    def __init__(self, url: str, service_role_key: str) -> None:
        self.url = url.rstrip("/")
        self.service_role_key = service_role_key

    async def enqueue_scan(self, tenant_id: UUID, scan: ScanCreate) -> UUID:
        payload = {"tenant_id": str(tenant_id), **scan.model_dump(mode="json"), "status": "queued", "counts": {"found": 0, "unique": 0, "enriched": 0, "scored": 0, "drafted": 0}}
        rows = await self._request("POST", "/rest/v1/scans", json=payload, prefer_representation=True)
        if not isinstance(rows, list) or not rows or not isinstance(rows[0], dict) or not isinstance(rows[0].get("id"), str):
            raise ValueError("Supabase did not return the created scan")
        return UUID(rows[0]["id"])

    async def get_scan(self, tenant_id: UUID, scan_id: UUID) -> dict[str, object] | None:
        params = {"id": f"eq.{scan_id}", "tenant_id": f"eq.{tenant_id}", "select": "id,status,city,counts"}
        rows = await self._request("GET", "/rest/v1/scans", params=params)
        return rows[0] if isinstance(rows, list) and rows and isinstance(rows[0], dict) else None

    async def claim_next_job(self, job_types: tuple[str, ...] = ("discover",)) -> dict[str, object] | None:
        now = datetime.now(UTC).isoformat()
        params = {
            "select": "id,tenant_id,type,payload,status,attempts,run_after,locked_at,created_at",
            "status": "eq.queued",
            "run_after": f"lte.{now}",
            "order": "run_after.asc,created_at.asc",
            "limit": "1",
        }
        if job_types:
            params["type"] = f"in.({','.join(job_types)})"
        rows = await self._request("GET", "/rest/v1/jobs", params=params)
        if not isinstance(rows, list) or not rows or not isinstance(rows[0], dict):
            return None
        job = rows[0]
        job_id = job.get("id")
        attempts = job.get("attempts")
        if not isinstance(job_id, str):
            return None
        claimed = await self.update_job(
            UUID(job_id),
            {
                "status": "running",
                "locked_at": now,
                "attempts": int(attempts) + 1 if isinstance(attempts, int) else 1,
                "error": None,
            },
        )
        return claimed

    async def update_job(self, job_id: UUID, updates: dict[str, object]) -> dict[str, object] | None:
        params = {"id": f"eq.{job_id}", "select": "id,tenant_id,type,payload,status,attempts,run_after,locked_at,created_at,error"}
        rows = await self._request("PATCH", "/rest/v1/jobs", params=params, json=updates, prefer_representation=True)
        return rows[0] if isinstance(rows, list) and rows and isinstance(rows[0], dict) else None

    async def update_scan(self, tenant_id: UUID, scan_id: UUID, updates: dict[str, object]) -> dict[str, object] | None:
        params = {"id": f"eq.{scan_id}", "tenant_id": f"eq.{tenant_id}", "select": "id,status,city,counts,error,started_at,finished_at"}
        rows = await self._request("PATCH", "/rest/v1/scans", params=params, json=updates, prefer_representation=True)
        return rows[0] if isinstance(rows, list) and rows and isinstance(rows[0], dict) else None

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
        json: dict[str, object] | None = None,
        prefer_representation: bool = False,
    ) -> object:
        import httpx

        headers = {
            "apikey": self.service_role_key,
            "Authorization": f"Bearer {self.service_role_key}",
        }
        if prefer_representation:
            headers["Prefer"] = "return=representation"
        async with httpx.AsyncClient() as client:
            response = await client.request(method, f"{self.url}{path}", headers=headers, params=params, json=json)
            response.raise_for_status()
            return response.json()
