import sys
import os
import tempfile
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.db.database import init_db, get_schema_version, MIGRATIONS
from backend.db.repository import RelationRepository
from backend.models import TagRelation, RelationType
from backend.errors import DuplicateRelationError


@pytest.fixture
def db_path():
    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as f:
        path = f.name
    yield path
    if os.path.exists(path):
        os.unlink(path)


class TestMigrations:
    def test_initial_migration_creates_schema(self, db_path):
        init_db(db_path)
        assert get_schema_version(db_path) == 1

        repo = RelationRepository(db_path)
        relation = TagRelation.create(1, 2, RelationType.SIMILAR)
        repo.create(relation)

        fetched = repo.get(1, 2, RelationType.SIMILAR)
        assert fetched.tag_a_id == 1
        assert fetched.tag_b_id == 2

    def test_migration_idempotent(self, db_path):
        init_db(db_path)
        init_db(db_path)
        init_db(db_path)
        assert get_schema_version(db_path) == 1

        repo = RelationRepository(db_path)
        assert repo.count() == 0

    def test_indexes_created(self, db_path):
        init_db(db_path)
        import sqlite3

        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_tag_relations%'"
        )
        indexes = [row[0] for row in cursor.fetchall()]
        conn.close()

        assert "idx_tag_relations_a" in indexes
        assert "idx_tag_relations_b" in indexes
        assert "idx_tag_relations_type" in indexes

    def test_constraints_enforced(self, db_path):
        init_db(db_path)
        repo = RelationRepository(db_path)

        repo.create(TagRelation.create(1, 2, RelationType.SIMILAR))

        with pytest.raises(DuplicateRelationError):
            repo.create(TagRelation.create(1, 2, RelationType.SIMILAR))

        with pytest.raises(ValueError):
            TagRelation.create(5, 5, RelationType.SIMILAR)

    def test_wal_mode_enabled(self, db_path):
        init_db(db_path)
        import sqlite3

        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("PRAGMA journal_mode")
        mode = cursor.fetchone()[0]
        conn.close()

        assert mode.upper() == "WAL"

    def test_foreign_keys_enabled(self, db_path):
        init_db(db_path)
        from backend.db.database import get_connection

        conn = get_connection(db_path)
        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys")
        fk = cursor.fetchone()[0]
        conn.close()

        assert fk == 1
