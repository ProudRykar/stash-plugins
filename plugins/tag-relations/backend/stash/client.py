import json
import logging
import urllib.request
from typing import Optional

from backend.errors import StashAPIError, TagNotFoundError
from backend.models import Tag

logger = logging.getLogger(__name__)


TAG_QUERY = """
query FindTags($filter: FindFilterType) {
    findTags(filter: $filter) {
        count
        tags {
            id
            name
        }
    }
}
"""


TAGS_BY_IDS_QUERY = """
query Tags($ids: [ID!]!) {
    findTags(ids: $ids) {
        count
        tags {
            id
            name
        }
    }
}
"""


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

        logger.info(
            "Stash client configured: url=%s api_key_present=%s "
            "session_cookie_present=%s",
            self.graphql_url,
            bool(self.api_key),
            bool(self.session_cookie),
        )

    def _request(
        self,
        query: str,
        variables: dict | None = None,
    ) -> dict:
        payload = {
            "query": query,
            "variables": variables or {},
        }

        data = json.dumps(payload).encode("utf-8")

        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        if self.api_key:
            headers["ApiKey"] = self.api_key

        if self.session_cookie:
            headers["Cookie"] = self.session_cookie

        logger.info(
            "GraphQL request: url=%s api_key_present=%s "
            "session_cookie_present=%s",
            self.graphql_url,
            bool(self.api_key),
            bool(self.session_cookie),
        )

        request = urllib.request.Request(
            self.graphql_url,
            data=data,
            headers=headers,
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                result = json.loads(
                    response.read().decode("utf-8")
                )

        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8")

            raise StashAPIError(
                f"HTTP {e.code}: {body}"
            ) from e

        except urllib.error.URLError as e:
            raise StashAPIError(
                f"Connection error: {e}"
            ) from e

        except json.JSONDecodeError as e:
            raise StashAPIError(
                f"Invalid JSON response from Stash: {e}"
            ) from e

        if "errors" in result:
            raise StashAPIError(
                f"GraphQL errors: {result['errors']}"
            )

        return result.get("data", {})

    def execute(
        self,
        query: str,
        variables: dict | None = None,
    ) -> dict:
        return self._request(query, variables)

    @staticmethod
    def _parse_tags(data: dict) -> list[Tag]:
        find_tags = data.get("findTags")

        if not find_tags:
            return []

        tags_data = find_tags.get("tags", [])

        return [
            Tag(
                id=int(tag["id"]),
                name=tag["name"],
            )
            for tag in tags_data
        ]

    def get_tag(self, tag_id: int) -> Tag:
        tags = self.get_tags([tag_id])

        if not tags:
            raise TagNotFoundError(tag_id)

        return tags[0]

    def find_tags(
        self,
        search: str,
        per_page: int = 50,
    ) -> list[Tag]:
        variables = {
            "filter": {
                "q": search,
                "page": 1,
                "per_page": per_page,
            }
        }

        data = self._request(
            TAG_QUERY,
            variables,
        )

        return self._parse_tags(data)

    def get_tags(self, ids: list[int]) -> list[Tag]:
        if not ids:
            return []

        data = self._request(
            TAGS_BY_IDS_QUERY,
            {
                "ids": [str(tag_id) for tag_id in ids],
            },
        )

        return self._parse_tags(data)

    def validate_tags_exist(
        self,
        tag_ids: list[int],
    ) -> set[int]:
        if not tag_ids:
            return set()

        tags = self.get_tags(tag_ids)

        return {tag.id for tag in tags}