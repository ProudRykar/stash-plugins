(function () {
  'use strict';

  const PLUGIN_ID = 'tag-relations';

  const INLINE_ITEM_CLASS = 'tag-relations-inline-item';
  const EDIT_FIELDS_CLASS = 'tag-relations-edit-fields';

  const EDIT_HOST_MARKER = 'data-tag-relations-host';
  const SAVE_PATCH_MARKER = 'data-tag-relations-save-patched';

  const relationCache = new Map();
  const relationRequests = new Map();
  const editStates = new Map();

  /*
   * Tag ids whose related tags were changed by the user
   * and have not been saved yet.
   */
  const pendingRelationEdits = new Set();

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

    log(
      'Plugin operation:',
      operation,
      variables.args
    );

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

    if (
      data === null ||
      data === undefined
    ) {
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
     * Current API:
     *
     * {
     *   ok: true,
     *   error: null,
     *   output: {...}
     * }
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
  // Native Stash components
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
  // Tag helpers
  // ============================================================

  function getCurrentTagId() {
    const pathname =
      window.location.pathname;

    const match = pathname.match(
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

    /*
     * UI exposes one concept:
     *
     *     Связанные теги
     *
     * Old "similar" and current "related"
     * are therefore combined.
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

        const numericId =
          Number(tag.id);

        if (
          !Number.isFinite(numericId)
        ) {
          return;
        }

        result.push({
          id: numericId,
          name:
            tag.name ||
            String(tag.id),
        });
      });

    return result;
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
  // Related Tags selector
  //
  // IMPORTANT:
  //
  // This component MUST be rendered from inside Stash's
  // existing React tree. It must NOT be mounted with
  // createRoot()/ReactDOM.render().
  // ============================================================

  function RelatedTagsSelect(props) {
    const tagId =
      Number(props.tagId);

    const state = useState(
      Array.isArray(props.initialIds)
        ? props.initialIds
        : []
    );

    const selectedIds = state[0];
    const setSelectedIds = state[1];

    const TagIDSelect =
      getNativeTagIDSelect();

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

        /*
         * Prevent self-relation.
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

      const previous =
        editStates.get(
          String(tagId)
        );

      editStates.set(
        String(tagId),
        uniqueIds
      );

      /*
       * The related tags field is not part of Formik,
       * so formik.dirty never becomes true for it.
       * Remember the change so Save can be enabled.
       */

      if (
        !Array.isArray(previous) ||
        previous.join(',') !==
          uniqueIds.join(',')
      ) {
        pendingRelationEdits.add(
          String(tagId)
        );
      }

      log(
        'Related tags changed:',
        {
          tagId: tagId,
          ids: uniqueIds,
        }
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
     * Native Stash TagIDSelect expects IDs.
     *
     * It internally loads the corresponding Tag
     * objects through Stash's Apollo context.
     *
     * Because this component is rendered through a
     * React portal, that Apollo context is preserved.
     */

    return createElement(
      TagIDSelect,
      {
        /*
         * Stash defaults isMulti to false, which
         * renders a single-value container. Related
         * tags must render as multi-value chips.
         */
        isMulti: true,

        ids: selectedIds.map(
          function (id) {
            return String(id);
          }
        ),

        onSelect:
          handleSelect,
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

        /*
         * If the user already changed the selector,
         * preserve local state.
         */

        const existing =
          editStates.get(
            String(tagId)
          );

        /*
         * null:
         *     not loaded yet
         *
         * []:
         *     loaded, no relations
         */

        if (Array.isArray(existing)) {
          const ids =
            existing.map(
              function (id) {
                return Number(id);
              }
            );

          setRelations(ids);
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
              tags.map(
                function (tag) {
                  return Number(tag.id);
                }
              );

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
  // React bridge
  //
  // This component lives INSIDE Stash's React tree.
  //
  // It creates a normal DOM container after Child Tags
  // and then portals our React UI into that container.
  //
  // React context, including Apollo context, survives
  // the portal.
  // ============================================================

  function TagRelationsEditBridge(props) {
    const tagId =
      Number(props.tagId);

    const enabled =
      props.enabled === true;

    const targetState =
      useState(null);

    const target =
      targetState[0];

    const setTarget =
      targetState[1];

    useEffect(
      function () {
        if (!enabled || !tagId) {
          setTarget(null);
          return undefined;
        }

        const form =
          document.querySelector(
            '#tag-page #tag-edit'
          );

        if (!form) {
          setTarget(null);
          return undefined;
        }

        let container =
          form.querySelector(
            '.' +
              EDIT_FIELDS_CLASS +
              '[' +
              EDIT_HOST_MARKER +
              '="true"]'
          );

        if (!container) {
          container =
            document.createElement(
              'div'
            );

          container.className =
            EDIT_FIELDS_CLASS;

          container.setAttribute(
            EDIT_HOST_MARKER,
            'true'
          );

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

          log(
            'Created related tags portal host for tag',
            tagId
          );
        }

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

        setTarget(container);

        /*
         * The form may disappear when Stash switches
         * from edit mode back to normal mode.
         *
         * The DOM node will then disappear together
         * with the form.
         */

        return function () {
          setTarget(null);
        };
      },
      [enabled, tagId]
    );

    if (
      !enabled ||
      !target
    ) {
      return null;
    }

    /*
     * THIS IS THE IMPORTANT PART.
     *
     * createPortal keeps the React context of the
     * ImageInput/Stash component tree.
     */

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
  // PluginApi.patch.after callback helper
  //
  // Stash runs: result = afterFn(this, args.concat(result))
  //
  // React may pass extra arguments to the component besides
  // props (e.g. a secondArg object). The render result is
  // therefore ALWAYS the last argument, never a fixed index.
  // ============================================================

  function splitPatchArgs(args) {
    const componentProps =
      args.length ? args[0] : null;

    let rendered = args.length
      ? args[args.length - 1]
      : null;

    if (!React.isValidElement(rendered)) {
      for (let i = args.length - 1; i >= 0; i--) {
        if (React.isValidElement(args[i])) {
          rendered = args[i];
          break;
        }
      }
    }

    return {
      componentProps: componentProps,
      rendered: rendered,
    };
  }

  function logPatchArgs(label, args) {
    const parts = [];

    for (let i = 0; i < args.length; i++) {
      const value = args[i];

      if (React.isValidElement(value)) {
        parts.push('#' + i + ':<element>');
      } else if (value === null) {
        parts.push('#' + i + ':null');
      } else if (value === undefined) {
        parts.push('#' + i + ':undefined');
      } else if (typeof value === 'object') {
        parts.push(
          '#' +
            i +
            ':object{' +
            Object.keys(value).join(',') +
            '}'
        );
      } else {
        parts.push(
          '#' + i + ':' + typeof value
        );
      }
    }

    logError(
      label +
        ' after-args(' +
        args.length +
        '): ' +
        parts.join(' | ')
    );
  }

  // ============================================================
  // ImageInput patch
  //
  // ImageInput is rendered from the native Stash edit tree.
  // We append our bridge to that same tree.
  // ============================================================

  if (
    PluginApi.patch &&
    typeof PluginApi.patch.after ===
      'function'
  ) {
    PluginApi.patch.after(
      'ImageInput',
      function () {
        const args =
          Array.prototype.slice.call(
            arguments
          );

        const split =
          splitPatchArgs(args);

        const componentProps =
          split.componentProps;
        const rendered = split.rendered;

        if (!rendered) {
          logPatchArgs(
            'ImageInput patch:',
            args
          );
          return null;
        }

        const tagId = getCurrentTagId();

        const enabled = !!(
          tagId &&
          componentProps &&
          componentProps.isEditing === true
        );

        if (!enabled) {
          return rendered;
        }

        log(
          'Injecting related tags bridge into Tag edit tree:',
          tagId
        );

        return createElement(
          Fragment,
          null,
          rendered,
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
      'ImageInput patch installed'
    );
  } else {
    logError(
      'PluginApi.patch.after is unavailable'
    );
  }

  // ============================================================
  // TagPage patch - for read-only view
  // ============================================================

  if (
    PluginApi.patch &&
    typeof PluginApi.patch.after ===
      'function'
  ) {
    PluginApi.patch.after(
      'TagPage',
      function () {
        const args =
          Array.prototype.slice.call(
            arguments
          );

        const split =
          splitPatchArgs(args);

        const componentProps =
          split.componentProps;
        const rendered = split.rendered;

        if (!rendered) {
          logPatchArgs(
            'TagPage patch:',
            args
          );
          return null;
        }

        const tag =
          componentProps &&
          componentProps.tag;
        const tagId = tag && tag.id;

        if (!tagId) {
          return rendered;
        }

        log(
          'TagPage patch: injecting RelatedTagsInline for tag',
          tagId
        );

        return createElement(
          Fragment,
          null,
          rendered,
          createElement(
            RelatedTagsInline,
            {
              key: 'tag-relations-inline-' + tagId,
              tagId: String(tagId),
            }
          )
        );
      }
    );

    log(
      'TagPage patch installed'
    );
  } else {
    logError(
      'PluginApi.patch.after is unavailable for TagPage'
    );
  }

  // ============================================================
  // Inline view
  //
  // This component does NOT need Apollo context, so it can
  // safely be mounted separately.
  // ============================================================

  function RelatedTagsInline(props) {
    const tagId =
      props.tagId;

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

      relations.map(
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
      )
    );
  }

  // ============================================================
  // Separate React mounting
  //
  // Used ONLY for the normal read-only tag page.
  // Never use this for TagIDSelect.
  // ============================================================

  function mountReact(
    container,
    element
  ) {
    if (!container) {
      throw new Error(
        'React mount container is missing'
      );
    }

    if (
      container.__tagRelationsRoot
    ) {
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
        ReactDOM.createRoot(
          container
        );

      root.render(element);

      container.__tagRelationsRoot =
        root;

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
        '.' +
          INLINE_ITEM_CLASS
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
      document.createElement(
        'div'
      );

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

    /*
     * Put after Sub Tags.
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
            tagId:
              String(tagId),
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
  // Native Save button
  // ============================================================

  function patchSaveButton(
    tagId,
    form
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

    /*
     * Stash disables Save whenever formik.dirty is false.
     *
     * The related tags field lives outside Formik, and
     * Stash exposes no Formik context, so formik.dirty
     * can never become true for our change. Neither
     * TagEditPanel nor DetailsEditNavbar is patchable.
     *
     * Enable the button ourselves while a change is
     * pending. It is only ever re-enabled, never
     * re-disabled: Stash re-disables it on its own
     * whenever its dirty state flips, and the poll
     * below restores it if that happens while our
     * change is still pending.
     */

    if (
      pendingRelationEdits.has(
        String(tagId)
      ) &&
      saveButton.disabled
    ) {
      saveButton.disabled = false;
      saveButton.removeAttribute(
        'disabled'
      );

      log(
        'Enabled Save for pending related tag changes:',
        tagId
      );
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

    /*
     * Capture phase.
     *
     * This runs before Stash's native save
     * handler, but does not prevent it.
     */

    saveButton.addEventListener(
      'click',
      function () {
        const key =
          String(tagId);

        const state =
          editStates.get(key);

        /*
         * Never overwrite relations if the
         * initial relation query has not completed.
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

        log(
          'Native Save clicked; captured related tags:',
          relationIds
        );

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
       * Successful Stash save normally destroys
       * the edit form.
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
          tagId:
            Number(tagId),

          related:
            relationIds,
        }
      );

      /*
       * UI has only one relation type:
       *
       *     Связанные теги
       *
       * Therefore all selected IDs are stored
       * as "related".
       *
       * Existing "similar" relations are cleared.
       */

      await runPluginOperation(
        'set_relations',
        {
          tag_id:
            Number(tagId),

          similar_ids:
            [],

          related_ids:
            relationIds,
        }
      );

      invalidateRelationCache(
        tagId
      );

      editStates.delete(
        String(tagId)
      );

      pendingRelationEdits.delete(
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
     * Read-only inline mounts.
     */

    document
      .querySelectorAll(
        '.' +
          INLINE_ITEM_CLASS
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
     * Edit portal hosts.
     *
     * The React component itself is owned by
     * Stash's React tree, so we do NOT unmount
     * it manually here.
     *
     * We only remove stale DOM hosts if they
     * are still present.
     */

    document
      .querySelectorAll(
        '.' +
          EDIT_FIELDS_CLASS +
          '[' +
          EDIT_HOST_MARKER +
          '="true"]'
      )
      .forEach(function (element) {
        if (
          element.isConnected
        ) {
          element.remove();
        }
      });

    editStates.clear();
  }

  // ============================================================
  // Tag page scan
  // ============================================================

  /*
   * Leaving edit mode (cancel, saved, or navigating
   * away) discards anything the user did not save.
   */
  function dropPendingEditState(tagId) {
    if (
      tagId === null ||
      tagId === undefined
    ) {
      return;
    }

    editStates.delete(String(tagId));

    pendingRelationEdits.delete(
      String(tagId)
    );
  }

  function scanTagPage() {
    const tagId =
      getCurrentTagId();

    /*
     * Not on a tag page.
     */

    if (!tagId) {
      if (
        currentTagId !== null
      ) {
        dropPendingEditState(currentTagId);
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
      dropPendingEditState(currentTagId);
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
     * IMPORTANT:
     *
     * Edit UI is now injected through the
     * ImageInput React patch.
     *
     * We do NOT mount another React tree here.
     */

    if (editForm) {
      patchSaveButton(
        tagId,
        editForm
      );

      return;
    }

    /*
     * Normal view: edit mode was left (cancel, saved,
     * or the form was torn down).
     */

    dropPendingEditState(tagId);

    installInlineRelations(
      tagId
    );
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
           * Allow Stash to finish rendering.
           */

          setTimeout(
            scanTagPage,
            0
          );
        }
      );

      routeListenerInstalled =
        true;

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
  // Start
  // ============================================================

  installRouteListener();

  startEditModePolling();

  scanTagPage();

  log(
    'loaded'
  );
})();
