import React, { useState, useEffect } from 'react';
import { runPluginOperation } from 'stash-plugin-api';

interface RelationItem {
  tag_a: { id: number; name: string };
  tag_b: { id: number; name: string };
  type: 'similar' | 'related';
}

const TagRelationsPage: React.FC = () => {
  const [relations, setRelations] = useState<RelationItem[]>([]);
  const [filteredRelations, setFilteredRelations] = useState<RelationItem[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'similar' | 'related'>('all');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    total_relations: 0,
    similar_count: 0,
    related_count: 0,
    tags_with_relations: 0,
  });
  const [showExport, setShowExport] = useState(false);
  const [exportData, setExportData] = useState('');

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

  return (
    <div className="tag-relations-page">
      <div className="page-header">
        <h2>Tag Relations</h2>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={handleExport}>Export JSON</button>
          <input
            type="file"
            accept=".json"
            onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])}
            className="file-input"
            id="import-file"
            style={{ display: 'none' }}
          />
          <label htmlFor="import-file" className="btn btn-secondary">Import JSON</label>
          <button className="btn btn-secondary" onClick={handleValidate}>Validate</button>
        </div>
      </div>

      <div className="stats-bar">
        <div className="stat">Total: {stats.total_relations}</div>
        <div className="stat similar">Similar: {stats.similar_count}</div>
        <div className="stat related">Related: {stats.related_count}</div>
        <div className="stat">Tags: {stats.tags_with_relations}</div>
      </div>

      <div className="filters">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tags..."
          className="search-input"
        />
        <select value={filter} onChange={(e) => setFilter(e.target.value as any)} className="filter-select">
          <option value="all">All</option>
          <option value="similar">Similar</option>
          <option value="related">Related</option>
        </select>
      </div>

      {loading ? (
        <div className="loading">Loading relations...</div>
      ) : filteredRelations.length === 0 ? (
        <div className="empty-state">No relations found</div>
      ) : (
        <div className="relations-grid">
          {filteredRelations.map((rel, index) => (
            <div key={index} className={`relation-card ${rel.type}`}>
              <div className="relation-pair">
                <span className="tag-name">{rel.tag_a.name || `Tag #${rel.tag_a.id}`}</span>
                <span className={`relation-arrow ${rel.type}`}>
                  {rel.type === 'similar' ? '≈' : '∼'}
                </span>
                <span className="tag-name">{rel.tag_b.name || `Tag #${rel.tag_b.id}`}</span>
              </div>
              <span className={`type-badge ${rel.type}`}>{rel.type}</span>
            </div>
          ))}
        </div>
      )}

      {showExport && (
        <div className="modal-overlay" onClick={() => setShowExport(false)}>
          <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Export Relations (JSON)</h3>
              <button className="modal-close" onClick={() => setShowExport(false)}>×</button>
            </div>
            <div className="modal-body">
              <textarea
                value={exportData}
                readOnly
                className="export-textarea"
                onClick={(e) => e.target.select()}
              />
              <button className="btn btn-primary" onClick={() => navigator.clipboard.writeText(exportData)}>
                Copy to Clipboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TagRelationsPage;