import React, { useState, useEffect } from 'react';
import { runPluginOperation } from 'stash-plugin-api';
import RelationRow from './RelationRow';
import AddRelationModal from './AddRelationModal';

interface RelatedTagsPanelProps {
  tagId?: string;
}

const RelatedTagsPanel: React.FC<RelatedTagsPanelProps> = ({ tagId }) => {
  const [similar, setSimilar] = useState<Array<{ id: number; name: string }>>([]);
  const [related, setRelated] = useState<Array<{ id: number; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalType, setModalType] = useState<'similar' | 'related'>('similar');

  const numericTagId = tagId ? parseInt(tagId, 10) : null;

  useEffect(() => {
    if (numericTagId) {
      loadRelations();
    }
  }, [numericTagId]);

  const loadRelations = async () => {
    if (!numericTagId) return;
    setLoading(true);
    try {
      const result = await runPluginOperation('list_relations', { tag_id: numericTagId });
      if (result.ok && result.data) {
        setSimilar(result.data.similar || []);
        setRelated(result.data.related || []);
      }
    } catch (error) {
      console.error('Failed to load relations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRelation = async (targetTagId: number, type: 'similar' | 'related') => {
    if (!numericTagId) return;
    try {
      const result = await runPluginOperation('create_relation', {
        tag_a_id: numericTagId,
        tag_b_id: targetTagId,
        relation_type: type,
      });
      if (result.ok) {
        loadRelations();
        setShowAddModal(false);
      } else {
        alert(result.error?.message || 'Failed to add relation');
      }
    } catch (error) {
      console.error('Failed to add relation:', error);
      alert('Failed to add relation');
    }
  };

  const handleDelete = (deletedTagId: number, type: 'similar' | 'related') => {
    if (type === 'similar') {
      setSimilar((prev) => prev.filter((t) => t.id !== deletedTagId));
    } else {
      setRelated((prev) => prev.filter((t) => t.id !== deletedTagId));
    }
  };

  if (!numericTagId) {
    return null;
  }

  return (
    <div className="related-tags-panel">
      <h3>Related Tags</h3>

      <div className="relation-section">
        <div className="section-header">
          <span className="section-title similar">Similar</span>
          <button className="add-relation-btn" onClick={() => { setModalType('similar'); setShowAddModal(true); }}>
            + Add
          </button>
        </div>
        {loading ? (
          <div className="loading">Loading...</div>
        ) : similar.length === 0 ? (
          <div className="empty-state">No similar tags</div>
        ) : (
          <div className="relation-list">
            {similar.map((tag) => (
              <RelationRow
                key={tag.id}
                tag={tag}
                relationType="similar"
                sourceTagId={numericTagId}
                onDelete={() => handleDelete(tag.id, 'similar')}
              />
            ))}
          </div>
        )}
      </div>

      <div className="relation-section">
        <div className="section-header">
          <span className="section-title related">Related</span>
          <button className="add-relation-btn" onClick={() => { setModalType('related'); setShowAddModal(true); }}>
            + Add
          </button>
        </div>
        {loading ? (
          <div className="loading">Loading...</div>
        ) : related.length === 0 ? (
          <div className="empty-state">No related tags</div>
        ) : (
          <div className="relation-list">
            {related.map((tag) => (
              <RelationRow
                key={tag.id}
                tag={tag}
                relationType="related"
                sourceTagId={numericTagId}
                onDelete={() => handleDelete(tag.id, 'related')}
              />
            ))}
          </div>
        )}
      </div>

      {showAddModal && (
        <AddRelationModal
          sourceTagId={numericTagId}
          relationType={modalType}
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddRelation}
        />
      )}
    </div>
  );
};

export default RelatedTagsPanel;