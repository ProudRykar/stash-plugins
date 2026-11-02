from backend.config import (
    _api_key_from_stash_config,
    _session_cookie_header,
    load_config,
)


class TestSessionCookie:
    def test_dict_cookie(self):
        assert (
            _session_cookie_header(
                {"SessionCookie": {"Name": "session", "Value": "abc"}}
            )
            == "session=abc"
        )

    def test_string_cookie(self):
        assert _session_cookie_header({"SessionCookie": "session=abc"}) == "session=abc"

    def test_empty(self):
        assert _session_cookie_header({}) is None
        assert _session_cookie_header({"SessionCookie": None}) is None


class TestApiKey:
    def test_reads_top_level_key(self, tmp_path):
        (tmp_path / "config.yml").write_text(
            "host: 0.0.0.0\napi_key: secret\n", encoding="utf-8"
        )
        assert _api_key_from_stash_config({"Dir": str(tmp_path)}) == "secret"

    def test_ignores_nested_keys(self, tmp_path):
        (tmp_path / "config.yml").write_text(
            "plugins:\n  settings:\n    many-studios:\n      api_key: wrong\n",
            encoding="utf-8",
        )
        assert _api_key_from_stash_config({"Dir": str(tmp_path)}) is None


class TestLoadConfig:
    def test_uses_server_connection(self, tmp_path):
        (tmp_path / "config.yml").write_text("api_key: key\n", encoding="utf-8")

        config = load_config(
            str(tmp_path / "backend"),
            {},
            {
                "Scheme": "http",
                "Port": 9999,
                "Dir": str(tmp_path),
                "SessionCookie": {"Name": "session", "Value": "cookie"},
            },
        )

        assert config.stash_url == "http://127.0.0.1:9999"
        assert config.stash_api_key == "key"
        assert config.stash_session_cookie == "session=cookie"
        assert config.database_path.endswith("many-studios.sqlite")

    def test_explicit_settings_win(self, tmp_path):
        (tmp_path / "config.yml").write_text("api_key: key\n", encoding="utf-8")

        config = load_config(
            str(tmp_path / "backend"),
            {
                "stash_url": "https://stash.example/",
                "api_key": "explicit",
                "database_path": str(tmp_path / "custom.sqlite"),
            },
            {"Dir": str(tmp_path)},
        )

        assert config.stash_url == "https://stash.example"
        assert config.stash_api_key == "explicit"
        assert config.database_path == str(tmp_path / "custom.sqlite")

    def test_missing_port_falls_back(self, tmp_path):
        config = load_config(str(tmp_path / "backend"), {}, {})
        assert config.stash_url == "http://127.0.0.1:9999"
