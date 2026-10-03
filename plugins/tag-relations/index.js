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

    /*
     * Current plugin operation API:
     *
     * {
     *   ok: true,
     *   error: null,
     *   output: {...}
     * }
     *
     * Some older versions may return:
     *
     * {
     *   ok: true,
     *   data: {...}
     * }
     *
     * Support both.
     */

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

      if (
        Object.prototype.hasOwnProperty.call(
          data,
          'output'
        )
      ) {
        return data.output;
      }

      if (
        Object.prototype.hasOwnProperty.call(
          data,
          'data'
        )
      ) {
        return data.data;
      }

      return data;
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

    /*
     * Prefer createRoot when available.
     *
     * This is deliberately a separate React tree
     * from Stash's own tree.
     */
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

    /*
     * React 17 compatibility.
     */
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
    /*
     * Accept a direct array for compatibility.
     */
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

    /*
     * The UI intentionally exposes a single concept:
     *
     *     Связанные теги
     *
     * Therefore both old "similar" and current
     * "related" relations are displayed together.
     */
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

    const state =
      useState(
        Array.isArray(props.initialIds)
          ? props.initialIds
          : []
      );

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
      /*
       * Native TagIDSelect returns Tag objects.
       *
       * Convert them to numeric IDs.
       */
      const values = Array.isArray(tags)
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

        /*
         * A tag cannot be related to itself.
         */
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
     * Do not pass react-select props here.
     *
     * TagIDSelect is Stash's own wrapper and
     * already knows how to render the native
     * tag selector.
     */
    return createElement(
      'div',
      null,
      'TEST: relations = ',
      JSON.stringify(selectedIds)
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

        /*
         * If the selector already changed something,
         * use the local state instead of reloading
         * from the backend.
         */
        const existing =
          editStates.get(
            String(tagId)
          );

        /*
         * null means:
         *
         *     not loaded yet
         *
         * [] means:
         *
         *     loaded, no relations
         */
        if (
          Array.isArray(existing)
        ) {
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

    /*
     * Normal tag page should not expose backend
     * errors directly.
     */
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

    /*
     * Put the field after Sub Tags.
     *
     * If Sub Tags are unavailable, fall back to
     * Parent Tags.
     */
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

    /*
     * Do not create the component twice.
     */
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

    /*
     * Put Related Tags immediately after
     * the native Child Tags field.
     *
     * We only manipulate the DOM here.
     *
     * No portal.
     * No Stash React tree injection.
     */
    const childField =
      form.querySelector(
        '[data-field="child_ids"]'
      );

    if (childField) {
      childField.insertAdjacentElement(
        'afterend',
        fieldsContainer
      );
    } else {
      /*
       * Fallback in case Stash changes its
       * field structure.
       */
      form.appendChild(
        fieldsContainer
      );
    }

    /*
     * null means that relations haven't been
     * loaded yet.
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

    /*
     * Hook into the existing Stash Save button.
     */
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
     * Avoid attaching the listener repeatedly
     * during polling.
     */
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

    /*
     * Capture the click before Stash's native
     * handler.
     */
    saveButton.addEventListener(
      'click',

      function () {
        const key =
          String(tagId);

        const state =
          editStates.get(key);

        /*
         * If relations haven't loaded yet, don't
         * overwrite anything in the backend.
         */
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
          tagId,
          form,
          relationIds
        );
      },

      true
    );

    log(
      'Native save button patched for tag',
      tagId
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
      const stillInDOM =
        form.isConnected &&
        document.querySelector(
          '#tag-page #tag-edit'
        ) === form;

      /*
       * Stash normally removes the edit form after
       * a successful save.
       *
       * Once it disappears, synchronize our own
       * relation data.
       */
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

      /*
       * The UI exposes only one relation concept:
       *
       *     Связанные теги
       *
       * Therefore:
       *
       *     similar_ids = []
       *     related_ids = selected tags
       *
       * This also converts any old "similar"
       * relations into the unified "related"
       * representation.
       */
      await runPluginOperation(
        'set_relations',
        {
          tag_id: Number(tagId),

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
    /*
     * Inline relations.
     */
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

    /*
     * Edit relations.
     */
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

    /*
     * We are no longer on a tag page.
     */
    if (!tagId) {
      if (
        currentTagId !== null
      ) {
        cleanupPluginUI();
        currentTagId = null;
      }

      return;
    }

    /*
     * Different tag.
     */
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

    /*
     * Edit mode.
     */
    if (editForm) {
      installEditFields(tagId);

      return;
    }

    /*
     * Normal view.
     */
    installInlineRelations(tagId);
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
           * Let Stash finish rendering the new
           * page before scanning it.
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

  function startEditModePolling() {
    if (editScanTimer) {
      clearInterval(
        editScanTimer
      );
    }

    /*
     * Stash changes between view/edit mode without
     * necessarily triggering a full location change.
     *
     * Polling keeps this compatible with the old
     * working implementation.
     */
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