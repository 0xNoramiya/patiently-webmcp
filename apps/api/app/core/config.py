from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://patiently:patiently@db:5432/patiently"
    SYNC_DATABASE_URL: str = "postgresql://patiently:patiently@db:5432/patiently"
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash-lite"
    FEATHERLESS_API_KEY: str = ""
    FEATHERLESS_MODEL: str = "meta-llama/Meta-Llama-3.1-8B-Instruct"
    SPEECHMATICS_API_KEY: str = ""
    ADMIN_PASSWORD: str = "clinic2026"
    RECEPTIONIST_TOKEN: str = "demo-receptionist-token"
    PUBLIC_BASE_URL: str = "http://localhost:3000"
    CLINIC_NAME: str = "Patiently Demo Clinic"
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:8000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
