// js/kc.state.bus.js
(function(){
    "use strict";

    // ===== SINGLE SOURCE OF TRUTH =====
    // Якщо у тебе вже є KC_STATE — він не перетирається.
    window.KC_STATE = window.KC_STATE || {};

    // ===== GET =====
    function kcGetState(){
        return window.KC_STATE;
    }

    // ===== MERGE SET + EVENT =====
    // Патчимо state і диспатчимо KC_STATE_UPDATED (один стандарт на весь проект)
    // + dedupe (щоб не спамити перерахунком)
    let _lastHash = "";

    function stableStringify(obj){
        // простий стабільний stringify (MVP) без рекурсивних циклів
        try{
            const keys = [];
            JSON.stringify(obj, (k,v)=>{ keys.push(k); return v; });
            keys.sort();
            return JSON.stringify(obj, keys);
        }catch(e){
            // fallback
            return String(Date.now());
        }
    }

    function sliceForStep4(state){
        const dims = state?.dims || {};

        const src = Object.assign(
            {},
            state?.appliances || {},
            state?.tech || {},
            state?.equipment || {},
            state?.step4?.tech || {}
        );

        const Araw = Number(dims.A ?? state?.dimsA ?? state?.wallWidth ?? state?.wallWidthA ?? 0);
        const Braw = Number(dims.B ?? state?.dimsB ?? state?.wallWidthB ?? 0);
        const Craw = Number(dims.C ?? state?.dimsC ?? state?.wallWidthC ?? 0);
        const angle = Number(dims.angle ?? state?.angle ?? 0);

        const layout = String(state?.layout ?? state?.planning ?? state?.plan ?? state?.kitchenShape ?? "").toLowerCase();
        const isL = layout.includes("l") || layout.includes("кут");
        const isU = layout.includes("u") || layout.includes("п");

        const A = Araw;
        const B = (isL || isU) ? Braw : 0;
        const C = (isU) ? Craw : 0;

        return {
            layout,
            dims: { A, B, C, angle },
            tech: {
                fridge: !!src.fridge,
                dishwasher: !!src.dishwasher,
                dishwasherWidth: Number(src.dishwasherWidth ?? src.dwWidth ?? src.pmmWidth ?? 600),
                sink: !!src.sink,
                hob: !!src.hob,
                oven: !!src.oven,
                hood: !!src.hood
            },
            modulesPrefs: {
                fridgeSide: state?.modulesPrefs?.fridgeSide ?? "left"
            }
        };
    }

    function dispatchStateUpdated(reason){
        const state = window.KC_STATE || {};
        const slice = sliceForStep4(state);

        const hash = JSON.stringify(slice);
        if (hash === _lastHash) return;
        _lastHash = hash;

        window.dispatchEvent(new CustomEvent("KC_STATE_UPDATED", {
            detail: { reason: reason || "state:set", slice }
        }));
    }



    function kcSetState(patch, reason){
        if (!patch || typeof patch !== "object") return;

        // shallow merge
        const s = window.KC_STATE;
        for (const k in patch){
            s[k] = patch[k];
        }

        dispatchStateUpdated(reason || "kcSetState");
    }

    // ===== OPTIONAL: convenience setters for tech =====
    function kcSetAppliance(key, value){
        const s = window.KC_STATE;
        const a = s.appliances || {};
        a[key] = !!value;
        s.appliances = a;
        dispatchStateUpdated("appliance:" + key);
    }

    // ===== EXPORTS =====
    window.kcGetState = window.kcGetState || kcGetState; // не перетираємо якщо вже є
    window.kcSetState = window.kcSetState || kcSetState;
    window.kcDispatchStateUpdated = window.kcDispatchStateUpdated || dispatchStateUpdated;
    window.kcSetAppliance = window.kcSetAppliance || kcSetAppliance;

})();
