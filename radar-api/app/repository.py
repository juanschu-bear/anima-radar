from __future__ import annotations

from typing import Protocol
from uuid import UUID

from .models import ScanCreate


class RadarRepository(Protocol):
    async def enqueue_scan(self, tenant_id: UUID, scan: ScanCreate) -> UUID: ...
    async def get_scan(self, tenant_id: UUID, scan_id: UUID) -> dict[str, object] | None: ...


class SupabaseRepository:
    """REST repository boundary; credentials are supplied only on the API side."""

    def __init__(self, url: str, service_role_key: str) -> None:
        self.url = url.rstrip("/")
        self.service_role_key = service_role_key

    async def enqueue_scan(self, tenant_id: UUID, scan: ScanCreate) -> UUID:
        import httpx

        payload = {"tenant_id": str(tenant_id), **scan.model_dump(mode="json"), "status": "queued", "counts": {"found": 0, "unique": 0, "enriched": 0, "scored": 0, "drafted": 0}}
        headers = {"apikey": self.service_role_key, "Authorization": f"Bearer {self.service_role_key}", "Prefer": "return=representation"}
        async with httpx.AsyncClient() as client:
            response = await client.post(f"{self.url}/rest/v1/scans", headers=headers, json=payload)
            response.raise_for_status()
            rows = response.json()
        if not isinstance(rows, list) or not rows or not isinstance(rows[0], dict) or not isinstance(rows[0].get("id"), str):
            raise ValueError("Supabase did not return the created scan")
        return UUID(rows[0]["id"])

    async def get_scan(self, tenant_id: UUID, scan_id: UUID) -> dict[str, object] | None:
        import httpx

        headers = {"apikey": self.service_role_key, "Authorization": f"Bearer {self.service_role_key}"}
        params = {"id": f"eq.{scan_id}", "tenant_id": f"eq.{tenant_id}", "select": "id,status,city,counts"}
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{self.url}/rest/v1/scans", headers=headers, params=params)
            response.raise_for_status()
            rows = response.json()
        return rows[0] if isinstance(rows, list) and rows and isinstance(rows[0], dict) else None
