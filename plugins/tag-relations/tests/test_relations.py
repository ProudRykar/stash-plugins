import sys
import os
import tempfile
from unittest.mock import Mock, MagicMock, patch
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.db.database import init_db
from backend.db.repository import RelationRepository
from backend.models import (
    TagRelation,
    RelationType,
    Tag,
    RelationsResult,
    ValidationResult,
    ExportData,
)
from backend.services.relations import RelationService
from backend.config import Config
from backend.errors import TagNotFoundError, ValidationError, DuplicateRelationError


@pytest.fixture
def db_path():
    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as f:
        path = f.name
    yield path
    if os.path.exists(path):
        os.unlink(path)


@pytest.fixture
def mock_stash():
    stash = Mock()
    stash.validate_tags_exist.return_value = {1, 2, 3, 4, 5}
    stash.get_tags.return_value = [
        Tag(id=1, name="Tag 1"),
        Tag(id=2, name="Tag 2"),
        Tag(id=3, name="Tag 3"),
        Tag(id=4, name="Tag 4"),
        Tag(id=5, name="Tag 5"),
    ]
    stash.find_tags.return_value = [
        Tag(id=1, name="Tag 1"),
        Tag(id=2, name="Tag 2"),
    ]
    return stash


@pytest.fixture
def config(db_path):
    return Config(
        database_path=db_path,
        stash_url="http://localhost:9999",
        stash_api_key="test-key",
    )


@pytest.fixture
def service(config, mock_stash):
    init_db(config.database_path)
    service = RelationService(config)
    service.stash = mock_stash
    return service


class TestRelationService:
    def test_list_relations_empty(self, service):
        result = service.list_relations(999)
        assert isinstance(result, RelationsResult)
        assert result.similar == []
        assert result.related == []

    def test_list_relations_with_data(self, service):
        service.repository.create(TagRelation.create(1, 2, RelationType.SIMILAR))
        service.repository.create(TagRelation.create(1, 3, RelationType.RELATED))

        result = service.list_relations(1)
        assert len(result.similar) == 1
        assert result.similar[0].id == 2
        assert len(result.related) == 1
        assert result.related[0].id == 3

    def test_create_relation_success(self, service):
        relation = service.create_relation(1, 2, RelationType.SIMILAR)
        assert relation.tag_a_id == 1
        assert relation.tag_b_id == 2
        assert relation.relation_type == RelationType.SIMILAR

    def test_create_relation_validates_tags(self, service):
        service.stash.validate_tags_exist.return_value = {1}
        with pytest.raises(TagNotFoundError):
            service.create_relation(1, 999, RelationType.SIMILAR)

    def test_create_relation_self_raises(self, service):
        with pytest.raises(ValidationError):
            service.create_relation(1, 1, RelationType.SIMILAR)

    def test_create_duplicate_raises(self, service):
        service.create_relation(1, 2, RelationType.SIMILAR)
        with pytest.raises(DuplicateRelationError):
            service.create_relation(1, 2, RelationType.SIMILAR)

    def test_update_relation(self, service):
        service.create_relation(1, 2, RelationType.SIMILAR)
        updated = service.update_relation(1, 2, RelationType.SIMILAR)
        assert updated.relation_type == RelationType.SIMILAR
        assert updated.tag_a_id == 1
        assert updated.tag_b_id == 2

    def test_delete_relation(self, service):
        service.create_relation(1, 2, RelationType.SIMILAR)
        service.delete_relation(1, 2, RelationType.SIMILAR)
        result = service.list_relations(1)
        assert len(result.similar) == 0

    def test_set_relations(self, service):
        service.create_relation(1, 2, RelationType.SIMILAR)
        service.create_relation(1, 3, RelationType.RELATED)

        result = service.set_relations(1, similar_ids=[4], related_ids=[2])

        assert len(result.similar) == 1
        assert result.similar[0].id == 4
        assert len(result.related) == 1
        assert result.related[0].id == 2

    def test_validate_all(self, service):
        service.repository.create(TagRelation.create(1, 2, RelationType.SIMILAR))
        service.repository.create(TagRelation.create(3, 4, RelationType.RELATED))

        service.stash.validate_tags_exist.return_value = {1, 2, 3}

        result = service.validate_all()
        assert isinstance(result, ValidationResult)
        assert result.valid_count == 1
        assert len(result.broken_relations) == 1
        assert result.broken_relations[0].tag_a_id == 3

    def test_remove_broken_relations(self, service):
        service.repository.create(TagRelation.create(1, 2, RelationType.SIMILAR))
        service.repository.create(TagRelation.create(3, 4, RelationType.RELATED))

        service.stash.validate_tags_exist.return_value = {1, 2}

        removed = service.remove_broken_relations()
        assert removed == 1
        assert service.repository.count() == 1

    def test_export_relations(self, service):
        service.repository.create(TagRelation.create(1, 2, RelationType.SIMILAR))
        service.repository.create(TagRelation.create(3, 4, RelationType.RELATED))

        exported = service.export_relations()
        assert isinstance(exported, ExportData)
        assert exported.version == 1
        assert len(exported.relations) == 2

    def test_import_relations(self, service):
        data = ExportData(
            version=1,
            relations=[
                {"tag_a_id": 10, "tag_b_id": 20, "relation_type": "similar"},
                {"tag_a_id": 30, "tag_b_id": 40, "relation_type": "related"},
            ],
        )

        service.stash.validate_tags_exist.return_value = {10, 20, 30, 40}

        count = service.import_relations(data)
        assert count == 2
        assert service.repository.count() == 2

    def test_import_relations_overwrite(self, service):
        service.repository.create(TagRelation.create(1, 2, RelationType.SIMILAR))

        data = ExportData(
            version=1,
            relations=[{"tag_a_id": 10, "tag_b_id": 20, "relation_type": "similar"}],
        )

        service.stash.validate_tags_exist.return_value = {10, 20}

        count = service.import_relations(data, overwrite=True)
        assert count == 1
        assert service.repository.count() == 1

    def test_on_tag_destroyed(self, service):
        service.repository.create(TagRelation.create(1, 2, RelationType.SIMILAR))
        service.repository.create(TagRelation.create(2, 3, RelationType.RELATED))

        count = service.on_tag_destroyed(2)
        assert count == 2
        assert service.repository.count() == 0

    def test_on_tag_merged(self, service):
        service.repository.create(TagRelation.create(10, 20, RelationType.SIMILAR))
        service.repository.create(TagRelation.create(20, 30, RelationType.RELATED))

        count = service.on_tag_merged(20, 10)
        assert count == 2

        relations = service.repository.list_all()
        assert all(r.tag_a_id != 20 and r.tag_b_id != 20 for r in relations)

    def test_get_stats(self, service):
        service.repository.create(TagRelation.create(1, 2, RelationType.SIMILAR))
        service.repository.create(TagRelation.create(1, 3, RelationType.RELATED))
        service.repository.create(TagRelation.create(4, 5, RelationType.SIMILAR))

        stats = service.get_stats()
        assert stats["total_relations"] == 3
        assert stats["similar_count"] == 2
        assert stats["related_count"] == 1
        assert stats["tags_with_relations"] == 5
