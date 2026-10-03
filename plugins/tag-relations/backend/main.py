#!/usr/bin/env python3

import json
import logging
import os
import sys
from typing import Any

# When Stash executes backend/main.py directly, Python puts
# .../tag-relations/backend into sys.path instead of the
# plugin root. Add the plugin root so `import backend.*` works.
PLUGIN_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

if PLUGIN_ROOT not in sys.path:
    sys.path.insert(0, PLUGIN_ROOT)

from backend.config import load_config
from backend.db.database import init_db
from backend.errors import PluginError
from backend.models import ExportData, RelationType
from backend.services.relations import RelationService
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

    except json.JSONDecodeError as e:
        logger.error("Invalid JSON input: %s", e)

        return {
            "_fatal_error": {
                "code": "INVALID_JSON",
                "message": str(e),
            }
        }


def write_output(result: dict) -> None:
    sys.stdout.write(
        json.dumps(
            result,
            ensure_ascii=False,
        )
    )
    sys.stdout.write("\n")
    sys.stdout.flush()


def error_response(
    code: str,
    message: str,
) -> dict:
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
    return os.path.dirname(
        os.path.abspath(__file__)
    )


def get_settings(input_data: dict) -> dict:
    settings = input_data.get("settings", {})

    if not isinstance(settings, dict):
        logger.warning(
            "Expected settings to be dict, got %s",
            type(settings).__name__,
        )
        return {}

    return settings


def get_server_connection(input_data: dict) -> dict:
    server_connection = input_data.get(
        "server_connection",
        {},
    )

    if not isinstance(server_connection, dict):
        logger.warning(
            "Expected server_connection to be dict, got %s",
            type(server_connection).__name__,
        )
        return {}

    return server_connection


def get_hook_context(input_data: dict) -> dict | None:
    hook_context = input_data.get("hookContext")

    if hook_context is None:
        return None

    if not isinstance(hook_context, dict):
        logger.warning(
            "Expected hookContext to be dict, got %s",
            type(hook_context).__name__,
        )
        return None

    return hook_context


def dispatch_operation(input_data: dict) -> dict:
    plugin_dir = get_plugin_dir()

    settings = get_settings(input_data)
    server_connection = get_server_connection(input_data)

    config = load_config(
        plugin_dir,
        settings,
        server_connection,
    )

    logger.debug(
        "Config: database_path=%r stash_url=%r api_key=%s",
        config.database_path,
        config.stash_url,
        bool(config.stash_api_key),
    )

    init_db(config.database_path)

    service = RelationService(config)
    sync = SyncService(config)

    hook_context = get_hook_context(input_data)

    if hook_context:
        hook_type = hook_context.get("type")

        logger.info(
            "Processing hook: %s",
            hook_type,
        )

        if hook_type == "Tag.Destroy.Post":
            tag_id = hook_context.get("id")

            if tag_id:
                count = sync.handle_tag_destroyed(
                    int(tag_id)
                )

                return success_response(
                    {
                        "deleted_relations": count,
                    }
                )

        elif hook_type == "Tag.Merge.Post":
            source_id = hook_context.get(
                "source_id"
            )
            destination_id = hook_context.get(
                "destination_id"
            )

            if source_id and destination_id:
                count = sync.handle_tag_merged(
                    int(source_id),
                    int(destination_id),
                )

                return success_response(
                    {
                        "rewritten_relations": count,
                    }
                )

        return success_response(
            {
                "handled": False,
            }
        )

    args = input_data.get("args", {})

    if not isinstance(args, dict):
        return error_response(
            "INVALID_ARGS",
            "args must be an object",
        )

    operation = args.get("operation")

    logger.info(
        "Operation requested: %r",
        operation,
    )

    if not operation:
        return error_response(
            "MISSING_OPERATION",
            "No operation specified",
        )

    try:
        if operation == "list_relations":
            tag_id = args.get("tag_id")

            if not tag_id:
                return error_response(
                    "MISSING_ARG",
                    "tag_id required",
                )

            result = service.list_relations(
                int(tag_id)
            )

            return success_response(
                {
                    "similar": [
                        {
                            "id": tag.id,
                            "name": tag.name,
                        }
                        for tag in result.similar
                    ],
                    "related": [
                        {
                            "id": tag.id,
                            "name": tag.name,
                        }
                        for tag in result.related
                    ],
                }
            )

        elif operation == "create_relation":
            tag_a_id = (
                args.get("tag_a_id")
                or args.get("source_tag_id")
            )

            tag_b_id = (
                args.get("tag_b_id")
                or args.get("target_tag_id")
            )

            relation_type = args.get(
                "relation_type"
            )

            if not all(
                [
                    tag_a_id,
                    tag_b_id,
                    relation_type,
                ]
            ):
                return error_response(
                    "MISSING_ARG",
                    "tag_a_id, tag_b_id, relation_type required",
                )

            relation = service.create_relation(
                int(tag_a_id),
                int(tag_b_id),
                RelationType(relation_type),
            )

            return success_response(
                relation.to_dict()
            )

        elif operation == "update_relation":
            tag_a_id = (
                args.get("tag_a_id")
                or args.get("source_tag_id")
            )

            tag_b_id = (
                args.get("tag_b_id")
                or args.get("target_tag_id")
            )

            relation_type = args.get(
                "relation_type"
            )

            if not all(
                [
                    tag_a_id,
                    tag_b_id,
                    relation_type,
                ]
            ):
                return error_response(
                    "MISSING_ARG",
                    "tag_a_id, tag_b_id, relation_type required",
                )

            relation = service.update_relation(
                int(tag_a_id),
                int(tag_b_id),
                RelationType(relation_type),
            )

            return success_response(
                relation.to_dict()
            )

        elif operation == "delete_relation":
            tag_a_id = (
                args.get("tag_a_id")
                or args.get("source_tag_id")
            )

            tag_b_id = (
                args.get("tag_b_id")
                or args.get("target_tag_id")
            )

            relation_type = args.get(
                "relation_type"
            )

            if not all(
                [
                    tag_a_id,
                    tag_b_id,
                    relation_type,
                ]
            ):
                return error_response(
                    "MISSING_ARG",
                    "tag_a_id, tag_b_id, relation_type required",
                )

            service.delete_relation(
                int(tag_a_id),
                int(tag_b_id),
                RelationType(relation_type),
            )

            return success_response(
                {
                    "deleted": True,
                }
            )

        elif operation == "set_relations":
            tag_id = args.get("tag_id")

            similar_ids = args.get(
                "similar_ids",
                [],
            )

            related_ids = args.get(
                "related_ids",
                [],
            )

            if not tag_id:
                return error_response(
                    "MISSING_ARG",
                    "tag_id required",
                )

            result = service.set_relations(
                int(tag_id),
                [
                    int(x)
                    for x in similar_ids
                ],
                [
                    int(x)
                    for x in related_ids
                ],
            )

            return success_response(
                {
                    "similar": [
                        {
                            "id": tag.id,
                            "name": tag.name,
                        }
                        for tag in result.similar
                    ],
                    "related": [
                        {
                            "id": tag.id,
                            "name": tag.name,
                        }
                        for tag in result.related
                    ],
                }
            )

        elif operation == "validate_relations":
            result = service.validate_all()

            return success_response(
                result.to_dict()
            )

        elif operation == "remove_broken_relations":
            count = service.remove_broken_relations()

            return success_response(
                {
                    "removed_count": count,
                }
            )

        elif operation == "export_relations":
            result = service.export_relations()

            return success_response(
                result.to_dict()
            )

        elif operation == "import_relations":
            relations_data = args.get(
                "relations",
                [],
            )

            overwrite = args.get(
                "overwrite",
                False,
            )

            data = ExportData.from_dict(
                {
                    "version": 1,
                    "relations": relations_data,
                }
            )

            count = service.import_relations(
                data,
                overwrite,
            )

            return success_response(
                {
                    "imported_count": count,
                }
            )

        elif operation == "get_stats":
            stats = service.get_stats()

            return success_response(stats)

        elif operation == "find_tags":
            search = args.get(
                "search",
                "",
            )

            per_page = args.get(
                "per_page",
                50,
            )

            tags = service.stash.find_tags(
                search,
                per_page,
            )

            return success_response(
                [
                    {
                        "id": tag.id,
                        "name": tag.name,
                    }
                    for tag in tags
                ]
            )

        else:
            return error_response(
                "UNKNOWN_OPERATION",
                f"Unknown operation: {operation}",
            )

    except PluginError as e:
        logger.exception(
            "Operation %s failed with PluginError",
            operation,
        )

        return error_response(
            e.code,
            e.message,
        )

    except Exception as e:
        logger.exception(
            "Operation %s failed with unexpected error",
            operation,
        )

        return error_response(
            "INTERNAL_ERROR",
            str(e),
        )


def main() -> int:
    try:
        input_data = read_input()

        if not input_data:
            result = error_response(
                "EMPTY_INPUT",
                "Plugin received empty input",
            )

            write_output(result)
            return 1

        if "_fatal_error" in input_data:
            fatal = input_data["_fatal_error"]

            result = error_response(
                fatal["code"],
                fatal["message"],
            )

            write_output(result)
            return 1

        result = dispatch_operation(
            input_data
        )

        write_output(result)

        return 0 if result.get("ok") else 1

    except Exception as e:
        logger.exception(
            "Fatal plugin error"
        )

        result = error_response(
            "FATAL_ERROR",
            str(e),
        )

        write_output(result)

        return 1


if __name__ == "__main__":
    sys.exit(main())