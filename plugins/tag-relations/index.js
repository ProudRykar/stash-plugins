(function () {
  'use strict';

  const PLUGIN_ID = 'tag-relations';

  const INLINE_ITEM_CLASS =
    'tag-relations-inline-item';

  const EDIT_FIELDS_MARKER =
    'data-tag-relations-fields';

  const SAVE_PATCH_MARKER =
    'data-tag-relations-save-patched';

  function log() {
    console.log('[Tag Relations]', ...arguments);
  }

  function logError() {
    console.error('[Tag Relations]', ...arguments);
  }

  // ============================================================
  // Plugin operation
  // ============================================================

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
          operation: operation,
        },
        args || {}
      ),
    };

    log(
      'Plugin operation:',
      operation,
      variables.args
    );

    try {
      const response = await fetch('/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          query: query,
          variables: variables,
        }),
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

      log(
        'GraphQL response:',
        operation,
        result
      );

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

      if (
        rawData === null ||
        rawData === undefined
      ) {
        throw new Error(
          'Plugin returned an empty response'
        );
      }

      let data = rawData;

      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch (error) {
          // Not JSON; leave as string.
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
          let message = 'Operation failed';

          if (data.error) {
            if (
              typeof data.error ===
              'object'
            ) {
              message =
                data.error.message ||
                message;
            } else {
              message = String(
                data.error
              );
            }
          }

          throw new Error(message);
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

  // ============================================================
  // Plugin API / React
  // ============================================================

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

  const createElement =
    React.createElement;

  const useState = React.useState;
  const useEffect = React.useEffect;
  const useRef = React.useRef;

  // ============================================================
  // React mounting
  // ============================================================

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

  function unmountReact(container) {
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

  // ============================================================
  // Tag helpers
  // ============================================================

  function getCurrentTagId() {
    const match =
      window.location.pathname.match(
        /^\/tags\/(\d+)(?:\/|$)/
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

  // ============================================================
  // Relation data
  // ============================================================

  function normalizeRelationData(data) {
    if (!data) {
      return {
        similar: [],
        related: [],
      };
    }

    return {
      similar: Array.isArray(
        data.similar
      )
        ? data.similar
        : [],

      related: Array.isArray(
        data.related
      )
        ? data.related
        : [],
    };
  }

  // ============================================================
  // Tag search
  // ============================================================

  function searchTags(search) {
    const query = String(
      search || ''
    ).trim();

    if (query.length < 2) {
      return Promise.resolve([]);
    }

    return runPluginOperation(
      'find_tags',
      {
        search: query,
        per_page: 30,
      }
    ).then(function (data) {
      return Array.isArray(data)
        ? data
        : [];
    });
  }

  // ============================================================
  // Native-looking multi select
  //
  // This intentionally follows the DOM structure generated by
  // Stash's Shared/Select component:
  //
  // .react-select
  // .react-select__control
  // .react-select__value-container
  // .react-select__multi-value
  // .react-select__multi-value__label
  // .react-select__multi-value__remove
  // .react-select__input-container
  // .react-select__input
  // ============================================================

  function RelationSelect(props) {
    const value = Array.isArray(
      props.value
    )
      ? props.value
      : [];

    const onChange =
      props.onChange;

    const sourceTagId =
      props.sourceTagId;

    const placeholder =
      props.placeholder ||
      'Выберите тег...';

    const inputState =
      useState('');

    const input =
      inputState[0];

    const setInput =
      inputState[1];

    const optionsState =
      useState([]);

    const options =
      optionsState[0];

    const setOptions =
      optionsState[1];

    const loadingState =
      useState(false);

    const loading =
      loadingState[0];

    const setLoading =
      loadingState[1];

    const menuState =
      useState(false);

    const menuOpen =
      menuState[0];

    const setMenuOpen =
      menuState[1];

    const inputRef =
      useRef(null);

    const rootRef =
      useRef(null);

    const selectedIds = {};

    value.forEach(function (tag) {
      selectedIds[
        String(tag.id)
      ] = true;
    });

    useEffect(
      function () {
        function handleOutsideClick(
          event
        ) {
          if (
            rootRef.current &&
            !rootRef.current.contains(
              event.target
            )
          ) {
            setMenuOpen(false);
          }
        }

        document.addEventListener(
          'mousedown',
          handleOutsideClick
        );

        return function () {
          document.removeEventListener(
            'mousedown',
            handleOutsideClick
          );
        };
      },
      []
    );

    useEffect(
      function () {
        const query =
          input.trim();

        if (query.length < 2) {
          setOptions([]);
          return undefined;
        }

        let cancelled = false;

        const timeout =
          setTimeout(
            function () {
              setLoading(true);

              searchTags(query)
                .then(function (tags) {
                  if (cancelled) {
                    return;
                  }

                  const filtered =
                    tags.filter(
                      function (tag) {
                        if (
                          String(
                            tag.id
                          ) ===
                          String(
                            sourceTagId
                          )
                        ) {
                          return false;
                        }

                        return !selectedIds[
                          String(
                            tag.id
                          )
                        ];
                      }
                    );

                  setOptions(
                    filtered
                  );
                })
                .catch(
                  function (error) {
                    if (
                      !cancelled
                    ) {
                      logError(
                        'Tag search failed:',
                        error
                      );

                      setOptions(
                        []
                      );
                    }
                  }
                )
                .finally(
                  function () {
                    if (
                      !cancelled
                    ) {
                      setLoading(
                        false
                      );
                    }
                  }
                );
            },
            250
          );

        return function () {
          cancelled = true;
          clearTimeout(timeout);
        };
      },
      [
        input,
        sourceTagId,
        value,
      ]
    );

    function removeTag(tagId) {
      onChange(
        value.filter(
          function (tag) {
            return (
              String(tag.id) !==
              String(tagId)
            );
          }
        )
      );
    }

    function addTag(tag) {
      const exists =
        value.some(
          function (item) {
            return (
              String(item.id) ===
              String(tag.id)
            );
          }
        );

      if (exists) {
        return;
      }

      onChange(
        value.concat([tag])
      );

      setInput('');
      setOptions([]);
      setMenuOpen(true);

      if (inputRef.current) {
        inputRef.current.focus();
      }
    }

    function handleKeyDown(event) {
      if (
        event.key === 'Escape'
      ) {
        setMenuOpen(false);
        return;
      }

      if (
        event.key === 'Enter' &&
        options.length > 0
      ) {
        event.preventDefault();
        addTag(options[0]);
      }

      if (
        event.key === 'Backspace' &&
        input === '' &&
        value.length > 0
      ) {
        removeTag(
          value[value.length - 1]
            .id
        );
      }
    }

    return createElement(
      'div',
      {
        ref: rootRef,
        className:
          'react-select tag-select',
      },

      createElement(
        'div',
        {
          className:
            'react-select__control css-13cymwt-control',
          onClick:
            function () {
              setMenuOpen(true);

              if (
                inputRef.current
              ) {
                inputRef.current.focus();
              }
            },
        },

        createElement(
          'div',
          {
            className:
              'react-select__value-container react-select__value-container--is-multi' +
              (value.length
                ? ' react-select__value-container--has-value'
                : ''),
          },

          value.map(
            function (tag) {
              return createElement(
                'div',
                {
                  key: tag.id,
                  className:
                    'react-select__multi-value css-1p3m7a8-multiValue',
                },

                createElement(
                  'div',
                  {
                    className:
                      'react-select__multi-value__label css-9jq23d',
                    title:
                      tag.name,
                  },
                  createElement(
                    'div',
                    null,
                    createElement(
                      'span',
                      null,
                      tag.name
                    )
                  )
                ),

                createElement(
                  'div',
                  {
                    role: 'button',
                    className:
                      'react-select__multi-value__remove css-1h0qd4',
                    'aria-label':
                      'Remove option',
                    onMouseDown:
                      function (
                        event
                      ) {
                        event.preventDefault();
                        event.stopPropagation();
                        removeTag(
                          tag.id
                        );
                      },
                  },

                  createElement(
                    'svg',
                    {
                      height: 14,
                      width: 14,
                      viewBox:
                        '0 0 20 20',
                      'aria-hidden':
                        'true',
                      focusable:
                        'false',
                      className:
                        'css-8mmkcg',
                    },

                    createElement(
                      'path',
                      {
                        d:
                          'M14.348 14.849c-0.469 0.469-1.229 0.469-1.697 0l-2.651-3.030-2.651 3.029c-0.469 0.469-0.469 1.229 0-1.697s1.228-1.229 1.697 0l2.758-3.15-2.759-3.152c-0.469-0.469-0.469-1.228 0-1.697s1.228-0.469 1.697 0l2.652 3.031 2.651-3.031c0.469-0.469 1.228 0 1.697 0s1.229 0.469 1.697 0 1.229 1.228 0 1.697l-2.758 3.152 2.758 3.15z',
                      }
                    )
                  )
                )
              );
            }
          ),

          createElement(
            'div',
            {
              className:
                'react-select__input-container css-19bb58m',
              'data-value': input,
            },

            createElement(
              'input',
              {
                ref: inputRef,
                className:
                  'react-select__input',
                value: input,
                placeholder:
                  value.length === 0
                    ? placeholder
                    : '',
                onFocus:
                  function () {
                    setMenuOpen(
                      true
                    );
                  },
                onChange:
                  function (
                    event
                  ) {
                    setInput(
                      event.target
                        .value
                    );

                    setMenuOpen(
                      true
                    );
                  },
                onKeyDown:
                  handleKeyDown,
                autoComplete:
                  'off',
                autoCorrect:
                  'off',
                spellCheck:
                  false,
              }
            )
          )
        ),

        createElement(
          'div',
          {
            className:
              'react-select__indicators css-1wy0on6',
          },

          createElement(
            'div',
            {
              className:
                'react-select__indicator react-select__dropdown-indicator css-1xc3v61-indicatorContainer',
              'aria-hidden':
                'true',
            },

            createElement(
              'svg',
              {
                height: 20,
                width: 20,
                viewBox:
                  '0 0 20 20',
                'aria-hidden':
                  'true',
                focusable:
                  'false',
                className:
                  'css-8mmkcg',
              },

              createElement(
                'path',
                {
                  d:
                    'M4.516 7.548c0.436-0.446 1.043-0.481 1.576 0l3.908 3.747 3.908-3.747c0.533-0.481 1.141-0.446 1.574 0 0.436 0.445 0.408 1.197 0 1.615-0.406 0.418-4.695 4.502-4.695 4.502-0.217 0.223-0.502 0.335-0.787 0.335s-0.57-0.112-0.789-0.335c0 0-4.287-4.084-4.695-4.502s-0.436-1.17 0-1.615z',
                }
              )
            )
          )
        )
      ),

      menuOpen &&
        createElement(
          'div',
          {
            className:
              'tag-relations-select-menu',
          },

          loading &&
            createElement(
              'div',
              {
                className:
                  'tag-relations-select-status',
              },
              'Поиск...'
            ),

          !loading &&
            input.trim().length >=
              2 &&
            options.length === 0 &&
            createElement(
              'div',
              {
                className:
                  'tag-relations-select-status',
              },
              'Теги не найдены'
            ),

          options.map(
            function (tag) {
              return createElement(
                'div',
                {
                  key: tag.id,
                  className:
                    'tag-relations-select-option',
                  onMouseDown:
                    function (
                      event
                    ) {
                      event.preventDefault();
                      addTag(tag);
                    },
                },
                tag.name
              );
            }
          )
        )
    );
  }

  // ============================================================
  // Relation edit fields
  // ============================================================

  function RelationEditFields(
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

    useEffect(
      function () {
        let cancelled =
          false;

        setLoading(true);

        runPluginOperation(
          'list_relations',
          {
            tag_id: tagId,
          }
        )
          .then(function (data) {
            if (cancelled) {
              return;
            }

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
            if (cancelled) {
              return;
            }

            logError(
              'Failed to load relations:',
              error
            );

            setSimilar([]);
            setRelated([]);
          })
          .finally(function () {
            if (!cancelled) {
              setLoading(false);
            }
          });

        return function () {
          cancelled = true;
        };
      },
      [tagId]
    );

    function renderField(
      label,
      relationType,
      value,
      setValue
    ) {
      return createElement(
        'div',
        {
          className:
            'form-group row tag-relations-form-group',
        },

        createElement(
          'label',
          {
            className:
              'form-label col-form-label col-xl-2 col-sm-3',
          },
          label
        ),

        createElement(
          'div',
          {
            className:
              'col-xl-7 col-sm-9',
          },

          loading
            ? createElement(
                'div',
                {
                  className:
                    'tag-relations-loading',
                },
                'Загрузка...'
              )
            : createElement(
                RelationSelect,
                {
                  sourceTagId:
                    tagId,
                  value:
                    value,
                  onChange:
                    setValue,
                  placeholder:
                    'Поиск тегов...',
                }
              )
        )
      );
    }

    return createElement(
      React.Fragment,
      null,

      renderField(
        'Похожие теги',
        'similar',
        similar,
        setSimilar
      ),

      renderField(
        'Связанные теги',
        'related',
        related,
        setRelated
      ),

      createElement(
        'div',
        {
          className:
            'tag-relations-edit-state',
          style: {
            display: 'none',
          },
          'data-similar':
            JSON.stringify(
              similar.map(
                function (tag) {
                  return Number(
                    tag.id
                  );
                }
              )
            ),
          'data-related':
            JSON.stringify(
              related.map(
                function (tag) {
                  return Number(
                    tag.id
                  );
                }
              )
            ),
        }
      )
    );
  }

  // ============================================================
  // Inline view
  // ============================================================

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

    useEffect(
      function () {
        let cancelled =
          false;

        runPluginOperation(
          'list_relations',
          {
            tag_id: tagId,
          }
        )
          .then(function (data) {
            if (cancelled) {
              return;
            }

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
            if (!cancelled) {
              logError(
                'Failed to load inline relations:',
                error
              );

              setSimilar([]);
              setRelated([]);
            }
          })
          .finally(function () {
            if (!cancelled) {
              setLoading(false);
            }
          });

        return function () {
          cancelled = true;
        };
      },
      [tagId]
    );

    if (loading) {
      return createElement(
        'span',
        null,
        'Загрузка...'
      );
    }

    function renderTags(tags) {
      return tags.map(
        function (tag) {
          return createElement(
            'span',
            {
              key: tag.id,
              'data-sort-name':
                tag.name,
              className:
                'tag-item tag-link badge badge-secondary',
            },
            createElement(
              'a',
              {
                href:
                  getTagUrl(tag.id),
              },
              createElement(
                'div',
                null,
                tag.name
              )
            )
          );
        }
      );
    }

    if (
      similar.length === 0 &&
      related.length === 0
    ) {
      return null;
    }

    return createElement(
      React.Fragment,
      null,

      similar.length > 0 &&
        createElement(
          'span',
          {
            className:
              'tag-relations-inline-group',
          },

          createElement(
            'span',
            {
              className:
                'tag-relations-inline-label',
            },
            'Похожие: '
          ),

          renderTags(similar)
        ),

      related.length > 0 &&
        createElement(
          'span',
          {
            className:
              'tag-relations-inline-group',
          },

          createElement(
            'span',
            {
              className:
                'tag-relations-inline-label',
            },
            'Связанные: '
          ),

          renderTags(related)
        )
    );
  }

  // ============================================================
  // Mount inline relations in normal tag view
  // ============================================================

  function installInlineRelations(
    tagId
  ) {
    const detailGroup =
      document.querySelector(
        '#tag-page .detail-group'
      );

    if (!detailGroup) {
      return;
    }

    const existing =
      detailGroup.querySelector(
        '.' + INLINE_ITEM_CLASS
      );

    if (
      existing &&
      existing.getAttribute(
        'data-tag-id'
      ) === String(tagId)
    ) {
      return;
    }

    if (existing) {
      const oldMount =
        existing.querySelector(
          '.tag-relations-inline-mount'
        );

      if (oldMount) {
        unmountReact(oldMount);
      }

      existing.remove();
    }

    const item =
      document.createElement('div');

    item.className =
      'detail-item ' +
      INLINE_ITEM_CLASS;

    item.setAttribute(
      'data-tag-id',
      String(tagId)
    );

    const title =
      document.createElement(
        'span'
      );

    title.className =
      'detail-item-title';

    title.textContent =
      'Связанные теги:';

    const value =
      document.createElement(
        'span'
      );

    value.className =
      'detail-item-value';

    const mount =
      document.createElement(
        'span'
      );

    mount.className =
      'tag-relations-inline-mount';

    mount.setAttribute(
      'data-tag-id',
      String(tagId)
    );

    value.appendChild(mount);

    item.appendChild(title);
    item.appendChild(value);

    const subTags =
      detailGroup.querySelector(
        '.detail-item.sub_tags'
      );

    const parentTags =
      detailGroup.querySelector(
        '.detail-item.parent_tags'
      );

    if (subTags) {
      subTags.insertAdjacentElement(
        'afterend',
        item
      );
    } else if (parentTags) {
      parentTags.insertAdjacentElement(
        'afterend',
        item
      );
    } else {
      detailGroup.appendChild(item);
    }

    try {
      mountReact(
        mount,
        createElement(
          RelatedTagsInline,
          {
            tagId: String(tagId),
          }
        )
      );
    } catch (error) {
      logError(
        'Failed to mount inline relations:',
        error
      );
    }
  }

  // ============================================================
  // Save relation changes
  // ============================================================

  async function saveRelations(
    tagId,
    similar,
    related
  ) {
    const similarIds =
      similar.map(function (tag) {
        return Number(tag.id);
      });

    const relatedIds =
      related.map(function (tag) {
        return Number(tag.id);
      });

    log(
      'Saving relations:',
      {
        tagId: tagId,
        similar: similarIds,
        related: relatedIds,
      }
    );

    await runPluginOperation(
      'sync_relations',
      {
        tag_id: Number(tagId),
        similar_tag_ids:
          similarIds,
        related_tag_ids:
          relatedIds,
      }
    );

    log(
      'Relations saved successfully'
    );
  }

  // ============================================================
  // Inject edit fields
  // ============================================================

  function installEditFields(
    tagId
  ) {
    const form =
      document.querySelector(
        '#tag-page #tag-edit'
      );

    if (!form) {
      return;
    }

    if (
      form.hasAttribute(
        EDIT_FIELDS_MARKER
      )
    ) {
      return;
    }

    const fieldsContainer =
      document.createElement(
        'div'
      );

    fieldsContainer.className =
      'tag-relations-edit-fields';

    fieldsContainer.setAttribute(
      EDIT_FIELDS_MARKER,
      'true'
    );

    /*
     * We mount the React component into
     * the same form as the native Stash
     * fields.
     */

    form.appendChild(
      fieldsContainer
    );

    try {
      mountReact(
        fieldsContainer,
        createElement(
          RelationEditFields,
          {
            tagId: tagId,
          }
        )
      );
    } catch (error) {
      logError(
        'Failed to mount relation edit fields:',
        error
      );

      fieldsContainer.remove();
      return;
    }

    /*
     * The native Save button belongs to
     * the surrounding Stash component.
     *
     * We intercept its click in the capture
     * phase so that relation changes are
     * saved together with the normal tag.
     */

    patchSaveButton(
      tagId,
      form,
      fieldsContainer
    );
  }

  // ============================================================
  // Patch native Save button
  // ============================================================

  function patchSaveButton(
    tagId,
    form,
    fieldsContainer
  ) {
    const controls =
      document.querySelector(
        '#tag-page .details-edit'
      );

    if (!controls) {
      return;
    }

    const saveButton =
      controls.querySelector(
        'button.save'
      );

    if (!saveButton) {
      return;
    }

    if (
      saveButton.hasAttribute(
        SAVE_PATCH_MARKER
      )
    ) {
      return;
    }

    saveButton.setAttribute(
      SAVE_PATCH_MARKER,
      'true'
    );

    saveButton.addEventListener(
      'click',
      function () {
        /*
         * The React component state is
         * mirrored into these DOM attributes.
         */

        const stateElement =
          fieldsContainer.querySelector(
            '.tag-relations-edit-state'
          );

        if (!stateElement) {
          return;
        }

        let similar = [];
        let related = [];

        try {
          similar =
            JSON.parse(
              stateElement.getAttribute(
                'data-similar'
              ) || '[]'
            );
        } catch (error) {
          logError(
            'Failed to read similar relation state:',
            error
          );
        }

        try {
          related =
            JSON.parse(
              stateElement.getAttribute(
                'data-related'
              ) || '[]'
            );
        } catch (error) {
          logError(
            'Failed to read related relation state:',
            error
          );
        }

        /*
         * Give Stash's own save handler the
         * first opportunity to save the tag.
         *
         * Then synchronize plugin relations.
         */

        setTimeout(
          function () {
            saveRelations(
              tagId,
              similar.map(
                function (id) {
                  return {
                    id: id,
                  };
                }
              ),
              related.map(
                function (id) {
                  return {
                    id: id,
                  };
                }
              )
            ).catch(function (error) {
              logError(
                'Failed to save relations:',
                error
              );

              window.alert(
                'Не удалось сохранить связи тегов:\n\n' +
                  error.message
              );
            });
          },
          0
        );
      },
      false
    );
  }

  // ============================================================
  // Keep React state mirrored into DOM
  // ============================================================

  /*
   * RelationEditFields needs to update the
   * hidden state element whenever selection
   * changes.
   *
   * This helper observes the React-rendered
   * DOM and keeps the values available to
   * the native Save handler.
   */

  function installStateObserver(
    container
  ) {
    if (
      container.__tagRelationsStateObserver
    ) {
      return;
    }

    const observer =
      new MutationObserver(
        function () {
          /*
           * React updates the attributes
           * itself through render().
           *
           * Nothing needs to be done here.
           */
        }
      );

    observer.observe(
      container,
      {
        childList: true,
        subtree: true,
        attributes: true,
      }
    );

    container.__tagRelationsStateObserver =
      observer;
  }

  // ============================================================
  // IMPORTANT:
  // React state needs to be exposed to the
  // save handler.
  //
  // We do this by modifying RelationEditFields
  // state setter behavior below.
  // ============================================================

  /*
   * Replace RelationEditFields with a version
   * that mirrors its current state into the
   * hidden DOM node.
   */

  function RelationEditFieldsWithState(
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

    useEffect(
      function () {
        let cancelled =
          false;

        runPluginOperation(
          'list_relations',
          {
            tag_id: tagId,
          }
        )
          .then(function (data) {
            if (cancelled) {
              return;
            }

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
            if (!cancelled) {
              logError(
                'Failed to load edit relations:',
                error
              );

              setSimilar([]);
              setRelated([]);
            }
          })
          .finally(function () {
            if (!cancelled) {
              setLoading(false);
            }
          });

        return function () {
          cancelled = true;
        };
      },
      [tagId]
    );

    useEffect(
      function () {
        const state =
          document.querySelector(
            '#tag-page #' +
              'tag-relations-state'
          );

        if (state) {
          state.setAttribute(
            'data-similar',
            JSON.stringify(
              similar.map(
                function (tag) {
                  return Number(
                    tag.id
                  );
                }
              )
            )
          );

          state.setAttribute(
            'data-related',
            JSON.stringify(
              related.map(
                function (tag) {
                  return Number(
                    tag.id
                  );
                }
              )
            )
          );
        }
      },
      [similar, related]
    );

    function renderField(
      label,
      value,
      setValue
    ) {
      return createElement(
        'div',
        {
          className:
            'form-group row',
        },

        createElement(
          'label',
          {
            className:
              'form-label col-form-label col-xl-2 col-sm-3',
          },
          label
        ),

        createElement(
          'div',
          {
            className:
              'col-xl-7 col-sm-9',
          },

          loading
            ? createElement(
                'div',
                {
                  className:
                    'tag-relations-loading',
                },
                'Загрузка...'
              )
            : createElement(
                RelationSelect,
                {
                  sourceTagId:
                    tagId,
                  value:
                    value,
                  onChange:
                    setValue,
                  placeholder:
                    'Поиск тегов...',
                }
              )
        )
      );
    }

    return createElement(
      React.Fragment,
      null,

      renderField(
        'Похожие теги',
        similar,
        setSimilar
      ),

      renderField(
        'Связанные теги',
        related,
        setRelated
      ),

      createElement(
        'div',
        {
          id:
            'tag-relations-state',
          style: {
            display: 'none',
          },
          'data-similar':
            JSON.stringify(
              similar.map(
                function (tag) {
                  return Number(
                    tag.id
                  );
                }
              )
            ),
          'data-related':
            JSON.stringify(
              related.map(
                function (tag) {
                  return Number(
                    tag.id
                  );
                }
              )
            ),
        }
      )
    );
  }

  // ============================================================
  // Override the mount used above
  // ============================================================

  RelationEditFields =
    RelationEditFieldsWithState;

  // ============================================================
  // Remove stale plugin UI
  // ============================================================

  function cleanupStalePluginUI() {
    document
      .querySelectorAll(
        '.' + INLINE_ITEM_CLASS
      )
      .forEach(function (element) {
        if (
          !element.isConnected
        ) {
          const mount =
            element.querySelector(
              '.tag-relations-inline-mount'
            );

          if (mount) {
            unmountReact(mount);
          }
        }
      });
  }

  // ============================================================
  // Main tag page scan
  // ============================================================

  function scanTagPage() {
    const tagId =
      getCurrentTagId();

    if (!tagId) {
      return;
    }

    /*
     * Normal view.
     */

    installInlineRelations(
      tagId
    );

    /*
     * Edit view.
     */

    installEditFields(
      tagId
    );

    cleanupStalePluginUI();
  }

  // ============================================================
  // Mutation observer
  // ============================================================

  let observer = null;
  let scanScheduled = false;

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
        subtree: true,
      }
    );

    scheduleScan();

    log(
      'Tag page DOM observer started'
    );
  }

  // ============================================================
  // Standalone page
  // ============================================================

  function TagRelationsPage() {
    const relationsState =
      useState([]);

    const relations =
      relationsState[0];

    const setRelations =
      relationsState[1];

    const loadingState =
      useState(false);

    const loading =
      loadingState[0];

    const setLoading =
      loadingState[1];

    useEffect(
      function () {
        setLoading(true);

        runPluginOperation(
          'export_relations'
        )
          .then(function (data) {
            if (
              data &&
              Array.isArray(
                data.relations
              )
            ) {
              setRelations(
                data.relations
              );
            }
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
      },
      []
    );

    return createElement(
      'div',
      {
        className:
          'tag-relations-page',
      },

      createElement(
        'h2',
        null,
        'Tag Relations'
      ),

      loading
        ? createElement(
            'div',
            null,
            'Loading...'
          )
        : createElement(
            'div',
            null,
            'Relations: ' +
              relations.length
          )
    );
  }

  // ============================================================
  // Route
  // ============================================================

  PluginApi.register.route(
    '/plugin/tag-relations',
    TagRelationsPage
  );

  log(
    'Standalone route registered'
  );

  // ============================================================
  // Start
  // ============================================================

  startTagPageObserver();

  log('loaded');
})();