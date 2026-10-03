import logging
import os
from dataclasses import dataclass
from pathlib import Path

from backend.errors import PluginError

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class Config:
    database_path: str
    stash_url: str
    stash_api_key: str | None = None
    stash_session_cookie: str | None = None


def _session_cookie_header(server_connection: dict) -> str | None:
    cookie = server_connection.get("SessionCookie")

    if isinstance(cookie, dict):
        name = str(cookie.get("Name") or "").strip()
        value = str(cookie.get("Value") or "").strip()

        if name and value:
            return f"{name}={value}"

        return None

    if isinstance(cookie, str):
        cookie = cookie.strip()

        return cookie or None

    return None


def _api_key_from_stash_config(server_connection: dict) -> str | None:
    config_dir = str(server_connection.get("Dir") or "").strip()

    if not config_dir:
        return None

    config_path = (
        config_dir
        if os.path.isfile(config_dir)
        else os.path.join(config_dir, "config.yml")
    )

    try:
        with open(config_path, encoding="utf-8") as fh:
            for line in fh:
                if line.startswith("api_key:"):
                    return line.split(":", 1)[1].strip() or None

    except OSError as e:
        logger.warning(
            "Could not read Stash config at %s: %s",
            config_path,
            e,
        )

    return None


def load_config(
    plugin_dir: str,
    settings: dict | None = None,
    server_connection: dict | None = None,
) -> Config:
    settings = settings or {}
    server_connection = server_connection or {}

    # Database path can still be configured through plugin settings.
    db_path = settings.get("database_path", "").strip()

    if not db_path:
        data_dir = Path(plugin_dir) / "data"
        data_dir.mkdir(parents=True, exist_ok=True)
        db_path = str(data_dir / "tag-relations.sqlite")

    # Explicit stash_url setting has priority if present.
    stash_url = settings.get("stash_url", "").strip()

    # Otherwise derive the URL from Stash's server_connection.
    if not stash_url:
        scheme = str(
            server_connection.get("Scheme", "http")
        ).strip()

        port = server_connection.get("Port")

        if not port:
            raise PluginError(
                message="Stash server port is not available in plugin input.",
                code=500,
            )

        stash_url = f"{scheme}://127.0.0.1:{port}"

    api_key = settings.get("api_key", "").strip() or None

    # Stash does not send plugin settings on stdin, so fall back to the API
    # key of the running Stash instance (config.yml is pointed at by
    # server_connection["Dir"]).
    if not api_key:
        api_key = _api_key_from_stash_config(server_connection)

    return Config(
        database_path=db_path,
        stash_url=stash_url.rstrip("/"),
        stash_api_key=api_key,
        stash_session_cookie=_session_cookie_header(
            server_connection
        ),
    )
