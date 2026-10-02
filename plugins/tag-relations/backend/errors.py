class PluginError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)

    def to_dict(self) -> dict:
        return {"code": self.code, "message": self.message}


class ValidationError(PluginError):
    def __init__(self, message: str):
        super().__init__("VALIDATION_ERROR", message)


class TagNotFoundError(PluginError):
    def __init__(self, tag_id: int):
        super().__init__("TAG_NOT_FOUND", f"Tag {tag_id} does not exist")


class RelationNotFoundError(PluginError):
    def __init__(self, tag_a_id: int, tag_b_id: int, relation_type: str):
        super().__init__(
            "RELATION_NOT_FOUND",
            f"Relation {tag_a_id} {relation_type} {tag_b_id} not found",
        )


class DuplicateRelationError(PluginError):
    def __init__(self, tag_a_id: int, tag_b_id: int, relation_type: str):
        super().__init__(
            "DUPLICATE_RELATION",
            f"Relation {tag_a_id} {relation_type} {tag_b_id} already exists",
        )


class StashAPIError(PluginError):
    def __init__(self, message: str):
        super().__init__("STASH_API_ERROR", message)


class DatabaseError(PluginError):
    def __init__(self, message: str):
        super().__init__("DATABASE_ERROR", message)