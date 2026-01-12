// js/step5.js (FIXED for your markup: #packageCards .card[data-pack])
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
            window.kcSetState(patch, reason || "step5");
            return;
        }
        if (window.KC && typeof window.KC.setState === "function") {
            window.KC.setState(patch);
            return;
        }
        window.KC_STATE = Object.assign(window.KC_STATE || {}, patch);
        window.dispatchEvent(new CustomEvent("KC_STATE_UPDATED", { detail: { patch, reason: reason || "step5:fallback" } }));
    }

    function packLabel(pack){
        const map = { economy: "Економ", standard: "Стандарт", premium: "Преміум" };
        return map[pack] || "—";
    }

    function renderAutoBundle(pack){
        const el = $("#packAuto");
        if (!el) return;

        // Можеш змінити тексти під себе — це MVP-підказка “що входить”
        const text = {
            economy: `
        • Фасади: ДСП (або базовий варіант)<br>
        • Комфорт: Економ (базові петлі/напрямні)<br>
        • Стільниця: ДСП/ламінат (простий рівень)<br>
        • LED: без / мінімум
      `,
            standard: `
        • Фасади: ДСП або фарбований МДФ (підбір)<br>
        • Комфорт: Стандарт (доводчики + кращі напрямні)<br>
        • Стільниця: кращий клас ламінату / компакт (за потреби)<br>
        • LED: часто так (підсвітка робочої зони)
      `,
            premium: `
        • Фасади: фарбований МДФ / скло+профіль<br>
        • Комфорт: Преміум (BLUM/Hettich або аналог)<br>
        • Стільниця: преміум-рішення (компакт/камінь/інше)<br>
        • LED: “вау” сценарії / вітрини
      `
        };

        el.innerHTML = text[pack] || "Оберіть пакет — ми покажемо, що саме підхопиться по фасадах / фурнітурі / стільниці / LED.";
    }

    function applySelectedUI(pack){
        const root = $("#packageCards");
        if (!root) return;

        $$(".card[data-pack]", root).forEach(c => c.classList.remove("selected"));
        if (pack) {
            const card = root.querySelector(`.card[data-pack="${pack}"]`);
            if (card) card.classList.add("selected");
        }
    }

    function wirePackageCardsOnce(){
        const root = $("#packageCards");
        if (!root) return;

        if (root.dataset.kcStep5Bound === "1") return;
        root.dataset.kcStep5Bound = "1";

        root.addEventListener("click", (e) => {
            const card = e.target.closest(".card[data-pack]");
            if (!card || !root.contains(card)) return;

            const pack = String(card.dataset.pack || "").trim();
            if (!pack) return;

            // UI
            applySelectedUI(pack);

            // DATA
            setState({ pack }, "step5:pack");

            // Optional: also keep a human label if you want later
            // setState({ packLabel: packLabel(pack) }, "step5:packLabel");

            // Auto bundle block
            renderAutoBundle(pack);

            // Notify others
            window.KC_BUS?.emit?.("kc:package-changed", { pack, package: pack });
        });
    }

    function hydrateFromState(){
        const st = getState();
        const pack = st.pack || null;
        applySelectedUI(pack);
        renderAutoBundle(pack);
    }

    window.KC_STEPS[5] = {
        enter() {
            wirePackageCardsOnce();
            hydrateFromState();
        },
        leave() {
            return true;
        }
    };

    // Optional auto-init if your runner sometimes doesn't call enter
    (function autoInitStep5(){
        function run(){
            if (!document.querySelector('.step[data-step="5"]')) return;
            try { wirePackageCardsOnce(); } catch(e){}
            try { hydrateFromState(); } catch(e){}
        }
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
        else run();
    })();

})();
