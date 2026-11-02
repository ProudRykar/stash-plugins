import logging
import os
from dataclasses import dataclass
from pathlib import Path

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
                # Only accept a top-level api_key, not nested stash-box keys.
                if line.startswith("api_key:"):
                    return line.split(":", 1)[1].strip() or None

    except OSError as exc:
        logger.warning("Could not read Stash config at %s: %s", config_path, exc)

    return None


def load_config(
    plugin_dir: str,
    settings: dict | None = None,
    server_connection: dict | None = None,
) -> Config:
    settings = settings or {}
    server_connection = server_connection or {}

    database_path = str(settings.get("database_path") or "").strip()

    if not database_path:
        data_dir = Path(plugin_dir).parent / "data"
        data_dir.mkdir(parents=True, exist_ok=True)
        database_path = str(data_dir / "many-studios.sqlite")

    stash_url = str(settings.get("stash_url") or "").strip()

    if not stash_url:
        scheme = str(server_connection.get("Scheme") or "http").strip() or "http"
        port = server_connection.get("Port")

        if not port:
            logger.warning(
                "Stash port is missing from server_connection; using 9999"
            )
            port = 9999

        stash_url = f"{scheme}://127.0.0.1:{port}"

    api_key = str(settings.get("api_key") or "").strip() or None

    if not api_key:
        api_key = _api_key_from_stash_config(server_connection)

    return Config(
        database_path=database_path,
        stash_url=stash_url.rstrip("/"),
        stash_api_key=api_key,
        stash_session_cookie=_session_cookie_header(server_connection),
    )
