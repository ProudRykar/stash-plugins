(function () {
  'use strict';

  const PLUGIN_ID = 'tag-relations';

  const INLINE_ITEM_CLASS = 'tag-relations-inline-item';
  const EDIT_FIELDS_MARKER = 'data-tag-relations-fields';
  const SAVE_PATCH_MARKER = 'data-tag-relations-save-patched';

  const relationCache = new Map();
  const relationRequests = new Map();
  const editStates = new Map();

  let currentTagId = null;
  let scanTimer = null;
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
        // Keep original string.
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
            typeof data.error === 'object'
          ) {
            message =
              data.error.message ||
              message;
          } else {
            message = String(data.error);
          }
        }

        throw new Error(message);
      }

      return data.data;
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

  let NativeTagIDSelect =
    PluginApi.components &&
    PluginApi.components.TagIDSelect;

  async function ensureNativeTagSelector() {
    if (NativeTagIDSelect) {
      return NativeTagIDSelect;
    }

    if (
      PluginApi.utils &&
      typeof PluginApi.utils.loadComponents ===
        'function' &&
      PluginApi.loadableComponents &&
      PluginApi.loadableComponents.Tags
    ) {
      try {
        await PluginApi.utils.loadComponents([
          PluginApi.loadableComponents.Tags,
        ]);
      } catch (error) {
        logError(
          'Failed to load Stash tag components:',
          error
        );
      }
    }

    NativeTagIDSelect =
      PluginApi.components &&
      PluginApi.components.TagIDSelect;

    return NativeTagIDSelect || null;
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

      root.render(element);

      container.__tagRelationsRoot = root;

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

  /*
   * Backend may currently return either:
   *
   *   [ {id, name}, ... ]
   *
   * or the old:
   *
   *   {
   *     similar: [...],
   *     related: [...]
   *   }
   *
   * We expose only ONE concept to the UI:
   * related tags.
   */

  function normalizeRelationData(data) {
    if (Array.isArray(data)) {
      return data;
    }

    if (!data || typeof data !== 'object') {
      return [];
    }

    const similar = Array.isArray(data.similar)
      ? data.similar
      : [];

    const related = Array.isArray(data.related)
      ? data.related
      : [];

    const result = [];
    const seen = new Set();

    similar
      .concat(related)
      .forEach(function (tag) {
        if (!tag || tag.id === undefined) {
          return;
        }

        const id = String(tag.id);

        if (seen.has(id)) {
          return;
        }

        seen.add(id);
        result.push({
          id: Number(tag.id),
          name: tag.name || String(tag.id),
        });
      });

    return result;
  }

  // ============================================================
  // Relation cache
  // ============================================================

  function invalidateRelationCache(tagId) {
    if (tagId === undefined || tagId === null) {
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
          /*
           * Do not retry automatically.
           *
           * A backend error must not result in:
           *
           * list_relations
           * list_relations
           * list_relations
           * ...
           */
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
    const tagId = props.tagId;

    const state =
      useState(props.initialIds || []);

    const selectedIds = state[0];
    const setSelectedIds = state[1];

    const [selector, setSelector] =
      useState(null);

    useEffect(
      function () {
        let cancelled = false;

        ensureNativeTagSelector()
          .then(function (component) {
            if (!cancelled) {
              setSelector(
                function () {
                  return component;
                }
              );
            }
          })
          .catch(function (error) {
            if (!cancelled) {
              logError(
                'Failed to initialize native tag selector:',
                error
              );
            }
          });

        return function () {
          cancelled = true;
        };
      },
      []
    );

    function handleSelect(tags) {
      const ids = Array.isArray(tags)
        ? tags.map(function (tag) {
            return Number(tag.id);
          })
        : [];

      const uniqueIds = [];
      const seen = new Set();

      ids.forEach(function (id) {
        if (!Number.isFinite(id)) {
          return;
        }

        if (id === Number(tagId)) {
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

    if (!selector) {
      return createElement(
        'div',
        {
          className:
            'tag-relations-native-select-loading',
        },
        'Загрузка...'
      );
    }

    const TagIDSelect = selector();

    if (!TagIDSelect) {
      return createElement(
        'div',
        {
          className:
            'tag-relations-native-select-error',
        },
        'Не удалось загрузить выбор тегов'
      );
    }

    return createElement(
      TagIDSelect,
      {
        ids: selectedIds.map(String),

        isMulti: true,

        isClearable: true,

        excludeIds: [
          String(tagId),
        ],

        noSelectionString:
          'Поиск связанных тегов...',

        onSelect: handleSelect,

        className:
          'tag-relations-native-tag-select',
      }
    );
  }

  // ============================================================
  // Edit fields
  // ============================================================

  function RelationEditFields(props) {
    const tagId = props.tagId;

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

        if (existing) {
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
              tags.map(function (tag) {
                return Number(tag.id);
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
    const tagId = props.tagId;

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
      /*
       * Do not display an error in the tag page.
       * More importantly, do not retry.
       */
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
              href: getTagUrl(tag.id),
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
      if (
        item.getAttribute(
          'data-tag-id'
        ) === String(tagId)
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

  function installEditFields(tagId) {
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
      document.createElement('div');

    fieldsContainer.className =
      'tag-relations-edit-fields';

    fieldsContainer.setAttribute(
      EDIT_FIELDS_MARKER,
      'true'
    );

    form.appendChild(
      fieldsContainer
    );

    /*
     * Initial state is loaded by RelationEditFields.
     *
     * We deliberately keep the current IDs outside
     * the DOM. React state + editStates is the source
     * of truth.
     */
    if (
      !editStates.has(
        String(tagId)
      )
    ) {
      editStates.set(
        String(tagId),
        null
      );
    }

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
        const key = String(tagId);

        const state =
          editStates.get(key);

        if (!Array.isArray(state)) {
          /*
           * Relations have not finished loading.
           *
           * Do NOT overwrite anything with [].
           */
          log(
            'Save clicked before relations finished loading; ' +
              'waiting for existing state'
          );

          return;
        }

        const relationIds =
          state
            .map(function (id) {
              return Number(id);
            })
            .filter(function (id) {
              return Number.isFinite(id) &&
                id !== Number(tagId);
            });

        /*
         * Give native Stash Save the opportunity
         * to finish first.
         *
         * We only sync relations after edit mode
         * disappears. If Stash validation fails and
         * edit mode stays open, we never touch the DB.
         */
        waitForNativeSave(
          tagId,
          form,
          relationIds
        );
      },
      true
    );
  }

  function waitForNativeSave(
    tagId,
    form,
    relationIds
  ) {
    const started =
      Date.now();

    const timeout =
      15000;

    function check() {
      /*
       * If Stash has replaced/removed the edit form,
       * native save succeeded and we can sync.
       */
      const stillInDOM =
        form.isConnected &&
        document.querySelector(
          '#tag-page #tag-edit'
        ) === form;

      if (!stillInDOM) {
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
           * We now expose only one relation type
           * to the UI.
           *
           * Existing "similar" relations are therefore
           * converted into "related" relations.
           */
          similar_ids: [],
          related_ids: relationIds,
        }
      );

      invalidateRelationCache(
        tagId
      );

      /*
       * Clear edit state so the next edit starts
       * from the freshly saved database state.
       */
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
        '.tag-relations-edit-fields'
      )
      .forEach(function (element) {
        unmountReact(element);
        element.remove();
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
      if (currentTagId !== null) {
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

    /*
     * Normal mode.
     *
     * If Stash has not rendered the detail group yet,
     * installInlineRelations simply returns.
     */
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
    if (
      routeListenerInstalled
    ) {
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
           * Stash has changed route.
           *
           * Do not mutate DOM from the event itself.
           */
          setTimeout(
            scanTagPage,
            0
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

  /*
   * There is deliberately NO MutationObserver here.
   *
   * TagPage is not PatchComponent-wrapped in the current
   * Stash UI, so we need a DOM-level way to notice that
   * the user clicked Edit.
   *
   * A small idempotent poll is much safer than observing
   * the entire React tree.
   */

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

  log(
    'loaded'
  );
})();