import json
import urllib.request
import logging
from typing import Optional
from backend.models import Tag
from backend.errors import StashAPIError, TagNotFoundError

logger = logging.getLogger(__name__)

TAG_QUERY = """
query FindTags($filter: TagFilterType) {
    findTags(filter: $filter) {
        id
        name
    }
}
"""

TAG_BY_ID_QUERY = """
query Tag($id: ID!) {
    tag(id: $id) {
        id
        name
    }
}
"""

TAGS_BY_IDS_QUERY = """
query Tags($ids: [ID!]!) {
    findTags(ids: $ids) {
        tags {
            id
            name
        }
    }
}
"""


class StashClient:
    def __init__(self, base_url: str, api_key: Optional[str] = None):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
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

        req = urllib.request.Request(self.graphql_url, data=data, headers=headers, method="POST")

        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                result = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8")
            raise StashAPIError(f"HTTP {e.code}: {body}")
        except urllib.error.URLError as e:
            raise StashAPIError(f"Connection error: {e}")

        if "errors" in result:
            raise StashAPIError(f"GraphQL errors: {result['errors']}")

        return result.get("data", {})

    def execute(self, query: str, variables: dict | None = None) -> dict:
        return self._request(query, variables)

    def get_tag(self, tag_id: int) -> Tag:
        data = self._request(TAG_BY_ID_QUERY, {"id": tag_id})
        tag_data = data.get("tag")
        if not tag_data:
            raise TagNotFoundError(tag_id)
        return Tag(id=int(tag_data["id"]), name=tag_data["name"])

    def find_tags(self, search: str, per_page: int = 50) -> list[Tag]:
        data = self._request(TAG_QUERY, {"filter": {"name": {"value": search, "modifier": "INCLUDES"}, "per_page": per_page}})
        tags_data = data.get("findTags", [])
        return [Tag(id=int(t["id"]), name=t["name"]) for t in tags_data]

    def get_tags(self, ids: list[int]) -> list[Tag]:
        if not ids:
            return []

        data = self._request(
            TAGS_BY_IDS_QUERY,
            {"ids": [str(i) for i in ids]},
        )

        tags_data = data.get("findTags", {}).get("tags", [])

        return [
            Tag(id=int(t["id"]), name=t["name"])
            for t in tags_data
        ]
    
    def validate_tags_exist(self, tag_ids: list[int]) -> set[int]:
        if not tag_ids:
            return set()
        tags = self.get_tags(tag_ids)
        return {t.id for t in tags}