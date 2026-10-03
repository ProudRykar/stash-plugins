import sqlite3
import logging
from datetime import datetime
from backend.models import TagRelation, RelationType
from backend.errors import (
    RelationNotFoundError,
    DuplicateRelationError,
    DatabaseError,
)
from backend.db.database import transaction, get_connection

logger = logging.getLogger(__name__)


class RelationRepository:
    def __init__(self, db_path: str):
        self.db_path = db_path

    def create(self, relation: TagRelation) -> TagRelation:
        with transaction(self.db_path) as conn:
            cursor = conn.cursor()
            try:
                cursor.execute(
                    """
                    INSERT INTO tag_relations (tag_a_id, tag_b_id, relation_type, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        relation.tag_a_id,
                        relation.tag_b_id,
                        relation.relation_type.value,
                        datetime.now().isoformat(),
                        datetime.now().isoformat(),
                    ),
                )
            except sqlite3.IntegrityError as e:
                if "UNIQUE constraint failed" in str(e) or "PRIMARY KEY" in str(e):
                    raise DuplicateRelationError(
                        relation.tag_a_id,
                        relation.tag_b_id,
                        relation.relation_type.value,
                    )
                raise DatabaseError(str(e))
            return relation

    def get(
        self, tag_a_id: int, tag_b_id: int, relation_type: RelationType
    ) -> TagRelation:
        if tag_a_id > tag_b_id:
            tag_a_id, tag_b_id = tag_b_id, tag_a_id

        with get_connection(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT tag_a_id, tag_b_id, relation_type FROM tag_relations WHERE tag_a_id = ? AND tag_b_id = ? AND relation_type = ?",
                (tag_a_id, tag_b_id, relation_type.value),
            )
            row = cursor.fetchone()
            if not row:
                raise RelationNotFoundError(tag_a_id, tag_b_id, relation_type.value)
            return TagRelation(
                tag_a_id=row["tag_a_id"],
                tag_b_id=row["tag_b_id"],
                relation_type=RelationType(row["relation_type"]),
            )

    def list_for_tag(self, tag_id: int) -> list[TagRelation]:
        with get_connection(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT tag_a_id, tag_b_id, relation_type
                FROM tag_relations
                WHERE tag_a_id = ? OR tag_b_id = ?
                ORDER BY relation_type, tag_a_id, tag_b_id
                """,
                (tag_id, tag_id),
            )
            return [
                TagRelation(
                    tag_a_id=row["tag_a_id"],
                    tag_b_id=row["tag_b_id"],
                    relation_type=RelationType(row["relation_type"]),
                )
                for row in cursor.fetchall()
            ]

    def list_all(self) -> list[TagRelation]:
        with get_connection(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT tag_a_id, tag_b_id, relation_type FROM tag_relations ORDER BY tag_a_id, tag_b_id, relation_type"
            )
            return [
                TagRelation(
                    tag_a_id=row["tag_a_id"],
                    tag_b_id=row["tag_b_id"],
                    relation_type=RelationType(row["relation_type"]),
                )
                for row in cursor.fetchall()
            ]

    def update(self, relation: TagRelation) -> TagRelation:
        with transaction(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE tag_relations
                SET updated_at = ?
                WHERE tag_a_id = ? AND tag_b_id = ? AND relation_type = ?
                """,
                (
                    datetime.now().isoformat(),
                    relation.tag_a_id,
                    relation.tag_b_id,
                    relation.relation_type.value,
                ),
            )
            if cursor.rowcount == 0:
                raise RelationNotFoundError(
                    relation.tag_a_id, relation.tag_b_id, relation.relation_type.value
                )
            return relation

    def delete(self, tag_a_id: int, tag_b_id: int, relation_type: RelationType) -> None:
        if tag_a_id > tag_b_id:
            tag_a_id, tag_b_id = tag_b_id, tag_a_id

        with transaction(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "DELETE FROM tag_relations WHERE tag_a_id = ? AND tag_b_id = ? AND relation_type = ?",
                (tag_a_id, tag_b_id, relation_type.value),
            )
            if cursor.rowcount == 0:
                raise RelationNotFoundError(tag_a_id, tag_b_id, relation_type.value)

    def delete_all_for_tag(self, tag_id: int) -> int:
        with transaction(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "DELETE FROM tag_relations WHERE tag_a_id = ? OR tag_b_id = ?",
                (tag_id, tag_id),
            )
            return cursor.rowcount

    def rewrite_tag(self, old_tag_id: int, new_tag_id: int) -> int:
        if old_tag_id == new_tag_id:
            return 0

        with transaction(self.db_path) as conn:
            cursor = conn.cursor()

            cursor.execute(
                "SELECT tag_a_id, tag_b_id, relation_type FROM tag_relations WHERE tag_a_id = ? OR tag_b_id = ?",
                (old_tag_id, old_tag_id),
            )
            relations = cursor.fetchall()

            updated = 0
            for row in relations:
                tag_a = row["tag_a_id"]
                tag_b = row["tag_b_id"]
                rtype = row["relation_type"]

                if tag_a == old_tag_id:
                    tag_a = new_tag_id
                elif tag_b == old_tag_id:
                    tag_b = new_tag_id

                if tag_a == tag_b:
                    cursor.execute(
                        "DELETE FROM tag_relations WHERE tag_a_id = ? AND tag_b_id = ? AND relation_type = ?",
                        (row["tag_a_id"], row["tag_b_id"], rtype),
                    )
                    updated += 1
                    continue

                if tag_a > tag_b:
                    tag_a, tag_b = tag_b, tag_a

                try:
                    cursor.execute(
                        """
                        INSERT INTO tag_relations (tag_a_id, tag_b_id, relation_type, created_at, updated_at)
                        VALUES (?, ?, ?, datetime('now'), datetime('now'))
                        ON CONFLICT(tag_a_id, tag_b_id, relation_type) DO UPDATE SET updated_at = datetime('now')
                        """,
                        (tag_a, tag_b, rtype),
                    )
                    updated += 1
                except sqlite3.IntegrityError:
                    pass

            cursor.execute(
                "DELETE FROM tag_relations WHERE tag_a_id = ? OR tag_b_id = ?",
                (old_tag_id, old_tag_id),
            )

            return updated

    def count(self) -> int:
        with get_connection(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) as c FROM tag_relations")
            return cursor.fetchone()["c"]

    def count_by_type(self, relation_type: RelationType) -> int:
        with get_connection(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT COUNT(*) as c FROM tag_relations WHERE relation_type = ?",
                (relation_type.value,),
            )
            return cursor.fetchone()["c"]

    def delete_all(self) -> int:
        with transaction(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM tag_relations")
            return cursor.rowcount
