// Step 7 JS (stub). We will gradually move logic from core.steps1-7.js сюда.
// js/step7.fixed.js
(function () {
    "use strict";

    window.KC_STEPS = window.KC_STEPS || {};

    const $  = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    function setCore(patch) {
        if (window.KC && typeof KC.setState === "function") {
            KC.setState(patch);
        } else {
            window.KC_STATE = Object.assign(window.KC_STATE || {}, patch);
        }
    }

    function getCoreState() {
        if (window.KC && typeof KC.getState === "function") return KC.getState();
        return window.KC_STATE || {};
    }

    function setActive(root, attr, value) {
        if (!root) return;
        $$(`[${attr}]`, root).forEach(c => c.classList.remove("selected", "active"));
        const el = root.querySelector(`[${attr}="${CSS.escape(value)}"]`);
        if (el) el.classList.add("selected", "active");
    }

    function wireComfortOnce() {
        const root = document.querySelector('.step[data-step="7"]');
        if (!root) return;

        // ✅ guard
        if (root.dataset.kcStep7Bound === "1") return;
        root.dataset.kcStep7Bound = "1";

        root.addEventListener("click", (e) => {
            // Підтримуємо:
            // 1) .card[data-comfort]
            // 2) будь-який елемент з [data-comfort]
            const card =
                e.target.closest(".card[data-comfort]") ||
                e.target.closest("[data-comfort]");

            if (!card || !root.contains(card)) return;

            const comfort = card.dataset.comfort;
            if (!comfort) return;

            // UI
            setActive(root, "data-comfort", comfort);

            // DATA → core
            setCore({ comfort });

            // подія для preview/core hooks
            window.KC_BUS?.emit("kc:comfort-changed", { comfort });
        });
    }

    function hydrateUI() {
        const root = document.querySelector('.step[data-step="7"]');
        if (!root) return;

        const st = getCoreState();
        if (!st.comfort) return;

        const exists = root.querySelector(`[data-comfort="${CSS.escape(st.comfort)}"]`);
        if (exists) setActive(root, "data-comfort", st.comfort);
    }

    window.KC_STEPS[7] = {
        enter() {
            wireComfortOnce();
            hydrateUI();
        },
        leave() {
            return true;
        }
    };
})();
