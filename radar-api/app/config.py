from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str | None = None
    supabase_service_role_key: str | None = None
    anthropic_api_key: str | None = None
    google_places_api_key: str | None = None
    exa_api_key: str | None = None
    twogis_api_key: str | None = None
    jina_api_key: str | None = None
    radar_env: str = "development"
    radar_allowed_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])


@lru_cache
def get_settings() -> Settings:
    return Settings()
