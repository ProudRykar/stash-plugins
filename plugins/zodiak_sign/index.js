(function () {
  "use strict";

  const PLUGIN_ID = "zodiak_sign";

  const PAGE_SELECTOR = "#performer-page";
  const GROUP_SELECTOR = ".quality-group";

  const BADGE_CLASS = "zodiak-sign-badge";
  const BADGE_NAME_CLASS = "zodiak-sign-name";

  const SCAN_INTERVAL = 500;

  /*
   * How long to wait for the PerformerPage patch before falling
   * back to a direct GraphQL request.
   */

  const FALLBACK_DELAY = 1000;

  const SVG_NS = "http://www.w3.org/2000/svg";
  const SVG_VIEW_BOX = "0 0 24 24";

  function log() {
    console.log("[Zodiac Sign]", ...arguments);
  }

  function logError() {
    console.error("[Zodiac Sign]", ...arguments);
  }

  // ============================================================
  // Localisation
  //
  // Stash writes <html lang="..."> from its interface.language
  // setting via react-helmet.
  // ============================================================

  const MESSAGES = {
    en: {
      signs: {
        aries: "Aries",
        taurus: "Taurus",
        gemini: "Gemini",
        cancer: "Cancer",
        leo: "Leo",
        virgo: "Virgo",
        libra: "Libra",
        scorpio: "Scorpio",
        sagittarius: "Sagittarius",
        capricorn: "Capricorn",
        aquarius: "Aquarius",
        pisces: "Pisces",
      },

      months: [
        "",
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ],
    },

    ru: {
      signs: {
        aries: "Овен",
        taurus: "Телец",
        gemini: "Близнецы",
        cancer: "Рак",
        leo: "Лев",
        virgo: "Дева",
        libra: "Весы",
        scorpio: "Скорпион",
        sagittarius: "Стрелец",
        capricorn: "Козерог",
        aquarius: "Водолей",
        pisces: "Рыбы",
      },

      months: [
        "",
        "января",
        "февраля",
        "марта",
        "апреля",
        "мая",
        "июня",
        "июля",
        "августа",
        "сентября",
        "октября",
        "ноября",
        "декабря",
      ],
    },
  };

  function getLanguage() {
    const lang = (document.documentElement && document.documentElement.lang) || "";

    return lang.toLowerCase().indexOf("ru") === 0 ? "ru" : "en";
  }

  function t() {
    const table = MESSAGES[getLanguage()];

    return table;
  }

  // ============================================================
  // Zodiac signs
  //
  // `start` is the first day of the sign encoded as MM * 100 + DD.
  // `end` is exclusive. Capricorn wraps around the new year and is
  // therefore matched with `wrap`.
  //
  // The twelve ranges form a contiguous partition of the year,
  // so there are no gaps and no overlapping cusps.
  //
  // Every glyph is a line drawing on a 24x24 grid and is stroked
  // with `currentColor`, so it inherits the badge colour.
  // ============================================================

  const SIGNS = [
    {
      id: "capricorn",
      start: 1222,
      end: 120,
      wrap: true,
      from: [12, 22],
      to: [1, 19],

      shapes: [
        {
          type: "path",
          d: "M3 17Q3 9.5 7.5 10.5Q10.5 11 8.5 15C11.5 15 13.5 11.5 15 8.5C16.5 5.5 20 6.5 19.5 10C19 14 16 18.5 12.5 20Q10.5 21 12.5 21.3Q16.5 22 20.5 18.5",
        },
      ],
    },

    {
      id: "aquarius",
      start: 120,
      end: 219,
      from: [1, 20],
      to: [2, 18],

      shapes: [
        {
          type: "path",
          d: "M3 8L6 5L9 8L12 5L15 8L18 5L21 8M3 15.5L6 12.5L9 15.5L12 12.5L15 15.5L18 12.5L21 15.5",
        },
      ],
    },

    {
      id: "pisces",
      start: 219,
      end: 321,
      from: [2, 19],
      to: [3, 20],

      shapes: [
        {
          type: "path",
          d: "M8 3.5A7 7 0 0 0 8 20.5M16 3.5A7 7 0 0 1 16 20.5M4 12H20",
        },
      ],
    },

    {
      id: "aries",
      start: 321,
      end: 420,
      from: [3, 21],
      to: [4, 19],

      shapes: [
        {
          type: "path",
          d: "M12 20.5V11.5M12 11.5A5 5 0 0 0 4.6 6.5M12 11.5A5 5 0 0 1 19.4 6.5",
        },
      ],
    },

    {
      id: "taurus",
      start: 420,
      end: 521,
      from: [4, 20],
      to: [5, 20],

      shapes: [
        {
          type: "path",
          d: "M7.9 10.8C6.6 8 3.5 6.6 4.6 3.2M16.1 10.8C17.4 8 20.5 6.6 19.4 3.2",
        },
        { type: "circle", cx: 12, cy: 15, r: 5.5 },
      ],
    },

    {
      id: "gemini",
      start: 521,
      end: 621,
      from: [5, 21],
      to: [6, 20],

      shapes: [
        {
          type: "path",
          d: "M9 3.5V20.5M15 3.5V20.5M6 3.5H18M6 20.5H18",
        },
      ],
    },

    {
      id: "cancer",
      start: 621,
      end: 723,
      from: [6, 21],
      to: [7, 22],

      shapes: [
        {
          type: "path",
          d: "M4 9.5a3.5 3.5 0 1 0 0 5h9M20 14.5a3.5 3.5 0 1 0 0 -5h-9",
        },
      ],
    },

    {
      id: "leo",
      start: 723,
      end: 823,
      from: [7, 23],
      to: [8, 22],

      shapes: [
        {
          type: "path",
          d: "M9.3 14.2C12 12 13.6 6.8 16.8 5.8C19.6 4.9 21.2 8.2 19.4 10.6C18 12.6 15.4 12.2 14.8 10.2",
        },
        { type: "circle", cx: 6.5, cy: 16.5, r: 3.5 },
      ],
    },

    {
      id: "virgo",
      start: 823,
      end: 923,
      from: [8, 23],
      to: [9, 22],

      shapes: [
        {
          type: "path",
          d: "M3.5 5.5V12Q3.5 16 6 16Q8.5 16 8.5 12V5.5M8.5 12Q8.5 16 11 16Q13.5 16 13.5 12V5.5M13.5 12Q13.5 16 16 14.8Q18.5 13.6 18.5 10.8Q18.5 8 16 8.6Q14.2 9.1 15.2 11.6Q16.2 14.2 20.5 15.8",
        },
      ],
    },

    {
      id: "libra",
      start: 923,
      end: 1023,
      from: [9, 23],
      to: [10, 22],

      shapes: [
        {
          type: "path",
          d: "M3 20.5H21M3 13H21M6.5 16.5A5.5 5.5 0 0 1 17.5 16.5",
        },
      ],
    },

    {
      id: "scorpio",
      start: 1023,
      end: 1122,
      from: [10, 23],
      to: [11, 21],

      shapes: [
        {
          type: "path",
          d: "M3.5 5V12Q3.5 15.5 6 15.5Q8.5 15.5 8.5 12V5M8.5 12Q8.5 15.5 11 15.5Q13.5 15.5 13.5 12V5M13.5 12Q13.5 15.5 16 15.5Q18.5 15.5 18.5 12V11.5Q18.5 8 21 8M18 5.2L21 8L18 10.8",
        },
      ],
    },

    {
      id: "sagittarius",
      start: 1122,
      end: 1222,
      from: [11, 22],
      to: [12, 21],

      shapes: [
        {
          type: "path",
          d: "M3.5 20.5H13.5M3.5 20.5L20.5 3.5M20.5 3.5H14.5M20.5 3.5V9.5",
        },
      ],
    },
  ];

  // ============================================================
  // Birthdate handling
  // ============================================================

  /*
   * Stash stores performer birthdates as "YYYY-MM-DD", but
   * hand edited values occasionally arrive with a missing or
   * zeroed part. Anything that is not a complete, real calendar
   * date is treated as "no birthdate".
   */

  function parseBirthdate(value) {
    if (!value || typeof value !== "string") {
      return null;
    }

    const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) {
      return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }

    const date = new Date(Date.UTC(year, month - 1, day));

    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }

    return { year: year, month: month, day: day };
  }

  function getSign(birthdate) {
    if (!birthdate) {
      return null;
    }

    const key = birthdate.month * 100 + birthdate.day;

    for (let i = 0; i < SIGNS.length; i++) {
      const sign = SIGNS[i];

      if (sign.wrap) {
        if (key >= sign.start || key < sign.end) {
          return sign;
        }

        continue;
      }

      if (key >= sign.start && key < sign.end) {
        return sign;
      }
    }

    return null;
  }

  function formatRange(sign) {
    const months = t().months;

    const from = months[sign.from[0]] + " " + sign.from[1];

    const to = months[sign.to[0]] + " " + sign.to[1];

    return from + " \u2013 " + to;
  }

  function getSignTitle(sign) {
    return t().signs[sign.id] + " (" + formatRange(sign) + ")";
  }

  // ============================================================
  // GraphQL
  // ============================================================

  async function callGQL(query, variables) {
    const response = await fetch("/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        query: query,
        variables: variables || {},
      }),
    });

    if (!response.ok) {
      throw new Error("HTTP " + response.status + ": " + response.statusText);
    }

    const result = await response.json();

    if (result.errors) {
      throw new Error(
        result.errors
          .map(function (error) {
            return error.message;
          })
          .join(", "),
      );
    }

    return result.data || {};
  }

  async function getSetting(name) {
    try {
      const data = await callGQL(
        `
          query ZodiakSignConfiguration {
            configuration {
              plugins
            }
          }
        `,
      );

      const plugins = data.configuration && data.configuration.plugins;

      if (!plugins) {
        return null;
      }

      const config = plugins[PLUGIN_ID];

      if (!config) {
        return null;
      }

      return config[name] === undefined ? null : config[name];
    } catch (error) {
      logError("Failed to read plugin setting:", error);

      return null;
    }
  }

  async function fetchPerformerBirthdate(performerId) {
    const data = await callGQL(
      `
        query ZodiakSignPerformer($id: ID!) {
          findPerformer(id: $id) {
            id
            birthdate
          }
        }
      `,
      { id: String(performerId) },
    );

    const performer = data.findPerformer;

    return performer ? performer.birthdate || null : null;
  }

  // ============================================================
  // State
  // ============================================================

  /*
   * performerId -> { birthdate, sign }
   *
   * The React patch normally fills this in for free, so the
   * cache mainly avoids re-deriving the sign on every render.
   */

  const performerCache = new Map();

  /*
   * Performer ids whose birthdate is currently being fetched.
   *
   * Only used by the GraphQL fallback, which runs when the
   * PerformerPage patch is unavailable.
   */

  const pendingRequests = new Set();

  let currentPerformerId = null;
  let currentSign = null;
  let showName = false;

  let observer = null;
  let observerTarget = null;
  let installScheduled = false;
  let routeListenerInstalled = false;

  const PluginApi = window.PluginApi;

  // ============================================================
  // Badge
  // ============================================================

  function createShape(shape) {
    if (shape.type === "circle") {
      const circle = document.createElementNS(SVG_NS, "circle");

      circle.setAttribute("cx", String(shape.cx));
      circle.setAttribute("cy", String(shape.cy));
      circle.setAttribute("r", String(shape.r));

      return circle;
    }

    const path = document.createElementNS(SVG_NS, "path");

    path.setAttribute("d", shape.d);

    return path;
  }

  function createBadge(sign) {
    const badge = document.createElement("span");

    badge.className = BADGE_CLASS;

    badge.setAttribute("data-sign", sign.id);

    badge.setAttribute("role", "img");

    const title = getSignTitle(sign);

    badge.setAttribute("title", title);
    badge.setAttribute("aria-label", title);

    const svg = document.createElementNS(SVG_NS, "svg");

    svg.setAttribute("viewBox", SVG_VIEW_BOX);
    svg.setAttribute("focusable", "false");
    svg.setAttribute("aria-hidden", "true");

    sign.shapes.forEach(function (shape) {
      svg.appendChild(createShape(shape));
    });

    badge.appendChild(svg);

    if (showName) {
      const name = document.createElement("span");

      name.className = BADGE_NAME_CLASS;

      name.textContent = t().signs[sign.id];

      badge.appendChild(name);
    }

    return badge;
  }

  function matchesBadge(badge, sign) {
    if (!badge) {
      return false;
    }

    if (badge.getAttribute("data-sign") !== sign.id) {
      return false;
    }

    const hasName = !!badge.querySelector("." + BADGE_NAME_CLASS);

    return hasName === showName;
  }

  function removeBadges() {
    document.querySelectorAll("." + BADGE_CLASS).forEach(function (badge) {
      badge.remove();
    });
  }

  // ============================================================
  // Installation
  //
  // .quality-group is owned by React, so the badge is injected
  // as plain DOM and rebuilt whenever Stash re-renders that
  // container.
  // ============================================================

  function install() {
    installScheduled = false;

    const page = document.querySelector(PAGE_SELECTOR);

    if (!page || currentPerformerId === null || !currentSign) {
      if (document.querySelector("." + BADGE_CLASS)) {
        removeBadges();
      }

      return;
    }

    const groups = page.querySelectorAll(GROUP_SELECTOR);

    if (!groups.length) {
      if (document.querySelector("." + BADGE_CLASS)) {
        removeBadges();
      }

      return;
    }

    const sign = currentSign;

    groups.forEach(function (group) {
      const badge = group.querySelector("." + BADGE_CLASS);

      if (matchesBadge(badge, sign)) {
        return;
      }

      if (badge) {
        badge.remove();
      }

      group.appendChild(createBadge(sign));
    });

    /*
     * Stash also renders a collapsed header variant. Remove
     * badges that are no longer part of a quality group so a
     * stale copy can never linger.
     */

    document.querySelectorAll("." + BADGE_CLASS).forEach(function (badge) {
      if (badge.closest(GROUP_SELECTOR) === null) {
        badge.remove();
      }
    });
  }

  function scheduleInstall() {
    if (installScheduled) {
      return;
    }

    installScheduled = true;

    /*
     * React may still be committing when this runs, so defer to
     * the next frame. Older environments without rAF fall back
     * to a timeout.
     */

    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(function () {
        install();
      });

      return;
    }

    setTimeout(install, 16);
  }

  function ensureObserver() {
    const page = document.querySelector(PAGE_SELECTOR);

    if (!page) {
      return;
    }

    if (observer && observerTarget === page) {
      return;
    }

    if (observer) {
      observer.disconnect();
    }

    observerTarget = page;

    observer = new MutationObserver(function () {
      scheduleInstall();
    });

    observer.observe(page, {
      childList: true,
      subtree: true,
    });
  }

  // ============================================================
  // Performer data
  // ============================================================

  function applyPerformer(performerId, birthdate, source) {
    const key = String(performerId);

    performerCache.set(key, {
      birthdate: birthdate || null,
      source: source,
    });

    if (currentPerformerId === null || key !== String(currentPerformerId)) {
      return;
    }

    currentSign = getSign(parseBirthdate(birthdate));

    scheduleInstall();

    log("Performer", performerId, "->", currentSign ? currentSign.id : "none");
  }

  /*
   * Fallback for the case where PerformerPage is not patchable.
   * Only issues one request per performer.
   */

  async function requestPerformerData(performerId) {
    const key = String(performerId);

    if (pendingRequests.has(key)) {
      return;
    }

    pendingRequests.add(key);

    try {
      const birthdate = await fetchPerformerBirthdate(performerId);

      /*
       * The PerformerPage patch is the primary source and normally
       * answers first. This request is only a fallback, so its
       * result must never overwrite data the patch already gave
       * us - including when that data legitimately contains no
       * birthdate.
       */

      const cached = performerCache.get(key);

      if (cached && cached.source === "patch") {
        log("Ignoring fallback response; the patch already supplied data");

        return;
      }

      applyPerformer(performerId, birthdate, "graphql");
    } catch (error) {
      logError("Failed to load performer birthdate:", error);

      performerCache.set(key, {
        birthdate: null,
        source: "graphql",
        failed: true,
      });
    } finally {
      pendingRequests.delete(key);
    }
  }

  function setPerformer(performerId) {
    const id = performerId === null ? null : Number(performerId);

    if (id === currentPerformerId) {
      scheduleInstall();

      return;
    }

    currentPerformerId = id;
    currentSign = null;

    if (id === null) {
      removeBadges();

      log("Left the performer page");

      return;
    }

    const key = String(id);

    const cached = performerCache.get(key);

    if (cached) {
      currentSign = getSign(parseBirthdate(cached.birthdate));

      scheduleInstall();

      return;
    }

    log("Performer", id, "- waiting for the page to provide data");

    /*
     * The PerformerPage patch fires while React renders, which
     * happens before this code observes the URL. Waiting a short
     * while avoids a request in the normal case.
     */

    setTimeout(function () {
      if (String(currentPerformerId) !== key) {
        return;
      }

      const entry = performerCache.get(key);

      if (entry && entry.source === "patch") {
        return;
      }

      requestPerformerData(id);
    }, FALLBACK_DELAY);
  }

  // ============================================================
  // Routing
  // ============================================================

  function getPerformerId() {
    const match = window.location.pathname.match(/^\/performers\/(\d+)(?:\/|$)/);

    if (!match) {
      return null;
    }

    const id = parseInt(match[1], 10);

    return Number.isFinite(id) ? id : null;
  }

  function onLocationChange() {
    setPerformer(getPerformerId());
  }

  function installRouteListener() {
    if (routeListenerInstalled) {
      return;
    }

    if (
      PluginApi &&
      PluginApi.Event &&
      typeof PluginApi.Event.addEventListener === "function"
    ) {
      PluginApi.Event.addEventListener("stash:location", function () {
        /*
         * Let Stash finish rendering before touching the DOM.
         */

        setTimeout(onLocationChange, 0);
      });

      routeListenerInstalled = true;

      log("Stash route listener installed");
    }
  }

  // ============================================================
  // PerformerPage patch
  //
  // Stash renders the page through PatchComponent("PerformerPage"),
  // so the performer object - including its birthdate - is handed
  // over directly without any extra request.
  // ============================================================

  function installPerformerPatch() {
    if (
      !PluginApi ||
      !PluginApi.patch ||
      typeof PluginApi.patch.after !== "function"
    ) {
      logError("PluginApi.patch.after is unavailable");

      return;
    }

    PluginApi.patch.after("PerformerPage", function () {
      const args = Array.prototype.slice.call(arguments);

      const rendered = args.length ? args[args.length - 1] : null;

      const componentProps = args.length ? args[0] : null;

      const performer = componentProps && componentProps.performer;

      if (performer && performer.id) {
        applyPerformer(performer.id, performer.birthdate, "patch");
      }

      /*
       * The render result is always the last argument. Anything
       * else would break the page.
       */

      return rendered;
    });

    log("PerformerPage patch installed");
  }

  // ============================================================
  // Scan loop
  // ============================================================

  function scan() {
    try {
      ensureObserver();

      if (currentPerformerId === null) {
        const id = getPerformerId();

        if (id !== null) {
          setPerformer(id);
        }
      }

      scheduleInstall();
    } catch (error) {
      logError("Performer page scan failed:", error);
    }
  }

  // ============================================================
  // Start
  // ============================================================

  async function loadSettings() {
    const value = await getSetting("showName");

    showName = value === true;

    scheduleInstall();
  }

  installRouteListener();

  installPerformerPatch();

  loadSettings();

  scan();

  setInterval(scan, SCAN_INTERVAL);

  log("loaded");
})();
