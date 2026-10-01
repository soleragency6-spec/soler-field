import json
from contextlib import asynccontextmanager

import asyncpg

from config import settings

_pool: asyncpg.Pool | None = None


async def _init_conn(conn: asyncpg.Connection):
    # decode json/jsonb into python objects and back
    await conn.set_type_codec(
        "jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog"
    )
    await conn.set_type_codec(
        "json", encoder=json.dumps, decoder=json.loads, schema="pg_catalog"
    )


async def init_pool():
    global _pool
    if _pool is None:
        import ssl

        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        _pool = await asyncpg.create_pool(
            dsn=settings.DATABASE_URL,
            ssl=ctx,
            min_size=1,
            max_size=8,
            init=_init_conn,
            command_timeout=30,
        )
    return _pool


async def close_pool():
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


@asynccontextmanager
async def admin_conn():
    """Connection as table owner (bypasses RLS) — for provisioning/admin only."""
    pool = await init_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            yield conn


@asynccontextmanager
async def tenant_conn(claims: dict):
    """RLS-enforced connection: runs as `authenticated` with request.jwt.claims set."""
    pool = await init_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("set local role authenticated")
            await conn.execute(
                "select set_config('request.jwt.claims', $1, true)",
                json.dumps(claims),
            )
            yield conn
