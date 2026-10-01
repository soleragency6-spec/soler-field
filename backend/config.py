import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")


class Settings:
    SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
    SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
    SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    SUPABASE_JWKS_URL = os.environ.get("SUPABASE_JWKS_URL", "")
    DATABASE_URL = os.environ.get("DATABASE_URL", "")

    R2_ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID", "")
    R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID", "")
    R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "")
    R2_BUCKET_NAME = os.environ.get("R2_BUCKET_NAME", "")
    R2_ENDPOINT = os.environ.get("R2_ENDPOINT", "")

    RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
    RESEND_FROM = os.environ.get("RESEND_FROM", "")

    FILE_SIGNING_SECRET = os.environ.get("FILE_SIGNING_SECRET", "dev-secret")

    AI_PROVIDER = os.environ.get("AI_PROVIDER", "")
    AI_API_KEY = os.environ.get("AI_API_KEY", "")

    STORAGE_DIR = ROOT_DIR / "_storage"

    @property
    def r2_enabled(self) -> bool:
        return bool(self.R2_ACCOUNT_ID and self.R2_ACCESS_KEY_ID and self.R2_SECRET_ACCESS_KEY and self.R2_BUCKET_NAME)

    @property
    def email_enabled(self) -> bool:
        return bool(self.RESEND_API_KEY and self.RESEND_FROM)

    @property
    def ai_enabled(self) -> bool:
        return bool(self.AI_PROVIDER and self.AI_API_KEY)


settings = Settings()
