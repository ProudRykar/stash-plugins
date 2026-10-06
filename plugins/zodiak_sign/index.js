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
  const SVG_VIEW_BOX = "0 0 12 12";

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
  // `glyph` holds the path data of the sign symbol by Denis
  // Moskowitz, published on Wikimedia Commons under CC BY-SA 4.0.
  // See CREDITS.md for the full terms.
  //
  // The artwork uses a 12x12 viewBox and is a stroke-only line
  // drawing, so the badge colours it entirely through CSS.
  // ============================================================

  const SIGNS = [
    {
      id: "capricorn",
      start: 1222,
      end: 120,
      wrap: true,
      from: [12, 22],
      to: [1, 19],

      glyph:
        "M.85 4.333h1.667L4.183 11 5.85 4.333h3.333A1.666 1.666 0 1 0 7.74 3.5l2.887 5a1.667 1.667 0 1 1-3.11.833",
    },

    {
      id: "aquarius",
      start: 120,
      end: 219,
      from: [1, 20],
      to: [2, 18],

      glyph:
        "M1 7.75a1.77 1.77 0 0 1 2.5 0 1.767 1.767 0 0 0 2.5 0 1.77 1.77 0 0 1 2.5 0 1.767 1.767 0 0 0 2.5 0M1 4.25a1.77 1.77 0 0 1 2.5 0 1.767 1.767 0 0 0 2.5 0 1.77 1.77 0 0 1 2.5 0 1.767 1.767 0 0 0 2.5 0",
    },

    {
      id: "pisces",
      start: 219,
      end: 321,
      from: [2, 19],
      to: [3, 20],

      glyph:
        "M9.125 1.67a5 5 0 0 0 0 8.66m-6.25 0a5 5 0 0 0 0-8.66M1 5.998h10.003",
    },

    {
      id: "aries",
      start: 321,
      end: 420,
      from: [3, 21],
      to: [4, 19],

      glyph:
        "M1.732 5.418A2.5 2.5 0 1 1 6 3.65a2.5 2.5 0 1 1 4.268 1.768M6 3.65v7.5",
    },

    {
      id: "taurus",
      start: 420,
      end: 521,
      from: [4, 20],
      to: [5, 20],

      glyph:
        "M9.333 7.517a3.333 3.333 0 1 0-6.666-.001 3.333 3.333 0 0 0 6.666 0zM2.667.85a3.333 3.333 0 1 0 6.666 0",
    },

    {
      id: "gemini",
      start: 521,
      end: 621,
      from: [5, 21],
      to: [6, 20],

      glyph:
        "M3.5 2.022v7.956m5-7.956v7.956M11 1A9.995 9.995 0 0 1 1 1m10 10a10.001 10.001 0 0 0-10 0",
    },

    {
      id: "cancer",
      start: 621,
      end: 723,
      from: [6, 21],
      to: [7, 22],

      glyph:
        "M11 6a1.667 1.667 0 1 0-3.334 0A1.667 1.667 0 0 0 11 6zM1 6a1.667 1.667 0 1 0 3.334 0A1.667 1.667 0 0 0 1 6zm10 0a5 5 0 0 0-8.535-3.535M1 6a5 5 0 0 0 8.535 3.535",
    },

    {
      id: "leo",
      start: 723,
      end: 823,
      from: [7, 23],
      to: [8, 22],

      glyph:
        "M4.75 7.25C4.75 6 3.5 4.75 3.5 3.5a2.5 2.5 0 0 1 5 0c0 2.5-1.25 3.75-1.25 6.25a1.25 1.25 0 0 0 2.5 0m-5-2.5a1.25 1.25 0 1 0-2.5 0 1.25 1.25 0 0 0 2.5 0zm0 0",
    },

    {
      id: "virgo",
      start: 823,
      end: 923,
      from: [8, 23],
      to: [9, 22],

      glyph:
        "M1.366 4.384A1.25 1.25 0 1 1 3.5 3.5v5m5-3.75a1.25 1.25 0 0 1 2.5 0A3.75 3.75 0 0 1 7.25 8.5M6 3.5a1.25 1.25 0 0 1 2.5 0v5c0 .69.56 1.25 1.25 1.25M3.5 3.5a1.25 1.25 0 0 1 2.5 0v5",
    },

    {
      id: "libra",
      start: 923,
      end: 1023,
      from: [9, 23],
      to: [10, 22],

      glyph: "M1 6h2.5a2.5 2.5 0 0 1 5 0H11M1 8.5h10",
    },

    {
      id: "scorpio",
      start: 1023,
      end: 1122,
      from: [10, 23],
      to: [11, 21],

      glyph:
        "M10.009 8.241v-1.25h1.25M1.366 4.384A1.25 1.25 0 1 1 3.5 3.5v5m0-5a1.25 1.25 0 0 1 2.5 0v5m0-5a1.25 1.25 0 0 1 2.5 0v5a1.25 1.25 0 1 0 2.134-.884l-.5-.5",
    },

    {
      id: "sagittarius",
      start: 1122,
      end: 1222,
      from: [11, 22],
      to: [12, 21],

      glyph: "m3.456 3.544 5 5m-7.5 2.5 10-10m-2.5 0h2.5v2.5",
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

  function createGlyph(sign) {
    const svg = document.createElementNS(SVG_NS, "svg");

    svg.setAttribute("viewBox", SVG_VIEW_BOX);
    svg.setAttribute("focusable", "false");
    svg.setAttribute("aria-hidden", "true");

    const path = document.createElementNS(SVG_NS, "path");

    path.setAttribute("d", sign.glyph);

    svg.appendChild(path);

    return svg;
  }

  function createBadge(sign) {
    const badge = document.createElement("span");

    badge.className = BADGE_CLASS;

    badge.setAttribute("data-sign", sign.id);

    badge.setAttribute("role", "img");

    const title = getSignTitle(sign);

    badge.setAttribute("title", title);
    badge.setAttribute("aria-label", title);

    const svg = createGlyph(sign);

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
