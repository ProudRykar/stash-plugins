(function () {
  "use strict";

  const PLUGIN_ID = "external-ass-subtitles";

  const JASSUB_BASE =
    "/plugin/external-ass-subtitles/assets/jassub";

  let currentSceneId = null;

  let tracks = [];

  let isEnabled = true;

  let useNativeCc = true;

  let selectedTrack = -1;

  let player = null;

  let videoElement = null;

  let jassubInstance = null;

  let jassubLoaded = false;

  let workerBlobUrl = null;

  let overlayDiv = null;

  let overlayCanvas = null;

  let overlayParent = null;

  let positionRAF = null;

  let videoPollTimer = null;

  let btnEl = null;

  let menuEl = null;

  const externalAssTracks = new Map();

  const externalTextTracks = new Map();

  function log(...args) {
    console.log("[External ASS]", ...args);
  }

  function warn(...args) {
    console.warn("[External ASS]", ...args);
  }

  function getTrackFormat(track) {
    return (
      track.format ||
      track.filename?.split(".").pop() ||
      ""
    ).toLowerCase();
  }

  function isJassubTrack(track) {
    const format = getTrackFormat(track);
    return format === "ass" || format === "ssa";
  }

  function isTextTrack(track) {
    const format = getTrackFormat(track);
    return format === "srt" || format === "vtt";
  }

  function srtToVtt(srt) {
    const normalized = srt
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .trim();

    const blocks = normalized
      .split(/\n{2,}/)
      .map((block) => {
        const lines = block.split("\n");

        // Убираем номер cue.
        if (/^\d+$/.test(lines[0].trim())) {
          lines.shift();
        }

        if (!lines.length) {
          return "";
        }

        // SRT: 00:00:01,000 --> 00:00:03,000
        // VTT: 00:00:01.000 --> 00:00:03.000
        return lines
          .join("\n")
          .replace(
            /(\d{2}:\d{2}:\d{2}),(\d{3})/g,
            "$1.$2",
          );
      })
      .filter(Boolean);

    return `WEBVTT\n\n${blocks.join("\n\n")}\n`;
  }

  function addTextTrackToVjs(track, index) {
    if (!player) {
      warn(
        "Cannot add text track: Video.js player unavailable.",
      );
      return null;
    }

    const format = getTrackFormat(track);

    let vttContent;

    if (format === "srt") {
      vttContent = srtToVtt(track.text);
    } else if (format === "vtt") {
      vttContent = track.text.trim();

      if (!vttContent.startsWith("WEBVTT")) {
        vttContent = `WEBVTT\n\n${vttContent}`;
      }
    } else {
      return null;
    }

    const url =
      "data:text/vtt;charset=utf-8," +
      encodeURIComponent(vttContent);

    try {
      const remoteTrack =
        player.addRemoteTextTrack(
          {
            kind: "captions",
            label:
              track.label ||
              track.filename ||
              `Track ${index + 1}`,
            language:
              track.language ||
              `und-${index}`,
            src: url,
            default: false,
          },
          true,
        );

      if (!remoteTrack) {
        warn(
          "Failed to create Video.js text track.",
        );
        return null;
      }

      const textTrack =
        remoteTrack.track || remoteTrack;

      textTrack.externalSubtitle = true;
      textTrack.externalSubtitleIndex = index;
      textTrack.externalSubtitleData = track;

      remoteTrack.externalSubtitle = true;
      remoteTrack.externalSubtitleIndex = index;
      remoteTrack.externalSubtitleData = track;

      externalTextTracks.set(
        textTrack,
        track,
      );

      log(
        "Added text subtitle track:",
        track.filename,
      );

      return textTrack;
    } catch (error) {
      warn(
        "Failed to add text subtitle track:",
        error,
      );
      return null;
    }
  }

  function removeTextTracksFromVjs() {
    if (!player) {
      externalTextTracks.clear();
      return;
    }

    for (const [textTrack] of externalTextTracks) {
      try {
        player.removeRemoteTextTrack(
          textTrack,
        );
      } catch (error) {
        warn(
          "Failed to remove text subtitle track:",
          error,
        );
      }
    }

    externalTextTracks.clear();
  }

  async function callGQL(query, variables = {}) {
    const response = await fetch("/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `GraphQL request failed: ${response.status}`,
      );
    }

    return response.json();
  }

  async function runPluginOperation(args) {
    const query = `
      mutation RunPluginOperation(
        $plugin_id: ID!,
        $args: Map!
      ) {
        runPluginOperation(
          plugin_id: $plugin_id,
          args: $args
        )
      }
    `;

    const result = await callGQL(query, {
      plugin_id: PLUGIN_ID,
      args,
    });

    if (result.errors) {
      throw new Error(
        JSON.stringify(result.errors),
      );
    }

    return (
      result.data?.runPluginOperation ?? null
    );
  }

  async function fetchTracks(sceneId) {
    const raw = await runPluginOperation({
      mode: "get_subtitles",
      scene_id: String(sceneId),
    });

    if (!raw) {
      return [];
    }

    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);

        return Array.isArray(parsed.tracks)
          ? parsed.tracks
          : [];
      } catch (error) {
        warn(
          "Failed to parse subtitle tracks:",
          error,
        );

        return [];
      }
    }

    return Array.isArray(raw.tracks)
      ? raw.tracks
      : [];
  }

  async function getSetting(settingName) {
    try {
      const result = await callGQL(
        `
          query GetPluginConfiguration {
            configuration {
              plugins
            }
          }
        `,
      );

      if (result.errors) {
        throw new Error(
          JSON.stringify(result.errors),
        );
      }

      const plugins =
        result?.data?.configuration?.plugins;

      if (!plugins) {
        return null;
      }

      const pluginConfig =
        plugins[PLUGIN_ID];

      if (!pluginConfig) {
        return null;
      }

      return pluginConfig[settingName] ?? null;
    } catch (error) {
      warn(
        "Failed to get plugin setting:",
        error,
      );

      return null;
    }
  }

  async function loadJASSUB() {
    if (
      jassubLoaded ||
      window.JASSUB
    ) {
      jassubLoaded = true;
      return true;
    }

    return new Promise((resolve) => {
      const existingScript =
        document.querySelector(
          `script[src="${JASSUB_BASE}/jassub.umd.js"]`,
        );

      if (existingScript) {
        existingScript.addEventListener(
          "load",
          () => {
            jassubLoaded = true;
            resolve(true);
          },
        );

        existingScript.addEventListener(
          "error",
          () => {
            resolve(false);
          },
        );

        return;
      }

      const script =
        document.createElement("script");

      script.src =
        `${JASSUB_BASE}/jassub.umd.js`;

      script.onload = () => {
        jassubLoaded = true;

        log("JASSUB loaded.");

        resolve(true);
      };

      script.onerror = (error) => {
        warn(
          "Failed to load JASSUB:",
          error,
        );

        resolve(false);
      };

      document.head.appendChild(script);
    });
  }

  async function getWorkerBlobURL() {
    if (workerBlobUrl) {
      return workerBlobUrl;
    }

    const response = await fetch(
      `${JASSUB_BASE}/jassub-worker.js`,
    );

    if (!response.ok) {
      throw new Error(
        `Failed to load JASSUB worker: ${response.status}`,
      );
    }

    const source = await response.text();

    const blob = new Blob(
      [source],
      {
        type: "application/javascript",
      },
    );

    workerBlobUrl =
      URL.createObjectURL(blob);

    return workerBlobUrl;
  }

  function addNativeTrackToVjs(track, index) {
    if (!player) {
      warn(
        "Cannot add native track: Video.js player unavailable.",
      );
      return null;
    }

    const format = getTrackFormat(track);

    let vttContent;

    if (format === "ass" || format === "ssa") {
      // ASS/SSA needs a dummy cue.
      // Selecting this native track will be handled by JASSUB.
      vttContent =
        "WEBVTT\n\n" +
        "00:00:00.000 --> 99:59:59.000\n" +
        "\u200B\n";
    } else if (format === "srt") {
      vttContent = srtToVtt(track.text);
    } else if (format === "vtt") {
      vttContent = track.text.trim();

      if (!vttContent.startsWith("WEBVTT")) {
        vttContent =
          `WEBVTT\n\n${vttContent}`;
      }
    } else {
      warn(
        "Unsupported native subtitle format:",
        format,
      );
      return null;
    }

    const url =
      "data:text/vtt;charset=utf-8," +
      encodeURIComponent(vttContent);

    try {
      const remoteTrack =
        player.addRemoteTextTrack(
          {
            kind: "captions",
            label:
              track.label ||
              track.filename ||
              `Track ${index + 1}`,
            language:
              track.language ||
              `und-${index}`,
            src: url,
            default: false,
          },
          true,
        );

      if (!remoteTrack) {
        warn(
          "Video.js failed to create native text track.",
        );
        return null;
      }

      const textTrack =
        remoteTrack.track || remoteTrack;

      textTrack.externalSubtitle = true;
      textTrack.externalSubtitleIndex = index;
      textTrack.externalSubtitleData = track;

      remoteTrack.externalSubtitle = true;
      remoteTrack.externalSubtitleIndex = index;
      remoteTrack.externalSubtitleData = track;

      if (format === "ass" || format === "ssa") {
        textTrack.externalAss = true;
        remoteTrack.externalAss = true;
      }

      externalAssTracks.set(
        textTrack,
        track,
      );

      log(
        "Added native subtitle track:",
        {
          index,
          format,
          filename: track.filename,
          label:
            track.label ||
            track.filename,
        },
      );

      return textTrack;
    } catch (error) {
      warn(
        "Failed to add native subtitle track:",
        error,
      );
      return null;
    }
  }

  function removeAssTracksFromVjs() {
    if (!player) {
      externalAssTracks.clear();
      return;
    }

    for (const [vjsTrack] of externalAssTracks) {
      try {
        player.removeRemoteTextTrack(vjsTrack);
      } catch (error) {
        warn(
          "Failed to remove ASS track:",
          error,
        );
      }
    }

    externalAssTracks.clear();
  }

  async function setupNativeCcTracks() {
    if (!player || !useNativeCc) {
      return;
    }

    removeAssTracksFromVjs();

    log(
      `Adding ${tracks.length} subtitle tracks to native Video.js CC menu.`,
    );

    tracks.forEach(
      (track, index) => {
        addNativeTrackToVjs(
          track,
          index,
        );
      },
    );
  }

  async function createJASSUB(video, track) {
    if (!window.JASSUB) {
      warn(
        "window.JASSUB is unavailable.",
      );

      return false;
    }

    if (!overlayCanvas) {
      warn(
        "JASSUB overlay canvas is unavailable.",
      );

      return false;
    }

    if (!video) {
      warn(
        "Cannot create JASSUB: video element unavailable.",
      );

      return false;
    }

    if (jassubInstance) {
      try {
        await jassubInstance.ready;

        await jassubInstance.setTrack(
          track.text,
        );

        if (
          typeof jassubInstance.show ===
          "function"
        ) {
          jassubInstance.show();
        }

        log(
          "JASSUB track switched to:",
          track.filename,
        );

        return true;
      } catch (error) {
        warn(
          "Failed to switch JASSUB track:",
          error,
        );

        return false;
      }
    }

    try {
      const workerUrl =
        await getWorkerBlobURL();

      const origin =
        window.location.origin;

      jassubInstance =
        new window.JASSUB({
          video,

          canvas: overlayCanvas,

          subContent:
            track.text,

          workerUrl,

          wasmUrl:
            `${origin}${JASSUB_BASE}/jassub-worker.wasm`,

          fonts: [
            `${origin}${JASSUB_BASE}/DejaVuSans.ttf`,
          ],

          availableFonts: {
            "DejaVu Sans":
              `${origin}${JASSUB_BASE}/DejaVuSans.ttf`,

            Tahoma:
              `${origin}${JASSUB_BASE}/DejaVuSans.ttf`,
          },

          fallbackFont:
            "DejaVu Sans",

          prescaleFactor: 0.8,

          prescaleHeightLimit: 1080,
        });

      await jassubInstance.ready;

      log(
        "JASSUB instance created for:",
        track.filename,
      );

      return true;
    } catch (error) {
      warn(
        "Failed to create JASSUB:",
        error,
      );

      jassubInstance = null;

      return false;
    }
  }

  async function handleTextTrackChange() {
    if (!player) {
      return;
    }

    const textTracks =
      player.textTracks();

    let selectedExternalTrack = null;

    for (
      let i = 0;
      i < textTracks.length;
      i++
    ) {
      const textTrack =
        textTracks[i];

      if (
        textTrack.externalSubtitle &&
        textTrack.mode === "showing"
      ) {
        selectedExternalTrack =
          textTrack;
        break;
      }
    }

    if (!selectedExternalTrack) {
      hideJassub();

      return;
    }

    const track =
      selectedExternalTrack.externalSubtitleData;

    if (!track) {
      warn(
        "Selected native subtitle track has no subtitle data.",
      );
      return;
    }

    const format =
      getTrackFormat(track);

    log(
      "Native CC selected:",
      track.filename,
      "format:",
      format,
    );

    // --------------------------------------------------
    // ASS / SSA → JASSUB
    // --------------------------------------------------

    if (
      format === "ass" ||
      format === "ssa"
    ) {
      createOverlayIfNeeded();
      startPositionLoop();

      const success =
        await createJASSUB(
          videoElement,
          track,
        );

      if (!success) {
        warn(
          "Failed to create JASSUB track:",
          track.filename,
        );
        return;
      }

      const index =
        tracks.indexOf(track);

      if (index >= 0) {
        selectedTrack = index;
      }

      isEnabled = true;

      updateButton();

      return;
    }

    // --------------------------------------------------
    // SRT / VTT → native Video.js
    // --------------------------------------------------

    if (
      format === "srt" ||
      format === "vtt"
    ) {
      hideJassub();

      const index =
        tracks.indexOf(track);

      if (index >= 0) {
        selectedTrack = index;
      }

      isEnabled = true;

      updateButton();

      log(
        "Native Video.js subtitle enabled:",
        track.filename,
      );

      return;
    }

    warn(
      "Unsupported native subtitle format:",
      format,
    );
  }

  function createOverlayIfNeeded() {
    if (overlayCanvas) {
      return true;
    }

    overlayDiv =
      document.createElement("div");

    overlayDiv.id =
      "external-ass-overlay";

    overlayDiv.style.cssText = [
      "position:fixed",
      "top:0",
      "left:0",
      "width:0",
      "height:0",
      "pointer-events:none",
      "z-index:999999",
      "overflow:hidden",
    ].join(";");

    overlayCanvas =
      document.createElement("canvas");

    overlayCanvas.style.cssText = [
      "display:block",
      "position:absolute",
      "top:0",
      "left:0",
      "width:100%",
      "height:100%",
      "pointer-events:none",
    ].join(";");

    overlayDiv.appendChild(
      overlayCanvas,
    );

    document.body.appendChild(
      overlayDiv,
    );

    overlayParent =
      document.body;

    return true;
  }

  function destroyOverlay() {
    stopPositionLoop();

    if (overlayDiv) {
      try {
        overlayDiv.remove();
      } catch {
        // Ignore.
      }
    }

    overlayDiv = null;
    overlayCanvas = null;
    overlayParent = null;
  }

  function startPositionLoop() {
    stopPositionLoop();

    function update() {
      if (
        !overlayDiv ||
        !videoElement
      ) {
        positionRAF = null;
        return;
      }

      const fullscreenElement =
        document.fullscreenElement ||
        document.webkitFullscreenElement;

      const desiredParent =
        fullscreenElement ||
        document.body;

      if (
        overlayParent !==
        desiredParent
      ) {
        desiredParent.appendChild(
          overlayDiv,
        );

        overlayParent =
          desiredParent;
      }

      const rect =
        getVideoContentRect(
          videoElement,
        );

      if (
        overlayParent ===
        desiredParent &&
        desiredParent !== document.body
      ) {
        const parentRect =
          desiredParent.getBoundingClientRect();

        overlayDiv.style.left =
          `${rect.left - parentRect.left}px`;

        overlayDiv.style.top =
          `${rect.top - parentRect.top}px`;
      } else {
        overlayDiv.style.left =
          `${rect.left}px`;

        overlayDiv.style.top =
          `${rect.top}px`;
      }

      overlayDiv.style.width =
        `${rect.width}px`;

      overlayDiv.style.height =
        `${rect.height}px`;

      overlayDiv.style.display =
        isEnabled
          ? ""
          : "none";

      positionRAF =
        requestAnimationFrame(
          update,
        );
    }

    positionRAF =
      requestAnimationFrame(
        update,
      );
  }

  function stopPositionLoop() {
    if (positionRAF) {
      cancelAnimationFrame(
        positionRAF,
      );

      positionRAF = null;
    }
  }

  function destroyJASSUB() {
    if (!jassubInstance) {
      return;
    }

    try {
      jassubInstance.destroy();
    } catch (error) {
      warn(
        "Failed to destroy JASSUB:",
        error,
      );
    }

    jassubInstance = null;
  }

  function hideJassub() {
    if (!jassubInstance) {
      isEnabled = false;
      return;
    }

    try {
      if (
        typeof jassubInstance.hide ===
        "function"
      ) {
        jassubInstance.hide();
      } else if (overlayDiv) {
        overlayDiv.style.display =
          "none";
      }
    } catch (error) {
      warn(
        "Failed to hide JASSUB:",
        error,
      );
    }

    isEnabled = false;

    updateButton();
  }

  function getVideoContentRect(video) {
    const rect =
      video.getBoundingClientRect();

    const videoWidth =
      video.videoWidth;

    const videoHeight =
      video.videoHeight;

    if (
      !videoWidth ||
      !videoHeight
    ) {
      return rect;
    }

    const elementAR =
      rect.width /
      rect.height;

    const videoAR =
      videoWidth /
      videoHeight;

    let width;
    let height;
    let offsetX;
    let offsetY;

    if (videoAR > elementAR) {
      width = rect.width;

      height =
        width /
        videoAR;

      offsetX = 0;

      offsetY =
        (
          rect.height -
          height
        ) / 2;
    } else {
      height = rect.height;

      width =
        height *
        videoAR;

      offsetX =
        (
          rect.width -
          width
        ) / 2;

      offsetY = 0;
    }

    return {
      left:
        rect.left +
        offsetX,

      top:
        rect.top +
        offsetY,

      width,

      height,
    };
  }

  function getVideoElement() {
    return (
      document.querySelector(
        ".video-js video",
      ) ||
      document.querySelector(
        "video",
      )
    );
  }

  function getVideoJsPlayer() {
    try {
      return (
        window.PluginApi
          ?.utils
          ?.InteractiveUtils
          ?.getPlayer?.() ||
        null
      );
    } catch (error) {
      warn(
        "Failed to get Video.js player:",
        error,
      );

      return null;
    }
  }

  function startVideoPoll(sceneId) {
    stopVideoPoll();

    let attempts = 0;

    videoPollTimer =
      setInterval(
        async () => {
          attempts++;

          if (
            currentSceneId !==
            sceneId
          ) {
            stopVideoPoll();
            return;
          }

          const currentPlayer =
            getVideoJsPlayer();

          if (currentPlayer) {
            player =
              currentPlayer;
          }

          const video =
            getVideoElement();

          if (!video) {
            return;
          }

          if (
            !video.src &&
            !video.currentSrc
          ) {
            return;
          }

          if (!player) {
            warn(
              "Video element found, but Video.js player is not available yet.",
            );

            return;
          }

          stopVideoPoll();

          videoElement =
            video;

          log(
            `Video found after ${attempts} attempts.`,
          );

          log(
            "Video.js player found:",
            player,
          );

          if (useNativeCc) {
            await setupNativeCcTracks();

            player.off(
              "texttrackchange",
              handleTextTrackChange,
            );

            player.on(
              "texttrackchange",
              handleTextTrackChange,
            );

            log(
              "Native CC mode initialized.",
            );

            return;
          }

          createOverlayIfNeeded();

          startPositionLoop();

          tracks.forEach(
            (track, index) => {
              if (isTextTrack(track)) {
                addTextTrackToVjs(
                  track,
                  index,
                );
              }
            },
          );

          createButton();

          if (
            selectedTrack >= 0 &&
            tracks[selectedTrack]
          ) {
            const success =
              await createJASSUB(
                videoElement,
                tracks[selectedTrack],
              );

            if (!success) {
              warn(
                "Failed to create initial JASSUB track.",
              );
            }
          }
        },
        300,
      );

    setTimeout(() => {
      stopVideoPoll();
    }, 20000);
  }

  function stopVideoPoll() {
    if (videoPollTimer) {
      clearInterval(
        videoPollTimer,
      );

      videoPollTimer = null;
    }
  }

  function getSceneIdFromURL() {
    const match =
      window.location.pathname.match(
        /\/scenes\/(\d+)/,
      );

    return match
      ? match[1]
      : null;
  }

  async function initForScene(sceneId) {
    cleanup();

    currentSceneId =
      sceneId;

    if (!sceneId) {
      return;
    }

    log(
      `Loading ASS subtitles for scene ${sceneId}...`,
    );

    useNativeCc =
      (await getSetting(
        "useNativeCc",
      )) !== false;

    log(
      "CC mode:",
      useNativeCc
        ? "native"
        : "custom",
    );

    const loaded =
      await loadJASSUB();

    if (!loaded) {
      warn(
        "JASSUB could not be loaded.",
      );

      return;
    }

    if (
      currentSceneId !==
      sceneId
    ) {
      return;
    }

    try {
      tracks =
        await fetchTracks(
          sceneId,
        );
    } catch (error) {
      warn(
        "Failed to fetch subtitle tracks:",
        error,
      );

      tracks = [];
    }

    if (!tracks.length) {
      log(
        "No external ASS/SSA subtitles found.",
      );

      return;
    }

    log(
      "Found subtitle tracks:",
      tracks.map(
        (track) =>
          track.filename,
      ),
    );

    isEnabled = true;

    selectedTrack = 0;

    startVideoPoll(
      sceneId,
    );
  }

  function cleanup() {
    stopVideoPoll();

    closeMenu();

    removeButton();

    if (player) {
      try {
        player.off(
          "texttrackchange",
          handleTextTrackChange,
        );
      } catch {
        // Ignore.
      }
    }

    removeAssTracksFromVjs();

    removeTextTracksFromVjs();

    destroyJASSUB();

    destroyOverlay();

    currentSceneId = null;

    tracks = [];

    selectedTrack = -1;

    videoElement = null;

    player = null;

    isEnabled = false;
  }

  function removeButton() {
    if (btnEl) {
      try {
        btnEl.remove();
      } catch {
        // Ignore.
      }

      btnEl = null;
    }
  }

  function updateButton() {
    if (!btnEl) {
      return;
    }

    const icon =
      btnEl.querySelector(
        ".external-ass-icon",
      );

    if (!icon) {
      return;
    }

    icon.textContent =
      isEnabled
        ? "CC"
        : "cc";

    btnEl.classList.toggle(
      "external-ass-active",
      isEnabled,
    );
  }

  function closeMenu() {
    if (menuEl) {
      try {
        menuEl.remove();
      } catch {
        // Ignore.
      }

      menuEl = null;
    }
  }

  function toggleMenu() {
    if (useNativeCc) {
      return;
    }

    if (menuEl) {
      closeMenu();
      return;
    }

    createMenu();
  }

  function createMenu() {
    closeMenu();

    menuEl =
      document.createElement("div");

    menuEl.className =
      "external-ass-menu";

    const title =
      document.createElement("div");

    title.className =
      "external-ass-menu-title";

    title.textContent =
      "Subtitles";

    menuEl.appendChild(
      title,
    );

    if (!tracks.length) {
      const empty =
        document.createElement(
          "div",
        );

      empty.className =
        "external-ass-menu-empty";

      empty.textContent =
        "No external subtitles";

      menuEl.appendChild(
        empty,
      );
    }

    tracks.forEach(
      (track, index) => {
        const item =
          document.createElement(
            "button",
          );

        item.type =
          "button";

        item.className =
          "external-ass-menu-item";

        if (
          index ===
            selectedTrack &&
          isEnabled
        ) {
          item.classList.add(
            "selected",
          );
        }

        item.textContent =
          track.label ||
          track.filename ||
          `Track ${index + 1}`;

        item.addEventListener(
          "click",
          () => {
            selectTrack(index);
          },
        );

        menuEl.appendChild(
          item,
        );
      },
    );

    const off =
      document.createElement(
        "button",
      );

    off.type =
      "button";

    off.className =
      "external-ass-menu-item";

    if (!isEnabled) {
      off.classList.add(
        "selected",
      );
    }

    off.textContent =
      "Off";

    off.addEventListener(
      "click",
      () => {
        isEnabled = false;

        hideJassub();

        updateButton();

        closeMenu();
      },
    );

    menuEl.appendChild(
      off,
    );

    document.body.appendChild(
      menuEl,
    );

    if (btnEl) {
      const rect =
        btnEl.getBoundingClientRect();

      const menuWidth =
        menuEl.offsetWidth;

      const menuHeight =
        menuEl.offsetHeight;

      menuEl.style.left =
        `${Math.max(
          8,
          rect.right -
            menuWidth,
        )}px`;

      menuEl.style.top =
        `${Math.max(
          8,
          rect.top -
            menuHeight -
            8,
        )}px`;
    }
  }

  function createButton() {
    if (useNativeCc) {
      return;
    }

    if (btnEl) {
      return;
    }

    const toolbar =
      document.querySelector(
        ".video-js .vjs-control-bar",
      );

    if (!toolbar) {
      warn(
        "Video.js control bar not found.",
      );

      return;
    }

    btnEl =
      document.createElement(
        "button",
      );

    btnEl.type =
      "button";

    btnEl.className =
      "vjs-control vjs-button external-ass-button";

    btnEl.title =
      "External subtitles";

    btnEl.innerHTML =
      `<span class="external-ass-icon">CC</span>`;

    btnEl.addEventListener(
      "click",
      toggleMenu,
    );

    const fullscreenButton =
      toolbar.querySelector(
        ".vjs-fullscreen-control",
      );

    if (fullscreenButton) {
      toolbar.insertBefore(
        btnEl,
        fullscreenButton,
      );
    } else {
      toolbar.appendChild(
        btnEl,
      );
    }

    updateButton();

    log(
      "Custom subtitle CC button created.",
    );
  }

  async function selectTrack(index) {
    const track = tracks[index];

    if (!track || !videoElement) {
      return;
    }

    const format = getTrackFormat(track);

    log(
      "Selecting subtitle track:",
      track.filename,
      "format:",
      format,
    );

    selectedTrack = index;
    isEnabled = true;

    // Сначала отключаем обычные Video.js subtitle tracks.
    for (const [textTrack] of externalTextTracks) {
      try {
        textTrack.mode = "disabled";
      } catch {
        // Ignore.
      }
    }

    // Если это ASS/SSA — используем JASSUB.
    if (isJassubTrack(track)) {
      createOverlayIfNeeded();
      startPositionLoop();

      const success =
        await createJASSUB(
          videoElement,
          track,
        );

      if (!success) {
        warn(
          "Failed to select JASSUB track:",
          track.filename,
        );
        return;
      }

      updateButton();
      closeMenu();

      return;
    }

    // Если это SRT/VTT — используем Video.js.
    if (isTextTrack(track)) {
      hideJassub();

      let textTrack = null;

      for (const [
        existingTrack,
        existingData,
      ] of externalTextTracks) {
        if (existingData === track) {
          textTrack = existingTrack;
          break;
        }
      }

      if (!textTrack) {
        textTrack =
          addTextTrackToVjs(
            track,
            index,
          );
      }

      if (!textTrack) {
        warn(
          "Failed to create text subtitle track:",
          track.filename,
        );
        return;
      }

      textTrack.mode = "showing";

      isEnabled = true;

      updateButton();
      closeMenu();

      log(
        "Video.js subtitle track enabled:",
        track.filename,
      );

      return;
    }

    warn(
      "Unsupported subtitle format:",
      format,
    );
  }

  function onLocationChange() {
    const sceneId =
      getSceneIdFromURL();

    if (sceneId) {
      initForScene(
        sceneId,
      );
    } else {
      cleanup();
    }
  }

  if (
    window.PluginApi &&
    window.PluginApi.Event
  ) {
    window.PluginApi.Event.addEventListener(
      "stash:location",
      () => {
        setTimeout(
          onLocationChange,
          500,
        );
      },
    );

    log(
      "Using PluginApi navigation events.",
    );
  } else {
    let lastUrl =
      window.location.href;

    const observer =
      new MutationObserver(
        () => {
          const url =
            window.location.href;

          if (
            url !==
            lastUrl
          ) {
            lastUrl = url;

            onLocationChange();
          }
        },
      );

    observer.observe(
      document.body,
      {
        childList: true,
        subtree: true,
      },
    );

    setInterval(
      () => {
        const url =
          window.location.href;

        if (
          url !==
          lastUrl
        ) {
          lastUrl = url;

          onLocationChange();
        }
      },
      1000,
    );
  }

  const initialScene =
    getSceneIdFromURL();

  if (initialScene) {
    setTimeout(
      () => {
        initForScene(
          initialScene,
        );
      },
      1500,
    );
  }

  log(
    "External ASS Subtitles loaded.",
  );
})();