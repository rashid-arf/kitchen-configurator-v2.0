// js/step8.js
(function () {
    "use strict";

    // ✅ Guard: якщо Step8 вже підключено — не інітимо двічі
    if (window.KC_STEP8_LOADED) return;
    window.KC_STEP8_LOADED = true;

    const $ = (s, r = document) => r.querySelector(s);

    function getState() {
        if (typeof window.kcGetState === "function") return window.kcGetState();
        return window.KC_STATE || {};
    }

    function setState(patch, reason) {
        if (typeof window.kcSetState === "function") return window.kcSetState(patch, reason || "step8");
        window.KC_STATE = Object.assign(window.KC_STATE || {}, patch);
        try {
            window.dispatchEvent(
                new CustomEvent("KC_STATE_UPDATED", { detail: { patch, reason: reason || "step8:fallback" } })
            );
        } catch (e) {}
    }

    function num(v, def = 0) {
        const n = Number(v);
        return Number.isFinite(n) ? n : def;
    }

    function bool(v, def = false) {
        if (typeof v === "boolean") return v;
        if (v === 1 || v === "1") return true;
        if (v === 0 || v === "0") return false;
        return def;
    }

    function fmtUAH(v) {
        const n = Math.round(num(v, 0));
        return n.toLocaleString("uk-UA") + " грн";
    }

    // === Blum Standard (mid) — базові ціни в EUR (ти дав) ===
    const BLUM_STANDARD = {
        hingeSetEur: 3.57, // 3.04 + 0.53
        drawerSetEur: 77.43, // 070887
        liftHKSetEur: 62.3, // 097953
        liftHFSetEur: 101.82 // 115204
    };

    // === SHEET AREA ===
    function sheetAreaM2() {
        // MVP: 2800×2070
        return (2800 * 2070) / 1_000_000;
    }

    // === MODULES source ===
    function resolveModulesForCalc(state) {
        const st = state || getState();

        // 1) Prefer state.modules (якщо Step4 вже записав)
        if (Array.isArray(st.modules) && st.modules.length) return st.modules;

        // 2) Prefer Step4 engine direct calc
        if (window.KC_STEP4 && typeof window.KC_STEP4.calcModulesRules === "function") {
            try {
                const payload = window.KC_STEP4.calcModulesRules(st);
                if (payload && Array.isArray(payload.modules) && payload.modules.length) return payload.modules;
            } catch (e) {}
        }

        return [];
    }

    // === AREAS from modules (MVP) ===
    // Robust: якщо Step4 не дає facadeAreaM2/facadesCount — беремо fallback від doorCount/drawerCount/role
    function computeAreas(modules, opts = {}) {
        const mm2 = (a, b) => Math.max(0, num(a)) * Math.max(0, num(b));
        const mm2_to_m2 = (v) => num(v) / 1_000_000;

        const baseH = num(opts.baseH, 830);
        const upperH = num(opts.upperH, 720);
        const tallH = num(opts.tallH, 2300);

        const baseD = num(opts.baseD, 560);
        const upperD = num(opts.upperD, 320);
        const tallD = num(opts.tallD, 560);

        let corpSidesMM2 = 0;
        let corpTBMM2 = 0;
        let shelvesMM2 = 0;
        let backMM2 = 0;
        let facadeMM2 = 0;

        (modules || []).forEach((m) => {
            if (!m) return;

            const role = String(m.role || m.type || "").toLowerCase();
            const W = num(m.width ?? m.w ?? 0);
            const H = num(m.height ?? m.h ?? 0);
            const D = num(m.depth ?? m.d ?? 0);

            // дефолти по типу
            let hh = H,
                dd = D;
            if (!hh) hh = role === "upper" ? upperH : role === "tall" || role === "column" ? tallH : baseH;
            if (!dd) dd = role === "upper" ? upperD : role === "tall" || role === "column" ? tallD : baseD;

            // Корпус (спрощено)
            corpSidesMM2 += 2 * mm2(hh, dd); // 2 боковини
            corpTBMM2 += 2 * mm2(W, dd); // дно + кришка

            // полиці
            const shelves = num(m.shelves ?? m.shelvesCount ?? 0);
            if (shelves > 0) shelvesMM2 += shelves * mm2(W, dd);

            // задня стінка
            backMM2 += mm2(W, hh);

            // === ФАСАДИ ===
            // 1) якщо модуль дає готову площу
            if (num(m.facadeAreaM2, 0) > 0) {
                facadeMM2 += num(m.facadeAreaM2, 0) * 1_000_000;
                return;
            }

            // 2) якщо модуль дає facadesCount
            let fc = num(m.facadesCount ?? m.facades ?? 0);

            // 3) fallback: якщо нема facadesCount — пробуємо doorCount/drawerCount
            const doorCount = num(m.doorCount ?? 0);
            const drawerCount = num(m.drawerCount ?? 0);

            if (fc <= 0 && (doorCount > 0 || drawerCount > 0)) {
                // MVP-логіка:
                // - двері незалежно від того 1 чи 2 стулки: площа ≈ W×H (бо сумарно перекривають модуль)
                // - шухляди (стек): площа ≈ W×H (бо сумарно теж перекривають модуль)
                // Якщо є і двері і шухляди (рідко для MVP) — додаємо 2×(W×H)
                const blocks = (doorCount > 0 ? 1 : 0) + (drawerCount > 0 ? 1 : 0);
                facadeMM2 += blocks * mm2(W, hh);
                return;
            }

            // 4) fallback від role (щоб фасади не були нуль):
            if (fc <= 0) {
                // типові ролі, де майже завжди є фасад
                if (
                    role === "base" ||
                    role === "sink" ||
                    role === "dishwasher" ||
                    role === "corner" ||
                    role === "fridge" ||
                    role === "tall" ||
                    role === "column" ||
                    role === "cooking" ||
                    role === "cargo_300" ||
                    role === "base_450"
                ) {
                    fc = 1;
                }
            }

            if (fc > 0) facadeMM2 += fc * mm2(W, hh);
        });

        const corpSidesM2 = mm2_to_m2(corpSidesMM2);
        const corpBottomTopM2 = mm2_to_m2(corpTBMM2);
        const corpShelvesM2 = mm2_to_m2(shelvesMM2);

        const corpM2 = corpSidesM2 + corpBottomTopM2 + corpShelvesM2;
        const backM2 = mm2_to_m2(backMM2);
        const facadeM2 = mm2_to_m2(facadeMM2);

        return { corpSidesM2, corpBottomTopM2, corpShelvesM2, corpM2, backM2, facadeM2 };
    }

    // === Params (presets + overrides) ===
    function getParams(state) {
        const st = state || getState();
        const pack = st.package || "standard";
        const packKey = pack === "economy" ? "econ" : pack;

        const PRESETS = {
            econ: {
                corpSheetPrice: 2200,
                corpWaste: 1.15,
                facadeM2Price: 1900,
                facadeWaste: 1.15,
                backSheetPrice: 650,
                backWaste: 1.05,
                topOn: true,
                topPerM: 2500,
                topDepth: 600,
                bspOn: true,
                bspPerM2: 1800,
                bspH: 600,
                servicesPct: 0.12
            },
            standard: {
                corpSheetPrice: 2600,
                corpWaste: 1.15,
                facadeM2Price: 2600,
                facadeWaste: 1.15,
                backSheetPrice: 750,
                backWaste: 1.05,
                topOn: true,
                topPerM: 2800,
                topDepth: 600,
                bspOn: true,
                bspPerM2: 2100,
                bspH: 600,
                servicesPct: 0.12
            },
            premium: {
                corpSheetPrice: 3200,
                corpWaste: 1.15,
                facadeM2Price: 4200,
                facadeWaste: 1.15,
                backSheetPrice: 900,
                backWaste: 1.05,
                topOn: true,
                topPerM: 3500,
                topDepth: 600,
                bspOn: true,
                bspPerM2: 2800,
                bspH: 600,
                servicesPct: 0.12
            }
        };

        const preset = PRESETS[packKey] || PRESETS.standard;
        const ov = st.calcOverrides || {};

        // comfort -> hardwarePct (fallback для econ/premium)
        const comfortRaw = st.comfortKit || st.comfort || packKey || "standard";
        const comfortKey = comfortRaw === "econom" ? "econ" : comfortRaw;
        const HARDWARE_PCT = { econ: 0.08, standard: 0.1, premium: 0.12 };
        const hardwarePct = num(ov.hardwarePct, HARDWARE_PCT[comfortKey] ?? 0.1);

        return {
            pack,
            comfort: comfortKey,

            corpSheetPrice: num(ov.corpSheetPrice, preset.corpSheetPrice),
            corpWaste: Math.max(1, num(ov.corpWaste, preset.corpWaste)),

            facadeM2Price: num(ov.facadeM2Price, preset.facadeM2Price),
            facadeWaste: Math.max(1, num(ov.facadeWaste, preset.facadeWaste)),

            backSheetPrice: num(ov.backSheetPrice, preset.backSheetPrice),
            backWaste: Math.max(1, num(ov.backWaste, preset.backWaste)),

            topOn: bool(ov.topOn, preset.topOn),
            topPerM: num(ov.topPerM, preset.topPerM),
            topDepth: num(ov.topDepth, preset.topDepth),

            bspOn: bool(ov.bspOn, preset.bspOn),
            bspPerM2: num(ov.bspPerM2, preset.bspPerM2),
            bspH: num(ov.bspH, preset.bspH),

            servicesPct: num(ov.servicesPct, preset.servicesPct),
            hardwarePct
        };
    }

    // === Run length for countertop (MVP) ===
    function calcRunMm(state) {
        const st = state || getState();
        const d = st.dims || {};
        const A = num(d.A, 0);
        const B = num(d.B, 0);
        const layout = st.layout || "straight";
        const L = layout === "line" ? "straight" : layout;

        let run = 0;
        if (L === "corner") run = A + B;
        else if (L === "u") run = A + B;
        else run = A;

        // MVP: якщо є холодильник-колона — віднімаємо 600
        const t = st.tech || {};
        const hasCol = !!(t.fridge || t.fridgeColumn || t.fridge_col);
        if (hasCol) run -= 600;

        return Math.max(0, run);
    }

    // rough hardware counts by roles (fallback)
    function normalizeModulesForHardware(modules) {
        let doors = 0;
        let drawers = 0;

        (modules || []).forEach((m) => {
            if (!m || !m.role) return;

            drawers += Number(m.drawerCount ?? 0);

            switch (m.role) {
                case "sink":
                case "base":
                case "base_450":
                case "cargo_300":
                    doors += 2;
                    break;

                case "dishwasher":
                    doors += 1;
                    break;

                case "cooking":
                    drawers += 3;
                    break;

                case "corner":
                    doors += 2;
                    break;

                case "fridge":
                    doors += 1;
                    break;

                default:
                    doors += 1;
            }
        });

        return { doors, drawers };
    }

    // === MAIN CALC ===
    function calcKitchen() {
        const st = getState();

        const modules = resolveModulesForCalc(st);

        // counts
        const hwCounts = normalizeModulesForHardware(modules);

        // ✅ має бути let
        let doors = num(hwCounts.doors, 0);
        let drawers = num(hwCounts.drawers, 0);

        // Якщо Step4 віддає точні doorCount/drawerCount — додаємо
        (modules || []).forEach((m) => {
            if (!m) return;
            doors += num(m.doorCount ?? 0, 0);
            drawers += num(m.drawerCount ?? 0, 0);
        });

        const areas = computeAreas(modules);

        // збережемо назад у state (щоб Step8 не залежав від UI Step4)
        setState({ modules, areas }, "step8:areas");

        const p = getParams(st);

        // === EUR RATE (temporary) ===
        // пріоритет: fx.eurManual → fx.eurNbu → fallback 50.4
        const fx = st.fx || {};
        const eurManual = num(fx.eurManual, 0);
        const eurNbu = num(fx.eurNbu, 0);
        const eur = eurManual > 0 ? eurManual : eurNbu > 0 ? eurNbu : 50.4;

        // materials
        const corpNeedM2 = areas.corpM2 * p.corpWaste;
        const corpSheetsEq = corpNeedM2 / sheetAreaM2();
        const corpCost = corpSheetsEq * p.corpSheetPrice;

        const facadeNeedM2 = areas.facadeM2 * p.facadeWaste;
        const facadeCost = facadeNeedM2 * p.facadeM2Price;

        const backNeedM2 = areas.backM2 * p.backWaste;
        const backSheetsEq = backNeedM2 / sheetAreaM2();
        const backCost = backSheetsEq * p.backSheetPrice;

        const materials = corpCost + facadeCost + backCost;

        // ✅ Hardware (ONE block)
        let hardwareCost = 0;
        let hingeQty = 0;

        if (p.comfort === "standard") {
            const hingeSetUah = BLUM_STANDARD.hingeSetEur * eur;
            const drawerSetUah = BLUM_STANDARD.drawerSetEur * eur;

            hingeQty = doors * 2; // MVP: 2 петлі на дверку
            hardwareCost = hingeQty * hingeSetUah + drawers * drawerSetUah;
        } else {
            // fallback econ/premium поки %
            hardwareCost = materials * p.hardwarePct;
        }

        const servicesCost = materials * p.servicesPct;

        // countertop + backsplash
        const runM = calcRunMm(st) / 1000;
        const topCost = p.topOn ? runM * p.topPerM : 0;

        const bspM2 = runM * (p.bspH / 1000);
        const bspCost = p.bspOn ? bspM2 * p.bspPerM2 : 0;

        const grand = materials + hardwareCost + servicesCost + topCost + bspCost;

        // BOM (manager)
        const hardwareRow =
            p.comfort === "standard"
                ? {
                    code: "HARDWARE",
                    name: `Фурнітура (BLUM Standard: петлі ${hingeQty} / шухляди ${drawers})`,
                    unit: "позиції",
                    qty: hingeQty + drawers,
                    sum: hardwareCost
                }
                : {
                    code: "HARDWARE",
                    name: "Фурнітура",
                    unit: "%",
                    qty: p.hardwarePct,
                    sum: hardwareCost
                };

        const bom = [
            { code: "CORP-CHIP", name: "Корпус (ДСП)", unit: "лист", qty: corpSheetsEq, sum: corpCost },
            { code: "BACK", name: "Задня стінка", unit: "лист", qty: backSheetsEq, sum: backCost },
            { code: "FACADE", name: "Фасади", unit: "м²", qty: facadeNeedM2, sum: facadeCost },
            { code: "WORKTOP", name: "Стільниця", unit: "м.п.", qty: p.topOn ? runM : 0, sum: topCost },
            { code: "BACKSPL", name: "Фартух", unit: "м²", qty: p.bspOn ? bspM2 : 0, sum: bspCost },
            hardwareRow,
            { code: "SERV", name: "Послуги", unit: "%", qty: p.servicesPct, sum: servicesCost }
        ];

        return {
            modules,
            areas,
            params: p,
            totals: {
                corpCost,
                corpSheetsEq,
                backCost,
                backSheetsEq,
                facadeCost,
                facadeNeedM2,
                hardwareCost,
                servicesCost,
                topCost,
                topLenM: runM,
                bspCost,
                bspM2,
                grand
            },
            bom
        };
    }

    // === RENDER ===
    function renderClient(res) {
        const elTotal = $("#calcGrandTotal");
        if (elTotal) elTotal.textContent = fmtUAH(res.totals.grand);

        const box = $("#calcClientTable");
        if (!box) return;

        const parts = [];
        if (res.totals.corpCost > 0) parts.push("Корпус");
        if (res.totals.backCost > 0) parts.push("Задня стінка");
        if (res.totals.facadeCost > 0) parts.push("Фасади");
        if (res.totals.topCost > 0) parts.push("Стільниця");
        if (res.totals.bspCost > 0) parts.push("Фартух");
        if (res.totals.hardwareCost > 0) parts.push("Фурнітура");
        if (res.totals.servicesCost > 0) parts.push("Послуги");

        box.innerHTML = `<div class="muted tiny">У "Разом" включено: ${parts.join(", ") || "—"}.</div>`;
    }

    function renderManager(res) {
        const wrap = $("#calcManagerTable");
        if (!wrap) return;

        const detailsOn = !!($("#mgrDetailsToggle") && $("#mgrDetailsToggle").checked);

        let details = "";
        if (detailsOn) {
            const a = res.areas;
            const p = res.params;

            const corpNeedM2 = a.corpM2 * p.corpWaste;
            const corpEq = corpNeedM2 / sheetAreaM2();
            const corpBuy = Math.ceil(corpEq - 1e-9);

            const backNeedM2 = a.backM2 * p.backWaste;
            const backEq = backNeedM2 / sheetAreaM2();
            const backBuy = Math.ceil(backEq - 1e-9);

            const facNeedM2 = a.facadeM2 * p.facadeWaste;

            details = `
        <div class="hr" style="margin:10px 0;"></div>
        <div class="tiny" style="opacity:.9; margin-bottom:6px;">Деталізація площ (MVP)</div>

        <div class="tiny" style="opacity:.8;">
          <b>Корпус</b>: боковини ${(a.corpSidesM2 || 0).toFixed(2)} м² · дно/кришка ${(a.corpBottomTopM2 || 0).toFixed(2)} м² · полиці ${(a.corpShelvesM2 || 0).toFixed(2)} м²<br/>
          Разом raw ${(a.corpM2 || 0).toFixed(2)} м² → з відходами ${corpNeedM2.toFixed(2)} м²<br/>
          Листи екв. ${corpEq.toFixed(2)} · До закупки ${corpBuy}
          <br/><br/>
          <b>Фасади</b>: raw ${(a.facadeM2 || 0).toFixed(2)} м² → з відходами ${facNeedM2.toFixed(2)} м²
          <br/><br/>
          <b>Задня стінка</b>: raw ${(a.backM2 || 0).toFixed(2)} м² → з відходами ${backNeedM2.toFixed(2)} м²<br/>
          Листи екв. ${backEq.toFixed(2)} · До закупки ${backBuy}
        </div>
      `;
        }

        const head = `
      <div style="display:grid; grid-template-columns: 120px 1fr 70px 90px 110px; gap:8px; padding:8px 0; border-bottom:1px solid rgba(255,255,255,.08);">
        <div class="tiny">Код</div><div class="tiny">Назва</div><div class="tiny">Од.</div><div class="tiny">К-сть</div><div class="tiny">Сума</div>
      </div>
    `;

        const rows = res.bom
            .map(
                (x) => `
      <div style="display:grid; grid-template-columns: 120px 1fr 70px 90px 110px; gap:8px; padding:8px 0; border-bottom:1px solid rgba(255,255,255,.06);">
        <div class="tiny">${x.code}</div>
        <div style="font-weight:700;">${x.name}</div>
        <div class="tiny">${x.unit}</div>
        <div class="tiny">${num(x.qty, 0).toFixed(2)}</div>
        <div style="font-weight:800;">${fmtUAH(x.sum)}</div>
      </div>
    `
            )
            .join("");

        wrap.innerHTML = `
      ${details}
      ${head}
      ${rows}
      <div style="display:flex; justify-content:space-between; padding-top:10px;">
        <div class="tiny">Разом</div>
        <div style="font-weight:900;">${fmtUAH(res.totals.grand)}</div>
      </div>
    `;
    }

    // === MODE switch ===
    function setMode(mode) {
        const vClient = $("#calcClientView");
        const vMgr = $("#calcManagerView");
        const clientBtn = $("#calcModeClientBtn");
        const mgrBtn = $("#calcModeManagerBtn");

        if (mode === "manager") {
            document.body.classList.add("manager-mode");
            document.body.classList.remove("client-mode");
            if (vMgr) vMgr.style.display = "";
            if (vClient) vClient.style.display = "none";
            if (mgrBtn) mgrBtn.style.opacity = "1";
            if (clientBtn) clientBtn.style.opacity = ".7";
        } else {
            document.body.classList.add("client-mode");
            document.body.classList.remove("manager-mode");
            if (vClient) vClient.style.display = "";
            if (vMgr) vMgr.style.display = "none";
            if (clientBtn) clientBtn.style.opacity = "1";
            if (mgrBtn) mgrBtn.style.opacity = ".7";
        }
    }

    // === MANAGER INPUTS -> state.calcOverrides ===
    function readManagerInputs() {
        const st = getState();
        const ov = Object.assign({}, st.calcOverrides || {});
        const g = (id) => document.getElementById(id);

        const setNum = (k, id) => {
            const el = g(id);
            if (el) ov[k] = num(el.value, ov[k]);
        };
        const setChk = (k, id) => {
            const el = g(id);
            if (el) ov[k] = !!el.checked;
        };

        setNum("corpSheetPrice", "mCorpSheetPrice");
        setNum("corpWaste", "mCorpWaste");
        setNum("facadeM2Price", "mFacadeM2Price");
        setNum("facadeWaste", "mFacadeWaste");
        setNum("backSheetPrice", "mBackSheetPrice");
        setNum("backWaste", "mBackWaste");

        setChk("topOn", "mTopOn");
        setNum("topPerM", "mTopPerM");
        setNum("topDepth", "mTopDepth");

        setChk("bspOn", "mBspOn");
        setNum("bspPerM2", "mBspPerM2");
        setNum("bspH", "mBspH");

        setNum("hardwarePct", "mHardwarePct");
        setNum("servicesPct", "mServicesPct");

        setState({ calcOverrides: ov }, "step8:overrides");
    }

    function syncManagerInputsFromParams(p) {
        const setVal = (id, v) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (document.activeElement === el) return;
            if (el.type === "checkbox") return;
            el.value = String(v);
        };
        const setChk = (id, v) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.checked = !!v;
        };

        setVal("mCorpSheetPrice", p.corpSheetPrice);
        setVal("mCorpWaste", p.corpWaste);
        setVal("mFacadeM2Price", p.facadeM2Price);
        setVal("mFacadeWaste", p.facadeWaste);
        setVal("mBackSheetPrice", p.backSheetPrice);
        setVal("mBackWaste", p.backWaste);

        setChk("mTopOn", p.topOn);
        setVal("mTopPerM", p.topPerM);
        setVal("mTopDepth", p.topDepth);

        setChk("mBspOn", p.bspOn);
        setVal("mBspPerM2", p.bspPerM2);
        setVal("mBspH", p.bspH);

        setVal("mHardwarePct", p.hardwarePct);
        setVal("mServicesPct", p.servicesPct);
    }

    // === RECALC ===
    let lastRes = null;

    function recalcAndRender() {
        const st = getState();
        if (!st.comfortKit) {
            setState({ comfortKit: st.package || "standard" }, "step8:autofix-comfort");
        }

        const res = calcKitchen();
        lastRes = res;

        renderClient(res);
        renderManager(res);
        syncManagerInputsFromParams(res.params);
    }

    // === WIRE ===
    function wireOnce() {
        if (document.body.dataset.kcStep8Bound === "1") return;
        document.body.dataset.kcStep8Bound = "1";

        const cBtn = $("#calcModeClientBtn");
        const mBtn = $("#calcModeManagerBtn");
        const rBtn = $("#recalcBtn");

        if (cBtn) cBtn.addEventListener("click", () => setMode("client"));
        if (mBtn) mBtn.addEventListener("click", () => setMode("manager"));
        if (rBtn)
            rBtn.addEventListener("click", () => {
                readManagerInputs();
                recalcAndRender();
            });

        const autoIds = [
            "mCorpSheetPrice",
            "mCorpWaste",
            "mFacadeM2Price",
            "mFacadeWaste",
            "mBackSheetPrice",
            "mBackWaste",
            "mTopOn",
            "mTopPerM",
            "mTopDepth",
            "mBspOn",
            "mBspPerM2",
            "mBspH",
            "mHardwarePct",
            "mServicesPct"
        ];

        autoIds.forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener("input", () => {
                readManagerInputs();
                recalcAndRender();
            });
            el.addEventListener("change", () => {
                readManagerInputs();
                recalcAndRender();
            });
        });

        const dToggle = $("#mgrDetailsToggle");
        if (dToggle) dToggle.addEventListener("change", () => lastRes && renderManager(lastRes));

        // якщо core має showStep — підчепимось обережно
        if (typeof window.showStep === "function" && !window.__KC_STEP8_PATCHED__) {
            window.__KC_STEP8_PATCHED__ = true;
            const _show = window.showStep;
            window.showStep = function (n) {
                _show(n);
                if (Number(n) === 8) {
                    setMode("client");
                    recalcAndRender();
                }
            };
        }

        // реагуємо на зміни state (коли Step4 перерахував модулі)
        window.addEventListener("KC_STATE_UPDATED", (e) => {
            const reason = e?.detail?.reason || "";
            if (
                /step4|modules|dims|tech|layout/i.test(reason) ||
                (e?.detail?.patch && ("modules" in e.detail.patch || "dims" in e.detail.patch || "tech" in e.detail.patch))
            ) {
                const st2 = getState();
                if (Number(st2.step) === 8) recalcAndRender();
            }
        });
    }

    function init() {
        wireOnce();
        const st = getState();
        if (Number(st.step) === 8) {
            setMode("client");
            recalcAndRender();
        }
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();

    // Optional API (для дебагу)
    window.KC_STEP8 = {
        init,
        recalc: recalcAndRender,
        setMode,
        calc: calcKitchen
    };
})();
// js/step8.js
(function () {
    "use strict";

    // ✅ Guard: якщо Step8 вже підключено — не інітимо двічі
    if (window.KC_STEP8_LOADED) return;
    window.KC_STEP8_LOADED = true;

    const $ = (s, r = document) => r.querySelector(s);

    function getState() {
        if (typeof window.kcGetState === "function") return window.kcGetState();
        return window.KC_STATE || {};
    }

    function setState(patch, reason) {
        if (typeof window.kcSetState === "function") return window.kcSetState(patch, reason || "step8");
        window.KC_STATE = Object.assign(window.KC_STATE || {}, patch);
        try {
            window.dispatchEvent(
                new CustomEvent("KC_STATE_UPDATED", { detail: { patch, reason: reason || "step8:fallback" } })
            );
        } catch (e) {}
    }

    function num(v, def = 0) {
        const n = Number(v);
        return Number.isFinite(n) ? n : def;
    }

    function bool(v, def = false) {
        if (typeof v === "boolean") return v;
        if (v === 1 || v === "1") return true;
        if (v === 0 || v === "0") return false;
        return def;
    }

    function fmtUAH(v) {
        const n = Math.round(num(v, 0));
        return n.toLocaleString("uk-UA") + " грн";
    }

    // === Blum Standard (mid) — базові ціни в EUR (ти дав) ===
    const BLUM_STANDARD = {
        hingeSetEur: 3.57, // 3.04 + 0.53
        drawerSetEur: 77.43, // 070887
        liftHKSetEur: 62.3, // 097953
        liftHFSetEur: 101.82 // 115204
    };

    // === SHEET AREA ===
    function sheetAreaM2() {
        // MVP: 2800×2070
        return (2800 * 2070) / 1_000_000;
    }

    // === MODULES source ===
    function resolveModulesForCalc(state) {
        const st = state || getState();

        // 1) Prefer state.modules (якщо Step4 вже записав)
        if (Array.isArray(st.modules) && st.modules.length) return st.modules;

        // 2) Prefer Step4 engine direct calc
        if (window.KC_STEP4 && typeof window.KC_STEP4.calcModulesRules === "function") {
            try {
                const payload = window.KC_STEP4.calcModulesRules(st);
                if (payload && Array.isArray(payload.modules) && payload.modules.length) return payload.modules;
            } catch (e) {}
        }

        return [];
    }

    // === AREAS from modules (MVP) ===
    // Robust: якщо Step4 не дає facadeAreaM2/facadesCount — беремо fallback від doorCount/drawerCount/role
    function computeAreas(modules, opts = {}) {
        const mm2 = (a, b) => Math.max(0, num(a)) * Math.max(0, num(b));
        const mm2_to_m2 = (v) => num(v) / 1_000_000;

        const baseH = num(opts.baseH, 830);
        const upperH = num(opts.upperH, 720);
        const tallH = num(opts.tallH, 2300);

        const baseD = num(opts.baseD, 560);
        const upperD = num(opts.upperD, 320);
        const tallD = num(opts.tallD, 560);

        let corpSidesMM2 = 0;
        let corpTBMM2 = 0;
        let shelvesMM2 = 0;
        let backMM2 = 0;
        let facadeMM2 = 0;

        (modules || []).forEach((m) => {
            if (!m) return;

            const role = String(m.role || m.type || "").toLowerCase();
            const W = num(m.width ?? m.w ?? 0);
            const H = num(m.height ?? m.h ?? 0);
            const D = num(m.depth ?? m.d ?? 0);

            // дефолти по типу
            let hh = H,
                dd = D;
            if (!hh) hh = role === "upper" ? upperH : role === "tall" || role === "column" ? tallH : baseH;
            if (!dd) dd = role === "upper" ? upperD : role === "tall" || role === "column" ? tallD : baseD;

            // Корпус (спрощено)
            corpSidesMM2 += 2 * mm2(hh, dd); // 2 боковини
            corpTBMM2 += 2 * mm2(W, dd); // дно + кришка

            // полиці
            const shelves = num(m.shelves ?? m.shelvesCount ?? 0);
            if (shelves > 0) shelvesMM2 += shelves * mm2(W, dd);

            // задня стінка
            backMM2 += mm2(W, hh);

            // === ФАСАДИ ===
            // 1) якщо модуль дає готову площу
            if (num(m.facadeAreaM2, 0) > 0) {
                facadeMM2 += num(m.facadeAreaM2, 0) * 1_000_000;
                return;
            }

            // 2) якщо модуль дає facadesCount
            let fc = num(m.facadesCount ?? m.facades ?? 0);

            // 3) fallback: якщо нема facadesCount — пробуємо doorCount/drawerCount
            const doorCount = num(m.doorCount ?? 0);
            const drawerCount = num(m.drawerCount ?? 0);

            if (fc <= 0 && (doorCount > 0 || drawerCount > 0)) {
                // MVP-логіка:
                // - двері незалежно від того 1 чи 2 стулки: площа ≈ W×H (бо сумарно перекривають модуль)
                // - шухляди (стек): площа ≈ W×H (бо сумарно теж перекривають модуль)
                // Якщо є і двері і шухляди (рідко для MVP) — додаємо 2×(W×H)
                const blocks = (doorCount > 0 ? 1 : 0) + (drawerCount > 0 ? 1 : 0);
                facadeMM2 += blocks * mm2(W, hh);
                return;
            }

            // 4) fallback від role (щоб фасади не були нуль):
            if (fc <= 0) {
                // типові ролі, де майже завжди є фасад
                if (
                    role === "base" ||
                    role === "sink" ||
                    role === "dishwasher" ||
                    role === "corner" ||
                    role === "fridge" ||
                    role === "tall" ||
                    role === "column" ||
                    role === "cooking" ||
                    role === "cargo_300" ||
                    role === "base_450"
                ) {
                    fc = 1;
                }
            }

            if (fc > 0) facadeMM2 += fc * mm2(W, hh);
        });

        const corpSidesM2 = mm2_to_m2(corpSidesMM2);
        const corpBottomTopM2 = mm2_to_m2(corpTBMM2);
        const corpShelvesM2 = mm2_to_m2(shelvesMM2);

        const corpM2 = corpSidesM2 + corpBottomTopM2 + corpShelvesM2;
        const backM2 = mm2_to_m2(backMM2);
        const facadeM2 = mm2_to_m2(facadeMM2);

        return { corpSidesM2, corpBottomTopM2, corpShelvesM2, corpM2, backM2, facadeM2 };
    }

    // === Params (presets + overrides) ===
    function getParams(state) {
        const st = state || getState();
        const pack = st.package || "standard";
        const packKey = pack === "economy" ? "econ" : pack;

        const PRESETS = {
            econ: {
                corpSheetPrice: 2200,
                corpWaste: 1.15,
                facadeM2Price: 1900,
                facadeWaste: 1.15,
                backSheetPrice: 650,
                backWaste: 1.05,
                topOn: true,
                topPerM: 2500,
                topDepth: 600,
                bspOn: true,
                bspPerM2: 1800,
                bspH: 600,
                servicesPct: 0.12
            },
            standard: {
                corpSheetPrice: 2600,
                corpWaste: 1.15,
                facadeM2Price: 2600,
                facadeWaste: 1.15,
                backSheetPrice: 750,
                backWaste: 1.05,
                topOn: true,
                topPerM: 2800,
                topDepth: 600,
                bspOn: true,
                bspPerM2: 2100,
                bspH: 600,
                servicesPct: 0.12
            },
            premium: {
                corpSheetPrice: 3200,
                corpWaste: 1.15,
                facadeM2Price: 4200,
                facadeWaste: 1.15,
                backSheetPrice: 900,
                backWaste: 1.05,
                topOn: true,
                topPerM: 3500,
                topDepth: 600,
                bspOn: true,
                bspPerM2: 2800,
                bspH: 600,
                servicesPct: 0.12
            }
        };

        const preset = PRESETS[packKey] || PRESETS.standard;
        const ov = st.calcOverrides || {};

        // comfort -> hardwarePct (fallback для econ/premium)
        const comfortRaw = st.comfortKit || st.comfort || packKey || "standard";
        const comfortKey = comfortRaw === "econom" ? "econ" : comfortRaw;
        const HARDWARE_PCT = { econ: 0.08, standard: 0.1, premium: 0.12 };
        const hardwarePct = num(ov.hardwarePct, HARDWARE_PCT[comfortKey] ?? 0.1);

        return {
            pack,
            comfort: comfortKey,

            corpSheetPrice: num(ov.corpSheetPrice, preset.corpSheetPrice),
            corpWaste: Math.max(1, num(ov.corpWaste, preset.corpWaste)),

            facadeM2Price: num(ov.facadeM2Price, preset.facadeM2Price),
            facadeWaste: Math.max(1, num(ov.facadeWaste, preset.facadeWaste)),

            backSheetPrice: num(ov.backSheetPrice, preset.backSheetPrice),
            backWaste: Math.max(1, num(ov.backWaste, preset.backWaste)),

            topOn: bool(ov.topOn, preset.topOn),
            topPerM: num(ov.topPerM, preset.topPerM),
            topDepth: num(ov.topDepth, preset.topDepth),

            bspOn: bool(ov.bspOn, preset.bspOn),
            bspPerM2: num(ov.bspPerM2, preset.bspPerM2),
            bspH: num(ov.bspH, preset.bspH),

            servicesPct: num(ov.servicesPct, preset.servicesPct),
            hardwarePct
        };
    }

    // === Run length for countertop (MVP) ===
    function calcRunMm(state) {
        const st = state || getState();
        const d = st.dims || {};
        const A = num(d.A, 0);
        const B = num(d.B, 0);
        const layout = st.layout || "straight";
        const L = layout === "line" ? "straight" : layout;

        let run = 0;
        if (L === "corner") run = A + B;
        else if (L === "u") run = A + B;
        else run = A;

        // MVP: якщо є холодильник-колона — віднімаємо 600
        const t = st.tech || {};
        const hasCol = !!(t.fridge || t.fridgeColumn || t.fridge_col);
        if (hasCol) run -= 600;

        return Math.max(0, run);
    }

    // rough hardware counts by roles (fallback)
    function normalizeModulesForHardware(modules) {
        let doors = 0;
        let drawers = 0;

        (modules || []).forEach((m) => {
            if (!m || !m.role) return;

            drawers += Number(m.drawerCount ?? 0);

            switch (m.role) {
                case "sink":
                case "base":
                case "base_450":
                case "cargo_300":
                    doors += 2;
                    break;

                case "dishwasher":
                    doors += 1;
                    break;

                case "cooking":
                    drawers += 3;
                    break;

                case "corner":
                    doors += 2;
                    break;

                case "fridge":
                    doors += 1;
                    break;

                default:
                    doors += 1;
            }
        });

        return { doors, drawers };
    }

    // === MAIN CALC ===
    function calcKitchen() {
        const st = getState();

        const modules = resolveModulesForCalc(st);

        // counts
        const hwCounts = normalizeModulesForHardware(modules);

        // ✅ має бути let
        let doors = num(hwCounts.doors, 0);
        let drawers = num(hwCounts.drawers, 0);

        // Якщо Step4 віддає точні doorCount/drawerCount — додаємо
        (modules || []).forEach((m) => {
            if (!m) return;
            doors += num(m.doorCount ?? 0, 0);
            drawers += num(m.drawerCount ?? 0, 0);
        });

        const areas = computeAreas(modules);

        // збережемо назад у state (щоб Step8 не залежав від UI Step4)
        setState({ modules, areas }, "step8:areas");

        const p = getParams(st);

        // === EUR RATE (temporary) ===
        // пріоритет: fx.eurManual → fx.eurNbu → fallback 50.4
        const fx = st.fx || {};
        const eurManual = num(fx.eurManual, 0);
        const eurNbu = num(fx.eurNbu, 0);
        const eur = eurManual > 0 ? eurManual : eurNbu > 0 ? eurNbu : 50.4;

        // materials
        const corpNeedM2 = areas.corpM2 * p.corpWaste;
        const corpSheetsEq = corpNeedM2 / sheetAreaM2();
        const corpCost = corpSheetsEq * p.corpSheetPrice;

        const facadeNeedM2 = areas.facadeM2 * p.facadeWaste;
        const facadeCost = facadeNeedM2 * p.facadeM2Price;

        const backNeedM2 = areas.backM2 * p.backWaste;
        const backSheetsEq = backNeedM2 / sheetAreaM2();
        const backCost = backSheetsEq * p.backSheetPrice;

        const materials = corpCost + facadeCost + backCost;

        // ✅ Hardware (ONE block)
        let hardwareCost = 0;
        let hingeQty = 0;

        if (p.comfort === "standard") {
            const hingeSetUah = BLUM_STANDARD.hingeSetEur * eur;
            const drawerSetUah = BLUM_STANDARD.drawerSetEur * eur;

            hingeQty = doors * 2; // MVP: 2 петлі на дверку
            hardwareCost = hingeQty * hingeSetUah + drawers * drawerSetUah;
        } else {
            // fallback econ/premium поки %
            hardwareCost = materials * p.hardwarePct;
        }

        const servicesCost = materials * p.servicesPct;

        // countertop + backsplash
        const runM = calcRunMm(st) / 1000;
        const topCost = p.topOn ? runM * p.topPerM : 0;

        const bspM2 = runM * (p.bspH / 1000);
        const bspCost = p.bspOn ? bspM2 * p.bspPerM2 : 0;

        const grand = materials + hardwareCost + servicesCost + topCost + bspCost;

        // BOM (manager)
        const hardwareRow =
            p.comfort === "standard"
                ? {
                    code: "HARDWARE",
                    name: `Фурнітура (BLUM Standard: петлі ${hingeQty} / шухляди ${drawers})`,
                    unit: "позиції",
                    qty: hingeQty + drawers,
                    sum: hardwareCost
                }
                : {
                    code: "HARDWARE",
                    name: "Фурнітура",
                    unit: "%",
                    qty: p.hardwarePct,
                    sum: hardwareCost
                };

        const bom = [
            { code: "CORP-CHIP", name: "Корпус (ДСП)", unit: "лист", qty: corpSheetsEq, sum: corpCost },
            { code: "BACK", name: "Задня стінка", unit: "лист", qty: backSheetsEq, sum: backCost },
            { code: "FACADE", name: "Фасади", unit: "м²", qty: facadeNeedM2, sum: facadeCost },
            { code: "WORKTOP", name: "Стільниця", unit: "м.п.", qty: p.topOn ? runM : 0, sum: topCost },
            { code: "BACKSPL", name: "Фартух", unit: "м²", qty: p.bspOn ? bspM2 : 0, sum: bspCost },
            hardwareRow,
            { code: "SERV", name: "Послуги", unit: "%", qty: p.servicesPct, sum: servicesCost }
        ];

        return {
            modules,
            areas,
            params: p,
            totals: {
                corpCost,
                corpSheetsEq,
                backCost,
                backSheetsEq,
                facadeCost,
                facadeNeedM2,
                hardwareCost,
                servicesCost,
                topCost,
                topLenM: runM,
                bspCost,
                bspM2,
                grand
            },
            bom
        };
    }

    // === RENDER ===
    function renderClient(res) {
        const elTotal = $("#calcGrandTotal");
        if (elTotal) elTotal.textContent = fmtUAH(res.totals.grand);

        const box = $("#calcClientTable");
        if (!box) return;

        const parts = [];
        if (res.totals.corpCost > 0) parts.push("Корпус");
        if (res.totals.backCost > 0) parts.push("Задня стінка");
        if (res.totals.facadeCost > 0) parts.push("Фасади");
        if (res.totals.topCost > 0) parts.push("Стільниця");
        if (res.totals.bspCost > 0) parts.push("Фартух");
        if (res.totals.hardwareCost > 0) parts.push("Фурнітура");
        if (res.totals.servicesCost > 0) parts.push("Послуги");

        box.innerHTML = `<div class="muted tiny">У "Разом" включено: ${parts.join(", ") || "—"}.</div>`;
    }

    function renderManager(res) {
        const wrap = $("#calcManagerTable");
        if (!wrap) return;

        const detailsOn = !!($("#mgrDetailsToggle") && $("#mgrDetailsToggle").checked);

        let details = "";
        if (detailsOn) {
            const a = res.areas;
            const p = res.params;

            const corpNeedM2 = a.corpM2 * p.corpWaste;
            const corpEq = corpNeedM2 / sheetAreaM2();
            const corpBuy = Math.ceil(corpEq - 1e-9);

            const backNeedM2 = a.backM2 * p.backWaste;
            const backEq = backNeedM2 / sheetAreaM2();
            const backBuy = Math.ceil(backEq - 1e-9);

            const facNeedM2 = a.facadeM2 * p.facadeWaste;

            details = `
        <div class="hr" style="margin:10px 0;"></div>
        <div class="tiny" style="opacity:.9; margin-bottom:6px;">Деталізація площ (MVP)</div>

        <div class="tiny" style="opacity:.8;">
          <b>Корпус</b>: боковини ${(a.corpSidesM2 || 0).toFixed(2)} м² · дно/кришка ${(a.corpBottomTopM2 || 0).toFixed(2)} м² · полиці ${(a.corpShelvesM2 || 0).toFixed(2)} м²<br/>
          Разом raw ${(a.corpM2 || 0).toFixed(2)} м² → з відходами ${corpNeedM2.toFixed(2)} м²<br/>
          Листи екв. ${corpEq.toFixed(2)} · До закупки ${corpBuy}
          <br/><br/>
          <b>Фасади</b>: raw ${(a.facadeM2 || 0).toFixed(2)} м² → з відходами ${facNeedM2.toFixed(2)} м²
          <br/><br/>
          <b>Задня стінка</b>: raw ${(a.backM2 || 0).toFixed(2)} м² → з відходами ${backNeedM2.toFixed(2)} м²<br/>
          Листи екв. ${backEq.toFixed(2)} · До закупки ${backBuy}
        </div>
      `;
        }

        const head = `
      <div style="display:grid; grid-template-columns: 120px 1fr 70px 90px 110px; gap:8px; padding:8px 0; border-bottom:1px solid rgba(255,255,255,.08);">
        <div class="tiny">Код</div><div class="tiny">Назва</div><div class="tiny">Од.</div><div class="tiny">К-сть</div><div class="tiny">Сума</div>
      </div>
    `;

        const rows = res.bom
            .map(
                (x) => `
      <div style="display:grid; grid-template-columns: 120px 1fr 70px 90px 110px; gap:8px; padding:8px 0; border-bottom:1px solid rgba(255,255,255,.06);">
        <div class="tiny">${x.code}</div>
        <div style="font-weight:700;">${x.name}</div>
        <div class="tiny">${x.unit}</div>
        <div class="tiny">${num(x.qty, 0).toFixed(2)}</div>
        <div style="font-weight:800;">${fmtUAH(x.sum)}</div>
      </div>
    `
            )
            .join("");

        wrap.innerHTML = `
      ${details}
      ${head}
      ${rows}
      <div style="display:flex; justify-content:space-between; padding-top:10px;">
        <div class="tiny">Разом</div>
        <div style="font-weight:900;">${fmtUAH(res.totals.grand)}</div>
      </div>
    `;
    }

    // === MODE switch ===
    function setMode(mode) {
        const vClient = $("#calcClientView");
        const vMgr = $("#calcManagerView");
        const clientBtn = $("#calcModeClientBtn");
        const mgrBtn = $("#calcModeManagerBtn");

        if (mode === "manager") {
            document.body.classList.add("manager-mode");
            document.body.classList.remove("client-mode");
            if (vMgr) vMgr.style.display = "";
            if (vClient) vClient.style.display = "none";
            if (mgrBtn) mgrBtn.style.opacity = "1";
            if (clientBtn) clientBtn.style.opacity = ".7";
        } else {
            document.body.classList.add("client-mode");
            document.body.classList.remove("manager-mode");
            if (vClient) vClient.style.display = "";
            if (vMgr) vMgr.style.display = "none";
            if (clientBtn) clientBtn.style.opacity = "1";
            if (mgrBtn) mgrBtn.style.opacity = ".7";
        }
    }

    // === MANAGER INPUTS -> state.calcOverrides ===
    function readManagerInputs() {
        const st = getState();
        const ov = Object.assign({}, st.calcOverrides || {});
        const g = (id) => document.getElementById(id);

        const setNum = (k, id) => {
            const el = g(id);
            if (el) ov[k] = num(el.value, ov[k]);
        };
        const setChk = (k, id) => {
            const el = g(id);
            if (el) ov[k] = !!el.checked;
        };

        setNum("corpSheetPrice", "mCorpSheetPrice");
        setNum("corpWaste", "mCorpWaste");
        setNum("facadeM2Price", "mFacadeM2Price");
        setNum("facadeWaste", "mFacadeWaste");
        setNum("backSheetPrice", "mBackSheetPrice");
        setNum("backWaste", "mBackWaste");

        setChk("topOn", "mTopOn");
        setNum("topPerM", "mTopPerM");
        setNum("topDepth", "mTopDepth");

        setChk("bspOn", "mBspOn");
        setNum("bspPerM2", "mBspPerM2");
        setNum("bspH", "mBspH");

        setNum("hardwarePct", "mHardwarePct");
        setNum("servicesPct", "mServicesPct");

        setState({ calcOverrides: ov }, "step8:overrides");
    }

    function syncManagerInputsFromParams(p) {
        const setVal = (id, v) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (document.activeElement === el) return;
            if (el.type === "checkbox") return;
            el.value = String(v);
        };
        const setChk = (id, v) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.checked = !!v;
        };

        setVal("mCorpSheetPrice", p.corpSheetPrice);
        setVal("mCorpWaste", p.corpWaste);
        setVal("mFacadeM2Price", p.facadeM2Price);
        setVal("mFacadeWaste", p.facadeWaste);
        setVal("mBackSheetPrice", p.backSheetPrice);
        setVal("mBackWaste", p.backWaste);

        setChk("mTopOn", p.topOn);
        setVal("mTopPerM", p.topPerM);
        setVal("mTopDepth", p.topDepth);

        setChk("mBspOn", p.bspOn);
        setVal("mBspPerM2", p.bspPerM2);
        setVal("mBspH", p.bspH);

        setVal("mHardwarePct", p.hardwarePct);
        setVal("mServicesPct", p.servicesPct);
    }

    // === RECALC ===
    let lastRes = null;

    function recalcAndRender() {
        const st = getState();
        if (!st.comfortKit) {
            setState({ comfortKit: st.package || "standard" }, "step8:autofix-comfort");
        }

        const res = calcKitchen();
        lastRes = res;

        renderClient(res);
        renderManager(res);
        syncManagerInputsFromParams(res.params);
    }

    // === WIRE ===
    function wireOnce() {
        if (document.body.dataset.kcStep8Bound === "1") return;
        document.body.dataset.kcStep8Bound = "1";

        const cBtn = $("#calcModeClientBtn");
        const mBtn = $("#calcModeManagerBtn");
        const rBtn = $("#recalcBtn");

        if (cBtn) cBtn.addEventListener("click", () => setMode("client"));
        if (mBtn) mBtn.addEventListener("click", () => setMode("manager"));
        if (rBtn)
            rBtn.addEventListener("click", () => {
                readManagerInputs();
                recalcAndRender();
            });

        const autoIds = [
            "mCorpSheetPrice",
            "mCorpWaste",
            "mFacadeM2Price",
            "mFacadeWaste",
            "mBackSheetPrice",
            "mBackWaste",
            "mTopOn",
            "mTopPerM",
            "mTopDepth",
            "mBspOn",
            "mBspPerM2",
            "mBspH",
            "mHardwarePct",
            "mServicesPct"
        ];

        autoIds.forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener("input", () => {
                readManagerInputs();
                recalcAndRender();
            });
            el.addEventListener("change", () => {
                readManagerInputs();
                recalcAndRender();
            });
        });

        const dToggle = $("#mgrDetailsToggle");
        if (dToggle) dToggle.addEventListener("change", () => lastRes && renderManager(lastRes));

        // якщо core має showStep — підчепимось обережно
        if (typeof window.showStep === "function" && !window.__KC_STEP8_PATCHED__) {
            window.__KC_STEP8_PATCHED__ = true;
            const _show = window.showStep;
            window.showStep = function (n) {
                _show(n);
                if (Number(n) === 8) {
                    setMode("client");
                    recalcAndRender();
                }
            };
        }

        // реагуємо на зміни state (коли Step4 перерахував модулі)
        window.addEventListener("KC_STATE_UPDATED", (e) => {
            const reason = e?.detail?.reason || "";
            if (
                /step4|modules|dims|tech|layout/i.test(reason) ||
                (e?.detail?.patch && ("modules" in e.detail.patch || "dims" in e.detail.patch || "tech" in e.detail.patch))
            ) {
                const st2 = getState();
                if (Number(st2.step) === 8) recalcAndRender();
            }
        });
    }

    function init() {
        wireOnce();
        const st = getState();
        if (Number(st.step) === 8) {
            setMode("client");
            recalcAndRender();
        }
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();

    // Optional API (для дебагу)
    window.KC_STEP8 = {
        init,
        recalc: recalcAndRender,
        setMode,
        calc: calcKitchen
    };
})();
