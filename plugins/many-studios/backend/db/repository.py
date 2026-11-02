import sqlite3
from typing import Optional

from backend.db.database import get_connection, transaction
from backend.errors import DatabaseError
from backend.models import SceneStudioLink


class SceneStudioRepository:
    def __init__(self, db_path: str):
        self.db_path = db_path

    @staticmethod
    def _row_to_link(row: sqlite3.Row) -> SceneStudioLink:
        return SceneStudioLink(
            scene_id=row["scene_id"],
            studio_id=row["studio_id"],
            created_at=row["created_at"],
        )

    def add(self, scene_id: int, studio_id: int) -> bool:
        """Add a link. Returns True when a new row was inserted."""
        with transaction(self.db_path) as conn:
            cursor = conn.cursor()
            try:
                cursor.execute(
                    """
                    INSERT INTO scene_studios (scene_id, studio_id)
                    VALUES (?, ?)
                    """,
                    (scene_id, studio_id),
                )
            except sqlite3.IntegrityError as exc:
                if "UNIQUE constraint failed" in str(exc):
                    return False
                raise DatabaseError(str(exc)) from exc

            return cursor.rowcount > 0

    def remove(self, scene_id: int, studio_id: int) -> bool:
        """Remove a link. Returns True when a row was deleted."""
        with transaction(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "DELETE FROM scene_studios WHERE scene_id = ? AND studio_id = ?",
                (scene_id, studio_id),
            )
            return cursor.rowcount > 0

    def set_for_scene(self, scene_id: int, studio_ids: list[int]) -> None:
        """Replace the full set of additional studios for a scene."""
        unique_ids = sorted({int(studio_id) for studio_id in studio_ids})

        with transaction(self.db_path) as conn:
            cursor = conn.cursor()

            if unique_ids:
                placeholders = ",".join("?" for _ in unique_ids)
                cursor.execute(
                    f"""
                    DELETE FROM scene_studios
                    WHERE scene_id = ?
                      AND studio_id NOT IN ({placeholders})
                    """,
                    [scene_id, *unique_ids],
                )
            else:
                cursor.execute(
                    "DELETE FROM scene_studios WHERE scene_id = ?",
                    (scene_id,),
                )

            cursor.executemany(
                """
                INSERT OR IGNORE INTO scene_studios (scene_id, studio_id)
                VALUES (?, ?)
                """,
                [(scene_id, studio_id) for studio_id in unique_ids],
            )

    def list_for_scene(self, scene_id: int) -> list[SceneStudioLink]:
        with get_connection(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT scene_id, studio_id, created_at
                FROM scene_studios
                WHERE scene_id = ?
                ORDER BY created_at, studio_id
                """,
                (scene_id,),
            )
            return [self._row_to_link(row) for row in cursor.fetchall()]

    def list_for_studio(
        self,
        studio_id: int,
        page: int = 1,
        per_page: int = 40,
    ) -> tuple[list[SceneStudioLink], int]:
        page = max(1, int(page))
        per_page = max(1, min(int(per_page), 200))
        offset = (page - 1) * per_page

        with get_connection(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT COUNT(*) AS c FROM scene_studios WHERE studio_id = ?",
                (studio_id,),
            )
            total = int(cursor.fetchone()["c"])

            cursor.execute(
                """
                SELECT scene_id, studio_id, created_at
                FROM scene_studios
                WHERE studio_id = ?
                ORDER BY created_at DESC, scene_id DESC
                LIMIT ? OFFSET ?
                """,
                (studio_id, per_page, offset),
            )
            links = [self._row_to_link(row) for row in cursor.fetchall()]

        return links, total

    def list_all(self) -> list[SceneStudioLink]:
        with get_connection(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT scene_id, studio_id, created_at
                FROM scene_studios
                ORDER BY scene_id, studio_id
                """
            )
            return [self._row_to_link(row) for row in cursor.fetchall()]

    def list_scene_ids(self) -> list[int]:
        with get_connection(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT DISTINCT scene_id FROM scene_studios")
            return [int(row["scene_id"]) for row in cursor.fetchall()]

    def list_studio_ids(self) -> list[int]:
        with get_connection(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT DISTINCT studio_id FROM scene_studios")
            return [int(row["studio_id"]) for row in cursor.fetchall()]

    def delete_for_scene(self, scene_id: int) -> int:
        with transaction(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "DELETE FROM scene_studios WHERE scene_id = ?",
                (scene_id,),
            )
            return cursor.rowcount

    def delete_for_studio(self, studio_id: int) -> int:
        with transaction(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "DELETE FROM scene_studios WHERE studio_id = ?",
                (studio_id,),
            )
            return cursor.rowcount

    def delete(self, scene_id: int, studio_id: int) -> bool:
        return self.remove(scene_id, studio_id)

    def delete_all(self) -> int:
        with transaction(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM scene_studios")
            return cursor.rowcount

    def count(self) -> int:
        with get_connection(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) AS c FROM scene_studios")
            return int(cursor.fetchone()["c"])

    def count_for_scene(self, scene_id: int) -> int:
        with get_connection(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT COUNT(*) AS c FROM scene_studios WHERE scene_id = ?",
                (scene_id,),
            )
            return int(cursor.fetchone()["c"])

    def count_for_studio(self, studio_id: int) -> int:
        with get_connection(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT COUNT(*) AS c FROM scene_studios WHERE studio_id = ?",
                (studio_id,),
            )
            return int(cursor.fetchone()["c"])

    def count_unique_scenes(self) -> int:
        with get_connection(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(DISTINCT scene_id) AS c FROM scene_studios")
            return int(cursor.fetchone()["c"])

    def count_unique_studios(self) -> int:
        with get_connection(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT COUNT(DISTINCT studio_id) AS c FROM scene_studios"
            )
            return int(cursor.fetchone()["c"])

    def get(self, scene_id: int, studio_id: int) -> Optional[SceneStudioLink]:
        with get_connection(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT scene_id, studio_id, created_at
                FROM scene_studios
                WHERE scene_id = ? AND studio_id = ?
                """,
                (scene_id, studio_id),
            )
            row = cursor.fetchone()
            return self._row_to_link(row) if row else None
