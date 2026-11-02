import json
import logging
import urllib.error
import urllib.request
from typing import Optional

from backend.errors import NotFoundError, StashAPIError
from backend.models import SceneRef, StudioRef

logger = logging.getLogger(__name__)


SCENE_BY_ID_QUERY = """
query Scene($id: ID!) {
    findScene(id: $id) {
        id
        title
        date
        studio {
            id
            name
            image_path
        }
    }
}
"""

SCENES_BY_IDS_QUERY = """
query Scenes($ids: [ID!]!) {
    findScenes(ids: $ids) {
        count
        scenes {
            id
            title
            date
            studio {
                id
                name
                image_path
            }
        }
    }
}
"""

STUDIOS_BY_IDS_QUERY = """
query Studios($ids: [ID!]!) {
    findStudios(ids: $ids) {
        count
        studios {
            id
            name
            image_path
        }
    }
}
"""

FIND_STUDIOS_QUERY = """
query FindStudios($filter: FindFilterType) {
    findStudios(filter: $filter) {
        count
        studios {
            id
            name
            image_path
        }
    }
}
"""

FIND_SCENES_QUERY = """
query FindScenes($filter: FindFilterType) {
    findScenes(filter: $filter) {
        count
        scenes {
            id
            title
            date
            studio {
                id
                name
                image_path
            }
        }
    }
}
"""


def _as_int(value) -> int:
    return int(value)


def _parse_studio(data: dict | None) -> Optional[StudioRef]:
    if not data:
        return None

    return StudioRef(
        id=_as_int(data["id"]),
        name=data.get("name") or "",
        image_path=data.get("image_path"),
    )


def _parse_scene(data: dict) -> SceneRef:
    return SceneRef(
        id=_as_int(data["id"]),
        title=data.get("title"),
        date=data.get("date"),
        studio=_parse_studio(data.get("studio")),
    )


class StashClient:
    def __init__(
        self,
        base_url: str,
        api_key: Optional[str] = None,
        session_cookie: Optional[str] = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.session_cookie = session_cookie
        self.graphql_url = f"{self.base_url}/graphql"

    def _request(self, query: str, variables: dict | None = None) -> dict:
        payload = {"query": query, "variables": variables or {}}
        data = json.dumps(payload).encode("utf-8")

        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        if self.api_key:
            headers["ApiKey"] = self.api_key

        if self.session_cookie:
            headers["Cookie"] = self.session_cookie

        request = urllib.request.Request(
            self.graphql_url,
            data=data,
            headers=headers,
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                result = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise StashAPIError(f"HTTP {exc.code}: {body}") from exc
        except urllib.error.URLError as exc:
            raise StashAPIError(f"Connection error: {exc}") from exc
        except json.JSONDecodeError as exc:
            raise StashAPIError(f"Invalid JSON response from Stash: {exc}") from exc

        if "errors" in result:
            raise StashAPIError(f"GraphQL errors: {result['errors']}")

        return result.get("data", {})

    def get_scene(self, scene_id: int) -> SceneRef:
        data = self._request(SCENE_BY_ID_QUERY, {"id": str(scene_id)})
        scene = data.get("findScene")

        if not scene:
            raise NotFoundError("Scene", scene_id)

        return _parse_scene(scene)

    def get_scenes(self, scene_ids: list[int]) -> list[SceneRef]:
        if not scene_ids:
            return []

        data = self._request(
            SCENES_BY_IDS_QUERY,
            {"ids": [str(scene_id) for scene_id in scene_ids]},
        )
        scenes = ((data.get("findScenes") or {}).get("scenes")) or []
        return [_parse_scene(scene) for scene in scenes]

    def get_studios(self, studio_ids: list[int]) -> list[StudioRef]:
        if not studio_ids:
            return []

        data = self._request(
            STUDIOS_BY_IDS_QUERY,
            {"ids": [str(studio_id) for studio_id in studio_ids]},
        )
        studios = ((data.get("findStudios") or {}).get("studios")) or []
        return [_parse_studio(studio) for studio in studios if studio]

    def get_studio(self, studio_id: int) -> StudioRef:
        studios = self.get_studios([studio_id])

        if not studios:
            raise NotFoundError("Studio", studio_id)

        return studios[0]

    def find_studios(self, search: str, per_page: int = 50) -> list[StudioRef]:
        data = self._request(
            FIND_STUDIOS_QUERY,
            {"filter": {"q": search, "page": 1, "per_page": per_page}},
        )
        studios = ((data.get("findStudios") or {}).get("studios")) or []
        return [_parse_studio(studio) for studio in studios if studio]

    def find_scenes(self, search: str, per_page: int = 50) -> list[SceneRef]:
        data = self._request(
            FIND_SCENES_QUERY,
            {"filter": {"q": search, "page": 1, "per_page": per_page}},
        )
        scenes = ((data.get("findScenes") or {}).get("scenes")) or []
        return [_parse_scene(scene) for scene in scenes]

    def validate_scenes_exist(self, scene_ids: list[int]) -> set[int]:
        if not scene_ids:
            return set()

        return {scene.id for scene in self.get_scenes(scene_ids)}

    def validate_studios_exist(self, studio_ids: list[int]) -> set[int]:
        if not studio_ids:
            return set()

        return {studio.id for studio in self.get_studios(studio_ids)}
