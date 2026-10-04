"""
db.py — SQLite session cache for PITWALL.

Simple async key-value store using aiosqlite.
Keys: "timing", "weather", "race_control", "session", "track_status",
      "driver_list", "tyres"
Values: JSON strings. updated_at: Unix timestamp.
"""
import json
import time
import logging
from pathlib import Path

import aiosqlite

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).parent / "pitwall_cache.db"


async def init_db() -> None:
    """Create the session_cache table if it doesn't exist. Call on startup."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS session_cache (
                key        TEXT PRIMARY KEY,
                value      TEXT NOT NULL,
                updated_at REAL NOT NULL
            )
        """)
        await db.commit()
    logger.info("DB initialised at %s", DB_PATH)


async def cache_set(key: str, value: dict) -> None:
    """Upsert a key with a JSON-serialised dict value."""
    try:
        payload = json.dumps(value, default=str)
        ts = time.time()
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                """
                INSERT INTO session_cache (key, value, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                    value      = excluded.value,
                    updated_at = excluded.updated_at
                """,
                (key, payload, ts),
            )
            await db.commit()
    except Exception:
        logger.exception("cache_set failed for key=%r", key)


CACHE_TTL_SECONDS = 3 * 3600  # 3 hours max cache retention


async def cache_prune_expired() -> int:
    """Delete any cached rows older than CACHE_TTL_SECONDS."""
    try:
        cutoff = time.time() - CACHE_TTL_SECONDS
        async with aiosqlite.connect(DB_PATH) as db:
            cursor = await db.execute("DELETE FROM session_cache WHERE updated_at < ?", (cutoff,))
            deleted = cursor.rowcount
            await db.commit()
        if deleted > 0:
            logger.info("Pruned %d expired session cache entries", deleted)
        return deleted
    except Exception:
        logger.exception("cache_prune_expired failed")
        return 0


async def cache_get(key: str) -> dict | None:
    """Return the cached dict for `key`, or None if not found or expired."""
    try:
        cutoff = time.time() - CACHE_TTL_SECONDS
        async with aiosqlite.connect(DB_PATH) as db:
            async with db.execute(
                "SELECT value FROM session_cache WHERE key = ? AND updated_at >= ?", (key, cutoff)
            ) as cursor:
                row = await cursor.fetchone()
        if row:
            return json.loads(row[0])
        return None
    except Exception:
        logger.exception("cache_get failed for key=%r", key)
        return None


async def cache_get_all() -> dict:
    """Return all valid (non-expired) cached entries as {key: dict}. Prunes expired rows."""
    result: dict = {}
    try:
        cutoff = time.time() - CACHE_TTL_SECONDS
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute("DELETE FROM session_cache WHERE updated_at < ?", (cutoff,))
            await db.commit()
            async with db.execute("SELECT key, value FROM session_cache") as cursor:
                rows = await cursor.fetchall()
        for key, raw in rows:
            try:
                result[key] = json.loads(raw)
            except json.JSONDecodeError:
                pass
    except Exception:
        logger.exception("cache_get_all failed")
    return result


async def cache_clear() -> None:
    """Remove all cached session data. Call when a session ends."""
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute("DELETE FROM session_cache")
            await db.commit()
        logger.info("Session cache cleared")
    except Exception:
        logger.exception("cache_clear failed")

