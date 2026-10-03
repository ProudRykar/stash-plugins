import os
from pathlib import Path
from dataclasses import dataclass
from backend.errors import PluginError

@dataclass(frozen=True, slots=True)
class Config:
    database_path: str
    stash_url: str
    stash_api_key: str | None = None


def load_config(plugin_dir: str, settings: dict | None = None) -> Config:
    settings = settings or {}

    db_path = settings.get("database_path", "").strip()
    if not db_path:
        data_dir = Path(plugin_dir) / "data"
        data_dir.mkdir(parents=True, exist_ok=True)
        db_path = str(data_dir / "tag-relations.sqlite")

    stash_url = settings.get("stash_url", "").strip()

    if not stash_url:
        raise PluginError(message="Stash URL is not configured, Please configure 'stash_url' in plugin settings.", code=500)

    api_key = settings.get("api_key", "").strip() or None

    return Config(
        database_path=db_path,
        stash_url=stash_url.rstrip("/"),
        stash_api_key=api_key,
    )