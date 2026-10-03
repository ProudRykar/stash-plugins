import sys
import os
import tempfile
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.db.database import init_db
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


class TestRelationRepository:
    def test_create_and_get(self, repo):
        relation = TagRelation.create(10, 20, RelationType.SIMILAR)
        created = repo.create(relation)
        assert created.tag_a_id == 10
        assert created.tag_b_id == 20
        assert created.relation_type == RelationType.SIMILAR

        fetched = repo.get(10, 20, RelationType.SIMILAR)
        assert fetched.tag_a_id == 10
        assert fetched.tag_b_id == 20

    def test_create_same_tag_raises(self, repo):
        with pytest.raises(ValueError):
            TagRelation.create(10, 10, RelationType.SIMILAR)

    def test_duplicate_prevention(self, repo):
        relation = TagRelation.create(1, 2, RelationType.SIMILAR)
        repo.create(relation)
        with pytest.raises(DuplicateRelationError):
            repo.create(relation)

    def test_both_types_allowed_for_same_pair(self, repo):
        repo.create(TagRelation.create(1, 2, RelationType.SIMILAR))
        repo.create(TagRelation.create(1, 2, RelationType.RELATED))
        assert repo.count() == 2

    def test_list_for_tag_includes_both_directions(self, repo):
        repo.create(TagRelation.create(1, 2, RelationType.SIMILAR))
        repo.create(TagRelation.create(3, 1, RelationType.RELATED))

        relations = repo.list_for_tag(1)
        assert len(relations) == 2

    def test_update_updates_timestamp(self, repo):
        relation = TagRelation.create(1, 2, RelationType.SIMILAR)
        repo.create(relation)
        updated = repo.update(relation)
        assert updated.tag_a_id == 1

    def test_delete_removes_relation(self, repo):
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

    def test_rewrite_tag_basic(self, repo):
        repo.create(TagRelation.create(10, 20, RelationType.SIMILAR))
        repo.create(TagRelation.create(10, 30, RelationType.RELATED))

        updated = repo.rewrite_tag(10, 40)
        assert updated == 2

        relations = repo.list_for_tag(40)
        assert len(relations) == 2
        assert all(r.tag_a_id != 10 and r.tag_b_id != 10 for r in relations)

    def test_rewrite_tag_deduplicates(self, repo):
        repo.create(TagRelation.create(10, 20, RelationType.SIMILAR))
        repo.create(TagRelation.create(10, 30, RelationType.SIMILAR))

        updated = repo.rewrite_tag(30, 20)
        assert updated == 1  # Only one relation involved tag 30

        relations = repo.list_all()
        similar_relations = [
            r for r in relations if r.relation_type == RelationType.SIMILAR
        ]
        assert len(similar_relations) == 1
        assert similar_relations[0].tag_a_id == 10
        assert similar_relations[0].tag_b_id == 20

    def test_rewrite_tag_removes_self_relation(self, repo):
        repo.create(TagRelation.create(10, 20, RelationType.SIMILAR))
        repo.create(TagRelation.create(20, 30, RelationType.RELATED))

        updated = repo.rewrite_tag(20, 10)
        assert updated == 2

        relations = repo.list_for_tag(10)
        assert all(r.tag_a_id != r.tag_b_id for r in relations)

    def test_delete_all(self, repo):
        repo.create(TagRelation.create(1, 2, RelationType.SIMILAR))
        repo.create(TagRelation.create(3, 4, RelationType.RELATED))
        count = repo.delete_all()
        assert count == 2
        assert repo.count() == 0
