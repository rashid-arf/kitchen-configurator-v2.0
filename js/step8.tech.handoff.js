(function () {
  "use strict";
  if (window.KC_STEP8_TECH_HANDOFF_LOADED) return;
  window.KC_STEP8_TECH_HANDOFF_LOADED = true;

  const HANDOFF_KEY = "KC_TECH_HANDOFF_V1";
  const TECH_URL = "tech-calc.html";

  const $ = (s, r=document) => r.querySelector(s);
  const num = (v, d=0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };

  function getState() {
    if (typeof window.kcGetState === "function") return window.kcGetState();
    return window.KC_STATE || {};
  }

  function isManagerMode() {
    const mv = $("#calcManagerView");
    if (!mv) return false;
    return getComputedStyle(mv).display !== "none";
  }

  function normalizeModule(m) {
    if (!m) return null;
    const role = String(m.role || m.type || "").toLowerCase();
    return {
      role: role || "base",
      name: m.name || m.title || m.label || "",
      width: num(m.width ?? m.w, 0),
      height: num(m.height ?? m.h, 0),
      depth: num(m.depth ?? m.d, 0),
      shelvesCount: num(m.shelvesCount ?? m.shelves ?? 0, 0),
      doorCount: num(m.doorCount ?? m.doors ?? 0, 0),
      drawerCount: num(m.drawerCount ?? m.drawers ?? 0, 0),
      meta: m.meta || {}
    };
  }

  function resolveModules(st) {
    if (Array.isArray(st.modules) && st.modules.length) return st.modules.map(normalizeModule).filter(Boolean);

    if (window.KC_STEP4 && typeof window.KC_STEP4.calcModulesRules === "function") {
      try {
        const payload = window.KC_STEP4.calcModulesRules(st);
        if (payload && Array.isArray(payload.modules) && payload.modules.length) {
          return payload.modules.map(normalizeModule).filter(Boolean);
        }
      } catch (e) {}
    }
    return [];
  }

  function buildPayload() {
    const st = getState();
    const modules = resolveModules(st);

    // Оновлення значень doorCount та drawerCount перед збереженням в localStorage
    modules.forEach(m => {
      if (m.role === "base") {
        m.doorCount = 2; // Установіть значення дверей
        m.drawerCount = 3; // Установіть значення ящиків
      }
    });

    const d = st.dims || {};
    const fx = st.fx || {};
    const eur = num(fx.eurManual, 0) || num(fx.eurNbu, 0) || 50.4;

    return {
      v: 1,
      meta: {
        project: "KC",
        createdAt: new Date().toISOString(),
        mode: "manager"
      },
      layout: st.layout || "straight",
      dims: {
        A: num(d.A, 0), B: num(d.B, 0),
        corner: !!d.corner,
        island: !!d.island,
        islandDepth: num(d.islandDepth, 0)
      },
      modules,
      selections: {
        hardwarePackage: st.hardwarePackage || st.comfortKit || "standard",
        materialTier: st.package || st.materialTier || "standard",
        facadeStyle: st.facadeStyle || st.facadeType || "",
        ledMode: st.ledMode || st.ledType || st.led || "none",
        hasAntresol: !!(st.hasAntresol ?? st.antresol ?? st.antresoli ?? st.mezzanine ?? st.mez)
      },
      pricing: {
        eur,
        calcOverrides: st.calcOverrides || {}
      }
    };
  }

  function persistPayload(payload) {
    try {
      localStorage.setItem(HANDOFF_KEY, JSON.stringify(payload));
      return true;
    } catch (e) {
      console.warn("KC handoff: localStorage failed", e);
      return false;
    }
  }

  function goTech() {
    if (!isManagerMode()) {
      alert("Перехід у технічний калькулятор доступний лише в режимі 'Менеджер'.");
      return;
    }
    const payload = buildPayload();
    if (!payload.modules.length) {
      alert("Немає модулів для передачі. Перевір Step 4 (модулі).");
      return;
    }
    if (!persistPayload(payload)) {
      alert("Не вдалося зберегти дані для техкалькулятора (localStorage).");
      return;
    }
    window.location.href = TECH_URL;
  }

  function ensureBtn() {
    const mgr = $("#calcManagerView");
    if (!mgr) return;

    let btn = $("#toTechCalcBtn");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "toTechCalcBtn";
      btn.type = "button";
      btn.className = "btn";
      btn.style.width = "100%";
      btn.style.marginTop = "10px";
      btn.textContent = "➡️ Перейти в технічний калькулятор";
      // вставляємо під таблицю менеджера
      const anchor = $("#calcManagerTable") || mgr;
      anchor.insertAdjacentElement("afterend", btn);
    }

    btn.addEventListener("click", goTech);

    // disable/enable by mode
    const toggle = () => {
      const st = getState();
      const mods = resolveModules(st);
      const ok = isManagerMode() && mods.length > 0;
      btn.disabled = !ok;
      btn.style.opacity = ok ? "1" : "0.55";
      btn.title = ok ? "" : "Увімкніть режим 'Менеджер' та переконайтесь, що модулі згенеровані.";
    };

    toggle();
    window.addEventListener("KC_STATE_UPDATED", toggle);
    window.addEventListener("KC_STATE_CHANGED", toggle);
    ["click","change"].forEach(ev => document.addEventListener(ev, () => setTimeout(toggle, 0), true));
  }

  // init
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureBtn);
  } else {
    ensureBtn();
  }

})();
