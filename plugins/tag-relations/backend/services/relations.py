import logging
from typing import Optional
from backend.models import TagRelation, RelationType, RelationsResult, Tag, ValidationResult, ExportData
from backend.db.repository import RelationRepository
from backend.stash.client import StashClient
from backend.errors import (
    ValidationError,
    TagNotFoundError,
    DuplicateRelationError,
    RelationNotFoundError,
)
from backend.config import Config

logger = logging.getLogger(__name__)


class RelationService:
    def __init__(self, config: Config):
        self.config = config
        self.repository = RelationRepository(config.database_path)
        self.stash = StashClient(
            config.stash_url,
            config.stash_api_key,
            config.stash_session_cookie,
        )

    def _validate_tags(self, tag_a_id: int, tag_b_id: int) -> None:
        if tag_a_id == tag_b_id:
            raise ValidationError("Cannot create relation between a tag and itself")
        existing = self.stash.validate_tags_exist([tag_a_id, tag_b_id])
        missing = {tag_a_id, tag_b_id} - existing
        if missing:
            raise TagNotFoundError(min(missing))

    def list_relations(self, tag_id: int) -> RelationsResult:
        relations = self.repository.list_for_tag(tag_id)
        if not relations:
            return RelationsResult(similar=[], related=[])

        target_ids = set()
        for r in relations:
            target_ids.add(r.other_tag(tag_id))

        tags = self.stash.get_tags(list(target_ids))
        tag_map = {t.id: t for t in tags}

        similar = []
        related = []
        for r in relations:
            other_id = r.other_tag(tag_id)
            tag = tag_map.get(other_id)
            if tag:
                if r.relation_type == RelationType.SIMILAR:
                    similar.append(tag)
                else:
                    related.append(tag)

        return RelationsResult(similar=similar, related=related)

    def create_relation(
        self, tag_a_id: int, tag_b_id: int, relation_type: RelationType
    ) -> TagRelation:
        self._validate_tags(tag_a_id, tag_b_id)

        relation = TagRelation.create(tag_a_id, tag_b_id, relation_type)
        try:
            return self.repository.create(relation)
        except DuplicateRelationError:
            raise
        except Exception as e:
            logger.error(f"Failed to create relation: {e}")
            raise

    def update_relation(
        self, tag_a_id: int, tag_b_id: int, relation_type: RelationType
    ) -> TagRelation:
        self._validate_tags(tag_a_id, tag_b_id)

        relation = TagRelation.create(tag_a_id, tag_b_id, relation_type)
        try:
            return self.repository.update(relation)
        except RelationNotFoundError:
            raise
        except Exception as e:
            logger.error(f"Failed to update relation: {e}")
            raise

    def delete_relation(
        self, tag_a_id: int, tag_b_id: int, relation_type: RelationType
    ) -> None:
        relation = TagRelation.create(tag_a_id, tag_b_id, relation_type)
        try:
            self.repository.delete(relation.tag_a_id, relation.tag_b_id, relation.relation_type)
        except RelationNotFoundError:
            raise
        except Exception as e:
            logger.error(f"Failed to delete relation: {e}")
            raise

    def set_relations(self, tag_id: int, similar_ids: list[int], related_ids: list[int]) -> RelationsResult:
        for tid in similar_ids + related_ids:
            self._validate_tags(tag_id, tid)

        current = self.repository.list_for_tag(tag_id)
        current_similar = {r.other_tag(tag_id) for r in current if r.relation_type == RelationType.SIMILAR}
        current_related = {r.other_tag(tag_id) for r in current if r.relation_type == RelationType.RELATED}

        new_similar = set(similar_ids)
        new_related = set(related_ids)

        to_add_similar = new_similar - current_similar
        to_add_related = new_related - current_related
        to_remove_similar = current_similar - new_similar
        to_remove_related = current_related - new_related

        for other_id in to_add_similar:
            self.repository.create(TagRelation.create(tag_id, other_id, RelationType.SIMILAR))
        for other_id in to_add_related:
            self.repository.create(TagRelation.create(tag_id, other_id, RelationType.RELATED))
        for other_id in to_remove_similar:
            self.repository.delete(*sorted([tag_id, other_id]), RelationType.SIMILAR)
        for other_id in to_remove_related:
            self.repository.delete(*sorted([tag_id, other_id]), RelationType.RELATED)

        return self.list_relations(tag_id)

    def validate_all(self) -> ValidationResult:
        all_relations = self.repository.list_all()
        if not all_relations:
            return ValidationResult(valid_count=0, broken_relations=[])

        all_tag_ids = set()
        for r in all_relations:
            all_tag_ids.add(r.tag_a_id)
            all_tag_ids.add(r.tag_b_id)

        existing_ids = self.stash.validate_tags_exist(list(all_tag_ids))
        broken = [r for r in all_relations if not (r.tag_a_id in existing_ids and r.tag_b_id in existing_ids)]
        valid = len(all_relations) - len(broken)

        return ValidationResult(valid_count=valid, broken_relations=broken)

    def remove_broken_relations(self) -> int:
        result = self.validate_all()
        for r in result.broken_relations:
            self.repository.delete(r.tag_a_id, r.tag_b_id, r.relation_type)
        return len(result.broken_relations)

    def export_relations(self) -> ExportData:
        relations = self.repository.list_all()
        return ExportData(
            version=1,
            relations=[r.to_dict() for r in relations],
        )

    def import_relations(self, data: ExportData, overwrite: bool = False) -> int:
        if overwrite:
            self.repository.delete_all()

        imported = 0
        for rel_dict in data.relations:
            try:
                relation = TagRelation(
                    tag_a_id=rel_dict["tag_a_id"],
                    tag_b_id=rel_dict["tag_b_id"],
                    relation_type=RelationType(rel_dict["relation_type"]),
                )
                self._validate_tags(relation.tag_a_id, relation.tag_b_id)
                self.repository.create(relation)
                imported += 1
            except (DuplicateRelationError, TagNotFoundError, ValidationError):
                continue
            except Exception as e:
                logger.warning(f"Failed to import relation {rel_dict}: {e}")
                continue
        return imported

    def on_tag_destroyed(self, tag_id: int) -> int:
        return self.repository.delete_all_for_tag(tag_id)

    def on_tag_merged(self, source_id: int, destination_id: int) -> int:
        return self.repository.rewrite_tag(source_id, destination_id)

    def get_stats(self) -> dict:
        total = self.repository.count()
        similar = self.repository.count_by_type(RelationType.SIMILAR)
        related = self.repository.count_by_type(RelationType.RELATED)

        all_relations = self.repository.list_all()
        tags_with_relations = set()
        for r in all_relations:
            tags_with_relations.add(r.tag_a_id)
            tags_with_relations.add(r.tag_b_id)

        return {
            "total_relations": total,
            "similar_count": similar,
            "related_count": related,
            "tags_with_relations": len(tags_with_relations),
        }