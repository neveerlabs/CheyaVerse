# CheyaVerse — Setup

Panduan lengkap setup bot & web CheyaVerse

## Requirements

| **Item** | **Keterangan** |
|---|---|
| Python | 3.11 – 3.14 |
| Telegram Bot Token | Dari [@BotFather](https://t.me/BotFather) |
| Koneksi internet | Wajib |
| RAM minimum | 256 MB |
| Storage minimum | 150 MB |
| Turso | Wajib |
| Telegram Storage Chat | Wajib |

## Struktur Folder
```
CheyaVerse/
├── assets/
│ ├── background.png
│ └── cheyaverse.jpg
├── handlers/
│ ├── init.py
│ ├── help.py
│ ├── qr.py
│ ├── start.py
│ └── web.py
├── dashboard/
│ ├── public/
│ │ └── assets/
│ │ ├── cheyaverse.jpg
│ │ ├── model.gif
│ │ └── ok.gif
│ ├── src/
│ ├── package.json
│ └── ...
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
- Database pakai `Turso`, storage media pakai **Telegram Storage Chat**

### 1. Update package manager

```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Verifikasi versi python
```bash
python3 --version
pip3 --version
```

Kalau versi **Python** di bawah `3.11`, install versi terbaru:
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

### 5. Setup Telegram Storage Chat

1. Bikin grup/channel private (bebas, contoh: `CheyaVerse Storage`)
2. Add bot sebagai admin — kasih izin kirim pesan & hapus pesan
3. Ambil chat ID-nya, cara paling gampang:
    - Kirim pesan apa aja di grup/channel
    - Forward pesan itu ke `@userinfobot` atau `@RawDataBot`
    - Copy `chat.id` (formatnya `-100xxxxxxxxxx` buat supergroup)
4. Simpen ID-nya buat diisi ke `.env`

    > Chat ini dipake bot buat nyimpen file media hasil upload user. File di sini **nggak bakal keliatan** user lain, cuma bot yang akses.

### 6. Update isi file `.env` (bot Python)
Bikin file `.env` di root project:
```txt
BOT_TOKEN=
PUBLIC_URL=http://{host}:8080
MEDIA_TTL_DAYS=30
TURSO_URL=
TURSO_AUTH_TOKEN=
TELEGRAM_STORAGE_CHAT_ID=
```

> Catatan:
>- `BOT_TOKEN` = token dari @BotFather
>- `PUBLIC_URL` = URL webapp. Isi URL Vercel (`https://cheyaverse.vercel.app`) kalau udah deploy, atau IP lokal (`http://192.168.x.x:8080`) kalau masih lokal
>- `MEDIA_TTL_DAYS` = masa simpan media (default 30 hari)
>- `TURSO_URL` & `TURSO_AUTH_TOKEN` = kredensial Turso (lihat section Setup Turso)
>- `TELEGRAM_STORAGE_CHAT_ID` = chat ID dari step 5

> **Disclaimer:** _Ganti `{host}` dengan IP lokal (client IP). Cek:_
```bash
ip addr show | grep "inet " | grep -v 127.0.0.1
```

### 7. Running bot
```bash
python3 main.py
```
Bot akan jalan dan polling ke Telegram. Biarkan terminal ini tetap terbuka.

### 8. Running webapp (opsional, kalau lokal)
> **Skip bagian ini kalau webapp udah di-deploy di Vercel.** Bot tetap bisa jalan tanpa webapp lokal, karena link QR nunjuk ke `PUBLIC_URL`

Kalau mau jalanin webapp lokal:
```bash
cd dashboard
npm install
npm run dev
```

Webapp jalan di `http://localhost:8080`. Buka di browser buat preview viewer & dashboard

> **Penting:** Set `PUBLIC_URL=http://192.168.x.x:8080` di `.env` Python & `dashboard/.env` kalau mau QR bisa di-scan dari HP lain di WiFi yang sama.

## Log yg benar harus seperti ini
**Server bot**
```bash
[HH:MM:SS] [INFO] CheyaVerse bot is starting...
[HH:MM:SS] [INFO] QR assets verified.
[HH:MM:SS] [INFO] Public viewer base: http://{host}:{port}
[HH:MM:SS] [INFO] Startup cleanup: no expired media found.
[HH:MM:SS] [INFO] Bot active: @username | Name | ID: 123456789
[HH:MM:SS] [INFO] Polling engaged. Press CTRL+C to stop.
```

**Server Webap**
```bash
▲ Next.js 14.2.18
- Local:        http://localhost:8080
✓ Ready in 2.1s
```

> **Catatan:** Log webapp cuma muncul kalo dijalanin dilokal. Kalo udah di Vercel, log-nya ada di dashboard Vercel → Deployments → Logs

## Setup Turso

**1. Bikin database**

1. Login ke `turso.tech` → **Create Database**
2. Isi nama database (contoh: `cheyaverse`)
3. Pilih region terdekat (contoh: `Singapore` / `ap-southeast-1`)
4. Klik **Create**

**2. Ambil URL & Auth Token**

1. Buka database yang baru dibuat → tab **Overview**
2. Copy **URL** (formatnya `libsql://xxxxx.turso.io`) → simpen buat `TURSO_URL`
3. Klik **Generate Token** → copy token-nya → simpen buat `TURSO_AUTH_TOKEN`

    > **PENTING:** _Token cuma muncul sekali pas generate. Kalau kelewat, generate ulang aja. Jangan share token ke publik_

**3. Bikin Tabel Media**

Buka tab **SQL Editor** (atau pakai Turso CLI), jalanin SQL ini:
```sql
CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    owner_id INTEGER,
    filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    storage_message_id INTEGER,
    content_type TEXT,
    file_size INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_expires_at ON media (expires_at);
CREATE INDEX IF NOT EXISTS idx_media_owner_id ON media (owner_id);
```

> **Catatan:** Kolom `owner_id` nyimpen Telegram user ID pemilik file. Dipakai webapp buat filter dashboard personal — user cuma bisa liat file yang dia upload. Kolom `storage_message_id` dipake bot buat hapus pesan di Telegram Storage Chat pas cleanup.

**4. (Migrasi) Kalo tabel `media` udah ada sebelumnya**

Kalau udah pernah bikin tabel `media` sebelum update ini, jalanin SQL ini buat nambahin kolom baru tanpa kehilangan data:
```sql
ALTER TABLE media ADD COLUMN IF NOT EXISTS owner_id INTEGER;
ALTER TABLE media ADD COLUMN IF NOT EXISTS storage_message_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_media_owner_id ON media (owner_id);
```

> File lama yang belum punya `owner_id` bakal jadi `NULL`. Bisa dihapus manual atau dibiarin (nggak muncul di dashboard manapun)

**5. Auto-Cleanup**

Bot bakal otomatis bersihin media expired pas startup + setiap 6 jam (lihat `main.py` → `_cleanup_loop`). Nggak perlu setup tambahan

## Setup Webapp (Vercel)

**1. Persiapan**
Pastikan repo udah di-push ke GitHub dengan struktur folder `dashboard/`

**2. Deploy ke Vercel**

1. Buka vercel.com/new → login dengan GitHub
2. Pilih repo project → klik **Import**
3. **Root Directory:** ubah ke `dashboard` (bukan `root`)!
4. **Framework Preset:** pastikan **Next.js** (auto-detect setelah Root Directory di-set)
5. **Build Command:** `next build` (default)
6. **Output Directory:** `.next` (default)
7. **Install Command:** `npm install` (default)

**3. Environment Variables**

Di section **Environment Variables**, tambahin satu-satu (klik **Add** tiap kali, centang 3 checkbox: Production, Preview, Development):

| **Key** | **Value** |
|---|---|
| `TURSO_URL` | `libsql://xxxxx.turso.io` |
| `TURSO_AUTH_TOKEN` | `eyJhbGci...` |
| `TELEGRAM_BOT_TOKEN` | token bot dari @BotFather |
| `BOT_USERNAME` | `CheyaVersebot` |
| `PUBLIC_URL` | `http://{host}:{port}` |
| `MEDIA_TTL_DAYS` | `30` |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | (dari reCAPTCHA admin) |
| `RECAPTCHA_SECRET_KEY` | (dari reCAPTCHA admin) |
| `TELEGRAM_STORAGE_CHAT_ID` | **ID Grup Channel** |

> `TELEGRAM_BOT_TOKEN` di webapp harus sama dengan `BOT_TOKEN` di `.env` bot. Dipake webapp buat proxy file dari Telegram API

**4. Setup reCAPTCHA v2**

1. Buka google.com/recaptcha/admin
2. **Create** → label bebas, type **reCAPTCHA v2 Checkbox**
3. **Domains:** tambahin `cheyaverse.vercel.app` dan `localhost`
4. Submit → dapet **Site Key** & **Secret Key**
5. Masukkan ke env vars Vercel di atas

**5. Deploy**

Klik **Deploy**. Tunggu ~2-3 menit. Kalau sukses, dapet URL production.

**6. Update PUBLIC_URL di bot**

Setelah deploy berhasil, update `.env` **bot** (bukan **webapp**):
```txt
PUBLIC_URL=https://cheyaverse.vercel.app
```
Restart bot, QR baru bakal nunjuk ke domain Vercel

**7. Setup `dashboard/.env` (lokal)**
Kalau lo jalanin webapp lokal (bukan di Vercel), bikin file `dashboard/.env`:
```txt
MEDIA_TTL_DAYS=30
BOT_USERNAME=CheyaVersebot
PUBLIC_URL=http://{host}:8080
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=
RECAPTCHA_SECRET_KEY=
TURSO_URL=
TURSO_AUTH_TOKEN=
TELEGRAM_BOT_TOKEN=
TELEGRAM_STORAGE_CHAT_ID=
```

## Catatan & Pemberitahuan

**Tentang barcode:**
- Barcode dari input teks → berfungsi **permanen** (nggak ada TTL, karena cuma nyimpen string)
- Barcode dari media (gambar/video) → berfungsi selama `MEDIA_TTL_DAYS` (default **30 hari**). Setelah expired, file media dihapus otomatis dari Telegram Storage Chat, tapi gambar barcode tetep ada
- Isi `TELEGRAM_STORAGE_CHAT_ID` di isi dengna **ID grup Channel**

**Format URL:**

| **Tipe** | **Format** | **Contoh** |
|--|--|--|
| Barcode / dashboard personal | `{PUBLIC_URL}/{uid}/m/{id}` | `https://cheyaverse.vercel.app/123456789/m/7654321` |
| Link publik (hasil tombol Copy) | `{PUBLIC_URL}/m/{id}` | `https://cheyaverse.vercel.app/m/7654321` |
| Dashboard personal user | `{PUBLIC_URL}/{uid}` | `https://cheyaverse.vercel.app/123456789` |

- Link publik (`/m/{id}`) nampilin viewer **tanpa TabBar navigasi** — biar user yang di-share link nggak bisa lihat dashboard pemilik file
- Command `/web` di bot ngasih URL dashboard personal user

**Alur sstem**
```
User upload media ke bot (caption /qr)
↓
Bot copy file ke Telegram Storage Chat (dapet file_id baru)
↓
Bot simpan metadata ke Turso (id, owner_id, file_id, storage_message_id)
↓
Bot generate QR berisi: {PUBLIC_URL}/{uid}/m/{id}
↓
User scan QR → browser buka viewer
↓
Viewer proxy file dari Telegram via /api/media/{id}/content
↓
Klik Download → reCAPTCHA v2 muncul → verify → file di-proxy lewat server
```

**Keamanan:**
- File media **nggak pernah** di-redirect langsung ke Telegram API URL — selalu di-proxy lewat server
- Tombol Raw sekarang **fullscreen**, bukan redirect
- reCAPTCHA v2 (Google) dipakai buat verifikasi sebelum download
- Kolom `owner_id` di tabel `media` → user cuma bisa lihat dashboard & file miliknya sendiri
- View preference (list/grid) disimpan di cookie, bukan database — biar gak ada tracking tambahan ke server

**Batasan:**
- Max upload file: **5 MB**
- 1 barcode = 1 file (kecuali pakai media group di Telegram → bisa multi-file sekaligus)
- Media disimpan di Telegram Storage Chat, metadata di Turso

**Arsitektur Server:**
| **Komponen** | **Hosting** | **Alasan** |
|--|--|--|
| Bot Python (aiogram) | Lokal / VPS | Butuh long-running process, nggak bisa di Vercel |
| Webapp (Next.js) | **Vercel** | Serverless, scalable, gratis untuk personal |
| Metadata DB | **Turso** | SQLite edge, gratis, gampang |
| Media Storage | **Telegram Storage Chat** | Gratis, gede, gak perlu S3 |

- Bot jalan di lokal atau VPS (butuh polling Telegram 24/7 running)
- Webapp udah di-deploy di Vercel: https://cheyaverse.vercel.app
- Webapp juga bisa jalan lokal (cd dashboard && npm run dev) buat development
- Kalau mau ganti domain, update PUBLIC_URL di dua tempat: .env bot & env vars Vercel

**Troubleshooting:**

- Muncul chat Unable to upload this file, please try again later. + log [ERROR] Failed to upload {kind} for {label}: {exc} → cek TELEGRAM_STORAGE_CHAT_ID udah bener & bot udah jadi admin di grup storage
- Log TELEGRAM_STORAGE_CHAT_ID is not configured → isi env-nya di .env bot
- QR di-scan tapi media nggak muncul → cek file udah expired (default 30 hari) atau PUBLIC_URL di .env salah
- Download stuck di reCAPTCHA → cek NEXT_PUBLIC_RECAPTCHA_SITE_KEY & RECAPTCHA_SECRET_KEY di env vars Vercel
- Viewer kosong / loading terus → cek TURSO_URL & TURSO_AUTH_TOKEN di env vars Vercel
- Dashboard personal nampilin "Belum ada media" padahal udah upload → cek owner_id di tabel media udah keisi (upload ulang kalau file lama)
- Rename gagal → cek TURSO_AUTH_TOKEN masih valid & punya permission write
- Delete gagal padahal udah 200 OK di log → media mungkin udah kehapus sebelumnya (refresh list)
- Video thumbnail gak muncul → browser gagal decode frame. Coba hard refresh (Ctrl+Shift+R). Kalau tetap gagal, video corrupt atau format tidak didukung browser.
- Turso error 401 Unauthorized → token expired / salah. Generate ulang di dashboard Turso.

**Migrasi dari versi lama:**

- Server web lama (web.py aiohttp) udah deprecated — diganti Next.js di dashboard/
- Storage pindah dari Supabase → Turso (metadata) + Telegram Storage Chat (file)
- Kolom owner_id & storage_message_id ditambahin di update terbaru. File lama yang belum punya bakal NULL dan nggak muncul di dashboard manapun (harus upload ulang)
- Format URL berubah dari {host}:{port}/m/{id} → {PUBLIC_URL}/{uid}/m/{id} (scoped per user)
