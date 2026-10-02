from dataclasses import dataclass
from enum import StrEnum
from typing import Literal


class RelationType(StrEnum):
    SIMILAR = "similar"
    RELATED = "related"


@dataclass(frozen=True, slots=True)
class TagRelation:
    tag_a_id: int
    tag_b_id: int
    relation_type: RelationType

    def __post_init__(self):
        if self.tag_a_id >= self.tag_b_id:
            raise ValueError("tag_a_id must be less than tag_b_id")
        if self.tag_a_id == self.tag_b_id:
            raise ValueError("tag_a_id cannot equal tag_b_id")

    @classmethod
    def create(cls, tag_a_id: int, tag_b_id: int, relation_type: RelationType) -> "TagRelation":
        if tag_a_id > tag_b_id:
            tag_a_id, tag_b_id = tag_b_id, tag_a_id
        return cls(tag_a_id=tag_a_id, tag_b_id=tag_b_id, relation_type=relation_type)

    def contains_tag(self, tag_id: int) -> bool:
        return tag_id in (self.tag_a_id, self.tag_b_id)

    def other_tag(self, tag_id: int) -> int:
        if tag_id == self.tag_a_id:
            return self.tag_b_id
        if tag_id == self.tag_b_id:
            return self.tag_a_id
        raise ValueError(f"Tag {tag_id} not in relation")

    def to_dict(self) -> dict:
        return {
            "tag_a_id": self.tag_a_id,
            "tag_b_id": self.tag_b_id,
            "relation_type": self.relation_type.value,
        }


@dataclass(frozen=True, slots=True)
class Tag:
    id: int
    name: str


@dataclass(frozen=True, slots=True)
class RelationsResult:
    similar: list[Tag]
    related: list[Tag]


@dataclass(frozen=True, slots=True)
class ValidationResult:
    valid_count: int
    broken_relations: list[TagRelation]

    def to_dict(self) -> dict:
        return {
            "valid_count": self.valid_count,
            "broken_count": len(self.broken_relations),
            "broken_relations": [r.to_dict() for r in self.broken_relations],
        }


@dataclass(frozen=True, slots=True)
class ExportData:
    version: int
    relations: list[dict]

    def to_dict(self) -> dict:
        return {"version": self.version, "relations": self.relations}

    @classmethod
    def from_dict(cls, data: dict) -> "ExportData":
        return cls(version=data.get("version", 1), relations=data.get("relations", []))