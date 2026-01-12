
// js/app.js
(function () {
    "use strict";

    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    const $  = (s, r = document) => r.querySelector(s);

    const steps = $$(".step");
    let current = 1;

    function getStepApi(stepNum) {
        const s = window.KC_STEPS || {};
        return s[stepNum] || s["step" + stepNum] || null;
    }

    function showStep(stepNum) {
        steps.forEach((el) => el.classList.remove("active"));
        const el = $(`.step[data-step="${stepNum}"]`);
        if (el) el.classList.add("active");

        if (stepNum === 4 && window.KC_STEPS?.step4?.enter) {
            window.KC_STEPS.step4.enter();
        }


        // label “Крок X з Y”
        const badge = $("#stepBadge");
        if (badge) badge.textContent = `Крок ${stepNum} з 8`;


    }

    function enter(stepNum) {
        const api = getStepApi(stepNum);
        if (api && typeof api.enter === "function") api.enter();
    }

    function exit(stepNum) {
        const api = getStepApi(stepNum);
        if (api && typeof api.exit === "function") api.exit();
    }

    function go(stepNum) {
        stepNum = Math.max(1, Math.min(8, stepNum));
        if (stepNum === current) return;

        exit(current);
        current = stepNum;

        showStep(current);
        enter(current);
    }

    document.addEventListener("click", (e) => {
        const next = e.target.closest("[data-next]");
        const prev = e.target.closest("[data-prev]");

        if (next) go(current + 1);
        if (prev) go(current - 1);
    });

    // init
    document.addEventListener("DOMContentLoaded", () => {
        // визначаємо активний step по DOM
        const active = $(".step.active");
        if (active) current = Number(active.getAttribute("data-step")) || 1;

        showStep(current);
        enter(current);
    });

    // expose (optional)
    window.KC_APP = { go };
})();
