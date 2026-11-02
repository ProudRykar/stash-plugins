import logging

from backend.config import Config
from backend.db.repository import SceneStudioRepository
from backend.errors import NotFoundError, ValidationError
from backend.models import (
    ExportData,
    SceneRef,
    SceneStudioLink,
    SceneStudios,
    StudioRef,
    StudioScenes,
    ValidationResult,
)
from backend.stash.client import StashClient

logger = logging.getLogger(__name__)

BATCH_SIZE = 100


def _chunks(values: list[int], size: int = BATCH_SIZE):
    for index in range(0, len(values), size):
        yield values[index : index + size]


class StudioLinkService:
    def __init__(self, config: Config):
        self.config = config
        self.repository = SceneStudioRepository(config.database_path)
        self.stash = StashClient(
            config.stash_url,
            config.stash_api_key,
            config.stash_session_cookie,
        )

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    def list_scene_studios(self, scene_id: int) -> SceneStudios:
        scene = self.stash.get_scene(scene_id)
        primary = scene.studio

        additional_ids = [
            link.studio_id
            for link in self.repository.list_for_scene(scene_id)
            if not primary or link.studio_id != primary.id
        ]

        studio_map = {
            studio.id: studio
            for studio in self._get_studios(additional_ids)
        }

        additional = [
            studio_map[studio_id]
            for studio_id in additional_ids
            if studio_id in studio_map
        ]

        return SceneStudios(
            scene_id=scene_id,
            primary=primary,
            additional=additional,
        )

    def list_studio_scenes(
        self,
        studio_id: int,
        page: int = 1,
        per_page: int = 40,
    ) -> StudioScenes:
        self.stash.get_studio(studio_id)

        links, total = self.repository.list_for_studio(
            studio_id,
            page=page,
            per_page=per_page,
        )

        scene_ids = [link.scene_id for link in links]
        scene_map = {scene.id: scene for scene in self._get_scenes(scene_ids)}

        scenes = [
            scene_map[scene_id]
            for scene_id in scene_ids
            if scene_id in scene_map
        ]

        return StudioScenes(
            studio_id=studio_id,
            total=total,
            scenes=scenes,
        )

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------

    def add_scene_studio(self, scene_id: int, studio_id: int) -> dict:
        scene = self.stash.get_scene(scene_id)
        self.stash.get_studio(studio_id)

        if scene.studio and scene.studio.id == studio_id:
            return {
                "added": False,
                "reason": "primary",
                "primary_id": scene.studio.id,
            }

        added = self.repository.add(scene_id, studio_id)

        return {
            "added": added,
            "reason": "added" if added else "exists",
        }

    def remove_scene_studio(self, scene_id: int, studio_id: int) -> dict:
        scene = self.stash.get_scene(scene_id)

        if scene.studio and scene.studio.id == studio_id:
            return {
                "removed": False,
                "reason": "primary",
            }

        removed = self.repository.remove(scene_id, studio_id)

        return {
            "removed": removed,
            "reason": "removed" if removed else "not_found",
        }

    def set_scene_studios(self, scene_id: int, studio_ids: list[int]) -> SceneStudios:
        scene = self.stash.get_scene(scene_id)
        unique_ids = sorted({int(studio_id) for studio_id in studio_ids})

        existing = self.stash.validate_studios_exist(unique_ids)
        missing = set(unique_ids) - existing

        if missing:
            raise NotFoundError("Studio", min(missing))

        if scene.studio:
            unique_ids = [
                studio_id
                for studio_id in unique_ids
                if studio_id != scene.studio.id
            ]

        self.repository.set_for_scene(scene_id, unique_ids)

        return self.list_scene_studios(scene_id)

    # ------------------------------------------------------------------
    # Maintenance
    # ------------------------------------------------------------------

    def validate_links(self) -> ValidationResult:
        links = self.repository.list_all()

        if not links:
            return ValidationResult(valid_count=0, broken_links=[])

        scene_ids = sorted({link.scene_id for link in links})
        studio_ids = sorted({link.studio_id for link in links})

        existing_scenes = self.stash.validate_scenes_exist(scene_ids)
        existing_studios = self.stash.validate_studios_exist(studio_ids)

        broken = [
            link
            for link in links
            if link.scene_id not in existing_scenes
            or link.studio_id not in existing_studios
        ]

        return ValidationResult(
            valid_count=len(links) - len(broken),
            broken_links=broken,
        )

    def remove_broken_links(self) -> int:
        result = self.validate_links()

        for link in result.broken_links:
            self.repository.delete(link.scene_id, link.studio_id)

        return len(result.broken_links)

    # ------------------------------------------------------------------
    # Import / export
    # ------------------------------------------------------------------

    def export_links(self) -> ExportData:
        return ExportData(
            version=1,
            links=[link.to_dict() for link in self.repository.list_all()],
        )

    def import_links(self, data: ExportData, overwrite: bool = False) -> int:
        if overwrite:
            self.repository.delete_all()

        raw_links = []

        for item in data.links:
            try:
                raw_links.append(
                    (int(item["scene_id"]), int(item["studio_id"]))
                )
            except (KeyError, TypeError, ValueError):
                logger.warning("Skipping invalid link: %r", item)

        if not raw_links:
            return 0

        existing_scenes = self.stash.validate_scenes_exist(
            sorted({scene_id for scene_id, _ in raw_links})
        )
        existing_studios = self.stash.validate_studios_exist(
            sorted({studio_id for _, studio_id in raw_links})
        )

        imported = 0

        for scene_id, studio_id in raw_links:
            if scene_id not in existing_scenes or studio_id not in existing_studios:
                continue

            if self.repository.add(scene_id, studio_id):
                imported += 1

        return imported

    # ------------------------------------------------------------------
    # Search / stats
    # ------------------------------------------------------------------

    def find_studios(self, search: str, per_page: int = 50) -> list[StudioRef]:
        return self.stash.find_studios(search, per_page)

    def find_scenes(self, search: str, per_page: int = 50) -> list[SceneRef]:
        return self.stash.find_scenes(search, per_page)

    def get_stats(self) -> dict:
        return {
            "total_links": self.repository.count(),
            "unique_scenes": self.repository.count_unique_scenes(),
            "unique_studios": self.repository.count_unique_studios(),
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _get_scenes(self, scene_ids: list[int]) -> list[SceneRef]:
        result: list[SceneRef] = []

        for chunk in _chunks(scene_ids):
            result.extend(self.stash.get_scenes(chunk))

        return result

    def _get_studios(self, studio_ids: list[int]) -> list[StudioRef]:
        result: list[StudioRef] = []

        for chunk in _chunks(studio_ids):
            result.extend(self.stash.get_studios(chunk))

        return result

    # ------------------------------------------------------------------
    # Hook helpers
    # ------------------------------------------------------------------

    def on_scene_destroyed(self, scene_id: int) -> int:
        return self.repository.delete_for_scene(scene_id)

    def on_studio_destroyed(self, studio_id: int) -> int:
        return self.repository.delete_for_studio(studio_id)

    def on_scene_updated(self, scene_id: int, primary_studio_id: int | None) -> int:
        if not primary_studio_id:
            return 0

        return int(self.repository.remove(scene_id, primary_studio_id))
