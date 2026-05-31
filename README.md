# Sa'adah Bakery

Web bakery profesional dengan halaman publik, login admin, dashboard kelola produk, upload foto, dan database Supabase.

## Struktur

- [index.html](index.html) - halaman publik
- [admin.html](admin.html) - dashboard admin
- [style.css](style.css) - semua styling
- [config.js](config.js) - konfigurasi Supabase dan WhatsApp (di-ignore)
- [script.js](script.js) - logika halaman publik
- [admin.js](admin.js) - logika dashboard admin
- [database.sql](database.sql) - schema database dan policy Supabase
- [setup-config.js](setup-config.js) - helper untuk menulis `config.js` secara lokal

## Cepat: isi konfigurasi lokal

Jalankan script helper untuk menulis `config.js` lokal (agar tidak disimpan di repo):

```bash
node setup-config.js
```

Script akan meminta:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `STORE_PHONE` (nomor WhatsApp toko, contoh: `6281234567890`)
- `STORAGE_BUCKET` (default: `products`)

File `config.js` otomatis ditulis dan ditambahkan ke `.gitignore`.

## Setup Supabase

1. Buat project baru di https://app.supabase.com
2. Buka SQL Editor, jalankan isi [database.sql](database.sql).
3. Buka **Authentication → Users → Add user** untuk membuat akun admin.
4. Ambil `User UID` admin lalu jalankan di SQL Editor:

```sql
insert into public.admins (user_id)
values ('ISI_USER_UID_ADMIN_DI_SINI');
```
5. Jalankan `setup-config.js` secara lokal untuk mengisi `config.js`.

## Jalankan lokal

1. Buka folder `saadah-bakery` di VS Code.
2. Install extension Live Server jika perlu.
3. Klik kanan [index.html](index.html) → **Open with Live Server**.
4. Untuk admin, buka [admin.html](admin.html) dan login dengan akun admin Supabase.

## Catatan penting


Jika mau, saya bisa bantu langkah demi langkah: menjalankan SQL di project Supabase kamu (kalau mau berikan akses sementara), atau saya bisa membimbing kamu memasukkan `SUPABASE_URL`, `ANON_KEY`, dan `ADMIN UID`.
 
## Siap di-publish otomatis (CI)

Saya sudah menambahkan dukungan deployment otomatis ke Netlify melalui GitHub Actions. Untuk mengaktifkan deploy otomatis:

1. Push repo ke GitHub pada branch `main`.
2. Tambahkan secrets di GitHub repo: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `STORE_PHONE` (contoh `6281234567890`).
3. Tambahkan `NETLIFY_AUTH_TOKEN` dan `NETLIFY_SITE_ID` ke GitHub Secrets.
	- Cara cepat: di Netlify > User settings > Applications > Personal access tokens → buat token.
	- Di Netlify > Site settings > Site information → ambil `Site ID`.
4. Setelah secrets ditambahkan, setiap push ke `main` akan menjalankan workflow dan deploy ke Netlify.

Atau jalankan manual lokal:

```bash
# tulis config.js lokal dari env
node build-config.js
# jalankan server lokal
npm run start
```

Jika kamu ingin saya lanjutkan: beri tahu apakah kamu ingin deploy ke Netlify (saya berikan langkah lengkap), atau ke Vercel / GitHub Pages.
