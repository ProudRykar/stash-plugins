from dataclasses import dataclass
from pathlib import Path

from backend.errors import PluginError


@dataclass(frozen=True, slots=True)
class Config:
    database_path: str
    stash_url: str
    stash_api_key: str | None = None


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

    return Config(
        database_path=db_path,
        stash_url=stash_url.rstrip("/"),
        stash_api_key=api_key,
    )