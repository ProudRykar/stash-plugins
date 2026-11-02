from dataclasses import dataclass, field
from typing import Optional


@dataclass(frozen=True, slots=True)
class StudioRef:
    id: int
    name: str
    image_path: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "image_path": self.image_path,
        }


@dataclass(frozen=True, slots=True)
class SceneRef:
    id: int
    title: Optional[str] = None
    date: Optional[str] = None
    studio: Optional[StudioRef] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "date": self.date,
            "studio": self.studio.to_dict() if self.studio else None,
        }


@dataclass(frozen=True, slots=True)
class SceneStudioLink:
    scene_id: int
    studio_id: int
    created_at: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "scene_id": self.scene_id,
            "studio_id": self.studio_id,
            "created_at": self.created_at,
        }


@dataclass(frozen=True, slots=True)
class SceneStudios:
    scene_id: int
    primary: Optional[StudioRef]
    additional: list[StudioRef] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "scene_id": self.scene_id,
            "primary": self.primary.to_dict() if self.primary else None,
            "additional": [studio.to_dict() for studio in self.additional],
        }


@dataclass(frozen=True, slots=True)
class StudioScenes:
    studio_id: int
    total: int
    scenes: list[SceneRef] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "studio_id": self.studio_id,
            "total": self.total,
            "scenes": [scene.to_dict() for scene in self.scenes],
        }


@dataclass(frozen=True, slots=True)
class ValidationResult:
    valid_count: int
    broken_links: list[SceneStudioLink] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "valid_count": self.valid_count,
            "broken_count": len(self.broken_links),
            "broken_links": [link.to_dict() for link in self.broken_links],
        }


@dataclass(frozen=True, slots=True)
class ExportData:
    version: int
    links: list[dict]

    def to_dict(self) -> dict:
        return {"version": self.version, "links": self.links}

    @classmethod
    def from_dict(cls, data: dict) -> "ExportData":
        return cls(
            version=int(data.get("version", 1)),
            links=data.get("links", []),
        )
