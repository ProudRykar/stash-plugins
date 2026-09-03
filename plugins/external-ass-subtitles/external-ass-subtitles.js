(function () {
  "use strict";

  const PLUGIN_ID =
    "external-ass-subtitles";

  const JASSUB_BASE =
    "/plugin/external-ass-subtitles/assets/jassub";


  let currentSceneId = null;

  let tracks = [];

  let isEnabled = true;

  let useNativeCc = true;

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

  const externalAssTracks = new Map();


  function log(...args) {
    console.log(
      "[External ASS]",
      ...args,
    );
  }


  function warn(...args) {
    console.warn(
      "[External ASS]",
      ...args,
    );
  }


  async function callGQL(
    query,
    variables,
  ) {
    const response =
      await fetch(
        "/graphql",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            query,
            variables,
          }),
        },
      );

    return response.json();
  }


  async function runPluginOperation(
    args,
  ) {
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

    const result =
      await callGQL(
        query,
        {
          plugin_id:
            PLUGIN_ID,

          args,
        },
      );

    if (result.errors) {
      throw new Error(
        JSON.stringify(
          result.errors,
        ),
      );
    }

    return (
      result.data
        ?.runPluginOperation
        ?? null
    );
  }


  async function fetchTracks(
    sceneId,
  ) {
    const raw =
      await runPluginOperation({
        mode:
          "get_subtitles",

        scene_id:
          String(sceneId),
      });

    if (!raw) {
      return [];
    }

    if (
      typeof raw ===
      "string"
    ) {
      try {
        const parsed =
          JSON.parse(raw);

        return (
          parsed.tracks ||
          []
        );
      } catch {
        return [];
      }
    }

    return (
      raw.tracks ||
      []
    );
  }


  async function loadJASSUB() {
    if (
      jassubLoaded ||
      window.JASSUB
    ) {
      jassubLoaded = true;
      return true;
    }

    return new Promise(
      (resolve) => {
        const script =
          document.createElement(
            "script",
          );

        script.src =
          `${JASSUB_BASE}/jassub.umd.js`;

        script.onload =
          () => {
            jassubLoaded = true;

            log(
              "JASSUB loaded.",
            );

            resolve(true);
          };

        script.onerror =
          (error) => {
            warn(
              "Failed to load JASSUB:",
              error,
            );

            resolve(false);
          };

        document.head.appendChild(
          script,
        );
      },
    );
  }


  async function getWorkerBlobURL() {
    if (workerBlobUrl) {
      return workerBlobUrl;
    }

    const response =
      await fetch(
        `${JASSUB_BASE}/jassub-worker.js`,
      );

    if (!response.ok) {
      throw new Error(
        `Failed to load JASSUB worker: ${response.status}`,
      );
    }

    const source =
      await response.text();

    const blob =
      new Blob(
        [source],
        {
          type:
            "application/javascript",
        },
      );

    workerBlobUrl =
      URL.createObjectURL(
        blob,
      );

    return workerBlobUrl;
  }


  async function getSetting(settingName) {
    try {
      const result = await callGQL({
        query: `
          query GetPluginSettings($plugin_id: ID!) {
            getPluginSettings(plugin_id: $plugin_id) {
              settings {
                name
                value
              }
            }
          }
        `,
        variables: { plugin_id: PLUGIN_ID },
      });

      if (result?.data?.getPluginSettings?.settings) {
        const setting = result.data.getPluginSettings.settings.find(
          (s) => s.name === settingName,
        );
        return setting?.value;
      }
    } catch (error) {
      warn("Failed to get plugin setting:", error);
    }

    return null;
  }


  function addAssTrackToVjs(track) {
    const blob = new Blob(
      ["WEBVTT\n\n"],

      { type: "text/vtt" },
    );

    const url = URL.createObjectURL(blob);

    const vjsTrack = player.addRemoteTextTrack({
      kind: "captions",
      label: `${track.label} (ASS)`,
      language: track.language || "en",
      src: url,
    });

    vjsTrack.externalAss = true;
    vjsTrack.assContent = track.text;
    vjsTrack.assBlobUrl = url;

    externalAssTracks.set(vjsTrack, track);

    return vjsTrack;
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

      if (vjsTrack.assBlobUrl) {
        try {
          URL.revokeObjectURL(
            vjsTrack.assBlobUrl,
          );
        } catch (e) {
          // ignore
        }
      }
    }

    externalAssTracks.clear();
  }


  async function setupNativeCcTracks() {
    if (!player || !useNativeCc) {
      return;
    }

    removeAssTracksFromVjs();

    for (const track of tracks) {
      addAssTrackToVjs(track);
    }
  }


  async function createJASSUB(
    video,
    track,
  ) {
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


    if (jassubInstance) {
      try {
        await jassubInstance.ready;

        await jassubInstance.setTrack(
          track.text,
        );

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

      const origin = window.location.origin;

      jassubInstance = new window.JASSUB({
        video,
        canvas: overlayCanvas,
        subContent: track.text,

        workerUrl,
        wasmUrl: `${origin}${JASSUB_BASE}/jassub-worker.wasm`,

        fonts: [
          `${origin}${JASSUB_BASE}/DejaVuSans.ttf`,
        ],

        availableFonts: {
          "DejaVu Sans": `${origin}${JASSUB_BASE}/DejaVuSans.ttf`,
          Tahoma: `${origin}${JASSUB_BASE}/DejaVuSans.ttf`,
        },

        fallbackFont: "DejaVu Sans",

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

    const textTracks = player.textTracks();

    let selectedExternalTrack = null;

    for (let i = 0; i < textTracks.length; i++) {
      const track = textTracks[i];

      if (
        track.externalAss &&
        track.mode === "showing"
      ) {
        selectedExternalTrack = track;

        break;
      }
    }

    if (!selectedExternalTrack) {
      hideJassub();

      return;
    }

    createOverlayIfNeeded();
    startPositionLoop();

    if (!jassubInstance) {
      const success = await createJASSUB(
        videoElement,
        {
          text: selectedExternalTrack.assContent,
          filename: selectedExternalTrack.label,
        },

      );

      if (!success) {
        return;
      }
    } else {
      try {
        await jassubInstance.setTrack(
          selectedExternalTrack.assContent,
        );
      } catch (error) {
        warn(
          "Failed to switch JASSUB track:",
          error,
        );
      }
    }

    isEnabled = true;
  }


  function createOverlayIfNeeded() {
    if (overlayCanvas) {
      return true;
    }

    overlayDiv =
      document.createElement(
        "div",
      );

    overlayDiv.id =
      "external-ass-overlay";

    overlayDiv.style.cssText =
      [
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
      document.createElement(
        "canvas",
      );

    overlayCanvas.style.cssText =
      [
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


  function startPositionLoop() {
    stopPositionLoop();

    function update() {
      if (
        !overlayDiv ||
        !videoElement
      ) {
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


      overlayDiv.style.display =
        isEnabled
          ? ""

          : "none";


      overlayDiv.style.left =
        `${rect.left}px`;

      overlayDiv.style.top =
        `${rect.top}px`;

      overlayDiv.style.width =
        `${rect.width}px`;

      overlayDiv.style.height =
        `${rect.height}px`;


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
      return;
    }

    try {
      if (typeof jassubInstance.hide === "function") {
        jassubInstance.hide();
      } else if (overlayDiv) {
        overlayDiv.style.display = "none";
      }
    } catch (error) {
      warn(
        "Failed to hide JASSUB:",
        error,
      );
    }

    jassubInstance = null;
    isEnabled = false;
  }


  function getVideoContentRect(
    video,
  ) {
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


    if (
      videoAR >
      elementAR
    ) {
      width =
        rect.width;

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
      height =
        rect.height;

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


  function startVideoPoll(
    sceneId,
  ) {
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

          // Получаем актуальный Video.js player
          if (
            window.PluginApi?.utils?.InteractiveUtils?.getPlayer
          ) {
            player =
              window.PluginApi.utils.InteractiveUtils.getPlayer();
          }

          const video =
            document.querySelector(
              ".video-js video",
            ) ||
            document.querySelector(
              "video",
            );

          if (!video) {
            return;
          }


          if (
            !video.src &&
            !video.currentSrc
          ) {
            return;
          }

          stopVideoPoll();

          videoElement =
            video;

          log(
            `Video found after ${attempts} attempts.`,
          );

          if (useNativeCc) {
            if (!player) {
              warn(
                "Video.js player was not found.",
              );

              return;
            }

            await setupNativeCcTracks();

            player.on(
              "texttrackchange",
              handleTextTrackChange,
            );

            return;
          }

          createOverlay();

          startPositionLoop();

          createButton();

          if (
            selectedTrack >= 0 &&
            tracks[selectedTrack]
          ) {
            await createJASSUB(
              videoElement,
              tracks[
                selectedTrack
              ],
            );
          }
        },

        300,
      );


    setTimeout(
      () => {
        stopVideoPoll();
      },

      20000,
    );
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


  async function initForScene(
    sceneId,
  ) {
    cleanup();


    currentSceneId =
      sceneId;


    if (!sceneId) {
      return;
    }


    log(
      `Loading ASS subtitles for scene ${sceneId}...`,
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


    useNativeCc =
      (await getSetting("useNativeCc")) !== false;


    startVideoPoll(
      sceneId,
    );


    // После получения player в startVideoPoll вызывается setupNativeCcTracks
    // Но если нужно принудительно при старте — можно сделать здесь
    // Пока оставляем через startVideoPoll
  }


  function cleanup() {
    stopVideoPoll();

    removeButton();

    destroyJASSUB();

    destroyOverlay();

    // Remove external ASS tracks from Video.js if using native CC
    if (useNativeCc && player) {
      player.off("texttrackchange", handleTextTrackChange);
      removeAssTracksFromVjs();
    }

    currentSceneId = null;

    tracks = [];

    selectedTrack = -1;

    videoElement = null;
  }


  function removeButton() {
    closeMenu();

    if (btnEl) {
      btnEl.remove();

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
      menuEl.remove();

      menuEl = null;
    }
  }


  function toggleMenu() {
    if (useNativeCc) {
      // When using native CC, do nothing - the native menu is used
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
      document.createElement(
        "div",
      );

    menuEl.className =
      "external-ass-menu";


    const title =
      document.createElement(
        "div",
      );

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
        "No ASS subtitles";


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
            selectTrack(
              index,
            );
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
    if (btnEl) {
      return;
    }

    const toolbar =
      document.querySelector(
        ".video-js .vjs-control-bar",
      );

    if (!toolbar) {
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
      "External ASS subtitles";

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


    if (
      fullscreenButton
    ) {
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
  }


  function selectTrack(
    index,
  ) {
    const track =
      tracks[index];

    if (
      !track ||
      !videoElement
    ) {
      return;
    }


    log(
      "Selecting subtitle track:",
      track.filename,
    );


    const success =
      await createJASSUB(
        videoElement,
        track,
      );


    if (!success) {
      warn(
        "Failed to select subtitle track:",
        track.filename,
      );

      return;
    }


    selectedTrack =
      index;


    isEnabled = true;


    updateButton();


    closeMenu();
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