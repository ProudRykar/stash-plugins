(function () {
  "use strict";

  const PLUGIN_ID = "many-studios";

  const MESSAGES = {
    en: {
      additionalStudios: "Additional Studios",
      addStudio: "+ Add Studio",
      addAdditionalStudios: "Add Additional Studios",
      noAdditionalStudios: "No additional studios",
      primary: "Primary",
      loading: "Loading...",
      loadingScenes: "Loading scenes...",
      searchStudios: "Search studios...",
      searchScenes: "Search scenes...",
      noResults: "No results",
      cancel: "Cancel",
      remove: "Remove",
      relatedScenes: "Scenes with this studio as additional",
      noLinkedScenes: "No scenes linked to this studio",
      saveFailed: "Failed to save studios",
      loadFailed: "Failed to load",
    },
    ru: {
      additionalStudios: "Дополнительные студии",
      addStudio: "+ Добавить студию",
      addAdditionalStudios: "Добавить дополнительные студии",
      noAdditionalStudios: "Нет дополнительных студий",
      primary: "Основная",
      loading: "Загрузка...",
      loadingScenes: "Загрузка сцен...",
      searchStudios: "Поиск студий...",
      searchScenes: "Поиск сцен...",
      noResults: "Ничего не найдено",
      cancel: "Отмена",
      remove: "Удалить",
      relatedScenes: "Сцены, где эта студия дополнительная",
      noLinkedScenes: "Нет сцен, связанных с этой студией",
      saveFailed: "Не удалось сохранить студии",
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
  const useRef = React.useRef;

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

  function getStudioUrl(id) {
    return "/studios/" + id;
  }

  function getSceneUrl(id) {
    return "/scenes/" + id;
  }

  function SceneAdditionalStudiosPanel(props) {
    const sceneId = props.sceneId;
    const [data, setData] = useState({ primary: null, additional: [] });
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);

    function load() {
      if (!sceneId) return;
      setLoading(true);
      runPluginOperation("list_scene_studios", { scene_id: sceneId })
        .then(function (result) {
          setData(result || { primary: null, additional: [] });
        })
        .catch(function (error) {
          logError("Failed to load studios", error);
        })
        .finally(function () {
          setLoading(false);
        });
    }

    useEffect(
      function () {
        load();
      },
      [sceneId]
    );

    function removeStudio(studioId) {
      runPluginOperation("remove_scene_studio", { scene_id: sceneId, studio_id: studioId })
        .then(function () {
          load();
        })
        .catch(function (error) {
          logError("Failed to remove studio", error);
          alert(t("saveFailed") + ": " + error.message);
        });
    }

    function addStudio(studioId) {
      runPluginOperation("add_scene_studio", { scene_id: sceneId, studio_id: studioId })
        .then(function () {
          setShowModal(false);
          load();
        })
        .catch(function (error) {
          logError("Failed to add studio", error);
          alert(t("saveFailed") + ": " + error.message);
        });
    }

    return createElement(
      "div",
      { className: "many-studios-panel" },
      createElement(
        "div",
        { className: "many-studios-header" },
        createElement("h5", { className: "many-studios-title" }, t("additionalStudios")),
        createElement(
          "button",
          {
            className: "btn btn-secondary btn-sm many-studios-add-btn",
            onClick: function () {
              setShowModal(true);
            },
          },
          t("addStudio")
        )
      ),
      loading
        ? createElement("div", { className: "many-studios-status" }, t("loading"))
        : createElement(
            Fragment,
            null,
            data.additional && data.additional.length > 0
              ? createElement(
                  "div",
                  { className: "many-studios-list" },
                  data.additional.map(function (studio) {
                    return createElement(
                      "div",
                      { key: studio.id, className: "many-studios-item" },
                      createElement(
                        "a",
                        { href: getStudioUrl(studio.id), className: "many-studios-link" },
                        studio.name
                      ),
                      createElement(
                        "button",
                        {
                          className: "many-studios-remove",
                          onClick: function () {
                            removeStudio(studio.id);
                          },
                          title: t("remove"),
                        },
                        "×"
                      )
                    );
                  })
                )
              : createElement("div", { className: "many-studios-empty" }, t("noAdditionalStudios"))
          ),
      showModal
        ? createElement(StudioSearchModal, {
            title: t("addAdditionalStudios"),
            onClose: function () {
              setShowModal(false);
            },
            onSelect: addStudio,
            exclude: [data.primary && data.primary.id].concat(
              (data.additional || []).map(function (s) {
                return s.id;
              })
            ),
          })
        : null
    );
  }

  function StudioSearchModal(props) {
    const [search, setSearch] = useState("");
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef(null);

    useEffect(
      function () {
        if (inputRef.current) inputRef.current.focus();
      },
      []
    );

    useEffect(
      function () {
        const timer = setTimeout(function () {
          if (search.trim().length >= 2) {
            doSearch();
          } else {
            setResults([]);
          }
        }, 300);
        return function () {
          clearTimeout(timer);
        };
      },
      [search]
    );

    function doSearch() {
      setLoading(true);
      runPluginOperation("find_studios", { search: search.trim(), per_page: 30 })
        .then(function (data) {
          const exclude = props.exclude || [];
          const excludeSet = {};
          exclude.forEach(function (id) {
            if (id) excludeSet[String(id)] = true;
          });
          const filtered = (data || []).filter(function (studio) {
            return !excludeSet[String(studio.id)];
          });
          setResults(filtered);
        })
        .catch(function (error) {
          logError("Search failed", error);
        })
        .finally(function () {
          setLoading(false);
        });
    }

    function handleSelect(studio) {
      props.onSelect(studio.id);
    }

    return createElement(
      "div",
      { className: "many-studios-modal-overlay", onClick: props.onClose },
      createElement(
        "div",
        { className: "many-studios-modal", onClick: function (e) { e.stopPropagation(); } },
        createElement(
          "div",
          { className: "many-studios-modal-header" },
          createElement("h4", null, props.title || t("addStudio")),
          createElement(
            "button",
            { className: "many-studios-modal-close", onClick: props.onClose },
            "×"
          )
        ),
        createElement(
          "div",
          { className: "many-studios-modal-body" },
          createElement("input", {
            ref: inputRef,
            type: "text",
            className: "many-studios-modal-input",
            value: search,
            onChange: function (e) { return setSearch(e.target.value); },
            placeholder: t("searchStudios"),
          }),
          loading
            ? createElement("div", { className: "many-studios-status" }, t("loading"))
            : createElement(
                "div",
                { className: "many-studios-modal-results" },
                results.length === 0 && search.trim().length >= 2
                  ? createElement("div", { className: "many-studios-empty" }, t("noResults"))
                  : results.map(function (studio) {
                      return createElement(
                        "button",
                        {
                          key: studio.id,
                          className: "many-studios-modal-result",
                          onClick: function () { return handleSelect(studio); },
                        },
                        studio.name
                      );
                    })
              )
        ),
        createElement(
          "div",
          { className: "many-studios-modal-footer" },
          createElement(
            "button",
            { className: "btn btn-secondary btn-sm", onClick: props.onClose },
            t("cancel")
          )
        )
      )
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
          createElement(SceneAdditionalStudiosPanel, { key: "many-studios-scene-" + sceneId, sceneId: sceneId })
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
