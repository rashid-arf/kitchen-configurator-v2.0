// js/step8.js
(function () {
    "use strict";

    if (window.KC_STEP8_LOADED) return;
    window.KC_STEP8_LOADED = true;

    const $ = (s, r = document) => r.querySelector(s);

    // =======================
    // STEP 8 — HARDWARE PACKAGE (single source of truth)
    // =======================

    function kcNormalizeHardwarePackage(raw) {
        const v = String(raw || "").trim().toLowerCase();
        if (["econom", "eco", "економ", "економ+", "economy", "muller", "müller", "mueller"].includes(v)) return "econom";
        if (["standard", "std", "стандарт", "blum standard", "blum"].includes(v)) return "standard";
        if (["premium", "prem", "преміум", "премиум", "blum premium", "tip-on", "tipon", "legrabox", "леграбокс"].includes(v)) return "premium";
        return null;
    }

    function kcDetectHardwarePackageFromState(state) {
        const candidates = [
            state?.hardwarePackage,
            state?.comfortKit,
            state?.comfort,
            state?.hardware?.package,
            state?.hardware,
            state?.package
        ];
        for (const c of candidates) {
            const norm = kcNormalizeHardwarePackage(c);
            if (norm) return norm;
        }
        return null;
    }

    function kcEnsureHardwarePackageSoT(state) {
        const detected = kcDetectHardwarePackageFromState(state);
        const finalPkg = detected || "standard";
        state.hardwarePackage = finalPkg;
        if (!state.comfortKit) state.comfortKit = finalPkg;
        return finalPkg;
    }

    function getState() {
        if (typeof window.kcGetState === "function") return window.kcGetState();
        return window.KC_STATE || {};
    }

    function setState(patch, reason) {
        if (typeof window.kcSetState === "function") return window.kcSetState(patch, reason || "step8");
        window.KC_STATE = Object.assign(window.KC_STATE || {}, patch);
        try {
            window.dispatchEvent(new CustomEvent("KC_STATE_UPDATED", { detail: { patch, reason: reason || "step8:fallback" } }));
        } catch (e) {}
    }

    function num(v, def = 0) {
        const n = Number(v);
        return Number.isFinite(n) ? n : def;
    }
    function bool(v, def = false) {
        if (typeof v === "boolean") return v;
        const s = String(v ?? "").trim().toLowerCase();
        if (v === 1 || v === "1" || s === "true" || s === "yes" || s === "y" || s === "on") return true;
        if (v === 0 || v === "0" || s === "false" || s === "no" || s === "off") return false;
        return def;
    }
    function fmtUAH(v) {
        const n = Math.round(num(v, 0));
        return n.toLocaleString("uk-UA") + " грн";
    }

    const BLUM_STANDARD = {
        hingeSetEur: 3.57,
        drawerSetEur: 77.43,
        liftHKSetEur: 62.3,
        liftHFSetEur: 101.82,
    };

    function sheetAreaM2() {
        return (2800 * 2070) / 1_000_000;
    }

    function resolveModulesForCalc(state) {
        const st = state || getState();
        if (Array.isArray(st.modules) && st.modules.length) return st.modules;

        if (window.KC_STEP4 && typeof window.KC_STEP4.calcModulesRules === "function") {
            try {
                const payload = window.KC_STEP4.calcModulesRules(st);
                if (payload && Array.isArray(payload.modules) && payload.modules.length) return payload.modules;
            } catch (e) {}
        }
        return [];
    }

    // ===== AREAS =====
    function computeAreas(modules, opts = {}) {
        const mm2 = (a, b) => Math.max(0, num(a)) * Math.max(0, num(b));
        const mm2_to_m2 = (v) => num(v) / 1_000_000;

        const baseH  = num(opts.baseH, 830);
        const upperH = num(opts.upperH, 720);
        const tallH  = num(opts.tallH, 2300);

        const baseD  = num(opts.baseD, 560);
        const upperD = num(opts.upperD, 320);
        const tallD  = num(opts.tallD, 560);

        let corpSidesMM2 = 0, corpTBMM2 = 0, shelvesMM2 = 0, backMM2 = 0;
        let facadeUpperMM2 = 0, facadeBaseMM2 = 0, facadeTallMM2 = 0;
        let facadeGlassEligibleMM2 = 0;

        const normRole = (m) => {
            const role = String(m?.role || m?.type || "").toLowerCase();
            const name = String(m?.name || m?.title || m?.label || "").toLowerCase();
            if (role.includes("upper") || role.includes("wall") || name.includes("верх")) return "upper";
            if (role.includes("tall") || role.includes("column") || name.includes("колон")) return "tall";
            return "base";
        };

        const isHoodUnit = (m) => {
            const role = String(m?.role || m?.type || "").toLowerCase();
            const name = String(m?.name || m?.title || m?.label || "").toLowerCase();
            return role.includes("hood") || name.includes("витяж") || name.includes("вытяж");
        };

        const isFridgeColumn = (m) => {
            const role = String(m?.role || m?.type || "").toLowerCase();
            const name = String(m?.name || m?.title || m?.label || "").toLowerCase();
            return role.includes("fridge") || name.includes("холод") || name.includes("хол-") || name.includes("холодиль");
        };

        const addFacadeByModule = (m, W, hh) => {
            const direct = num(m.facadeAreaM2 ?? m.frontAreaM2 ?? 0, 0);
            if (direct > 0) return direct * 1_000_000;

            const dc  = num(m.doorCount ?? 0);
            const drc = num(m.drawerCount ?? 0);

            const roleRaw = String(m.role || m.type || "").toLowerCase();
            const name = String(m.name || m.title || m.label || "").toLowerCase();

            const hasFrontByRole =
                ["upper","base","sink","dishwasher","cooking","corner","tall","column","fridge"].some(x => roleRaw.includes(x)) ||
                ["верх","низ","колон","холод","витяж","вытяж"].some(x => name.includes(x));

            if (dc > 0 || drc > 0 || hasFrontByRole) return mm2(W, hh);
            return 0;
        };

        (modules || []).forEach((m) => {
            if (!m) return;
            const bucket = normRole(m);

            const W = num(m.width ?? m.w ?? 0);
            const H = num(m.height ?? m.h ?? 0);
            const D = num(m.depth ?? m.d ?? 0);

            let hh = H, dd = D;
            if (!hh) hh = bucket === "upper" ? upperH : bucket === "tall" ? tallH : baseH;
            if (!dd) dd = bucket === "upper" ? upperD : bucket === "tall" ? tallD : baseD;

            corpSidesMM2 += 2 * mm2(hh, dd);
            corpTBMM2    += 2 * mm2(W, dd);

            const shelves = num(m.shelves ?? m.shelvesCount ?? 0);
            if (shelves > 0) shelvesMM2 += shelves * mm2(W, dd);

            backMM2 += mm2(W, hh);

            const fMM2 = addFacadeByModule(m, W, hh);
            if (fMM2 <= 0) return;

            if (bucket === "upper") facadeUpperMM2 += fMM2;
            else if (bucket === "tall") facadeTallMM2 += fMM2;
            else facadeBaseMM2 += fMM2;

            if (bucket === "upper" && !isHoodUnit(m) && !isFridgeColumn(m)) {
                facadeGlassEligibleMM2 += fMM2;
            }
        });

        const corpSidesM2     = mm2_to_m2(corpSidesMM2);
        const corpBottomTopM2 = mm2_to_m2(corpTBMM2);
        const corpShelvesM2   = mm2_to_m2(shelvesMM2);

        const corpM2 = corpSidesM2 + corpBottomTopM2 + corpShelvesM2;
        const backM2 = mm2_to_m2(backMM2);

        const facadeUpperM2 = mm2_to_m2(facadeUpperMM2);
        const facadeBaseM2  = mm2_to_m2(facadeBaseMM2);
        const facadeTallM2  = mm2_to_m2(facadeTallMM2);

        const facadeM2 = facadeUpperM2 + facadeBaseM2 + facadeTallM2;
        const facadeM2GlassEligible = mm2_to_m2(facadeGlassEligibleMM2);

        return {
            corpSidesM2, corpBottomTopM2, corpShelvesM2, corpM2,
            backM2,
            facadeUpperM2, facadeBaseM2, facadeTallM2,
            facadeM2,
            facadeM2GlassEligible
        };
    }

    // ===== PARAMS =====
    function getParams(state) {
        const st = state || getState();
        const pkg = kcEnsureHardwarePackageSoT(st);

        if (st.comfortKit !== pkg || st.comfort !== pkg) {
            try { setState({ hardwarePackage: pkg, comfortKit: pkg, comfort: pkg }, "step8:hardware-sot"); } catch (e) {}
        }

        // ===== Антресолі (MVP): boolean in state
        // Accept any of these keys: hasAntresol / antresol / antresoli / mezzanine
        const hasAntresol = bool(
            st.hasAntresol ?? st.antresol ?? st.antresoli ?? st.mezzanine ?? st.mez,
            false
        );

        const packKey = (pkg === "econom") ? "econ" : pkg;

        // ✅ NEW: ServicesPct by pack + (optional) antresol boost
        const SERVICES_BY_PACK = {
            econ: 0.28,       // Economy = 0.25–0.30
            standard: 0.38,   // Standard = 0.35–0.40
            premium: 0.48     // Premium = 0.45–0.50
        };
        const ANTRESOL_SERVICE_BOOST = 0.10; // +10% (MVP)

        const PRESETS = {
            econ: {
                corpSheetPrice: 2200, corpWaste: 1.15,
                facadeM2PriceEconom: 1900,
                facadeM2PriceStandard: 2600,
                facadeM2PricePremium: 4200,
                facadeM2PriceGlassProfile: 5400,
                facadeWaste: 1.15,
                backSheetPrice: 650, backWaste: 1.05,
                topOn: true, topPerM: 2500, topDepth: 600,
                bspOn: true, bspPerM2: 1800, bspH: 600,
                // ⬇️ replaced default servicesPct
                servicesPct: SERVICES_BY_PACK.econ,
                ledUnderPerM: 350,
                ledProfilePerM: 650,
                ledSmartPerM: 1200,
            },
            standard: {
                corpSheetPrice: 2600, corpWaste: 1.15,
                facadeM2PriceEconom: 1900,
                facadeM2PriceStandard: 2600,
                facadeM2PricePremium: 4200,
                facadeM2PriceGlassProfile: 5400,
                facadeWaste: 1.15,
                backSheetPrice: 750, backWaste: 1.05,
                topOn: true, topPerM: 2800, topDepth: 600,
                bspOn: true, bspPerM2: 2100, bspH: 600,
                // ⬇️ replaced default servicesPct
                servicesPct: SERVICES_BY_PACK.standard,
                ledUnderPerM: 350,
                ledProfilePerM: 650,
                ledSmartPerM: 1200,
            },
            premium: {
                corpSheetPrice: 3200, corpWaste: 1.15,
                facadeM2PriceEconom: 1900,
                facadeM2PriceStandard: 2600,
                facadeM2PricePremium: 4200,
                facadeM2PriceGlassProfile: 5400,
                facadeWaste: 1.15,
                backSheetPrice: 900, backWaste: 1.05,
                topOn: true, topPerM: 3500, topDepth: 600,
                bspOn: true, bspPerM2: 2800, bspH: 600,
                // ⬇️ replaced default servicesPct
                servicesPct: SERVICES_BY_PACK.premium,
                ledUnderPerM: 350,
                ledProfilePerM: 650,
                ledSmartPerM: 1200,
            },
        };

        const preset = PRESETS[packKey] || PRESETS.standard;
        const ov = st.calcOverrides || {};

        const HW_COEF = { econom: 0.55, standard: 1.00, premium: 1.65 };
        const hardwareCoefDefault = HW_COEF[pkg] ?? 1.0;

        const hardwareCoef = num(
            ov.hardwareCoef,
            (pkg === "econom") ? num(ov.hardwareCoefEcon, hardwareCoefDefault) :
                (pkg === "premium") ? num(ov.hardwareCoefPremium, hardwareCoefDefault) :
                    hardwareCoefDefault
        );

        const legacyFacade = num(ov.facadeM2Price, 0);

        // ✅ servicesPct: base (override or preset) + antresol boost (unless manager overrides)
        const hasManagerOverrideServices = Number.isFinite(Number(ov.servicesPct));
        let servicesPctBase = num(ov.servicesPct, preset.servicesPct);

        if (hasAntresol && !hasManagerOverrideServices) {
            servicesPctBase = servicesPctBase + ANTRESOL_SERVICE_BOOST;
        }

        // safety clamp
        const servicesPctFinal = Math.min(0.9, Math.max(0, servicesPctBase));

        return {
            pack: pkg,
            comfort: pkg,
            hasAntresol,

            corpSheetPrice: num(ov.corpSheetPrice, preset.corpSheetPrice),
            corpWaste: Math.max(1, num(ov.corpWaste, preset.corpWaste)),

            facadeM2PriceEconom: num(ov.facadeM2PriceEconom, preset.facadeM2PriceEconom),
            facadeM2PriceStandard: num(ov.facadeM2PriceStandard, legacyFacade || preset.facadeM2PriceStandard),
            facadeM2PricePremium: num(ov.facadeM2PricePremium, preset.facadeM2PricePremium),
            facadeM2PriceGlassProfile: num(ov.facadeM2PriceGlassProfile, preset.facadeM2PriceGlassProfile),

            facadeM2Price: num(ov.facadeM2Price, legacyFacade || preset.facadeM2PriceStandard),
            facadeWaste: Math.max(1, num(ov.facadeWaste, preset.facadeWaste)),

            backSheetPrice: num(ov.backSheetPrice, preset.backSheetPrice),
            backWaste: Math.max(1, num(ov.backWaste, preset.backWaste)),

            topOn: bool(ov.topOn, preset.topOn),
            topPerM: num(ov.topPerM, preset.topPerM),
            topDepth: num(ov.topDepth, preset.topDepth),

            bspOn: bool(ov.bspOn, preset.bspOn),
            bspPerM2: num(ov.bspPerM2, preset.bspPerM2),
            bspH: num(ov.bspH, preset.bspH),

            // ✅ updated
            servicesPct: servicesPctFinal,

            hardwarePct: Math.max(0, num(ov.hardwarePct, 0)),
            hardwareCoef,
            ledUnderPerM: num(ov.ledUnderPerM, preset.ledUnderPerM),
            ledProfilePerM: num(ov.ledProfilePerM, preset.ledProfilePerM),
            ledSmartPerM: num(ov.ledSmartPerM, preset.ledSmartPerM),
        };
    }

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

        const t = st.tech || {};
        const hasCol = !!(t.fridge || t.fridgeColumn || t.fridge_col);
        if (hasCol) run -= 600;

        return Math.max(0, run);
    }

    function getHardwareCounts(modules) {
        const list = modules || [];
        let baseDoors = 0, upperDoors = 0, tallDoors = 0;
        let drawers = 0;
        let hkQty = 0, hfQty = 0;

        const addDoorsByRole = (role, count) => {
            if (role === "upper") upperDoors += count;
            else if (role === "tall" || role === "column" || role === "fridge") tallDoors += count;
            else baseDoors += count;
        };

        const hasExplicit = list.some(m =>
            Number(m?.doorCount ?? 0) > 0 || Number(m?.drawerCount ?? 0) > 0
        );

        list.forEach((m) => {
            if (!m) return;
            const role = String(m.role || m.type || "").toLowerCase();
            const W = Number(m.width ?? m.w ?? 0);

            if (hasExplicit) {
                const dc = Number(m.doorCount ?? 0);
                const dr = Number(m.drawerCount ?? 0);

                if (dc > 0) addDoorsByRole(role, dc);
                if (dr > 0) drawers += dr;

                if (role === "upper" && dc > 0) {
                    if (W > 600) hfQty += 1;
                    else hkQty += 1;
                }
                return;
            }

            switch (role) {
                case "sink":
                case "base":
                case "base_450":
                case "cargo_300":
                    addDoorsByRole(role, 2); break;
                case "dishwasher":
                    addDoorsByRole(role, 1); break;
                case "cooking":
                    drawers += 3; break;
                case "corner":
                    addDoorsByRole(role, 2); break;
                case "fridge":
                case "tall":
                case "column":
                    addDoorsByRole(role, 1); break;
                case "upper":
                    addDoorsByRole(role, (W > 600 ? 2 : 1));
                    if (W > 0) { if (W > 600) hfQty += 1; else hkQty += 1; }
                    break;
                default:
                    addDoorsByRole(role, 1); break;
            }
        });

        const doors = baseDoors + upperDoors + tallDoors;
        const hingeQty = doors * 2;

        return {
            doors, baseDoors, upperDoors, tallDoors,
            drawers, hingeQty, hkQty, hfQty,
            source: hasExplicit ? "step4" : "heuristic"
        };
    }

    // ===== MAIN CALC =====
    function calcKitchen() {
        const st = getState();

        const modules = resolveModulesForCalc(st);
        const hw = getHardwareCounts(modules);

        const doors = num(hw.doors, 0);
        const drawers = num(hw.drawers, 0);

        const hingeQty = num(hw.hingeQty, doors * 2);
        const hkQty = num(hw.hkQty, 0);
        const hfQty = num(hw.hfQty, 0);

        const areas = computeAreas(modules);
        setState({ modules, areas }, "step8:areas");

        const p = getParams(st);

        const fx = st.fx || {};
        const eurManual = num(fx.eurManual, 0);
        const eurNbu = num(fx.eurNbu, 0);
        const eur = eurManual > 0 ? eurManual : eurNbu > 0 ? eurNbu : 50.4;

        function normTier(v) {
            const s = String(v || "").trim().toLowerCase();
            if (["econom","eco","economy","економ","економія"].includes(s)) return "econom";
            if (["premium","prem","прем","преміум","премиум"].includes(s)) return "premium";
            if (["standard","std","стандарт"].includes(s)) return "standard";
            return "";
        }

        const materialTier = normTier(st.package) || normTier(st.materialTier) || "standard";

        const facadeStyleRaw =
            (st.facadeStyle || st.facade || (st.style && st.style.facade) || st.facadeType || "")
                .toString().toLowerCase();

        const isGlassProfile =
            facadeStyleRaw.includes("glass") ||
            facadeStyleRaw.includes("скло") ||
            facadeStyleRaw.includes("profile") ||
            facadeStyleRaw.includes("проф");

        // корпус
        const corpNeedM2 = areas.corpM2 * num(p.corpWaste, 1);
        const corpSheetsEq = corpNeedM2 / sheetAreaM2();
        const corpCost = corpSheetsEq * num(p.corpSheetPrice, 0);

        // фасади — SPLIT
        const pe = num(p.facadeM2PriceEconom, 0);
        const ps = num(p.facadeM2PriceStandard, 0) || num(p.facadeM2Price, 0);
        const pp = num(p.facadeM2PricePremium, 0) || num(p.facadeM2Price, 0);
        const pg = num(p.facadeM2PriceGlassProfile, 0) || pp || ps;

        const tier = materialTier;

        const mdfPricePerM2 =
            tier === "econom" ? (pe || ps) :
                tier === "premium" ? (pp || ps) :
                    ps;

        const mdfLabel =
            tier === "econom" ? "Фасади (Плівка МДФ)" :
                tier === "premium" ? "Фасади (AGT / Cleaf)" :
                    "Фасади (Фарбований МДФ)";

        const glassLabel = "Фасади (Скло + профіль)";
        const facadeName = isGlassProfile ? "Фасади (Скло+профіль + МДФ)" : mdfLabel;

        const glassRawM2 = isGlassProfile ? num(areas.facadeM2GlassEligible, 0) : 0;
        const totalRawM2 = num(areas.facadeM2, 0);
        const mdfRawM2 = isGlassProfile ? Math.max(0, totalRawM2 - glassRawM2) : totalRawM2;

        const glassNeedM2 = glassRawM2 * p.facadeWaste;
        const mdfNeedM2   = mdfRawM2   * p.facadeWaste;

        const glassCost = glassNeedM2 * pg;
        const mdfCost   = mdfNeedM2   * mdfPricePerM2;

        const facadeCost = glassCost + mdfCost;

        // задня стінка
        const backNeedM2 = areas.backM2 * num(p.backWaste, 1);
        const backSheetsEq = backNeedM2 / sheetAreaM2();
        const backCost = backSheetsEq * num(p.backSheetPrice, 0);

        const materials = corpCost + facadeCost + backCost;

        // hardware baseline
        const hingeSetUah  = BLUM_STANDARD.hingeSetEur  * eur;
        const drawerSetUah = BLUM_STANDARD.drawerSetEur * eur;
        const liftHKSetUah = BLUM_STANDARD.liftHKSetEur * eur;
        const liftHFSetUah = BLUM_STANDARD.liftHFSetEur * eur;

        const stdHardwareCost =
            (hingeQty * hingeSetUah) +
            (drawers * drawerSetUah) +
            (hkQty * liftHKSetUah) +
            (hfQty * liftHFSetUah);

        let hardwareCost = 0;
        let hardwareMode = "standard";

        if (p.comfort === "standard") {
            hardwareCost = stdHardwareCost;
            hardwareMode = "standard";
        } else if ((p.hardwarePct || 0) > 0) {
            hardwareCost = materials * p.hardwarePct;
            hardwareMode = "pct";
        } else {
            hardwareCost = stdHardwareCost * (p.hardwareCoef || 1);
            hardwareMode = "coef";
        }

        // ✅ UPDATED: servicesPct already includes package + (antresol if enabled)
        const servicesCost = materials * num(p.servicesPct, 0);

        const runM = calcRunMm(st) / 1000;
        const topCost = p.topOn ? runM * num(p.topPerM, 0) : 0;

        const bspM2 = runM * (num(p.bspH, 0) / 1000);
        const bspCost = p.bspOn ? bspM2 * num(p.bspPerM2, 0) : 0;

        // ===== LED (Step6) =====
        const ledModeRaw = String(st.ledMode || st.led || st.ledType || "").trim().toLowerCase();
        const ledMode = (["none","under","profile","smart"].includes(ledModeRaw)) ? ledModeRaw : "none";

        const normRoleLed = (m) => {
            const role = String(m?.role || m?.type || "").toLowerCase();
            const name = String(m?.name || m?.name || m?.title || m?.label || "").toLowerCase();
            if (role.includes("upper") || role.includes("wall") || name.includes("верх")) return "upper";
            if (role.includes("tall") || role.includes("column") || name.includes("колон")) return "tall";
            return "base";
        };

        const isHoodUnitLed = (m) => {
            const role = String(m?.role || m?.type || "").toLowerCase();
            const name = String(m?.name || m?.title || m?.label || "").toLowerCase();
            return role.includes("hood") || name.includes("витяж") || name.includes("вытяж");
        };

        const isFridgeColumnLed = (m) => {
            const role = String(m?.role || m?.type || "").toLowerCase();
            const name = String(m?.name || m?.title || m?.label || "").toLowerCase();
            return role.includes("fridge") || name.includes("холод") || name.includes("хол-") || name.includes("холодиль");
        };

        let upperRunMm = 0;
        let glassEligibleRunMm = 0;

        (modules || []).forEach(m => {
            if (!m) return;
            const bucket = normRoleLed(m);
            if (bucket !== "upper") return;

            const W = num(m.width ?? m.w ?? 0);
            if (W <= 0) return;

            if (!isHoodUnitLed(m) && !isFridgeColumnLed(m)) {
                upperRunMm += W;
                glassEligibleRunMm += W;
            }
        });

        const upperRunM = upperRunMm / 1000;
        const glassEligibleRunM = glassEligibleRunMm / 1000;

        let ledLenM = 0;
        let ledPerM = 0;
        let ledName = "";

        if (ledMode === "under") {
            ledLenM = upperRunM;
            ledPerM = num(p.ledUnderPerM, 0);
            ledName = "LED (під верхніми шафами)";
        } else if (ledMode === "profile") {
            ledLenM = isGlassProfile ? glassEligibleRunM : 0;
            ledPerM = num(p.ledProfilePerM, 0);
            ledName = "LED (у профілі / вітринах)";
        } else if (ledMode === "smart") {
            ledLenM = upperRunM;
            ledPerM = num(p.ledSmartPerM, 0);
            ledName = "LED (сценарії світла)";
        }

        const ledCost = Math.max(0, ledLenM) * Math.max(0, ledPerM);

        const grand = materials + hardwareCost + servicesCost + topCost + bspCost + ledCost;

        const servicesPctLabel = Math.round(num(p.servicesPct, 0) * 100);

        const bom = [
            { code: "CORP-CHIP", name: "Корпус (ДСП)", unit: "лист", qty: corpSheetsEq, sum: corpCost },
            { code: "BACK", name: "Задня стінка", unit: "лист", qty: backSheetsEq, sum: backCost },

            ...(isGlassProfile ? [
                { code: "FACADE_GLASS", name: glassLabel, unit: "м²", qty: glassNeedM2, sum: glassCost },
                { code: "FACADE_MDF",   name: mdfLabel,   unit: "м²", qty: mdfNeedM2,   sum: mdfCost },
            ] : [
                { code: "FACADE", name: mdfLabel, unit: "м²", qty: mdfNeedM2, sum: mdfCost },
            ]),

            { code: "WORKTOP", name: "Стільниця", unit: "м.п.", qty: p.topOn ? runM : 0, sum: topCost },
            { code: "BACKSPL", name: "Фартух", unit: "м²", qty: p.bspOn ? bspM2 : 0, sum: bspCost },
            { code: "LED", name: ledName || "LED", unit: "м.п.", qty: ledLenM, sum: ledCost },

            {
                code: "HARDWARE",
                name:
                    p.comfort === "standard"
                        ? `Фурнітура (BLUM Standard: петлі ${hingeQty} / шухляди ${drawers} / AVENTOS HK ${hkQty} HF ${hfQty})`
                        : (p.comfort === "econom"
                                ? (hardwareMode === "coef"
                                    ? `Фурнітура (Müller / Віяр: ~×${(p.hardwareCoef || 1).toFixed(2)} до Standard)`
                                    : "Фурнітура (Müller / Віяр)")
                                : (hardwareMode === "coef"
                                    ? `Фурнітура (BLUM Premium: ~×${(p.hardwareCoef || 1).toFixed(2)} до Standard)`
                                    : "Фурнітура (Premium)")
                        ),
                unit: hardwareMode === "pct" ? "%" : "од.",
                qty: hardwareMode === "pct" ? Math.round((p.hardwarePct || 0) * 100) : (hingeQty + drawers + hkQty + hfQty),
                sum: hardwareCost,
            },

            // ✅ UPDATED LABEL
            {
                code: "SERV",
                name: p.hasAntresol ? `Послуги (${servicesPctLabel}%, антресолі)` : `Послуги (${servicesPctLabel}%)`,
                unit: "%",
                qty: num(p.servicesPct, 0),
                sum: servicesCost
            },
        ];

        return {
            modules,
            areas,
            params: p,
            totals: {
                corpCost, corpSheetsEq,
                backCost, backSheetsEq,

                facadeCost,
                facadeGlassNeedM2: glassNeedM2,
                facadeMdfNeedM2: mdfNeedM2,
                facadeGlassCost: glassCost,
                facadeMdfCost: mdfCost,
                facadeName,
                materialTier,

                hardwareCost,
                servicesCost,
                topCost,
                topLenM: runM,
                bspCost,
                bspM2,
                ledMode,
                ledLenM,
                ledCost,
                grand,
                hw: { doors, drawers, hingeQty, hkQty, hfQty, source: hw.source },
                eur,
            },
            bom,
        };
    }

    // ===== RENDER =====
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
        if (res.totals.ledCost > 0) parts.push("LED");
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

            const glassNeed = num(res.totals.facadeGlassNeedM2, 0);
            const mdfNeed   = num(res.totals.facadeMdfNeedM2, 0);

            const hw = res.totals.hw || {};
            const eur = res.totals.eur;

            details = `
        <div class="hr" style="margin:10px 0;"></div>
        <div class="tiny" style="opacity:.9; margin-bottom:6px;">Деталізація площ (MVP)</div>

        <div class="tiny" style="opacity:.8;">
          <b>Корпус</b>: боковини ${(a.corpSidesM2||0).toFixed(2)} м² · дно/кришка ${(a.corpBottomTopM2||0).toFixed(2)} м² · полиці ${(a.corpShelvesM2||0).toFixed(2)} м²<br/>
          Разом raw ${(a.corpM2||0).toFixed(2)} м² → з відходами ${corpNeedM2.toFixed(2)} м²<br/>
          Листи екв. ${corpEq.toFixed(2)} · До закупки ${corpBuy}
          <br/><br/>

          <b>Фасади</b>: raw ${(a.facadeM2||0).toFixed(2)} м²<br/>
          — Скло+профіль (eligible верх): raw ${(a.facadeM2GlassEligible||0).toFixed(2)} м² → з відходами ${glassNeed.toFixed(2)} м²<br/>
          — МДФ (решта): raw ${Math.max(0,(a.facadeM2||0)-(a.facadeM2GlassEligible||0)).toFixed(2)} м² → з відходами ${mdfNeed.toFixed(2)} м²
          <br/><br/>

          <b>Задня стінка</b>: raw ${(a.backM2||0).toFixed(2)} м² → з відходами ${backNeedM2.toFixed(2)} м²<br/>
          Листи екв. ${backEq.toFixed(2)} · До закупки ${backBuy}
          <br/><br/>

          <b>Фурнітура</b>: двері ${num(hw.doors,0)} · шухляди ${num(hw.drawers,0)} · петлі ${num(hw.hingeQty,0)} (source: ${hw.source || "?"})<br/>
          AVENTOS: HK ${num(hw.hkQty,0)} · HF ${num(hw.hfQty,0)}<br/>
          Курс EUR: ${num(eur,0).toFixed(2)}
          <br/><br/>
          <b>Послуги</b>: ${(num(p.servicesPct,0)*100).toFixed(0)}% ${p.hasAntresol ? "(антресолі)" : ""}
        </div>
      `;
        }

        const head = `
      <div style="display:grid; grid-template-columns: 120px 1fr 70px 90px 110px; gap:8px; padding:8px 0; border-bottom:1px solid rgba(255,255,255,.08);">
        <div class="tiny">Код</div><div class="tiny">Назва</div><div class="tiny">Од.</div><div class="tiny">К-сть</div><div class="tiny">Сума</div>
      </div>
    `;

        const rows = res.bom.map((x) => `
      <div style="display:grid; grid-template-columns: 120px 1fr 70px 90px 110px; gap:8px; padding:8px 0; border-bottom:1px solid rgba(255,255,255,.06);">
        <div class="tiny">${x.code}</div>
        <div style="font-weight:700;">${x.name}</div>
        <div class="tiny">${x.unit}</div>
        <div class="tiny">${num(x.qty,0).toFixed(2)}</div>
        <div style="font-weight:800;">${fmtUAH(x.sum)}</div>
      </div>
    `).join("");

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

    // ===== MODE =====
    function setMode(mode) {
        const vClient = $("#calcClientView");
        const vMgr = $("#calcManagerView");
        const clientBtn = $("#calcModeClientBtn");
        const mgrBtn = $("#calcModeManagerBtn");

        // 1) body class (для layout)
        if (mode === "manager") {
            document.body.classList.add("manager-mode");
            document.body.classList.remove("client-mode");
        } else {
            document.body.classList.add("client-mode");
            document.body.classList.remove("manager-mode");
        }

        // 2) Views via class (без style.display)
        if (vClient) vClient.classList.toggle("is-active", mode !== "manager");
        if (vMgr) vMgr.classList.toggle("is-active", mode === "manager");

        // 3) Buttons UI
        if (clientBtn) {
            clientBtn.classList.toggle("active", mode !== "manager");
            clientBtn.style.opacity = (mode !== "manager") ? "1" : ".7";
        }
        if (mgrBtn) {
            mgrBtn.classList.toggle("active", mode === "manager");
            mgrBtn.style.opacity = (mode === "manager") ? "1" : ".7";
        }
    }


    // ===== OVERRIDES =====
    function readManagerInputs() {
        const st = getState();
        const ov = Object.assign({}, st.calcOverrides || {});
        const g = (id) => document.getElementById(id);

        const setNum = (k, id) => { const el = g(id); if (el) ov[k] = num(el.value, ov[k]); };
        const setChk = (k, id) => { const el = g(id); if (el) ov[k] = !!el.checked; };

        setNum("corpSheetPrice", "mCorpSheetPrice");
        setNum("corpWaste", "mCorpWaste");

        setNum("facadeM2PriceStandard", "mFacadeM2Price");
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

        setVal("mFacadeM2Price", p.facadeM2PriceStandard || p.facadeM2Price);
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

    let lastRes = null;

    function recalcAndRender() {
        const st = getState();

        const pkg = kcEnsureHardwarePackageSoT(st);
        const patch = {};
        if (st.hardwarePackage !== pkg) patch.hardwarePackage = pkg;
        if (st.comfortKit !== pkg) patch.comfortKit = pkg;
        if (st.comfort !== pkg) patch.comfort = pkg;
        if (!st.package) patch.package = pkg;
        if (Object.keys(patch).length) setState(patch, "step8:hardware-sot-sync");

        const res = calcKitchen();
        lastRes = res;

        renderClient(res);
        renderManager(res);
        syncManagerInputsFromParams(res.params);
    }



    function wireOnce() {
        if (document.body.dataset.kcStep8Bound === "1") return;
        document.body.dataset.kcStep8Bound = "1";

        const cBtn = $("#calcModeClientBtn");
        const mBtn = $("#calcModeManagerBtn");
        const rBtn = $("#recalcBtn");

        if (cBtn) cBtn.addEventListener("click", () => setMode("client"));
        if (mBtn) mBtn.addEventListener("click", () => setMode("manager"));
        if (rBtn) rBtn.addEventListener("click", () => { readManagerInputs(); recalcAndRender(); });

        const autoIds = [
            "mCorpSheetPrice","mCorpWaste","mFacadeM2Price","mFacadeWaste","mBackSheetPrice","mBackWaste",
            "mTopOn","mTopPerM","mTopDepth","mBspOn","mBspPerM2","mBspH","mHardwarePct","mServicesPct",
        ];

        autoIds.forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener("input", () => { readManagerInputs(); recalcAndRender(); });
            el.addEventListener("change", () => { readManagerInputs(); recalcAndRender(); });
        });

        const dToggle = $("#mgrDetailsToggle");
        if (dToggle) dToggle.addEventListener("change", () => { if (lastRes) renderManager(lastRes); });

        if (typeof window.showStep === "function" && !window.__KC_STEP8_PATCHED__) {
            window.__KC_STEP8_PATCHED__ = true;
            const _show = window.showStep;
            window.showStep = function (n) {
                _show(n);
                if (Number(n) === 8) { setMode("client"); recalcAndRender(); }
            };
        }

        window.addEventListener("KC_STATE_UPDATED", (e) => {
            const reason = e?.detail?.reason || "";
            if (/step4|modules|dims|tech|layout|step6|facade/i.test(reason) ||
                (e?.detail?.patch && (
                    "modules" in e.detail.patch ||
                    "dims" in e.detail.patch ||
                    "tech" in e.detail.patch ||
                    "facadeStyle" in e.detail.patch ||
                    "led" in e.detail.patch ||
                    "ledMode" in e.detail.patch ||
                    // ✅ if you toggle antresol in state, step8 will react
                    "hasAntresol" in e.detail.patch ||
                    "antresol" in e.detail.patch ||
                    "antresoli" in e.detail.patch ||
                    "mezzanine" in e.detail.patch
                ))
            ) {
                const st = getState();
                if (Number(st.step) === 8) recalcAndRender();
            }
        });
    }

    function init() {
        wireOnce();
        const st = getState();
        if (Number(st.step) === 8) { setMode("client"); recalcAndRender(); }
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();

    window.KC_STEP8 = { init, recalc: recalcAndRender, setMode, calc: calcKitchen };
})();
