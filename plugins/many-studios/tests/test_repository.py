import pytest

from backend.db.database import init_db
from backend.db.repository import SceneStudioRepository


@pytest.fixture
def repo(db_path):
    init_db(db_path)
    return SceneStudioRepository(db_path)


class TestRepository:
    def test_add_and_duplicate(self, repo):
        assert repo.add(1, 2) is True
        assert repo.add(1, 2) is False
        assert repo.count() == 1

    def test_remove(self, repo):
        repo.add(1, 2)
        assert repo.remove(1, 2) is True
        assert repo.remove(1, 2) is False
        assert repo.count() == 0

    def test_list_for_scene(self, repo):
        repo.add(1, 2)
        repo.add(1, 3)
        repo.add(2, 2)

        links = repo.list_for_scene(1)
        assert {link.studio_id for link in links} == {2, 3}

    def test_list_for_studio(self, repo):
        repo.add(1, 2)
        repo.add(2, 2)
        repo.add(3, 3)

        links, total = repo.list_for_studio(2)
        assert total == 2
        assert {link.scene_id for link in links} == {1, 2}

    def test_list_for_studio_pagination(self, repo):
        for scene_id in range(1, 6):
            repo.add(scene_id, 10)

        links, total = repo.list_for_studio(10, page=2, per_page=2)
        assert total == 5
        assert len(links) == 2

    def test_set_for_scene_replaces(self, repo):
        repo.add(1, 2)
        repo.add(1, 3)
        repo.add(2, 4)

        repo.set_for_scene(1, [3, 5])

        assert {link.studio_id for link in repo.list_for_scene(1)} == {3, 5}
        assert {link.studio_id for link in repo.list_for_scene(2)} == {4}

    def test_set_for_scene_empty(self, repo):
        repo.add(1, 2)
        repo.set_for_scene(1, [])
        assert repo.list_for_scene(1) == []

    def test_delete_for_scene(self, repo):
        repo.add(1, 2)
        repo.add(1, 3)
        repo.add(2, 2)

        assert repo.delete_for_scene(1) == 2
        assert repo.count() == 1

    def test_delete_for_studio(self, repo):
        repo.add(1, 2)
        repo.add(2, 2)
        repo.add(2, 3)

        assert repo.delete_for_studio(2) == 2
        assert repo.count() == 1

    def test_counts(self, repo):
        repo.add(1, 10)
        repo.add(1, 11)
        repo.add(2, 10)

        assert repo.count() == 3
        assert repo.count_unique_scenes() == 2
        assert repo.count_unique_studios() == 2
        assert repo.count_for_scene(1) == 2
        assert repo.count_for_studio(10) == 2
