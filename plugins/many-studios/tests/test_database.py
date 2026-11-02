from backend.db.database import get_schema_version, init_db


class TestDatabase:
    def test_init_creates_schema(self, db_path):
        init_db(db_path)
        assert get_schema_version(db_path) == 1

    def test_init_is_idempotent(self, db_path):
        init_db(db_path)
        init_db(db_path)
        assert get_schema_version(db_path) == 1

    def test_scene_studios_table_exists(self, db_path):
        import sqlite3

        init_db(db_path)
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='scene_studios'"
        )
        assert cursor.fetchone() is not None
        conn.close()

    def test_studio_index_exists(self, db_path):
        import sqlite3

        init_db(db_path)
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_scene_studios_studio'"
        )
        assert cursor.fetchone() is not None
        conn.close()

    def test_wal_mode(self, db_path):
        import sqlite3

        init_db(db_path)
        conn = sqlite3.connect(db_path)
        mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
        conn.close()
        assert mode.upper() == "WAL"
