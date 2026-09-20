# CheyaVerse — Setup

Panduan lengkap untuk meng setup bot & web CheyaVerse

## Requirements

| Item | Keterangan |
|---|---|
| Python | 3.11 – 3.14 |
| Telegram Bot Token | Dari [@BotFather](https://t.me/BotFather) |
| Koneksi internet | Wajib |
| RAM minimum | 256 MB |
| Storage minimum | 150 MB |
| Supabase | Wajib |

## Struktur Folder
```
CheyaVerse/
├── assets/
│   ├── background.png
│   └── cheyaverse.jpg
├── handlers/
│   ├── __init__.py
│   ├── help.py
│   ├── qr.py
│   ├── start.py
│   └── web.py
├── dashboard/
│   ├── public/
│   │   └── assets/
│   │       ├── cheyaverse.jpg
│   │       ├── model.gif
│   │       └── ok.gif
│   ├── src/
│   ├── package.json
│   └── ...
├── .env
├── .env.example
├── .gitignore
├── config.py
├── logger.py
├── main.py
├── storage.py
└── requirements.txt
```

**Catatan:**
- Folder `assets/` di root **dipake bot** buat generate QR — wajib ada `background.png` & `cheyaverse.jpg`
- Folder `dashboard/` adalah webapp (viewer + dashboard personal). Kalau mau jalanin webapp, install Node.js dan pindah ke folder `dashboard/`
- File `web.py` yang lama (server aiohttp) **udah nggak dipake**. Webapp sekarang di folder `dashboard/` (Next.js)
- Handler `handlers/web.py` adalah command `/web` di bot (buat nampilin URL dashboard personal), **bukan** server web

### 1. Update package manager

```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Verifikasi versi python
```bash
python3 --version
pip3 --version
```

Kalau versi Python di bawah 3.11, install versi terbaru:
```bash
sudo apt install -y software-properties-common
sudo add-apt-repository ppa:deadsnakes/ppa -y
sudo apt update
sudo apt install -y python3.13 python3.13-venv python3.13-dev
```

### 3. Clone repositori
```bash
git clone https://github.com/neveerlabs/CheyaVerse.git
cd CheyaVerse
```

### 4. Install dependency
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 5. Update isi file `.env`
```txt
BOT_TOKEN=tokenbot
PUBLIC_URL=https://{host}:{port}
WEB_HOST=0.0.0.0
WEB_PORT=8080
BOT_USERNAME=CheyaVersebot
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_BUCKET=cheyaverse-media
SUPABASE_TABLE=media
MEDIA_TTL_DAYS=30
SIGNED_URL_TTL=2592000
```
> **Catatan:**
> - `PUBLIC_URL` = URL webapp. Isi dengan URL Vercel (`https://cheyaverse.vercel.app`) kalau udah deploy, atau IP lokal (`http://192.168.x.x:8080`) kalau masih `deploymen`
> - `BOT_USERNAME` = username bot Telegram tanpa `@`. Dipakai webapp buat tombol "Buka Bot"
> - Data media disimpan selama 30 hari di **Supabase**

> **Disclaimer**: _Ganti `{host}` dengan IP lokal (client IP)._ Cek:
```bash
ip addr show | grep "inet " | grep -v 127.0.0.1
```

### 6. Running bot

```bash
python3 main.py
```

Bot akan jalan dan polling ke Telegram. Biarkan terminal ini tetap terbuka.

### 7. Running webapp (opsional, kalau deploymen)

> **Skip bagian ini kalau webapp udah di-deploy di Vercel.** Bot tetap bisa jalan tanpa webapp lokal, karena link QR nunjuk ke `PUBLIC_URL`

Kalau mau jalanin webapp lokal:

```bash
cd dashboard
npm install
npm run dev
```

Webapp jalan di `http://localhost:8080`. Buka di browser buat preview viewer & dashboard.

> **Penting:** Set `PUBLIC_URL=http://192.168.x.x:8080` di `.env` Python kalau mau QR bisa di-scan dari HP lain di WiFi yang sama.

### Log yg benar harus seperti ini

**Server bot**
```bash
[HH:MM:SS] [INFO] CheyaVerse bot is starting...
[HH:MM:SS] [INFO] QR assets verified.
[HH:MM:SS] [INFO] Public viewer base: https://cheyaverse.vercel.app
[HH:MM:SS] [INFO] Startup cleanup: no expired media found.
[HH:MM:SS] [INFO] Bot active: @username | Name | ID: 123456789
[HH:MM:SS] [INFO] Polling engaged. Press CTRL+C to stop.
```

**Server webapp**
```bash
▲ Next.js 14.2.18
- Local:        http://localhost:8080
✓ Ready in 2.1s
```

> **Catatan:** Log webapp cuma muncul kalo dijalanin dilokal. Kalo udah di Vercel, log-nya ada di dashboard Vercel → Deployments → Logs

---

## Setup Supabase

### Bikin Tabel Media

1. Di sidebar, klik **SQL Editor** → **+ New query**
2. Isi input SQL berikut:

    ```sql
    CREATE TABLE IF NOT EXISTS media (
        id TEXT PRIMARY KEY,
        owner_id BIGINT,
        filename TEXT NOT NULL,
        storage_path TEXT NOT NULL,
        content_type TEXT,
        file_size BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_media_expires_at ON media (expires_at);
    CREATE INDEX IF NOT EXISTS idx_media_owner_id ON media (owner_id);
    ```

3. Klik **Run** (atau `Ctrl + Enter`)
4. Pastikan muncul output **"Success. No rows returned"**

> **Catatan:** Kolom `owner_id` nyimpen Telegram user ID pemilik file. Dipakai webapp buat filter dashboard personal — user cuma bisa liat file yang dia upload

### (Migrasi) Kalo tabel `media` udah ada sebelumnya

Kalau lo udah pernah bikin tabel `media` sebelum update ini, jalanin SQL ini buat nambahin kolom `owner_id` tanpa kehilangan data:

```sql
ALTER TABLE media ADD COLUMN IF NOT EXISTS owner_id BIGINT;
CREATE INDEX IF NOT EXISTS idx_media_owner_id ON media (owner_id);
```

> File lama yang belum punya `owner_id` bakal jadi `NULL`. Bisa dihapus manual atau dibiarin (nggak muncul di dashboard manapun).

**DISCLAIMER:** Ambil key **`anon public`**, jangan `service_role`. Key `service_role` punya akses full admin, **JANGAN pernah** ditaruh / simpan di kode publik

### Buat Bucket Storage

1. Di sidebar, klik **Storage**
2. Klik **New bucket**
3. Isi:
   - **Name**: `cheyaverse-media` (isinya harus sama dengan yg di `.env`)
   - **Public bucket**: **JANGAN** dicentang
   - **File size limit**: biarkan default
4. Klik **Save**
> **Saran:** _buat bagian pilihan opsi, ada baiknya gak usah ada yg di centang, tapi terserah_

### Setup Row Level Security (RLS) Policy
**Langkah yang WAJIB**. Tanpa ini, upload, rename, & delete akan gagal dengan error `new row violates row-level security policy` atau `permission denied`

Di **SQL Editor** → **+ New query**
```sql
DROP POLICY IF EXISTS "media_select" ON media;
DROP POLICY IF EXISTS "media_insert" ON media;
DROP POLICY IF EXISTS "media_update" ON media;
DROP POLICY IF EXISTS "media_delete" ON media;

DROP POLICY IF EXISTS "media_bucket_select" ON storage.objects;
DROP POLICY IF EXISTS "media_bucket_insert" ON storage.objects;
DROP POLICY IF EXISTS "media_bucket_delete" ON storage.objects;

ALTER TABLE media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "media_select" ON media
    FOR SELECT
    USING (true);

CREATE POLICY "media_insert" ON media
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY "media_update" ON media
    FOR UPDATE
    USING (true)
    WITH CHECK (true);

CREATE POLICY "media_delete" ON media
    FOR DELETE
    USING (true);

CREATE POLICY "media_bucket_select" ON storage.objects
    FOR SELECT
    USING (bucket_id = 'cheyaverse-media');

CREATE POLICY "media_bucket_insert" ON storage.objects
    FOR INSERT
    WITH CHECK (bucket_id = 'cheyaverse-media');

CREATE POLICY "media_bucket_delete" ON storage.objects
    FOR DELETE
    USING (bucket_id = 'cheyaverse-media');
```
Klik **Run**, pastikan outputnya **"Success. No rows returned"**

> **Penting:** Policy `media_update` **WAJIB** ada. Tanpa ini, fitur **rename** di dashboard bakal gagal dengan error `db_error` → 500. Rename butuh `UPDATE` permission di tabel `media`.

### Verifikasi Policy
Jalanin SQL ini buat memastikan policy udah aktif
```sql
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('media', 'objects')
ORDER BY tablename, policyname;
```

Expected output (7 rows):
| tablename | policyname | cmd |
|---|---|---|
| media | media_delete | DELETE |
| media | media_insert | INSERT |
| media | media_select | SELECT |
| media | media_update | UPDATE |
| objects | media_bucket_delete | DELETE |
| objects | media_bucket_insert | INSERT |
| objects | media_bucket_select | SELECT |

### (Opsional) Auto-Cleanup dengan pg_cron
Kalau mau Supabase yang bersihin media expired otomatis (tanpa perlu bot jalan), aktifkan `pg_cron` di **Database** → **Extensions**, lalu jalanin:
```sql
CREATE OR REPLACE FUNCTION delete_expired_media()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT id, storage_path FROM media WHERE expires_at < NOW() LOOP
        DELETE FROM storage.objects
        WHERE bucket_id = 'cheyaverse-media' AND name = r.storage_path;
        DELETE FROM media WHERE id = r.id;
    END LOOP;
END;
$$;

SELECT cron.schedule('cleanup-expired-media', '0 * * * *', 'SELECT delete_expired_media()');
```
> **Pemberitahuan:** Kalo skip langkah ini, bot tetap akan bersihin otomatis saat startup + setiap 6 jam (lihat `main.py`)

---

### Setup Webapp (Vercel)

## 1. Persiapan

Pastikan repo udah di-push ke GitHub dengan struktur folder `dashboard/`

## 2. Deploy ke Vercel

1. Buka [vercel.com/new](https://vercel.com/new) → login dengan GitHub
2. Pilih repo project → klik **Import**
3. **Root Directory**: ubah ke **`dashboard`** (bukan `root)`!
4. **Framework Preset**: pastikan **Next.js** (auto-detect setelah Root Directory di-set)
5. **Build Command**: `next build` (default)
6. **Output Directory**: `.next` (default)
7. **Install Command**: `npm install` (default)

## 3. Environment Variables

Di section **Environment Variables**, tambahin satu-satu (klik **Add** tiap kali, centang 3 checkbox: Production, Preview, Development):

| Key | Value |
|---|---|
| `SUPABASE_URL` | `https://xxxxx.supabase.co` |
| `SUPABASE_KEY` | `eyJhbGci...` |
| `SUPABASE_BUCKET` | `cheyaverse-media` |
| `SUPABASE_TABLE` | `media` |
| `MEDIA_TTL_DAYS` | `30` |
| `SIGNED_URL_TTL` | `2592000` |
| `BOT_USERNAME` | `CheyaVersebot` |
| `PUBLIC_URL` | `https://cheyaverse.vercel.app` |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | (dari reCAPTCHA admin) |
| `RECAPTCHA_SECRET_KEY` | (dari reCAPTCHA admin) |

## 4. Setup reCAPTCHA v2

1. Buka [google.com/recaptcha/admin](https://www.google.com/recaptcha/admin)
2. **Create** → label bebas, type **reCAPTCHA v2 Checkbox**
3. **Domains**: tambahin `cheyaverse.vercel.app` dan `localhost`
4. Submit → dapet **Site Key** & **Secret Key**
5. Masukkan ke env vars Vercel di atas

## 5. Deploy

Klik **Deploy**. Tunggu ~2-3 menit. Kalau sukses, dapet URL production.

## 6. Update `PUBLIC_URL` di bot

Setelah deploy berhasil, update `.env` **bot** (bukan **webapp**):
```txt
PUBLIC_URL=https://cheyaverse.vercel.app
```
Restart bot, QR baru bakal nunjuk ke domain Vercel

---

### Catatan & Pemberitahuan

**Tentang barcode:**
- Barcode dari input teks → berfungsi **permanen** (nggak ada TTL, karena cuma nyimpen string)
- Barcode dari media (gambar/video) → berfungsi selama `MEDIA_TTL_DAYS` (default **30 hari**). Setelah expired, file media dihapus otomatis dari Supabase, tapi gambar barcode tetep ada

**Format URL:**
| Tipe | Format | Contoh |
|---|---|---|
| Barcode / dashboard personal | `{PUBLIC_URL}/{uid}/m/{id}` | `https://cheyaverse.vercel.app/123456789/m/7654321` |
| Link publik (hasil tombol Copy) | `{PUBLIC_URL}/m/{id}` | `https://cheyaverse.vercel.app/m/7654321` |
| Dashboard personal user | `{PUBLIC_URL}/{uid}` | `https://cheyaverse.vercel.app/123456789` |

- Link publik (`/m/{id}`) nampilin viewer **tanpa TabBar navigasi** — biar user yang di-share link nggak bisa lihat dashboard pemilik file
- Command `/web` di bot ngasih URL dashboard personal user

**Alur sistem:**
```
User upload media ke bot (caption /qr)
↓
Bot download dari Telegram → upload ke Supabase
↓
Bot generate QR berisi: {PUBLIC_URL}/{uid}/m/{id}
↓
User scan QR → browser buka viewer
↓
Viewer fetch signed URL dari Supabase → tampilkan media
↓
Klik Download → reCAPTCHA v2 muncul → verify → file di-proxy lewat server
```

**Keamanan:**
- File media **nggak pernah** di-redirect langsung ke Supabase URL — selalu di-proxy lewat server (biar signed URL nggak keliatan user)
- Tombol Raw sekarang **fullscreen**, bukan redirect
- reCAPTCHA v2 (Google) dipakai buat verifikasi sebelum download
- Kolom `owner_id` di tabel `media` → user cuma bisa lihat dashboard & file miliknya sendiri

**Batasan:**
- Max upload file: **5 MB**
- 1 barcode = 1 file (kecuali pakai media group di Telegram → bisa multi-file sekaligus)
- Media disimpan di Supabase, bukan di server bot

**Arsitektur Server:**
| Komponen | Hosting | Alasan |
|---|---|---|
| Bot Python (aiogram) | Lokal / VPS | Butuh long-running process, nggak bisa di Vercel |
| Webapp (Next.js) | **Vercel** | Serverless, scalable, gratis untuk personal |
| Media Storage | Supabase | Object storage + database |

- Bot jalan di **lokal** atau VPS (butuh polling Telegram 24/7 running)
- Webapp **udah di-deploy** di Vercel: `https://cheyaverse.vercel.app`
- Webapp juga bisa jalan lokal (`cd dashboard && npm run dev`) buat development
- Kalau mau ganti domain, update `PUBLIC_URL` di dua tempat: `.env` bot & env vars Vercel

**Troubleshooting:**
- Muncul chat `Unable to upload this file, please try again later.` + log `[ERROR] Failed to upload {kind} for {label}: {exc}` → server Supabase lagi down atau rate-limited, coba lagi beberapa saat
- QR di-scan tapi media nggak muncul → cek file udah expired (default 30 hari) atau `PUBLIC_URL` di `.env` salah
- Download stuck di reCAPTCHA → cek `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` & `RECAPTCHA_SECRET_KEY` di env vars Vercel
- Viewer kosong / loading terus → cek `SUPABASE_URL` & `SUPABASE_KEY` di env vars Vercel
- Dashboard personal nampilin "Belum ada media" padahal udah upload → cek `owner_id` di tabel `media` udah keisi (upload ulang kalau file lama)
- **Rename gagal dengan error `db_error` (500)** → cek policy `media_update` udah dibuat di Supabase (lihat section RLS di atas)
- **Delete gagal padahal udah 200 OK di log** → media mungkin udah kehapus sebelumnya (refresh list). Cek juga policy `media_delete` & `media_bucket_delete` udah bener

**Migrasi dari versi lama:**
- Server web lama (`web.py` aiohttp) **udah deprecated** — diganti Next.js di `dashboard/`
- Kolom `owner_id` ditambahin di update terbaru. File lama yang belum punya bakal `NULL` dan nggak muncul di dashboard manapun (harus upload ulang)
- Format URL berubah dari `{host}:{port}/m/{id}` → `{PUBLIC_URL}/{uid}/m/{id}` (scoped per user)
- Policy `media_update` ditambahin di RLS section — perlu dijalanin kalau lo setup Supabase sebelum update ini
