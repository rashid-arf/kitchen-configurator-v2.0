// js/step4.modules.engine.fixed6.0.js
(function(){
  "use strict";

  function getState(){
    if (typeof window.kcGetState === "function") return window.kcGetState();
    if (window.KC && typeof window.KC.getState === "function") return window.KC.getState();
    return window.KC_STATE || {};
  }

  function resolveWallWidth(state){
    const A = Number(state?.dims?.A) || Number(state?.wallWidth) || Number(state?.kitchenWidth) || 0;
    return A;
  }

  function normalizeTech(state){
    const t = state.tech || state.appliances || state.step4Tech || {};
    const src = Object.assign({}, state, t);
    return {
      fridge: !!src.fridge,
      dishwasher: !!src.dishwasher,
      dishwasherWidth: Number(src.dishwasherWidth || src.dwWidth || 600),
      sink: !!src.sink,
      hob: !!src.hob,
      oven: !!src.oven,
      hood: !!src.hood
    };
  }

  const makeLine = (len, lineKey) => {
    const modules = [];
    let used = 0;
    const canFit = (w) => (used + w <= len);
    const push = (m) => { modules.push(m); used += m.width; };

    const addResidual = () => {
      const remaining0 = Math.max(0, len - used);
      let note = "";

      if (remaining0 >= 450 && canFit(450)) {
        push({ id:`${lineKey}_CAB_450`, type:"base", role:"base_450", width:450, label:"Тумба 450" });
        note = "Додано тумбу 450.";
      } else if (remaining0 >= 300 && canFit(300)) {
        push({ id:`${lineKey}_CAB_300`, type:"base", role:"cargo_300", width:300, label:"Карго/тумба 300" });
        note = "Додано модуль 300 (карго).";
      } else if (remaining0 > 0) {
        note = "Залишок < 300 мм — добір/філер.";
      } else {
        note = "Без залишку.";
      }

      return { used, remaining: Math.max(0, len - used), note };
    };

    return { len, modules, push, canFit, addResidual, get used(){ return used; } };
  };

  function calcStraight(state, tech){
    const wallWidth = resolveWallWidth(state);
    if (!wallWidth || wallWidth < 300){
      return { wallWidth: wallWidth || 0, modules: [], used: 0, remaining: wallWidth || 0, meta:{ note:"Недостатня ширина для модулів." } };
    }

    const modules = [];
    let used = 0;
    const canFit = (w) => (used + w <= wallWidth);
    const push = (m) => { modules.push(m); used += m.width; };

    const fridgeSide = (state.modules?.fridgeSide === "right") ? "right" : "left";
    const dwW = Number(tech.dishwasherWidth || 600);

    const fridgeModule = { id:"FRIDGE_TALL", type:"tall", role:"fridge", width:600, label:"Холодильник-колона 600" };
    if (tech.fridge && fridgeSide === "left" && canFit(600)) push(fridgeModule);

    // ПММ завжди ліворуч від мийки
    if (tech.sink){
      if (tech.dishwasher && canFit(dwW)) push({ id:"DISHWASHER", type:"base", role:"dishwasher", width:dwW, label:`ПММ ${dwW}` });
      if (canFit(600)) push({ id:"SINK", type:"base", role:"sink", width:600, label:"Мийка 600" });
    } else {
      if (tech.dishwasher && canFit(dwW)) push({ id:"DISHWASHER", type:"base", role:"dishwasher", width:dwW, label:`ПММ ${dwW}` });
    }

    if ((tech.hob || tech.oven) && canFit(600)) push({ id:"COOKING", type:"base", role:"cooking", width:600, label:"Плита/духовка 600" });

    while (canFit(600)) push({ id:"BASE_" + (modules.length + 1), type:"base", role:"base", width:600, label:"Тумба 600" });

    if (tech.fridge && fridgeSide === "right" && canFit(600)) push(fridgeModule);

    // residual (450/300)
    let remaining = Math.max(0, wallWidth - used);
    const meta = { used, remaining };

    if (remaining >= 450 && canFit(450)) { push({ id:"CAB_450", type:"base", role:"base_450", width:450, label:"Тумба 450" }); }
    else if (remaining >= 300 && canFit(300)) { push({ id:"CAB_300", type:"base", role:"cargo_300", width:300, label:"Карго/тумба 300" }); }

    meta.used = used;
    meta.remaining = Math.max(0, wallWidth - used);
    meta.note = (meta.remaining > 0 && meta.remaining < 300) ? "Залишок < 300 мм — добір/філер." :
        (meta.remaining >= 300) ? `Є запас ${meta.remaining} мм — можна карго/тумбу.` :
            "Без залишку.";

    return { wallWidth, modules, used: meta.used, remaining: meta.remaining, meta };
  }

  function calcL(state, tech, A, B){
    const CORNER = 900;

    if (!A || !B || A < 1200 || B < 1200){
      return {
        wallWidth: A || 0,
        modules: [],
        used: 0,
        remaining: A || 0,
        meta: { note: "Для кутової кухні потрібні розміри A і B (мін. ~1200 мм кожна)." }
      };
    }

    const lineA = makeLine(A, "A");
    const lineB = makeLine(B, "B");

    // reserve corner
    if (lineA.canFit(CORNER)) lineA.push({ id:"A_CORNER", type:"corner", role:"corner", width:CORNER, label:`Кутовий модуль ${CORNER}×${CORNER}` });
    if (lineB.canFit(CORNER)) lineB.push({ id:"B_CORNER", type:"corner", role:"corner", width:CORNER, label:`Кутовий модуль ${CORNER}×${CORNER}` });

    const fridgeSide = (state.modules?.fridgeSide === "right") ? "right" : "left";
    const dwW = Number(tech.dishwasherWidth || 600);

    if (tech.fridge && fridgeSide === "left" && lineA.canFit(600)){
      lineA.push({ id:"A_FRIDGE_TALL", type:"tall", role:"fridge", width:600, label:"Холодильник-колона 600" });
    }

    const placeDishSink = (line, key) => {
      if (!tech.sink) return false;
      if (tech.dishwasher && line.canFit(dwW)) line.push({ id:`${key}_DISHWASHER`, type:"base", role:"dishwasher", width:dwW, label:`ПММ ${dwW}` });
      if (line.canFit(600)) { line.push({ id:`${key}_SINK`, type:"base", role:"sink", width:600, label:"Мийка 600" }); return true; }
      return false;
    };

    const placeDWOnly = (line, key) => {
      if (tech.dishwasher && line.canFit(dwW)) { line.push({ id:`${key}_DISHWASHER`, type:"base", role:"dishwasher", width:dwW, label:`ПММ ${dwW}` }); return true; }
      return false;
    };

    if (tech.sink) {
      if (!placeDishSink(lineA, "A")) placeDishSink(lineB, "B");
    } else {
      if (!placeDWOnly(lineA, "A")) placeDWOnly(lineB, "B");
    }

    if (tech.hob || tech.oven) {
      if (lineA.canFit(600)) lineA.push({ id:"A_COOKING", type:"base", role:"cooking", width:600, label:"Плита/духовка 600" });
      else if (lineB.canFit(600)) lineB.push({ id:"B_COOKING", type:"base", role:"cooking", width:600, label:"Плита/духовка 600" });
    }

    while (lineA.canFit(600)) lineA.push({ id:`A_BASE_${lineA.modules.length+1}`, type:"base", role:"base", width:600, label:"Тумба 600" });
    while (lineB.canFit(600)) lineB.push({ id:`B_BASE_${lineB.modules.length+1}`, type:"base", role:"base", width:600, label:"Тумба 600" });

    if (tech.fridge && fridgeSide === "right" && lineB.canFit(600)){
      lineB.push({ id:"B_FRIDGE_TALL", type:"tall", role:"fridge", width:600, label:"Холодильник-колона 600" });
    }

    const rA = lineA.addResidual();
    const rB = lineB.addResidual();

    const flatModules = [...lineA.modules, ...lineB.modules];

    const meta = {
      layout: "L",
      A: { len: A, used: lineA.used, remaining: Math.max(0, A - lineA.used), note: rA.note },
      B: { len: B, used: lineB.used, remaining: Math.max(0, B - lineB.used), note: rB.note },
      note: "Кутова (L): зібрано по лініях A та B, кут 900×900."
    };

    return {
      wallWidth: A,              // legacy
      modules: flatModules,
      zones: { A: lineA, B: lineB },
      used: lineA.used + lineB.used,
      remaining: Math.max(0, A - lineA.used) + Math.max(0, B - lineB.used),
      meta
    };
  }

  function calcU(state, tech, A, B, C){
    const CORNER = 900;

    const C_eff = Number(C || 0) || Number(B || 0);

    if (!A || !B || A < 1800 || B < 1200 || C_eff < 1200) {
      return {
        wallWidth: A || 0,
        modules: [],
        used: 0,
        remaining: A || 0,
        meta: { note: "Для П-подібної (U) потрібні розміри A, B, C (мін. A~1800, B/C~1200)." }
      };
    }

    const lineA = makeLine(A, "A");
    const lineB = makeLine(B, "B");
    const lineC = makeLine(C_eff, "C");

    // 2 кути: A×2, B×1, C×1
    if (lineA.canFit(CORNER)) lineA.push({ id:"A_CORNER_L", type:"corner", role:"corner", width:CORNER, label:`Кутовий модуль ${CORNER}×${CORNER}` });
    if (lineA.canFit(CORNER)) lineA.push({ id:"A_CORNER_R", type:"corner", role:"corner", width:CORNER, label:`Кутовий модуль ${CORNER}×${CORNER}` });
    if (lineB.canFit(CORNER)) lineB.push({ id:"B_CORNER", type:"corner", role:"corner", width:CORNER, label:`Кутовий модуль ${CORNER}×${CORNER}` });
    if (lineC.canFit(CORNER)) lineC.push({ id:"C_CORNER", type:"corner", role:"corner", width:CORNER, label:`Кутовий модуль ${CORNER}×${CORNER}` });

    const dwW = Number(tech.dishwasherWidth || 600);

    // fridge: left -> C, right -> B
    const fridgeSide = (state.modules?.fridgeSide === "right") ? "right" : "left";
    if (tech.fridge) {
      if (fridgeSide === "left") {
        if (lineC.canFit(600)) lineC.push({ id:"C_FRIDGE_TALL", type:"tall", role:"fridge", width:600, label:"Холодильник-колона 600" });
        else if (lineB.canFit(600)) lineB.push({ id:"B_FRIDGE_TALL", type:"tall", role:"fridge", width:600, label:"Холодильник-колона 600" });
      } else {
        if (lineB.canFit(600)) lineB.push({ id:"B_FRIDGE_TALL", type:"tall", role:"fridge", width:600, label:"Холодильник-колона 600" });
        else if (lineC.canFit(600)) lineC.push({ id:"C_FRIDGE_TALL", type:"tall", role:"fridge", width:600, label:"Холодильник-колона 600" });
      }
    }

    const placeDishSink = (line, key) => {
      if (!tech.sink) return false;
      if (tech.dishwasher && line.canFit(dwW)) line.push({ id:`${key}_DISHWASHER`, type:"base", role:"dishwasher", width:dwW, label:`ПММ ${dwW}` });
      if (line.canFit(600)) { line.push({ id:`${key}_SINK`, type:"base", role:"sink", width:600, label:"Мийка 600" }); return true; }
      return false;
    };
    const placeDWOnly = (line, key) => {
      if (tech.dishwasher && line.canFit(dwW)) { line.push({ id:`${key}_DISHWASHER`, type:"base", role:"dishwasher", width:dwW, label:`ПММ ${dwW}` }); return true; }
      return false;
    };

    // sink priority A -> C -> B
    if (tech.sink) {
      if (!placeDishSink(lineA, "A")) {
        if (!placeDishSink(lineC, "C")) placeDishSink(lineB, "B");
      }
    } else {
      if (!placeDWOnly(lineA, "A")) {
        if (!placeDWOnly(lineC, "C")) placeDWOnly(lineB, "B");
      }
    }

    // cooking priority A -> B -> C
    if (tech.hob || tech.oven) {
      if (lineA.canFit(600)) lineA.push({ id:"A_COOKING", type:"base", role:"cooking", width:600, label:"Плита/духовка 600" });
      else if (lineB.canFit(600)) lineB.push({ id:"B_COOKING", type:"base", role:"cooking", width:600, label:"Плита/духовка 600" });
      else if (lineC.canFit(600)) lineC.push({ id:"C_COOKING", type:"base", role:"cooking", width:600, label:"Плита/духовка 600" });
    }

    while (lineA.canFit(600)) lineA.push({ id:`A_BASE_${lineA.modules.length+1}`, type:"base", role:"base", width:600, label:"Тумба 600" });
    while (lineB.canFit(600)) lineB.push({ id:`B_BASE_${lineB.modules.length+1}`, type:"base", role:"base", width:600, label:"Тумба 600" });
    while (lineC.canFit(600)) lineC.push({ id:`C_BASE_${lineC.modules.length+1}`, type:"base", role:"base", width:600, label:"Тумба 600" });

    const rA = lineA.addResidual();
    const rB = lineB.addResidual();
    const rC = lineC.addResidual();

    const flatModules = [...lineA.modules, ...lineB.modules, ...lineC.modules];

    const meta = {
      layout: "U",
      A: { len: A, used: lineA.used, remaining: Math.max(0, A - lineA.used), note: rA.note },
      B: { len: B, used: lineB.used, remaining: Math.max(0, B - lineB.used), note: rB.note },
      C: { len: C_eff, used: lineC.used, remaining: Math.max(0, C_eff - lineC.used), note: rC.note },
      note: "П-подібна (U): зібрано по лініях A, B, C. Кути: A×2, B×1, C×1 (900×900)."
    };

    const totalLen = A + B + C_eff;
    const totalUsed = lineA.used + lineB.used + lineC.used;
    const totalRemaining =
        Math.max(0, A - lineA.used) +
        Math.max(0, B - lineB.used) +
        Math.max(0, C_eff - lineC.used);

    return {
      wallWidth: totalLen,
      modules: flatModules,
      zones: { A: lineA, B: lineB, C: lineC },
      used: totalUsed,
      remaining: totalRemaining,
      meta
    };
  }

  function addIslandZone(state, basePayload){
    const islandLen = Number(state?.dims?.island ?? state?.island?.length ?? state?.islandLength ?? state?.dimsIsland ?? 0);
    if (!islandLen || islandLen < 1200) return basePayload;

    const island = makeLine(islandLen, "I");

    while (island.canFit(600)) {
      island.push({ id:`I_BASE_${island.modules.length+1}`, type:"island", role:"base", width:600, label:"Острів 600" });
    }

    const rI = island.addResidual();

    const modules = [...(basePayload.modules || []), ...island.modules];
    const meta = Object.assign({}, basePayload.meta || {});
    meta.ISLAND = { len: islandLen, used: island.used, remaining: rI.remaining, note: rI.note };

    return Object.assign({}, basePayload, {
      modules,
      used: Number(basePayload.used || 0) + island.used,
      remaining: Number(basePayload.remaining || 0) + rI.remaining,
      meta
    });
  }

  // ✅ NEW: AUTO UPPERS (MVP)
  function addUpperZone(state, tech, basePayload){
    const st = state || {};
    const upperOn =
        (st.upperOn != null) ? !!st.upperOn :
            (st.uppersOn != null) ? !!st.uppersOn :
                (st.upper?.on != null) ? !!st.upper.on :
                    (st.upper?.enabled != null) ? !!st.upper.enabled :
                        true; // MVP: за замовчуванням вважаємо, що верх є

    if (!upperOn) return basePayload;

    const baseModules = (basePayload?.modules || []);
    const uppers = [];

    baseModules.forEach((m) => {
      if (!m) return;

      // верх не робимо для острова та високих колон
      const isIsland = (m.type === "island") || (m.role === "island");
      const isTall = (m.type === "tall") || (m.role === "fridge") || (m.role === "tall") || (m.role === "column");
      if (isIsland || isTall) return;

      const w = Number(m.width || 0);
      if (!w) return;

      // label
      let label = `Верх ${w}`;
      if (m.role === "corner") label = `Верх кутовий ${w}×${w}`;
      if (m.role === "cooking" && tech?.hood) label = `Шафа під витяжку ${w}`;

      uppers.push({
        id: `U_${m.id || (m.role + "_" + w)}`,
        type: "upper",
        role: "upper",
        width: w,
        label
      });
    });

    if (!uppers.length) return basePayload;

    const modules = [...baseModules, ...uppers];
    const meta = Object.assign({}, basePayload.meta || {});
    meta.UPPER = { count: uppers.length, note: "Верх (MVP): автогенерація по ширинах низу." };

    return Object.assign({}, basePayload, { modules, meta });
  }

  function calcModulesRules(stateArg){
    const state = stateArg || getState();
    const tech  = normalizeTech(state);

    const layout = (state.layout || state.planning || state.plan || state.kitchenShape || state?.dims?.layout || "straight");
    const layoutStr = String(layout || "").toLowerCase();

    const A = Number(state?.dims?.A || state?.dimsA || state?.wallWidth || 0);
    const B_raw = Number(state?.dims?.B ?? state?.dimsB ?? state?.wallWidthB ?? state?.wallWidth_B ?? 0);
    const C_raw = Number(state?.dims?.C ?? state?.dimsC ?? state?.wallWidthC ?? state?.wallWidth_C ?? 0);

    const isStraight = layoutStr.includes("прям") || layoutStr.includes("straight") || layoutStr.includes("single") || layoutStr === "i";
    const isL = !isStraight && (layoutStr.includes("кут") || layoutStr.includes("corner") || layoutStr.includes("l-shaped") || layoutStr === "l");
    const isU = !isStraight && (layoutStr.includes("п-п") || layoutStr.includes("u-shaped") || layoutStr === "u");
    const isIsland = layoutStr.includes("остр") || layoutStr.includes("island");

    // B / C usage
    const B = (isL || isU || isIsland) ? B_raw : 0;
    const C = (isU) ? C_raw : 0;

    let payload;

    if (isU) {
      payload = calcU(state, tech, A, B, C);
    } else if (isL || (isIsland && B >= 1200)) {
      payload = calcL(state, tech, A, B);
    } else {
      payload = calcStraight(state, tech);
    }

    if (isIsland) {
      payload = addIslandZone(state, payload);
    }

    // ✅ add upper after island (so uppers stay after base+island; in UI we still separate by type)
    payload = addUpperZone(state, tech, payload);

    // legacy fields compatibility
    payload.wallWidth = payload.wallWidth ?? A;

    return payload;
  }

  window.KC_STEP4 = window.KC_STEP4 || {};
  window.KC_STEP4.calcModulesRules = calcModulesRules;

 })();
