import sqlite3
import logging
from pathlib import Path
from contextlib import contextmanager

logger = logging.getLogger(__name__)

SCHEMA_VERSION = 1

MIGRATIONS = {
    1: """
        CREATE TABLE IF NOT EXISTS plugin_metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tag_relations (
            tag_a_id INTEGER NOT NULL,
            tag_b_id INTEGER NOT NULL,
            relation_type TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (tag_a_id, tag_b_id, relation_type),
            CHECK (tag_a_id < tag_b_id),
            CHECK (relation_type IN ('similar', 'related'))
        );

        CREATE INDEX IF NOT EXISTS idx_tag_relations_a ON tag_relations(tag_a_id);
        CREATE INDEX IF NOT EXISTS idx_tag_relations_b ON tag_relations(tag_b_id);
        CREATE INDEX IF NOT EXISTS idx_tag_relations_type ON tag_relations(relation_type);

        INSERT OR IGNORE INTO plugin_metadata (key, value) VALUES ('schema_version', '1');
    """
}


def get_connection(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, timeout=10)
    conn.execute("PRAGMA foreign_keys = ON;")
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
        # Check if plugin_metadata table exists
        cursor.execute("""
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='plugin_metadata'
        """)
        table_exists = cursor.fetchone() is not None

        if table_exists:
            cursor.execute("SELECT value FROM plugin_metadata WHERE key = 'schema_version'")
            row = cursor.fetchone()
            current_version = int(row["value"]) if row else 0
        else:
            current_version = 0

        for version in range(current_version + 1, SCHEMA_VERSION + 1):
            if version in MIGRATIONS:
                logger.info(f"Applying migration {version}")
                conn.executescript(MIGRATIONS[version])
                cursor.execute(
                    "INSERT OR REPLACE INTO plugin_metadata (key, value) VALUES ('schema_version', ?)",
                    (str(version),),
                )
                conn.commit()


def get_schema_version(db_path: str) -> int:
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM plugin_metadata WHERE key = 'schema_version'")
        row = cursor.fetchone()
        return int(row["value"]) if row else 0