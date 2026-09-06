from pydantic import BaseModel, Field


class IcpOutput(BaseModel):
    what_we_sell: str
    differentiators: list[str]
    proof: list[str]
    ideal_customer: dict[str, object]
    languages: list[str]
    search_plan: dict[str, object]


class ExtractionOutput(BaseModel):
    locations_count: int | None = None
    products_mentioned: list[str] = Field(default_factory=list)
    price_positioning: str | None = None
    occasions: list[str] = Field(default_factory=list)
    current_supplier_hints: list[str] = Field(default_factory=list)
    decision_maker_name: str | None = None
    languages: list[str] = Field(default_factory=list)
    instagram_handle: str | None = None
    complaint_themes: list[str] = Field(default_factory=list)
    seasonality_mentions: list[str] = Field(default_factory=list)
    last_activity_hint: str | None = None


class ScoreOutput(BaseModel):
    score: int = Field(ge=0, le=100)
    reasons: list[str] = Field(min_length=3, max_length=3)
    disqualified: bool
    disqualify_reason: str | None = None
    best_channel: str
    confidence: float = Field(ge=0, le=1)


class DraftMessage(BaseModel):
    step: int = Field(ge=1, le=3)
    lang: str
    channel: str
    subject: str | None = None
    body: str


class DraftOutput(BaseModel):
    messages: list[DraftMessage] = Field(min_length=3, max_length=3)
