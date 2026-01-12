// js/step6.js (FIXED) — Facades + LED + Handles, with auto-from-pack
(function () {
    "use strict";

    window.KC_STEPS = window.KC_STEPS || {};

    const $  = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    function getState() {
        if (typeof window.kcGetState === "function") return window.kcGetState();
        if (window.KC && typeof window.KC.getState === "function") return window.KC.getState();
        return window.KC_STATE || {};
    }

    function setState(patch, reason) {
        if (typeof window.kcSetState === "function") {
            window.kcSetState(patch, reason || "step6");
            return;
        }
        if (window.KC && typeof window.KC.setState === "function") {
            window.KC.setState(patch);
            return;
        }
        window.KC_STATE = Object.assign(window.KC_STATE || {}, patch);
        window.dispatchEvent(new CustomEvent("KC_STATE_UPDATED", { detail: { patch, reason: reason || "step6:fallback" } }));
    }

    function setActiveCard(container, attrName, value) {
        if (!container) return;
        const cards = $$(`.card[${attrName}]`, container);
        cards.forEach(c => c.classList.remove("active", "selected"));

        const picked = container.querySelector(`.card[${attrName}="${CSS.escape(String(value || ""))}"]`);
        if (picked) picked.classList.add("active", "selected");
    }

    // Safe pick: if desired option missing, fallback to first available
    function safePick(containerId, attr, desired) {
        const el = document.getElementById(containerId);
        if (!el) return desired;

        const ok = el.querySelector(`.card[${attr}="${CSS.escape(String(desired || ""))}"]`);
        if (ok) return desired;

        const first = el.querySelector(`.card[${attr}]`);
        return first ? (first.getAttribute(attr) || desired) : desired;
    }

    // Auto-preset depends on state.pack (economy|standard|premium)
    function autoFromPack() {
        const st = getState();

        // ✅ new canonical key:
        const packRaw = st.pack || st.package || "standard";
        const pack = String(packRaw).toLowerCase().trim();
        const packNorm =
            (["econom","eco","economy","економ","економія"].includes(pack)) ? "econom" :
                (["premium","prem","прем","преміум","премиум"].includes(pack)) ? "premium" :
                    "standard";


        const presetByPack = {
            econom:   { facade: "mdf",   led: "none",  handle: "standard" },
            standard: { facade: "mdf",   led: "under", handle: "profile"  },
            premium:  { facade: "glass", led: "smart", handle: "gola"     }
        };
        const preset = presetByPack[packNorm] || presetByPack.standard;


        const facade = safePick("facadeCards", "data-facade", preset.facade);
        const led    = safePick("ledCards",    "data-led",    preset.led);
        const handle = safePick("handleCards", "data-handle", preset.handle);

        // UI
        setActiveCard(document.getElementById("facadeCards"), "data-facade", facade);
        setActiveCard(document.getElementById("ledCards"),    "data-led",    led);
        setActiveCard(document.getElementById("handleCards"), "data-handle", handle);

        // DATA (keep both normalized + legacy fields)
        setState({
            facade, handle,
            led, ledMode: led,      // ✅ SoT
            facadeType: facade,
            ledType: led,           // legacy
            handleType: handle,
            step6Customized: false
        }, "step6:auto");


        window.KC_BUS?.emit?.("kc:step6-auto", { facade, led, handle, pack });
        window.KC_BUS?.emit?.("kc:step6-changed", {
            facade: patch.facade,
            led: patch.ledMode || patch.led,
            handle: patch.handle
        });

    }

    function applyFromStateIfAny() {
        const st = getState();

        const facade = st.facade || st.facadeType || null;
        const led = st.ledMode || st.led || st.ledType || null;

        const handle = st.handle || st.handleType || null;

        if (facade) setActiveCard(document.getElementById("facadeCards"), "data-facade", facade);
        if (led)    setActiveCard(document.getElementById("ledCards"),    "data-led",    led);
        if (handle) setActiveCard(document.getElementById("handleCards"), "data-handle", handle);

        // If something missing -> auto preset
        if (!facade || !led || !handle) autoFromPack();
    }

    function wireStep6Once() {
        const root = document.querySelector('.step[data-step="6"]');
        if (!root) return;

        if (root.dataset.step6Wired === "1") return;
        root.dataset.step6Wired = "1";

        const resetBtn = document.getElementById("resetStep6Btn");

        // clicks on cards + reset
        root.addEventListener("click", (e) => {
            const resetHit = e.target.closest("#resetStep6Btn");
            if (resetHit) {
                autoFromPack();
                return;
            }

            const facadeEl = e.target.closest("[data-facade]");
            const ledEl    = e.target.closest("[data-led]");
            const handleEl = e.target.closest("[data-handle]");

            if (!facadeEl && !ledEl && !handleEl) return;

            const patch = { step6Customized: true };

            if (facadeEl) {
                const val = String(facadeEl.dataset.facade || "").trim();
                if (val) {
                    setActiveCard(document.getElementById("facadeCards"), "data-facade", val);
                    patch.facade = val; patch.facadeType = val;
                }
            }

            if (ledEl) {
                const val = String(ledEl.dataset.led || "").trim();
                if (val) {
                    setActiveCard(document.getElementById("ledCards"), "data-led", val);
                    patch.led = val; patch.ledType = val; patch.ledMode = val;

                }
            }

            if (handleEl) {
                const val = String(handleEl.dataset.handle || "").trim();
                if (val) {
                    setActiveCard(document.getElementById("handleCards"), "data-handle", val);
                    patch.handle = val; patch.handleType = val;
                }
            }

            setState(patch, "step6:manual");

            window.KC_BUS?.emit?.("kc:step6-changed", {
                facade: patch.facade,
                led: patch.ledMode || patch.led,
                handle: patch.handle
            });
        });

        if (resetBtn) {
            resetBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                autoFromPack();
            });
        }

        // ✅ If user changes pack on Step5 and returns here -> refresh auto only if not customized
        window.KC_BUS?.on?.("kc:package-changed", () => {
            const st = getState();
            if (!st.step6Customized) autoFromPack();
        });

        // Also react to generic state updates (optional safety)
        window.addEventListener("KC_STATE_UPDATED", () => {
            const st = getState();
            if (!st.step6Customized) {
                const facade = st.facade || st.facadeType;
                const led    = st.ledMode || st.led || st.ledType;   // ✅ тут
                const handle = st.handle || st.handleType;

                if (facade) setActiveCard(document.getElementById("facadeCards"), "data-facade", facade);
                if (led)    setActiveCard(document.getElementById("ledCards"),    "data-led",    led);
                if (handle) setActiveCard(document.getElementById("handleCards"), "data-handle", handle);
            }
        });

    }


    (function wireAntresol(){
        const el = document.getElementById("hasAntresolToggle");
        if (!el) return;

        // init from state
        const st = (typeof kcGetState === "function") ? kcGetState() : (window.KC_STATE || {});
        el.checked = !!(st.hasAntresol || st.antresol || st.antresoli);

        // write to state
        el.addEventListener("change", () => {
            if (typeof kcSetState === "function") {
                kcSetState({ hasAntresol: !!el.checked }, "step6:antresol");
            } else {
                window.KC_STATE = Object.assign(window.KC_STATE || {}, { hasAntresol: !!el.checked });
                window.dispatchEvent(new CustomEvent("KC_STATE_UPDATED", { detail: { patch: { hasAntresol: !!el.checked }, reason: "step6:antresol:fallback" } }));
            }
        });

        // keep synced if state changes elsewhere
        window.addEventListener("KC_STATE_UPDATED", (e) => {
            const p = e?.detail?.patch || {};
            if ("hasAntresol" in p) el.checked = !!p.hasAntresol;
        });
    })();

    window.KC_STEPS[6] = {
        enter() {
            wireStep6Once();
            applyFromStateIfAny();
        },
        leave() { return true; }
    };

})();
