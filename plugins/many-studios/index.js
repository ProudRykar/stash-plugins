(function () {
  "use strict";

  const PLUGIN_ID = "many-studios";

  const MESSAGES = {
    en: {
      otherStudios: "Other Studios",
      loading: "Loading...",
      loadingScenes: "Loading scenes...",
      relatedScenes: "Scenes with this studio as additional",
      noLinkedScenes: "No scenes linked to this studio",
      saveFailed: "Failed to save studios",
      selectorError: "Studio selector is unavailable",
      loadFailed: "Failed to load",
    },
    ru: {
      otherStudios: "Другие студии",
      loading: "Загрузка...",
      loadingScenes: "Загрузка сцен...",
      relatedScenes: "Сцены, где эта студия дополнительная",
      noLinkedScenes: "Нет сцен, связанных с этой студией",
      saveFailed: "Не удалось сохранить студии",
      selectorError: "Селектор студий недоступен",
      loadFailed: "Не удалось загрузить",
    },
  };

  function getLanguage() {
    const lang = (document.documentElement && document.documentElement.lang) || "";
    return lang.toLowerCase().indexOf("ru") === 0 ? "ru" : "en";
  }

  function t(key) {
    const table = MESSAGES[getLanguage()];
    return table[key] !== undefined ? table[key] : key;
  }

  const PluginApi = window.PluginApi;

  if (!PluginApi) {
    console.error("[Many Studios] PluginApi unavailable");
    return;
  }

  const React = PluginApi.React;
  const ReactDOM = PluginApi.ReactDOM;

  if (!React || !ReactDOM) {
    console.error("[Many Studios] React/ReactDOM unavailable");
    return;
  }

  const createElement = React.createElement;
  const Fragment = React.Fragment;
  const useState = React.useState;
  const useEffect = React.useEffect;

  function log(...args) {
    console.log("[Many Studios]", ...args);
  }

  function logError(...args) {
    console.error("[Many Studios]", ...args);
  }

  async function runPluginOperation(operation, args) {
    const query = `
      mutation($id: ID!, $args: Map) {
        runPluginOperation(plugin_id: $id, args: $args)
      }
    `;

    const variables = {
      id: PLUGIN_ID,
      args: Object.assign({ operation: operation }, args || {}),
    };

    const response = await fetch("/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({ query: query, variables: variables }),
    });

    if (!response.ok) {
      throw new Error("HTTP " + response.status + ": " + response.statusText);
    }

    const result = await response.json();

    if (result.errors) {
      throw new Error(
        result.errors.map(function (e) {
          return e.message;
        }).join(", ")
      );
    }

    let data = result.data && result.data.runPluginOperation;

    if (data === null || data === undefined) {
      throw new Error("Plugin returned an empty response");
    }

    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch (error) {
        // keep original
      }
    }

    if (data && typeof data === "object" && Object.prototype.hasOwnProperty.call(data, "ok")) {
      if (!data.ok) {
        let message = "Operation failed";
        if (data.error) {
          if (typeof data.error === "object") {
            message = data.error.message || message;
          } else {
            message = String(data.error);
          }
        }
        throw new Error(message);
      }
      if (Object.prototype.hasOwnProperty.call(data, "output")) {
        return data.output;
      }
      if (Object.prototype.hasOwnProperty.call(data, "data")) {
        return data.data;
      }
      return data;
    }

    return data;
  }

  function getCurrentId(regex) {
    const match = window.location.pathname.match(regex);
    if (!match) return null;
    const id = parseInt(match[1], 10);
    return Number.isFinite(id) ? id : null;
  }

  function getSceneUrl(id) {
    return "/scenes/" + id;
  }

  function getNativeStudioIDSelect() {
    const components = PluginApi.components;

    if (!components) {
      return null;
    }

    const component = components.StudioIDSelect;

    if (typeof component !== "function" && typeof component !== "object") {
      return null;
    }

    return component;
  }

  function createSceneAdditionalStudiosHost(sceneId) {
    const scenePage =
      document.querySelector("#scene-page") ||
      document.querySelector(".scene-tabs");

    if (!scenePage) {
      return null;
    }

    const existing = Array.from(
      scenePage.querySelectorAll(".many-studios-inline-item"),
    ).find(function (item) {
      return item.getAttribute("data-scene-id") === String(sceneId);
    });

    if (existing) {
      return existing.querySelector(".many-studios-inline-mount");
    }

    const detailGroup = scenePage.querySelector(".detail-group");
    const studioField = detailGroup
      ? detailGroup.querySelector(
          ".detail-item.studio, .detail-item.studios, .detail-item[data-field='studio']",
        )
      : null;

    const sceneHeader = scenePage.querySelector(".scene-header-container");
    const studioLogo = scenePage.querySelector(
      ".scene-header-container h1.studio-logo",
    );
    const anchor = studioField || sceneHeader || studioLogo || detailGroup;

    if (!anchor) {
      return null;
    }

    const item = document.createElement("div");
    item.className = "detail-item many-studios-inline-item";
    item.setAttribute("data-scene-id", String(sceneId));

    if (!studioField && (studioLogo || sceneHeader)) {
      item.classList.add("many-studios-inline-header");
    }

    const title = document.createElement("span");
    title.className = "detail-item-title";
    title.textContent = t("otherStudios") + ":";

    const value = document.createElement("span");
    value.className = "detail-item-value many-studios-inline-value";

    const mount = document.createElement("span");
    mount.className = "many-studios-inline-mount";

    value.appendChild(mount);
    item.appendChild(title);
    item.appendChild(value);

    if (studioField || studioLogo || sceneHeader) {
      anchor.insertAdjacentElement("afterend", item);
    } else {
      anchor.appendChild(item);
    }

    return mount;
  }

  function SceneAdditionalStudiosInline(props) {
    const sceneId = props.sceneId;
    const [data, setData] = useState(null);
    const [selectedIds, setSelectedIds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState(null);

    useEffect(
      function () {
        let cancelled = false;

        runPluginOperation("list_scene_studios", { scene_id: sceneId })
          .then(function (result) {
            if (cancelled) {
              return;
            }

            const normalized = result || { primary: null, additional: [] };
            const additional = normalized.additional || [];

            setData(normalized);
            setSelectedIds(
              additional.map(function (studio) {
                return String(studio.id);
              }),
            );
          })
          .catch(function (error) {
            if (!cancelled) {
              logError("Failed to load studios", error);
              setLoadError(error);
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
      [sceneId],
    );

    function handleSelect(studios) {
      const previousIds = selectedIds.slice();
      const primaryId = data && data.primary ? Number(data.primary.id) : null;
      const uniqueIds = [];
      const seen = new Set();

      (Array.isArray(studios) ? studios : []).forEach(function (studio) {
        if (!studio || studio.id === undefined || studio.id === null) {
          return;
        }

        const id = Number(studio.id);

        if (!Number.isFinite(id) || id === primaryId || seen.has(id)) {
          return;
        }

        seen.add(id);
        uniqueIds.push(id);
      });

      const nextIds = uniqueIds.map(function (id) {
        return String(id);
      });

      if (previousIds.join(",") === nextIds.join(",")) {
        return;
      }

      setSelectedIds(nextIds);
      setSaving(true);

      runPluginOperation("set_scene_studios", {
        scene_id: sceneId,
        studio_ids: uniqueIds,
      })
        .then(function (result) {
          const normalized = result || { primary: data && data.primary, additional: [] };
          const additional = normalized.additional || [];

          setData(normalized);
          setSelectedIds(
            additional.map(function (studio) {
              return String(studio.id);
            }),
          );
        })
        .catch(function (error) {
          logError("Failed to save studios", error);
          setSelectedIds(previousIds);
          alert(t("saveFailed") + ": " + error.message);
        })
        .finally(function () {
          setSaving(false);
        });
    }

    if (loading || !props.nativeReady) {
      return createElement(
        "span",
        { className: "many-studios-inline-status text-muted" },
        t("loading"),
      );
    }

    if (loadError) {
      return createElement(
        "span",
        { className: "many-studios-inline-error text-danger" },
        t("loadFailed") + ": " + loadError.message,
      );
    }

    const StudioIDSelect = getNativeStudioIDSelect();

    if (!StudioIDSelect) {
      return createElement(
        "span",
        { className: "many-studios-inline-error text-danger" },
        t("selectorError"),
      );
    }

    return createElement(StudioIDSelect, {
      isMulti: true,
      ids: selectedIds,
      excludeIds:
        data && data.primary ? [String(data.primary.id)] : [],
      onSelect: handleSelect,
      creatable: false,
      isDisabled: saving,
    });
  }

  function SceneAdditionalStudiosBridge(props) {
    const sceneId = props.sceneId;
    const [target, setTarget] = useState(null);
    const [nativeReady, setNativeReady] = useState(
      !!getNativeStudioIDSelect(),
    );

    useEffect(
      function () {
        let cancelled = false;
        let observer = null;

        function ensureHost() {
          const mount = createSceneAdditionalStudiosHost(sceneId);

          if (mount && mount !== target) {
            setTarget(mount);
          }
        }

        ensureHost();

        observer = new MutationObserver(function () {
          const current = document.querySelector(
            ".many-studios-inline-item[data-scene-id='" + sceneId + "'] .many-studios-inline-mount",
          );

          if (!current || !current.isConnected) {
            ensureHost();
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });

        async function loadNativeComponent() {
          if (!getNativeStudioIDSelect()) {
            const loadable =
              PluginApi.loadableComponents &&
              PluginApi.loadableComponents.Studios;

            if (
              loadable &&
              PluginApi.utils &&
              typeof PluginApi.utils.loadComponents === "function"
            ) {
              await PluginApi.utils.loadComponents([loadable]);
            }
          }

          if (!cancelled) {
            setNativeReady(true);
          }
        }

        loadNativeComponent().catch(function (error) {
          logError("Failed to load native StudioIDSelect", error);

          if (!cancelled) {
            setNativeReady(true);
          }
        });

        return function () {
          cancelled = true;

          if (observer) {
            observer.disconnect();
          }

          const item = document.querySelector(
            ".many-studios-inline-item[data-scene-id='" + sceneId + "']",
          );

          if (item) {
            item.remove();
          }
        };
      },
      [sceneId],
    );

    if (!target) {
      return null;
    }

    return ReactDOM.createPortal(
      createElement(SceneAdditionalStudiosInline, {
        sceneId: sceneId,
        nativeReady: nativeReady,
      }),
      target,
    );
  }

  function StudioAdditionalScenesPanel(props) {
    const studioId = props.studioId;
    const [scenes, setScenes] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);

    function load(currentPage) {
      if (!studioId) return;
      setLoading(true);
      runPluginOperation("list_studio_scenes", { studio_id: studioId, page: currentPage, per_page: 40 })
        .then(function (result) {
          setScenes((result && result.scenes) || []);
          setTotal((result && result.total) || 0);
          setPage(currentPage);
        })
        .catch(function (error) {
          logError("Failed to load scenes", error);
        })
        .finally(function () {
          setLoading(false);
        });
    }

    useEffect(
      function () {
        setPage(1);
        load(1);
      },
      [studioId]
    );

    const hasMore = total > page * 40;

    return createElement(
      "div",
      { className: "many-studios-studio-section" },
      createElement("h5", { className: "many-studios-title" }, t("relatedScenes")),
      loading
        ? createElement("div", { className: "many-studios-status" }, t("loadingScenes"))
        : createElement(
            Fragment,
            null,
            scenes.length === 0
              ? createElement("div", { className: "many-studios-empty" }, t("noLinkedScenes"))
              : createElement(
                  "div",
                  { className: "many-studios-scene-list" },
                  scenes.map(function (scene) {
                    return createElement(
                      "div",
                      { key: scene.id, className: "many-studios-scene-item" },
                      createElement(
                        "a",
                        { href: getSceneUrl(scene.id), className: "many-studios-scene-link" },
                        scene.title || ("Scene #" + scene.id)
                      ),
                      scene.date
                        ? createElement("span", { className: "many-studios-scene-date" }, scene.date)
                        : null
                    );
                  })
                ),
            hasMore
              ? createElement(
                  "button",
                  {
                    className: "btn btn-secondary btn-sm many-studios-more-btn",
                    onClick: function () {
                      load(page + 1);
                    },
                  },
                  "Load more"
                )
              : null
          )
    );
  }

  // Patch ScenePage if possible
  if (PluginApi.patch && typeof PluginApi.patch.after === "function") {
    try {
      PluginApi.patch.after("ScenePage", function () {
        const args = Array.prototype.slice.call(arguments);
        let rendered = args[args.length - 1];
        if (!React.isValidElement(rendered)) return rendered;
        const props = args[0] || {};
        const scene = props.scene;
        const sceneId = scene && scene.id ? parseInt(scene.id, 10) : getCurrentId(/^\/scenes\/(\d+)/);
        if (!sceneId) return rendered;
        return createElement(
          Fragment,
          null,
          rendered,
          createElement(SceneAdditionalStudiosBridge, {
            key: "many-studios-scene-" + sceneId,
            sceneId: sceneId,
          }),
        );
      });
      log("ScenePage patch installed");
    } catch (error) {
      logError("ScenePage patch failed", error);
    }
  }

  // Patch StudioPage if possible
  if (PluginApi.patch && typeof PluginApi.patch.after === "function") {
    try {
      PluginApi.patch.after("StudioPage", function () {
        const args = Array.prototype.slice.call(arguments);
        let rendered = args[args.length - 1];
        if (!React.isValidElement(rendered)) return rendered;
        const props = args[0] || {};
        const studio = props.studio;
        const studioId = studio && studio.id ? parseInt(studio.id, 10) : getCurrentId(/^\/studios\/(\d+)/);
        if (!studioId) return rendered;
        return createElement(
          Fragment,
          null,
          rendered,
          createElement(StudioAdditionalScenesPanel, { key: "many-studios-studio-" + studioId, studioId: studioId })
        );
      });
      log("StudioPage patch installed");
    } catch (error) {
      logError("StudioPage patch failed", error);
    }
  }

  log("loaded");
})();
