import React from 'react';
import { runPluginOperation } from 'stash-plugin-api';

interface RelationRowProps {
  tag: { id: number; name: string };
  relationType: 'similar' | 'related';
  sourceTagId: number;
  onDelete: () => void;
}

const RelationRow: React.FC<RelationRowProps> = ({ tag, relationType, sourceTagId, onDelete }) => {
  const handleDelete = async () => {
    if (!window.confirm(`Remove ${relationType} relation to "${tag.name}"?`)) return;

    try {
      await runPluginOperation('delete_relation', {
        tag_a_id: sourceTagId,
        tag_b_id: tag.id,
        relation_type: relationType,
      });
      onDelete();
    } catch (error) {
      console.error('Failed to delete relation:', error);
      alert('Failed to delete relation');
    }
  };

  return (
    <div className="relation-row">
      <span className="relation-tag-name">{tag.name}</span>
      <span className={`relation-type-badge ${relationType}`}>{relationType}</span>
      <button className="relation-delete-btn" onClick={handleDelete} title="Remove relation">
        ×
      </button>
    </div>
  );
};

export default RelationRow;