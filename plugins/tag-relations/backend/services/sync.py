from backend.db.repository import RelationRepository
from backend.config import Config

logger = logging.getLogger(__name__)


class SyncService:
    def __init__(self, config: Config):
        self.config = config
        self.repository = RelationRepository(config.database_path)

    def handle_tag_destroyed(self, tag_id: int) -> int:
        logger.info(f"Handling Tag.Destroy.Post for tag {tag_id}")
        return self.repository.delete_all_for_tag(tag_id)

    def handle_tag_merged(self, source_id: int, destination_id: int) -> int:
        logger.info(f"Handling Tag.Merge.Post: {source_id} -> {destination_id}")
        return self.repository.rewrite_tag(source_id, destination_id)