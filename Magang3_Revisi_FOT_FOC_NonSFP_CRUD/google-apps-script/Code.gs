/**
 * MAGANG3 — INVENTORY MONITORING
 * Google Apps Script — FINAL v6
 * - read           : baca tab INTERNAL saja (skip hidden + exclude)
 * - read_external  : baca tab EKSTERNAL saja (skip hidden + exclude)
 * - create/update/delete
 */

const SPREADSHEET_ID = "1mrrN-dsjdF0c9iXuUyl4Styi2uRIPbjwyjzproMyQtI";

const HEADER_ALIASES = {
  material:      ["material", "kodematerial", "itemcode", "bahan"],
  description:   ["description", "deskripsi", "namabarang", "uraian"],
  batch:         ["batch", "kondisi", "status", "kondisibarang"],
  plant:         ["plant", "kodeplant", "pabrik", "gudang"],
  storeLocation: ["storelocation", "storlocation", "slog", "lokasi", "lokasitoko", "sloc", "storagelocation", "location"],
  category:      ["category", "kategori", "jenis", "jenisbarang"],
  serialNumbers: ["serialnumber", "serialnumbers", "sn", "noseri", "nomorseri", "serial"],
  quantity:      ["jumlah", "quantity", "qty", "stock", "stok", "kuantitas", "unrestricted", "jml", "saldo"],
  keterangan:    ["keterangan", "ket", "note", "catatan", "remark"]
};

// Tab External (dua ejaan: X dan K)
const EXTERNAL_KEYWORDS = ["external", "eksternal"];

// Tab yang DI-EXCLUDE (duplikat / backup) — dibandingkan dengan trim+lowercase
const EXCLUDE_TABS = ["fot", "foc"]; // nama tab FOT polos dan FOC polos (dengan/tanpa spasi)

function isExternalTab(name) {
  const n = normHeader(name);
  for (let i = 0; i < EXTERNAL_KEYWORDS.length; i++) {
    if (n.indexOf(EXTERNAL_KEYWORDS[i]) >= 0) return true;
  }
  return false;
}

function isExcludedTab(name) {
  const n = String(name).trim().toLowerCase();
  for (let i = 0; i < EXCLUDE_TABS.length; i++) {
    if (String(EXCLUDE_TABS[i]).trim().toLowerCase() === n) return true;
  }
  return false;
}

function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || "read").toLowerCase();
    let result;
    if (action === "read") result = readStock("internal");
    else if (action === "read_external") result = readStock("external");
    else if (action === "update") result = updateStockRow(e);
    else if (action === "delete") result = deleteStockRow(e);
    else if (action === "create") result = createStockRow(e);
    else result = { success: false, error: "Action tidak dikenal: " + action };
    return jsonpResponse(e, result);
  } catch (error) {
    return jsonpResponse(e, { success: false, error: error.message || String(error) });
  }
}

function normHeader(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findCol(headers, field) {
  const aliases = HEADER_ALIASES[field] || [];
  for (let i = 0; i < headers.length; i++) {
    if (aliases.indexOf(normHeader(headers[i])) !== -1) return i;
  }
  return -1;
}

function readStock(scope) {
  scope = scope || "internal";
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheets = ss.getSheets();
  const out = [];

  sheets.forEach(function(sheet) {
    const name = sheet.getName();

    // 1) SKIP kalau sheet di-hide
    if (sheet.isSheetHidden()) return;

    // 2) SKIP kalau tab ada di daftar EXCLUDE (misal "FOT " / "FOC " duplikat)
    if (isExcludedTab(name)) return;

    const isExt = isExternalTab(name);

    // 3) Filter scope: internal hanya baca non-eksternal, external hanya baca eksternal
    if (scope === "internal" && isExt) return;
    if (scope === "external" && !isExt) return;

    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return;

    const headers = values[0];
    const colMat = findCol(headers, "material");
    if (colMat === -1) return;

    const colDesc  = findCol(headers, "description");
    const colBatch = findCol(headers, "batch");
    const colPlant = findCol(headers, "plant");
    const colLoc   = findCol(headers, "storeLocation");
    const colCat   = findCol(headers, "category");
    const colSN    = findCol(headers, "serialNumbers");
    const colQty   = findCol(headers, "quantity");
    const colKet   = findCol(headers, "keterangan");

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

      let quantity = 0;
      if (colQty !== -1) {
        const q = row[colQty];
        if (typeof q === "number") {
          quantity = isFinite(q) ? q : 0;
        } else {
          const s = String(q || "").replace(/\s/g, "");
          if (s) {
            let cleaned = s;
            if (s.indexOf(",") >= 0 && s.indexOf(".") >= 0) {
              cleaned = s.replace(/\./g, "").replace(",", ".");
            } else if (s.indexOf(",") >= 0) {
              cleaned = s.replace(",", ".");
            } else if (s.indexOf(".") >= 0) {
              const parts = s.split(".");
              if (parts.length === 2 && parts[1].length === 3 && /^\d+$/.test(parts[1])) {
                cleaned = parts[0] + parts[1];
              }
            }
            const n = parseFloat(cleaned);
            quantity = isNaN(n) ? 0 : n;
          }
        }
      }

      if (colQty === -1 || row[colQty] === "" || row[colQty] === null || row[colQty] === undefined) {
        quantity = serialNumbers.length;
      }

      out.push({
        material: mat,
        description:   colDesc  !== -1 ? String(row[colDesc]  || "").trim() : "",
        batch:         colBatch !== -1 ? String(row[colBatch] || "").trim() : "",
        plant:         colPlant !== -1 ? String(row[colPlant] || "").trim() : "",
        storeLocation: colLoc   !== -1 ? String(row[colLoc]   || "").trim() : "",
        category:      colCat   !== -1 ? String(row[colCat]   || "").trim() : "",
        serialNumbers: serialNumbers,
        quantity: quantity,
        keterangan:    colKet   !== -1 ? String(row[colKet]   || "").trim() : "",
        _sheet: name,
        _sheetRow: r + 1
      });
    }
  });

  return out;
}

function getSheetByName(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const target = String(name).trim().toLowerCase();

  let sh = ss.getSheetByName(String(name).trim());
  if (sh) return sh;

  const all = ss.getSheets();
  for (let i = 0; i < all.length; i++) {
    const sn = String(all[i].getName()).trim().toLowerCase();
    if (sn === target) return all[i];
  }

  throw new Error("Tab '" + name + "' tidak ditemukan.");
}

function updateStockRow(e) {
  const sheetName = getParam(e, "sheet");
  const rowNumber = Number(getParam(e, "row"));
  if (!sheetName) throw new Error("Parameter 'sheet' wajib diisi.");
  if (!Number.isInteger(rowNumber) || rowNumber < 2) throw new Error("Nomor baris tidak valid.");

  const sheet = getSheetByName(sheetName);
  if (rowNumber > sheet.getLastRow()) throw new Error("Baris di luar jangkauan.");

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  const paramToField = {
    "Material":       "material",
    "Description":    "description",
    "Batch":          "batch",
    "Plant":          "plant",
    "Stor. Location": "storeLocation",
    "Serial number":  "serialNumbers",
    "Jumlah":         "quantity",
    "keterangan":     "keterangan",
    "Keterangan":     "keterangan"
  };

  const written = [];

  Object.keys(paramToField).forEach(function(pName) {
    if (!e.parameter || e.parameter[pName] === undefined) return;
    const field = paramToField[pName];
    const col = findCol(headers, field);
    if (col === -1) {
      written.push(field + ":KOLOM_TIDAK_ADA");
      return;
    }

    let val = String(e.parameter[pName] || "");
    if (field === "quantity") {
      const n = Number(val);
      if (!isFinite(n) || n < 0) throw new Error("Jumlah tidak valid.");
      sheet.getRange(rowNumber, col + 1).setValue(n);
      written.push(field + ":" + n);
    } else {
      sheet.getRange(rowNumber, col + 1).setValue(val);
      written.push(field + ":" + val);
    }
  });

  SpreadsheetApp.flush();
  return {
    success: true,
    action: "update",
    sheet: sheet.getName(),
    row: rowNumber,
    written: written,
    message: "Baris berhasil diperbarui."
  };
}

function createStockRow(e) {
  const sheetName = getParam(e, "sheet");
  if (!sheetName) throw new Error("Parameter 'sheet' wajib diisi.");

  const sheet = getSheetByName(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  const paramToField = {
    "Material":       "material",
    "Description":    "description",
    "Batch":          "batch",
    "Plant":          "plant",
    "Stor. Location": "storeLocation",
    "Serial number":  "serialNumbers",
    "Jumlah":         "quantity",
    "keterangan":     "keterangan",
    "Keterangan":     "keterangan"
  };

  const newRow = new Array(headers.length).fill("");

  Object.keys(paramToField).forEach(function(pName) {
    if (!e.parameter || e.parameter[pName] === undefined) return;
    const field = paramToField[pName];
    const col = findCol(headers, field);
    if (col === -1) return;

    let val = String(e.parameter[pName] || "");
    if (field === "quantity") {
      const n = Number(val);
      if (!isFinite(n) || n < 0) throw new Error("Jumlah tidak valid.");
      newRow[col] = n;
    } else {
      newRow[col] = val;
    }
  });

  const matCol = findCol(headers, "material");
  if (matCol === -1 || !newRow[matCol]) throw new Error("Material wajib diisi.");

  sheet.appendRow(newRow);
  SpreadsheetApp.flush();

  return {
    success: true,
    action: "create",
    sheet: sheet.getName(),
    row: sheet.getLastRow(),
    message: "Baris baru berhasil ditambahkan."
  };
}

function deleteStockRow(e) {
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