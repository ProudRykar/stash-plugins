class PluginError(Exception):
    """Base class for errors that are safe to return to the UI."""

    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)

    def to_dict(self) -> dict:
        return {"code": self.code, "message": self.message}


class ValidationError(PluginError):
    def __init__(self, message: str):
        super().__init__("VALIDATION_ERROR", message)


class NotFoundError(PluginError):
    def __init__(self, resource: str, resource_id: int):
        super().__init__(
            f"{resource.upper()}_NOT_FOUND",
            f"{resource} {resource_id} does not exist",
        )


class DuplicateLinkError(PluginError):
    def __init__(self, scene_id: int, studio_id: int):
        super().__init__(
            "DUPLICATE_LINK",
            f"Scene {scene_id} is already linked to studio {studio_id}",
        )


class StashAPIError(PluginError):
    def __init__(self, message: str):
        super().__init__("STASH_API_ERROR", message)


class DatabaseError(PluginError):
    def __init__(self, message: str):
        super().__init__("DATABASE_ERROR", message)
