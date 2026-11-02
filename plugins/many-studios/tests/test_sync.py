import pytest

from backend.config import Config
from backend.db.database import init_db
from backend.db.repository import SceneStudioRepository
from backend.services.sync import SyncService


@pytest.fixture
def sync_service(db_path):
    init_db(db_path)
    return SyncService(Config(database_path=db_path, stash_url="http://localhost"))


class TestSync:
    def test_scene_destroy(self, sync_service, db_path):
        repo = SceneStudioRepository(db_path)
        repo.add(1, 10)
        repo.add(1, 20)
        repo.add(2, 10)

        result = sync_service.handle_hook(
            {"type": "Scene.Destroy.Post", "id": 1}
        )

        assert result["handled"] is True
        assert result["deleted_links"] == 2
        assert repo.count() == 1

    def test_studio_destroy(self, sync_service, db_path):
        repo = SceneStudioRepository(db_path)
        repo.add(1, 10)
        repo.add(2, 10)
        repo.add(2, 20)

        result = sync_service.handle_hook(
            {"type": "Studio.Destroy.Post", "id": 10}
        )

        assert result["handled"] is True
        assert result["deleted_links"] == 2
        assert repo.count() == 1

    def test_scene_update_removes_duplicate_primary(self, sync_service, db_path):
        repo = SceneStudioRepository(db_path)
        repo.add(1, 10)

        result = sync_service.handle_hook(
            {
                "type": "Scene.Update.Post",
                "id": 1,
                "inputFields": ["studio_id"],
                "input": {"studio_id": "10"},
            }
        )

        assert result["handled"] is True
        assert result["removed_duplicate_links"] == 1
        assert repo.count() == 0

    def test_scene_update_without_primary_change(self, sync_service, db_path):
        repo = SceneStudioRepository(db_path)
        repo.add(1, 10)

        result = sync_service.handle_hook(
            {
                "type": "Scene.Update.Post",
                "id": 1,
                "inputFields": ["title"],
                "input": {"studio_id": "10"},
            }
        )

        assert result["handled"] is False
        assert repo.count() == 1

    def test_unknown_hook(self, sync_service):
        assert sync_service.handle_hook({"type": "Tag.Create.Post", "id": 1}) == {
            "handled": False
        }
