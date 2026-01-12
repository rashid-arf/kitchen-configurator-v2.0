// js/step1.js
(function () {
    "use strict";

    window.KC_STEPS = window.KC_STEPS || {};

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    function setCore(patch) {
        if (window.KC && typeof KC.setState === "function") {
            KC.setState(patch);
        } else {
            window.KC_STATE = Object.assign(window.KC_STATE || {}, patch);
        }
    }

    function wireStyleCardsOnce() {
        const root = $('.step[data-step="1"]');
        if (!root) return;

        // ✅ Guard: не навішуємо вдруге
        if (root.dataset.kcStep1Bound === "1") return;
        root.dataset.kcStep1Bound = "1";

        root.addEventListener("click", (e) => {
            const card = e.target.closest(".card[data-style]");
            if (!card) return;

            // UI
            $$(".card[data-style]", root).forEach(c => c.classList.remove("selected"));
            card.classList.add("selected");

            // DATA → core
            const style = card.dataset.style;
            setCore({ style });

            // подія для core/preview
            window.KC_BUS?.emit("kc:style-changed", { style });
        });
    }

    window.KC_STEPS[1] = {
        enter() {
            wireStyleCardsOnce();
        },
        leave() {
            return true;
        }
    };
})();
