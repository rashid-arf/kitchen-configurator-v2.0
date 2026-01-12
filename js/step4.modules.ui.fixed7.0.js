// js/step4.modules.ui.fixed4.0.js
(function(){
    "use strict";

    function st(){
        return (window.kcGetState ? window.kcGetState() : (window.KC_STATE || {}));
    }

    function getStep4Root(){
        return document.querySelector('.step[data-step="4"]');
    }

    function ensurePanel(){
        const step = getStep4Root();
        if (!step) return null;

        let panel = step.querySelector("#modulesPanel");
        if (panel) return panel;

        panel = document.createElement("div");
        panel.id = "modulesPanel";
        panel.className = "calc-panel";
        panel.style.marginTop = "14px";
        panel.innerHTML = `
      <div class="hr"></div>
      <div class="kicker">Модулі (MVP)</div>
      <div class="tiny muted" style="margin-top:6px;">Автопідбір після вибору техніки та розмірів</div>
      <div id="modulesMeta" class="tiny muted" style="margin-top:10px;"></div>
      <div id="modulesList" style="margin-top:12px;"></div>
      <div id="modulesEmpty" class="tiny muted" style="margin-top:12px; display:none;">
        Нема модулів для відображення (перевір техніку/ширину).
      </div>
    `;
        step.appendChild(panel);
        return panel;
    }

    function render(payload) {
        const panel = ensurePanel();
        if (!panel) return;

        const metaEl = panel.querySelector("#modulesMeta");
        const listEl = panel.querySelector("#modulesList");
        const emptyEl = panel.querySelector("#modulesEmpty");

        const modules = payload?.modules || [];
        const wallWidth = Number(payload?.wallWidth || 0);
        const used = Number(payload?.meta?.used ?? payload?.used ?? 0);
        const remaining = Number(payload?.meta?.remaining ?? payload?.remaining ?? 0);
        const note = String(payload?.meta?.note || "");

        const zonesMeta =
            payload?.meta && (payload.meta.A || payload.meta.B || payload.meta.C || payload.meta.ISLAND || payload.meta.UPPER)
                ? `
        <div class="tiny muted" style="margin-top:8px; line-height:1.55;">
          ${payload.meta.A ? `A: <b>${Number(payload.meta.A.len) || 0}</b> · used <b>${Number(payload.meta.A.used) || 0}</b> · rem <b>${Number(payload.meta.A.remaining) || 0}</b>${payload.meta.A.note ? ` <span class="muted">(${payload.meta.A.note})</span>` : ""}<br>` : ""}
          ${payload.meta.B ? `B: <b>${Number(payload.meta.B.len) || 0}</b> · used <b>${Number(payload.meta.B.used) || 0}</b> · rem <b>${Number(payload.meta.B.remaining) || 0}</b>${payload.meta.B.note ? ` <span class="muted">(${payload.meta.B.note})</span>` : ""}<br>` : ""}
          ${payload.meta.C ? `C: <b>${Number(payload.meta.C.len) || 0}</b> · used <b>${Number(payload.meta.C.used) || 0}</b> · rem <b>${Number(payload.meta.C.remaining) || 0}</b>${payload.meta.C.note ? ` <span class="muted">(${payload.meta.C.note})</span>` : ""}<br>` : ""}
          ${payload.meta.ISLAND ? `ISLAND: <b>${Number(payload.meta.ISLAND.len) || 0}</b> · used <b>${Number(payload.meta.ISLAND.used) || 0}</b> · rem <b>${Number(payload.meta.ISLAND.remaining) || 0}</b>${payload.meta.ISLAND.note ? ` <span class="muted">(${payload.meta.ISLAND.note})</span>` : ""}<br>` : ""}
          ${payload.meta.UPPER ? `UPPER: <b>${Number(payload.meta.UPPER.count) || 0}</b> <span class="muted">(${payload.meta.UPPER.note || ""})</span><br>` : ""}
        </div>
      `
                : "";

        if (metaEl) {
            metaEl.innerHTML = `
      Ширина: <b>${wallWidth}</b> мм · Використано: <b>${used}</b> мм · Залишок: <b>${remaining}</b> мм
      ${note ? `<div class="tiny muted" style="margin-top:6px;">${note}</div>` : ""}
      ${zonesMeta}
    `;
        }

        if (!modules.length) {
            if (listEl) listEl.innerHTML = "";
            if (emptyEl) emptyEl.style.display = "block";
            return;
        }
        if (emptyEl) emptyEl.style.display = "none";

        const rows = modules.map((m, i) => {
            const isIsland = (m.type === "island") || (m.role === "island");
            const isUpper  = (m.type === "upper")  || (m.role === "upper");

            const prev = modules[i - 1];
            const prevIsIsland = prev && ((prev.type === "island") || (prev.role === "island"));
            const prevIsUpper  = prev && ((prev.type === "upper") || (prev.role === "upper"));

            const sepIsland = (isIsland && !prevIsIsland)
                ? `<div class="tiny muted" style="margin:10px 0 6px; opacity:.85;">— Острів —</div>`
                : "";

            const sepUpper = (isUpper && !prevIsUpper)
                ? `<div class="tiny muted" style="margin:10px 0 6px; opacity:.85;">— Верх —</div>`
                : "";

            const label = m.label || m.role || m.id || "Модуль";
            const w = Number(m.width || 0);

            return `
    ${sepIsland}
    ${sepUpper}
    <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(255,255,255,.06);">
      <div style="font-weight:700;">${i + 1}. ${label}</div>
      <div class="tiny muted">${w} мм</div>
    </div>
  `;
        }).join("");

        listEl.innerHTML = rows;
    }

    function stableStringify(obj){
        try { return JSON.stringify(obj); } catch(e){ return ""; }
    }

    let __lastModulesHash = "";
    let __lastMetaHash = "";

    function pushModulesToState(modules, meta){
        const m = modules || [];
        const t = meta || {};

        const h1 = stableStringify(m);
        const h2 = stableStringify(t);

        // якщо нічого не змінилось — не пушимо (це і є захист від циклу)
        if (h1 === __lastModulesHash && h2 === __lastMetaHash) return;

        __lastModulesHash = h1;
        __lastMetaHash = h2;

        // ✅ правильне оновлення state (з подією)
        if (typeof window.kcSetState === "function") {
            window.kcSetState({ modules: m, modulesMeta: t }, "step4:modules");
        } else {
            // fallback
            window.KC_STATE = Object.assign(window.KC_STATE || {}, { modules: m, modulesMeta: t });
        }
    }


    function recalc(){
        const root = getStep4Root();
        if (!root) return;

        if (!window.KC_STEP4 || typeof window.KC_STEP4.calcModulesRules !== "function"){
            console.warn("⚠️ STEP4 engine not found. Load step4.modules.engine.js before UI.");
            return;
        }

        const state = st();
        const payload = window.KC_STEP4.calcModulesRules(state);

        // ✅ замість мутації локального state — пушимо в глобальний state без циклу
        pushModulesToState(payload.modules, payload.meta);

        render(payload);
    }

    function wire(){
        ensurePanel();

        window.addEventListener("KC_STATE_UPDATED", recalc);
        window.addEventListener("KC_STATE_CHANGED", recalc);
        window.addEventListener("kc:state", recalc);

        if (window.KC_BUS && typeof window.KC_BUS.addEventListener === "function") {
            window.KC_BUS.addEventListener("kc:state", recalc);
        }

        document.addEventListener("click", (e) => {
            const el = e.target && e.target.closest
                ? e.target.closest('[data-appliance], [data-tech], .card[data-appliance], .card[data-style], .card[data-layout], .card')
                : null;
            if (!el) return;

            setTimeout(() => recalc(), 0);
        });

        document.addEventListener("change", (e)=>{
            const t = e.target;
            if (!t) return;
            const id = (t.id || "").toLowerCase();
            const name = (t.name || "").toLowerCase();
            if (
                id.includes("dishwasher") || name.includes("dishwasher") ||
                id.includes("pmm") || name.includes("pmm") ||
                id.includes("fridge") || name.includes("fridge") ||
                id.includes("sink") || name.includes("sink") ||
                id.includes("layout") || name.includes("layout")
            ){
                recalc();
            }
        });

        recalc();
    }

    if (document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded", wire);
    } else {
        wire();
    }

    window.KC_STEP4 = window.KC_STEP4 || {};
    window.KC_STEP4.recalcModules = recalc;

})();
