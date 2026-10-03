import sys
import os
import tempfile

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.config import (
    Config,
    load_config,
    _session_cookie_header,
    _api_key_from_stash_config,
)
from backend.errors import PluginError


class TestSessionCookieHeader:
    def test_dict_cookie(self):
        assert (
            _session_cookie_header(
                {"SessionCookie": {"Name": "session", "Value": "abc123"}}
            )
            == "session=abc123"
        )

    def test_string_cookie(self):
        assert (
            _session_cookie_header({"SessionCookie": "session=abc123"})
            == "session=abc123"
        )

    def test_missing_cookie(self):
        assert _session_cookie_header({}) is None

    def test_null_cookie(self):
        assert _session_cookie_header({"SessionCookie": None}) is None

    def test_empty_dict_cookie(self):
        assert (
            _session_cookie_header({"SessionCookie": {"Name": "", "Value": ""}}) is None
        )


class TestApiKeyFromStashConfig:
    def test_reads_top_level_api_key(self, tmp_path):
        (tmp_path / "config.yml").write_text(
            "host: 0.0.0.0\napi_key: secret-key\npassword: something\n"
        )

        assert _api_key_from_stash_config({"Dir": str(tmp_path)}) == "secret-key"

    def test_ignores_indented_keys(self, tmp_path):
        (tmp_path / "config.yml").write_text(
            "stash_boxes:\n"
            "    - apikey: stashbox-key\n"
            "plugins:\n"
            "    settings:\n"
            "        tag-relations:\n"
            "            api_key: plugin-key\n"
        )

        assert _api_key_from_stash_config({"Dir": str(tmp_path)}) is None

    def test_missing_config_file(self, tmp_path):
        assert _api_key_from_stash_config({"Dir": str(tmp_path)}) is None

    def test_missing_dir(self):
        assert _api_key_from_stash_config({}) is None

    def test_accepts_config_file_path(self, tmp_path):
        config_file = tmp_path / "config.yml"
        config_file.write_text("api_key: from-file\n")

        assert _api_key_from_stash_config({"Dir": str(config_file)}) == "from-file"


class TestLoadConfig:
    def _plugin_dir(self, tmp_path):
        return str(tmp_path / "backend")

    def test_uses_stash_credentials(self, tmp_path):
        stash_dir = tmp_path / "stash"
        stash_dir.mkdir()
        (stash_dir / "config.yml").write_text("api_key: stash-key\n")

        config = load_config(
            self._plugin_dir(tmp_path),
            {},
            {
                "Scheme": "http",
                "Port": 9999,
                "Dir": str(stash_dir),
                "SessionCookie": {
                    "Name": "session",
                    "Value": "cookie-value",
                },
            },
        )

        assert config.stash_api_key == "stash-key"
        assert config.stash_session_cookie == "session=cookie-value"
        assert config.stash_url == "http://127.0.0.1:9999"
        assert config.database_path.endswith("tag-relations.sqlite")

    def test_explicit_api_key_setting_wins(self, tmp_path):
        stash_dir = tmp_path / "stash"
        stash_dir.mkdir()
        (stash_dir / "config.yml").write_text("api_key: stash-key\n")

        config = load_config(
            self._plugin_dir(tmp_path),
            {"api_key": "setting-key"},
            {"Scheme": "http", "Port": 9999, "Dir": str(stash_dir)},
        )

        assert config.stash_api_key == "setting-key"

    def test_no_credentials(self, tmp_path):
        config = load_config(
            self._plugin_dir(tmp_path),
            {},
            {"Scheme": "http", "Port": 9999},
        )

        assert config.stash_api_key is None
        assert config.stash_session_cookie is None

    def test_explicit_stash_url(self, tmp_path):
        config = load_config(
            self._plugin_dir(tmp_path),
            {"stash_url": "https://stash.example/"},
            {},
        )

        assert config.stash_url == "https://stash.example"

    def test_missing_port_raises(self, tmp_path):
        with pytest.raises(PluginError):
            load_config(
                self._plugin_dir(tmp_path),
                {},
                {"Scheme": "http"},
            )
