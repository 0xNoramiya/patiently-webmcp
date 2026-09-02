from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://patiently:patiently@db:5432/patiently"
    SYNC_DATABASE_URL: str = "postgresql://patiently:patiently@db:5432/patiently"
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"
    # Conversational intake. Measured against gpt-5-mini on the real intake turn:
    # 2.7s vs 17.4s, extracting the same six OPQRST fields. A patient in a
    # waiting room typing on a phone will not wait 17 seconds for a reply.
    OPENAI_MODEL: str = "gpt-4.1"
    # Chart writing, SOAP notes, prescription drafting. Measured on a real chest-pain
    # note: 3.0s vs gpt-5's 20.6s, with the same clinical content — acute coronary
    # syndrome identified, ECG and EMS in the plan. gpt-5 writes a longer note; it is
    # not a better one, and a clinician mid-consultation will not wait 20 seconds for
    # the difference. Set OPENAI_MODEL_CLINICAL=gpt-5 to trade the latency back.
    OPENAI_MODEL_CLINICAL: str = "gpt-4.1"
    # The red-flag classifier is a safety component, so it is pinned to a model
    # that still honours temperature=0. Reasoning models force temperature to 1,
    # and a triage decision that cannot be reproduced cannot be audited.
    OPENAI_MODEL_TRIAGE: str = "gpt-4.1-mini"
    # Mock consultation audio for the transcript demo.
    OPENAI_TTS_MODEL: str = "gpt-4o-mini-tts"
    SPEECHMATICS_API_KEY: str = ""
    ADMIN_PASSWORD: str = "clinic2026"
    RECEPTIONIST_TOKEN: str = "demo-receptionist-token"
    PUBLIC_BASE_URL: str = "http://localhost:3000"
    CLINIC_NAME: str = "Patiently Demo Clinic"
    #: Restore the demo dataset once the clinic has been idle for a while.
    #: Only meaningful for the public demo; never enable on real data.
    DEMO_AUTO_RESTORE: bool = False
    #: Minutes the clinic must sit untouched before it is restored.
    DEMO_RESTORE_IDLE_MINUTES: int = 10
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:8000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
