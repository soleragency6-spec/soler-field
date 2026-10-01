from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from jwt import PyJWKClient

from config import settings
from db import admin_conn

bearer = HTTPBearer(auto_error=True)
_jwks_client: PyJWKClient | None = None


def _jwks() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(settings.SUPABASE_JWKS_URL, cache_keys=True)
    return _jwks_client


async def current_claims(cred: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
    token = cred.credentials
    try:
        signing_key = _jwks().get_signing_key_from_jwt(token).key
        claims = jwt.decode(
            token,
            signing_key,
            algorithms=["ES256", "RS256", "EdDSA"],
            audience="authenticated",
            issuer=f"{settings.SUPABASE_URL}/auth/v1",
            options={"require": ["sub", "exp"]},
        )
        return claims
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=401, detail="Token invalide") from e


async def _ensure_workspace(user_id: str, email: str | None) -> tuple[str | None, bool]:
    """Return (workspace_id, is_admin). Auto-provision a workspace for pros."""
    async with admin_conn() as conn:
        is_admin = await conn.fetchval(
            "select true from fieldpro.app_admins where user_id=$1", user_id
        )
        if is_admin:
            return None, True
        ws = await conn.fetchval(
            "select workspace_id from fieldpro.workspace_members where user_id=$1 limit 1",
            user_id,
        )
        if ws:
            return str(ws), False
        # provision a fresh workspace for this professional
        name = (email or "Mon entreprise").split("@")[0]
        ws = await conn.fetchval(
            "insert into fieldpro.workspaces (name) values ($1) returning id", name
        )
        await conn.execute(
            "insert into fieldpro.workspace_members (workspace_id,user_id,role) values ($1,$2,'owner')",
            ws, user_id,
        )
        await conn.execute(
            """insert into fieldpro.brand_settings (workspace_id, company_name, app_name, email)
               values ($1,$2,'SOLER',$3) on conflict (workspace_id) do nothing""",
            ws, name, email,
        )
        await conn.execute(
            "insert into fieldpro.subscriptions (workspace_id) values ($1) on conflict do nothing",
            ws,
        )
        return str(ws), False


class Principal:
    def __init__(self, claims: dict, workspace_id: str | None, is_admin: bool):
        self.claims = claims
        self.user_id = claims["sub"]
        self.email = claims.get("email")
        self.workspace_id = workspace_id
        self.is_admin = is_admin


async def get_principal(claims: dict = Depends(current_claims)) -> Principal:
    ws, is_admin = await _ensure_workspace(claims["sub"], claims.get("email"))
    return Principal(claims, ws, is_admin)


async def require_workspace(p: Principal = Depends(get_principal)) -> Principal:
    if not p.workspace_id:
        raise HTTPException(status_code=403, detail="Aucun espace de travail")
    return p


async def require_admin(p: Principal = Depends(get_principal)) -> Principal:
    if not p.is_admin:
        raise HTTPException(status_code=403, detail="Accès super admin requis")
    return p
