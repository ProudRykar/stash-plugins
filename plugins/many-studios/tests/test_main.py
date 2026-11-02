import pytest

import backend.main as main_module
from backend.config import Config
from backend.models import SceneRef, StudioRef


class FakeStashClient:
    def __init__(self, *args, **kwargs):
        pass

    def get_scene(self, scene_id):
        return SceneRef(id=scene_id, title="Scene", studio=None)

    def get_scenes(self, ids):
        return [SceneRef(id=i, title=f"Scene {i}") for i in ids]

    def get_studio(self, studio_id):
        return StudioRef(id=studio_id, name=f"Studio {studio_id}")

    def get_studios(self, ids):
        return [StudioRef(id=i, name=f"Studio {i}") for i in ids]

    def validate_scenes_exist(self, ids):
        return set(ids)

    def validate_studios_exist(self, ids):
        return set(ids)


@pytest.fixture
def plugin_env(monkeypatch, db_path):
    config = Config(database_path=db_path, stash_url="http://localhost:9999")
    monkeypatch.setattr(main_module, "load_config", lambda *a, **k: config)
    monkeypatch.setattr(
        "backend.services.links.StashClient",
        FakeStashClient,
    )
    return config


class TestDispatch:
    def test_missing_operation(self, plugin_env):
        result = main_module.dispatch_operation(
            {"server_connection": {}},
            {},
        )
        assert result["ok"] is False
        assert "MISSING_OPERATION" in result["error"]

    def test_add_list_remove(self, plugin_env):
        added = main_module.dispatch_operation(
            {"server_connection": {}},
            {
                "operation": "add_scene_studio",
                "scene_id": 1,
                "studio_id": 10,
            },
        )
        assert added["ok"] is True
        assert added["output"]["added"] is True

        listed = main_module.dispatch_operation(
            {"server_connection": {}},
            {"operation": "list_scene_studios", "scene_id": 1},
        )
        assert listed["ok"] is True
        assert [s["id"] for s in listed["output"]["additional"]] == [10]

        removed = main_module.dispatch_operation(
            {"server_connection": {}},
            {
                "operation": "remove_scene_studio",
                "scene_id": 1,
                "studio_id": 10,
            },
        )
        assert removed["ok"] is True
        assert removed["output"]["removed"] is True

    def test_hook_context_is_read_from_args(self, plugin_env):
        added = main_module.dispatch_operation(
            {"server_connection": {}},
            {
                "operation": "add_scene_studio",
                "scene_id": 1,
                "studio_id": 10,
            },
        )
        assert added["ok"] is True

        result = main_module.dispatch_operation(
            {"server_connection": {}},
            {
                "hookContext": {
                    "type": "Scene.Destroy.Post",
                    "id": 1,
                }
            },
        )

        assert result["ok"] is True
        assert result["output"]["handled"] is True
        assert result["output"]["deleted_links"] == 1

    def test_unknown_operation(self, plugin_env):
        result = main_module.dispatch_operation(
            {"server_connection": {}},
            {"operation": "nope"},
        )
        assert result["ok"] is False
        assert "UNKNOWN_OPERATION" in result["error"]
