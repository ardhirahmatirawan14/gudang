// ============================================================
// MAGANG3 — INVENTORY MONITORING
// app.js — v26.1 FINAL
// - 3 kolom baru History: status dokumen, nomor reservasi, nomor GI
// - Modal Detail History + Edit Dokumen
// - Status otomatis: Belum Reservasi / Belum GI / Sudah Selesai
// ============================================================

const INTERNAL_API_URL = "https://script.google.com/macros/s/AKfycbwtyMixbr4h1RSFmihFQACX_eRcL_eLpC1iOUnP8EZBAcjl3Kw3THPkbR3avTh5_KSsjQ/exec";

let internalRawData = [];
let internalData = [];
let filteredInternalData = [];

let externalRawData = [];
let externalData = [];
let filteredExternalData = [];

let historyInternalData = [];
let historyExternalData = [];

let currentDetailRow = null;
let currentDetailScope = "internal";

let currentHistoryRow = null;
let currentHistoryScope = "internal";
let currentHistoryIndex = -1;

let currentSearchResults = [];

// ============================================================
// 🔐 AUTH GUARD
// ============================================================
(function authGuard() {
    const isLoggedInLocal = localStorage.getItem("inventory_logged_in") === "true";
    const isLoggedInSession = sessionStorage.getItem("magang3_admin_logged_in") === "true";

    if (!isLoggedInLocal && !isLoggedInSession) {
        window.location.replace("login.html");
        return;
    }

    if (isLoggedInLocal) {
        const role = localStorage.getItem("inventory_role") || "user";
        const token = localStorage.getItem("inventory_token") || "";
        const name = localStorage.getItem("inventory_name") || (role === "admin" ? "Admin" : "User");
        const username = localStorage.getItem("inventory_username") || "";

        sessionStorage.setItem("magang3_admin_logged_in", "true");
        sessionStorage.setItem("magang3_admin_role", role);
        sessionStorage.setItem("magang3_admin_token", token);
        sessionStorage.setItem("magang3_admin_username", username);
        if (!sessionStorage.getItem("magang3_admin_name")) {
            sessionStorage.setItem("magang3_admin_name", name);
        }
    }

    if (!sessionStorage.getItem("magang3_admin_token")) {
        sessionStorage.removeItem("magang3_admin_logged_in");
        localStorage.removeItem("inventory_logged_in");
        window.location.replace("login.html");
    }
})();

// ============================================================
// ROLE HELPERS
// ============================================================
function getRole() {
    return sessionStorage.getItem("magang3_admin_role")
        || localStorage.getItem("inventory_role")
        || "user";
}
function isAdmin() { return getRole() === "admin"; }
function getToken() {
    return sessionStorage.getItem("magang3_admin_token")
        || localStorage.getItem("inventory_token")
        || "";
}
function requireAdminFrontend() {
    if (!isAdmin()) {
        showErrorPopup("⛔ Akses Ditolak", "Hanya Admin yang bisa melakukan aksi ini.");
        return false;
    }
    return true;
}
function forceLogoutToLogin(msg) {
    [
        "inventory_logged_in", "inventory_role", "inventory_username",
        "inventory_name", "inventory_token"
    ].forEach(function (k) { localStorage.removeItem(k); });
    [
        "magang3_admin_logged_in", "magang3_admin_token",
        "magang3_admin_username", "magang3_admin_role", "magang3_admin_name"
    ].forEach(function (k) { sessionStorage.removeItem(k); });
    try { alert(msg || "Session berakhir. Silakan login ulang."); } catch (e) {}
    window.location.replace("login.html");
}

// ============================================================
// INIT
// ============================================================
document.addEventListener("DOMContentLoaded", function () {
    document.body.dataset.role = getRole();

    const name = sessionStorage.getItem("magang3_admin_name")
        || localStorage.getItem("inventory_name")
        || (isAdmin() ? "Admin" : "User");
    const roleBadge = document.getElementById("roleBadge");
    const profileName = document.getElementById("profileName");
    const profileRole = document.getElementById("profileRole");
    const profileAvatar = document.getElementById("profileAvatar");
    if (roleBadge) roleBadge.textContent = isAdmin() ? "ADMIN" : "USER";
    if (profileName) profileName.textContent = name;
    if (profileRole) profileRole.textContent = isAdmin() ? "Administrator" : "Viewer";
    if (profileAvatar) profileAvatar.textContent = (name.charAt(0) || "U").toUpperCase();

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

// ============================================================
// LOGOUT
// ============================================================
function logoutAdmin() {
    if (!confirm("Yakin mau keluar dari akun ini?")) return;

    const token = getToken();
    if (token) {
        try {
            const cb = "logoutCb_" + Date.now();
            const sid = "logoutScript_" + Date.now();
            const s = document.createElement("script");
            s.id = sid;
            s.src = INTERNAL_API_URL +
                (INTERNAL_API_URL.includes("?") ? "&" : "?") +
                "action=logout&token=" + encodeURIComponent(token) +
                "&callback=" + encodeURIComponent(cb) + "&t=" + Date.now();
            window[cb] = function () {
                try { delete window[cb]; } catch (e) {}
                const el = document.getElementById(sid); if (el) el.remove();
            };
            document.body.appendChild(s);
        } catch (e) {}
    }

    [
        "inventory_logged_in", "inventory_role", "inventory_username",
        "inventory_name", "inventory_token"
    ].forEach(function (k) { localStorage.removeItem(k); });

    [
        "magang3_admin_logged_in", "magang3_admin_token",
        "magang3_admin_username", "magang3_admin_role", "magang3_admin_name"
    ].forEach(function (k) { sessionStorage.removeItem(k); });

    setTimeout(function () { window.location.replace("login.html"); }, 250);
}

// ============================================================
// PAGE NAVIGATION
// ============================================================
function showPage(page) {
    if (!isAdmin() && page !== "dashboard") {
        showToast("🔒 Halaman ini hanya untuk Admin.", "error");
        page = "dashboard";
    }

    document.querySelectorAll(".page").forEach(function (x) { x.classList.remove("active-page"); });
    document.querySelectorAll(".nav-item").forEach(function (x) { x.classList.remove("active"); });
    const target = document.getElementById("page-" + page);
    if (target) target.classList.add("active-page");
    const nav = document.querySelector('.nav-item[data-page="' + page + '"]');
    if (nav) nav.classList.add("active");

    const titles = {
        dashboard: "Dashboard",
        internal: "Internal",
        external: "External",
        "history-internal": "History Internal",
        "history-external": "History External"
    };
    const title = document.getElementById("pageTitle");
    if (title) title.textContent = titles[page] || "Dashboard";

    if (page === "dashboard") {
        if (internalRawData.length === 0) loadInternalData();
        if (externalRawData.length === 0) loadExternalData();
        renderDashboard();
    }
    if (page === "internal") {
        if (internalRawData.length === 0) loadInternalData();
        else renderInternalCurrentState();
    }
    if (page === "external") {
        if (externalRawData.length === 0) loadExternalData();
        else renderExternalCurrentState();
    }
    if (page === "history-internal") loadHistory("internal");
    if (page === "history-external") loadHistory("external");
}

function handlePageRefresh() {
    const active = document.querySelector(".page.active-page");
    if (!active) return;
    if (active.id === "page-internal") refreshInternalData();
    else if (active.id === "page-external") refreshExternalData();
    else if (active.id === "page-dashboard") { refreshInternalData(); refreshExternalData(); }
    else if (active.id === "page-history-internal") refreshHistory("internal");
    else if (active.id === "page-history-external") refreshHistory("external");
    else showToast("Tidak ada data untuk di-refresh.", "info");
}

// ============================================================
// LOAD DATA (Internal/External)
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
            renderDashboard();
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
            renderDashboard();
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
// LOAD HISTORY
// ============================================================
function loadHistory(scope) {
    setRefreshButton(true);
    const action = scope === "external" ? "read_history_external" : "read_history_internal";
    const statusEl = document.getElementById(scope + "HistoryStatus");
    if (statusEl) statusEl.textContent = "Mengambil data...";

    let _done = false;
    const _safetyTimer = setTimeout(function () {
        if (_done) return;
        _done = true;
        setRefreshButton(false);
        if (statusEl) statusEl.textContent = "Timeout";
        showErrorPopup("Timeout", "Server tidak merespons dalam 22 detik.");
    }, 22000);

    fetchData(action, function (err, data) {
        if (_done) return;
        _done = true;
        clearTimeout(_safetyTimer);
        setRefreshButton(false);

        if (err) {
            if (statusEl) statusEl.textContent = "Gagal: " + String(err.message || "").substring(0, 50);
            showErrorPopup("Gagal Memuat History", err.message);
            return;
        }
        try {
            if (scope === "external") historyExternalData = data;
            else historyInternalData = data;
            renderHistoryTable(scope, data);
            if (statusEl) statusEl.textContent = "Terhubung (" + data.length + " record)";
            updateUpdatedAt();
            if (data.length === 0) {
                showToast("History " + scope + " masih kosong.", "info");
            } else {
                showToast("History " + scope + " dimuat (" + data.length + " record).", "success");
            }
        } catch (e) {
            console.error(e);
            if (statusEl) statusEl.textContent = "Error render";
            showErrorPopup("Gagal render", e.message);
        }
    });
}

function refreshHistory(scope) {
    if (scope === "external") historyExternalData = [];
    else historyInternalData = [];
    loadHistory(scope);
}

// ============================================================
// RENDER HISTORY — 12 kolom (No + 10 data + Detail)
// ============================================================
function renderHistoryTable(scope, data) {
    const tbodyId = scope === "external" ? "historyExternalTableBody" : "historyInternalTableBody";
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    if (!data || !data.length) {
        tbody.innerHTML = '<tr><td colspan="12" class="empty-row">Belum ada history ' + scope + '.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(function (r, i) {
        const pakai = Number(r.jumlahPemakaian) || 0;
        const qty = Number(r.quantity) || 0;
        const paHtml = r.pa
            ? '<span class="history-pa">' + escapeHtml(r.pa) + '</span>'
            : '<span style="color:#94a3b8;">—</span>';
        const pakaiHtml = pakai > 0
            ? '<span class="history-pakai">↓ ' + formatNumber(pakai) + '</span>'
            : '<span style="color:#94a3b8;">0</span>';
        const statusHtml = renderStatusBadge(r.statusDokumen);

        return '<tr>' +
            '<td>' + (i + 1) + '</td>' +
            '<td><strong>' + escapeHtml(r.material || "—") + '</strong></td>' +
            '<td>' + escapeHtml(r.description || "—") + '</td>' +
            '<td>' + escapeHtml(r.batch || "—") + '</td>' +
            '<td>' + escapeHtml(r.plant || "—") + '</td>' +
            '<td>' + escapeHtml(r.storeLocation || "—") + '</td>' +
            '<td><span style="font-family:monospace;">' + escapeHtml(r.serialNumbers || "—") + '</span></td>' +
            '<td><strong>' + formatNumber(qty) + '</strong></td>' +
            '<td>' + pakaiHtml + '</td>' +
            '<td>' + paHtml + '</td>' +
            '<td>' + statusHtml + '</td>' +
            '<td style="white-space:nowrap;">' +
                '<button type="button" class="detail-btn" onclick="showHistoryDetail(\'' + scope + '\',' + i + ')">Detail</button>' +
            '</td>' +
            '</tr>';
    }).join("");
}

function renderStatusBadge(status) {
    const s = String(status || "Belum Reservasi").trim();
    let cls = "status-badge status-belum";
    if (s === "Belum GI") cls = "status-badge status-gi";
    else if (s === "Sudah Selesai") cls = "status-badge status-selesai";
    return '<span class="' + cls + '">' + escapeHtml(s) + '</span>';
}

// ============================================================
// MODAL DETAIL HISTORY
// ============================================================
function showHistoryDetail(scope, idx) {
    const data = scope === "external" ? historyExternalData : historyInternalData;
    const row = data[idx];
    if (!row) return;

    currentHistoryRow = row;
    currentHistoryScope = scope;
    currentHistoryIndex = idx;

    ensureModal();
    const content = document.getElementById("detailModalContent");
    if (!content) return;
    content.scrollTop = 0;

    const admin = isAdmin();
    const labelStyle = 'display:block;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;';
    const readOnlyInput = 'width:100%;padding:9px 12px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;color:#1a1a2e;font:inherit;font-size:13px;font-weight:500;outline:none;';

    const rowHtml = function(label, value) {
        return '<div><label style="' + labelStyle + '">' + label + '</label><input type="text" value="' + escapeAttribute(value || "") + '" readonly style="' + readOnlyInput + '"></div>';
    };

    content.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">' +
        '<div>' +
        '<span style="font-size:10px;font-weight:700;color:#2563eb;text-transform:uppercase;letter-spacing:0.1em;">DETAIL HISTORY ' + scope.toUpperCase() + '</span>' +
        '<h3 style="font-size:18px;font-weight:700;color:#1a1a2e;margin:4px 0 0;">' + escapeHtml(row.material || "—") + '</h3>' +
        '</div>' +
        '<button type="button" onclick="closeDetailModal()" style="width:36px;height:36px;border:none;background:#f1f5f9;border-radius:8px;font-size:20px;color:#64748b;cursor:pointer;">×</button>' +
        '</div>' +

        '<div style="padding:16px;border:1px solid #e5ebf2;border-radius:10px;background:#fafbfc;margin-bottom:16px;">' +
        '<div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">Informasi Material</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 16px;">' +
        rowHtml("Material", row.material) +
        rowHtml("Batch", row.batch) +
        '<div style="grid-column:1/-1;">' + rowHtml("Description", row.description) + '</div>' +
        rowHtml("Plant", row.plant) +
        rowHtml("Store Location", row.storeLocation) +
        '<div style="grid-column:1/-1;">' + rowHtml("Serial Number", row.serialNumbers) + '</div>' +
        rowHtml("Jumlah", formatNumber(row.quantity)) +
        rowHtml("Jumlah Pemakaian", formatNumber(row.jumlahPemakaian)) +
        '<div style="grid-column:1/-1;">' + rowHtml("PA", row.pa || "-") + '</div>' +
        '</div>' +
        '</div>' +

        '<div style="padding:16px;border:1px solid #e5ebf2;border-radius:10px;background:#fbfcfe;margin-bottom:16px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
        '<div style="font-size:10px;font-weight:700;color:#2563eb;text-transform:uppercase;letter-spacing:0.08em;">Status Dokumen</div>' +
        renderStatusBadge(row.statusDokumen) +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 16px;">' +
        rowHtml("Nomor Reservasi", row.nomorReservasi || "-") +
        rowHtml("Nomor GI", row.nomorGI || "-") +
        '</div>' +
        '</div>' +

        '<div style="display:flex;gap:8px;justify-content:flex-end;padding-top:16px;border-top:1px solid #f1f5f9;">' +
        '<button type="button" onclick="closeDetailModal()" style="padding:10px 22px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;color:#475569;">Tutup</button>' +
        (admin ? '<button type="button" onclick="openEditDokumenModal()" style="padding:10px 22px;background:#2563eb;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:13px;">✏️ Edit Dokumen</button>' : '') +
        '</div>';

    document.getElementById("detailModal").classList.add("show");
}

// ============================================================
// MODAL EDIT DOKUMEN
// ============================================================
function openEditDokumenModal() {
    if (!requireAdminFrontend()) return;
    const row = currentHistoryRow;
    const scope = currentHistoryScope;
    if (!row) { showErrorPopup("Gagal", "Data tidak ditemukan."); return; }

    const content = document.getElementById("detailModalContent");
    if (!content) return;
    content.scrollTop = 0;

    const labelStyle = 'display:block;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;';
    const inputStyle = 'width:100%;padding:11px 14px;border:1.5px solid #cbd5e1;border-radius:9px;font:inherit;font-size:14px;outline:none;background:#fff;color:#1a1a2e;transition:all .2s;';

    const previewStatus = function(res, gi) {
        const hasRes = String(res || "").trim() !== "";
        const hasGi = String(gi || "").trim() !== "";
        if (hasRes && hasGi) return "Sudah Selesai";
        if (hasRes) return "Belum GI";
        return "Belum Reservasi";
    };

    const idxToReturn = currentHistoryIndex;

    content.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">' +
        '<div>' +
        '<span style="font-size:10px;font-weight:700;color:#2563eb;text-transform:uppercase;letter-spacing:0.1em;">EDIT DOKUMEN</span>' +
        '<h3 style="font-size:18px;font-weight:700;color:#1a1a2e;margin:4px 0 0;">' + escapeHtml(row.material || "—") + '</h3>' +
        '</div>' +
        '<button type="button" onclick="showHistoryDetail(\'' + scope + '\',' + idxToReturn + ')" style="width:36px;height:36px;border:none;background:#f1f5f9;border-radius:8px;font-size:20px;color:#64748b;cursor:pointer;">×</button>' +
        '</div>' +

        '<div style="padding:16px;border:1px solid #e5ebf2;border-radius:10px;background:#fbfcfe;margin-bottom:16px;">' +
        '<div style="margin-bottom:14px;">' +
        '<label style="' + labelStyle + '">Nomor Reservasi</label>' +
        '<input id="editNomorReservasi" type="text" placeholder="Contoh: 12345 atau R-2024-001" value="' + escapeAttribute(row.nomorReservasi || "") + '" style="' + inputStyle + '">' +
        '</div>' +
        '<div style="margin-bottom:14px;">' +
        '<label style="' + labelStyle + '">Nomor GI</label>' +
        '<input id="editNomorGI" type="text" placeholder="Contoh: GI-001 atau 2024/GI/001" value="' + escapeAttribute(row.nomorGI || "") + '" style="' + inputStyle + '">' +
        '</div>' +
        '<div style="padding:12px 14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:12px;color:#1e40af;">' +
        '<strong>Status akan otomatis:</strong><br>' +
        '• Kosong dua-duanya → <strong>Belum Reservasi</strong><br>' +
        '• Ada Nomor Reservasi → <strong>Belum GI</strong><br>' +
        '• Ada dua-duanya → <strong>Sudah Selesai</strong>' +
        '</div>' +
        '<div id="previewStatusBox" style="margin-top:12px;padding:10px 14px;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:8px;font-size:13px;font-weight:600;text-align:center;color:#334155;">' +
        'Status saat ini: <strong>' + escapeHtml(previewStatus(row.nomorReservasi, row.nomorGI)) + '</strong>' +
        '</div>' +
        '</div>' +

        '<div style="display:flex;gap:8px;justify-content:flex-end;padding-top:16px;border-top:1px solid #f1f5f9;">' +
        '<button type="button" onclick="showHistoryDetail(\'' + scope + '\',' + idxToReturn + ')" style="padding:10px 22px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;color:#475569;">Batal</button>' +
        '<button type="button" onclick="simpanDokumenHistory()" style="padding:10px 22px;background:#16a34a;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:13px;">Simpan</button>' +
        '</div>';

    const resInput = document.getElementById("editNomorReservasi");
    const giInput = document.getElementById("editNomorGI");
    const previewBox = document.getElementById("previewStatusBox");
    if (resInput && giInput && previewBox) {
        const updatePreview = function() {
            const s = previewStatus(resInput.value, giInput.value);
            previewBox.innerHTML = 'Status akan jadi: <strong>' + escapeHtml(s) + '</strong>';
        };
        resInput.addEventListener("input", updatePreview);
        giInput.addEventListener("input", updatePreview);
    }

    document.getElementById("detailModal").classList.add("show");
}

function simpanDokumenHistory() {
    if (!requireAdminFrontend()) return;
    const row = currentHistoryRow;
    const scope = currentHistoryScope;
    if (!row) { showErrorPopup("Gagal", "Data tidak ditemukan."); return; }
    if (!row._row) { showErrorPopup("Gagal", "Data baris tidak valid (buka ulang Detail)."); return; }

    const resEl = document.getElementById("editNomorReservasi");
    const giEl = document.getElementById("editNomorGI");
    const resVal = resEl ? resEl.value.trim() : "";
    const giVal = giEl ? giEl.value.trim() : "";

    // Validasi: kalau mau isi GI, harus ada reservasi dulu
    if (giVal && !resVal) {
        showErrorPopup("Gagal", "Isi Nomor Reservasi dulu sebelum Nomor GI.");
        return;
    }

    setRefreshButton(true);
    callInternalAction({
        action: "update_history_dokumen",
        scope: scope,
        row: row._row,
        nomor_reservasi: resVal,
        nomor_gi: giVal
    }).then(function (res) {
        setRefreshButton(false);

        // Update data lokal
        row.nomorReservasi = resVal;
        row.nomorGI = giVal;
        row.statusDokumen = (res && res.status) ? res.status : "Belum Reservasi";

        // Re-render tabel (agar badge status di list update)
        const data = scope === "external" ? historyExternalData : historyInternalData;
        renderHistoryTable(scope, data);

        showToast("Dokumen berhasil disimpan. Status: " + row.statusDokumen, "success");

        // Langsung tampilkan detail (tanpa setTimeout)
        const idxToReturn = currentHistoryIndex;
        if (idxToReturn >= 0 && data[idxToReturn]) {
            showHistoryDetail(scope, idxToReturn);
        }
    }).catch(function (e) {
        setRefreshButton(false);
        showErrorPopup("Gagal menyimpan", e.message);
    });
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
            const msg = String(data.error || "");
            if (msg.indexOf("Akses ditolak") !== -1 ||
                msg.indexOf("expired") !== -1 ||
                msg.indexOf("login") !== -1) {
                forceLogoutToLogin("Session berakhir. Silakan login ulang.");
                return;
            }
            if (msg.indexOf("Action tidak dikenal") !== -1) {
                callback(new Error(
                    "⚠️ Google Apps Script belum di-deploy ulang.\n\n" +
                    "Solusi:\n" +
                    "1. Buka Apps Script\n" +
                    "2. Deploy → Manage Deployments\n" +
                    "3. Edit → Version: New version → Deploy\n\n" +
                    "Detail: " + msg
                ));
                return;
            }
            callback(new Error(msg || "API error"));
            return;
        }
        if (!Array.isArray(data)) {
            callback(new Error("Format data tidak valid. Response: " + JSON.stringify(data).substring(0, 200)));
            return;
        }
        callback(null, data);
    };

    const token = getToken();
    const url = INTERNAL_API_URL + (INTERNAL_API_URL.includes("?") ? "&" : "?") +
        "action=" + encodeURIComponent(action) +
        "&token=" + encodeURIComponent(token || "") +
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

    const minRaw = getRowValue(row, ["minimalStok", "minimal_stok", "minimal", "Minimal Stok", "MinimalStok", "stokMinimum", "minStok"]);
    const minNum = Number(String(minRaw || "0").replace(/[^\d.-]/g, ""));
    const minimalStok = isNaN(minNum) ? 0 : minNum;

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
        jumlah, minimalStok,
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
                category: category, jumlah: 0, minimalStok: 0,
                serials: [], sourceRows: []
            });
        }
        const item = grouped.get(key);
        item.jumlah += r.jumlah;
        if (r.minimalStok > item.minimalStok) item.minimalStok = r.minimalStok;

        r.serials.forEach(function (s) {
            if (!item.serials.includes(s)) item.serials.push(s);
        });
        item.sourceRows.push({
            sheet: r.sheet, sheetRow: r.sheetRow,
            material: r.material, description: r.description,
            batch: r.batch, plant: r.plant, location: r.location,
            serial: r.serial, jumlah: r.jumlah,
            minimalStok: r.minimalStok,
            category: category
        });
    });
    return [...grouped.values()];
}

// ============================================================
// WARNING PER MATERIAL
// ============================================================
function getWarningLevel(row) {
    const stok = Number(row.jumlah) || 0;
    const min = Number(row.minimalStok) || 0;
    if (min <= 0) return null;
    if (stok === 0) return "empty";
    if (stok <= min) return "low";
    return null;
}

function getWarningBadge(row) {
    const level = getWarningLevel(row);
    if (level === "empty") {
        return '<span class="warn-badge warn-empty" title="Stok habis (minimal: ' + formatNumber(row.minimalStok) + ')">HABIS</span>';
    }
    if (level === "low") {
        return '<span class="warn-badge warn-low" title="Stok menipis (minimal: ' + formatNumber(row.minimalStok) + ')">MENIPIS</span>';
    }
    return "";
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
        tb.innerHTML = '<tr><td colspan="11" class="empty-row">Tidak ada data.</td></tr>';
        return;
    }
    const admin = isAdmin();
    tb.innerHTML = data.map(function (r, i) {
        const n = r.serials ? r.serials.length : 0;
        const badge = n > 0 ? '<span class="sn-badge">' + n + ' SN</span>' : '<span class="sn-badge none">-</span>';
        const warning = getWarningBadge(r);
        const level = getWarningLevel(r);
        const rowClass = level === "empty" ? "row-empty" : (level === "low" ? "row-low" : "");
        const minHint = (r.minimalStok > 0) ? '<div class="min-hint">min: ' + formatNumber(r.minimalStok) + '</div>' : '';

        const addBtn = admin
            ? '<button type="button" class="add-row-btn admin-only" title="Tambah SN / Stock" onclick="showAddStockModal(' + i + ', \'internal\')">+</button>'
            : '';

        return '<tr class="' + rowClass + '">' +
            '<td>' + (i + 1) + '</td>' +
            '<td><strong>' + escapeHtml(r.material || "—") + '</strong></td>' +
            '<td>' + escapeHtml(r.description || "—") + '</td>' +
            '<td>' + escapeHtml(r.batch || "—") + '</td>' +
            '<td>' + escapeHtml(r.plant || "—") + '</td>' +
            '<td>' + escapeHtml(r.location || "—") + '</td>' +
            '<td>' + escapeHtml(r.category || "—") + '</td>' +
            '<td><strong>' + formatNumber(r.jumlah || 0) + '</strong>' + minHint + '</td>' +
            '<td>' + warning + '</td>' +
            '<td>' + badge + '</td>' +
            '<td style="white-space:nowrap;">' +
                '<button type="button" class="detail-btn" onclick="showInternalDetail(' + i + ')">Detail</button>' +
                addBtn +
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
        tb.innerHTML = '<tr><td colspan="11" class="empty-row">Tidak ada data External.</td></tr>';
        return;
    }
    const admin = isAdmin();
    tb.innerHTML = data.map(function (r, i) {
        const n = r.serials ? r.serials.length : 0;
        const badge = n > 0 ? '<span class="sn-badge">' + n + ' SN</span>' : '<span class="sn-badge none">-</span>';
        const warning = getWarningBadge(r);
        const level = getWarningLevel(r);
        const rowClass = level === "empty" ? "row-empty" : (level === "low" ? "row-low" : "");
        const minHint = (r.minimalStok > 0) ? '<div class="min-hint">min: ' + formatNumber(r.minimalStok) + '</div>' : '';

        const addBtn = admin
            ? '<button type="button" class="add-row-btn admin-only" title="Tambah SN / Stock" onclick="showAddStockModal(' + i + ', \'external\')">+</button>'
            : '';

        return '<tr class="' + rowClass + '">' +
            '<td>' + (i + 1) + '</td>' +
            '<td><strong>' + escapeHtml(r.material || "—") + '</strong></td>' +
            '<td>' + escapeHtml(r.description || "—") + '</td>' +
            '<td>' + escapeHtml(r.batch || "—") + '</td>' +
            '<td>' + escapeHtml(r.plant || "—") + '</td>' +
            '<td>' + escapeHtml(r.location || "—") + '</td>' +
            '<td>' + escapeHtml(r.category || "—") + '</td>' +
            '<td><strong>' + formatNumber(r.jumlah || 0) + '</strong>' + minHint + '</td>' +
            '<td>' + warning + '</td>' +
            '<td>' + badge + '</td>' +
            '<td style="white-space:nowrap;">' +
                '<button type="button" class="detail-btn" onclick="showExternalDetail(' + i + ')">Detail</button>' +
                addBtn +
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
// SEARCH MODAL
// ============================================================
function openSearchModal() {
    ensureModal();
    const content = document.getElementById("detailModalContent");
    if (!content) return;
    content.scrollTop = 0;

    content.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">' +
        '<div>' +
        '<h2 style="font-size:20px;font-weight:700;color:#1a1a2e;margin:0;">🔍 Cari Material</h2>' +
        '<p style="font-size:12px;color:#64748b;margin:4px 0 0;">Cari di Internal + External</p>' +
        '</div>' +
        '<button type="button" onclick="closeDetailModal()" style="width:36px;height:36px;border:none;background:#f1f5f9;border-radius:8px;font-size:20px;color:#64748b;cursor:pointer;">×</button>' +
        '</div>' +
        '<div style="position:relative;margin-bottom:16px;">' +
        '<input id="searchInput" type="search" placeholder="Cari material / description / SN / lokasi..." ' +
        'style="width:100%;padding:14px 16px 14px 44px;border:2px solid #e2e8f0;border-radius:12px;font-size:14px;outline:none;font-weight:500;" autofocus>' +
        '<span style="position:absolute;left:16px;top:50%;transform:translateY(-50%);font-size:18px;color:#94a3b8;">🔍</span>' +
        '</div>' +
        '<div id="searchResults" style="max-height:500px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:12px;">' +
        '<div style="padding:40px;text-align:center;color:#94a3b8;font-size:13px;">Ketik untuk mencari material...</div>' +
        '</div>' +
        '<div id="searchCount" style="margin-top:10px;font-size:12px;color:#64748b;text-align:right;"></div>';

    const input = document.getElementById("searchInput");
    input.addEventListener("input", function () {
        doSearch(this.value);
    });

    doSearch("");
    document.getElementById("detailModal").classList.add("show");
    setTimeout(function () { input.focus(); }, 100);
}

function doSearch(query) {
    const resultsEl = document.getElementById("searchResults");
    const countEl = document.getElementById("searchCount");
    if (!resultsEl) return;

    const q = String(query || "").toLowerCase().trim();

    const allInternal = internalData || [];
    const allExternal = externalData || [];
    const combined = [];

    allInternal.forEach(function (r) { combined.push(Object.assign({}, r, { _scope: "Internal" })); });
    allExternal.forEach(function (r) { combined.push(Object.assign({}, r, { _scope: "External" })); });

    const filtered = !q ? combined.slice(0, 100) : combined.filter(function (r) {
        const mat = String(r.material || "").toLowerCase();
        const desc = String(r.description || "").toLowerCase();
        const sn = (r.serials || []).join(" ").toLowerCase();
        const loc = String(r.location || "").toLowerCase();
        const kat = String(r.category || "").toLowerCase();
        return mat.indexOf(q) >= 0 || desc.indexOf(q) >= 0 || sn.indexOf(q) >= 0 || loc.indexOf(q) >= 0 || kat.indexOf(q) >= 0;
    });

    currentSearchResults = filtered;

    if (!filtered.length) {
        resultsEl.innerHTML = '<div style="padding:40px;text-align:center;color:#94a3b8;font-size:13px;">Tidak ada hasil untuk "' + escapeHtml(query) + '"</div>';
        if (countEl) countEl.textContent = "";
        return;
    }

    resultsEl.innerHTML = filtered.map(function (r, i) {
        const jml = Number(r.jumlah) || 0;
        const level = getWarningLevel(r);
        const warn = getWarningBadge(r);
        const bg = level === "empty" ? "#fef2f2" : (level === "low" ? "#fffbeb" : "#fff");
        const descShort = String(r.description || "—").substring(0, 60);
        return '<div style="padding:12px 16px;border-bottom:1px solid #f1f5f9;background:' + bg + ';cursor:pointer;transition:background .15s;" ' +
            'onmouseover="this.style.background=\'#f8fafc\'" onmouseout="this.style.background=\'' + bg + '\'" ' +
            'onclick="openSearchDetail(' + i + ')">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">' +
            '<div style="flex:1;min-width:200px;">' +
            '<div style="font-weight:700;color:#1a1a2e;font-size:13px;">' + escapeHtml(r.material || "—") + '</div>' +
            '<div style="font-size:11.5px;color:#64748b;margin-top:2px;">' + escapeHtml(descShort) + '</div>' +
            '<div style="font-size:10.5px;color:#94a3b8;margin-top:3px;">' +
            '📍 ' + escapeHtml(r.location || "—") + ' · ' + escapeHtml(r.category || "—") + ' · ' + r._scope +
            '</div>' +
            '</div>' +
            '<div style="text-align:right;">' +
            '<div style="font-weight:800;color:#2563eb;font-size:15px;">' + formatNumber(jml) + '</div>' +
            (warn ? '<div style="margin-top:4px;">' + warn + '</div>' : '') +
            '</div>' +
            '</div>' +
            '</div>';
    }).join("");

    if (countEl) countEl.textContent = filtered.length + " hasil ditemukan";
}

function openSearchDetail(idx) {
    const row = currentSearchResults[idx];
    if (!row) return;
    const scope = (row._scope || "").toLowerCase() === "external" ? "external" : "internal";
    showDetailModal(row, scope);
}

// ============================================================
// DETAIL MODAL (untuk Material Internal/External)
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
    content.scrollTop = 0;

    const admin = isAdmin();
    const isFOC = row.category === "FOC";
    const srcRows = row.sourceRows || [];
    const scopeLabel = scope === "external" ? "External" : "Internal";

    const labelStyle = 'display:block;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;';
    const readOnlyInput = 'width:100%;padding:9px 12px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;color:#1a1a2e;font:inherit;font-size:13px;font-weight:500;outline:none;';
    const minInput = 'width:100%;padding:10px 12px;border:2px solid #fbbf24;border-radius:8px;background:#fffbeb;color:#1a1a2e;font:inherit;font-size:14px;font-weight:700;outline:none;text-align:center;';
    const minInputReadonly = 'width:100%;padding:10px 12px;border:2px solid #e2e8f0;border-radius:8px;background:#f8fafc;color:#64748b;font:inherit;font-size:14px;font-weight:700;outline:none;text-align:center;';

    const warningLevel = getWarningLevel(row);
    let warnHtml = "";
    if (warningLevel === "empty") {
        warnHtml = '<div class="modal-warn modal-warn-empty"><strong>⚠ Stok HABIS</strong> — Stok saat ini 0, minimal ' + formatNumber(row.minimalStok) + '. Segera isi ulang.</div>';
    } else if (warningLevel === "low") {
        warnHtml = '<div class="modal-warn modal-warn-low"><strong>⚠ Stok MENIPIS</strong> — Stok saat ini ' + formatNumber(row.jumlah) + ', minimal ' + formatNumber(row.minimalStok) + '. Segera isi ulang.</div>';
    }

    const minStokBlock =
        '<div style="grid-column:1/-1;padding:14px 16px;border:2px dashed #fbbf24;border-radius:10px;background:#fffbeb;">' +
        '<div style="display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;">' +
        '<div style="flex:1;min-width:180px;">' +
        '<label style="' + labelStyle + 'color:#92400e;">Minimal Stok ' + (admin ? '(warning muncul jika stok ≤ nilai ini)' : '(hanya admin yang bisa mengubah)') + '</label>' +
        '<input id="minimalStokInput" type="number" min="0" step="1" value="' + (row.minimalStok || 0) + '" ' + (admin ? '' : 'readonly disabled ') + 'style="' + (admin ? minInput : minInputReadonly) + '">' +
        '</div>' +
        (admin
            ? '<button type="button" onclick="simpanMinimalStok()" style="padding:11px 22px;background:#f59e0b;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:13px;">Simpan Minimal</button>'
            : '<div style="padding:11px 22px;background:#f1f5f9;color:#94a3b8;border-radius:8px;font-weight:700;font-size:12px;">🔒 View Only</div>'
        ) +
        '</div></div>';

    if (!isFOC) {
        // ============ FOT ============
        let totalAktif = 0;
        srcRows.forEach(function (s) {
            const j = Number(s.jumlah) || 0;
            if (j > 0) totalAktif += j;
        });

        const rowsHtml = srcRows.map(function (s, i) {
            const jml = Number(s.jumlah) || 0;
            const isZero = jml === 0;
            const jmlInput = 'width:100%;padding:7px 10px;border:1px solid ' + (isZero ? '#fecaca' : '#cbd5e1') + ';border-radius:6px;background:' + (isZero ? '#fef2f2' : (admin ? '#fff' : '#f8fafc')) + ';color:#1a1a2e;font:inherit;font-size:13px;font-weight:600;outline:none;text-align:center;';
            return '<tr style="border-bottom:1px solid #f1f5f9;">' +
                '<td style="padding:12px 14px;text-align:center;color:#64748b;font-weight:600;font-size:13px;">' + (i + 1) + '</td>' +
                '<td style="padding:12px 14px;"><span style="font-family:monospace;font-size:13px;font-weight:600;color:#1a1a2e;word-break:break-all;">' + escapeHtml(s.serial || "-") + '</span></td>' +
                '<td style="padding:12px 14px;width:160px;"><input id="snJml_' + i + '" type="number" min="0" step="1" value="' + jml + '" ' + (admin ? '' : 'readonly disabled ') + 'style="' + jmlInput + '"></td>' +
                '</tr>';
        }).join("");

        content.innerHTML =
            warnHtml +
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
            minStokBlock +
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
                  '<table style="width:100%;border-collapse:collapse;min-width:500px;">' +
                  '<thead><tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;">' +
                  '<th style="padding:10px 14px;text-align:center;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;width:60px;">No</th>' +
                  '<th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Serial Number</th>' +
                  '<th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;width:160px;">Jumlah</th>' +
                  '</tr></thead>' +
                  '<tbody>' + rowsHtml + '</tbody>' +
                  '</table>' +
                  '</div>' +
                  '<div style="font-size:11px;color:#94a3b8;margin-top:10px;">' +
                  (admin ? '⚠ Setiap perubahan Jumlah akan otomatis tercatat di HISTORY.' : '🔒 Mode View Only — hanya admin yang bisa mengedit.') +
                  '</div>'
            ) +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding-top:16px;border-top:1px solid #f1f5f9;flex-wrap:wrap;">' +
            '<div style="font-size:12px;color:#64748b;">' +
            (admin ? 'Semua perubahan akan disimpan ke Google Sheet & History.' : '🔒 Anda login sebagai User — hanya bisa melihat data.') +
            '</div>' +
            '<div style="display:flex;gap:8px;">' +
            '<button type="button" onclick="closeDetailModal()" style="padding:10px 22px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;color:#475569;">' + (admin ? 'Batal' : 'Tutup') + '</button>' +
            (admin
                ? '<button type="button" onclick="simpanSemuaSNFOT(\'' + scope + '\')" style="padding:10px 22px;background:#2563eb;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:13px;">Simpan Perubahan</button>'
                : '') +
            '</div>' +
            '</div>';
    } else {
        // ============ FOC ============
        const eyebrow = 'font-size:10px;font-weight:700;color:#2563eb;text-transform:uppercase;letter-spacing:0.1em;';
        const input = 'width:100%;padding:9px 12px;border:1px solid #d7e1ec;border-radius:8px;font:inherit;font-size:13px;outline:none;';

        let bodyHtml = '';
        if (admin) {
            bodyHtml =
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
                '<span style="' + labelStyle + '">Kode PA *</span>' +
                '<input id="focPA" type="text" placeholder="Contoh: pa14115135" style="' + input + 'margin-top:4px;" required>' +
                '</div>' +
                '<div style="font-size:11px;color:#64748b;margin-bottom:12px;">' +
                'Stok akan berkurang pada baris yang dipilih. Transaksi otomatis tercatat di <strong>HISTORY</strong>.' +
                '</div>' +
                '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
                '<button type="button" onclick="closeDetailModal()" style="padding:10px 22px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;">Batal</button>' +
                '<button type="button" onclick="simpanPengeluaranFOC(\'' + scope + '\')" style="padding:10px 22px;background:#2563eb;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:13px;">Simpan</button>' +
                '</div>' +
                '</div>';
        } else {
            bodyHtml =
                '<div style="margin-top:16px;padding:16px;border:1px solid #e5ebf2;border-radius:10px;background:#f8fafc;text-align:center;">' +
                '<div style="font-size:32px;margin-bottom:8px;">🔒</div>' +
                '<div style="font-size:13px;color:#64748b;">Hanya admin yang bisa melakukan barang keluar (FOC).</div>' +
                '</div>';
        }

        if (srcRows.length > 0) {
            bodyHtml += '<div style="margin-top:20px;">' +
                '<div style="' + eyebrow + 'margin-bottom:8px;">BARIS SUMBER (referensi)</div>' +
                srcRows.map(function (s, i) {
                    return '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:12px;">' +
                        '<span>Baris ' + (i + 1) + (s.serial && s.serial !== "-" ? ' — ' + escapeHtml(s.serial) : '') + '</span>' +
                        '<strong>' + formatNumber(s.jumlah) + ' m</strong>' +
                        '</div>';
                }).join("") + '</div>';
        }

        content.innerHTML =
            warnHtml +
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
            '</div>' +
            '<div style="margin-top:16px;padding:14px 16px;border:2px dashed #fbbf24;border-radius:10px;background:#fffbeb;">' +
            '<div style="display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;">' +
            '<div style="flex:1;min-width:180px;">' +
            '<label style="' + labelStyle + 'color:#92400e;">Minimal Stok ' + (admin ? '(warning muncul jika stok ≤ nilai ini)' : '(hanya admin yang bisa mengubah)') + '</label>' +
            '<input id="minimalStokInput" type="number" min="0" step="1" value="' + (row.minimalStok || 0) + '" ' + (admin ? '' : 'readonly disabled ') + 'style="' + (admin ? minInput : minInputReadonly) + '">' +
            '</div>' +
            (admin
                ? '<button type="button" onclick="simpanMinimalStok()" style="padding:11px 22px;background:#f59e0b;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:13px;">Simpan Minimal</button>'
                : '<div style="padding:11px 22px;background:#f1f5f9;color:#94a3b8;border-radius:8px;font-weight:700;font-size:12px;">🔒 View Only</div>'
            ) +
            '</div></div>' +
            bodyHtml;
    }

    document.getElementById("detailModal").classList.add("show");
}

// ============================================================
// SIMPAN MINIMAL STOK
// ============================================================
function simpanMinimalStok() {
    if (!requireAdminFrontend()) return;

    const row = currentDetailRow;
    if (!row || !row.sourceRows || !row.sourceRows.length) {
        showErrorPopup("Gagal", "Data tidak ditemukan.");
        return;
    }
    const el = document.getElementById("minimalStokInput");
    const val = Number(el ? el.value : 0);
    if (!(val >= 0)) { showErrorPopup("Gagal", "Minimal stok tidak valid."); return; }

    setRefreshButton(true);
    let done = 0, failed = [];
    function next() {
        if (done >= row.sourceRows.length) {
            setRefreshButton(false);
            if (failed.length) showErrorPopup("Sebagian gagal disimpan", failed.join("\n"));
            else {
                showToast("Minimal stok disimpan: " + formatNumber(val), "success");
                closeDetailModal();
                if (currentDetailScope === "external") refreshExternalData();
                else refreshInternalData();
            }
            return;
        }
        const src = row.sourceRows[done];
        callInternalAction({
            action: "update",
            sheet: src.sheet || "",
            row: src.sheetRow,
            "Minimal Stok": String(val)
        }).then(function () { done++; next(); })
        .catch(function (err) { failed.push("Baris #" + src.sheetRow + ": " + err.message); done++; next(); });
    }
    next();
}

// ============================================================
// TAMBAH STOCK BARU
// ============================================================
function showAddStockModal(prefillIndex, scope) {
    if (!requireAdminFrontend()) return;

    scope = scope || "internal";
    ensureModal();
    const content = document.getElementById("detailModalContent");
    if (!content) return;
    content.scrollTop = 0;

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
        field("addJumlah", "Jumlah", "Contoh: 1 atau 4000", "", "number") +
        '</div>' +

        '<div style="display:flex;gap:8px;justify-content:flex-end;padding-top:16px;border-top:1px solid #f1f5f9;margin-top:16px;">' +
        '<button type="button" onclick="closeDetailModal()" style="padding:10px 22px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;color:#475569;">Batal</button>' +
        '<button type="button" onclick="simpanDataBaru(\'' + scope + '\')" style="padding:10px 22px;background:#2563eb;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:13px;">Simpan Stock</button>' +
        '</div>';

    document.getElementById("detailModal").classList.add("show");
}

function simpanDataBaru(scope) {
    if (!requireAdminFrontend()) return;

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
        "Jumlah": jumlah || "0"
    }).then(function () {
        closeDetailModal();
        showToast("Stock baru berhasil ditambahkan ke tab " + sheet + " & tercatat di History.", "success");
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
    currentHistoryRow = null;
    currentHistoryIndex = -1;
}

// ============================================================
// CALL INTERNAL ACTION
// ============================================================
function internalActionUrl(params) {
    const merged = Object.assign({}, params);
    if (!merged.token) merged.token = getToken();

    const q = Object.keys(merged).map(function (k) {
        return encodeURIComponent(k) + "=" + encodeURIComponent(merged[k] ?? "");
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
            if (data && data.success === false) {
                const msg = data.error || "Operasi gagal.";
                if (msg.indexOf("Akses ditolak") !== -1 ||
                    msg.indexOf("expired") !== -1 ||
                    msg.indexOf("login") !== -1) {
                    forceLogoutToLogin("Session berakhir. Silakan login ulang.");
                    reject(new Error(msg));
                    return;
                }
                if (msg.indexOf("Action tidak dikenal") !== -1) {
                    reject(new Error(
                        "⚠️ GAS belum di-deploy ulang.\n" +
                        "Deploy → Manage Deployments → Edit → New version → Deploy.\n\n" +
                        "Detail: " + msg
                    ));
                    return;
                }
                reject(new Error(msg));
                return;
            }
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

// ============================================================
// SIMPAN PERUBAHAN FOT (hanya Jumlah)
// ============================================================
function simpanSemuaSNFOT(scope) {
    if (!requireAdminFrontend()) return;

    const row = currentDetailRow;
    if (!row || !row.sourceRows || !row.sourceRows.length) {
        showErrorPopup("Gagal", "Tidak ada baris sumber.");
        return;
    }
    const changes = [];
    row.sourceRows.forEach(function (s, i) {
        const jmlEl = document.getElementById("snJml_" + i);
        if (!jmlEl) return;
        const newJml = Number(jmlEl.value);
        const oldJml = Number(s.jumlah) || 0;
        if (!(newJml >= 0)) { changes.push({ error: "Baris #" + (i + 1) + ": Jumlah tidak valid." }); return; }
        if (newJml !== oldJml) changes.push({ src: s, jumlah: newJml });
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
            else afterSave("Berhasil menyimpan " + validChanges.length + " perubahan (tercatat di History).", scope);
            return;
        }
        const c = validChanges[done];
        callInternalAction({
            action: "update", sheet: c.src.sheet || "", row: c.src.sheetRow,
            "Jumlah": String(c.jumlah)
        }).then(function () { done++; next(); })
        .catch(function (err) { failed.push("Baris #" + c.src.sheetRow + ": " + err.message); done++; next(); });
    }
    next();
}

// ============================================================
// FOC KELUAR
// ============================================================
function simpanPengeluaranFOC(scope) {
    if (!requireAdminFrontend()) return;

    const row = currentDetailRow;
    if (!row) { showErrorPopup("Gagal", "Data tidak ditemukan. Coba buka ulang Detail."); return; }
    if (!row.sourceRows || !row.sourceRows.length) { showErrorPopup("Gagal", "Data sumber tidak ada."); return; }

    const srcEl = document.getElementById("focSourceRow");
    const keluarEl = document.getElementById("focKeluar");
    const paEl = document.getElementById("focPA");
    const srcIdx = srcEl ? Number(srcEl.value) : -1;
    const keluar = Number(keluarEl ? keluarEl.value : 0);
    const paCode = String(paEl ? paEl.value : "").trim();

    if (!(srcIdx >= 0) || !row.sourceRows[srcIdx]) { showErrorPopup("Gagal", "Pilih baris sumber dulu."); return; }
    if (!(keluar > 0)) { showErrorPopup("Gagal", "Masukkan jumlah meter > 0."); return; }
    if (!paCode) { showErrorPopup("Gagal", "Kode PA wajib diisi."); return; }

    const target = row.sourceRows[srcIdx];
    const current = Number(target.jumlah) || 0;
    if (keluar > current) { showErrorPopup("Gagal", "Jumlah keluar (" + keluar + " m) melebihi stok (" + current + " m)."); return; }

    setRefreshButton(true);
    callInternalAction({
        action: "foc_keluar",
        sheet: target.sheet || "",
        row: target.sheetRow,
        jumlahKeluar: String(keluar),
        pa: paCode
    }).then(function (res) {
        const sisa = res && res.sisa !== undefined ? res.sisa : (current - keluar);
        afterSave("Barang keluar: " + formatNumber(keluar) + " m. Sisa stok: " + formatNumber(sisa) + " m. PA: " + paCode, scope);
    }).catch(function (e) {
        setRefreshButton(false);
        showErrorPopup("Gagal menyimpan", e.message);
    });
}

// ============================================================
// DASHBOARD
// ============================================================
function renderDashboard() {
    renderDashSide("internal", internalData);
    renderDashSide("external", externalData || []);
}

function renderDashSide(scope, data) {
    const isInt = scope === "internal";
    const p = isInt ? "dashInt" : "dashExt";
    const locSelId = isInt ? "dashInternalLoc" : "dashExternalLoc";
    const tableBodyId = isInt ? "dashIntTop5" : "dashExtTop5";
    const filterInfoId = isInt ? "dashIntFilterInfo" : "dashExtFilterInfo";

    const sel = document.getElementById(locSelId);
    if (!sel) return;

    const filterLoc = sel.value;
    const rows = (data || []).filter(function (r) {
        return !filterLoc || String(r.location || "") === filterLoc;
    });

    const mats = new Set(), locs = new Set(), active = new Set();
    let total = 0, fot = 0, foc = 0;
    let lowCount = 0, emptyCount = 0;

    rows.forEach(function (r) {
        const j = Number(r.jumlah) || 0;
        if (r.material) { mats.add(r.material); if (j > 0) active.add(r.material); }
        if (r.location) locs.add(r.location);
        total += j;
        if (r.category === "FOC") foc += j; else fot += j;

        const lvl = getWarningLevel(r);
        if (lvl === "empty") emptyCount++;
        else if (lvl === "low") lowCount++;
    });

    setText(p + "TotalMaterial", formatNumber(mats.size));
    setText(p + "TotalStock", formatNumber(total));
    setText(p + "TotalLocation", formatNumber(locs.size));
    setText(p + "ActiveMaterial", formatNumber(active.size));
    setText(p + "Fot", fot > 0 ? formatNumber(fot) : "—");
    setText(p + "Foc", foc > 0 ? formatNumber(foc) : "—");
    setText(p + "NonSfp", "—");

    const infoEl = document.getElementById(filterInfoId);
    if (infoEl) {
        if (filterLoc) infoEl.textContent = rows.length + " material";
        else if (emptyCount + lowCount > 0) {
            infoEl.textContent = "⚠ " + (emptyCount + lowCount) + " warning";
            infoEl.style.color = "#dc2626";
        } else {
            infoEl.textContent = "";
            infoEl.style.color = "";
        }
    }

    renderDashTable(tableBodyId, rows);

    if (sel.options.length <= 1 && data && data.length > 0) {
        const locsArr = Array.from(new Set(data.map(function (r) { return r.location; }).filter(Boolean)))
            .sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true }); });
        locsArr.forEach(function (loc) {
            const o = document.createElement("option");
            o.value = loc; o.textContent = loc;
            sel.appendChild(o);
        });
        sel.addEventListener("change", function () { renderDashSide(scope, data); });
    }
}

function renderDashTable(elId, rows) {
    const tbody = document.getElementById(elId);
    if (!tbody) return;

    const sorted = [...rows].sort(function (a, b) {
        return (Number(b.jumlah) || 0) - (Number(a.jumlah) || 0);
    });

    if (!sorted.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="dash-table-empty">Tidak ada data</td></tr>';
        return;
    }

    tbody.innerHTML = sorted.map(function (r, i) {
        const jml = Number(r.jumlah) || 0;
        const level = getWarningLevel(r);
        const rowClass = level === "empty" ? "row-empty" : (level === "low" ? "row-low" : "");
        const statusBadge = getWarningBadge(r) || '<span style="color:#16a34a;font-size:10px;font-weight:700;">OK</span>';
        const desc = String(r.description || "—");
        const descShort = desc.length > 40 ? desc.substring(0, 40) + "..." : desc;
        return '<tr class="' + rowClass + '">' +
            '<td>' + (i + 1) + '</td>' +
            '<td><strong>' + escapeHtml(r.material || "—") + '</strong></td>' +
            '<td>' + escapeHtml(descShort) + '</td>' +
            '<td>' + escapeHtml(r.batch || "—") + '</td>' +
            '<td>' + formatNumber(jml) + '</td>' +
            '<td>' + statusBadge + '</td>' +
            '</tr>';
    }).join("");
}

function renderDashTop5(elId, rows) { renderDashTable(elId, rows); }

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
            '<p id="errorModalMessage" style="font-size:14px;color:#64748b;margin-bottom:20px;line-height:1.5;white-space:pre-line;"></p>' +
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

let _refreshTimeout = null;
function setRefreshButton(l) {
    const b = document.getElementById("refreshBtn");
    if (b) { b.disabled = l; b.classList.toggle("is-loading", l); }
    if (_refreshTimeout) { clearTimeout(_refreshTimeout); _refreshTimeout = null; }
    if (l) {
        _refreshTimeout = setTimeout(function() {
            setRefreshButton(false);
            console.warn("[MAGANG3] Force reset refresh button (stuck > 25s)");
        }, 25000);
    }
}

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