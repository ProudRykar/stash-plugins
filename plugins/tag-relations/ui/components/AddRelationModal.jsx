import React, { useState, useEffect, useRef } from 'react';
import { runPluginOperation } from 'stash-plugin-api';

interface AddRelationModalProps {
  sourceTagId: number;
  relationType: 'similar' | 'related';
  onClose: () => void;
  onAdd: (targetTagId: number, type: 'similar' | 'related') => void;
}

const AddRelationModal: React.FC<AddRelationModalProps> = ({
  sourceTagId,
  relationType,
  onClose,
  onAdd,
}) => {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Array<{ id: number; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

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
        setResults(result.data.filter((t) => t.id !== sourceTagId));
        setSelectedIndex(0);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        onAdd(results[selectedIndex].id, relationType);
      }
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Add {relationType.charAt(0).toUpperCase() + relationType.slice(1)} Tag</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tags..."
            className="modal-search-input"
          />
          {loading && <div className="modal-loading">Searching...</div>}
          <ul className="modal-results">
            {results.map((tag, index) => (
              <li
                key={tag.id}
                className={`modal-result-item ${index === selectedIndex ? 'selected' : ''}`}
                onClick={() => onAdd(tag.id, relationType)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                {tag.name}
              </li>
            ))}
            {results.length === 0 && search.length >= 2 && !loading && (
              <li className="modal-no-results">No tags found</li>
            )}
          </ul>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default AddRelationModal;