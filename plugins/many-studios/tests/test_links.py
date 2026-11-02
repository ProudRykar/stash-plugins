from types import SimpleNamespace

import pytest

from backend.config import Config
from backend.db.database import init_db
from backend.db.repository import SceneStudioRepository
from backend.models import ExportData, SceneRef, StudioRef
from backend.services.links import StudioLinkService


class FakeStash:
    def __init__(self):
        self.scenes = {}
        self.studios = {}
        self.primary = {}

    def add_scene(self, scene_id, primary=None):
        self.scenes[scene_id] = SceneRef(
            id=scene_id,
            title=f"Scene {scene_id}",
            studio=primary,
        )
        self.primary[scene_id] = primary

    def add_studio(self, studio_id, name=None):
        self.studios[studio_id] = StudioRef(
            id=studio_id,
            name=name or f"Studio {studio_id}",
        )

    def get_scene(self, scene_id):
        return self.scenes[scene_id]

    def get_scenes(self, ids):
        return [self.scenes[i] for i in ids if i in self.scenes]

    def get_studio(self, studio_id):
        return self.studios[studio_id]

    def get_studios(self, ids):
        return [self.studios[i] for i in ids if i in self.studios]

    def validate_scenes_exist(self, ids):
        return {i for i in ids if i in self.scenes}

    def validate_studios_exist(self, ids):
        return {i for i in ids if i in self.studios}

    def find_studios(self, search, per_page=50):
        return list(self.studios.values())

    def find_scenes(self, search, per_page=50):
        return list(self.scenes.values())


@pytest.fixture
def service(db_path):
    init_db(db_path)
    config = Config(database_path=db_path, stash_url="http://localhost:9999")
    svc = StudioLinkService(config)
    fake = FakeStash()
    svc.stash = fake
    svc.repository = SceneStudioRepository(db_path)
    return svc, fake


class TestListSceneStudios:
    def test_merges_primary_and_additional(self, service):
        svc, fake = service
        primary = StudioRef(id=10, name="Primary")
        fake.add_scene(1, primary)
        fake.add_studio(10, "Primary")
        fake.add_studio(20, "Second")
        fake.add_studio(30, "Third")
        svc.repository.add(1, 10)
        svc.repository.add(1, 20)
        svc.repository.add(1, 30)

        result = svc.list_scene_studios(1)

        assert result.primary.id == 10
        assert [studio.id for studio in result.additional] == [20, 30]

    def test_no_additional(self, service):
        svc, fake = service
        fake.add_scene(1, StudioRef(id=10, name="Primary"))
        result = svc.list_scene_studios(1)
        assert result.additional == []


class TestAddRemove:
    def test_add_primary_is_noop(self, service):
        svc, fake = service
        fake.add_scene(1, StudioRef(id=10, name="Primary"))
        fake.add_studio(10, "Primary")

        result = svc.add_scene_studio(1, 10)

        assert result["added"] is False
        assert result["reason"] == "primary"
        assert svc.repository.count() == 0

    def test_add_and_duplicate(self, service):
        svc, fake = service
        fake.add_scene(1, StudioRef(id=10, name="Primary"))
        fake.add_studio(10, "Primary")
        fake.add_studio(20, "Second")

        assert svc.add_scene_studio(1, 20)["added"] is True
        assert svc.add_scene_studio(1, 20)["added"] is False
        assert svc.add_scene_studio(1, 20)["reason"] == "exists"

    def test_remove_primary_is_noop(self, service):
        svc, fake = service
        fake.add_scene(1, StudioRef(id=10, name="Primary"))

        result = svc.remove_scene_studio(1, 10)

        assert result["removed"] is False
        assert result["reason"] == "primary"

    def test_remove_additional(self, service):
        svc, fake = service
        fake.add_scene(1)
        svc.repository.add(1, 20)

        assert svc.remove_scene_studio(1, 20)["removed"] is True
        assert svc.remove_scene_studio(1, 20)["reason"] == "not_found"


class TestSet:
    def test_set_excludes_primary(self, service):
        svc, fake = service
        fake.add_scene(1, StudioRef(id=10, name="Primary"))
        fake.add_studio(10, "Primary")
        fake.add_studio(20, "Second")
        fake.add_studio(30, "Third")

        result = svc.set_scene_studios(1, [10, 20, 30])

        assert [studio.id for studio in result.additional] == [20, 30]
        assert {link.studio_id for link in svc.repository.list_for_scene(1)} == {
            20,
            30,
        }

    def test_set_rejects_missing_studio(self, service):
        svc, fake = service
        fake.add_scene(1)

        with pytest.raises(Exception):
            svc.set_scene_studios(1, [99])


class TestStudioScenes:
    def test_list(self, service):
        svc, fake = service
        fake.add_studio(10, "Studio")
        fake.add_scene(1)
        fake.add_scene(2)
        svc.repository.add(1, 10)
        svc.repository.add(2, 10)

        result = svc.list_studio_scenes(10)

        assert result.total == 2
        assert {scene.id for scene in result.scenes} == {1, 2}


class TestValidation:
    def test_broken_links(self, service):
        svc, fake = service
        fake.add_scene(1)
        fake.add_studio(10)
        svc.repository.add(1, 10)
        svc.repository.add(2, 10)  # scene 2 missing
        svc.repository.add(1, 99)  # studio 99 missing

        result = svc.validate_links()

        assert result.valid_count == 1
        assert len(result.broken_links) == 2

    def test_remove_broken(self, service):
        svc, fake = service
        fake.add_scene(1)
        fake.add_studio(10)
        svc.repository.add(1, 10)
        svc.repository.add(2, 10)

        assert svc.remove_broken_links() == 1
        assert svc.repository.count() == 1


class TestExportImport:
    def test_export_import(self, service):
        svc, fake = service
        fake.add_scene(1)
        fake.add_studio(10)
        svc.repository.add(1, 10)

        exported = svc.export_links()
        assert exported.version == 1
        assert exported.links[0]["scene_id"] == 1

        svc.repository.delete_all()
        imported = svc.import_links(ExportData.from_dict(exported.to_dict()))

        assert imported == 1
        assert svc.repository.count() == 1

    def test_import_skips_missing_entities(self, service):
        svc, fake = service
        fake.add_scene(1)

        imported = svc.import_links(
            ExportData.from_dict(
                {"version": 1, "links": [{"scene_id": 1, "studio_id": 10}]}
            )
        )

        assert imported == 0
