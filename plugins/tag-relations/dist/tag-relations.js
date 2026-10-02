(function () {
    'use strict';

    const React$4 = window.PluginApi.React;
    const { useState: useState$2, useEffect: useEffect$2 } = React$4;
    const TagRelationsPage = () => {
        const [relations, setRelations] = useState$2([]);
        const [filteredRelations, setFilteredRelations] = useState$2([]);
        const [search, setSearch] = useState$2('');
        const [filter, setFilter] = useState$2('all');
        const [loading, setLoading] = useState$2(false);
        const [stats, setStats] = useState$2({
            total_relations: 0,
            similar_count: 0,
            related_count: 0,
            tags_with_relations: 0,
        });
        const [showExport, setShowExport] = useState$2(false);
        const [exportData, setExportData] = useState$2('');
        const runPluginOperation = window.PluginApi.utils.runPluginOperation;
        useEffect$2(() => {
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
                    const rels = relsResult.data.relations.map((r) => ({
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
            }
            catch (error) {
                console.error('Failed to load:', error);
            }
            finally {
                setLoading(false);
            }
        };
        const applyFilters = (rels) => {
            let filtered = rels;
            if (filter !== 'all') {
                filtered = filtered.filter((r) => r.type === filter);
            }
            if (search.trim()) {
                const term = search.toLowerCase();
                filtered = filtered.filter((r) => r.tag_a.name.toLowerCase().includes(term) || r.tag_b.name.toLowerCase().includes(term));
            }
            setFilteredRelations(filtered);
        };
        useEffect$2(() => {
            applyFilters(relations);
        }, [search, filter, relations]);
        const handleExport = async () => {
            try {
                const result = await runPluginOperation('export_relations');
                if (result.ok && result.data) {
                    setExportData(JSON.stringify(result.data, null, 2));
                    setShowExport(true);
                }
            }
            catch (error) {
                console.error('Export failed:', error);
            }
        };
        const handleImport = async (file) => {
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
                }
                else {
                    alert(result.error?.message || 'Import failed');
                }
            }
            catch (error) {
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
            }
            catch (error) {
                console.error('Validate failed:', error);
            }
        };
        return React$4.createElement('div', { className: 'tag-relations-page' }, React$4.createElement('div', { className: 'page-header' }, React$4.createElement('h2', null, 'Tag Relations'), React$4.createElement('div', { className: 'page-actions' }, React$4.createElement('button', { className: 'btn btn-primary', onClick: handleExport }, 'Export JSON'), React$4.createElement('input', {
            type: 'file',
            accept: '.json',
            onChange: (e) => e.target.files?.[0] && handleImport(e.target.files[0]),
            className: 'file-input',
            id: 'import-file',
            style: { display: 'none' },
        }), React$4.createElement('label', { htmlFor: 'import-file', className: 'btn btn-secondary' }, 'Import JSON'), React$4.createElement('button', { className: 'btn btn-secondary', onClick: handleValidate }, 'Validate'))), React$4.createElement('div', { className: 'stats-bar' }, React$4.createElement('div', { className: 'stat' }, `Total: ${stats.total_relations}`), React$4.createElement('div', { className: 'stat similar' }, `Similar: ${stats.similar_count}`), React$4.createElement('div', { className: 'stat related' }, `Related: ${stats.related_count}`), React$4.createElement('div', { className: 'stat' }, `Tags: ${stats.tags_with_relations}`)), React$4.createElement('div', { className: 'filters' }, React$4.createElement('input', {
            type: 'text',
            value: search,
            onChange: (e) => setSearch(e.target.value),
            placeholder: 'Search tags...',
            className: 'search-input',
        }), React$4.createElement('select', { value: filter, onChange: (e) => setFilter(e.target.value), className: 'filter-select' }, React$4.createElement('option', { value: 'all' }, 'All'), React$4.createElement('option', { value: 'similar' }, 'Similar'), React$4.createElement('option', { value: 'related' }, 'Related'))), loading
            ? React$4.createElement('div', { className: 'loading' }, 'Loading relations...')
            : filteredRelations.length === 0
                ? React$4.createElement('div', { className: 'empty-state' }, 'No relations found')
                : React$4.createElement('div', { className: 'relations-grid' }, filteredRelations.map((rel, index) => React$4.createElement('div', { key: index, className: `relation-card ${rel.type}` }, React$4.createElement('div', { className: 'relation-pair' }, React$4.createElement('span', { className: 'tag-name' }, rel.tag_a.name || `Tag #${rel.tag_a.id}`), React$4.createElement('span', { className: `relation-arrow ${rel.type}` }, rel.type === 'similar' ? '≈' : '∼'), React$4.createElement('span', { className: 'tag-name' }, rel.tag_b.name || `Tag #${rel.tag_b.id}`)), React$4.createElement('span', { className: `type-badge ${rel.type}` }, rel.type)))), showExport &&
            React$4.createElement('div', { className: 'modal-overlay', onClick: () => setShowExport(false) }, React$4.createElement('div', { className: 'modal modal-large', onClick: (e) => e.stopPropagation() }, React$4.createElement('div', { className: 'modal-header' }, React$4.createElement('h3', null, 'Export Relations (JSON)'), React$4.createElement('button', { className: 'modal-close', onClick: () => setShowExport(false) }, '×')), React$4.createElement('div', { className: 'modal-body' }, React$4.createElement('textarea', {
                value: exportData,
                readOnly: true,
                className: 'export-textarea',
                onClick: (e) => e.target.select(),
            }), React$4.createElement('button', { className: 'btn btn-primary', onClick: () => navigator.clipboard.writeText(exportData) }, 'Copy to Clipboard')))));
    };

    const React$3 = window.PluginApi.React;
    const RelationRow = ({ tag, relationType, sourceTagId, onDelete }) => {
        const runPluginOperation = window.PluginApi.utils.runPluginOperation;
        const handleDelete = async () => {
            if (!window.confirm(`Remove ${relationType} relation to "${tag.name}"?`))
                return;
            try {
                await runPluginOperation('delete_relation', {
                    tag_a_id: sourceTagId,
                    tag_b_id: tag.id,
                    relation_type: relationType,
                });
                onDelete();
            }
            catch (error) {
                console.error('Failed to delete relation:', error);
                alert('Failed to delete relation');
            }
        };
        return React$3.createElement('div', { className: 'relation-row' }, React$3.createElement('span', { className: 'relation-tag-name' }, tag.name), React$3.createElement('span', { className: `relation-type-badge ${relationType}` }, relationType), React$3.createElement('button', { className: 'relation-delete-btn', onClick: handleDelete, title: 'Remove relation' }, '×'));
    };

    const React$2 = window.PluginApi.React;
    const { useState: useState$1, useEffect: useEffect$1, useRef } = React$2;
    const AddRelationModal = ({ sourceTagId, relationType, onClose, onAdd }) => {
        const [search, setSearch] = useState$1('');
        const [results, setResults] = useState$1([]);
        const [loading, setLoading] = useState$1(false);
        const [selectedIndex, setSelectedIndex] = useState$1(0);
        const inputRef = useRef(null);
        const runPluginOperation = window.PluginApi.utils.runPluginOperation;
        useEffect$1(() => {
            inputRef.current?.focus();
        }, []);
        useEffect$1(() => {
            const debounce = setTimeout(() => {
                if (search.trim().length >= 2) {
                    doSearch();
                }
                else {
                    setResults([]);
                }
            }, 300);
            return () => clearTimeout(debounce);
        }, [search]);
        const doSearch = async () => {
            setLoading(true);
            try {
                const result = await runPluginOperation('find_tags', { search: search.trim(), per_page: 20 });
                if (result.ok && result.data) {
                    setResults(result.data.filter((t) => t.id !== sourceTagId));
                    setSelectedIndex(0);
                }
            }
            catch (error) {
                console.error('Search failed:', error);
            }
            finally {
                setLoading(false);
            }
        };
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                onClose();
            }
            else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
            }
            else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex((prev) => Math.max(prev - 1, 0));
            }
            else if (e.key === 'Enter') {
                e.preventDefault();
                if (results[selectedIndex]) {
                    onAdd(results[selectedIndex].id, relationType);
                }
            }
        };
        const title = relationType.charAt(0).toUpperCase() + relationType.slice(1);
        return React$2.createElement('div', { className: 'modal-overlay', onClick: onClose }, React$2.createElement('div', { className: 'modal', onClick: (e) => e.stopPropagation() }, React$2.createElement('div', { className: 'modal-header' }, React$2.createElement('h3', null, `Add ${title} Tag`), React$2.createElement('button', { className: 'modal-close', onClick: onClose }, '×')), React$2.createElement('div', { className: 'modal-body' }, React$2.createElement('input', {
            ref: inputRef,
            type: 'text',
            value: search,
            onChange: (e) => setSearch(e.target.value),
            onKeyDown: handleKeyDown,
            placeholder: 'Search tags...',
            className: 'modal-search-input',
        }), loading && React$2.createElement('div', { className: 'modal-loading' }, 'Searching...'), React$2.createElement('ul', { className: 'modal-results' }, results.map((tag, index) => React$2.createElement('li', {
            key: tag.id,
            className: `modal-result-item ${index === selectedIndex ? 'selected' : ''}`,
            onClick: () => onAdd(tag.id, relationType),
            onMouseEnter: () => setSelectedIndex(index),
        }, tag.name)), results.length === 0 && search.length >= 2 && !loading &&
            React$2.createElement('li', { className: 'modal-no-results' }, 'No tags found'))), React$2.createElement('div', { className: 'modal-footer' }, React$2.createElement('button', { className: 'btn btn-secondary', onClick: onClose }, 'Cancel'))));
    };

    const React$1 = window.PluginApi.React;
    const { useState, useEffect } = React$1;
    const RelatedTagsPanel = ({ tagId }) => {
        const [similar, setSimilar] = useState([]);
        const [related, setRelated] = useState([]);
        const [loading, setLoading] = useState(false);
        const [showAddModal, setShowAddModal] = useState(false);
        const [modalType, setModalType] = useState('similar');
        const numericTagId = tagId ? parseInt(tagId, 10) : null;
        const runPluginOperation = window.PluginApi.utils.runPluginOperation;
        useEffect(() => {
            if (numericTagId) {
                loadRelations();
            }
        }, [numericTagId]);
        const loadRelations = async () => {
            if (!numericTagId)
                return;
            setLoading(true);
            try {
                const result = await runPluginOperation('list_relations', { tag_id: numericTagId });
                if (result.ok && result.data) {
                    setSimilar(result.data.similar || []);
                    setRelated(result.data.related || []);
                }
            }
            catch (error) {
                console.error('Failed to load relations:', error);
            }
            finally {
                setLoading(false);
            }
        };
        const handleAddRelation = async (targetTagId, type) => {
            if (!numericTagId)
                return;
            try {
                const result = await runPluginOperation('create_relation', {
                    tag_a_id: numericTagId,
                    tag_b_id: targetTagId,
                    relation_type: type,
                });
                if (result.ok) {
                    loadRelations();
                    setShowAddModal(false);
                }
                else {
                    alert(result.error?.message || 'Failed to add relation');
                }
            }
            catch (error) {
                console.error('Failed to add relation:', error);
                alert('Failed to add relation');
            }
        };
        const handleDelete = (deletedTagId, type) => {
            if (type === 'similar') {
                setSimilar((prev) => prev.filter((t) => t.id !== deletedTagId));
            }
            else {
                setRelated((prev) => prev.filter((t) => t.id !== deletedTagId));
            }
        };
        if (!numericTagId) {
            return null;
        }
        return React$1.createElement('div', { className: 'related-tags-panel' }, React$1.createElement('h3', null, 'Related Tags'), React$1.createElement('div', { className: 'relation-section' }, React$1.createElement('div', { className: 'section-header' }, React$1.createElement('span', { className: 'section-title similar' }, 'Similar'), React$1.createElement('button', { className: 'add-relation-btn', onClick: () => { setModalType('similar'); setShowAddModal(true); } }, '+ Add')), loading
            ? React$1.createElement('div', { className: 'loading' }, 'Loading...')
            : similar.length === 0
                ? React$1.createElement('div', { className: 'empty-state' }, 'No similar tags')
                : React$1.createElement('div', { className: 'relation-list' }, similar.map((tag) => React$1.createElement(RelationRow, {
                    key: tag.id,
                    tag: tag,
                    relationType: 'similar',
                    sourceTagId: numericTagId,
                    onDelete: () => handleDelete(tag.id, 'similar'),
                })))), React$1.createElement('div', { className: 'relation-section' }, React$1.createElement('div', { className: 'section-header' }, React$1.createElement('span', { className: 'section-title related' }, 'Related'), React$1.createElement('button', { className: 'add-relation-btn', onClick: () => { setModalType('related'); setShowAddModal(true); } }, '+ Add')), loading
            ? React$1.createElement('div', { className: 'loading' }, 'Loading...')
            : related.length === 0
                ? React$1.createElement('div', { className: 'empty-state' }, 'No related tags')
                : React$1.createElement('div', { className: 'relation-list' }, related.map((tag) => React$1.createElement(RelationRow, {
                    key: tag.id,
                    tag: tag,
                    relationType: 'related',
                    sourceTagId: numericTagId,
                    onDelete: () => handleDelete(tag.id, 'related'),
                })))), showAddModal &&
            React$1.createElement(AddRelationModal, {
                sourceTagId: numericTagId,
                relationType: modalType,
                onClose: () => setShowAddModal(false),
                onAdd: handleAddRelation,
            }));
    };

    const React = window.PluginApi.React;
    window.PluginApi.register.route('/plugin/tag-relations', TagRelationsPage);
    window.PluginApi.patch.after('TagPage', (OriginalComponent) => {
        return function PatchedTagPage(props) {
            return React.createElement(React.Fragment, null, React.createElement(OriginalComponent, props), React.createElement(RelatedTagsPanel, { tagId: props.match?.params?.id }));
        };
    });
    console.log('[Tag Relations] loaded');

})();
