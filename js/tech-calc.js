// =======================
// KC TECH CALC — MVP v1 (Manager)
// Reads payload from localStorage (KC_TECH_HANDOFF_V1)
// Generates parts + edging + drilling (rough) + exports CSV
// =======================
(function () {
  "use strict";

  const HANDOFF_KEY = "KC_TECH_HANDOFF_V1";

  const $ = (s, r=document) => r.querySelector(s);
  const num = (v, d=0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };

  const DEFAULTS = {
    baseH: 830, upperH: 720, tallH: 2300,
    baseD: 560, upperD: 320, tallD: 560,
    tCorp: 18, tBack: 4
  };

  function roleBucket(m) {
    const role = String(m?.role || "").toLowerCase();
    const name = String(m?.name || "").toLowerCase();
    if (role.includes("upper") || role.includes("wall") || name.includes("верх")) return "upper";
    if (role.includes("tall") || role.includes("column") || role.includes("fridge") || name.includes("колон") || name.includes("холод")) return "tall";
    return "base";
  }

  function ensureDims(m) {
    const b = roleBucket(m);
    const W = num(m.width, 0);
    let H = num(m.height, 0);
    let D = num(m.depth, 0);
    if (!H) H = (b==="upper") ? DEFAULTS.upperH : (b==="tall") ? DEFAULTS.tallH : DEFAULTS.baseH;
    if (!D) D = (b==="upper") ? DEFAULTS.upperD : (b==="tall") ? DEFAULTS.tallD : DEFAULTS.baseD;
    return { W, H, D, bucket: b };
  }

  function loadPayload() {
    try {
      const raw = localStorage.getItem(HANDOFF_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function mmToM(v){ return num(v,0)/1000; }

  function partRow(group, code, name, L, W, qty, note="") {
    return { group, code, name, L: Math.round(L), W: Math.round(W), qty: num(qty,0), note };
  }

  function edgeRow(code, name, m, qty, note="") {
    return { group: "Кромка", code, name, L: m, W: "", qty: qty, note };
  }

  function opRow(code, name, qty, note="") {
    return { group: "Операції", code, name, L:"", W:"", qty, note };
  }
function detectRoleRaw(m){
  return String(m?.role || m?.type || m?.kind || "").toLowerCase();
}

function isExcludedForShelves(roleRaw){
  return (
    roleRaw.includes("sink") ||
    roleRaw.includes("dishwasher") ||
    roleRaw.includes("oven") ||
    roleRaw.includes("cooking") ||
    roleRaw.includes("cargo") ||
    roleRaw.includes("hood") ||
    roleRaw.includes("fridge")
  );
}

function autoShelvesCount(bucket, roleRaw){
  if (isExcludedForShelves(roleRaw)) return 0;
  if (bucket === "upper") return 1;
  if (bucket === "tall") return 3;
  return 1; // base
}

// TECH_STATE will be built on init()
let TECH_STATE = null;

function buildState(payload) {
  const modules = payload?.modules || [];

  const state = {
    details: [],
    edges: [],
    operations: [],
    facades: [] // stub for Stage B
  };

  let edgeFrontTotalM = 0; // for EDGE-OP (m.p.)
  let cut90Total = 0;      // CUT-90 (pcs)
  let drill5Total = 0;     // DRILL-5 (pcs)
  let cup35Total = 0;      // CUP-35 (pcs)
  let drawerOpTotal = 0;
  let drill5HingeTotal = 0; // якщо ще не було



  modules.forEach((m, idx) => {
    const roleRaw = detectRoleRaw(m);
    const { W, H, D, bucket } = ensureDims(m);
    const doorCount   = num(m?.doorCount   ?? m?.doors   ?? 0, 0);
    const drawerCount = num(m?.drawerCount ?? m?.drawers ?? 0, 0);

    if (!W || !H || !D) return;

    const mid = String(m?.id || m?.code || `M${idx + 1}`);
    const module = `${mid}:${bucket}`;
    const tag = `${module}:${W}×${H}×${D}`;

    const tCorp = DEFAULTS.tCorp; // 18
    const innerW = Math.max(0, W - 2 * tCorp);
    const innerD = Math.max(0, D - tCorp); // ✅ ось цього не вистачає

    // ===== FACADES v1 (tech items, not m²) =====

    const drc = num(m?.drawerCount ?? m?.drawers ?? 0, 0);

// Тип фасаду: поки всі MDF. Пізніше підв'яжемо до state фасадів KC.
    const facadeType = "MDF";
    const facadeCode = "F-MDF";
    const facadeName = "Фасад (МДФ)";

// H фасаду v1
    let facadeH = H;
    if (bucket === "base") facadeH = 716; // стандарт під base 830
// upper/tall лишаємо як H (MVP)

    if (doorCount > 0) {
      state.facades.push({
        code: facadeCode,
        name: facadeName,
        material: facadeType,
        L_mm: Math.round(W),
        H_mm: Math.round(facadeH),
        T_mm: 19,
        qty: doorCount,
        module,
        note: "doors"
      });
    }

    if (drawerCount > 0) {
      state.facades.push({
        code: facadeCode,
        name: facadeName,
        material: facadeType,
        L_mm: Math.round(W),
        H_mm: Math.round(facadeH),
        T_mm: 19,
        qty: drawerCount,
        module,
        note: "drawers"
      });
    }

    // ===== DETAILS =====
    state.details.push({
      code: "SIDE", name: "Боковина", material: "ДСП 18",
      L_mm: Math.round(H), W_mm: Math.round(D), T_mm: 18,
      unit: "шт", qty: 2, module, note: tag
    });

    // bottom/top between sides => innerW
    state.details.push({
      code: "BOTTOM", name: "Дно", material: "ДСП 18",
      L_mm: Math.round(innerW), W_mm: Math.round(innerD), T_mm: 18,
      unit: "шт", qty: 1, module, note: tag
    });

    state.details.push({
      code: "TOP", name: "Кришка", material: "ДСП 18",
      L_mm: Math.round(innerW), W_mm: Math.round(innerD), T_mm: 18,
      unit: "шт", qty: 1, module, note: tag
    });

    // shelves: priority explicit > auto rule
    const shExplicit = num(m?.shelvesCount ?? m?.shelves ?? 0, 0);
    const sh = (shExplicit > 0) ? shExplicit : autoShelvesCount(bucket, roleRaw);

    if (sh > 0) {
      const shelfDepthMm = (bucket === "upper")
        ? Math.max(0, DEFAULTS.upperD - tCorp) // 302
        : Math.max(0, DEFAULTS.baseD - tCorp); // 542

      state.details.push({
        code: "SHELF", name: "Полиця", material: "ДСП 18",
        L_mm: Math.round(innerW), W_mm: Math.round(shelfDepthMm), T_mm: 18,
        unit: "шт", qty: sh, module, note: tag
      });

      // DRILL-5: 4 holes per shelf
      drill5Total += 4 * sh;
    }

    // back: between sides => innerW
    state.details.push({
      code: "BACK", name: "Задня стінка", material: "HDF 4",
      L_mm: Math.round(innerW), W_mm: Math.round(H), T_mm: 4,
      unit: "шт", qty: 1, module, note: tag
    });

    // ===== EDGES v1 (EDGE-FRONT by details) =====
    const addEdgeFront = (lenMm, qty, note) => {
      if (lenMm <= 0 || qty <= 0) return;
      state.edges.push({
        code: "EDGE-FRONT", name: "Кромка фронт", material: "ПВХ",
        L_mm: Math.round(lenMm), unit: "м.п.", qty,
        module, note
      });
      edgeFrontTotalM += (lenMm / 1000) * qty;
    };

    addEdgeFront(H, 2, "боковини (фронт)");
    addEdgeFront(innerW, 1, "дно (фронт)");
    addEdgeFront(innerW, 1, "кришка (фронт)");
    if (sh > 0) addEdgeFront(innerW, sh, "полиці (фронт)");

    // ===== OPERATIONS v1 =====
    // CUT-90: 4 cuts per part (v1 simplification)
    const partCount = 2 + 1 + 1 + sh + 1; // sides + bottom + top + shelves + back
    cut90Total += partCount * 4;


    // CUP-35: doorCount × 2
    if (doorCount > 0) cup35Total += doorCount * 2;

    // DRILL-5-HINGE: 4 отвори Ø5 на 1 дверку
    if (doorCount > 0) drill5HingeTotal += doorCount * 4;

    // DRAWER-OP: 1 операція на 1 ящик (v1)
    if (drawerCount > 0) drawerOpTotal += drawerCount;
  });

  // aggregated ops (v1)
  if (cut90Total > 0) state.operations.push({
    code: "CUT-90", name: "Різ 90°", unit: "шт",
    qty: cut90Total, module: "ALL",
    note: "v1: 4 різи на деталь"
  });

  if (edgeFrontTotalM > 0) state.operations.push({
    code: "EDGE-OP", name: "Кромкування фронту", unit: "м.п.",
    qty: Number(edgeFrontTotalM.toFixed(2)), module: "ALL",
    note: "sum EDGE-FRONT"
  });

  if (drill5Total > 0) state.operations.push({
    code: "DRILL-5", name: "Отвори Ø5", unit: "шт",
    qty: drill5Total, module: "ALL",
    note: "4 отвори × полиця"
  });

  if (drill5HingeTotal > 0) state.operations.push({
    code: "DRILL-5-HINGE",
    name: "Отвори Ø5 (петлі)",
    unit: "шт",
    qty: drill5HingeTotal,
    module: "ALL",
    note: "v1: 4 отвори на 1 дверку (2 петлі × 2 отвори)"
  });

  if (cup35Total > 0) state.operations.push({
    code: "CUP-35", name: "Чашка Ø35", unit: "шт",
    qty: cup35Total, module: "ALL",
    note: "doorCount × 2"
  });

  if (drawerOpTotal > 0) state.operations.push({
    code: "DRAWER-OP",
    name: "Операції для ящика",
    unit: "шт",
    qty: drawerOpTotal,
    module: "ALL",
    note: "v1: 1 операція на 1 ящик"
  });

  return state;
}

function getTechPayload() {
  return TECH_STATE || { details: [], edges: [], operations: [], facades: [] };
}
function flattenForUi(state){
  const out = [];
  (state.details || []).forEach(d => out.push({
    group: "DETAILS", code: d.code, name: d.name,
    L: d.L_mm, W: d.W_mm, qty: d.qty,
    note: `${d.module}${d.note ? " · " + d.note : ""}`
  }));
  (state.edges || []).forEach(e => out.push({
    group: "EDGES", code: e.code, name: e.name,
    L: e.L_mm, W: "", qty: e.qty,
    note: `${e.module}${e.note ? " · " + e.note : ""}`
  }));
  (state.operations || []).forEach(o => out.push({
    group: "OPERATIONS", code: o.code, name: o.name,
    L: "", W: "", qty: o.qty,
    note: `${o.module}${o.note ? " · " + o.note : ""}`
  }));
  (state.facades || []).forEach(f => out.push({
    group: "FACADES", code: f.code, name: f.name,
    L: f.L_mm, W: f.H_mm, qty: f.qty,
    note: `${f.module}${f.note ? " · " + f.note : ""}`
  }));
  return out;
}

function render(payload, techState) {
  const meta = $("#meta");
  const modCount = (payload?.modules || []).length;
  const layout = payload?.layout || "—";
  const pkg = payload?.selections?.hardwarePackage || "—";
  const tier = payload?.selections?.materialTier || "—";
  const ant = payload?.selections?.hasAntresol ? "так" : "ні";

  meta.innerHTML = `
    <div class="pill">Модулів: <b>${modCount}</b></div>
    <div class="pill">Layout: <b>${layout}</b></div>
    <div class="pill">Hardware: <b>${pkg}</b></div>
    <div class="pill">Матеріали: <b>${tier}</b></div>
    <div class="pill">Антресолі: <b>${ant}</b></div>
  `;

  const rows = flattenForUi(techState);

  const tbody = $("#partsBody");
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.group||""}</td>
      <td>${r.code||""}</td>
      <td>${r.name||""}</td>
      <td class="num">${(r.L!=="" && r.L!==undefined) ? r.L : ""}</td>
      <td class="num">${(r.W!=="" && r.W!==undefined) ? r.W : ""}</td>
      <td class="num">${r.qty||0}</td>
      <td class="muted">${r.note||""}</td>
    </tr>
  `).join("");

  $("#rawJson").textContent = JSON.stringify(payload, null, 2);
}


  function rowsToCsv(rows) {
    const head = ["Група","Код","Найменування","Довжина,мм","Ширина,мм","К-сть","Примітка"];
    const lines = [head.join(";")];
    rows.forEach(r => {
      const row = [
        String(r.group||""),
        String(r.code||""),
        String(r.name||""),
        String(r.L??""),
        String(r.W??""),
        String(r.qty??""),
        String((r.note||"").replace(/\s+/g," ").trim())
      ];
      lines.push(row.map(x => x.replaceAll(";", ",")).join(";"));
    });
    return lines.join("\n");
  }

  function download(name, text, mime="text/plain") {
    const blob = new Blob([text], { type: mime + ";charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function init() {
    const payload = loadPayload();
    if (!payload) {
      $("#status").innerHTML = `<span class="bad">Немає payload у localStorage (${HANDOFF_KEY}). Повернись у KC Step 8 → "Перейти в технічний калькулятор".</span>`;
      return;
    }
    $("#status").innerHTML = `<span class="ok">Payload завантажено ✅</span>`;

    TECH_STATE = buildState(payload);
    render(payload, TECH_STATE);

    $("#btnCsv").addEventListener("click", () => {
      const csv = buildProductionCsv(getTechPayload());
      download("KC_TECH_PRODUCTION_v1.csv", csv, "text/csv");
    });

    $("#btnBack").addEventListener("click", () => {
      window.location.href = "index.with-tech.html#step8";
    });

    // $("#btnClear").addEventListener("click", () => {
    //   localStorage.removeItem(HANDOFF_KEY);
    //   alert("Payload очищено. Перезавантаж сторінку або передай з KC ще раз.");
    // });

  }

  // =======================
// CSV EXPORT — Production v1
// =======================

  function csvEscape(v) {
    if (v === null || v === undefined) return "";
    const s = String(v).replace(/"/g, '""');
    return `"${s}"`;
  }

  function toCsv(rows) {
    return rows.map(r => r.map(csvEscape).join(";")).join("\n");
  }

  function moduleKey(m) {
    const id = m?.id || m?.code || "";
    const role = (m?.role || "").toLowerCase();
    return `${id}:${role}`;
  }

// ===== BUILD CSV DATA =====
  function buildProductionCsv(payload) {
    const rows = [];

    // HEADER
    rows.push([
      "Group","Code","Name","Material",
      "L_mm","W_mm","T_mm",
      "Unit","Qty","Module","Note"
    ]);

    const { details=[], edges=[], operations=[], facades=[] } = payload;

    // DETAILS
    details.forEach(d => {
      rows.push([
        "DETAILS",
        d.code,
        d.name,
        d.material,
        d.L_mm,
        d.W_mm,
        d.T_mm,
        "шт",
        d.qty,
        d.module,
        d.note || ""
      ]);
    });

    // EDGES
    edges.forEach(e => {
      rows.push([
        "EDGES",
        e.code,                 // EDGE-FRONT
        e.name,                 // Кромка фронт
        e.material || "ПВХ",
        e.L_mm,
        "", "",
        "м.п.",
        e.qty,
        e.module,
        e.note || ""
      ]);
    });

    // OPERATIONS
    operations.forEach(o => {
      rows.push([
        "OPERATIONS",
        o.code,
        o.name,
        "",
        "", "", "",
        o.unit,
        o.qty,
        o.module,
        o.note || ""
      ]);
    });

    // FACADES (TECH)
    facades.forEach(f => {
      rows.push([
        "FACADES",
        f.code,
        f.name,
        f.material,
        f.L_mm,
        f.H_mm,
        f.T_mm,
        "шт",
        f.qty,
        f.module,
        f.note || ""
      ]);
    });

    return toCsv(rows);
  }

// ===== DOWNLOAD =====

  function downloadCsv(filename, content) {
    const withBom = "\ufeff" + content; // ← ОЦЕ ГОЛОВНЕ
    const blob = new Blob([withBom], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }



// ===== WIRE BUTTON =====
  document.getElementById("exportCsvBtn")?.addEventListener("click", () => {
    // ⬇️ ВАЖЛИВО:
    // getTechPayload() — твоя існуюча функція,
    // яка повертає { details, edges, operations, facades }
    const payload = getTechPayload();

    const csv = buildProductionCsv(payload);
    downloadCsv("KC_TECH_PRODUCTION_v1.csv", csv);
  });



  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
