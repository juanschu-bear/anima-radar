from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import UUID, uuid4

from .models import Icp, ProfileAnswers, ProfileResponse, ScanCreate, ScanResponse, ScanStatus, SearchPlan


@dataclass
class ProfileRecord:
    id: UUID
    answers: ProfileAnswers
    icp: Icp | None = None
    search_plan: SearchPlan | None = None


@dataclass
class ScanRecord:
    id: UUID
    request: ScanCreate
    status: ScanStatus = ScanStatus.queued
    counts: dict[str, int] = field(default_factory=lambda: {"found": 0, "unique": 0, "enriched": 0, "scored": 0, "drafted": 0})
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))


class DevelopmentStore:
    """Temporary local store until the Supabase repository is wired in."""

    def __init__(self) -> None:
        self.profiles: dict[UUID, ProfileRecord] = {}
        self.scans: dict[UUID, ScanRecord] = {}

    def create_profile(self, answers: ProfileAnswers) -> ProfileResponse:
        record = ProfileRecord(id=uuid4(), answers=answers)
        record.icp = Icp(what_we_sell=answers.answers.get("answer-1", ""), differentiators=[answers.answers.get("answer-5", "")], proof=[answers.answers.get("answer-6", "")], ideal_customer={"types": [], "size": None, "geo": [], "buying_signals": [], "disqualifiers": []}, languages=[answers.market_lang])
        city_answer = answers.answers.get("answer-4", "").strip()
        record.search_plan = SearchPlan(sources=["google_places", "exa"], category_keywords={"google_places": ["business in market", city_answer or "target city"], "exa": ["target company", "potential buyer"]})
        self.profiles[record.id] = record
        return ProfileResponse(id=record.id, icp=record.icp, search_plan=record.search_plan)

    def create_scan(self, request: ScanCreate) -> ScanResponse:
        record = ScanRecord(id=uuid4(), request=request)
        self.scans[record.id] = record
        return ScanResponse(id=record.id, status=record.status, city=request.city, counts=record.counts)

    def get_scan(self, scan_id: UUID) -> ScanResponse | None:
        record = self.scans.get(scan_id)
        if record is None:
            return None
        return ScanResponse(id=record.id, status=record.status, city=record.request.city, counts=record.counts)
