import json
from unittest.mock import Mock, patch

import pytest

from backend.errors import NotFoundError, StashAPIError
from backend.stash.client import StashClient


@pytest.fixture
def client():
    return StashClient("http://localhost:9999", api_key="key")


def _mock_response(payload):
    response = Mock()
    response.read.return_value = json.dumps(payload).encode()
    response.__enter__ = Mock(return_value=response)
    response.__exit__ = Mock(return_value=False)
    return response


def _headers(mock_urlopen):
    request = mock_urlopen.call_args[0][0]
    return {key.lower(): value for key, value in request.header_items()}


class TestStashClient:
    @patch("urllib.request.urlopen")
    def test_get_scene(self, mock_urlopen, client):
        mock_urlopen.return_value = _mock_response(
            {
                "data": {
                    "findScene": {
                        "id": "1",
                        "title": "Scene",
                        "date": "2024-01-01",
                        "studio": {"id": "10", "name": "Studio", "image_path": "/x"},
                    }
                }
            }
        )

        scene = client.get_scene(1)

        assert scene.id == 1
        assert scene.studio.id == 10
        assert scene.studio.name == "Studio"

    @patch("urllib.request.urlopen")
    def test_get_scene_not_found(self, mock_urlopen, client):
        mock_urlopen.return_value = _mock_response({"data": {"findScene": None}})

        with pytest.raises(NotFoundError):
            client.get_scene(999)

    @patch("urllib.request.urlopen")
    def test_get_studios(self, mock_urlopen, client):
        mock_urlopen.return_value = _mock_response(
            {
                "data": {
                    "findStudios": {
                        "count": 2,
                        "studios": [
                            {"id": "1", "name": "One", "image_path": None},
                            {"id": "2", "name": "Two", "image_path": "/two"},
                        ],
                    }
                }
            }
        )

        studios = client.get_studios([1, 2])

        assert [studio.id for studio in studios] == [1, 2]

    @patch("urllib.request.urlopen")
    def test_find_studios(self, mock_urlopen, client):
        mock_urlopen.return_value = _mock_response(
            {
                "data": {
                    "findStudios": {
                        "count": 1,
                        "studios": [{"id": "5", "name": "Found"}],
                    }
                }
            }
        )

        studios = client.find_studios("Found")

        assert len(studios) == 1
        assert studios[0].name == "Found"

    @patch("urllib.request.urlopen")
    def test_sends_auth_headers(self, mock_urlopen):
        client = StashClient(
            "http://localhost:9999",
            api_key="key",
            session_cookie="session=abc",
        )
        mock_urlopen.return_value = _mock_response({"data": {}})

        client._request("query { version { version } }")

        headers = _headers(mock_urlopen)
        assert headers.get("apikey") == "key"
        assert headers.get("cookie") == "session=abc"

    @patch("urllib.request.urlopen")
    def test_graphql_error(self, mock_urlopen, client):
        mock_urlopen.return_value = _mock_response(
            {"errors": [{"message": "bad query"}]}
        )

        with pytest.raises(StashAPIError):
            client._request("query { nope }")
