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

## Struktur Folder Setelah Setup
```
CheyaVerse/
├── assets/
│ ├── model.gif
│ ├── ok.gif
│ ├── background.png
│ └── cheyaverse.jpg
├── handlers/
│ ├── init.py
│ ├── help.py
│ ├── qr.py
│ └── start.py
├── .env
├── .env.example
├── .gitignore
├── config.py
├── logger.py
├── main.py
├── storage.py
├── web.py
└── requirements.txt
```

Folder `assets/` **wajib** ada 2 file gambar:
- `model.gif` — karakter gif page 404
- `ok.gif` — karakter gif verification
- `background.png` — template QR
- `cheyaverse.jpg` — logo profile CheyaVerse
> Karena untuk penggunaan generate barcode

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
PUBLIC_URL=http://{host}:8080
WEB_HOST=0.0.0.0
WEB_PORT=8080
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_BUCKET=cheyaverse-media
SUPABASE_TABLE=media
MEDIA_TTL_DAYS=30
SIGNED_URL_TTL=2592000
```
> **Catatan:** _Isi file `.env` dengan susunan tutorial dibawah. Data media disimpan selama 30 hari didalm **Supabase**_

> **Disclaimer**: _Ganti `{host}` dengan IP lokal (client IP)._ Cek:
```bash
ip addr show | grep "inet " | grep -v 127.0.0.1
```

### 6. Running bot
```bash
python3 main.py
```

### 7. Running web
```bash
python3 web.py
```

### Log yg benar harus seperti ini
- **Server bot**
  ```bash
  [HH:MM:SS] [INFO] CheyaVerse is running...
  [HH:MM:SS] [INFO] QR assets verified.
  [HH:MM:SS] [INFO] Public viewer base: http://{host}:8080
  [HH:MM:SS] [INFO] Bot active: @username | Name | ID: 123456
  [HH:MM:SS] [INFO] Web viewer listening on http://0.0.0.0:8080
  [HH:MM:SS] [INFO] Polling engaged. Press CTRL+C to stop.
  ```
- **server web**
  ```bash
  [HH:MM:SS] [INFO] CheyaVerse webapp is starting...
  [HH:MM:SS] [INFO] Public viewer base: http://{host}:8080
  [HH:MM:SS] [INFO] CheyaShield captcha enabled on /download.
  ```

---

### Setup supabase

## 1. Buat project

1. Buka [supabase.com](https://supabase.com) → **Start your project**
2. Klik **New Project**
3. Isi:
   - **Name**: `CheyaVerse` (bebas)
   - **Database Password**: klik `generaye password`, **simpan**
   - **Region**: pilih terdekat (mis. **Singapore**/**Asia**)
   - **Pricing Plan**: Free (kalo emang lagi gak ada cuan, xixixi)
4. Klik **Create new project** → tunggu 1–2 menit

## 2. Ambil URL & Key

1. Di dashboard, klik **Project Settings** → **API Keys** → **Legacy anon, service_role API keys**
2. Catat 2 value:

| Nama di Dashboard | Masuk ke `.env` sebagai |
|---|---|
| **Project URL** | `SUPABASE_URL` |
| **`anon public`** (di Project API Keys) | `SUPABASE_KEY` |
> **Notice:** Untuk mendapatkan **Project URL**, ada di bagian **Project Overview** → klik tombol `copy` yg dibawah nama project → klik tombol **Project URL**

**DISCLAIMER:** Ambil key **`anon public`**, jangan `service_role`. Key `service_role` punya akses full admin, **JANGAN pernah** ditaruh / sim[an di kode publik

## 3. Buat Bucket Storage

1. Di sidebar, klik **Storage**
2. Klik **New bucket**
3. Isi:
   - **Name**: `cheyaverse-media` (isinya harus sama dengan yg di `.env`)
   - **Public bucket**: **JANGAN** dicentang
   - **File size limit**: biarkan default
4. Klik **Save**
> **Saran:** _buat bagian pilihan opsi, ada baiknya gak usah ada yg di centang, tapi terserah_

## 4. Bikin Tabel Media

1. Di sidebar, klik **SQL Editor** → **+ New query**
2. Isi input SQL berikut:

```sql
CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    content_type TEXT,
    file_size BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_expires_at ON media (expires_at);
```
3. Klik **Run** (atau `Ctrl + Enter`)
4. Pastikan muncul output **"Success. No rows returned"**

## 5. Setup Row Level Security (RLS) Policy
**Langkah yang WAJIB**. Tanpa ini, upload akan gagal dengan error `new row violates row-level security policy`

Di **SQL Editor** → **+ New query**
```sql
DROP POLICY IF EXISTS "media_select" ON media;
DROP POLICY IF EXISTS "media_insert" ON media;
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

## 6. Verifikasi Policy
Jalanin SQL ini buat memastikan policy udah aktif
```sql
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('media', 'objects')
ORDER BY tablename, policyname;
```

## 7. (Opsional) Auto-Cleanup dengan pg_cron
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

### Catatan & pemberitahuan
- barcode yg dihasilkan dari input teks, berfungsi secara permanen
- barcode yg dihasolkan dari media (gambar/video), berfungsi permanen, namun... tidak akan berfungsi lama, hanya 30 hari saja dikarenakan data medianya disimpan didalam server `supabase`
- webapp view nya untuk menampilkan isi file file foto/video dari barcode yg di scan, hanya dapat di akses di lokal, karena tidak di publish. Jika anda bersedia dan ingin membantu saya atau pun itu memberi, tolonglah, saya ingin webapp nya di deploy, tapi ini membutuhkan `aiohttp` dan tidak statis datanya karena datanya diambil dari url barcode!
- server bot dan juga server webapp nya berjalan dari localhost
- Data media untuk upload generate barcode max 10 MB
- Gka bisa generate barcode dari beberapa file sekaligus (setiap satu barcode yg dibuat harus satu file yg diupload)
- Jika muncul pesan chat `Unable to upload this file, please try again later.` dari bot saat generate barcode dan di log console lognya seperti ini `[HH:MM:SS] [ERROR] Failed to upload {kind} for {label}: {exc}`, jelas itu bukan kesalahan di kode, tapi emang server supabase nya aja yg mungkin lagi down
- server bot dan webapp running di lokal, belum di deploy di server luar
- webapp hanya dapat diakses dari jaringan lokal, dan untuk scan barcode dari barcode yg dibuat dengan upload meida, tidak akan bisa digunakan/tampilkan medianya karena isi barcode media ialah url untuk ke webapp. Jadi intinya, alurnya seperti ini: barcode media (isinya url untuk redirect ke webapp) > scan barcode redirect ke webapp > webapp menampilkan media dari url supabase.
- format isi url dari barcode dan url webapp: `{host}:{port}/m/{id}`
