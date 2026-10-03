import sys
import os
import json
from unittest.mock import Mock, patch, MagicMock
import pytest
from urllib.error import HTTPError, URLError

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from backend.stash.client import StashClient
from backend.models import Tag
from backend.errors import StashAPIError, TagNotFoundError


@pytest.fixture
def client():
    return StashClient("http://localhost:9999", api_key="test-key")


class TestStashClient:
    @patch('urllib.request.urlopen')
    def test_execute_success(self, mock_urlopen, client):
        mock_response = Mock()
        mock_response.read.return_value = json.dumps({
            "data": {"findTags": [{"id": "1", "name": "Test"}]}
        }).encode()
        mock_response.__enter__ = Mock(return_value=mock_response)
        mock_response.__exit__ = Mock(return_value=False)
        mock_urlopen.return_value = mock_response

        result = client.execute("query { findTags { id name } }")

        assert "findTags" in result
        assert result["findTags"][0]["name"] == "Test"

    @patch('urllib.request.urlopen')
    def test_execute_http_error(self, mock_urlopen, client):
        mock_response = Mock()
        mock_response.read.return_value = b"Internal Server Error"
        mock_response.__enter__ = Mock(return_value=mock_response)
        mock_response.__exit__ = Mock(return_value=False)
        http_error = HTTPError("http://localhost:9999/graphql", 500, "Error", {}, mock_response)
        mock_urlopen.side_effect = http_error

        with pytest.raises(StashAPIError) as exc:
            client.execute("query { findTags { id name } }")
        assert "HTTP 500" in str(exc.value)

    @patch('urllib.request.urlopen')
    def test_execute_connection_error(self, mock_urlopen, client):
        mock_urlopen.side_effect = URLError("Connection refused")

        with pytest.raises(StashAPIError) as exc:
            client.execute("query { findTags { id name } }")
        assert "Connection error" in str(exc.value)

    @patch('urllib.request.urlopen')
    def test_execute_graphql_errors(self, mock_urlopen, client):
        mock_response = Mock()
        mock_response.read.return_value = json.dumps({
            "errors": [{"message": "Field not found"}]
        }).encode()
        mock_response.__enter__ = Mock(return_value=mock_response)
        mock_response.__exit__ = Mock(return_value=False)
        mock_urlopen.return_value = mock_response

        with pytest.raises(StashAPIError) as exc:
            client.execute("query { findTags { id name } }")
        assert "GraphQL errors" in str(exc.value)

    @patch('urllib.request.urlopen')
    def test_get_tag_success(self, mock_urlopen, client):
        mock_response = Mock()
        mock_response.read.return_value = json.dumps({
            "data": {"findTags": {"tags": [
                {"id": "42", "name": "Test Tag"}
            ]}}
        }).encode()
        mock_response.__enter__ = Mock(return_value=mock_response)
        mock_response.__exit__ = Mock(return_value=False)
        mock_urlopen.return_value = mock_response

        tag = client.get_tag(42)

        assert isinstance(tag, Tag)
        assert tag.id == 42
        assert tag.name == "Test Tag"

    @patch('urllib.request.urlopen')
    def test_get_tag_not_found(self, mock_urlopen, client):
        mock_response = Mock()
        mock_response.read.return_value = json.dumps({
            "data": {"tag": None}
        }).encode()
        mock_response.__enter__ = Mock(return_value=mock_response)
        mock_response.__exit__ = Mock(return_value=False)
        mock_urlopen.return_value = mock_response

        with pytest.raises(TagNotFoundError):
            client.get_tag(999)

    @patch('urllib.request.urlopen')
    def test_find_tags(self, mock_urlopen, client):
        mock_response = Mock()
        mock_response.read.return_value = json.dumps({
            "data": {"findTags": {"tags": [
                {"id": "1", "name": "Tag 1"},
                {"id": "2", "name": "Tag 2"},
            ]}}
        }).encode()
        mock_response.__enter__ = Mock(return_value=mock_response)
        mock_response.__exit__ = Mock(return_value=False)
        mock_urlopen.return_value = mock_response

        tags = client.find_tags("test")

        assert len(tags) == 2
        assert tags[0].name == "Tag 1"

    @patch('urllib.request.urlopen')
    def test_get_tags(self, mock_urlopen, client):
        mock_response = Mock()
        mock_response.read.return_value = json.dumps({
            "data": {"findTags": {"tags": [
                {"id": "1", "name": "Tag 1"},
                {"id": "3", "name": "Tag 3"},
            ]}}
        }).encode()
        mock_response.__enter__ = Mock(return_value=mock_response)
        mock_response.__exit__ = Mock(return_value=False)
        mock_urlopen.return_value = mock_response

        tags = client.get_tags([1, 3])

        assert len(tags) == 2
        assert {t.id for t in tags} == {1, 3}

    @patch('urllib.request.urlopen')
    def test_validate_tags_exist(self, mock_urlopen, client):
        mock_response = Mock()
        mock_response.read.return_value = json.dumps({
            "data": {"findTags": {"tags": [
                {"id": "1", "name": "Tag 1"},
                {"id": "3", "name": "Tag 3"},
            ]}}
        }).encode()
        mock_response.__enter__ = Mock(return_value=mock_response)
        mock_response.__exit__ = Mock(return_value=False)
        mock_urlopen.return_value = mock_response

        existing = client.validate_tags_exist([1, 2, 3])

        assert existing == {1, 3}

    def test_validate_tags_exist_empty(self, client):
        existing = client.validate_tags_exist([])
        assert existing == set()


class TestStashClientAuthHeaders:
    @patch('urllib.request.urlopen')
    def test_sends_api_key_header(self, mock_urlopen):
        client = StashClient(
            "http://localhost:9999",
            api_key="test-key",
        )

        self._prime_mock(mock_urlopen)
        client.execute("query { findTags { id } }")

        headers = self._request_headers(mock_urlopen)
        assert headers.get("apikey") == "test-key"
        assert "cookie" not in headers

    @patch('urllib.request.urlopen')
    def test_sends_session_cookie_header(self, mock_urlopen):
        client = StashClient(
            "http://localhost:9999",
            session_cookie="session=abc123",
        )

        self._prime_mock(mock_urlopen)
        client.execute("query { findTags { id } }")

        headers = self._request_headers(mock_urlopen)
        assert headers.get("cookie") == "session=abc123"
        assert "apikey" not in headers

    @patch('urllib.request.urlopen')
    def test_sends_both_headers(self, mock_urlopen):
        client = StashClient(
            "http://localhost:9999",
            api_key="test-key",
            session_cookie="session=abc123",
        )

        self._prime_mock(mock_urlopen)
        client.execute("query { findTags { id } }")

        headers = self._request_headers(mock_urlopen)
        assert headers.get("apikey") == "test-key"
        assert headers.get("cookie") == "session=abc123"

    @patch('urllib.request.urlopen')
    def test_no_auth_headers_without_credentials(self, mock_urlopen):
        client = StashClient("http://localhost:9999")

        self._prime_mock(mock_urlopen)
        client.execute("query { findTags { id } }")

        headers = self._request_headers(mock_urlopen)
        assert "apikey" not in headers
        assert "cookie" not in headers

    @staticmethod
    def _request_headers(mock_urlopen):
        request = mock_urlopen.call_args[0][0]

        return {
            key.lower(): value
            for key, value in request.header_items()
        }

    @staticmethod
    def _prime_mock(mock_urlopen):
        mock_response = Mock()
        mock_response.read.return_value = json.dumps({
            "data": {}
        }).encode()
        mock_response.__enter__ = Mock(return_value=mock_response)
        mock_response.__exit__ = Mock(return_value=False)
        mock_urlopen.return_value = mock_response