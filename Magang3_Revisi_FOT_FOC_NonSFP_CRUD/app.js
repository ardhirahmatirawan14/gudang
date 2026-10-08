// ============================================================
// MAGANG3 — INVENTORY MONITORING
// app.js — v13 FINAL
// ============================================================

const INTERNAL_API_URL = "https://script.google.com/macros/s/AKfycbwtyMixbr4h1RSFmihFQACX_eRcL_eLpC1iOUnP8EZBAcjl3Kw3THPkbR3avTh5_KSsjQ/exec";

let internalRawData = [];
let internalData = [];
let filteredInternalData = [];

let externalRawData = [];
let externalData = [];
let filteredExternalData = [];

// Row yang sedang aktif di modal detail (untuk simpanPengeluaranFOC)
let currentDetailRow = null;
let currentDetailScope = "internal";

if (sessionStorage.getItem("magang3_admin_logged_in") !== "true") {
    window.location.href = "login.html";
}

document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".nav-item").forEach(function (item) {
        item.addEventListener("click", function () { showPage(item.dataset.page); });
    });
    const s = document.getElementById("internalSearch");
    if (s) s.addEventListener("input", filterInternalData);
    const l = document.getElementById("internalLocation");
    if (l) l.addEventListener("change", filterInternalData);

    const es = document.getElementById("externalSearch");
    if (es) es.addEventListener("input", filterExternalData);
    const el = document.getElementById("externalLocation");
    if (el) el.addEventListener("change", filterExternalData);

    const r = document.getElementById("refreshBtn");
    if (r && !r.getAttribute("onclick")) r.addEventListener("click", handlePageRefresh);
    const lo = document.getElementById("logoutBtn");
    if (lo) lo.addEventListener("click", logoutAdmin);
    showPage("dashboard");
});

function showPage(page) {
    document.querySelectorAll(".page").forEach(function (x) { x.classList.remove("active-page"); });
    document.querySelectorAll(".nav-item").forEach(function (x) { x.classList.remove("active"); });
    const target = document.getElementById("page-" + page);
    if (target) target.classList.add("active-page");
    const nav = document.querySelector('.nav-item[data-page="' + page + '"]');
    if (nav) nav.classList.add("active");
    const title = document.getElementById("pageTitle");
    if (title) title.textContent = { dashboard: "Dashboard", internal: "Internal", external: "External" }[page] || "Dashboard";

    if (page === "internal") {
        if (internalRawData.length === 0) loadInternalData();
        else renderInternalCurrentState();
    }
    if (page === "external") {
        if (externalRawData.length === 0) loadExternalData();
        else renderExternalCurrentState();
    }
}

function logoutAdmin() {
    sessionStorage.removeItem("magang3_admin_logged_in");
    window.location.href = "login.html";
}

function handlePageRefresh() {
    const active = document.querySelector(".page.active-page");
    if (!active) return;
    if (active.id === "page-internal") refreshInternalData();
    else if (active.id === "page-external") refreshExternalData();
    else showToast("Tidak ada data untuk di-refresh.", "info");
}

// ============================================================
// LOAD DATA
// ============================================================
function loadInternalData() {
    setRefreshButton(true);
    updateInternalStatus("Mengambil data...");
    fetchData("read", function (err, data) {
        setRefreshButton(false);
        if (err) {
            updateInternalStatus("Gagal mengambil data");
            showErrorPopup("Gagal", err.message);
            return;
        }
        try {
            internalRawData = data;
            internalData = aggregateStockData(data);
            filteredInternalData = [...internalData];
            populateLocation(internalData, "internal");
            renderInternalCurrentState();
            updateInternalStatus("Data Internal terhubung (" + internalData.length + " material)");
            updateUpdatedAt();
            showToast("Data Internal dimuat.", "success");
        } catch (e) {
            console.error(e);
            showErrorPopup("Gagal", e.message);
        }
    });
}

function refreshInternalData() {
    internalRawData = []; internalData = []; filteredInternalData = [];
    loadInternalData();
}

function loadExternalData() {
    setRefreshButton(true);
    updateExternalStatus("Mengambil data External...");
    fetchData("read_external", function (err, data) {
        setRefreshButton(false);
        if (err) {
            updateExternalStatus("Gagal mengambil data External");
            showErrorPopup("Gagal", err.message);
            return;
        }
        try {
            externalRawData = data;
            externalData = aggregateStockData(data);
            filteredExternalData = [...externalData];
            populateLocation(externalData, "external");
            renderExternalCurrentState();
            updateExternalStatus("Data External terhubung (" + externalData.length + " material)");
            updateUpdatedAt();
            showToast("Data External dimuat.", "success");
        } catch (e) {
            console.error(e);
            showErrorPopup("Gagal", e.message);
        }
    });
}

function refreshExternalData() {
    externalRawData = []; externalData = []; filteredExternalData = [];
    loadExternalData();
}

// ============================================================
// FETCH HELPER (JSONP)
// ============================================================
function fetchData(action, callback) {
    const cb = "handleFetch_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
    const sid = "fetchScript_" + Date.now();
    let finished = false;
    const cleanup = function () {
        try { delete window[cb]; } catch (e) {}
        const s = document.getElementById(sid); if (s) s.remove();
    };
    const to = setTimeout(function () {
        if (finished) return;
        finished = true;
        cleanup();
        callback(new Error("Server tidak merespons (timeout 20s)."));
    }, 20000);

    window[cb] = function (data) {
        if (finished) return;
        finished = true;
        clearTimeout(to);
        cleanup();
        if (data && !Array.isArray(data) && data.success === false) {
            callback(new Error(data.error || "API error"));
            return;
        }
        if (!Array.isArray(data)) {
            callback(new Error("Format data tidak valid."));
            return;
        }
        callback(null, data);
    };

    const url = INTERNAL_API_URL + (INTERNAL_API_URL.includes("?") ? "&" : "?") +
        "action=" + encodeURIComponent(action) +
        "&callback=" + encodeURIComponent(cb) +
        "&t=" + Date.now();

    const script = document.createElement("script");
    script.id = sid;
    script.async = true;
    script.src = url;
    script.onerror = function () {
        if (finished) return;
        finished = true;
        clearTimeout(to);
        cleanup();
        callback(new Error("Google Apps Script tidak dapat dihubungi."));
    };
    document.body.appendChild(script);
}

// ============================================================
// HELPERS
// ============================================================
function cleanKey(k) { return String(k).trim().toLowerCase().replace(/[\s_.\-]/g, ""); }

function getRowValue(row, keys) {
    if (!row) return "";
    if (!Array.isArray(row)) {
        const wanted = keys.filter(function (k) { return typeof k === "string"; }).map(cleanKey);
        for (const key of Object.keys(row)) {
            if (wanted.includes(cleanKey(key))) {
                const v = row[key];
                if (v !== undefined && v !== null) return v;
            }
        }
    }
    return "";
}

function normalizeValue(v) { return String(v ?? "").trim(); }

function parseJumlah(val) {
    if (val === null || val === undefined || val === "") return 0;
    if (typeof val === "number") return isNaN(val) ? 0 : val;
    let s = String(val).trim().replace(/\s/g, "");
    if (!s || s === "-") return 0;
    if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
    else if (s.includes(",")) {
        const p = s.split(",");
        if (p.length === 2 && p[1].length === 3 && /^\d+$/.test(p[1])) s = p[0] + p[1];
        else s = s.replace(",", ".");
    } else if (s.includes(".")) {
        const p = s.split(".");
        if (p.length > 2) s = p.join("");
        else if (p.length === 2 && p[1].length === 3 && /^\d+$/.test(p[1])) s = p[0] + p[1];
    }
    const n = Number(s);
    return isNaN(n) ? 0 : n;
}

function parseSerials(raw) {
    let list = [];
    if (Array.isArray(raw)) list = raw.map(function (s) { return String(s).trim(); });
    else if (raw !== undefined && raw !== null && raw !== "") {
        list = String(raw).split(/[,;\n]/).map(function (s) { return s.trim(); });
    }
    return list.filter(function (s) { return s && s !== "-"; });
}

function readRow(row, index) {
    const material    = normalizeValue(getRowValue(row, ["material", "Material"]));
    const description = normalizeValue(getRowValue(row, ["description", "Description", "Deskripsi"]));
    const batch       = normalizeValue(getRowValue(row, ["batch", "Batch"]));
    const plant       = normalizeValue(getRowValue(row, ["plant", "Plant"]));
    const location    = normalizeValue(getRowValue(row, ["storeLocation", "Stor. Location", "Store Location", "Lokasi", "location"]));
    const categoryRaw = normalizeValue(getRowValue(row, ["category", "Category", "Kategori"]));
    const serials     = parseSerials(getRowValue(row, ["serialNumbers", "serialNumber", "Serial number", "SN", "serial"]));
    const keterangan  = normalizeValue(getRowValue(row, ["keterangan", "Keterangan", "ket", "catatan", "note"]));

    const qtyRaw = getRowValue(row, ["quantity", "Quantity", "Jumlah", "jumlah", "Qty"]);
    let jumlah;
    if (qtyRaw === "" || qtyRaw === undefined || qtyRaw === null) {
        jumlah = serials.length;
    } else {
        jumlah = parseJumlah(qtyRaw);
    }

    const sheet    = normalizeValue(getRowValue(row, ["_sheet", "sheet", "sheetName"]));
    const sheetRow = Number(getRowValue(row, ["_sheetRow", "sheetRow"])) || (index + 2);

    return {
        material, description, batch, plant, location,
        categoryRaw, serials,
        serial: serials.length ? serials.join(",") : "-",
        jumlah, keterangan,
        sheet, sheetRow
    };
}

function getCategory(categoryRaw, description, material) {
    const text = (String(description || "") + " " + String(material || "")).toLowerCase();
    if (/\bfoc\b/.test(text) ||
        text.indexOf("kabel") !== -1 ||
        text.indexOf("fiber optic") !== -1 ||
        text.indexOf("fiber-optic") !== -1 ||
        text.indexOf("adss") !== -1 ||
        text.indexOf("drop wire") !== -1 ||
        text.indexOf("dropwire") !== -1) {
        return "FOC";
    }
    return "FOT";
}

function aggregateStockData(data) {
    const grouped = new Map();
    data.forEach(function (raw, index) {
        const r = readRow(raw, index);
        const category = getCategory(r.categoryRaw, r.description, r.material);
        const key = r.material + "||" + r.location;

        if (!grouped.has(key)) {
            grouped.set(key, {
                material: r.material, description: r.description,
                batch: r.batch, plant: r.plant, location: r.location,
                category: category, jumlah: 0, serials: [], sourceRows: []
            });
        }
        const item = grouped.get(key);
        item.jumlah += r.jumlah;
        r.serials.forEach(function (s) {
            if (!item.serials.includes(s)) item.serials.push(s);
        });
        item.sourceRows.push({
            sheet: r.sheet, sheetRow: r.sheetRow,
            material: r.material, description: r.description,
            batch: r.batch, plant: r.plant, location: r.location,
            serial: r.serial, jumlah: r.jumlah,
            keterangan: r.keterangan,
            category: category
        });
    });
    return [...grouped.values()];
}

// ============================================================
// RENDER INTERNAL
// ============================================================
function renderInternalCurrentState() {
    updateInternalSummary(filteredInternalData);
    updateInternalCategories(filteredInternalData);
    renderInternalTable(filteredInternalData);
}

function updateInternalSummary(data) {
    const mats = new Set(), locs = new Set(), active = new Set();
    let total = 0;
    data.forEach(function (r) {
        const j = Number(r.jumlah) || 0;
        if (r.material) { mats.add(r.material); if (j > 0) active.add(r.material); }
        if (r.location) locs.add(r.location);
        total += j;
    });
    setText("internalTotalMaterial", formatNumber(mats.size));
    setText("internalTotalStock", formatNumber(total));
    setText("internalTotalLocation", formatNumber(locs.size));
    setText("internalActiveMaterial", formatNumber(active.size));
}

function updateInternalCategories(data) {
    let fot = 0, foc = 0;
    data.forEach(function (r) {
        const j = Number(r.jumlah) || 0;
        if (r.category === "FOC") foc += j; else fot += j;
    });
    setText("internalFotStock", fot > 0 ? formatNumber(fot) : "—");
    setText("internalFocStock", foc > 0 ? formatNumber(foc) : "—");
    setText("internalNonSfpStock", "—");
}

function filterInternalData() {
    const si = document.getElementById("internalSearch");
    const sl = document.getElementById("internalLocation");
    const s = si ? si.value.toLowerCase().trim() : "";
    const loc = sl ? sl.value : "";
    filteredInternalData = internalData.filter(function (r) {
        const mat = String(r.material || "").toLowerCase();
        const desc = String(r.description || "").toLowerCase();
        const sn = (r.serials || []).join(" ").toLowerCase();
        const okS = !s || mat.indexOf(s) >= 0 || desc.indexOf(s) >= 0 || sn.indexOf(s) >= 0;
        const okL = !loc || String(r.location || "") === loc;
        return okS && okL;
    });
    renderInternalCurrentState();
}

function renderInternalTable(data) {
    const tb = document.getElementById("internalTableBody");
    if (!tb) return;
    if (!data.length) {
        tb.innerHTML = '<tr><td colspan="10" class="empty-row">Tidak ada data.</td></tr>';
        return;
    }
    tb.innerHTML = data.map(function (r, i) {
        const n = r.serials ? r.serials.length : 0;
        const badge = n > 0 ? '<span class="sn-badge">' + n + ' SN</span>' : '<span class="sn-badge none">-</span>';
        return '<tr>' +
            '<td>' + (i + 1) + '</td>' +
            '<td><strong>' + escapeHtml(r.material || "—") + '</strong></td>' +
            '<td>' + escapeHtml(r.description || "—") + '</td>' +
            '<td>' + escapeHtml(r.batch || "—") + '</td>' +
            '<td>' + escapeHtml(r.plant || "—") + '</td>' +
            '<td>' + escapeHtml(r.location || "—") + '</td>' +
            '<td>' + escapeHtml(r.category || "—") + '</td>' +
            '<td><strong>' + formatNumber(r.jumlah || 0) + '</strong></td>' +
            '<td>' + badge + '</td>' +
            '<td style="white-space:nowrap;">' +
                '<button type="button" class="detail-btn" onclick="showInternalDetail(' + i + ')">Detail</button>' +
                '<button type="button" class="add-row-btn" title="Tambah SN / Stock" onclick="showAddStockModal(' + i + ', \'internal\')">+</button>' +
            '</td>' +
            '</tr>';
    }).join("");
}

// ============================================================
// RENDER EXTERNAL
// ============================================================
function renderExternalCurrentState() {
    updateExternalSummary(filteredExternalData);
    updateExternalCategories(filteredExternalData);
    renderExternalTable(filteredExternalData);
}

function updateExternalSummary(data) {
    const mats = new Set(), locs = new Set(), active = new Set();
    let total = 0;
    data.forEach(function (r) {
        const j = Number(r.jumlah) || 0;
        if (r.material) { mats.add(r.material); if (j > 0) active.add(r.material); }
        if (r.location) locs.add(r.location);
        total += j;
    });
    setText("externalTotalMaterial", formatNumber(mats.size));
    setText("externalTotalStock", formatNumber(total));
    setText("externalTotalLocation", formatNumber(locs.size));
    setText("externalActiveMaterial", formatNumber(active.size));
}

function updateExternalCategories(data) {
    let fot = 0, foc = 0;
    data.forEach(function (r) {
        const j = Number(r.jumlah) || 0;
        if (r.category === "FOC") foc += j; else fot += j;
    });
    setText("externalFotStock", fot > 0 ? formatNumber(fot) : "—");
    setText("externalFocStock", foc > 0 ? formatNumber(foc) : "—");
    setText("externalNonSfpStock", "—");
}

function filterExternalData() {
    const si = document.getElementById("externalSearch");
    const sl = document.getElementById("externalLocation");
    const s = si ? si.value.toLowerCase().trim() : "";
    const loc = sl ? sl.value : "";
    filteredExternalData = externalData.filter(function (r) {
        const mat = String(r.material || "").toLowerCase();
        const desc = String(r.description || "").toLowerCase();
        const sn = (r.serials || []).join(" ").toLowerCase();
        const okS = !s || mat.indexOf(s) >= 0 || desc.indexOf(s) >= 0 || sn.indexOf(s) >= 0;
        const okL = !loc || String(r.location || "") === loc;
        return okS && okL;
    });
    renderExternalCurrentState();
}

function renderExternalTable(data) {
    const tb = document.getElementById("externalTableBody");
    if (!tb) return;
    if (!data.length) {
        tb.innerHTML = '<tr><td colspan="10" class="empty-row">Tidak ada data External.</td></tr>';
        return;
    }
    tb.innerHTML = data.map(function (r, i) {
        const n = r.serials ? r.serials.length : 0;
        const badge = n > 0 ? '<span class="sn-badge">' + n + ' SN</span>' : '<span class="sn-badge none">-</span>';
        return '<tr>' +
            '<td>' + (i + 1) + '</td>' +
            '<td><strong>' + escapeHtml(r.material || "—") + '</strong></td>' +
            '<td>' + escapeHtml(r.description || "—") + '</td>' +
            '<td>' + escapeHtml(r.batch || "—") + '</td>' +
            '<td>' + escapeHtml(r.plant || "—") + '</td>' +
            '<td>' + escapeHtml(r.location || "—") + '</td>' +
            '<td>' + escapeHtml(r.category || "—") + '</td>' +
            '<td><strong>' + formatNumber(r.jumlah || 0) + '</strong></td>' +
            '<td>' + badge + '</td>' +
            '<td style="white-space:nowrap;">' +
                '<button type="button" class="detail-btn" onclick="showExternalDetail(' + i + ')">Detail</button>' +
                '<button type="button" class="add-row-btn" title="Tambah SN / Stock" onclick="showAddStockModal(' + i + ', \'external\')">+</button>' +
            '</td>' +
            '</tr>';
    }).join("");
}

function showExternalDetail(index) {
    const row = filteredExternalData[index];
    if (!row) return;
    showDetailModal(row, "external");
}

// ============================================================
// POPULATE LOCATION
// ============================================================
function populateLocation(data, type) {
    const select = type === "internal"
        ? document.getElementById("internalLocation")
        : document.getElementById("externalLocation");
    if (!select) return;

    const locs = [...new Set(data.map(function (r) { return r.location; }).filter(Boolean))]
        .sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true }); });

    select.innerHTML = '<option value="">Semua Store Location</option>';
    locs.forEach(function (loc) {
        const o = document.createElement("option");
        o.value = loc; o.textContent = loc;
        select.appendChild(o);
    });
}

// ============================================================
// DETAIL MODAL
// ============================================================
function showInternalDetail(index) {
    const row = filteredInternalData[index];
    if (!row) return;
    showDetailModal(row, "internal");
}

function showDetailModal(row, scope) {
    currentDetailRow = row;
    currentDetailScope = scope;

    ensureModal();
    const content = document.getElementById("detailModalContent");
    if (!content) return;

    const isFOC = row.category === "FOC";
    const srcRows = row.sourceRows || [];
    const scopeLabel = scope === "external" ? "External" : "Internal";

    const labelStyle = 'display:block;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;';
    const readOnlyInput = 'width:100%;padding:9px 12px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;color:#1a1a2e;font:inherit;font-size:13px;font-weight:500;outline:none;';

    if (!isFOC) {
        let totalAktif = 0;
        srcRows.forEach(function (s) {
            const j = Number(s.jumlah) || 0;
            if (j > 0) totalAktif += j;
        });

        const rowsHtml = srcRows.map(function (s, i) {
            const jml = Number(s.jumlah) || 0;
            const isZero = jml === 0;
            const jmlInput = 'width:100%;padding:7px 10px;border:1px solid ' + (isZero ? '#fecaca' : '#cbd5e1') + ';border-radius:6px;background:' + (isZero ? '#fef2f2' : '#fff') + ';color:#1a1a2e;font:inherit;font-size:13px;font-weight:600;outline:none;text-align:center;';
            const ketInput = 'width:100%;padding:7px 10px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:#1a1a2e;font:inherit;font-size:13px;outline:none;';
            return '<tr style="border-bottom:1px solid #f1f5f9;">' +
                '<td style="padding:12px 14px;text-align:center;color:#64748b;font-weight:600;font-size:13px;">' + (i + 1) + '</td>' +
                '<td style="padding:12px 14px;"><span style="font-family:monospace;font-size:13px;font-weight:600;color:#1a1a2e;word-break:break-all;">' + escapeHtml(s.serial || "-") + '</span></td>' +
                '<td style="padding:12px 14px;width:120px;"><input id="snJml_' + i + '" type="number" min="0" step="1" value="' + jml + '" style="' + jmlInput + '"></td>' +
                '<td style="padding:12px 14px;"><input id="snKet_' + i + '" type="text" value="' + escapeAttribute(s.keterangan || "") + '" placeholder="-" style="' + ketInput + '"></td>' +
                '</tr>';
        }).join("");

        content.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">' +
            '<h2 style="font-size:22px;font-weight:700;color:#1a1a2e;">Detail Stock - FOT (' + scopeLabel + ')</h2>' +
            '<button type="button" onclick="closeDetailModal()" style="width:36px;height:36px;border:none;background:#f1f5f9;border-radius:8px;font-size:20px;color:#64748b;cursor:pointer;">×</button>' +
            '</div>' +
            '<div style="margin-bottom:20px;padding:20px 24px;border:1px solid #e2e8f0;border-radius:12px;background:#fafbfc;">' +
            '<div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:14px;">Informasi Material</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px 20px;">' +
            '<div><label style="' + labelStyle + '">Material</label><input type="text" value="' + escapeAttribute(row.material || "") + '" readonly style="' + readOnlyInput + '"></div>' +
            '<div><label style="' + labelStyle + '">Plant</label><input type="text" value="' + escapeAttribute(row.plant || "") + '" readonly style="' + readOnlyInput + '"></div>' +
            '<div style="grid-column:1/-1;"><label style="' + labelStyle + '">Description</label><input type="text" value="' + escapeAttribute(row.description || "") + '" readonly style="' + readOnlyInput + '"></div>' +
            '<div><label style="' + labelStyle + '">Batch</label><input type="text" value="' + escapeAttribute(row.batch || "") + '" readonly style="' + readOnlyInput + '"></div>' +
            '<div><label style="' + labelStyle + '">Store Location</label><input type="text" value="' + escapeAttribute(row.location || "") + '" readonly style="' + readOnlyInput + '"></div>' +
            '<div><label style="' + labelStyle + '">Category</label><input type="text" value="' + escapeAttribute(row.category || "") + '" readonly style="' + readOnlyInput + '"></div>' +
            '</div>' +
            '</div>' +
            '<div style="margin-bottom:20px;padding:20px 24px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px;">' +
            '<div style="display:flex;align-items:center;gap:10px;">' +
            '<span style="font-size:18px;color:#2563eb;">☰</span>' +
            '<h3 style="font-size:16px;font-weight:700;color:#1a1a2e;">Serial Number</h3>' +
            '</div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
            '<span style="font-size:12px;font-weight:600;color:#475569;background:#eff6ff;padding:5px 12px;border-radius:8px;">Total SN: ' + srcRows.length + '</span>' +
            '<span style="font-size:12px;font-weight:600;color:#166534;background:#f0fdf4;padding:5px 12px;border-radius:8px;">Total Jumlah: ' + totalAktif + '</span>' +
            '</div>' +
            '</div>' +
            (srcRows.length === 0
                ? '<div style="padding:20px;text-align:center;color:#94a3b8;font-size:13px;">Tidak ada Serial Number.</div>'
                : '<div style="overflow-x:auto;border:1px solid #e2e8f0;border-radius:10px;">' +
                  '<table style="width:100%;border-collapse:collapse;min-width:600px;">' +
                  '<thead><tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;">' +
                  '<th style="padding:10px 14px;text-align:center;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;width:50px;">No</th>' +
                  '<th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Serial Number</th>' +
                  '<th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;width:120px;">Jumlah</th>' +
                  '<th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Keterangan</th>' +
                  '</tr></thead>' +
                  '<tbody>' + rowsHtml + '</tbody>' +
                  '</table>' +
                  '</div>' +
                  '<div style="font-size:11px;color:#94a3b8;margin-top:10px;">Jumlah & Keterangan bisa diedit. SN tidak dihapus meski jumlah = 0.</div>'
            ) +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding-top:16px;border-top:1px solid #f1f5f9;flex-wrap:wrap;">' +
            '<div style="font-size:12px;color:#64748b;">Semua perubahan akan disimpan ke Google Sheet.</div>' +
            '<div style="display:flex;gap:8px;">' +
            '<button type="button" onclick="closeDetailModal()" style="padding:10px 22px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;color:#475569;">Batal</button>' +
            '<button type="button" onclick="simpanSemuaSNFOT(\'' + scope + '\')" style="padding:10px 22px;background:#2563eb;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:13px;">Simpan Perubahan</button>' +
            '</div>' +
            '</div>';
    } else {
        const eyebrow = 'font-size:10px;font-weight:700;color:#2563eb;text-transform:uppercase;letter-spacing:0.1em;';
        const input = 'width:100%;padding:9px 12px;border:1px solid #d7e1ec;border-radius:8px;font:inherit;font-size:13px;outline:none;';

        let bodyHtml =
            '<div style="margin-top:16px;padding:16px;border:1px solid #e5ebf2;border-radius:10px;background:#fbfcfe;">' +
            '<div style="' + eyebrow + 'color:#71839b;margin-bottom:12px;">BARANG KELUAR (FOC)</div>' +
            '<div style="margin-bottom:10px;">' +
            '<span style="' + labelStyle + '">Pilih Baris Sumber</span>' +
            '<select id="focSourceRow" style="' + input + 'margin-top:4px;background:#fff;">' +
            srcRows.map(function (s, i) {
                return '<option value="' + i + '">Baris ' + (i + 1) +
                    (s.serial && s.serial !== "-" ? ' — ' + escapeHtml(s.serial) : '') +
                    ' — Stok: ' + formatNumber(s.jumlah) + ' m</option>';
            }).join("") +
            '</select>' +
            '</div>' +
            '<div style="margin-bottom:10px;">' +
            '<span style="' + labelStyle + '">Jumlah keluar (meter)</span>' +
            '<input id="focKeluar" type="number" min="0.01" step="0.01" placeholder="Contoh: 350" style="' + input + 'margin-top:4px;">' +
            '</div>' +
            '<div style="margin-bottom:12px;">' +
            '<span style="' + labelStyle + '">Keterangan</span>' +
            '<input id="focKet" type="text" placeholder="Contoh: gangguanPA K210260088" style="' + input + 'margin-top:4px;">' +
            '</div>' +
            '<div style="font-size:11px;color:#64748b;margin-bottom:12px;">' +
            'Stok akan berkurang pada baris yang dipilih. Format keterangan: <strong>kode(jumlahKeluar)</strong>.' +
            '</div>' +
            '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
            '<button type="button" onclick="closeDetailModal()" style="padding:10px 22px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;">Batal</button>' +
            '<button type="button" onclick="simpanPengeluaranFOC(\'' + scope + '\')" style="padding:10px 22px;background:#2563eb;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:13px;">Simpan</button>' +
            '</div>' +
            '</div>';

        if (srcRows.length > 0) {
            bodyHtml += '<div style="margin-top:20px;">' +
                '<div style="' + eyebrow + 'margin-bottom:8px;">BARIS SUMBER (referensi)</div>' +
                srcRows.map(function (s, i) {
                    const ket = s.keterangan ? ' — <em style="color:#64748b;">' + escapeHtml(s.keterangan) + '</em>' : '';
                    return '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:12px;">' +
                        '<span>Baris ' + (i + 1) + (s.serial && s.serial !== "-" ? ' — ' + escapeHtml(s.serial) : '') + ket + '</span>' +
                        '<strong>' + formatNumber(s.jumlah) + ' m</strong>' +
                        '</div>';
                }).join("") + '</div>';
        }

        content.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">' +
            '<div><span style="' + eyebrow + '">DETAIL STOCK - FOC (' + scopeLabel + ')</span>' +
            '<h3 style="font-size:18px;font-weight:700;color:#1a1a2e;margin:4px 0 0;">' + escapeHtml(row.material || "—") + '</h3></div>' +
            '<button type="button" onclick="closeDetailModal()" style="width:36px;height:36px;border:none;background:#f1f5f9;border-radius:8px;font-size:20px;color:#64748b;cursor:pointer;">×</button>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:140px 1fr;gap:10px 16px;margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid #f1f5f9;">' +
            '<div><span style="' + labelStyle + '">Material</span><strong>' + escapeHtml(row.material || "—") + '</strong></div>' +
            '<div><span style="' + labelStyle + '">Store Location</span><strong>' + escapeHtml(row.location || "—") + '</strong></div>' +
            '<div style="grid-column:1/-1;"><span style="' + labelStyle + '">Description</span><strong>' + escapeHtml(row.description || "—") + '</strong></div>' +
            '<div><span style="' + labelStyle + '">Batch</span><strong>' + escapeHtml(row.batch || "—") + '</strong></div>' +
            '<div><span style="' + labelStyle + '">Plant</span><strong>' + escapeHtml(row.plant || "—") + '</strong></div>' +
            '<div><span style="' + labelStyle + '">Category</span><strong>' + escapeHtml(row.category || "—") + '</strong></div>' +
            '<div><span style="' + labelStyle + '">Jumlah Stok</span><strong style="font-size:24px;font-weight:800;color:#2563eb;">' + formatNumber(row.jumlah || 0) + ' m</strong></div>' +
            '</div>' + bodyHtml;
    }

    document.getElementById("detailModal").classList.add("show");
}

// ============================================================
// TAMBAH STOCK BARU
// ============================================================
function showAddStockModal(prefillIndex, scope) {
    scope = scope || "internal";
    ensureModal();
    const content = document.getElementById("detailModalContent");
    if (!content) return;

    const sourceArr = scope === "external" ? filteredExternalData : filteredInternalData;

    let prefill = {
        sheet: "",
        material: "",
        description: "",
        batch: "",
        plant: "",
        location: ""
    };
    if (typeof prefillIndex === "number" && sourceArr[prefillIndex]) {
        const row = sourceArr[prefillIndex];
        prefill.sheet = (row.sourceRows && row.sourceRows.length) ? (row.sourceRows[0].sheet || "") : "";
        prefill.material = row.material || "";
        prefill.description = row.description || "";
        prefill.batch = row.batch || "";
        prefill.plant = row.plant || "";
        prefill.location = row.location || "";
    }

    const labelStyle = 'display:block;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;';
    const inputStyle = 'width:100%;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;font:inherit;font-size:13px;outline:none;background:#fff;color:#1a1a2e;';
    const eyebrow = 'font-size:10px;font-weight:700;color:#2563eb;text-transform:uppercase;letter-spacing:0.1em;';

    const field = function (id, label, placeholder, value, type) {
        return '<div style="margin-bottom:12px;">' +
            '<label style="' + labelStyle + '">' + label + '</label>' +
            '<input id="' + id + '" type="' + (type || "text") + '" ' +
            (type === "number" ? 'min="0" step="1" ' : '') +
            'placeholder="' + (placeholder || "") + '" ' +
            'value="' + escapeAttribute(value || "") + '" style="' + inputStyle + '">' +
            '</div>';
    };

    let options = "";
    if (scope === "external") {
        const isFoc = prefill.sheet && prefill.sheet.toLowerCase().indexOf("foc") >= 0;
        options =
            '<option value="EKSTERNAL FOT"' + (!isFoc ? ' selected' : '') + '>EKSTERNAL FOT</option>' +
            '<option value="EKSTERNAL FOC"' + (isFoc ? ' selected' : '') + '>EKSTERNAL FOC</option>';
    } else {
        const isFoc = prefill.sheet && prefill.sheet.toLowerCase().indexOf("foc") >= 0;
        options =
            '<option value="INTERNAL FOT"' + (!isFoc ? ' selected' : '') + '>INTERNAL FOT</option>' +
            '<option value="INTERNAL FOC"' + (isFoc ? ' selected' : '') + '>INTERNAL FOC</option>';
    }

    content.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">' +
        '<h2 style="font-size:20px;font-weight:700;color:#1a1a2e;">Tambah Stock Baru</h2>' +
        '<button type="button" onclick="closeDetailModal()" style="width:36px;height:36px;border:none;background:#f1f5f9;border-radius:8px;font-size:20px;color:#64748b;cursor:pointer;">×</button>' +
        '</div>' +

        (prefill.material
            ? '<div style="padding:12px 16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;margin-bottom:16px;font-size:12px;color:#1e40af;">' +
              'Menambah SN/stock untuk material <strong>' + escapeHtml(prefill.material) + '</strong>.' +
              '</div>'
            : '') +

        '<div style="padding:16px;border:1px solid #e5ebf2;border-radius:10px;background:#fbfcfe;margin-bottom:16px;">' +
        '<div style="' + eyebrow + 'color:#71839b;margin-bottom:12px;">PILIH TAB TUJUAN</div>' +
        '<select id="addSheet" style="' + inputStyle + '">' + options + '</select>' +
        '</div>' +

        '<div style="padding:16px;border:1px solid #e5ebf2;border-radius:10px;background:#fff;">' +
        '<div style="' + eyebrow + 'color:#71839b;margin-bottom:12px;">DATA MATERIAL</div>' +
        field("addMaterial", "Material *", "Contoh: 1002110056", prefill.material) +
        field("addDescription", "Description", "Contoh: GPON,ONT 4*GE+2*POTS+USB,,RAISECOM", prefill.description) +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
        field("addBatch", "Batch", "Contoh: BAIK", prefill.batch) +
        field("addPlant", "Plant", "Contoh: 2010", prefill.plant) +
        '</div>' +
        field("addLocation", "Store Location", "Contoh: 10", prefill.location) +
        field("addSerial", "Serial Number", "Pisah dengan koma jika banyak SN", "") +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
        field("addJumlah", "Jumlah", "Contoh: 1 atau 4000", "", "number") +
        field("addKeterangan", "Keterangan", "Contoh: stok baru", "") +
        '</div>' +
        '</div>' +

        '<div style="display:flex;gap:8px;justify-content:flex-end;padding-top:16px;border-top:1px solid #f1f5f9;margin-top:16px;">' +
        '<button type="button" onclick="closeDetailModal()" style="padding:10px 22px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;color:#475569;">Batal</button>' +
        '<button type="button" onclick="simpanDataBaru(\'' + scope + '\')" style="padding:10px 22px;background:#2563eb;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:13px;">Simpan Stock</button>' +
        '</div>';

    document.getElementById("detailModal").classList.add("show");
}

function simpanDataBaru(scope) {
    const getVal = function (id) {
        const el = document.getElementById(id);
        return el ? String(el.value || "").trim() : "";
    };

    const sheet = getVal("addSheet");
    const material = getVal("addMaterial");
    const description = getVal("addDescription");
    const batch = getVal("addBatch");
    const plant = getVal("addPlant");
    const location = getVal("addLocation");
    const serial = getVal("addSerial");
    const jumlah = getVal("addJumlah");
    const keterangan = getVal("addKeterangan");

    if (!material) { showErrorPopup("Gagal", "Material wajib diisi."); return; }
    if (!sheet) { showErrorPopup("Gagal", "Pilih tab Sheet dulu."); return; }

    setRefreshButton(true);
    callInternalAction({
        action: "create",
        sheet: sheet,
        "Material": material,
        "Description": description,
        "Batch": batch,
        "Plant": plant,
        "Stor. Location": location,
        "Serial number": serial,
        "Jumlah": jumlah || "0",
        "keterangan": keterangan
    }).then(function () {
        closeDetailModal();
        showToast("Stock baru berhasil ditambahkan ke tab " + sheet + ".", "success");
        if (scope === "external") refreshExternalData();
        else refreshInternalData();
    }).catch(function (e) {
        setRefreshButton(false);
        showErrorPopup("Gagal menyimpan", e.message);
    });
}

// ============================================================
// MODAL HELPER
// ============================================================
function ensureModal() {
    let modal = document.getElementById("detailModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "detailModal";
    modal.className = "modal-overlay";
    modal.innerHTML = '<div id="detailModalContent" class="modal-box"></div>';
    document.body.appendChild(modal);
    modal.addEventListener("click", function (e) { if (e.target === modal) closeDetailModal(); });
    return modal;
}

function closeDetailModal() {
    const modal = document.getElementById("detailModal");
    if (modal) modal.classList.remove("show");
    currentDetailRow = null;
}

// ============================================================
// AKSI SIMPAN
// ============================================================
function internalActionUrl(params) {
    const q = Object.keys(params).map(function (k) {
        return encodeURIComponent(k) + "=" + encodeURIComponent(params[k] ?? "");
    }).join("&");
    return INTERNAL_API_URL + (INTERNAL_API_URL.includes("?") ? "&" : "?") + q + "&t=" + Date.now();
}

function callInternalAction(params) {
    return new Promise(function (resolve, reject) {
        const cb = "handleAction_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
        const sid = "actionScript_" + Date.now();
        let finished = false;
        const cleanup = function () {
            try { delete window[cb]; } catch (e) {}
            const s = document.getElementById(sid); if (s) s.remove();
        };
        const to = setTimeout(function () {
            if (finished) return;
            finished = true;
            cleanup();
            reject(new Error("Server tidak merespons."));
        }, 20000);
        window[cb] = function (data) {
            if (finished) return;
            finished = true;
            clearTimeout(to);
            cleanup();
            if (data && data.success === false) { reject(new Error(data.error || "Operasi gagal.")); return; }
            resolve(data);
        };
        const script = document.createElement("script");
        script.id = sid;
        script.async = true;
        script.src = internalActionUrl(Object.assign({}, params, { callback: cb }));
        script.onerror = function () {
            if (finished) return;
            finished = true;
            clearTimeout(to);
            cleanup();
            reject(new Error("Google Apps Script tidak dapat dihubungi."));
        };
        document.body.appendChild(script);
    });
}

function afterSave(msg, scope) {
    closeDetailModal();
    showToast(msg, "success");
    if (scope === "external") refreshExternalData();
    else refreshInternalData();
}

function simpanSemuaSNFOT(scope) {
    const row = currentDetailRow;
    if (!row || !row.sourceRows || !row.sourceRows.length) {
        showErrorPopup("Gagal", "Tidak ada baris sumber.");
        return;
    }
    const changes = [];
    row.sourceRows.forEach(function (s, i) {
        const jmlEl = document.getElementById("snJml_" + i);
        const ketEl = document.getElementById("snKet_" + i);
        if (!jmlEl || !ketEl) return;
        const newJml = Number(jmlEl.value);
        const newKet = String(ketEl.value || "");
        const oldJml = Number(s.jumlah) || 0;
        const oldKet = String(s.keterangan || "");
        if (!(newJml >= 0)) { changes.push({ error: "Baris #" + (i + 1) + ": Jumlah tidak valid." }); return; }
        if (newJml !== oldJml || newKet !== oldKet) changes.push({ src: s, jumlah: newJml, keterangan: newKet });
    });
    const errors = changes.filter(function (c) { return c.error; });
    const validChanges = changes.filter(function (c) { return !c.error; });
    if (errors.length) { showErrorPopup("Ada error", errors.map(function (e) { return e.error; }).join("\n")); return; }
    if (!validChanges.length) { showToast("Tidak ada perubahan untuk disimpan.", "info"); return; }

    setRefreshButton(true);
    let done = 0, failed = [];
    function next() {
        if (done >= validChanges.length) {
            setRefreshButton(false);
            if (failed.length) showErrorPopup("Sebagian gagal disimpan", failed.join("\n"));
            else afterSave("Berhasil menyimpan " + validChanges.length + " perubahan.", scope);
            return;
        }
        const c = validChanges[done];
        callInternalAction({
            action: "update", sheet: c.src.sheet || "", row: c.src.sheetRow,
            "Jumlah": String(c.jumlah), "keterangan": c.keterangan
        }).then(function () { done++; next(); })
        .catch(function (err) { failed.push("Baris #" + c.src.sheetRow + ": " + err.message); done++; next(); });
    }
    next();
}

function simpanPengeluaranFOC(scope) {
    const row = currentDetailRow;
    if (!row) { showErrorPopup("Gagal", "Data tidak ditemukan. Coba buka ulang Detail."); return; }
    if (!row.sourceRows || !row.sourceRows.length) { showErrorPopup("Gagal", "Data sumber tidak ada."); return; }

    const srcEl = document.getElementById("focSourceRow");
    const keluarEl = document.getElementById("focKeluar");
    const ketEl = document.getElementById("focKet");
    const srcIdx = srcEl ? Number(srcEl.value) : -1;
    const keluar = Number(keluarEl ? keluarEl.value : 0);
    const newKet = String(ketEl ? ketEl.value : "").trim();

    if (!(srcIdx >= 0) || !row.sourceRows[srcIdx]) { showErrorPopup("Gagal", "Pilih baris sumber dulu."); return; }
    if (!(keluar > 0)) { showErrorPopup("Gagal", "Masukkan jumlah meter > 0."); return; }

    const target = row.sourceRows[srcIdx];
    const current = Number(target.jumlah) || 0;
    if (keluar > current) { showErrorPopup("Gagal", "Jumlah keluar (" + keluar + " m) melebihi stok (" + current + " m)."); return; }

    const sisa = current - keluar;
    const entry = newKet ? newKet + "(" + formatNumber(keluar) + ")" : "(" + formatNumber(keluar) + " m)";
    const oldKet = String(target.keterangan || "").trim();
    const gabungKet = oldKet ? oldKet + " | " + entry : entry;

    setRefreshButton(true);
    callInternalAction({
        action: "update", sheet: target.sheet || "", row: target.sheetRow,
        "Jumlah": String(sisa), "keterangan": gabungKet
    }).then(function () {
        afterSave("Stok baris #" + target.sheetRow + " berkurang " + formatNumber(keluar) + " m. Sisa: " + formatNumber(sisa) + " m.", scope);
    }).catch(function (e) {
        setRefreshButton(false);
        showErrorPopup("Gagal menyimpan", e.message);
    });
}

// ============================================================
// UI HELPERS
// ============================================================
function showErrorPopup(title, message) {
    let m = document.getElementById("errorModal");
    if (!m) {
        m = document.createElement("div");
        m.id = "errorModal";
        m.className = "modal-overlay";
        m.innerHTML = '<div class="modal-box" style="background:#fff;border-radius:14px;width:100%;max-width:400px;padding:24px;text-align:center;box-shadow:0 25px 80px rgba(15,23,42,0.3);">' +
            '<div style="font-size:48px;color:#ef4444;margin-bottom:16px;">!</div>' +
            '<h3 id="errorModalTitle" style="font-size:18px;font-weight:700;color:#1a1a2e;margin-bottom:8px;"></h3>' +
            '<p id="errorModalMessage" style="font-size:14px;color:#64748b;margin-bottom:20px;line-height:1.5;"></p>' +
            '<button type="button" onclick="closeErrorModal()" style="padding:10px 20px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;">Tutup</button>' +
            '</div>';
        document.body.appendChild(m);
        m.addEventListener("click", function (e) { if (e.target === m) closeErrorModal(); });
    }
    document.getElementById("errorModalTitle").textContent = title;
    document.getElementById("errorModalMessage").textContent = message;
    m.classList.add("show");
}
function closeErrorModal() {
    const m = document.getElementById("errorModal");
    if (m) m.classList.remove("show");
}
function updateInternalStatus(s) { const el = document.getElementById("internalApiStatus"); if (el) el.textContent = s; }
function updateExternalStatus(s) { const el = document.getElementById("externalApiStatus"); if (el) el.textContent = s; }
function setRefreshButton(l) { const b = document.getElementById("refreshBtn"); if (b) { b.disabled = l; b.classList.toggle("is-loading", l); } }
function updateUpdatedAt() {
    const el = document.getElementById("updatedAt");
    if (el) el.textContent = "Diperbarui " + new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}
function showToast(msg, type) {
    type = type || "success";
    const old = document.getElementById("toast"); if (old) old.remove();
    const t = document.createElement("div");
    t.id = "toast";
    t.style.cssText = "position:fixed;top:20px;right:20px;z-index:10000;min-width:280px;padding:12px 16px;border-radius:10px;background:#fff;border:1px solid #e2e8f0;box-shadow:0 8px 24px rgba(15,23,42,0.15);font-size:13px;font-weight:500;color:#1a1a2e;transition:all 0.3s ease;";
    document.body.appendChild(t);
    t.textContent = msg;
    t.style.borderLeft = type === "success" ? "4px solid #22c55e" : type === "error" ? "4px solid #ef4444" : "4px solid #2563eb";
    setTimeout(function () { t.style.opacity = "0"; t.style.transform = "translateX(20px)"; setTimeout(function () { t.remove(); }, 300); }, 3500);
}
function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
function formatNumber(v) { return (Number(v) || 0).toLocaleString("id-ID"); }
function escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
function escapeAttribute(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }