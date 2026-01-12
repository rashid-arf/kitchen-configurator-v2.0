// js/step2.js (fixed)
(function () {
  "use strict";

  window.KC_STEPS = window.KC_STEPS || {};

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  function setState(patch, reason){
    // Prefer global store API (fires KC_STATE_UPDATED)
    if (typeof window.kcSetState === "function") {
      window.kcSetState(patch, reason || "step2");
      return;
    }

    // Fallback: old KC API
    if (window.KC && typeof window.KC.setState === "function") {
      window.KC.setState(patch);
      return;
    }

    // Last resort
    window.KC_STATE = Object.assign(window.KC_STATE || {}, patch);
    window.dispatchEvent(new CustomEvent("KC_STATE_UPDATED", { detail: { patch, reason: reason || "step2:fallback" } }));
  }

  function wireLayoutCardsOnce() {
    const root = $(".step[data-step=\"2\"]");
    if (!root) return;

    if (root.dataset.kcStep2Bound === "1") return;
    root.dataset.kcStep2Bound = "1";

    root.addEventListener("click", (e) => {
      // Markup uses .card[data-layout]
      const card = e.target.closest(".card[data-layout]") || e.target.closest("[data-layout]");
      if (!card || !root.contains(card)) return;

      const layout = String(card.dataset.layout || "").trim();
      if (!layout) return;

      // UI selected
      $$("[data-layout]", root).forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");

      // Data
      setState({ layout }, "step2:layout");

      // Notify other steps
      window.KC_BUS?.emit?.("kc:layout-changed", { layout });
    });
  }

  window.KC_STEPS[2] = {
    enter() {
      wireLayoutCardsOnce();

      // On enter: highlight current layout if already selected in state
      const st = (typeof window.kcGetState === "function") ? window.kcGetState() : (window.KC_STATE || {});
      const layout = st.layout;
      if (layout) {
        const root = $(".step[data-step=\"2\"]");
        const card = root && root.querySelector(`[data-layout=\"${layout}\"]`);
        if (card) {
          $$("[data-layout]", root).forEach((c) => c.classList.remove("selected"));
          card.classList.add("selected");
        }
      }
    },
    leave() {
      return true;
    }
  };
})();
