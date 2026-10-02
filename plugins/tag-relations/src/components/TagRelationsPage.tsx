const React = window.PluginApi.React;
const { useState, useEffect } = React;

interface RelationItem {
  tag_a: { id: number; name: string };
  tag_b: { id: number; name: string };
  type: 'similar' | 'related';
}

interface Stats {
  total_relations: number;
  similar_count: number;
  related_count: number;
  tags_with_relations: number;
}

const TagRelationsPage = () => {
  const [relations, setRelations] = useState<RelationItem[]>([]);
  const [filteredRelations, setFilteredRelations] = useState<RelationItem[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'similar' | 'related'>('all');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats>({
    total_relations: 0,
    similar_count: 0,
    related_count: 0,
    tags_with_relations: 0,
  });
  const [showExport, setShowExport] = useState(false);
  const [exportData, setExportData] = useState('');

  const runPluginOperation = window.PluginApi.utils.runPluginOperation;

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [relsResult, statsResult] = await Promise.all([
        runPluginOperation('export_relations'),
        runPluginOperation('get_stats'),
      ]);
      if (relsResult.ok && relsResult.data) {
        const rels = relsResult.data.relations.map((r: any) => ({
          tag_a: { id: r.tag_a_id, name: '' },
          tag_b: { id: r.tag_b_id, name: '' },
          type: r.relation_type,
        }));
        setRelations(rels);
        applyFilters(rels);
      }
      if (statsResult.ok && statsResult.data) {
        setStats(statsResult.data);
      }
    } catch (error) {
      console.error('Failed to load:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = (rels: RelationItem[]) => {
    let filtered = rels;
    if (filter !== 'all') {
      filtered = filtered.filter((r) => r.type === filter);
    }
    if (search.trim()) {
      const term = search.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.tag_a.name.toLowerCase().includes(term) || r.tag_b.name.toLowerCase().includes(term)
      );
    }
    setFilteredRelations(filtered);
  };

  useEffect(() => {
    applyFilters(relations);
  }, [search, filter, relations]);

  const handleExport = async () => {
    try {
      const result = await runPluginOperation('export_relations');
      if (result.ok && result.data) {
        setExportData(JSON.stringify(result.data, null, 2));
        setShowExport(true);
      }
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const result = await runPluginOperation('import_relations', {
        relations: data.relations || [],
        overwrite: false,
      });
      if (result.ok) {
        alert(`Imported ${result.data.imported_count} relations`);
        loadAll();
      } else {
        alert(result.error?.message || 'Import failed');
      }
    } catch (error) {
      console.error('Import failed:', error);
      alert('Import failed');
    }
  };

  const handleValidate = async () => {
    try {
      const result = await runPluginOperation('validate_relations');
      if (result.ok && result.data) {
        alert(`Valid: ${result.data.valid_count}\nBroken: ${result.data.broken_count}`);
        if (result.data.broken_count > 0) {
          if (window.confirm('Remove broken relations?')) {
            const removeResult = await runPluginOperation('remove_broken_relations');
            if (removeResult.ok) {
              alert(`Removed ${removeResult.data.removed_count} broken relations`);
              loadAll();
            }
          }
        }
      }
    } catch (error) {
      console.error('Validate failed:', error);
    }
  };

  return React.createElement(
    'div',
    { className: 'tag-relations-page' },
    React.createElement(
      'div',
      { className: 'page-header' },
      React.createElement('h2', null, 'Tag Relations'),
      React.createElement(
        'div',
        { className: 'page-actions' },
        React.createElement('button', { className: 'btn btn-primary', onClick: handleExport }, 'Export JSON'),
        React.createElement('input', {
          type: 'file',
          accept: '.json',
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => e.target.files?.[0] && handleImport(e.target.files[0]),
          className: 'file-input',
          id: 'import-file',
          style: { display: 'none' },
        }),
        React.createElement('label', { htmlFor: 'import-file', className: 'btn btn-secondary' }, 'Import JSON'),
        React.createElement('button', { className: 'btn btn-secondary', onClick: handleValidate }, 'Validate')
      )
    ),
    React.createElement(
      'div',
      { className: 'stats-bar' },
      React.createElement('div', { className: 'stat' }, `Total: ${stats.total_relations}`),
      React.createElement('div', { className: 'stat similar' }, `Similar: ${stats.similar_count}`),
      React.createElement('div', { className: 'stat related' }, `Related: ${stats.related_count}`),
      React.createElement('div', { className: 'stat' }, `Tags: ${stats.tags_with_relations}`)
    ),
    React.createElement(
      'div',
      { className: 'filters' },
      React.createElement('input', {
        type: 'text',
        value: search,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value),
        placeholder: 'Search tags...',
        className: 'search-input',
      }),
      React.createElement(
        'select',
        { value: filter, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setFilter(e.target.value as any), className: 'filter-select' },
        React.createElement('option', { value: 'all' }, 'All'),
        React.createElement('option', { value: 'similar' }, 'Similar'),
        React.createElement('option', { value: 'related' }, 'Related')
      )
    ),
    loading
      ? React.createElement('div', { className: 'loading' }, 'Loading relations...')
      : filteredRelations.length === 0
      ? React.createElement('div', { className: 'empty-state' }, 'No relations found')
      : React.createElement(
          'div',
          { className: 'relations-grid' },
          filteredRelations.map((rel: RelationItem, index: number) =>
            React.createElement(
              'div',
              { key: index, className: `relation-card ${rel.type}` },
              React.createElement(
                'div',
                { className: 'relation-pair' },
                React.createElement('span', { className: 'tag-name' }, rel.tag_a.name || `Tag #${rel.tag_a.id}`),
                React.createElement('span', { className: `relation-arrow ${rel.type}` }, rel.type === 'similar' ? '≈' : '∼'),
                React.createElement('span', { className: 'tag-name' }, rel.tag_b.name || `Tag #${rel.tag_b.id}`)
              ),
              React.createElement('span', { className: `type-badge ${rel.type}` }, rel.type)
            )
          )
        ),
    showExport &&
      React.createElement(
        'div',
        { className: 'modal-overlay', onClick: () => setShowExport(false) },
        React.createElement(
          'div',
          { className: 'modal modal-large', onClick: (e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation() },
          React.createElement(
            'div',
            { className: 'modal-header' },
            React.createElement('h3', null, 'Export Relations (JSON)'),
            React.createElement('button', { className: 'modal-close', onClick: () => setShowExport(false) }, '×')
          ),
          React.createElement(
            'div',
            { className: 'modal-body' },
            React.createElement('textarea', {
              value: exportData,
              readOnly: true,
              className: 'export-textarea',
              onClick: (e: React.MouseEvent<HTMLTextAreaElement>) => (e.target as HTMLTextAreaElement).select(),
            }),
            React.createElement(
              'button',
              { className: 'btn btn-primary', onClick: () => navigator.clipboard.writeText(exportData) },
              'Copy to Clipboard'
            )
          )
        )
      )
  );
};

export default TagRelationsPage;