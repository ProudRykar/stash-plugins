import sys
import os
import tempfile
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.db.database import init_db, get_schema_version
from backend.db.repository import RelationRepository
from backend.models import TagRelation, RelationType
from backend.errors import DuplicateRelationError, RelationNotFoundError


@pytest.fixture
def db_path():
    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as f:
        path = f.name
    yield path
    if os.path.exists(path):
        os.unlink(path)


@pytest.fixture
def repo(db_path):
    init_db(db_path)
    return RelationRepository(db_path)


class TestDatabase:
    def test_init_db_creates_tables(self, db_path):
        init_db(db_path)
        assert get_schema_version(db_path) == 1

    def test_migration_idempotent(self, db_path):
        init_db(db_path)
        init_db(db_path)
        assert get_schema_version(db_path) == 1


class TestRepository:
    def test_create_relation(self, repo):
        relation = TagRelation.create(1, 2, RelationType.SIMILAR)
        created = repo.create(relation)
        assert created.tag_a_id == 1
        assert created.tag_b_id == 2
        assert created.relation_type == RelationType.SIMILAR

    def test_create_relation_normalizes_order(self, repo):
        relation = TagRelation.create(2, 1, RelationType.SIMILAR)
        created = repo.create(relation)
        assert created.tag_a_id == 1
        assert created.tag_b_id == 2

    def test_duplicate_relation_raises(self, repo):
        relation = TagRelation.create(1, 2, RelationType.SIMILAR)
        repo.create(relation)
        with pytest.raises(DuplicateRelationError):
            repo.create(relation)

    def test_get_relation(self, repo):
        relation = TagRelation.create(1, 2, RelationType.SIMILAR)
        repo.create(relation)
        fetched = repo.get(1, 2, RelationType.SIMILAR)
        assert fetched.tag_a_id == 1
        assert fetched.tag_b_id == 2

    def test_get_relation_not_found(self, repo):
        with pytest.raises(RelationNotFoundError):
            repo.get(1, 2, RelationType.SIMILAR)

    def test_list_for_tag(self, repo):
        repo.create(TagRelation.create(1, 2, RelationType.SIMILAR))
        repo.create(TagRelation.create(1, 3, RelationType.RELATED))
        repo.create(TagRelation.create(2, 4, RelationType.SIMILAR))

        relations = repo.list_for_tag(1)
        assert len(relations) == 2
        types = {r.relation_type for r in relations}
        assert types == {RelationType.SIMILAR, RelationType.RELATED}

    def test_list_all(self, repo):
        repo.create(TagRelation.create(1, 2, RelationType.SIMILAR))
        repo.create(TagRelation.create(3, 4, RelationType.RELATED))
        all_relations = repo.list_all()
        assert len(all_relations) == 2

    def test_update_relation(self, repo):
        relation = TagRelation.create(1, 2, RelationType.SIMILAR)
        repo.create(relation)
        updated = repo.update(relation)
        assert updated.tag_a_id == 1

    def test_update_not_found(self, repo):
        relation = TagRelation.create(1, 2, RelationType.SIMILAR)
        with pytest.raises(RelationNotFoundError):
            repo.update(relation)

    def test_delete_relation(self, repo):
        relation = TagRelation.create(1, 2, RelationType.SIMILAR)
        repo.create(relation)
        repo.delete(1, 2, RelationType.SIMILAR)
        with pytest.raises(RelationNotFoundError):
            repo.get(1, 2, RelationType.SIMILAR)

    def test_delete_all_for_tag(self, repo):
        repo.create(TagRelation.create(1, 2, RelationType.SIMILAR))
        repo.create(TagRelation.create(1, 3, RelationType.RELATED))
        repo.create(TagRelation.create(2, 4, RelationType.SIMILAR))
        count = repo.delete_all_for_tag(1)
        assert count == 2
        assert len(repo.list_for_tag(1)) == 0
        assert len(repo.list_for_tag(2)) == 1

    def test_rewrite_tag_merge(self, repo):
        repo.create(TagRelation.create(1, 2, RelationType.SIMILAR))
        repo.create(TagRelation.create(1, 3, RelationType.RELATED))
        repo.create(TagRelation.create(2, 4, RelationType.SIMILAR))

        updated = repo.rewrite_tag(2, 1)
        assert updated >= 1

        relations = repo.list_all()
        for r in relations:
            assert r.tag_a_id != 2
            assert r.tag_b_id != 2

    def test_rewrite_tag_removes_self_relations(self, repo):
        repo.create(TagRelation.create(1, 2, RelationType.SIMILAR))
        repo.create(TagRelation.create(2, 3, RelationType.RELATED))

        repo.rewrite_tag(2, 1)

        relations = repo.list_all()
        for r in relations:
            assert r.tag_a_id != r.tag_b_id

    def test_count(self, repo):
        assert repo.count() == 0
        repo.create(TagRelation.create(1, 2, RelationType.SIMILAR))
        assert repo.count() == 1

    def test_count_by_type(self, repo):
        repo.create(TagRelation.create(1, 2, RelationType.SIMILAR))
        repo.create(TagRelation.create(3, 4, RelationType.RELATED))
        repo.create(TagRelation.create(5, 6, RelationType.SIMILAR))
        assert repo.count_by_type(RelationType.SIMILAR) == 2
        assert repo.count_by_type(RelationType.RELATED) == 1

    def test_delete_all(self, repo):
        repo.create(TagRelation.create(1, 2, RelationType.SIMILAR))
        repo.create(TagRelation.create(3, 4, RelationType.RELATED))
        count = repo.delete_all()
        assert count == 2
        assert repo.count() == 0
