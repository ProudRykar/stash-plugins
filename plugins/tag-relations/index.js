(function () {
  'use strict';

  const PLUGIN_ID = 'tag-relations';

  const INLINE_ITEM_CLASS = 'tag-relations-inline-item';
  const INLINE_MOUNT_CLASS = 'tag-relations-inline-mount';
  const EDIT_FIELDS_CLASS = 'tag-relations-edit-fields';

  const relationCache = new Map();
  const relationRequests = new Map();

  // Current relation selection while the tag edit form is open.
  // null = not loaded yet.
  const editStates = new Map();

  // Relations as they were when the edit form was opened.
  const editInitialStates = new Map();

  // Whether the user changed the relation selector.
  const editDirtyStates = new Map();

  let pageObserver = null;
  let routeListenerInstalled = false;
  let currentTagId = null;

  // ============================================================
  // Logging
  // ============================================================

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

  if (
    typeof ReactDOM.createPortal !==
    'function'
  ) {
    logError(
      'ReactDOM.createPortal is unavailable'
    );
    return;
  }

  const createElement = React.createElement;
  const Fragment = React.Fragment;
  const useState = React.useState;
  const useEffect = React.useEffect;

  // ============================================================
  // Native Stash component
  // ============================================================

  function getNativeTagIDSelect() {
    const components =
      PluginApi.components;

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
  // Array helpers
  // ============================================================

  function normalizeIds(ids) {
    if (!Array.isArray(ids)) {
      return [];
    }

    const result = [];
    const seen = new Set();

    ids.forEach(function (id) {
      const numericId = Number(id);

      if (!Number.isFinite(numericId)) {
        return;
      }

      if (seen.has(numericId)) {
        return;
      }

      seen.add(numericId);
      result.push(numericId);
    });

    return result;
  }

  function sameIds(a, b) {
    const left = normalizeIds(a).sort(
      function (x, y) {
        return x - y;
      }
    );

    const right = normalizeIds(b).sort(
      function (x, y) {
        return x - y;
      }
    );

    if (left.length !== right.length) {
      return false;
    }

    for (let i = 0; i < left.length; i += 1) {
      if (left[i] !== right[i]) {
        return false;
      }
    }

    return true;
  }

  // ============================================================
  // Save button
  // ============================================================

  function updateSaveButton(tagId) {
    const key = String(tagId);

    if (
      editDirtyStates.get(key) !== true
    ) {
      return;
    }

    const button =
      document.querySelector(
        '#tag-page .details-edit button.save'
      );

    if (!button) {
      return;
    }

    // The native Stash button is disabled when
    // Formik itself is not dirty. Relation changes
    // are outside Formik, so enable it ourselves.
    button.disabled = false;
    button.removeAttribute('disabled');
  }

  // ============================================================
  // Related Tags selector
  // ============================================================

  function RelatedTagsSelect(props) {
    const tagId =
      Number(props.tagId);

    const initialIds =
      normalizeIds(
        props.initialIds
      );

    const state =
      useState(initialIds);

    const selectedIds =
      state[0];

    const setSelectedIds =
      state[1];

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

        const id =
          Number(tag.id);

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

      const key = String(tagId);

      editStates.set(
        key,
        uniqueIds
      );

      const initial =
        editInitialStates.get(key) || [];

      const dirty =
        !sameIds(
          uniqueIds,
          initial
        );

      editDirtyStates.set(
        key,
        dirty
      );

      if (dirty) {
        // Give React/Bootstrap one frame to finish
        // its own update, then enable the native Save.
        setTimeout(
          function () {
            updateSaveButton(tagId);
          },
          0
        );
      }
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

    return createElement(
      TagIDSelect,
      {
        ids: selectedIds.map(
          function (id) {
            return String(id);
          }
        ),
        isMulti: true,
        creatable: false,
        onSelect: handleSelect,
      }
    );
  }

  // ============================================================
  // Edit fields
  // ============================================================

  function RelationEditFields(props) {
    const tagId =
      Number(props.tagId);

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

        const key =
          String(tagId);

        const existing =
          editStates.get(key);

        if (Array.isArray(existing)) {
          setRelations(
            existing
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
              normalizeIds(
                tags.map(
                  function (tag) {
                    return tag.id;
                  }
                )
              );

            editStates.set(
              key,
              ids
            );

            editInitialStates.set(
              key,
              ids.slice()
            );

            editDirtyStates.set(
              key,
              false
            );

            setRelations(ids);
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
  // Edit portal
  //
  // IMPORTANT:
  // This component is rendered from inside native Stash's
  // React tree through ImageInput.
  //
  // createPortal moves only the DOM location.
  // React context (Apollo, router, etc.) is preserved.
  // ============================================================

  function TagRelationsEditBridge(props) {
    const tagId =
      Number(props.tagId);

    const targetState =
      useState(null);

    const target =
      targetState[0];

    const setTarget =
      targetState[1];

    useEffect(
      function () {
        if (!props.enabled) {
          return undefined;
        }

        let currentTarget = null;
        let observer = null;

        function removeTarget() {
          if (
            currentTarget &&
            currentTarget.isConnected
          ) {
            currentTarget.remove();
          }

          currentTarget = null;
          setTarget(null);
        }

        function findOrCreateTarget() {
          const form =
            document.querySelector(
              '#tag-page #tag-edit'
            );

          if (!form) {
            if (currentTarget) {
              removeTarget();
            }

            return;
          }

          let container =
            form.querySelector(
              '.' + EDIT_FIELDS_CLASS
            );

          if (!container) {
            container =
              document.createElement('div');

            container.className =
              EDIT_FIELDS_CLASS;

            // Put Related Tags immediately after
            // the native Child Tags field.
            const childField =
              form.querySelector(
                '[data-field="child_ids"]'
              );

            if (childField) {
              childField.insertAdjacentElement(
                'afterend',
                container
              );
            } else {
              form.appendChild(
                container
              );
            }
          }

          if (
            currentTarget !== container
          ) {
            currentTarget = container;
            setTarget(container);
          }
        }

        findOrCreateTarget();

        const page =
          document.querySelector(
            '#tag-page'
          );

        if (page) {
          observer =
            new MutationObserver(
              function () {
                findOrCreateTarget();
              }
            );

          observer.observe(
            page,
            {
              childList: true,
              subtree: true,
            }
          );
        }

        return function () {
          if (observer) {
            observer.disconnect();
          }

          if (
            currentTarget &&
            currentTarget.isConnected
          ) {
            currentTarget.remove();
          }

          currentTarget = null;
          setTarget(null);
        };
      },
      [props.enabled, tagId]
    );

    // ----------------------------------------------------------
    // Native save integration
    // ----------------------------------------------------------

    useEffect(
      function () {
        if (!props.enabled) {
          return undefined;
        }

        const form =
          document.querySelector(
            '#tag-page #tag-edit'
          );

        if (!form) {
          return undefined;
        }

        let waiting = false;

        function getCurrentIds() {
          const key =
            String(tagId);

          const ids =
            editStates.get(key);

          return Array.isArray(ids)
            ? normalizeIds(ids).filter(
                function (id) {
                  return id !== tagId;
                }
              )
            : [];
        }

        function saveRelationsAfterNativeSave() {
          if (waiting) {
            return;
          }

          const key =
            String(tagId);

          if (
            editStates.get(key) === null ||
            editStates.get(key) === undefined
          ) {
            return;
          }

          const relationIds =
            getCurrentIds();

          waiting = true;

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

            if (!stillInDOM) {
              waiting = false;

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
              waiting = false;

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

        function onSubmit() {
          saveRelationsAfterNativeSave();
        }

        function onSaveClick() {
          saveRelationsAfterNativeSave();
        }

        // Formik's normal save path.
        form.addEventListener(
          'submit',
          onSubmit,
          true
        );

        // DetailsEditNavbar calls formik.handleSubmit
        // directly from the Save button, so also catch
        // the button click.
        const saveButton =
          document.querySelector(
            '#tag-page .details-edit button.save'
          );

        if (saveButton) {
          saveButton.addEventListener(
            'click',
            onSaveClick,
            true
          );
        }

        return function () {
          form.removeEventListener(
            'submit',
            onSubmit,
            true
          );

          if (saveButton) {
            saveButton.removeEventListener(
              'click',
              onSaveClick,
              true
            );
          }
        };
      },
      [props.enabled, tagId]
    );

    // ----------------------------------------------------------
    // Keep native Save enabled when only relations changed.
    // ----------------------------------------------------------

    useEffect(
      function () {
        if (!props.enabled) {
          return undefined;
        }

        const key =
          String(tagId);

        function update() {
          if (
            editDirtyStates.get(key) === true
          ) {
            updateSaveButton(tagId);
          }
        }

        update();

        const navbar =
          document.querySelector(
            '#tag-page .details-edit'
          );

        if (!navbar) {
          return undefined;
        }

        const observer =
          new MutationObserver(
            function () {
              update();
            }
          );

        observer.observe(
          navbar,
          {
            attributes: true,
            attributeFilter: [
              'disabled',
            ],
            childList: true,
            subtree: true,
          }
        );

        return function () {
          observer.disconnect();
        };
      },
      [props.enabled, tagId]
    );

    if (!target) {
      return null;
    }

    return ReactDOM.createPortal(
      createElement(
        RelationEditFields,
        {
          tagId: tagId,
        }
      ),
      target
    );
  }

  // ============================================================
  // Patch native ImageInput
  //
  // ImageInput is rendered inside TagEditPanel's native
  // React tree. Therefore the bridge below retains the
  // ApolloProvider context.
  // ============================================================

  if (
    PluginApi.patch &&
    typeof PluginApi.patch.after ===
      'function'
  ) {
    PluginApi.patch.after(
      'ImageInput',
      function (props, original) {
        const tagId =
          getCurrentTagId();

        const enabled =
          !!(
            tagId &&
            props &&
            props.isEditing
          );

        if (!enabled) {
          return original;
        }

        return createElement(
          Fragment,
          null,

          original,

          createElement(
            TagRelationsEditBridge,
            {
              key:
                'tag-relations-edit-' +
                tagId,
              tagId: tagId,
              enabled: true,
            }
          )
        );
      }
    );

    log(
      'Patched native ImageInput for edit portal'
    );
  } else {
    logError(
      'PluginApi.patch.after is unavailable'
    );
  }

  // ============================================================
  // Inline view
  // ============================================================

  function RelatedTagsInline(props) {
    const tagId =
      Number(props.tagId);

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

  function unmountInlineReact(mount) {
    if (!mount) {
      return;
    }

    if (
      mount.__tagRelationsLegacy &&
      typeof ReactDOM.unmountComponentAtNode ===
        'function'
    ) {
      try {
        ReactDOM.unmountComponentAtNode(
          mount
        );
      } catch (error) {
        logError(
          'Failed to unmount inline React:',
          error
        );
      }
    }

    mount.__tagRelationsLegacy = false;
  }

  function installInlineRelations(tagId) {
    const detailGroup =
      document.querySelector(
        '#tag-page .detail-group'
      );

    if (!detailGroup) {
      return;
    }

    // Never install the inline block while editing.
    if (
      document.querySelector(
        '#tag-page #tag-edit'
      )
    ) {
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
          '.' + INLINE_MOUNT_CLASS
        );

      if (oldMount) {
        unmountInlineReact(
          oldMount
        );
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
      INLINE_MOUNT_CLASS;

    value.appendChild(
      mount
    );

    item.appendChild(
      title
    );

    item.appendChild(
      value
    );

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
      detailGroup.appendChild(
        item
      );
    }

    try {
      ReactDOM.render(
        createElement(
          RelatedTagsInline,
          {
            tagId: tagId,
          }
        ),
        mount
      );

      mount.__tagRelationsLegacy = true;
    } catch (error) {
      logError(
        'Failed to mount inline relations:',
        error
      );

      item.remove();
    }
  }

  function cleanupInlineRelations() {
    document
      .querySelectorAll(
        '.' + INLINE_ITEM_CLASS
      )
      .forEach(function (element) {
        const mount =
          element.querySelector(
            '.' + INLINE_MOUNT_CLASS
          );

        if (mount) {
          unmountInlineReact(
            mount
          );
        }

        element.remove();
      });
  }

  // ============================================================
  // Page scanning
  //
  // Only the normal-view DOM block is managed here.
  // Edit mode is handled entirely through the React portal.
  // ============================================================

  function scanTagPage() {
    const tagId =
      getCurrentTagId();

    if (!tagId) {
      if (currentTagId !== null) {
        cleanupInlineRelations();
      }

      currentTagId = null;
      return;
    }

    if (
      currentTagId !== null &&
      currentTagId !== tagId
    ) {
      cleanupInlineRelations();

      editStates.delete(
        String(currentTagId)
      );

      editInitialStates.delete(
        String(currentTagId)
      );

      editDirtyStates.delete(
        String(currentTagId)
      );
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
      tagPage.querySelector(
        '#tag-edit'
      );

    if (editForm) {
      cleanupInlineRelations();
      return;
    }

    installInlineRelations(
      tagId
    );
  }

  // ============================================================
  // Scoped DOM observer
  //
  // This observes only #tag-page, never the whole document.
  // It exists only for the non-React inline detail block.
  // ============================================================

  function startPageObserver() {
    if (pageObserver) {
      pageObserver.disconnect();
      pageObserver = null;
    }

    function attach() {
      const page =
        document.querySelector(
          '#tag-page'
        );

      if (!page) {
        setTimeout(
          attach,
          100
        );
        return;
      }

      pageObserver =
        new MutationObserver(
          function () {
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

      pageObserver.observe(
        page,
        {
          childList: true,
          subtree: true,
        }
      );

      scanTagPage();
    }

    attach();
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
          cleanupInlineRelations();

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
  // Cleanup
  // ============================================================

  function cleanup() {
    cleanupInlineRelations();

    if (pageObserver) {
      pageObserver.disconnect();
      pageObserver = null;
    }

    editStates.clear();
    editInitialStates.clear();
    editDirtyStates.clear();

    currentTagId = null;
  }

  // ============================================================
  // Start
  // ============================================================

  installRouteListener();
  startPageObserver();
  scanTagPage();

  log(
    'loaded - native TagIDSelect uses React/Apollo context'
  );
})();