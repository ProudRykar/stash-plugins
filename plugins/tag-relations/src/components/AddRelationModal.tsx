const React = window.PluginApi.React;
const { useState, useEffect, useRef } = React;

interface AddRelationModalProps {
  sourceTagId: number;
  relationType: 'similar' | 'related';
  onClose: () => void;
  onAdd: (targetTagId: number, type: 'similar' | 'related') => void;
}

interface TagItem {
  id: number;
  name: string;
}

const AddRelationModal = ({ sourceTagId, relationType, onClose, onAdd }: AddRelationModalProps) => {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const runPluginOperation = window.PluginApi.utils.runPluginOperation;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const debounce = setTimeout(() => {
      if (search.trim().length >= 2) {
        doSearch();
      } else {
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
        setResults(result.data.filter((t: TagItem) => t.id !== sourceTagId));
        setSelectedIndex(0);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev: number) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev: number) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        onAdd(results[selectedIndex].id, relationType);
      }
    }
  };

  const title = relationType.charAt(0).toUpperCase() + relationType.slice(1);

  return React.createElement(
    'div',
    { className: 'modal-overlay', onClick: onClose },
    React.createElement(
      'div',
      { className: 'modal', onClick: (e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation() },
      React.createElement(
        'div',
        { className: 'modal-header' },
        React.createElement('h3', null, `Add ${title} Tag`),
        React.createElement('button', { className: 'modal-close', onClick: onClose }, '×')
      ),
      React.createElement(
        'div',
        { className: 'modal-body' },
        React.createElement('input', {
          ref: inputRef,
          type: 'text',
          value: search,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value),
          onKeyDown: handleKeyDown,
          placeholder: 'Search tags...',
          className: 'modal-search-input',
        }),
        loading && React.createElement('div', { className: 'modal-loading' }, 'Searching...'),
        React.createElement(
          'ul',
          { className: 'modal-results' },
          results.map((tag: TagItem, index: number) =>
            React.createElement(
              'li',
              {
                key: tag.id,
                className: `modal-result-item ${index === selectedIndex ? 'selected' : ''}`,
                onClick: () => onAdd(tag.id, relationType),
                onMouseEnter: () => setSelectedIndex(index),
              },
              tag.name
            )
          ),
          results.length === 0 && search.length >= 2 && !loading &&
            React.createElement('li', { className: 'modal-no-results' }, 'No tags found')
        )
      ),
      React.createElement(
        'div',
        { className: 'modal-footer' },
        React.createElement('button', { className: 'btn btn-secondary', onClick: onClose }, 'Cancel')
      )
    )
  );
};

export default AddRelationModal;