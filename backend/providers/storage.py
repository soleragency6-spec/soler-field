"""Object storage provider abstraction.

Production target: Cloudflare R2 (S3-compatible). Until R2 credentials are
configured, files are stored on the backend disk (development only). Switching
to R2 requires only environment configuration — no business-logic changes.
"""
import hashlib
import hmac
import time
from pathlib import Path

from config import settings


class StorageProvider:
    name = "base"

    def put(self, key: str, data: bytes, content_type: str) -> None:
        raise NotImplementedError

    def get_bytes(self, key: str) -> bytes:
        raise NotImplementedError

    def delete(self, key: str) -> None:
        raise NotImplementedError

    def download_url(self, key: str, expires: int = 3600) -> str:
        raise NotImplementedError


class LocalStorage(StorageProvider):
    name = "local"

    def __init__(self):
        settings.STORAGE_DIR.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        p = settings.STORAGE_DIR / key
        p.parent.mkdir(parents=True, exist_ok=True)
        return p

    def put(self, key: str, data: bytes, content_type: str) -> None:
        self._path(key).write_bytes(data)

    def get_bytes(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def delete(self, key: str) -> None:
        p = settings.STORAGE_DIR / key
        if p.exists():
            p.unlink()

    def download_url(self, key: str, expires: int = 3600) -> str:
        exp = int(time.time()) + expires
        sig = self._sign(key, exp)
        return f"/api/files?key={key}&exp={exp}&sig={sig}"

    @staticmethod
    def _sign(key: str, exp: int) -> str:
        msg = f"{key}:{exp}".encode()
        return hmac.new(settings.FILE_SIGNING_SECRET.encode(), msg, hashlib.sha256).hexdigest()

    @staticmethod
    def verify(key: str, exp: int, sig: str) -> bool:
        if exp < int(time.time()):
            return False
        expected = LocalStorage._sign(key, exp)
        return hmac.compare_digest(expected, sig)


class R2Storage(StorageProvider):
    name = "r2"

    def __init__(self):
        import boto3

        endpoint = settings.R2_ENDPOINT or f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
        self.bucket = settings.R2_BUCKET_NAME
        self.client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=settings.R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            region_name="auto",
        )

    def put(self, key: str, data: bytes, content_type: str) -> None:
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)

    def get_bytes(self, key: str) -> bytes:
        return self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)

    def download_url(self, key: str, expires: int = 3600) -> str:
        return self.client.generate_presigned_url(
            "get_object", Params={"Bucket": self.bucket, "Key": key}, ExpiresIn=expires
        )


_provider: StorageProvider | None = None


def storage() -> StorageProvider:
    global _provider
    if _provider is None:
        _provider = R2Storage() if settings.r2_enabled else LocalStorage()
    return _provider
