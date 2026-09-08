from datetime import datetime
from enum import StrEnum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class ProfileAnswers(BaseModel):
    answers: dict[str, str] = Field(min_length=1)
    market_lang: str = "en-CA"
    tenant_tone: str = "concrete and respectful"


class SearchPlan(BaseModel):
    sources: list[str] = Field(default_factory=list)
    category_keywords: dict[str, list[str]] = Field(default_factory=dict)
    clarifying_questions: list[str] = Field(default_factory=list, max_length=2)


class Icp(BaseModel):
    what_we_sell: str
    differentiators: list[str]
    proof: list[str]
    ideal_customer: dict[str, object]
    languages: list[str]


class ProfileResponse(BaseModel):
    id: UUID
    icp: Icp | None
    search_plan: SearchPlan | None


class ScanStatus(StrEnum):
    queued = "queued"
    discovering = "discovering"
    enriching = "enriching"
    scoring = "scoring"
    drafting = "drafting"
    done = "done"
    failed = "failed"


class ScanCreate(BaseModel):
    profile_id: UUID | None = None
    city: str = Field(min_length=1)
    country: str = Field(min_length=2, max_length=2)
    lat: float | None = None
    lng: float | None = None
    radius_m: int = Field(default=15000, gt=0)
    categories: list[str] = Field(min_length=1)
    sources: list[str] = Field(default_factory=lambda: ["google_places"])


class ScanResponse(BaseModel):
    id: UUID
    status: ScanStatus
    city: str
    counts: dict[str, int]


class HealthResponse(BaseModel):
    ok: Literal[True]
    service: Literal["radar-api"]
    environment: str
    mode: Literal["development-store", "supabase-queue"]
    supabase_configured: bool
    queue_ready: bool
