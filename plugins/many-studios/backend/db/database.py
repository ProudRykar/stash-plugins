import logging
import sqlite3
from contextlib import contextmanager
from pathlib import Path

logger = logging.getLogger(__name__)

SCHEMA_VERSION = 1

MIGRATIONS = {
    1: """
        CREATE TABLE IF NOT EXISTS plugin_metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS scene_studios (
            scene_id INTEGER NOT NULL,
            studio_id INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (scene_id, studio_id)
        );

        CREATE INDEX IF NOT EXISTS idx_scene_studios_studio
            ON scene_studios(studio_id);

        INSERT OR IGNORE INTO plugin_metadata (key, value)
            VALUES ('schema_version', '1');
    """
}


def get_connection(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, timeout=10)
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA busy_timeout = 10000;")
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def transaction(db_path: str):
    conn = get_connection(db_path)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db(db_path: str) -> None:
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    with transaction(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='plugin_metadata'
            """
        )
        table_exists = cursor.fetchone() is not None

        if table_exists:
            cursor.execute(
                "SELECT value FROM plugin_metadata WHERE key = 'schema_version'"
            )
            row = cursor.fetchone()
            current_version = int(row["value"]) if row else 0
        else:
            current_version = 0

        for version in range(current_version + 1, SCHEMA_VERSION + 1):
            migration = MIGRATIONS.get(version)

            if not migration:
                continue

            logger.info("Applying migration %s", version)
            conn.executescript(migration)
            cursor.execute(
                """
                INSERT OR REPLACE INTO plugin_metadata (key, value)
                VALUES ('schema_version', ?)
                """,
                (str(version),),
            )
            conn.commit()


def get_schema_version(db_path: str) -> int:
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT value FROM plugin_metadata WHERE key = 'schema_version'"
        )
        row = cursor.fetchone()
        return int(row["value"]) if row else 0
