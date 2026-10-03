(function () {
  'use strict';

  const PLUGIN_ID = 'tag-relations';

  function log() {
    console.log('[Tag Relations]', ...arguments);
  }

  function logError() {
    console.error('[Tag Relations]', ...arguments);
  }

  /*
   * ============================================================
   * Plugin operation
   * ============================================================
   */

  async function runPluginOperation(operation, args) {
    const query = `
      mutation($id: ID!, $args: Map) {
        runPluginOperation(plugin_id: $id, args: $args)
      }
    `;

    const variables = {
      id: PLUGIN_ID,
      args: Object.assign(
        {
          operation: operation
        },
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
  const ReactDOM = window.PluginApi.ReactDOM;

  if (!React) {
    logError('PluginApi.React is unavailable');
    return;
  }

  if (!ReactDOM) {
    logError('PluginApi.ReactDOM is unavailable');
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
        className: 'tag-relations-relation-row'
      },

      createElement(
        'span',
        {
          className:
            'tag-relations-relation-tag-name'
        },
        tag.name
      ),

      createElement(
        'span',
        {
          className:
            'tag-relations-relation-type-badge ' +
            relationType
        },
        relationType
      ),

      createElement(
        'button',
        {
          type: 'button',
          className:
            'tag-relations-relation-delete-btn',
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
        const timeout = setTimeout(function () {
          if (search.trim().length >= 2) {
            doSearch();
          } else {
            setResults([]);
          }
        }, 300);

        return function () {
          clearTimeout(timeout);
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
        className:
          'tag-relations-modal-overlay',
        onClick: onClose
      },

      createElement(
        'div',
        {
          className:
            'tag-relations-modal',
          onClick: function (e) {
            e.stopPropagation();
          }
        },

        createElement(
          'div',
          {
            className:
              'tag-relations-modal-header'
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
              className:
                'tag-relations-modal-close',
              onClick: onClose
            },
            '×'
          )
        ),

        createElement(
          'div',
          {
            className:
              'tag-relations-modal-body'
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
            className:
              'tag-relations-modal-search'
          }),

          loading &&
            createElement(
              'div',
              {
                className:
                  'tag-relations-modal-loading'
              },
              'Searching...'
            ),

          createElement(
            'ul',
            {
              className:
                'tag-relations-modal-results'
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
                    'tag-relations-modal-result' +
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
              search.trim().length >= 2 &&
              !loading &&
              createElement(
                'li',
                {
                  className:
                    'tag-relations-modal-no-results'
                },
                'No tags found'
              )
          )
        ),

        createElement(
          'div',
          {
            className:
              'tag-relations-modal-footer'
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
          'tag-relations-panel'
      },

      createElement(
        'h3',
        {
          className:
            'tag-relations-panel-title'
        },
        'Related Tags'
      ),

      /*
       * Similar
       */

      createElement(
        'div',
        {
          className:
            'tag-relations-section'
        },

        createElement(
          'div',
          {
            className:
              'tag-relations-section-header'
          },

          createElement(
            'span',
            {
              className:
                'tag-relations-section-title similar'
            },
            'Similar'
          ),

          createElement(
            'button',
            {
              type: 'button',
              className:
                'tag-relations-add-button',
              onClick: function () {
                setModalType('similar');
                setShowAddModal(true);
              }
            },
            '+ Add'
          )
        ),

        loading
          ? createElement(
              'div',
              {
                className:
                  'tag-relations-status'
              },
              'Loading...'
            )
          : similar.length === 0
          ? createElement(
              'div',
              {
                className:
                  'tag-relations-status'
              },
              'No similar tags'
            )
          : createElement(
              'div',
              {
                className:
                  'tag-relations-list'
              },

              similar.map(function (tag) {
                return createElement(
                  RelationRow,
                  {
                    key: tag.id,
                    tag: tag,
                    relationType: 'similar',
                    sourceTagId:
                      numericTagId,

                    onDelete: function () {
                      handleDelete(
                        tag.id,
                        'similar'
                      );
                    }
                  }
                );
              })
            )
      ),

      /*
       * Related
       */

      createElement(
        'div',
        {
          className:
            'tag-relations-section'
        },

        createElement(
          'div',
          {
            className:
              'tag-relations-section-header'
          },

          createElement(
            'span',
            {
              className:
                'tag-relations-section-title related'
            },
            'Related'
          ),

          createElement(
            'button',
            {
              type: 'button',
              className:
                'tag-relations-add-button',
              onClick: function () {
                setModalType('related');
                setShowAddModal(true);
              }
            },
            '+ Add'
          )
        ),

        loading
          ? createElement(
              'div',
              {
                className:
                  'tag-relations-status'
              },
              'Loading...'
            )
          : related.length === 0
          ? createElement(
              'div',
              {
                className:
                  'tag-relations-status'
              },
              'No related tags'
            )
          : createElement(
              'div',
              {
                className:
                  'tag-relations-list'
              },

              related.map(function (tag) {
                return createElement(
                  RelationRow,
                  {
                    key: tag.id,
                    tag: tag,
                    relationType: 'related',
                    sourceTagId:
                      numericTagId,

                    onDelete: function () {
                      handleDelete(
                        tag.id,
                        'related'
                      );
                    }
                  }
                );
              })
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

            onClose: function () {
              setShowAddModal(false);
            },

            onAdd:
              handleAddRelation
          }
        )
    );
  }

  /*
   * ============================================================
   * Standalone page
   * ============================================================
   */

  function TagRelationsPage() {
    const _useState10 = useState([]);
    const relations = _useState10[0];
    const setRelations = _useState10[1];

    const _useState11 = useState([]);
    const filteredRelations =
      _useState11[0];
    const setFilteredRelations =
      _useState11[1];

    const _useState12 = useState('');
    const search = _useState12[0];
    const setSearch = _useState12[1];

    const _useState13 = useState('all');
    const filter = _useState13[0];
    const setFilter = _useState13[1];

    const _useState14 = useState(false);
    const loading = _useState14[0];
    const setLoading = _useState14[1];

    const _useState15 = useState({
      total_relations: 0,
      similar_count: 0,
      related_count: 0,
      tags_with_relations: 0
    });

    const stats = _useState15[0];
    const setStats = _useState15[1];

    const _useState16 = useState(false);
    const showExport = _useState16[0];
    const setShowExport = _useState16[1];

    const _useState17 = useState('');
    const exportData = _useState17[0];
    const setExportData = _useState17[1];

    const applyFilters = function (rels) {
      let filtered = rels;

      if (filter !== 'all') {
        filtered = filtered.filter(
          function (r) {
            return r.type === filter;
          }
        );
      }

      if (search.trim()) {
        const term =
          search.toLowerCase();

        filtered = filtered.filter(
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

      setFilteredRelations(filtered);
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
        .then(function (result) {
          const relsResult = result[0];
          const statsResult = result[1];

          if (
            relsResult &&
            relsResult.relations
          ) {
            const rels =
              relsResult.relations.map(
                function (r) {
                  return {
                    tag_a: {
                      id: r.tag_a_id,
                      name: ''
                    },

                    tag_b: {
                      id: r.tag_b_id,
                      name: ''
                    },

                    type:
                      r.relation_type
                  };
                }
              );

            setRelations(rels);
          }

          if (statsResult) {
            setStats(statsResult);
          }
        })
        .catch(function (error) {
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

    const handleExport = function () {
      runPluginOperation(
        'export_relations'
      )
        .then(function (data) {
          if (!data) {
            return;
          }

          setExportData(
            JSON.stringify(
              data,
              null,
              2
            )
          );

          setShowExport(true);
        })
        .catch(function (error) {
          logError(
            'Export failed:',
            error
          );
        });
    };

    const handleImport = function (file) {
      const reader = new FileReader();

      reader.onload = function (e) {
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
              overwrite: false
            }
          )
            .then(function (result) {
              window.alert(
                'Imported ' +
                  result.imported_count +
                  ' relations'
              );

              loadAll();
            })
            .catch(function (error) {
              logError(
                'Import failed:',
                error
              );

              window.alert(
                'Import failed'
              );
            });
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

      reader.readAsText(file);
    };

    const handleValidate = function () {
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

          if (data.broken_count > 0) {
            if (
              window.confirm(
                'Remove broken relations?'
              )
            ) {
              runPluginOperation(
                'remove_broken_relations'
              )
                .then(function (result) {
                  window.alert(
                    'Removed ' +
                      result.removed_count +
                      ' broken relations'
                  );

                  loadAll();
                })
                .catch(function (error) {
                  logError(
                    'Failed to remove broken relations:',
                    error
                  );
                });
            }
          }
        })
        .catch(function (error) {
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
            'tag-relations-page-header'
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
              'tag-relations-page-actions'
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

              onChange: function (e) {
                const file =
                  e.target.files &&
                  e.target.files[0];

                if (file) {
                  handleImport(file);
                }
              },

              className:
                'tag-relations-file-input',

              id:
                'tag-relations-import-file'
            }
          ),

          createElement(
            'label',
            {
              htmlFor:
                'tag-relations-import-file',

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
            'tag-relations-stats-bar'
        },

        createElement(
          'div',
          {
            className:
              'tag-relations-stat'
          },
          'Total: ' +
            stats.total_relations
        ),

        createElement(
          'div',
          {
            className:
              'tag-relations-stat similar'
          },
          'Similar: ' +
            stats.similar_count
        ),

        createElement(
          'div',
          {
            className:
              'tag-relations-stat related'
          },
          'Related: ' +
            stats.related_count
        ),

        createElement(
          'div',
          {
            className:
              'tag-relations-stat'
          },
          'Tags: ' +
            stats.tags_with_relations
        )
      ),

      createElement(
        'div',
        {
          className:
            'tag-relations-filters'
        },

        createElement(
          'input',
          {
            type: 'text',
            value: search,

            onChange: function (e) {
              setSearch(
                e.target.value
              );
            },

            placeholder:
              'Search tags...',

            className:
              'tag-relations-search-input'
          }
        ),

        createElement(
          'select',
          {
            value: filter,

            onChange: function (e) {
              setFilter(
                e.target.value
              );
            },

            className:
              'tag-relations-filter-select'
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
                'tag-relations-page-status'
            },
            'Loading relations...'
          )

        : filteredRelations.length === 0

        ? createElement(
            'div',
            {
              className:
                'tag-relations-page-status'
            },
            'No relations found'
          )

        : createElement(
            'div',
            {
              className:
                'tag-relations-grid'
            },

            filteredRelations.map(
              function (rel, index) {
                return createElement(
                  'div',
                  {
                    key: index,

                    className:
                      'tag-relations-card ' +
                      rel.type
                  },

                  createElement(
                    'div',
                    {
                      className:
                        'tag-relations-pair'
                    },

                    createElement(
                      'span',
                      {
                        className:
                          'tag-relations-tag-name'
                      },
                      rel.tag_a.name ||
                        'Tag #' +
                          rel.tag_a.id
                    ),

                    createElement(
                      'span',
                      {
                        className:
                          'tag-relations-arrow ' +
                          rel.type
                      },
                      rel.type === 'similar'
                        ? '≈'
                        : '∼'
                    ),

                    createElement(
                      'span',
                      {
                        className:
                          'tag-relations-tag-name'
                      },
                      rel.tag_b.name ||
                        'Tag #' +
                          rel.tag_b.id
                    )
                  ),

                  createElement(
                    'span',
                    {
                      className:
                        'tag-relations-type-badge ' +
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
              'tag-relations-modal-overlay',

            onClick: function () {
              setShowExport(false);
            }
          },

          createElement(
            'div',
            {
              className:
                'tag-relations-modal tag-relations-modal-large',

              onClick: function (e) {
                e.stopPropagation();
              }
            },

            createElement(
              'div',
              {
                className:
                  'tag-relations-modal-header'
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
                    'tag-relations-modal-close',

                  onClick: function () {
                    setShowExport(false);
                  }
                },
                '×'
              )
            ),

            createElement(
              'div',
              {
                className:
                  'tag-relations-modal-body'
              },

              createElement(
                'textarea',
                {
                  value:
                    exportData,
                  readOnly: true,

                  className:
                    'tag-relations-export-textarea',

                  onClick: function (e) {
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

                  onClick: function () {
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
   * Standalone route
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
   * Tag page integration
   * ============================================================
   *
   * We deliberately do NOT use:
   *
   * PluginApi.patch.after('TagPage', ...)
   *
   * Instead we observe the rendered DOM and add our own
   * React mount point next to the native TagEditPanel.
   *
   * This keeps the integration independent from whether
   * TagPage is currently exposed through PatchComponent.
   */

  const EDIT_CONTROLS_SELECTOR =
    '#tag-page .details-edit';

  const RELATIONS_BUTTON_CLASS =
    'tag-relations-native-button';

  const RELATIONS_MOUNT_CLASS =
    'tag-relations-native-mount';

  let observer = null;

  function getCurrentTagId() {
    const match =
      window.location.pathname.match(
        /^\/tags\/([^/]+)/
      );

    if (!match) {
      return null;
    }

    const id = parseInt(
      match[1],
      10
    );

    return Number.isFinite(id)
      ? id
      : null;
  }

  function createReactRoot(container) {
    if (
      ReactDOM &&
      typeof ReactDOM.createRoot ===
        'function'
    ) {
      return ReactDOM.createRoot(
        container
      );
    }

    return null;
  }

  function unmountRelationsMount(
    mount
  ) {
    if (!mount) {
      return;
    }

    if (mount.__tagRelationsRoot) {
      try {
        mount.__tagRelationsRoot.unmount();
      } catch (error) {
        logError(
          'Failed to unmount relations root:',
          error
        );
      }

      mount.__tagRelationsRoot = null;
    }

    mount.remove();
  }

  function createRelationsMount(
    controls,
    tagId
  ) {
    const existing =
      controls.parentElement &&
      controls.parentElement.querySelector(
        '.' +
          RELATIONS_MOUNT_CLASS
      );

    if (existing) {
      return;
    }

    const mount =
      document.createElement('div');

    mount.className =
      RELATIONS_MOUNT_CLASS;

    mount.setAttribute(
      'data-tag-id',
      String(tagId)
    );

    controls.insertAdjacentElement(
      'afterend',
      mount
    );

    const root =
      createReactRoot(mount);

    if (!root) {
      logError(
        'ReactDOM.createRoot is unavailable'
      );

      mount.remove();
      return;
    }

    mount.__tagRelationsRoot = root;

    root.render(
      createElement(
        RelatedTagsPanel,
        {
          tagId: String(tagId)
        }
      )
    );
  }

  function removeRelationsMount(
    controls
  ) {
    const parent =
      controls.parentElement;

    if (!parent) {
      return;
    }

    const mount =
      parent.querySelector(
        '.' +
          RELATIONS_MOUNT_CLASS
      );

    if (mount) {
      unmountRelationsMount(
        mount
      );
    }
  }

  function installRelationsButton(
    controls,
    tagId
  ) {
    if (!controls || !tagId) {
      return;
    }

    if (
      controls.querySelector(
        '.' +
          RELATIONS_BUTTON_CLASS
      )
    ) {
      return;
    }

    const button =
      document.createElement(
        'button'
      );

    /*
     * We intentionally use Stash's existing
     * Bootstrap button classes instead of
     * redefining .btn / .btn-secondary.
     */
    button.type = 'button';

    button.className =
      'btn btn-secondary ' +
      RELATIONS_BUTTON_CLASS;

    button.textContent =
      'Tag Relations';

    button.title =
      'Manage relations for this tag';

    button.addEventListener(
      'click',
      function () {
        const parent =
          controls.parentElement;

        if (!parent) {
          return;
        }

        const existing =
          parent.querySelector(
            '.' +
              RELATIONS_MOUNT_CLASS
          );

        if (existing) {
          unmountRelationsMount(
            existing
          );
          button.textContent =
            'Tag Relations';
          return;
        }

        createRelationsMount(
          controls,
          tagId
        );

        button.textContent =
          'Hide Tag Relations';
      }
    );

    controls.appendChild(button);

    log(
      'Tag Relations button added',
      'tagId=' + tagId
    );
  }

  function scanTagEditPanel() {
    const tagId =
      getCurrentTagId();

    if (!tagId) {
      return;
    }

    const controls =
      document.querySelector(
        EDIT_CONTROLS_SELECTOR
      );

    /*
     * We are not in edit mode.
     */
    if (!controls) {
      return;
    }

    /*
     * TagEditPanel has appeared.
     */
    installRelationsButton(
      controls,
      tagId
    );
  }

  function startTagPageObserver() {
    if (observer) {
      observer.disconnect();
    }

    observer =
      new MutationObserver(
        function () {
          scanTagEditPanel();
        }
      );

    observer.observe(
      document.body,
      {
        childList: true,
        subtree: true
      }
    );

    /*
     * Initial scan.
     */
    scanTagEditPanel();

    log(
      'Tag page DOM observer started'
    );
  }

  /*
   * Start after the plugin has loaded.
   */

  startTagPageObserver();

  log('loaded');
})();