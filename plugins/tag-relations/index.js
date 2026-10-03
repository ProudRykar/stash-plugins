(function () {
  'use strict';

  const PLUGIN_ID = 'tag-relations';

  const INLINE_ITEM_CLASS = 'tag-relations-inline-item';
  const EDIT_FIELDS_CLASS = 'tag-relations-edit-fields';

  const EDIT_FIELDS_MARKER = 'data-tag-relations-fields';
  const SAVE_PATCH_MARKER = 'data-tag-relations-save-patched';

  const relationCache = new Map();
  const relationRequests = new Map();
  const editStates = new Map();

  let currentTagId = null;
  let editScanTimer = null;
  let routeListenerInstalled = false;

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

    log('Plugin operation:', operation, variables.args);

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

    if (result.errors) {
      throw new Error(
        result.errors
          .map(function (error) {
            return error.message;
          })
          .join(', ')
      );
    }

    let data =
      result.data &&
      result.data.runPluginOperation;

    if (data === null || data === undefined) {
      throw new Error(
        'Plugin returned an empty response'
      );
    }

    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (error) {
        // Keep original value.
      }
    }

    if (
      data &&
      typeof data === 'object' &&
      Object.prototype.hasOwnProperty.call(data, 'ok')
    ) {
      if (!data.ok) {
        let message = 'Operation failed';

        if (data.error) {
          if (typeof data.error === 'object') {
            message =
              data.error.message ||
              message;
          } else {
            message = String(data.error);
          }
        }

        throw new Error(message);
      }

      /*
       * Backend returns:
       *
       * {
       *   ok: true,
       *   error: null,
       *   output: {...}
       * }
       *
       * The actual plugin result is in `output`.
       */
      if (
        Object.prototype.hasOwnProperty.call(
          data,
          'output'
        )
      ) {
        return data.output;
      }

      /*
       * Backwards compatibility with the old
       * `{ ok: true, data: ... }` shape.
       */
      if (
        Object.prototype.hasOwnProperty.call(
          data,
          'data'
        )
      ) {
        return data.data;
      }

      return null;
    }

    return data;
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

  if (!React || !ReactDOM) {
    logError(
      'React or ReactDOM is unavailable'
    );
    return;
  }

  const createElement = React.createElement;
  const Fragment = React.Fragment;

  const useState = React.useState;
  const useEffect = React.useEffect;

  // ============================================================
  // Native Stash Tag selector
  // ============================================================

  function getNativeTagIDSelect() {
    const components = PluginApi.components;

    if (!components) {
      return null;
    }

    const component =
      components.TagIDSelect;

    if (
      typeof component !== 'function' &&
      typeof component !== 'object'
    ) {
      return null;
    }

    return component;
  }

  // ============================================================
  // React mounting
  // ============================================================

  function mountReact(container, element) {
    if (!container) {
      throw new Error(
        'React mount container is missing'
      );
    }

    if (container.__tagRelationsRoot) {
      container.__tagRelationsRoot.render(
        element
      );

      return container.__tagRelationsRoot;
    }

    if (
      typeof ReactDOM.createRoot ===
      'function'
    ) {
      const root =
        ReactDOM.createRoot(container);

      container.__tagRelationsRoot = root;

      root.render(element);

      return root;
    }

    if (
      typeof ReactDOM.render ===
      'function'
    ) {
      ReactDOM.render(
        element,
        container
      );

      container.__tagRelationsLegacy = true;

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

    if (container.__tagRelationsRoot) {
      try {
        container.__tagRelationsRoot.unmount();
      } catch (error) {
        logError(
          'Failed to unmount React root:',
          error
        );
      }

      container.__tagRelationsRoot = null;
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

      container.__tagRelationsLegacy = false;
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
    if (Array.isArray(data)) {
      return data
        .filter(function (tag) {
          return (
            tag &&
            tag.id !== undefined
          );
        })
        .map(function (tag) {
          return {
            id: Number(tag.id),
            name:
              tag.name ||
              String(tag.id),
          };
        })
        .filter(function (tag) {
          return Number.isFinite(tag.id);
        });
    }

    if (
      !data ||
      typeof data !== 'object'
    ) {
      return [];
    }

    const similar =
      Array.isArray(data.similar)
        ? data.similar
        : [];

    const related =
      Array.isArray(data.related)
        ? data.related
        : [];

    const result = [];
    const seen = new Set();

    similar
      .concat(related)
      .forEach(function (tag) {
        if (
          !tag ||
          tag.id === undefined
        ) {
          return;
        }

        const id = String(tag.id);

        if (seen.has(id)) {
          return;
        }

        seen.add(id);

        result.push({
          id: Number(tag.id),
          name:
            tag.name ||
            String(tag.id),
        });
      });

    return result.filter(function (tag) {
      return Number.isFinite(tag.id);
    });
  }

  // ============================================================
  // Relation cache
  // ============================================================

  function invalidateRelationCache(tagId) {
    if (
      tagId === undefined ||
      tagId === null
    ) {
      return;
    }

    const key = String(tagId);

    relationCache.delete(key);
    relationRequests.delete(key);
  }

  function getRelations(tagId) {
    const key = String(tagId);

    if (relationCache.has(key)) {
      return Promise.resolve(
        relationCache.get(key)
      );
    }

    if (relationRequests.has(key)) {
      return relationRequests.get(key);
    }

    const request =
      runPluginOperation(
        'list_relations',
        {
          tag_id: Number(tagId),
        }
      )
        .then(function (data) {
          const relations =
            normalizeRelationData(data);

          relationCache.set(
            key,
            relations
          );

          return relations;
        })
        .catch(function (error) {
          relationRequests.delete(key);
          throw error;
        })
        .finally(function () {
          relationRequests.delete(key);
        });

    relationRequests.set(
      key,
      request
    );

    return request;
  }

  // ============================================================
  // Related Tags Select
  // ============================================================

  function RelatedTagsSelect(props) {
    const tagId = Number(props.tagId);

    const initialIds =
      Array.isArray(props.initialIds)
        ? props.initialIds
            .map(function (id) {
              return Number(id);
            })
            .filter(function (id) {
              return Number.isFinite(id);
            })
        : [];

    const state = useState(initialIds);

    const selectedIds = state[0];
    const setSelectedIds = state[1];

    const TagIDSelect =
      getNativeTagIDSelect();

    useEffect(
      function () {
        if (!TagIDSelect) {
          logError(
            'PluginApi.components.TagIDSelect is unavailable'
          );
        }
      },
      []
    );

    function handleSelect(tags) {
      const values =
        Array.isArray(tags)
          ? tags
          : [];

      const uniqueIds = [];
      const seen = new Set();

      values.forEach(function (tag) {
        if (!tag) {
          return;
        }

        const id = Number(tag.id);

        if (!Number.isFinite(id)) {
          return;
        }

        if (id === tagId) {
          return;
        }

        if (seen.has(id)) {
          return;
        }

        seen.add(id);
        uniqueIds.push(id);
      });

      setSelectedIds(uniqueIds);

      editStates.set(
        String(tagId),
        uniqueIds
      );
    }

    if (!TagIDSelect) {
      return createElement(
        'div',
        {
          className:
            'tag-relations-native-select-error text-danger',
        },
        'Не удалось загрузить выбор тегов'
      );
    }

    /*
     * IMPORTANT:
     *
     * TagIDSelect is the native Stash selector.
     *
     * `isMulti: true` is required because the
     * default is single-select.
     */
    return createElement(
      TagIDSelect,
      {
        ids: selectedIds.map(
          function (id) {
            return String(id);
          }
        ),

        isMulti: true,

        onSelect: handleSelect,
      }
    );
  }

  // ============================================================
  // Edit fields
  // ============================================================

  function RelationEditFields(props) {
    const tagId = Number(props.tagId);

    const relationsState =
      useState(null);

    const relations =
      relationsState[0];

    const setRelations =
      relationsState[1];

    const loadingState =
      useState(true);

    const loading =
      loadingState[0];

    const setLoading =
      loadingState[1];

    const errorState =
      useState(null);

    const error =
      errorState[0];

    const setError =
      errorState[1];

    useEffect(
      function () {
        let cancelled = false;

        const existing =
          editStates.get(
            String(tagId)
          );

        /*
         * null = not loaded.
         * []   = loaded and empty.
         */
        if (Array.isArray(existing)) {
          setRelations(
            existing.map(function (id) {
              return Number(id);
            })
          );

          setLoading(false);

          return function () {
            cancelled = true;
          };
        }

        setLoading(true);
        setError(null);

        getRelations(tagId)
          .then(function (tags) {
            if (cancelled) {
              return;
            }

            const ids =
              tags
                .map(function (tag) {
                  return Number(tag.id);
                })
                .filter(function (id) {
                  return Number.isFinite(id);
                });

            setRelations(ids);

            editStates.set(
              String(tagId),
              ids
            );
          })
          .catch(function (loadError) {
            if (cancelled) {
              return;
            }

            logError(
              'Failed to load relations:',
              loadError
            );

            setError(loadError);
            setRelations([]);
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
        'div',
        {
          className:
            'tag-relations-edit-loading',
        },
        'Загрузка связанных тегов...'
      );
    }

    if (error) {
      return createElement(
        'div',
        {
          className:
            'tag-relations-edit-error text-danger',
        },
        'Не удалось загрузить связанные теги: ' +
          error.message
      );
    }

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
        'Связанные теги'
      ),

      createElement(
        'div',
        {
          className:
            'col-xl-7 col-sm-9',
        },

        createElement(
          RelatedTagsSelect,
          {
            tagId: tagId,
            initialIds:
              relations || [],
          }
        )
      )
    );
  }

  // ============================================================
  // Inline view
  // ============================================================

  function RelatedTagsInline(props) {
    const tagId = Number(props.tagId);

    const state =
      useState(null);

    const relations =
      state[0];

    const setRelations =
      state[1];

    const errorState =
      useState(null);

    const error =
      errorState[0];

    const setError =
      errorState[1];

    useEffect(
      function () {
        let cancelled = false;

        getRelations(tagId)
          .then(function (tags) {
            if (!cancelled) {
              setRelations(tags);
            }
          })
          .catch(function (loadError) {
            if (!cancelled) {
              logError(
                'Failed to load inline relations:',
                loadError
              );

              setError(loadError);
            }
          });

        return function () {
          cancelled = true;
        };
      },
      [tagId]
    );

    if (error) {
      return null;
    }

    if (relations === null) {
      return createElement(
        'span',
        {
          className:
            'tag-relations-inline-loading',
        },
        'Загрузка...'
      );
    }

    if (relations.length === 0) {
      return null;
    }

    return createElement(
      Fragment,
      null,

      relations.map(function (tag) {
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
      })
    );
  }

  // ============================================================
  // Normal view
  // ============================================================

  function installInlineRelations(tagId) {
    const detailGroup =
      document.querySelector(
        '#tag-page .detail-group'
      );

    if (!detailGroup) {
      return;
    }

    let item =
      detailGroup.querySelector(
        '.' + INLINE_ITEM_CLASS
      );

    if (item) {
      const existingTagId =
        item.getAttribute(
          'data-tag-id'
        );

      if (
        existingTagId === String(tagId)
      ) {
        return;
      }

      const oldMount =
        item.querySelector(
          '.tag-relations-inline-mount'
        );

      if (oldMount) {
        unmountReact(oldMount);
      }

      item.remove();
      item = null;
    }

    item =
      document.createElement('div');

    item.className =
      'detail-item ' +
      INLINE_ITEM_CLASS;

    item.setAttribute(
      'data-tag-id',
      String(tagId)
    );

    const title =
      document.createElement('span');

    title.className =
      'detail-item-title';

    title.textContent =
      'Связанные теги:';

    const value =
      document.createElement('span');

    value.className =
      'detail-item-value';

    const mount =
      document.createElement('span');

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

      item.remove();
    }
  }

  // ============================================================
  // Edit view
  // ============================================================

  function removeDuplicateEditFields(form) {
    const containers =
      Array.from(
        form.querySelectorAll(
          '.' +
            EDIT_FIELDS_CLASS +
            '[' +
            EDIT_FIELDS_MARKER +
            '="true"]'
        )
      );

    if (containers.length <= 1) {
      return containers[0] || null;
    }

    /*
     * Keep the first container.
     * Destroy all duplicate React roots.
     */
    const keeper = containers[0];

    containers
      .slice(1)
      .forEach(function (element) {
        log(
          'Removing duplicate edit container'
        );

        unmountReact(element);
        element.remove();
      });

    return keeper;
  }

  function installEditFields(tagId) {
    const form =
      document.querySelector(
        '#tag-page #tag-edit'
      );

    if (!form) {
      return;
    }

    /*
     * IMPORTANT:
     *
     * The marker belongs to the container,
     * not the form.
     *
     * Therefore we must search INSIDE the form.
     */
    let fieldsContainer =
      removeDuplicateEditFields(form);

    if (!fieldsContainer) {
      fieldsContainer =
        document.createElement('div');

      fieldsContainer.className =
        EDIT_FIELDS_CLASS;

      fieldsContainer.setAttribute(
        EDIT_FIELDS_MARKER,
        'true'
      );

      form.appendChild(
        fieldsContainer
      );
    }

    const key = String(tagId);

    if (!editStates.has(key)) {
      editStates.set(
        key,
        null
      );
    }

    /*
     * Do not mount another React root into an
     * already mounted container.
     */
    if (!fieldsContainer.__tagRelationsRoot) {
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

        unmountReact(fieldsContainer);
        fieldsContainer.remove();

        return;
      }
    }

    patchSaveButton(
      tagId,
      form
    );
  }

  // ============================================================
  // Save
  // ============================================================

  function patchSaveButton(tagId, form) {
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

    /*
     * If the button already belongs to this exact
     * form/tag, do nothing.
     */
    const patchedForm =
      saveButton.__tagRelationsForm;

    const patchedTagId =
      saveButton.__tagRelationsTagId;

    if (
      patchedForm === form &&
      patchedTagId === Number(tagId)
    ) {
      return;
    }

    /*
     * Remove an old plugin listener if Stash replaced
     * the edit form/button.
     */
    if (
      saveButton.__tagRelationsSaveHandler
    ) {
      saveButton.removeEventListener(
        'click',
        saveButton.__tagRelationsSaveHandler,
        true
      );

      saveButton.__tagRelationsSaveHandler =
        null;
    }

    const handler =
      function () {
        const key =
          String(tagId);

        const state =
          editStates.get(key);

        if (!Array.isArray(state)) {
          log(
            'Save clicked before relations finished loading'
          );

          return;
        }

        const relationIds =
          state
            .map(function (id) {
              return Number(id);
            })
            .filter(function (id) {
              return (
                Number.isFinite(id) &&
                id !== Number(tagId)
              );
            });

        waitForNativeSave(
          Number(tagId),
          form,
          relationIds
        );
      };

    saveButton.addEventListener(
      'click',
      handler,
      true
    );

    saveButton.__tagRelationsSaveHandler =
      handler;

    saveButton.__tagRelationsForm =
      form;

    saveButton.__tagRelationsTagId =
      Number(tagId);

    saveButton.setAttribute(
      SAVE_PATCH_MARKER,
      'true'
    );
  }

  function waitForNativeSave(
    tagId,
    form,
    relationIds
  ) {
    /*
     * Prevent duplicate synchronization if the user
     * somehow causes multiple click handlers.
     */
    if (form.__tagRelationsSaveWaiting) {
      return;
    }

    form.__tagRelationsSaveWaiting =
      true;

    const started =
      Date.now();

    const timeout =
      15000;

    function check() {
      const currentForm =
        document.querySelector(
          '#tag-page #tag-edit'
        );

      const stillInDOM =
        form.isConnected &&
        currentForm === form;

      /*
       * Native Stash save normally causes the edit form
       * to disappear/re-render.
       */
      if (!stillInDOM) {
        form.__tagRelationsSaveWaiting =
          false;

        syncRelationsAfterNativeSave(
          tagId,
          relationIds
        );

        return;
      }

      if (
        Date.now() - started >=
        timeout
      ) {
        form.__tagRelationsSaveWaiting =
          false;

        log(
          'Native save did not finish within timeout; ' +
            'relations were not synchronized'
        );

        return;
      }

      setTimeout(
        check,
        100
      );
    }

    setTimeout(
      check,
      100
    );
  }

  async function syncRelationsAfterNativeSave(
    tagId,
    relationIds
  ) {
    try {
      log(
        'Synchronizing related tags:',
        {
          tagId: Number(tagId),
          related: relationIds,
        }
      );

      await runPluginOperation(
        'set_relations',
        {
          tag_id: Number(tagId),

          /*
           * The UI exposes a single relation concept:
           * "related".
           *
           * Therefore all selected IDs go into related_ids
           * and existing "similar" relations are removed.
           */
          similar_ids: [],
          related_ids: relationIds,
        }
      );

      invalidateRelationCache(
        tagId
      );

      editStates.delete(
        String(tagId)
      );

      log(
        'Related tags saved successfully'
      );
    } catch (error) {
      logError(
        'Failed to save related tags:',
        error
      );

      window.alert(
        'Не удалось сохранить связанные теги:\n\n' +
          error.message
      );
    }
  }

  // ============================================================
  // Cleanup
  // ============================================================

  function cleanupPluginUI() {
    document
      .querySelectorAll(
        '.' + INLINE_ITEM_CLASS
      )
      .forEach(function (element) {
        const mount =
          element.querySelector(
            '.tag-relations-inline-mount'
          );

        if (mount) {
          unmountReact(mount);
        }

        element.remove();
      });

    document
      .querySelectorAll(
        '.' + EDIT_FIELDS_CLASS
      )
      .forEach(function (element) {
        unmountReact(element);
        element.remove();
      });

    /*
     * Remove our Save listener from any old button.
     */
    document
      .querySelectorAll(
        'button[' +
          SAVE_PATCH_MARKER +
          ']'
      )
      .forEach(function (button) {
        if (
          button.__tagRelationsSaveHandler
        ) {
          button.removeEventListener(
            'click',
            button.__tagRelationsSaveHandler,
            true
          );
        }

        delete button.__tagRelationsSaveHandler;
        delete button.__tagRelationsForm;
        delete button.__tagRelationsTagId;

        button.removeAttribute(
          SAVE_PATCH_MARKER
        );
      });

    editStates.clear();
  }

  // ============================================================
  // Tag page scan
  // ============================================================

  function scanTagPage() {
    const tagId =
      getCurrentTagId();

    if (!tagId) {
      if (
        currentTagId !== null
      ) {
        cleanupPluginUI();
        currentTagId = null;
      }

      return;
    }

    if (
      currentTagId !== null &&
      currentTagId !== tagId
    ) {
      cleanupPluginUI();
    }

    currentTagId = tagId;

    const tagPage =
      document.querySelector(
        '#tag-page'
      );

    if (!tagPage) {
      return;
    }

    const editForm =
      document.querySelector(
        '#tag-page #tag-edit'
      );

    if (editForm) {
      installEditFields(tagId);
    } else {
      installInlineRelations(tagId);
    }
  }

  // ============================================================
  // Route events
  // ============================================================

  function installRouteListener() {
    if (routeListenerInstalled) {
      return;
    }

    if (
      PluginApi.Event &&
      typeof PluginApi.Event.addEventListener ===
        'function'
    ) {
      PluginApi.Event.addEventListener(
        'stash:location',
        function () {
          /*
           * Stash may need a render cycle before the
           * tag page exists in the DOM.
           */
          setTimeout(
            scanTagPage,
            0
          );

          setTimeout(
            scanTagPage,
            250
          );
        }
      );

      routeListenerInstalled = true;

      log(
        'Stash route listener installed'
      );
    }
  }

  // ============================================================
  // Edit mode detection
  // ============================================================

  function startEditModePolling() {
    if (editScanTimer) {
      clearInterval(
        editScanTimer
      );
    }

    editScanTimer =
      setInterval(
        function () {
          try {
            scanTagPage();
          } catch (error) {
            logError(
              'Tag page scan failed:',
              error
            );
          }
        },
        500
      );
  }

  // ============================================================
  // Standalone route
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
        let cancelled = false;

        setLoading(true);

        runPluginOperation(
          'export_relations'
        )
          .then(function (data) {
            if (
              !cancelled &&
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
            if (!cancelled) {
              logError(
                'Failed to load relations:',
                error
              );
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

  if (
    PluginApi.register &&
    PluginApi.register.route
  ) {
    PluginApi.register.route(
      '/plugin/tag-relations',
      TagRelationsPage
    );
  }

  // ============================================================
  // Start
  // ============================================================

  installRouteListener();

  startEditModePolling();

  scanTagPage();

  log('loaded');
})();