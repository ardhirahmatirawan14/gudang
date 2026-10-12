/**
 * MAGANG3 — INVENTORY MONITORING
 * Google Apps Script — FINAL v15
 *
 * Fitur:
 * - 3 kolom baru HISTORY: status dokumen, nomor reservasi, nomor gi
 * - Status dokumen otomatis: Belum Reservasi / Belum GI / Sudah Selesai
 * - Endpoint baru: update_history_dokumen (admin only)
 * - Auto-migrate header: kalau sheet masih 9 kolom → tambah 3 kolom baru
 * - Setiap perubahan stok otomatis tercatat di HISTORY
 */

const SPREADSHEET_ID = "1mrrN-dsjdF0c9iXuUyl4Styi2uRIPbjwyjzproMyQtI";

const ADMIN_CREDENTIALS = { "admin": "PemantauanIm2024!" };
const USER_CREDENTIALS  = { "user": "UserIm2024!" };
const SESSION_TTL_SECONDS = 21600;

const HEADER_ALIASES = {
  material:        ["material", "kodematerial", "itemcode", "bahan"],
  description:     ["description", "deskripsi", "namabarang", "uraian"],
  batch:           ["batch", "kondisi", "status", "kondisibarang"],
  plant:           ["plant", "kodeplant", "pabrik", "gudang"],
  storeLocation:   ["storelocation", "storlocation", "storlokasi", "slog", "lokasi", "lokasitoko", "sloc", "storagelocation", "location"],
  category:        ["category", "kategori", "jenis", "jenisbarang"],
  serialNumbers:   ["serialnumber", "serialnumbers", "sn", "noseri", "nomorseri", "serial"],
  quantity:        ["jumlah", "quantity", "qty", "stock", "stok", "kuantitas", "unrestricted", "jml", "saldo"],
  keterangan:      ["keterangan", "ket", "note", "catatan", "remark"],
  minimalStok:     ["minimalstok", "minimal_stok", "minimal", "min", "minimumstok", "stokminimum", "minstok", "minimalstock"],
  jumlahPemakaian: ["jumlahpemakaian", "jumlah_pemakaian", "pemakaian", "usage", "jumlahpakai", "pakai"],
  pa:              ["pa", "kode_pa", "kodepa", "no_pa", "nopa", "pa_code"],
  statusDokumen:   ["statusdokumen", "status_dokumen"],
  nomorReservasi:  ["nomorreservasi", "nomor_reservasi", "noreservasi", "no_reservasi", "reservasi"],
  nomorGI:         ["nomorgi", "nomor_gi", "nogi", "no_gi", "gi"]
};

const HISTORY_HEADERS = [
  "Material", "Description", "Batch", "Plant", "Stor. Location",
  "Serial number", "jumlah", "jumlah pemakaian", "pa",
  "status dokumen", "nomor reservasi", "nomor gi"
];

const EXTERNAL_KEYWORDS = ["external", "eksternal", "ekternal"];
const EXCLUDE_TABS = ["fot", "foc"];

function isExternalTab(name) {
  const n = normHeader(name);
  for (let i = 0; i < EXTERNAL_KEYWORDS.length; i++) {
    if (n.indexOf(EXTERNAL_KEYWORDS[i]) >= 0) return true;
  }
  return false;
}
function isHistoryTab(name) {
  return normHeader(name).indexOf("history") >= 0;
}
function isExcludedTab(name) {
  const n = String(name).trim().toLowerCase();
  for (let i = 0; i < EXCLUDE_TABS.length; i++) {
    if (String(EXCLUDE_TABS[i]).trim().toLowerCase() === n) return true;
  }
  return false;
}

// ==================== AUTH ====================
function getSession(token) {
  if (!token) return null;
  const cache = CacheService.getScriptCache();
  const raw = cache.get("sess_" + token);
  if (!raw) return null;
  try {
    const sess = JSON.parse(raw);
    cache.put("sess_" + token, raw, SESSION_TTL_SECONDS);
    return sess;
  } catch (err) { return null; }
}
function requireLogin(e) {
  const token = String((e && e.parameter && e.parameter.token) || "").trim();
  if (!token) throw new Error("🔒 Akses ditolak: Silakan login terlebih dahulu.");
  const sess = getSession(token);
  if (!sess) throw new Error("🔒 Akses ditolak: Session tidak valid atau sudah expired. Silakan login ulang.");
  return sess;
}
function requireAdmin(e) {
  const sess = requireLogin(e);
  if (sess.role !== "admin") throw new Error("⛔ Akses ditolak: Hanya admin yang boleh melakukan aksi ini.");
  return sess;
}

// ============================================================
// FIND / CREATE / ENSURE HISTORY SHEET
// ============================================================
function findHistorySheet(scope) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const allSheets = ss.getSheets();
  const exactCandidates = (scope === "external")
    ? ["HISTORY EKTERNAL", "HISTORY EXTERNAL"]
    : ["HISTORY INTERNAL"];

  for (let i = 0; i < exactCandidates.length; i++) {
    const sh = ss.getSheetByName(exactCandidates[i]);
    if (sh) return sh;
  }
  const keywords = (scope === "external")
    ? ["eksternal", "external", "ekternal"]
    : ["internal"];
  for (let i = 0; i < allSheets.length; i++) {
    const sheetName = allSheets[i].getName();
    const normalized = normHeader(sheetName);
    if (normalized.indexOf("history") < 0) continue;
    for (let k = 0; k < keywords.length; k++) {
      if (normalized.indexOf(keywords[k]) >= 0) return allSheets[i];
    }
  }
  return null;
}

function getOrCreateHistorySheet(scope) {
  let sh = findHistorySheet(scope);
  if (sh) {
    ensureHistoryHeader(sh);
    return sh;
  }
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const name = (scope === "external") ? "HISTORY EKTERNAL" : "HISTORY INTERNAL";
  sh = ss.insertSheet(name);
  sh.getRange(1, 1, 1, HISTORY_HEADERS.length).setValues([HISTORY_HEADERS]);
  sh.getRange(1, 1, 1, HISTORY_HEADERS.length).setFontWeight("bold");
  return sh;
}

/**
 * 🆕 Pastikan sheet HISTORY punya 12 kolom header.
 * - Kalau sheet kosong → tulis 12 header.
 * - Kalau header 1-9 ada tapi 10-12 kosong → tambah 3 header baru.
 */
function ensureHistoryHeader(sh) {
  const lastCol = Math.max(sh.getLastColumn(), HISTORY_HEADERS.length);
  const firstRow = sh.getRange(1, 1, 1, lastCol).getValues()[0];

  // Sheet benar-benar kosong → tulis semua header
  const isEmpty = !firstRow || !firstRow[0] || String(firstRow[0]).trim() === "";
  if (isEmpty) {
    sh.getRange(1, 1, 1, HISTORY_HEADERS.length).setValues([HISTORY_HEADERS]);
    sh.getRange(1, 1, 1, HISTORY_HEADERS.length).setFontWeight("bold");
    return;
  }

  // Cek & tambah kolom 10-12 kalau belum ada
  const checks = [
    { col: 10, val: "status dokumen" },
    { col: 11, val: "nomor reservasi" },
    { col: 12, val: "nomor gi" }
  ];
  checks.forEach(function(c) {
    const v = String(firstRow[c.col - 1] || "").trim();
    if (!v) {
      sh.getRange(1, c.col).setValue(c.val).setFontWeight("bold");
    }
  });
}

/**
 * 🆕 Append ke HISTORY dengan 12 kolom.
 * 3 kolom terakhir diisi default:
 * - status dokumen = "Belum Reservasi"
 * - nomor reservasi = ""
 * - nomor gi = ""
 */
function appendHistoryRow(scope, rowData) {
  const fullRow = rowData.slice(0, 9);
  while (fullRow.length < 9) fullRow.push("");
  fullRow.push("Belum Reservasi");  // 10
  fullRow.push("");                  // 11
  fullRow.push("");                  // 12
  const sh = getOrCreateHistorySheet(scope);
  sh.appendRow(fullRow);
}

/**
 * 🆕 Hitung status dokumen otomatis.
 * - Kosong dua-duanya → "Belum Reservasi"
 * - Ada Nomor Reservasi → "Belum GI"
 * - Ada Nomor Reservasi & Nomor GI → "Sudah Selesai"
 */
function computeStatusDokumen(res, gi) {
  const hasRes = String(res || "").trim() !== "";
  const hasGi  = String(gi  || "").trim() !== "";
  if (hasRes && hasGi) return "Sudah Selesai";
  if (hasRes) return "Belum GI";
  return "Belum Reservasi";
}

// ============================================================
// ROUTING
// ============================================================
function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || "read").toLowerCase();
    let result;

    if (action === "login")                       result = loginUser(e);
    else if (action === "verify")                 result = verifyToken(e);
    else if (action === "logout")                 result = logoutUser(e);
    else if (action === "read")                   result = readStock(e, "internal");
    else if (action === "read_external")          result = readStock(e, "external");
    else if (action === "read_history_internal")  result = readHistory(e, "internal");
    else if (action === "read_history_external")  result = readHistory(e, "external");
    else if (action === "update_history_dokumen") result = updateHistoryDokumen(e);
    else if (action === "update")                 result = updateStockRow(e);
    else if (action === "delete")                 result = deleteStockRow(e);
    else if (action === "create")                 result = createStockRow(e);
    else if (action === "foc_keluar")             result = focKeluar(e);
    else if (action === "debug")                  result = debugInfo(e);
    else result = { success: false, error: "Action tidak dikenal: " + action };

    return jsonpResponse(e, result);
  } catch (error) {
    return jsonpResponse(e, { success: false, error: error.message || String(error) });
  }
}

function debugInfo(e) {
  requireLogin(e);
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const allSheets = ss.getSheets();
  const historyInt = findHistorySheet("internal");
  const historyExt = findHistorySheet("external");
  const report = {
    spreadsheet_id: SPREADSHEET_ID,
    total_sheets: allSheets.length,
    all_sheet_names: allSheets.map(function(s) { return s.getName(); }),
    history_internal_found: !!historyInt,
    history_internal_name: historyInt ? historyInt.getName() : null,
    history_external_found: !!historyExt,
    history_external_name: historyExt ? historyExt.getName() : null
  };
  if (historyInt) {
    const vals = historyInt.getDataRange().getValues();
    report.history_internal_rows = vals.length;
    report.history_internal_header = vals[0] || [];
    if (vals.length > 1) report.history_internal_sample = vals[1];
  }
  if (historyExt) {
    const vals = historyExt.getDataRange().getValues();
    report.history_external_rows = vals.length;
    report.history_external_header = vals[0] || [];
    if (vals.length > 1) report.history_external_sample = vals[1];
  }
  return { success: true, debug: report };
}

// ============================================================
// AUTH FUNCTIONS
// ============================================================
function loginUser(e) {
  const username = String((e && e.parameter && e.parameter.username) || "").trim();
  const password = String((e && e.parameter && e.parameter.password) || "");
  if (!username || !password) return { success: false, error: "Username dan password wajib diisi." };
  let role = null;
  if (ADMIN_CREDENTIALS[username] && ADMIN_CREDENTIALS[username] === password) role = "admin";
  else if (USER_CREDENTIALS[username] && USER_CREDENTIALS[username] === password) role = "user";
  if (!role) {
    Utilities.sleep(500);
    return { success: false, error: "Username atau password salah." };
  }
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put("sess_" + token, JSON.stringify({ username, role }), SESSION_TTL_SECONDS);
  return {
    success: true, token: token, username: username,
    name: role === "admin" ? "Admin" : "User",
    role: role, expiresIn: SESSION_TTL_SECONDS
  };
}

function verifyToken(e) {
  const token = String((e && e.parameter && e.parameter.token) || "");
  if (!token) return { success: false, error: "Token tidak ada." };
  const sess = getSession(token);
  if (!sess) return { success: false, error: "Session expired. Silakan login ulang." };
  return {
    success: true, username: sess.username,
    name: sess.role === "admin" ? "Admin" : "User",
    role: sess.role, token: token
  };
}

function logoutUser(e) {
  const token = String((e && e.parameter && e.parameter.token) || "");
  if (token) CacheService.getScriptCache().remove("sess_" + token);
  return { success: true, message: "Logout berhasil." };
}

// ============================================================
// HELPERS
// ============================================================
function normHeader(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }

function findCol(headers, field) {
  const aliases = HEADER_ALIASES[field] || [];
  for (let i = 0; i < headers.length; i++) {
    if (aliases.indexOf(normHeader(headers[i])) !== -1) return i;
  }
  return -1;
}

function getSheetByName(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const target = String(name).trim().toLowerCase();
  let sh = ss.getSheetByName(String(name).trim());
  if (sh) return sh;
  const all = ss.getSheets();
  for (let i = 0; i < all.length; i++) {
    if (String(all[i].getName()).trim().toLowerCase() === target) return all[i];
  }
  throw new Error("Tab '" + name + "' tidak ditemukan.");
}

// ============================================================
// READ STOCK (INTERNAL / EXTERNAL)
// ============================================================
function readStock(e, scope) {
  requireLogin(e);
  scope = scope || "internal";
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheets = ss.getSheets();
  const out = [];

  sheets.forEach(function(sheet) {
    const name = sheet.getName();
    if (sheet.isSheetHidden()) return;
    if (isExcludedTab(name)) return;
    if (isHistoryTab(name)) return;
    const isExt = isExternalTab(name);
    if (scope === "internal" && isExt) return;
    if (scope === "external" && !isExt) return;

    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return;

    const headers = values[0];
    const colMat = findCol(headers, "material");
    if (colMat === -1) return;

    const colDesc = findCol(headers, "description");
    const colBatch = findCol(headers, "batch");
    const colPlant = findCol(headers, "plant");
    const colLoc = findCol(headers, "storeLocation");
    const colCat = findCol(headers, "category");
    const colSN = findCol(headers, "serialNumbers");
    const colQty = findCol(headers, "quantity");
    const colMin = findCol(headers, "minimalStok");

    for (let r = 1; r < values.length; r++) {
      const row = values[r];
      const mat = String(row[colMat] || "").trim();
      if (!mat) continue;

      const serialNumbers = [];
      if (colSN !== -1) {
        const raw = row[colSN];
        if (raw !== null && raw !== undefined && String(raw).trim() !== "") {
          String(raw).split(/[,;\n]/).forEach(function(s) {
            const t = s.trim();
            if (t && t !== "-") serialNumbers.push(t);
          });
        }
      }

      let quantity = 0, qtyEmpty = false;
      if (colQty !== -1) {
        const q = row[colQty];
        if (q === "" || q === null || q === undefined) qtyEmpty = true;
        else if (typeof q === "number") quantity = isFinite(q) ? q : 0;
        else {
          const s = String(q).replace(/\s/g, "");
          if (s) {
            let cleaned = s;
            if (s.indexOf(",") >= 0 && s.indexOf(".") >= 0) cleaned = s.replace(/\./g, "").replace(",", ".");
            else if (s.indexOf(",") >= 0) cleaned = s.replace(",", ".");
            else if (s.indexOf(".") >= 0) {
              const parts = s.split(".");
              if (parts.length === 2 && parts[1].length === 3 && /^\d+$/.test(parts[1])) cleaned = parts[0] + parts[1];
            }
            const n = parseFloat(cleaned);
            quantity = isNaN(n) ? 0 : n;
          }
        }
      } else qtyEmpty = true;
      if (qtyEmpty && serialNumbers.length > 0) quantity = serialNumbers.length;

      let minimalStok = 0;
      if (colMin !== -1) {
        const mv = String(row[colMin] || "").replace(/\s/g, "").replace(/\./g, "").replace(/,/g, ".");
        const mn = parseFloat(mv);
        minimalStok = isNaN(mn) ? 0 : mn;
      }

      out.push({
        material: mat,
        description:   colDesc  !== -1 ? String(row[colDesc]  || "").trim() : "",
        batch:         colBatch !== -1 ? String(row[colBatch] || "").trim() : "",
        plant:         colPlant !== -1 ? String(row[colPlant] || "").trim() : "",
        storeLocation: colLoc   !== -1 ? String(row[colLoc]   || "").trim() : "",
        category:      colCat   !== -1 ? String(row[colCat]   || "").trim() : "",
        serialNumbers: serialNumbers,
        quantity:      quantity,
        minimalStok:   minimalStok,
        _sheet: name,
        _sheetRow: r + 1
      });
    }
  });
  return out;
}

// ============================================================
// READ HISTORY (12 kolom)
// ============================================================
function readHistory(e, scope) {
  requireLogin(e);
  const sh = findHistorySheet(scope);
  if (!sh) return [];

  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0];
  const colMat    = findCol(headers, "material");
  const colDesc   = findCol(headers, "description");
  const colBatch  = findCol(headers, "batch");
  const colPlant  = findCol(headers, "plant");
  const colLoc    = findCol(headers, "storeLocation");
  const colSN     = findCol(headers, "serialNumbers");
  const colQty    = findCol(headers, "quantity");
  const colPakai  = findCol(headers, "jumlahPemakaian");
  const colPA     = findCol(headers, "pa");
  const colStatus = findCol(headers, "statusDokumen");
  const colRes    = findCol(headers, "nomorReservasi");
  const colGI     = findCol(headers, "nomorGI");

  const out = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const mat = colMat !== -1 ? String(row[colMat] || "").trim() : "";
    if (!mat) continue;

    let qty = 0;
    if (colQty !== -1) {
      const q = row[colQty];
      qty = typeof q === "number" ? q : (Number(String(q).replace(/[^\d.-]/g, "")) || 0);
    }
    let pakai = 0;
    if (colPakai !== -1) {
      const p = row[colPakai];
      pakai = typeof p === "number" ? p : (Number(String(p).replace(/[^\d.-]/g, "")) || 0);
    }

    const res = colRes !== -1 ? String(row[colRes] || "").trim() : "";
    const gi  = colGI  !== -1 ? String(row[colGI]  || "").trim() : "";
    let status = colStatus !== -1 ? String(row[colStatus] || "").trim() : "";
    if (!status) status = computeStatusDokumen(res, gi);

    out.push({
      material:        mat,
      description:     colDesc  !== -1 ? String(row[colDesc]  || "").trim() : "",
      batch:           colBatch !== -1 ? String(row[colBatch] || "").trim() : "",
      plant:           colPlant !== -1 ? String(row[colPlant] || "").trim() : "",
      storeLocation:   colLoc   !== -1 ? String(row[colLoc]   || "").trim() : "",
      serialNumbers:   colSN    !== -1 ? String(row[colSN]    || "").trim() : "",
      quantity:        qty,
      jumlahPemakaian: pakai,
      pa:              colPA    !== -1 ? String(row[colPA]    || "").trim() : "",
      statusDokumen:   status,
      nomorReservasi:  res,
      nomorGI:         gi,
      _row: r + 1
    });
  }
  out.reverse();
  return out;
}

// ============================================================
// UPDATE HISTORY DOKUMEN (v15)
// ============================================================
function updateHistoryDokumen(e) {
  requireAdmin(e);

  const scope  = String(getParam(e, "scope")).toLowerCase();
  const rowNum = Number(getParam(e, "row"));
  const res    = getParam(e, "nomor_reservasi");
  const gi     = getParam(e, "nomor_gi");

  if (scope !== "internal" && scope !== "external") throw new Error("Scope tidak valid (internal/external).");
  if (!Number.isInteger(rowNum) || rowNum < 2) throw new Error("Nomor baris tidak valid.");

  const sh = findHistorySheet(scope);
  if (!sh) throw new Error("Sheet history tidak ditemukan.");
  if (rowNum > sh.getLastRow()) throw new Error("Baris di luar jangkauan.");

  ensureHistoryHeader(sh);
  const status = computeStatusDokumen(res, gi);

  sh.getRange(rowNum, 10).setValue(status);
  sh.getRange(rowNum, 11).setValue(res);
  sh.getRange(rowNum, 12).setValue(gi);
  SpreadsheetApp.flush();

  return {
    success: true,
    action: "update_history_dokumen",
    scope: scope,
    row: rowNum,
    status: status,
    nomorReservasi: res,
    nomorGI: gi,
    message: "Dokumen diperbarui. Status: " + status
  };
}

// ============================================================
// FOC KELUAR
// ============================================================
function focKeluar(e) {
  requireAdmin(e);
  const sheetName    = getParam(e, "sheet");
  const rowNumber    = Number(getParam(e, "row"));
  const jumlahKeluar = Number(getParam(e, "jumlahKeluar"));
  const paCode       = getParam(e, "pa");

  if (!sheetName) throw new Error("Parameter 'sheet' wajib diisi.");
  if (!Number.isInteger(rowNumber) || rowNumber < 2) throw new Error("Nomor baris tidak valid.");
  if (!(jumlahKeluar > 0)) throw new Error("Jumlah keluar harus > 0.");
  if (!paCode) throw new Error("Kode PA wajib diisi.");

  const sheet = getSheetByName(sheetName);
  if (rowNumber > sheet.getLastRow()) throw new Error("Baris di luar jangkauan.");

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colQty   = findCol(headers, "quantity");
  const colMat   = findCol(headers, "material");
  const colDesc  = findCol(headers, "description");
  const colBatch = findCol(headers, "batch");
  const colPlant = findCol(headers, "plant");
  const colLoc   = findCol(headers, "storeLocation");
  const colSN    = findCol(headers, "serialNumbers");

  if (colQty === -1) throw new Error("Kolom 'jumlah' tidak ditemukan.");
  if (colMat === -1) throw new Error("Kolom 'material' tidak ditemukan.");

  const currentQty = Number(sheet.getRange(rowNumber, colQty + 1).getValue()) || 0;
  if (jumlahKeluar > currentQty) throw new Error("Jumlah keluar melebihi stok saat ini (" + currentQty + ").");

  const sisa = currentQty - jumlahKeluar;
  sheet.getRange(rowNumber, colQty + 1).setValue(sisa);

  const isExt = isExternalTab(sheetName);
  const scope = isExt ? "external" : "internal";
  const historyRow = [
    colMat   !== -1 ? String(sheet.getRange(rowNumber, colMat + 1).getValue()   || "").trim() : "",
    colDesc  !== -1 ? String(sheet.getRange(rowNumber, colDesc + 1).getValue()  || "").trim() : "",
    colBatch !== -1 ? String(sheet.getRange(rowNumber, colBatch + 1).getValue() || "").trim() : "",
    colPlant !== -1 ? String(sheet.getRange(rowNumber, colPlant + 1).getValue() || "").trim() : "",
    colLoc   !== -1 ? String(sheet.getRange(rowNumber, colLoc + 1).getValue()   || "").trim() : "",
    colSN    !== -1 ? String(sheet.getRange(rowNumber, colSN + 1).getValue()    || "").trim() : "",
    sisa, jumlahKeluar, paCode
  ];
  appendHistoryRow(scope, historyRow);
  SpreadsheetApp.flush();

  return {
    success: true, action: "foc_keluar",
    sheet: sheet.getName(), row: rowNumber,
    sisa: sisa, jumlahPemakaian: jumlahKeluar, pa: paCode,
    message: "Barang keluar tercatat. Sisa stok: " + sisa + " | PA: " + paCode
  };
}

// ============================================================
// UPDATE STOCK ROW
// ============================================================
function updateStockRow(e) {
  requireAdmin(e);
  const sheetName = getParam(e, "sheet");
  const rowNumber = Number(getParam(e, "row"));
  if (!sheetName) throw new Error("Parameter 'sheet' wajib diisi.");
  if (!Number.isInteger(rowNumber) || rowNumber < 2) throw new Error("Nomor baris tidak valid.");

  const sheet = getSheetByName(sheetName);
  if (rowNumber > sheet.getLastRow()) throw new Error("Baris di luar jangkauan.");

  let headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const oldHeaders = headers.slice();
  const colQtyBefore = findCol(oldHeaders, "quantity");
  const oldQty = colQtyBefore !== -1 ? Number(sheet.getRange(rowNumber, colQtyBefore + 1).getValue()) || 0 : 0;

  const paramToField = {
    "Material": "material", "Description": "description", "Batch": "batch", "Plant": "plant",
    "Stor. Location": "storeLocation", "Serial number": "serialNumbers", "Jumlah": "quantity",
    "Minimal Stok": "minimalStok", "MinimalStok": "minimalStok",
    "minimal_stok": "minimalStok", "minimalStok": "minimalStok"
  };

  const written = [];
  Object.keys(paramToField).forEach(function(pName) {
    if (!e.parameter || e.parameter[pName] === undefined) return;
    const field = paramToField[pName];
    let col = findCol(headers, field);
    let val = String(e.parameter[pName] || "");
    if (col === -1) {
      const newColIndex = headers.length + 1;
      let headerName = field;
      if (field === "minimalStok") headerName = "minimal_stok";
      sheet.getRange(1, newColIndex).setValue(headerName);
      headers.push(headerName);
      col = newColIndex - 1;
      written.push(field + ":KOLOM_BARU_DIBUAT");
    }
    if (field === "quantity" || field === "minimalStok") {
      const n = Number(val);
      if (!isFinite(n) || n < 0) throw new Error(field + " tidak valid.");
      sheet.getRange(rowNumber, col + 1).setValue(n);
      written.push(field + ":" + n);
    } else {
      sheet.getRange(rowNumber, col + 1).setValue(val);
      written.push(field + ":" + val);
    }
  });

  // 🆕 Catat ke HISTORY kalau Jumlah berubah
  const colQtyAfter = findCol(headers, "quantity");
  if (colQtyAfter !== -1 && e.parameter && e.parameter["Jumlah"] !== undefined) {
    const newQty = Number(e.parameter["Jumlah"]);
    if (!isNaN(newQty) && newQty !== oldQty) {
      const diff = oldQty - newQty;
      if (diff !== 0) {
        const isExt = isExternalTab(sheetName);
        const scope = isExt ? "external" : "internal";
        const rowData = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
        const historyRow = [
          rowData[findCol(headers, "material")] || "",
          rowData[findCol(headers, "description")] || "",
          rowData[findCol(headers, "batch")] || "",
          rowData[findCol(headers, "plant")] || "",
          rowData[findCol(headers, "storeLocation")] || "",
          rowData[findCol(headers, "serialNumbers")] || "",
          newQty, Math.abs(diff), ""
        ];
        appendHistoryRow(scope, historyRow);
      }
    }
  }

  SpreadsheetApp.flush();
  return {
    success: true, action: "update", sheet: sheet.getName(),
    row: rowNumber, written: written,
    message: "Baris berhasil diperbarui: " + written.join(", ")
  };
}

// ============================================================
// CREATE STOCK ROW
// ============================================================
function createStockRow(e) {
  requireAdmin(e);
  const sheetName = getParam(e, "sheet");
  if (!sheetName) throw new Error("Parameter 'sheet' wajib diisi.");

  const sheet = getSheetByName(sheetName);
  let headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  const paramToField = {
    "Material": "material", "Description": "description", "Batch": "batch", "Plant": "plant",
    "Stor. Location": "storeLocation", "Serial number": "serialNumbers", "Jumlah": "quantity",
    "Minimal Stok": "minimalStok", "MinimalStok": "minimalStok", "minimal_stok": "minimalStok"
  };

  const newRow = new Array(headers.length).fill("");
  Object.keys(paramToField).forEach(function(pName) {
    if (!e.parameter || e.parameter[pName] === undefined) return;
    const field = paramToField[pName];
    let col = findCol(headers, field);
    if (col === -1) {
      const newColIndex = headers.length + 1;
      let headerName = field;
      if (field === "minimalStok") headerName = "minimal_stok";
      sheet.getRange(1, newColIndex).setValue(headerName);
      headers.push(headerName);
      col = newColIndex - 1;
      while (newRow.length < headers.length) newRow.push("");
    }
    let val = String(e.parameter[pName] || "");
    if (field === "quantity" || field === "minimalStok") {
      const n = Number(val);
      if (!isFinite(n) || n < 0) throw new Error(field + " tidak valid.");
      newRow[col] = n;
    } else {
      newRow[col] = val;
    }
  });

  const matCol = findCol(headers, "material");
  if (matCol === -1 || !newRow[matCol]) throw new Error("Material wajib diisi.");

  sheet.appendRow(newRow);

  // 🆕 Catat ke HISTORY (jumlah pemakaian = 0)
  const isExt = isExternalTab(sheetName);
  const scope = isExt ? "external" : "internal";
  const qty = Number(newRow[findCol(headers, "quantity")]) || 0;
  const historyRow = [
    newRow[findCol(headers, "material")] || "",
    newRow[findCol(headers, "description")] || "",
    newRow[findCol(headers, "batch")] || "",
    newRow[findCol(headers, "plant")] || "",
    newRow[findCol(headers, "storeLocation")] || "",
    newRow[findCol(headers, "serialNumbers")] || "",
    qty, 0, ""
  ];
  appendHistoryRow(scope, historyRow);

  SpreadsheetApp.flush();
  return {
    success: true, action: "create",
    sheet: sheet.getName(), row: sheet.getLastRow(),
    message: "Baris baru berhasil ditambahkan & tercatat di History."
  };
}

// ============================================================
// DELETE STOCK ROW
// ============================================================
function deleteStockRow(e) {
  requireAdmin(e);
  const sheetName = getParam(e, "sheet");
  const rowNumber = Number(getParam(e, "row"));
  if (!sheetName) throw new Error("Parameter 'sheet' wajib diisi.");
  if (!Number.isInteger(rowNumber) || rowNumber < 2) throw new Error("Nomor baris tidak valid.");

  const sheet = getSheetByName(sheetName);
  if (rowNumber > sheet.getLastRow()) throw new Error("Baris di luar jangkauan.");

  sheet.deleteRow(rowNumber);
  SpreadsheetApp.flush();
  return { success: true, action: "delete", sheet: sheet.getName(), row: rowNumber, message: "Baris berhasil dihapus." };
}

// ============================================================
// PARAM & JSONP
// ============================================================
function getParam(e, key) {
  return String((e && e.parameter && e.parameter[key] !== undefined) ? e.parameter[key] : "").trim();
}

function jsonpResponse(e, data) {
  const json = JSON.stringify(data);
  const callback = e && e.parameter && e.parameter.callback;
  if (callback) {
    if (!/^[a-zA-Z_$][0-9a-zA-Z_$]*$/.test(callback)) {
      return ContentService.createTextOutput("Invalid callback").setMimeType(ContentService.MimeType.TEXT);
    }
    return ContentService.createTextOutput(callback + "(" + json + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}