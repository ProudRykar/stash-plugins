import logging

from backend.config import Config
from backend.db.repository import SceneStudioRepository

logger = logging.getLogger(__name__)


class SyncService:
    def __init__(self, config: Config):
        self.config = config
        self.repository = SceneStudioRepository(config.database_path)

    def handle_hook(self, hook_context: dict) -> dict:
        hook_type = hook_context.get("type")
        object_id = hook_context.get("id")

        if hook_type == "Scene.Destroy.Post" and object_id:
            count = self.repository.delete_for_scene(int(object_id))
            return {"handled": True, "deleted_links": count}

        if hook_type == "Studio.Destroy.Post" and object_id:
            count = self.repository.delete_for_studio(int(object_id))
            return {"handled": True, "deleted_links": count}

        if hook_type == "Scene.Update.Post" and object_id:
            input_fields = hook_context.get("inputFields") or []
            scene_input = hook_context.get("input") or {}
            primary_studio_id = scene_input.get("studio_id")

            # Only rewrite when the native primary studio was actually changed.
            if "studio_id" in input_fields and primary_studio_id:
                removed = self.repository.remove(
                    int(object_id),
                    int(primary_studio_id),
                )
                return {
                    "handled": True,
                    "removed_duplicate_links": int(removed),
                }

        return {"handled": False}
