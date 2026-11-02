#!/usr/bin/env python3

import json
import logging
import os
import sys
from typing import Any

# Stash executes backend/main.py directly, so Python puts .../backend on
# sys.path. Add the plugin root to make `from backend.*` imports work.
PLUGIN_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

if PLUGIN_ROOT not in sys.path:
    sys.path.insert(0, PLUGIN_ROOT)

from backend.config import load_config
from backend.db.database import init_db
from backend.errors import PluginError
from backend.models import ExportData
from backend.services.links import StudioLinkService
from backend.services.sync import SyncService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(__name__)


def read_input() -> dict:
    raw = sys.stdin.read()

    if not raw.strip():
        logger.error("Received empty stdin")
        return {}

    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.error("Invalid JSON input: %s", exc)
        return {"_fatal_error": {"code": "INVALID_JSON", "message": str(exc)}}


def write_output(result: dict) -> None:
    sys.stdout.write(json.dumps(result, ensure_ascii=False))
    sys.stdout.write("\n")
    sys.stdout.flush()


def error_response(code: str, message: str) -> dict:
    return {
        "ok": False,
        "error": f"{code}: {message}",
        "output": None,
    }


def success_response(data: Any = None) -> dict:
    return {
        "ok": True,
        "error": None,
        "output": data,
    }


def get_plugin_dir() -> str:
    return os.path.dirname(os.path.abspath(__file__))


def get_settings(input_data: dict, args: dict) -> dict:
    settings = input_data.get("settings") or args.get("settings") or {}

    if not isinstance(settings, dict):
        logger.warning("Expected settings to be a dict")
        return {}

    return settings


def get_server_connection(input_data: dict) -> dict:
    server_connection = input_data.get("server_connection") or {}

    if not isinstance(server_connection, dict):
        logger.warning("Expected server_connection to be a dict")
        return {}

    return server_connection


def get_hook_context(input_data: dict, args: dict) -> dict | None:
    # Stash places hookContext inside args. The top-level fallback keeps the
    # plugin compatible with older/experimental callers.
    hook_context = args.get("hookContext") or input_data.get("hookContext")

    if hook_context is None:
        return None

    if not isinstance(hook_context, dict):
        logger.warning("Expected hookContext to be a dict")
        return None

    return hook_context


def require_int(args: dict, key: str) -> int:
    value = args.get(key)

    if value is None or value == "":
        raise PluginError("MISSING_ARG", f"{key} required")

    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise PluginError("INVALID_ARG", f"{key} must be an integer") from exc


def to_int_list(value: Any, key: str) -> list[int]:
    if value is None:
        return []

    if not isinstance(value, list):
        raise PluginError("INVALID_ARG", f"{key} must be a list")

    try:
        return [int(item) for item in value if item is not None and item != ""]
    except (TypeError, ValueError) as exc:
        raise PluginError("INVALID_ARG", f"{key} must contain integers") from exc


def dispatch_operation(input_data: dict, args: dict) -> dict:
    settings = get_settings(input_data, args)
    server_connection = get_server_connection(input_data)

    config = load_config(
        get_plugin_dir(),
        settings,
        server_connection,
    )

    init_db(config.database_path)

    service = StudioLinkService(config)
    sync = SyncService(config)

    hook_context = get_hook_context(input_data, args)

    if hook_context:
        return success_response(sync.handle_hook(hook_context))

    operation = args.get("operation")

    if not operation:
        return error_response("MISSING_OPERATION", "No operation specified")

    if operation == "list_scene_studios":
        scene_id = require_int(args, "scene_id")
        return success_response(service.list_scene_studios(scene_id).to_dict())

    if operation == "list_studio_scenes":
        studio_id = require_int(args, "studio_id")
        page = int(args.get("page", 1))
        per_page = int(args.get("per_page", 40))
        return success_response(
            service.list_studio_scenes(studio_id, page, per_page).to_dict()
        )

    if operation == "add_scene_studio":
        scene_id = require_int(args, "scene_id")
        studio_id = require_int(args, "studio_id")
        return success_response(service.add_scene_studio(scene_id, studio_id))

    if operation == "remove_scene_studio":
        scene_id = require_int(args, "scene_id")
        studio_id = require_int(args, "studio_id")
        return success_response(service.remove_scene_studio(scene_id, studio_id))

    if operation == "set_scene_studios":
        scene_id = require_int(args, "scene_id")
        studio_ids = to_int_list(args.get("studio_ids", []), "studio_ids")
        return success_response(
            service.set_scene_studios(scene_id, studio_ids).to_dict()
        )

    if operation == "find_studios":
        search = str(args.get("search") or "")
        per_page = int(args.get("per_page", 50))
        return success_response(
            [
                studio.to_dict()
                for studio in service.find_studios(search, per_page)
            ]
        )

    if operation == "find_scenes":
        search = str(args.get("search") or "")
        per_page = int(args.get("per_page", 50))
        return success_response(
            [scene.to_dict() for scene in service.find_scenes(search, per_page)]
        )

    if operation == "validate_links":
        return success_response(service.validate_links().to_dict())

    if operation == "remove_broken_links":
        removed = service.remove_broken_links()
        return success_response({"removed_count": removed})

    if operation == "export_links":
        return success_response(service.export_links().to_dict())

    if operation == "import_links":
        data = ExportData.from_dict(
            {
                "version": args.get("version", 1),
                "links": args.get("links", []),
            }
        )
        overwrite = bool(args.get("overwrite", False))
        imported = service.import_links(data, overwrite)
        return success_response({"imported_count": imported})

    if operation == "get_stats":
        return success_response(service.get_stats())

    return error_response("UNKNOWN_OPERATION", f"Unknown operation: {operation}")


def main() -> int:
    try:
        input_data = read_input()

        if not input_data:
            result = error_response("EMPTY_INPUT", "Plugin received empty input")
            write_output(result)
            return 1

        if "_fatal_error" in input_data:
            fatal = input_data["_fatal_error"]
            result = error_response(fatal["code"], fatal["message"])
            write_output(result)
            return 1

        args = input_data.get("args") or {}

        if not isinstance(args, dict):
            result = error_response("INVALID_ARGS", "args must be an object")
            write_output(result)
            return 1

        result = dispatch_operation(input_data, args)
        write_output(result)

        return 0 if result.get("ok") else 1

    except PluginError as exc:
        logger.exception("Plugin operation failed")
        write_output(error_response(exc.code, exc.message))
        return 1

    except Exception as exc:
        logger.exception("Fatal plugin error")
        write_output(error_response("FATAL_ERROR", str(exc)))
        return 1


if __name__ == "__main__":
    sys.exit(main())
