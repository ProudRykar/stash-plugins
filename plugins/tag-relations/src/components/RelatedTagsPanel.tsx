const React = window.PluginApi.React;
const { useState, useEffect } = React;
import RelationRow from './RelationRow';
import AddRelationModal from './AddRelationModal';

interface RelatedTagsPanelProps {
  tagId?: string;
}

interface TagItem {
  id: number;
  name: string;
}

const RelatedTagsPanel = ({ tagId }: RelatedTagsPanelProps) => {
  const [similar, setSimilar] = useState<TagItem[]>([]);
  const [related, setRelated] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalType, setModalType] = useState<'similar' | 'related'>('similar');

  const numericTagId = tagId ? parseInt(tagId, 10) : null;

  const runPluginOperation = window.PluginApi.utils.runPluginOperation;

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

  return React.createElement(
    'div',
    { className: 'related-tags-panel' },
    React.createElement('h3', null, 'Related Tags'),
    React.createElement(
      'div',
      { className: 'relation-section' },
      React.createElement(
        'div',
        { className: 'section-header' },
        React.createElement('span', { className: 'section-title similar' }, 'Similar'),
        React.createElement(
          'button',
          { className: 'add-relation-btn', onClick: () => { setModalType('similar'); setShowAddModal(true); } },
          '+ Add'
        )
      ),
      loading
        ? React.createElement('div', { className: 'loading' }, 'Loading...')
        : similar.length === 0
        ? React.createElement('div', { className: 'empty-state' }, 'No similar tags')
        : React.createElement(
            'div',
            { className: 'relation-list' },
            similar.map((tag) =>
              React.createElement(RelationRow, {
                key: tag.id,
                tag: tag,
                relationType: 'similar',
                sourceTagId: numericTagId,
                onDelete: () => handleDelete(tag.id, 'similar'),
              })
            )
          )
    ),
    React.createElement(
      'div',
      { className: 'relation-section' },
      React.createElement(
        'div',
        { className: 'section-header' },
        React.createElement('span', { className: 'section-title related' }, 'Related'),
        React.createElement(
          'button',
          { className: 'add-relation-btn', onClick: () => { setModalType('related'); setShowAddModal(true); } },
          '+ Add'
        )
      ),
      loading
        ? React.createElement('div', { className: 'loading' }, 'Loading...')
        : related.length === 0
        ? React.createElement('div', { className: 'empty-state' }, 'No related tags')
        : React.createElement(
            'div',
            { className: 'relation-list' },
            related.map((tag) =>
              React.createElement(RelationRow, {
                key: tag.id,
                tag: tag,
                relationType: 'related',
                sourceTagId: numericTagId,
                onDelete: () => handleDelete(tag.id, 'related'),
              })
            )
          )
    ),
    showAddModal &&
      React.createElement(AddRelationModal, {
        sourceTagId: numericTagId,
        relationType: modalType,
        onClose: () => setShowAddModal(false),
        onAdd: handleAddRelation,
      })
  );
};

export default RelatedTagsPanel;