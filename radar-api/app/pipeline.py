from __future__ import annotations

import math
import re
from enum import StrEnum

from pydantic import BaseModel, Field

from .providers import PlaceRecord


class Channel(StrEnum):
    business_published_contact = "business_published_contact"
    instagram_dm_manual = "instagram_dm_manual"
    whatsapp_manual = "whatsapp_manual"
    telegram_manual = "telegram_manual"
    email = "email"


class CountryPolicy(BaseModel):
    allowed: list[Channel]
    first_contact_daily_limit: int | None = None
    requires_opt_out: bool = False


def channel_policy(country: str) -> CountryPolicy:
    normalized = country.strip().upper()
    if normalized == "CA":
        return CountryPolicy(allowed=[Channel.business_published_contact, Channel.instagram_dm_manual], requires_opt_out=True)
    if normalized in {"RU", "KZ", "BY"}:
        return CountryPolicy(allowed=[Channel.whatsapp_manual, Channel.telegram_manual, Channel.email], first_contact_daily_limit=30)
    return CountryPolicy(allowed=[Channel.whatsapp_manual, Channel.email])


class PreFilterInput(BaseModel):
    prospect: PlaceRecord
    center_lat: float
    center_lng: float
    radius_m: int
    icp_disqualifiers: list[str] = Field(default_factory=list)


class PreFilterResult(BaseModel):
    disqualified: bool
    reason: str | None = None
    distance_m: float | None = None


def pre_filter(input_data: PreFilterInput) -> PreFilterResult:
    prospect = input_data.prospect
    if prospect.business_status and prospect.business_status != "OPERATIONAL":
        return PreFilterResult(disqualified=True, reason=f"business_status={prospect.business_status}")
    if prospect.lat is not None and prospect.lng is not None:
        distance = distance_between_m(input_data.center_lat, input_data.center_lng, prospect.lat, prospect.lng)
        if distance > input_data.radius_m:
            return PreFilterResult(disqualified=True, reason="outside_radius", distance_m=distance)
        return PreFilterResult(disqualified=False, distance_m=distance)
    normalized_category = " ".join([prospect.name.lower(), *(value.lower() for value in prospect.types)])
    for disqualifier in input_data.icp_disqualifiers:
        if disqualifier.lower() in normalized_category:
            return PreFilterResult(disqualified=True, reason=f"icp_disqualifier={disqualifier}")
    return PreFilterResult(disqualified=False)


def distance_between_m(lat_a: float, lng_a: float, lat_b: float, lng_b: float) -> float:
    earth_radius_m = 6_371_000.0
    phi_a, phi_b = math.radians(lat_a), math.radians(lat_b)
    delta_phi = math.radians(lat_b - lat_a)
    delta_lambda = math.radians(lng_b - lng_a)
    haversine = math.sin(delta_phi / 2) ** 2 + math.cos(phi_a) * math.cos(phi_b) * math.sin(delta_lambda / 2) ** 2
    return 2 * earth_radius_m * math.atan2(math.sqrt(haversine), math.sqrt(1 - haversine))


def normalized_domain(url: str | None) -> str | None:
    if not url:
        return None
    value = re.sub(r"^https?://", "", url.lower()).split("/", 1)[0]
    return value.removeprefix("www.") or None


def dedupe_places(records: list[PlaceRecord]) -> list[PlaceRecord]:
    groups: dict[tuple[str, str | None, str | None], PlaceRecord] = {}
    for record in records:
        key = (" ".join(record.name.lower().split()), record.phone, normalized_domain(record.website))
        existing = groups.get(key)
        if existing is None or _field_count(record) > _field_count(existing):
            groups[key] = record
    return list(groups.values())


def _field_count(record: PlaceRecord) -> int:
    return sum(value is not None and value != "" for value in (record.address, record.website, record.phone, record.lat, record.lng, record.rating, record.review_count, record.business_status, record.primary_type))
