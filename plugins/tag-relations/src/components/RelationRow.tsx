const React = window.PluginApi.React;

interface RelationRowProps {
  tag: { id: number; name: string };
  relationType: 'similar' | 'related';
  sourceTagId: number;
  onDelete: () => void;
}

const RelationRow = ({ tag, relationType, sourceTagId, onDelete }: RelationRowProps) => {
  const runPluginOperation = window.PluginApi.utils.runPluginOperation;

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

  return React.createElement(
    'div',
    { className: 'relation-row' },
    React.createElement('span', { className: 'relation-tag-name' }, tag.name),
    React.createElement('span', { className: `relation-type-badge ${relationType}` }, relationType),
    React.createElement('button', { className: 'relation-delete-btn', onClick: handleDelete, title: 'Remove relation' }, '×')
  );
};

export default RelationRow;