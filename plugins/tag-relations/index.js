(function () {
  'use strict';

  const PLUGIN_ID = 'tag-relations';

  const INLINE_MOUNT_CLASS = 'tag-relations-inline-mount';
  const MANAGER_MOUNT_CLASS = 'tag-relations-manager-mount';
  const RELATIONS_BUTTON_CLASS = 'tag-relations-native-button';

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

    log('Plugin operation:', operation, variables.args);

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

      log('GraphQL response:', operation, result);

      if (result.errors) {
        throw new Error(
          result.errors
            .map(function (error) {
              return error.message;
            })
            .join(', ')
        );
      }

      const rawData =
        result.data &&
        result.data.runPluginOperation;

      if (!rawData) {
        throw new Error(
          'Plugin returned an empty response'
        );
      }

      /*
       * Depending on Stash/plugin implementation,
       * the operation result can already be an object
       * or can occasionally arrive serialized.
       */
      let data = rawData;

      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch (error) {
          /*
           * Leave it as-is if it isn't JSON.
           */
        }
      }

      if (
        data &&
        typeof data === 'object' &&
        Object.prototype.hasOwnProperty.call(
          data,
          'ok'
        )
      ) {
        if (!data.ok) {
          throw new Error(
            (data.error &&
              data.error.message) ||
              data.error ||
              'Operation failed'
          );
        }

        return data.data;
      }

      return data;
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

  const PluginApi = window.PluginApi;

  if (!PluginApi) {
    logError('PluginApi is unavailable');
    return;
  }

  const React = PluginApi.React;
  const ReactDOM = PluginApi.ReactDOM;

  if (!React) {
    logError(
      'PluginApi.React is unavailable'
    );
    return;
  }

  if (!ReactDOM) {
    logError(
      'PluginApi.ReactDOM is unavailable'
    );
    return;
  }

  const createElement = React.createElement;
  const useState = React.useState;
  const useEffect = React.useEffect;
  const useRef = React.useRef;

  /*
   * ============================================================
   * React mounting helpers
   * ============================================================
   */

  function mountReact(
    container,
    element
  ) {
    if (
      ReactDOM &&
      typeof ReactDOM.createRoot ===
        'function'
    ) {
      const root =
        ReactDOM.createRoot(container);

      root.render(element);

      container.__tagRelationsRoot =
        root;

      return root;
    }

    if (
      ReactDOM &&
      typeof ReactDOM.render ===
        'function'
    ) {
      ReactDOM.render(
        element,
        container
      );

      container.__tagRelationsLegacy =
        true;

      return null;
    }

    throw new Error(
      'ReactDOM.createRoot/render is unavailable'
    );
  }

  function unmountReact(
    container
  ) {
    if (!container) {
      return;
    }

    if (
      container.__tagRelationsRoot
    ) {
      try {
        container.__tagRelationsRoot.unmount();
      } catch (error) {
        logError(
          'Failed to unmount React root:',
          error
        );
      }

      container.__tagRelationsRoot =
        null;
    }

    if (
      container.__tagRelationsLegacy &&
      typeof ReactDOM.unmountComponentAtNode ===
        'function'
    ) {
      try {
        ReactDOM.unmountComponentAtNode(
          container
        );
      } catch (error) {
        logError(
          'Failed to unmount legacy React:',
          error
        );
      }

      container.__tagRelationsLegacy =
        false;
    }
  }

  /*
   * ============================================================
   * Tag helpers
   * ============================================================
   */

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

  function getTagUrl(tagId) {
    return '/tags/' + tagId;
  }

  /*
   * ============================================================
   * Relation row
   * ============================================================
   */

  function RelationRow(props) {
    const tag = props.tag;
    const relationType =
      props.relationType;
    const sourceTagId =
      props.sourceTagId;
    const onDelete =
      props.onDelete;

    const handleDelete =
      function () {
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

        log(
          'Deleting relation:',
          sourceTagId,
          tag.id,
          relationType
        );

        runPluginOperation(
          'delete_relation',
          {
            tag_a_id: sourceTagId,
            tag_b_id: tag.id,
            relation_type:
              relationType
          }
        )
          .then(function () {
            log(
              'Relation deleted successfully'
            );

            onDelete();
          })
          .catch(function (error) {
            logError(
              'Failed to delete relation:',
              error
            );

            window.alert(
              'Failed to delete relation:\n' +
                error.message
            );
          });
      };

    return createElement(
      'div',
      {
        className:
          'tag-relations-relation-row'
      },

      createElement(
        'a',
        {
          href: getTagUrl(tag.id),
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
          title:
            'Remove relation'
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

  function AddRelationModal(props) {
    const sourceTagId =
      props.sourceTagId;

    const relationType =
      props.relationType;

    const onClose =
      props.onClose;

    const onAdd =
      props.onAdd;

    const searchState =
      useState('');

    const search =
      searchState[0];

    const setSearch =
      searchState[1];

    const resultsState =
      useState([]);

    const results =
      resultsState[0];

    const setResults =
      resultsState[1];

    const loadingState =
      useState(false);

    const loading =
      loadingState[0];

    const setLoading =
      loadingState[1];

    const selectedState =
      useState(0);

    const selectedIndex =
      selectedState[0];

    const setSelectedIndex =
      selectedState[1];

    const addingState =
      useState(false);

    const adding =
      addingState[0];

    const setAdding =
      addingState[1];

    const inputRef =
      useRef(null);

    useEffect(
      function () {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      },
      []
    );

    useEffect(
      function () {
        const timeout =
          setTimeout(
            function () {
              if (
                search.trim().length >=
                2
              ) {
                doSearch();
              } else {
                setResults([]);
              }
            },
            300
          );

        return function () {
          clearTimeout(timeout);
        };
      },
      [search]
    );

    const doSearch =
      function () {
        const query =
          search.trim();

        if (query.length < 2) {
          return;
        }

        setLoading(true);

        log(
          'Searching tags:',
          query
        );

        runPluginOperation(
          'find_tags',
          {
            search: query,
            per_page: 20
          }
        )
          .then(function (data) {
            const tags =
              Array.isArray(data)
                ? data
                : [];

            const filtered =
              tags.filter(
                function (tag) {
                  return (
                    String(tag.id) !==
                    String(sourceTagId)
                  );
                }
              );

            log(
              'Tag search results:',
              filtered
            );

            setResults(filtered);
            setSelectedIndex(0);
          })
          .catch(function (error) {
            logError(
              'Search failed:',
              error
            );

            setResults([]);
          })
          .finally(function () {
            setLoading(false);
          });
      };

    const handleAdd =
      function (tagId) {
        if (adding) {
          return;
        }

        setAdding(true);

        log(
          'Adding relation:',
          {
            sourceTagId:
              sourceTagId,
            targetTagId:
              tagId,
            relationType:
              relationType
          }
        );

        Promise.resolve(
          onAdd(
            tagId,
            relationType
          )
        ).finally(
          function () {
            setAdding(false);
          }
        );
      };

    const handleKeyDown =
      function (event) {
        if (
          event.key ===
          'Escape'
        ) {
          onClose();
          return;
        }

        if (
          event.key ===
          'ArrowDown'
        ) {
          event.preventDefault();

          setSelectedIndex(
            function (prev) {
              return Math.min(
                prev + 1,
                Math.max(
                  results.length - 1,
                  0
                )
              );
            }
          );

          return;
        }

        if (
          event.key ===
          'ArrowUp'
        ) {
          event.preventDefault();

          setSelectedIndex(
            function (prev) {
              return Math.max(
                prev - 1,
                0
              );
            }
          );

          return;
        }

        if (
          event.key ===
          'Enter'
        ) {
          event.preventDefault();

          if (
            results[selectedIndex]
          ) {
            handleAdd(
              results[
                selectedIndex
              ].id
            );
          }
        }
      };

    const title =
      relationType ===
      'similar'
        ? 'Similar'
        : 'Related';

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
          onClick:
            function (event) {
              event.stopPropagation();
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
            'Add ' +
              title +
              ' Tag'
          ),

          createElement(
            'button',
            {
              type: 'button',
              className:
                'btn btn-secondary',
              onClick: onClose,
              disabled: adding
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

            onChange:
              function (event) {
                setSearch(
                  event.target.value
                );
              },

            onKeyDown:
              handleKeyDown,

            placeholder:
              'Search tags...',

            className:
              'tag-relations-modal-search',

            disabled: adding
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

            results.map(
              function (
                tag,
                index
              ) {
                return createElement(
                  'li',
                  {
                    key: tag.id,

                    className:
                      'tag-relations-modal-result' +
                      (index ===
                      selectedIndex
                        ? ' selected'
                        : ''),

                    onClick:
                      function () {
                        handleAdd(
                          tag.id
                        );
                      },

                    onMouseEnter:
                      function () {
                        setSelectedIndex(
                          index
                        );
                      }
                  },

                  tag.name
                );
              }
            ),

            results.length === 0 &&
              search.trim()
                .length >= 2 &&
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
              onClick: onClose,
              disabled: adding
            },
            adding
              ? 'Adding...'
              : 'Cancel'
          )
        )
      )
    );
  }

  /*
   * ============================================================
   * Relations data helpers
   * ============================================================
   */

  function normalizeRelationData(
    data
  ) {
    if (!data) {
      return {
        similar: [],
        related: []
      };
    }

    return {
      similar:
        Array.isArray(
          data.similar
        )
          ? data.similar
          : [],

      related:
        Array.isArray(
          data.related
        )
          ? data.related
          : []
    };
  }

  /*
   * ============================================================
   * Inline related tags
   *
   * This is shown next to Parent Tags / Sub-Tags.
   * ============================================================
   */

  function RelatedTagsInline(
    props
  ) {
    const tagId =
      props.tagId;

    const similarState =
      useState([]);

    const similar =
      similarState[0];

    const setSimilar =
      similarState[1];

    const relatedState =
      useState([]);

    const related =
      relatedState[0];

    const setRelated =
      relatedState[1];

    const loadingState =
      useState(true);

    const loading =
      loadingState[0];

    const setLoading =
      loadingState[1];

    const loadRelations =
      function () {
        if (!tagId) {
          return;
        }

        setLoading(true);

        runPluginOperation(
          'list_relations',
          {
            tag_id: tagId
          }
        )
          .then(function (data) {
            const normalized =
              normalizeRelationData(
                data
              );

            setSimilar(
              normalized.similar
            );

            setRelated(
              normalized.related
            );
          })
          .catch(function (error) {
            logError(
              'Failed to load inline relations:',
              error
            );

            setSimilar([]);
            setRelated([]);
          })
          .finally(function () {
            setLoading(false);
          });
      };

    useEffect(
      function () {
        loadRelations();
      },
      [tagId]
    );

    if (loading) {
      return createElement(
        'span',
        {
          className:
            'tag-relations-inline-status'
        },
        'Загрузка...'
      );
    }

    const renderTag =
      function (
        tag,
        relationType
      ) {
        return createElement(
          'span',
          {
            key:
              relationType +
              '-' +
              tag.id,

            className:
              'tag-item tag-link badge badge-secondary tag-relations-inline-tag ' +
              relationType
          },

          createElement(
            'a',
            {
              href:
                getTagUrl(
                  tag.id
                )
            },

            createElement(
              'div',
              null,
              tag.name
            )
          )
        );
      };

    const hasSimilar =
      similar.length > 0;

    const hasRelated =
      related.length > 0;

    if (
      !hasSimilar &&
      !hasRelated
    ) {
      return createElement(
        'span',
        {
          className:
            'tag-relations-inline-empty'
        },
        'Нет связанных тегов'
      );
    }

    return createElement(
      'div',
      {
        className:
          'tag-relations-inline-content'
      },

      hasSimilar &&
        createElement(
          'div',
          {
            className:
              'tag-relations-inline-group'
          },

          createElement(
            'span',
            {
              className:
                'tag-relations-inline-label'
            },
            'Похожие:'
          ),

          similar.map(
            function (tag) {
              return renderTag(
                tag,
                'similar'
              );
            }
          )
        ),

      hasRelated &&
        createElement(
          'div',
          {
            className:
              'tag-relations-inline-group'
          },

          createElement(
            'span',
            {
              className:
                'tag-relations-inline-label'
            },
            'Связанные:'
          ),

          related.map(
            function (tag) {
              return renderTag(
                tag,
                'related'
              );
            }
          )
        )
    );
  }

  /*
   * ============================================================
   * Management panel
   * ============================================================
   */

  function RelatedTagsPanel(
    props
  ) {
    const tagId =
      props.tagId;

    const numericTagId =
      tagId
        ? parseInt(tagId, 10)
        : null;

    const similarState =
      useState([]);

    const similar =
      similarState[0];

    const setSimilar =
      similarState[1];

    const relatedState =
      useState([]);

    const related =
      relatedState[0];

    const setRelated =
      relatedState[1];

    const loadingState =
      useState(false);

    const loading =
      loadingState[0];

    const setLoading =
      loadingState[1];

    const showModalState =
      useState(false);

    const showAddModal =
      showModalState[0];

    const setShowAddModal =
      showModalState[1];

    const modalTypeState =
      useState('similar');

    const modalType =
      modalTypeState[0];

    const setModalType =
      modalTypeState[1];

    const loadRelations =
      function () {
        if (!numericTagId) {
          return Promise.resolve();
        }

        setLoading(true);

        return runPluginOperation(
          'list_relations',
          {
            tag_id:
              numericTagId
          }
        )
          .then(function (data) {
            const normalized =
              normalizeRelationData(
                data
              );

            log(
              'Loaded relations:',
              normalized
            );

            setSimilar(
              normalized.similar
            );

            setRelated(
              normalized.related
            );

            return normalized;
          })
          .catch(function (error) {
            logError(
              'Failed to load relations:',
              error
            );

            throw error;
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
          return Promise.reject(
            new Error(
              'Invalid source tag ID'
            )
          );
        }

        log(
          'CREATE RELATION',
          {
            tag_a_id:
              numericTagId,

            tag_b_id:
              targetTagId,

            relation_type:
              type
          }
        );

        return runPluginOperation(
          'create_relation',
          {
            tag_a_id:
              numericTagId,

            tag_b_id:
              targetTagId,

            relation_type:
              type
          }
        )
          .then(function (result) {
            log(
              'CREATE RELATION SUCCESS:',
              result
            );

            return loadRelations();
          })
          .then(function () {
            setShowAddModal(
              false
            );

            /*
             * Also refresh the inline
             * block immediately.
             */
            refreshInlineRelations();
          })
          .catch(function (error) {
            logError(
              'CREATE RELATION FAILED:',
              error
            );

            window.alert(
              'Failed to add relation:\n\n' +
                error.message
            );

            throw error;
          });
      };

    const handleDelete =
      function (
        deletedTagId,
        type
      ) {
        if (
          type ===
          'similar'
        ) {
          setSimilar(
            function (previous) {
              return previous.filter(
                function (tag) {
                  return (
                    String(tag.id) !==
                    String(
                      deletedTagId
                    )
                  );
                }
              );
            }
          );
        } else {
          setRelated(
            function (previous) {
              return previous.filter(
                function (tag) {
                  return (
                    String(tag.id) !==
                    String(
                      deletedTagId
                    )
                  );
                }
              );
            }
          );
        }

        refreshInlineRelations();
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
                'btn btn-secondary',
              onClick:
                function () {
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

              similar.map(
                function (tag) {
                  return createElement(
                    RelationRow,
                    {
                      key:
                        tag.id,

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
                'btn btn-secondary',
              onClick:
                function () {
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

              related.map(
                function (tag) {
                  return createElement(
                    RelationRow,
                    {
                      key:
                        tag.id,

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
   * Inline refresh
   *
   * Re-mount the inline component after
   * a relation is created/deleted.
   * ============================================================
   */

  function refreshInlineRelations() {
    const mount =
      document.querySelector(
        '.' +
          INLINE_MOUNT_CLASS
      );

    if (!mount) {
      return;
    }

    const tagId =
      mount.getAttribute(
        'data-tag-id'
      );

    if (!tagId) {
      return;
    }

    unmountReact(mount);

    try {
      mountReact(
        mount,
        createElement(
          RelatedTagsInline,
          {
            tagId:
              String(tagId)
          }
        )
      );
    } catch (error) {
      logError(
        'Failed to refresh inline relations:',
        error
      );
    }
  }

  /*
   * ============================================================
   * Standalone page
   * ============================================================
   */

  function TagRelationsPage() {
    const relationsState =
      useState([]);

    const relations =
      relationsState[0];

    const setRelations =
      relationsState[1];

    const filteredState =
      useState([]);

    const filteredRelations =
      filteredState[0];

    const setFilteredRelations =
      filteredState[1];

    const searchState =
      useState('');

    const search =
      searchState[0];

    const setSearch =
      searchState[1];

    const filterState =
      useState('all');

    const filter =
      filterState[0];

    const setFilter =
      filterState[1];

    const loadingState =
      useState(false);

    const loading =
      loadingState[0];

    const setLoading =
      loadingState[1];

    const statsState =
      useState({
        total_relations: 0,
        similar_count: 0,
        related_count: 0,
        tags_with_relations: 0
      });

    const stats =
      statsState[0];

    const setStats =
      statsState[1];

    const exportState =
      useState(false);

    const showExport =
      exportState[0];

    const setShowExport =
      exportState[1];

    const exportDataState =
      useState('');

    const exportData =
      exportDataState[0];

    const setExportData =
      exportDataState[1];

    const applyFilters =
      function (rels) {
        let filtered =
          rels;

        if (
          filter !==
          'all'
        ) {
          filtered =
            filtered.filter(
              function (relation) {
                return (
                  relation.type ===
                  filter
                );
              }
            );
        }

        if (
          search.trim()
        ) {
          const term =
            search
              .toLowerCase();

          filtered =
            filtered.filter(
              function (relation) {
                return (
                  relation.tag_a.name
                    .toLowerCase()
                    .includes(term) ||
                  relation.tag_b.name
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

    const loadAll =
      function () {
        setLoading(true);

        Promise.all([
          runPluginOperation(
            'export_relations'
          ),

          runPluginOperation(
            'get_stats'
          )
        ])
          .then(
            function (result) {
              const relsResult =
                result[0];

              const statsResult =
                result[1];

              if (
                relsResult &&
                relsResult.relations
              ) {
                const rels =
                  relsResult.relations.map(
                    function (relation) {
                      return {
                        tag_a: {
                          id:
                            relation.tag_a_id,
                          name: ''
                        },

                        tag_b: {
                          id:
                            relation.tag_b_id,
                          name: ''
                        },

                        type:
                          relation.relation_type
                      };
                    }
                  );

                setRelations(
                  rels
                );
              }

              if (
                statsResult
              ) {
                setStats(
                  statsResult
                );
              }
            }
          )
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

    useEffect(
      function () {
        loadAll();
      },
      []
    );

    useEffect(
      function () {
        applyFilters(
          relations
        );
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

    const handleImport =
      function (file) {
        const reader =
          new FileReader();

        reader.onload =
          function (event) {
            try {
              const data =
                JSON.parse(
                  event.target.result
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
                .then(function (
                  result
                ) {
                  window.alert(
                    'Imported ' +
                      result.imported_count +
                      ' relations'
                  );

                  loadAll();
                })
                .catch(function (
                  error
                ) {
                  logError(
                    'Import failed:',
                    error
                  );

                  window.alert(
                    'Import failed:\n' +
                      error.message
                  );
                });
            } catch (error) {
              logError(
                'Import failed:',
                error
              );

              window.alert(
                'Import failed:\n' +
                  error.message
              );
            }
          };

        reader.readAsText(file);
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
                    function (result) {
                      window.alert(
                        'Removed ' +
                          result.removed_count +
                          ' broken relations'
                      );

                      loadAll();
                    }
                  )
                  .catch(
                    function (error) {
                      logError(
                        'Failed to remove broken relations:',
                        error
                      );
                    }
                  );
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

              onChange:
                function (event) {
                  const file =
                    event.target.files &&
                    event.target.files[0];

                  if (file) {
                    handleImport(
                      file
                    );
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

            onChange:
              function (event) {
                setSearch(
                  event.target.value
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

            onChange:
              function (event) {
                setFilter(
                  event.target.value
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
        : filteredRelations.length ===
          0
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
              function (
                relation,
                index
              ) {
                return createElement(
                  'div',
                  {
                    key: index,

                    className:
                      'tag-relations-card ' +
                      relation.type
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
                      relation
                        .tag_a
                        .name ||
                        'Tag #' +
                          relation
                            .tag_a
                            .id
                    ),

                    createElement(
                      'span',
                      {
                        className:
                          'tag-relations-arrow ' +
                          relation.type
                      },
                      relation.type ===
                        'similar'
                        ? '≈'
                        : '∼'
                    ),

                    createElement(
                      'span',
                      {
                        className:
                          'tag-relations-tag-name'
                      },
                      relation
                        .tag_b
                        .name ||
                        'Tag #' +
                          relation
                            .tag_b
                            .id
                    )
                  ),

                  createElement(
                    'span',
                    {
                      className:
                        'tag-relations-type-badge ' +
                        relation.type
                    },
                    relation.type
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
                'tag-relations-modal tag-relations-modal-large',

              onClick:
                function (event) {
                  event.stopPropagation();
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
                    'btn btn-secondary',

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

                  onClick:
                    function (event) {
                      event.target.select();
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
   * Standalone route
   * ============================================================
   */

  PluginApi.register.route(
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
   * There are two independent integrations:
   *
   * 1. Inline relations:
   *
   *    Parent Tags
   *    Child Tags
   *    Related Tags
   *
   * 2. Management button:
   *
   *    Tag Relations
   *
   * The actual React trees are mounted outside Stash's
   * React tree wherever possible.
   */

  const EDIT_CONTROLS_SELECTOR =
    '#tag-page .details-edit';

  let observer = null;

  /*
   * ============================================================
   * Inline relations
   * ============================================================
   */

  function installInlineRelations(
    tagId
  ) {
    if (!tagId) {
      return;
    }

    const detailGroup =
      document.querySelector(
        '#tag-page .detail-group'
      );

    if (!detailGroup) {
      return;
    }

    /*
     * Already installed.
     */
    const existing =
      detailGroup.querySelector(
        '.' +
          INLINE_MOUNT_CLASS
      );

    if (existing) {
      return;
    }

    /*
     * Prefer inserting after child/sub-tags.
     */
    const subTags =
      detailGroup.querySelector(
        '.detail-item.sub_tags'
      );

    const parentTags =
      detailGroup.querySelector(
        '.detail-item.parent_tags'
      );

    const detailItem =
      document.createElement(
        'div'
      );

    detailItem.className =
      'detail-item tag-relations-inline-item';

    const title =
      document.createElement(
        'span'
      );

    title.className =
      'detail-item-title tag-relations-inline-title';

    title.textContent =
      'Связанные теги:';

    const value =
      document.createElement(
        'span'
      );

    value.className =
      'detail-item-value tag-relations-inline-value';

    const mount =
      document.createElement(
        'span'
      );

    mount.className =
      INLINE_MOUNT_CLASS;

    mount.setAttribute(
      'data-tag-id',
      String(tagId)
    );

    value.appendChild(
      mount
    );

    detailItem.appendChild(
      title
    );

    detailItem.appendChild(
      value
    );

    /*
     * Insert after sub-tags.
     */
    if (
      subTags &&
      subTags.parentElement ===
        detailGroup
    ) {
      subTags.insertAdjacentElement(
        'afterend',
        detailItem
      );
    } else if (
      parentTags &&
      parentTags.parentElement ===
        detailGroup
    ) {
      parentTags.insertAdjacentElement(
        'afterend',
        detailItem
      );
    } else {
      detailGroup.appendChild(
        detailItem
      );
    }

    try {
      mountReact(
        mount,
        createElement(
          RelatedTagsInline,
          {
            tagId:
              String(tagId)
          }
        )
      );

      log(
        'Inline related tags mounted',
        'tagId=' + tagId
      );
    } catch (error) {
      logError(
        'Failed to mount inline relations:',
        error
      );
    }
  }

  /*
   * ============================================================
   * Management panel
   * ============================================================
   */

  function findManagerMount() {
    return document.querySelector(
      '.' +
        MANAGER_MOUNT_CLASS
    );
  }

  function closeManagerPanel(
    button
  ) {
    const mount =
      findManagerMount();

    if (mount) {
      unmountReact(mount);
      mount.remove();
    }

    if (button) {
      button.textContent =
        'Tag Relations';
    }

    log(
      'Tag Relations management panel hidden'
    );
  }

  function openManagerPanel(
    controls,
    tagId,
    button
  ) {
    /*
     * Do not allow duplicate mounts.
     */
    const existing =
      findManagerMount();

    if (existing) {
      return;
    }

    const mount =
      document.createElement(
        'div'
      );

    mount.className =
      MANAGER_MOUNT_CLASS;

    mount.setAttribute(
      'data-tag-id',
      String(tagId)
    );

    /*
     * Put the manager below the native
     * Stash edit controls.
     */
    controls.insertAdjacentElement(
      'afterend',
      mount
    );

    try {
      mountReact(
        mount,
        createElement(
          RelatedTagsPanel,
          {
            tagId:
              String(tagId)
          }
        )
      );

      button.textContent =
        'Hide Tag Relations';

      log(
        'Tag Relations management panel opened',
        'tagId=' + tagId
      );
    } catch (error) {
      logError(
        'Failed to mount management panel:',
        error
      );

      mount.remove();

      button.textContent =
        'Tag Relations';

      window.alert(
        'Failed to open Tag Relations:\n' +
          error.message
      );
    }
  }

  function installRelationsButton(
    controls,
    tagId
  ) {
    if (
      !controls ||
      !tagId
    ) {
      return;
    }

    const existing =
      controls.querySelector(
        '.' +
          RELATIONS_BUTTON_CLASS
      );

    if (existing) {
      return;
    }

    const button =
      document.createElement(
        'button'
      );

    /*
     * Use Stash's own Bootstrap styles.
     * No generic .btn CSS is required.
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
        const existingMount =
          findManagerMount();

        if (existingMount) {
          closeManagerPanel(
            button
          );

          return;
        }

        openManagerPanel(
          controls,
          tagId,
          button
        );
      }
    );

    controls.appendChild(
      button
    );

    log(
      'Tag Relations button added',
      'tagId=' + tagId
    );
  }

  /*
   * ============================================================
   * Remove stale manager
   * ============================================================
   */

  function cleanupStaleManager() {
    const mount =
      findManagerMount();

    if (!mount) {
      return;
    }

    /*
     * Stash may have replaced the entire
     * tag page. The mount is now detached.
     */
    if (!mount.isConnected) {
      unmountReact(mount);
      return;
    }

    const tagId =
      getCurrentTagId();

    const mountTagId =
      mount.getAttribute(
        'data-tag-id'
      );

    if (
      tagId &&
      mountTagId &&
      String(tagId) !==
        String(mountTagId)
    ) {
      unmountReact(mount);
      mount.remove();
    }
  }

  /*
   * ============================================================
   * Main scan
   * ============================================================
   */

  function scanTagPage() {
    const tagId =
      getCurrentTagId();

    if (!tagId) {
      return;
    }

    /*
     * Always try to install the inline
     * relations block.
     */
    installInlineRelations(
      tagId
    );

    /*
     * Install management button only
     * when the native edit controls exist.
     */
    const controls =
      document.querySelector(
        EDIT_CONTROLS_SELECTOR
      );

    if (controls) {
      installRelationsButton(
        controls,
        tagId
      );
    }

    cleanupStaleManager();
  }

  /*
   * ============================================================
   * Mutation observer
   * ============================================================
   */

  let scanScheduled =
    false;

  function scheduleScan() {
    if (scanScheduled) {
      return;
    }

    scanScheduled = true;

    requestAnimationFrame(
      function () {
        scanScheduled = false;

        try {
          scanTagPage();
        } catch (error) {
          logError(
            'Tag page scan failed:',
            error
          );
        }
      }
    );
  }

  function startTagPageObserver() {
    if (observer) {
      observer.disconnect();
    }

    observer =
      new MutationObserver(
        function () {
          scheduleScan();
        }
      );

    observer.observe(
      document.body,
      {
        childList: true,
        subtree: true
      }
    );

    scheduleScan();

    log(
      'Tag page DOM observer started'
    );
  }

  /*
   * ============================================================
   * Start
   * ============================================================
   */

  startTagPageObserver();

  log('loaded');
})();