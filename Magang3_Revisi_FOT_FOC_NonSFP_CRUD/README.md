# Magang3 — Inventory Monitoring (Revisi)

Versi paket ini mempertahankan struktur proyek Admin dan memasukkan revisi berdasarkan pembahasan terbaru.

## Isi utama
- `login.html` — login Admin sementara.
- `index.html` — Dashboard, Internal, External, kategori Internal FOT / FOC / Non-SFP, tabel stok, Detail.
- `styles.css` — styling utama + modal Detail/CRUD + responsive layout.
- `app.js` — koneksi Google Apps Script JSONP, agregasi stok berdasarkan Material + Store Location/S-Log, filter, refresh, Detail, Edit, Hapus, dan pengurangan stok FOC Corporate.
- `google-apps-script/Code.gs` — backend Google Apps Script untuk read/update/delete/decrease stok.

## Akun development
Username: `admin`
Password: `admin123`

> Akun ini hanya untuk development. Belum menggunakan authentication server/database.

## Kategori Internal
Tampilan menggunakan tiga kategori:
- FOT
- FOC
- Non-SFP

Untuk data yang sekarang, FOC dideteksi dari `Description` yang mengandung `FOC`. Bila Google Sheet memiliki kolom `Category`, nilai `FOT`, `FOC`, atau `Non-SFP` dapat digunakan langsung. Source saat ini belum memiliki kolom `Category`, sehingga klasifikasi Non-SFP tidak dibuat-buat dari material code.

## Revisi stok
- Stock ditampilkan berdasarkan `Material + Store Location / S-Log`.
- Setiap material memiliki tombol `Detail`.
- Detail menampilkan Serial Number bila tersedia dan juga baris sumber yang bisa `Edit` / `Hapus`.
- FOC Corporate mempunyai aksi `Kurangi Meter`; stok dikurangi, bukan langsung menghapus seluruh baris. Baris baru dihapus saat jumlah menjadi 0.
- FOC Retail tetap diperlakukan sebagai item/roll: satu baris/roll bernilai satu unit sesuai data sumber.
- Tombol `Refresh` berada di topbar dan dipakai saat membuka Internal/External.

## Google Apps Script
1. Buka project Apps Script yang terhubung ke Spreadsheet stok.
2. Ganti kode backend dengan `google-apps-script/Code.gs`.
3. Pastikan `SPREADSHEET_ID` sesuai spreadsheet stok.
4. Deploy sebagai **Web App**.
   - Execute as: **Me**
   - Who has access: **Anyone**
5. URL Web App harus sama dengan URL yang sudah dikonfigurasi di `app.js`.
6. Setelah backend diperbarui, buka ulang aplikasi atau lakukan `Ctrl + F5`.

## Menjalankan lokal
```powershell
cd D:\magang3
python -m http.server 8000
```

Buka:
`http://localhost:8000/login.html`

Setelah login, aplikasi akan membuka `index.html`.

## Catatan penting
Google Apps Script dipakai sebagai sumber data sekaligus endpoint aksi CRUD. Karena app membaca data secara JSONP, browser localhost tidak bergantung pada `fetch()` CORS untuk endpoint ini.

External masih berupa pondasi dan belum diberi endpoint sumber data.
