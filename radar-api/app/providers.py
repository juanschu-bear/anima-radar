from __future__ import annotations

from dataclasses import dataclass
from typing import TypeVar

import httpx
from pydantic import BaseModel, ConfigDict, Field

from .config import Settings

T = TypeVar("T", bound=BaseModel)


class PlaceRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")

    source: str
    source_id: str
    name: str
    address: str | None = None
    website: str | None = None
    phone: str | None = None
    lat: float | None = None
    lng: float | None = None
    rating: float | None = None
    review_count: int | None = None
    business_status: str | None = None
    primary_type: str | None = None
    types: list[str] = Field(default_factory=list)
    reviews: list[dict[str, object]] = Field(default_factory=list)
    raw: dict[str, object] = Field(default_factory=dict)


class GooglePlacesClient:
    endpoint = "https://places.googleapis.com/v1/places:searchText"
    field_mask = ",".join(("places.id", "places.displayName", "places.formattedAddress", "places.location", "places.websiteUri", "places.nationalPhoneNumber", "places.rating", "places.userRatingCount", "places.primaryType", "places.types", "places.businessStatus", "nextPageToken"))

    def __init__(self, api_key: str, client: httpx.AsyncClient) -> None:
        self.api_key = api_key
        self.client = client

    async def search_text(self, query: str, lat: float, lng: float, radius_m: int, language_code: str, limit: int = 300) -> list[PlaceRecord]:
        records: list[PlaceRecord] = []
        page_token: str | None = None
        while len(records) < limit:
            body: dict[str, object] = {"textQuery": query, "pageSize": min(20, limit - len(records)), "languageCode": language_code, "locationBias": {"circle": {"center": {"latitude": lat, "longitude": lng}, "radius": radius_m}}}
            if page_token:
                body["pageToken"] = page_token
            response = await self.client.post(self.endpoint, headers={"X-Goog-Api-Key": self.api_key, "X-Goog-FieldMask": self.field_mask}, json=body)
            response.raise_for_status()
            payload = response.json()
            places = payload.get("places", []) if isinstance(payload, dict) else []
            if not isinstance(places, list):
                break
            records.extend(self._place(place) for place in places if isinstance(place, dict))
            next_token = payload.get("nextPageToken") if isinstance(payload, dict) else None
            page_token = next_token if isinstance(next_token, str) and next_token else None
            if not page_token or not places:
                break
        return records[:limit]

    async def get_details(self, place_id: str, language_code: str = "en") -> PlaceRecord:
        resource = place_id if place_id.startswith("places/") else f"places/{place_id}"
        response = await self.client.get(f"https://places.googleapis.com/v1/{resource}", headers={"X-Goog-Api-Key": self.api_key, "X-Goog-FieldMask": "displayName,formattedAddress,location,websiteUri,nationalPhoneNumber,rating,userRatingCount,reviews,primaryType,types,businessStatus", "Accept-Language": language_code})
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            raise ValueError("Google Places details response was not an object")
        return self._place({**payload, "id": place_id.removeprefix("places/")})

    @staticmethod
    def _place(place: dict[str, object]) -> PlaceRecord:
        display = place.get("displayName")
        location = place.get("location")
        display_name = display.get("text") if isinstance(display, dict) else None
        coords = location if isinstance(location, dict) else {}
        reviews = place.get("reviews")
        types = place.get("types")
        return PlaceRecord(source="google_places", source_id=str(place.get("id", "")), name=str(display_name or "Unnamed place"), address=str(place["formattedAddress"]) if isinstance(place.get("formattedAddress"), str) else None, website=str(place["websiteUri"]) if isinstance(place.get("websiteUri"), str) else None, phone=str(place["nationalPhoneNumber"]) if isinstance(place.get("nationalPhoneNumber"), str) else None, lat=float(coords["latitude"]) if isinstance(coords.get("latitude"), (int, float)) else None, lng=float(coords["longitude"]) if isinstance(coords.get("longitude"), (int, float)) else None, rating=float(place["rating"]) if isinstance(place.get("rating"), (int, float)) else None, review_count=int(place["userRatingCount"]) if isinstance(place.get("userRatingCount"), int) else None, business_status=str(place["businessStatus"]) if isinstance(place.get("businessStatus"), str) else None, primary_type=str(place["primaryType"]) if isinstance(place.get("primaryType"), str) else None, types=[str(value) for value in types if isinstance(value, str)] if isinstance(types, list) else [], reviews=[value for value in reviews if isinstance(value, dict)] if isinstance(reviews, list) else [], raw=place)


class ExaClient:
    endpoint = "https://api.exa.ai/search"

    def __init__(self, api_key: str, client: httpx.AsyncClient) -> None:
        self.api_key = api_key
        self.client = client

    async def search_company(self, query: str, limit: int = 50) -> list[PlaceRecord]:
        payload = {"query": query, "type": "auto", "numResults": min(50, limit), "category": "company", "includeDomains": [], "contents": {"text": True}}
        response = await self.client.post(self.endpoint, headers={"x-api-key": self.api_key, "Content-Type": "application/json"}, json=payload)
        response.raise_for_status()
        body = response.json()
        results = body.get("results", []) if isinstance(body, dict) else []
        return [PlaceRecord(source="exa", source_id=str(item.get("id", item.get("url", ""))), name=str(item.get("title", "Untitled company")), website=str(item["url"]) if isinstance(item.get("url"), str) else None, raw=item) for item in results if isinstance(item, dict)]


class TwoGisClient:
    endpoint = "https://catalog.api.2gis.com/3.0/items"

    def __init__(self, api_key: str, client: httpx.AsyncClient) -> None:
        self.api_key = api_key
        self.client = client

    async def search(self, query: str, lon: float, lat: float, radius_m: int, locale: str = "ru_RU", limit: int = 300) -> list[PlaceRecord]:
        records: list[PlaceRecord] = []
        page = 1
        while len(records) < limit:
            params = {"key": self.api_key, "q": query, "point": f"{lon},{lat}", "radius": radius_m, "page": page, "page_size": min(50, limit - len(records)), "locale": locale, "fields": "items.point,items.contact_groups,items.reviews,items.rubrics,items.org"}
            response = await self.client.get(self.endpoint, params=params)
            response.raise_for_status()
            body = response.json()
            result = body.get("result", {}) if isinstance(body, dict) else {}
            items = result.get("items", []) if isinstance(result, dict) else []
            if not isinstance(items, list) or not items:
                break
            records.extend(self._item(item) for item in items if isinstance(item, dict))
            if len(items) < params["page_size"]:
                break
            page += 1
        return records[:limit]

    @staticmethod
    def _item(item: dict[str, object]) -> PlaceRecord:
        point = item.get("point") if isinstance(item.get("point"), dict) else {}
        return PlaceRecord(source="2gis", source_id=str(item.get("id", "")), name=str(item.get("name", "Unnamed place")), address=str(item["address_name"]) if isinstance(item.get("address_name"), str) else None, lat=float(point["lat"]) if isinstance(point.get("lat"), (int, float)) else None, lng=float(point["lon"]) if isinstance(point.get("lon"), (int, float)) else None, raw=item)


@dataclass(frozen=True)
class ProviderClients:
    google: GooglePlacesClient | None
    exa: ExaClient | None
    twogis: TwoGisClient | None


def create_provider_clients(settings: Settings, client: httpx.AsyncClient) -> ProviderClients:
    return ProviderClients(google=GooglePlacesClient(settings.google_places_api_key, client) if settings.google_places_api_key else None, exa=ExaClient(settings.exa_api_key, client) if settings.exa_api_key else None, twogis=TwoGisClient(settings.twogis_api_key, client) if settings.twogis_api_key else None)
