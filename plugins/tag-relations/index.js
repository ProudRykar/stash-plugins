(function () {
'use strict';

const PLUGIN_ID = 'tag-relations';

function log() {
console.log('[Tag Relations]', ...arguments);
}

function logError() {
console.error('[Tag Relations]', ...arguments);
}

async function runPluginOperation(operation, args) {
const query = `       mutation($id: ID!, $args: Map) {
        runPluginOperation(plugin_id: $id, args: $args)
      }
    `;


const variables = {
  id: PLUGIN_ID,
  args: Object.assign(
    { operation: operation },
    args || {}
  )
};

try {
  const response = await fetch('/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'same-origin',
    body: JSON.stringify({
      query: query,
      variables: variables
    })
  });

  if (!response.ok) {
    throw new Error(
      'HTTP ' +
        response.status +
        ': ' +
        response.statusText
    );
  }

  const result = await response.json();

  if (result.errors) {
    throw new Error(
      result.errors
        .map(function (error) {
          return error.message;
        })
        .join(', ')
    );
  }

  const data = result.data.runPluginOperation;

  if (!data.ok) {
    throw new Error(
      (data.error && data.error.message) ||
        'Operation failed'
    );
  }

  return data.data;
} catch (error) {
  logError(
    'Plugin operation failed:',
    operation,
    error
  );

  throw error;
}


}

/*

* ============================================================
* React
* ============================================================
  */

const React = window.PluginApi.React;

if (!React) {
logError(
'PluginApi.React is unavailable'
);
return;
}

const createElement = React.createElement;
const useState = React.useState;
const useEffect = React.useEffect;
const useRef = React.useRef;
const Fragment = React.Fragment;

/*

* ============================================================
* Relation row
* ============================================================
  */

function RelationRow(_ref) {
const tag = _ref.tag;
const relationType = _ref.relationType;
const sourceTagId = _ref.sourceTagId;
const onDelete = _ref.onDelete;


const handleDelete = function () {
  if (
    !window.confirm(
      'Remove ' +
        relationType +
        ' relation to "' +
        tag.name +
        '"?'
    )
  ) {
    return;
  }

  runPluginOperation('delete_relation', {
    tag_a_id: sourceTagId,
    tag_b_id: tag.id,
    relation_type: relationType
  })
    .then(function () {
      onDelete();
    })
    .catch(function (error) {
      logError(
        'Failed to delete relation:',
        error
      );

      window.alert(
        'Failed to delete relation'
      );
    });
};

return createElement(
  'div',
  {
    className: 'relation-row'
  },

  createElement(
    'span',
    {
      className: 'relation-tag-name'
    },
    tag.name
  ),

  createElement(
    'span',
    {
      className:
        'relation-type-badge ' +
        relationType
    },
    relationType
  ),

  createElement(
    'button',
    {
      type: 'button',
      className: 'relation-delete-btn',
      onClick: handleDelete,
      title: 'Remove relation'
    },
    '×'
  )
);


}

/*

* ============================================================
* Add relation modal
* ============================================================
  */

function AddRelationModal(_ref) {
const sourceTagId = _ref.sourceTagId;
const relationType = _ref.relationType;
const onClose = _ref.onClose;
const onAdd = _ref.onAdd;


const _useState = useState('');
const search = _useState[0];
const setSearch = _useState[1];

const _useState2 = useState([]);
const results = _useState2[0];
const setResults = _useState2[1];

const _useState3 = useState(false);
const loading = _useState3[0];
const setLoading = _useState3[1];

const _useState4 = useState(0);
const selectedIndex = _useState4[0];
const setSelectedIndex = _useState4[1];

const inputRef = useRef(null);

useEffect(function () {
  if (inputRef.current) {
    inputRef.current.focus();
  }
}, []);

useEffect(
  function () {
    const debounce = setTimeout(function () {
      if (search.trim().length >= 2) {
        doSearch();
      } else {
        setResults([]);
      }
    }, 300);

    return function () {
      clearTimeout(debounce);
    };
  },
  [search]
);

const doSearch = function () {
  setLoading(true);

  runPluginOperation('find_tags', {
    search: search.trim(),
    per_page: 20
  })
    .then(function (data) {
      const filtered = data.filter(
        function (tag) {
          return tag.id !== sourceTagId;
        }
      );

      setResults(filtered);
      setSelectedIndex(0);
    })
    .catch(function (error) {
      logError(
        'Search failed:',
        error
      );
    })
    .finally(function () {
      setLoading(false);
    });
};

const handleKeyDown = function (e) {
  if (e.key === 'Escape') {
    onClose();
    return;
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault();

    setSelectedIndex(function (prev) {
      return Math.min(
        prev + 1,
        Math.max(
          results.length - 1,
          0
        )
      );
    });

    return;
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault();

    setSelectedIndex(function (prev) {
      return Math.max(
        prev - 1,
        0
      );
    });

    return;
  }

  if (e.key === 'Enter') {
    e.preventDefault();

    if (results[selectedIndex]) {
      onAdd(
        results[selectedIndex].id,
        relationType
      );
    }
  }
};

const title =
  relationType.charAt(0).toUpperCase() +
  relationType.slice(1);

return createElement(
  'div',
  {
    className: 'modal-overlay',
    onClick: onClose
  },

  createElement(
    'div',
    {
      className: 'modal',
      onClick: function (e) {
        e.stopPropagation();
      }
    },

    createElement(
      'div',
      {
        className: 'modal-header'
      },

      createElement(
        'h3',
        null,
        'Add ' + title + ' Tag'
      ),

      createElement(
        'button',
        {
          type: 'button',
          className: 'modal-close',
          onClick: onClose
        },
        '×'
      )
    ),

    createElement(
      'div',
      {
        className: 'modal-body'
      },

      createElement('input', {
        ref: inputRef,
        type: 'text',
        value: search,

        onChange: function (e) {
          setSearch(e.target.value);
        },

        onKeyDown: handleKeyDown,
        placeholder: 'Search tags...',
        className: 'modal-search-input'
      }),

      loading &&
        createElement(
          'div',
          {
            className: 'modal-loading'
          },
          'Searching...'
        ),

      createElement(
        'ul',
        {
          className: 'modal-results'
        },

        results.map(function (
          tag,
          index
        ) {
          return createElement(
            'li',
            {
              key: tag.id,

              className:
                'modal-result-item' +
                (index === selectedIndex
                  ? ' selected'
                  : ''),

              onClick: function () {
                onAdd(
                  tag.id,
                  relationType
                );
              },

              onMouseEnter: function () {
                setSelectedIndex(index);
              }
            },
            tag.name
          );
        }),

        results.length === 0 &&
          search.length >= 2 &&
          !loading &&
          createElement(
            'li',
            {
              className:
                'modal-no-results'
            },
            'No tags found'
          )
      )
    ),

    createElement(
      'div',
      {
        className: 'modal-footer'
      },

      createElement(
        'button',
        {
          type: 'button',
          className:
            'btn btn-secondary',
          onClick: onClose
        },
        'Cancel'
      )
    )
  )
);


}

/*

* ============================================================
* Related tags panel
* ============================================================
  */

function RelatedTagsPanel(_ref) {
const tagId = _ref.tagId;


const _useState5 = useState([]);
const similar = _useState5[0];
const setSimilar = _useState5[1];

const _useState6 = useState([]);
const related = _useState6[0];
const setRelated = _useState6[1];

const _useState7 = useState(false);
const loading = _useState7[0];
const setLoading = _useState7[1];

const _useState8 = useState(false);
const showAddModal = _useState8[0];
const setShowAddModal =
  _useState8[1];

const _useState9 = useState('similar');
const modalType = _useState9[0];
const setModalType =
  _useState9[1];

const numericTagId = tagId
  ? parseInt(tagId, 10)
  : null;

const loadRelations = function () {
  if (!numericTagId) {
    return;
  }

  setLoading(true);

  runPluginOperation(
    'list_relations',
    {
      tag_id: numericTagId
    }
  )
    .then(function (data) {
      setSimilar(
        data.similar || []
      );

      setRelated(
        data.related || []
      );
    })
    .catch(function (error) {
      logError(
        'Failed to load relations:',
        error
      );
    })
    .finally(function () {
      setLoading(false);
    });
};

useEffect(
  function () {
    if (numericTagId) {
      loadRelations();
    }
  },
  [numericTagId]
);

const handleAddRelation =
  function (
    targetTagId,
    type
  ) {
    if (!numericTagId) {
      return;
    }

    runPluginOperation(
      'create_relation',
      {
        tag_a_id: numericTagId,
        tag_b_id: targetTagId,
        relation_type: type
      }
    )
      .then(function () {
        loadRelations();
        setShowAddModal(false);
      })
      .catch(function (error) {
        logError(
          'Failed to add relation:',
          error
        );

        window.alert(
          'Failed to add relation'
        );
      });
  };

const handleDelete =
  function (
    deletedTagId,
    type
  ) {
    if (type === 'similar') {
      setSimilar(function (prev) {
        return prev.filter(
          function (tag) {
            return (
              tag.id !==
              deletedTagId
            );
          }
        );
      });
    } else {
      setRelated(function (prev) {
        return prev.filter(
          function (tag) {
            return (
              tag.id !==
              deletedTagId
            );
          }
        );
      });
    }
  };

if (!numericTagId) {
  return null;
}

return createElement(
  'div',
  {
    className:
      'related-tags-panel'
  },

  createElement(
    'h3',
    null,
    'Related Tags'
  ),

  createElement(
    'div',
    {
      className:
        'relation-section'
    },

    createElement(
      'div',
      {
        className:
          'section-header'
      },

      createElement(
        'span',
        {
          className:
            'section-title similar'
        },
        'Similar'
      ),

      createElement(
        'button',
        {
          type: 'button',
          className:
            'add-relation-btn',

          onClick: function () {
            setModalType(
              'similar'
            );

            setShowAddModal(
              true
            );
          }
        },
        '+ Add'
      )
    ),

    loading
      ? createElement(
          'div',
          {
            className: 'loading'
          },
          'Loading...'
        )
      : similar.length === 0
      ? createElement(
          'div',
          {
            className:
              'empty-state'
          },
          'No similar tags'
        )
      : createElement(
          'div',
          {
            className:
              'relation-list'
          },

          similar.map(
            function (tag) {
              return createElement(
                RelationRow,
                {
                  key: tag.id,
                  tag: tag,
                  relationType:
                    'similar',
                  sourceTagId:
                    numericTagId,

                  onDelete:
                    function () {
                      handleDelete(
                        tag.id,
                        'similar'
                      );
                    }
                }
              );
            }
          )
        )
  ),

  createElement(
    'div',
    {
      className:
        'relation-section'
    },

    createElement(
      'div',
      {
        className:
          'section-header'
      },

      createElement(
        'span',
        {
          className:
            'section-title related'
        },
        'Related'
      ),

      createElement(
        'button',
        {
          type: 'button',
          className:
            'add-relation-btn',

          onClick: function () {
            setModalType(
              'related'
            );

            setShowAddModal(
              true
            );
          }
        },
        '+ Add'
      )
    ),

    loading
      ? createElement(
          'div',
          {
            className: 'loading'
          },
          'Loading...'
        )
      : related.length === 0
      ? createElement(
          'div',
          {
            className:
              'empty-state'
          },
          'No related tags'
        )
      : createElement(
          'div',
          {
            className:
              'relation-list'
          },

          related.map(
            function (tag) {
              return createElement(
                RelationRow,
                {
                  key: tag.id,
                  tag: tag,
                  relationType:
                    'related',
                  sourceTagId:
                    numericTagId,

                  onDelete:
                    function () {
                      handleDelete(
                        tag.id,
                        'related'
                      );
                    }
                }
              );
            }
          )
        )
  ),

  showAddModal &&
    createElement(
      AddRelationModal,
      {
        sourceTagId:
          numericTagId,
        relationType:
          modalType,

        onClose:
          function () {
            setShowAddModal(
              false
            );
          },

        onAdd:
          handleAddRelation
      }
    )
);


}

/*

* ============================================================
* Tag Relations standalone page
* ============================================================
  */

function TagRelationsPage() {
const _useState10 =
useState([]);


const relations =
  _useState10[0];

const setRelations =
  _useState10[1];

const _useState11 =
  useState([]);

const filteredRelations =
  _useState11[0];

const setFilteredRelations =
  _useState11[1];

const _useState12 =
  useState('');

const search =
  _useState12[0];

const setSearch =
  _useState12[1];

const _useState13 =
  useState('all');

const filter =
  _useState13[0];

const setFilter =
  _useState13[1];

const _useState14 =
  useState(false);

const loading =
  _useState14[0];

const setLoading =
  _useState14[1];

const _useState15 =
  useState({
    total_relations: 0,
    similar_count: 0,
    related_count: 0,
    tags_with_relations: 0
  });

const stats =
  _useState15[0];

const setStats =
  _useState15[1];

const _useState16 =
  useState(false);

const showExport =
  _useState16[0];

const setShowExport =
  _useState16[1];

const _useState17 =
  useState('');

const exportData =
  _useState17[0];

const setExportData =
  _useState17[1];

const applyFilters =
  function (rels) {
    let filtered = rels;

    if (filter !== 'all') {
      filtered =
        filtered.filter(
          function (r) {
            return (
              r.type ===
              filter
            );
          }
        );
    }

    if (search.trim()) {
      const term =
        search.toLowerCase();

      filtered =
        filtered.filter(
          function (r) {
            return (
              r.tag_a.name
                .toLowerCase()
                .includes(term) ||
              r.tag_b.name
                .toLowerCase()
                .includes(term)
            );
          }
        );
    }

    setFilteredRelations(
      filtered
    );
  };

const loadAll = function () {
  setLoading(true);

  Promise.all([
    runPluginOperation(
      'export_relations'
    ),
    runPluginOperation(
      'get_stats'
    )
  ])
    .then(function (
      _ref4
    ) {
      const relsResult =
        _ref4[0];

      const statsResult =
        _ref4[1];

      if (
        relsResult &&
        relsResult.relations
      ) {
        const rels =
          relsResult.relations.map(
            function (r) {
              return {
                tag_a: {
                  id:
                    r.tag_a_id,
                  name: ''
                },

                tag_b: {
                  id:
                    r.tag_b_id,
                  name: ''
                },

                type:
                  r.relation_type
              };
            }
          );

        setRelations(rels);
        applyFilters(rels);
      }

      if (statsResult) {
        setStats(
          statsResult
        );
      }
    })
    .catch(function (
      error
    ) {
      logError(
        'Failed to load:',
        error
      );
    })
    .finally(function () {
      setLoading(false);
    });
};

useEffect(function () {
  loadAll();
}, []);

useEffect(
  function () {
    applyFilters(relations);
  },
  [
    search,
    filter,
    relations
  ]
);

const handleExport =
  function () {
    runPluginOperation(
      'export_relations'
    )
      .then(function (data) {
        if (data) {
          setExportData(
            JSON.stringify(
              data,
              null,
              2
            )
          );

          setShowExport(
            true
          );
        }
      })
      .catch(function (
        error
      ) {
        logError(
          'Export failed:',
          error
        );
      });
  };

const handleImport =
  function (file) {
    const reader =
      new FileReader();

    reader.onload =
      function (e) {
        try {
          const data =
            JSON.parse(
              e.target.result
            );

          runPluginOperation(
            'import_relations',
            {
              relations:
                data.relations ||
                [],
              overwrite:
                false
            }
          )
            .then(
              function (
                result
              ) {
                window.alert(
                  'Imported ' +
                    result.imported_count +
                    ' relations'
                );

                loadAll();
              }
            )
            .catch(
              function (
                error
              ) {
                logError(
                  'Import failed:',
                  error
                );

                window.alert(
                  'Import failed'
                );
              }
            );
        } catch (error) {
          logError(
            'Import failed:',
            error
          );

          window.alert(
            'Import failed'
          );
        }
      };

    reader.readAsText(
      file
    );
  };

const handleValidate =
  function () {
    runPluginOperation(
      'validate_relations'
    )
      .then(function (data) {
        if (!data) {
          return;
        }

        window.alert(
          'Valid: ' +
            data.valid_count +
            '\nBroken: ' +
            data.broken_count
        );

        if (
          data.broken_count >
          0
        ) {
          if (
            window.confirm(
              'Remove broken relations?'
            )
          ) {
            runPluginOperation(
              'remove_broken_relations'
            )
              .then(
                function (
                  result
                ) {
                  window.alert(
                    'Removed ' +
                      result.removed_count +
                      ' broken relations'
                  );

                  loadAll();
                }
              )
              .catch(
                function (
                  error
                ) {
                  logError(
                    'Failed to remove broken relations:',
                    error
                  );
                }
              );
          }
        }
      })
      .catch(function (
        error
      ) {
        logError(
          'Validate failed:',
          error
        );
      });
  };

return createElement(
  'div',
  {
    className:
      'tag-relations-page'
  },

  createElement(
    'div',
    {
      className:
        'page-header'
    },

    createElement(
      'h2',
      null,
      'Tag Relations'
    ),

    createElement(
      'div',
      {
        className:
          'page-actions'
      },

      createElement(
        'button',
        {
          type: 'button',
          className:
            'btn btn-primary',
          onClick:
            handleExport
        },
        'Export JSON'
      ),

      createElement(
        'input',
        {
          type: 'file',
          accept: '.json',

          onChange:
            function (e) {
              const file =
                e.target.files &&
                e.target.files[0];

              if (file) {
                handleImport(
                  file
                );
              }
            },

          className:
            'file-input',

          id:
            'import-file',

          style: {
            display:
              'none'
          }
        }
      ),

      createElement(
        'label',
        {
          htmlFor:
            'import-file',

          className:
            'btn btn-secondary'
        },
        'Import JSON'
      ),

      createElement(
        'button',
        {
          type: 'button',
          className:
            'btn btn-secondary',
          onClick:
            handleValidate
        },
        'Validate'
      )
    )
  ),

  createElement(
    'div',
    {
      className:
        'stats-bar'
    },

    createElement(
      'div',
      {
        className: 'stat'
      },
      'Total: ' +
        stats.total_relations
    ),

    createElement(
      'div',
      {
        className:
          'stat similar'
      },
      'Similar: ' +
        stats.similar_count
    ),

    createElement(
      'div',
      {
        className:
          'stat related'
      },
      'Related: ' +
        stats.related_count
    ),

    createElement(
      'div',
      {
        className: 'stat'
      },
      'Tags: ' +
        stats.tags_with_relations
    )
  ),

  createElement(
    'div',
    {
      className:
        'filters'
    },

    createElement(
      'input',
      {
        type: 'text',
        value: search,

        onChange:
          function (e) {
            setSearch(
              e.target.value
            );
          },

        placeholder:
          'Search tags...',

        className:
          'search-input'
      }
    ),

    createElement(
      'select',
      {
        value: filter,

        onChange:
          function (e) {
            setFilter(
              e.target.value
            );
          },

        className:
          'filter-select'
      },

      createElement(
        'option',
        {
          value: 'all'
        },
        'All'
      ),

      createElement(
        'option',
        {
          value: 'similar'
        },
        'Similar'
      ),

      createElement(
        'option',
        {
          value: 'related'
        },
        'Related'
      )
    )
  ),

  loading
    ? createElement(
        'div',
        {
          className:
            'loading'
        },
        'Loading relations...'
      )

    : filteredRelations.length ===
      0

    ? createElement(
        'div',
        {
          className:
            'empty-state'
        },
        'No relations found'
      )

    : createElement(
        'div',
        {
          className:
            'relations-grid'
        },

        filteredRelations.map(
          function (
            rel,
            index
          ) {
            return createElement(
              'div',
              {
                key: index,

                className:
                  'relation-card ' +
                  rel.type
              },

              createElement(
                'div',
                {
                  className:
                    'relation-pair'
                },

                createElement(
                  'span',
                  {
                    className:
                      'tag-name'
                  },
                  rel.tag_a
                    .name ||
                    'Tag #' +
                      rel.tag_a.id
                ),

                createElement(
                  'span',
                  {
                    className:
                      'relation-arrow ' +
                      rel.type
                  },
                  rel.type ===
                    'similar'
                    ? '≈'
                    : '∼'
                ),

                createElement(
                  'span',
                  {
                    className:
                      'tag-name'
                  },
                  rel.tag_b
                    .name ||
                    'Tag #' +
                      rel.tag_b.id
                )
              ),

              createElement(
                'span',
                {
                  className:
                    'type-badge ' +
                    rel.type
                },
                rel.type
              )
            );
          }
        )
      ),

  showExport &&
    createElement(
      'div',
      {
        className:
          'modal-overlay',

        onClick:
          function () {
            setShowExport(
              false
            );
          }
      },

      createElement(
        'div',
        {
          className:
            'modal modal-large',

          onClick:
            function (e) {
              e.stopPropagation();
            }
        },

        createElement(
          'div',
          {
            className:
              'modal-header'
          },

          createElement(
            'h3',
            null,
            'Export Relations (JSON)'
          ),

          createElement(
            'button',
            {
              type: 'button',

              className:
                'modal-close',

              onClick:
                function () {
                  setShowExport(
                    false
                  );
                }
            },
            '×'
          )
        ),

        createElement(
          'div',
          {
            className:
              'modal-body'
          },

          createElement(
            'textarea',
            {
              value:
                exportData,
              readOnly: true,

              className:
                'export-textarea',

              onClick:
                function (e) {
                  e.target.select();
                }
            }
          ),

          createElement(
            'button',
            {
              type: 'button',

              className:
                'btn btn-primary',

              onClick:
                function () {
                  navigator.clipboard.writeText(
                    exportData
                  );
                }
            },
            'Copy to Clipboard'
          )
        )
      )
    )
);


}

/*

* ============================================================
* Standalone plugin page
* ============================================================
  */

window.PluginApi.register.route(
'/plugin/tag-relations',
TagRelationsPage
);

log(
'Standalone route registered'
);

/*

* ============================================================
* TagEditPanel integration
* ============================================================
*
* TagEditPanel itself is not a PatchComponent.
*
* TagPage IS patchable.
*
* PluginApi.patch.after() gives us:
*
* (props, renderedResult)
*
* renderedResult is the actual React element tree returned by
* TagPage, so we walk that tree and replace TagEditPanel.
  */

function getComponentName(type) {
if (!type) {
return '';
}


return (
  type.displayName ||
  type.name ||
  ''
);


}

function isTagEditPanelElement(
element
) {
if (
!React.isValidElement(element)
) {
return false;
}


const name =
  getComponentName(
    element.type
  );

/*
 * Primary check.
 */
if (
  name === 'TagEditPanel' ||
  name ===
    'PatchedTagEditPanel'
) {
  return true;
}

/*
 * Fallback check.
 */
const props =
  element.props;

if (!props) {
  return false;
}

return (
  props.tag &&
  props.onSubmit &&
  props.onCancel &&
  props.onDelete &&
  props.setImage &&
  props.setEncodingImage
);


}

function TagEditPanelWithRelations(
_ref
) {
const originalElement =
_ref.originalElement;


const tag =
  _ref.tag;

const _useState18 =
  useState(false);

const showRelations =
  _useState18[0];

const setShowRelations =
  _useState18[1];

const tagId =
  tag && tag.id;

/*
 * New tags do not have an ID yet.
 */
if (!tagId) {
  return originalElement;
}

const toggleRelations =
  function () {
    setShowRelations(
      function (value) {
        return !value;
      }
    );
  };

return createElement(
  Fragment,
  null,

  /*
   * Original TagEditPanel.
   */
  originalElement,

  /*
   * Relations controls.
   */
  createElement(
    'div',
    {
      className:
        'tag-relations-edit-controls'
    },

    createElement(
      'button',
      {
        type: 'button',

        className:
          'btn btn-secondary ' +
          'tag-relations-edit-button',

        onClick:
          toggleRelations
      },

      showRelations
        ? 'Hide Tag Relations'
        : 'Tag Relations'
    )
  ),

  /*
   * Relations panel.
   */
  showRelations &&
    createElement(
      'div',
      {
        className:
          'tag-relations-edit-panel-wrapper'
      },

      createElement(
        RelatedTagsPanel,
        {
          tagId:
            String(tagId)
        }
      )
    )
);


}

function patchTagEditPanelTree(
element
) {
if (
!React.isValidElement(element)
) {
return element;
}


/*
 * TagEditPanel found.
 */
if (
  isTagEditPanelElement(
    element
  )
) {
  log(
    'Found TagEditPanel in TagPage tree'
  );

  return createElement(
    TagEditPanelWithRelations,
    {
      key: element.key,

      tag:
        element.props &&
        element.props.tag,

      originalElement:
        element
    }
  );
}

/*
 * No children.
 */
if (
  !element.props ||
  element.props.children == null
) {
  return element;
}

/*
 * Walk children recursively.
 */
const children =
  React.Children.map(
    element.props.children,
    function (child) {
      return patchTagEditPanelTree(
        child
      );
    }
  );

/*
 * Preserve all original props.
 */
return React.cloneElement(
  element,
  undefined,
  children
);


}

try {
window.PluginApi.patch.after(
'TagPage',


  function (
    props,
    renderedResult
  ) {
    log(
      'TagPage after patch called'
    );

    if (!renderedResult) {
      log(
        'TagPage renderedResult is empty'
      );

      return renderedResult;
    }

    const tag =
      props &&
      props.tag;

    const tagId =
      tag &&
      tag.id;

    log(
      'TagPage after:',
      'tagId=' + tagId
    );

    const patchedResult =
      patchTagEditPanelTree(
        renderedResult
      );

    return patchedResult;
  }
);

log(
  'TagPage after patch registered'
);


} catch (error) {
logError(
'Failed to register TagPage after patch:',
error
);
}

log('loaded');
})();
