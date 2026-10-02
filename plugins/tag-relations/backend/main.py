#!/usr/bin/env python3
import sys
import json
import logging
import os
from typing import Any

from backend.config import load_config
from backend.db.database import init_db
from backend.services.relations import RelationService
from backend.services.sync import SyncService
from backend.models import RelationType, ExportData
from backend.errors import PluginError

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(__name__)


def read_input() -> dict:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON input: {e}")
        return {"error": {"code": "INVALID_JSON", "message": str(e)}}


def write_output(result: dict) -> None:
    sys.stdout.write(json.dumps(result))
    sys.stdout.flush()


def error_response(code: str, message: str) -> dict:
    return {"ok": False, "error": {"code": code, "message": message}}


def success_response(data: Any = None) -> dict:
    result = {"ok": True}
    if data is not None:
        result["data"] = data
    return result


def get_plugin_dir() -> str:
    return os.path.dirname(os.path.abspath(__file__))


def get_settings(input_data: dict) -> dict:
    return input_data.get("settings", {})


def get_hook_context(input_data: dict) -> dict | None:
    return input_data.get("hookContext")


def dispatch_operation(input_data: dict) -> dict:
    plugin_dir = get_plugin_dir()
    settings = get_settings(input_data)
    config = load_config(plugin_dir, settings)

    init_db(config.database_path)

    service = RelationService(config)
    sync = SyncService(config)

    hook_context = get_hook_context(input_data)
    if hook_context:
        hook_type = hook_context.get("type")
        if hook_type == "Tag.Destroy.Post":
            tag_id = hook_context.get("id")
            if tag_id:
                count = sync.handle_tag_destroyed(int(tag_id))
                return success_response({"deleted_relations": count})
        elif hook_type == "Tag.Merge.Post":
            source_id = hook_context.get("source_id")
            destination_id = hook_context.get("destination_id")
            if source_id and destination_id:
                count = sync.handle_tag_merged(int(source_id), int(destination_id))
                return success_response({"rewritten_relations": count})
        return success_response({"handled": False})

    operation = input_data.get("operation")
    args = input_data.get("args", {})

    if not operation:
        return error_response("MISSING_OPERATION", "No operation specified")

    try:
        if operation == "list_relations":
            tag_id = args.get("tag_id")
            if not tag_id:
                return error_response("MISSING_ARG", "tag_id required")
            result = service.list_relations(int(tag_id))
            return success_response(
                {
                    "similar": [{"id": t.id, "name": t.name} for t in result.similar],
                    "related": [{"id": t.id, "name": t.name} for t in result.related],
                }
            )

        elif operation == "create_relation":
            tag_a_id = args.get("tag_a_id") or args.get("source_tag_id")
            tag_b_id = args.get("tag_b_id") or args.get("target_tag_id")
            relation_type = args.get("relation_type")
            if not all([tag_a_id, tag_b_id, relation_type]):
                return error_response("MISSING_ARG", "tag_a_id, tag_b_id, relation_type required")
            relation = service.create_relation(int(tag_a_id), int(tag_b_id), RelationType(relation_type))
            return success_response(relation.to_dict())

        elif operation == "update_relation":
            tag_a_id = args.get("tag_a_id") or args.get("source_tag_id")
            tag_b_id = args.get("tag_b_id") or args.get("target_tag_id")
            relation_type = args.get("relation_type")
            if not all([tag_a_id, tag_b_id, relation_type]):
                return error_response("MISSING_ARG", "tag_a_id, tag_b_id, relation_type required")
            relation = service.update_relation(int(tag_a_id), int(tag_b_id), RelationType(relation_type))
            return success_response(relation.to_dict())

        elif operation == "delete_relation":
            tag_a_id = args.get("tag_a_id") or args.get("source_tag_id")
            tag_b_id = args.get("tag_b_id") or args.get("target_tag_id")
            relation_type = args.get("relation_type")
            if not all([tag_a_id, tag_b_id, relation_type]):
                return error_response("MISSING_ARG", "tag_a_id, tag_b_id, relation_type required")
            service.delete_relation(int(tag_a_id), int(tag_b_id), RelationType(relation_type))
            return success_response({"deleted": True})

        elif operation == "set_relations":
            tag_id = args.get("tag_id")
            similar_ids = args.get("similar_ids", [])
            related_ids = args.get("related_ids", [])
            if not tag_id:
                return error_response("MISSING_ARG", "tag_id required")
            result = service.set_relations(int(tag_id), [int(x) for x in similar_ids], [int(x) for x in related_ids])
            return success_response(
                {
                    "similar": [{"id": t.id, "name": t.name} for t in result.similar],
                    "related": [{"id": t.id, "name": t.name} for t in result.related],
                }
            )

        elif operation == "validate_relations":
            result = service.validate_all()
            return success_response(result.to_dict())

        elif operation == "remove_broken_relations":
            count = service.remove_broken_relations()
            return success_response({"removed_count": count})

        elif operation == "export_relations":
            result = service.export_relations()
            return success_response(result.to_dict())

        elif operation == "import_relations":
            relations_data = args.get("relations", [])
            overwrite = args.get("overwrite", False)
            data = ExportData.from_dict({"version": 1, "relations": relations_data})
            count = service.import_relations(data, overwrite)
            return success_response({"imported_count": count})

        elif operation == "get_stats":
            stats = service.get_stats()
            return success_response(stats)

        elif operation == "find_tags":
            search = args.get("search", "")
            per_page = args.get("per_page", 50)
            tags = service.stash.find_tags(search, per_page)
            return success_response([{"id": t.id, "name": t.name} for t in tags])

        else:
            return error_response("UNKNOWN_OPERATION", f"Unknown operation: {operation}")

    except PluginError as e:
        logger.warning(f"Operation {operation} failed: {e.message}")
        return error_response(e.code, e.message)
    except Exception as e:
        logger.exception(f"Operation {operation} failed with unexpected error")
        return error_response("INTERNAL_ERROR", str(e))


def main() -> int:
    input_data = read_input()
    if "error" in input_data:
        write_output(input_data)
        return 1

    result = dispatch_operation(input_data)
    write_output(result)
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())