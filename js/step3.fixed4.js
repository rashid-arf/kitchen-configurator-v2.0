// js/step3.js (fixed)
(function () {
  "use strict";

  window.KC_STEPS = window.KC_STEPS || {};

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  function getState(){
    if (typeof window.kcGetState === "function") return window.kcGetState();
    if (window.KC && typeof window.KC.getState === "function") return window.KC.getState();
    return window.KC_STATE || {};
  }

  function setState(patch, reason){
    if (typeof window.kcSetState === "function") {
      window.kcSetState(patch, reason || "step3");
      return;
    }
    if (window.KC && typeof window.KC.setState === "function") {
      window.KC.setState(patch);
      return;
    }
    window.KC_STATE = Object.assign(window.KC_STATE || {}, patch);
    window.dispatchEvent(new CustomEvent("KC_STATE_UPDATED", { detail: { patch, reason: reason || "step3:fallback" } }));
  }

  function toNumOrNull(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function updateVisibilityByLayout(layout) {
    const dimBWrap   = $("#dimBWrap");
    const cornerWrap = $("#cornerWrap");
    const islandWrap = $("#islandWrap");

    const l = String(layout || "").toLowerCase();

    const isStraight = (l === "straight" || l === "line" || l === "");
    const isCorner   = (l === "corner" || l === "l");
    const isU        = (l === "u");
    const isIsland   = (l === "island"); // island = база (straight або corner) + острів

    // B + corner потрібні для corner/u/island
    const needBAndCorner = (isCorner || isU || isIsland);

    if (dimBWrap)   dimBWrap.style.display   = needBAndCorner ? "" : "none";
    if (cornerWrap) cornerWrap.style.display = needBAndCorner ? "" : "none";
    if (islandWrap) islandWrap.style.display = isIsland ? "" : "none";
  }

  function pushDimsToCore() {
    const dimA = $("#dimA");
    const dimB = $("#dimB");
    const cornerRadio = $('input[name="corner"]:checked');

    const islandLenEl   = $("#islandLen");
    const islandDepthEl = $("#islandDepth");

    const A = dimA ? toNumOrNull(dimA.value) : null;
    const B = dimB ? toNumOrNull(dimB.value) : null;
    const corner = cornerRadio ? Number(cornerRadio.value) : 900;

    const islandLen   = islandLenEl ? toNumOrNull(islandLenEl.value) : null;
    const islandDepth = islandDepthEl ? toNumOrNull(islandDepthEl.value) : null;

    // ✅ dims — єдине місце для розмірів
    setState({ dims: { A, B, corner, island: islandLen, islandDepth } }, "step3:dims");

    // ✅ legacy ширина (для straight)
    if (A) {
      setState({ wallWidth: A, kitchenWidth: A }, "step3:wallWidth");
    }
  }

  function hydrateInputsFromState(){
    const st = getState();
    const d = st.dims || {};

    const dimA = $("#dimA");
    const dimB = $("#dimB");
    const islandLenEl = $("#islandLen");
    const islandDepthEl = $("#islandDepth");

    if (dimA && (dimA.value === "" || dimA.value == null) && d.A) dimA.value = d.A;
    if (dimB && (dimB.value === "" || dimB.value == null) && d.B) dimB.value = d.B;

    if (islandLenEl && (islandLenEl.value === "" || islandLenEl.value == null) && d.island) islandLenEl.value = d.island;
    if (islandDepthEl && (islandDepthEl.value === "" || islandDepthEl.value == null) && d.islandDepth) islandDepthEl.value = d.islandDepth;

    // corner radios
    if (d.corner) {
      const r = document.querySelector(`#cornerWrap input[name="corner"][value="${d.corner}"]`);
      if (r) r.checked = true;
    }
  }

  function wireDimsOnce() {
    const root = $(".step[data-step=\"3\"]");
    if (!root) return;

    if (root.dataset.kcStep3Bound === "1") return;
    root.dataset.kcStep3Bound = "1";

    const dimA = $("#dimA");
    const dimB = $("#dimB");
    const islandLen = $("#islandLen");
    const islandDepth = $("#islandDepth");

    [dimA, dimB, islandLen, islandDepth].filter(Boolean).forEach((el) => {
      el.addEventListener("input", pushDimsToCore);
      el.addEventListener("change", pushDimsToCore);
    });

    $$('#cornerWrap input[name="corner"]').forEach((r) => {
      r.addEventListener("change", pushDimsToCore);
    });

    window.KC_BUS?.on?.("kc:layout-changed", ({ layout }) => {
      updateVisibilityByLayout(layout);
      // якщо користувач перейшов на island — одразу пушнемо, щоб STEP4 підхопив без перезавантаження
      setTimeout(pushDimsToCore, 0);
    });

    // Fallback: якщо layout змінився до того, як Step3 підписався на KC_BUS
    window.addEventListener("KC_STATE_UPDATED", (ev) => {
      const layout =
          ev?.detail?.slice?.layout ??
          getState().layout;

      updateVisibilityByLayout(layout);
    }, { passive: true });

  }

  window.KC_STEPS[3] = {
    enter() {
      wireDimsOnce();

      const st = getState();
      updateVisibilityByLayout(st.layout);

      // ✅ важливо: якщо state вже має island/dims — заповнити інпути (щоб не чекати reload)
      hydrateInputsFromState();

      // і одразу пушнемо актуальні значення
      pushDimsToCore();
    },
    leave() {
      return true;
    }
  };

// ✅ FORCE Step3 UI sync after any state update (core may override visibility)
  (function bindStep3StateWatcher(){
    if (window.__KC_STEP3_WATCHER_BOUND__) return;
    window.__KC_STEP3_WATCHER_BOUND__ = true;

    window.addEventListener("KC_STATE_UPDATED", () => {
      try {
        const st = getState();
        updateVisibilityByLayout(st.layout);

        // додатково: якщо зараз активний step 3 — можна гідратити інпути
        const isStep3Active = document.querySelector('.step[data-step="3"]')?.classList.contains("active");
        if (isStep3Active) {
          hydrateInputsFromState();
        }
      } catch(e) {}
    });
  })();

})();
