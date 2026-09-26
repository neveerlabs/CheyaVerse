<div align="center">
    <h1>CheyaVerse</h1>
    <p>Panduan setup bot & webapp CheyaVerse</p>
</div>

---

## Requirements

- Node.js 18+
- Akun [Turso](https://turso.tech) (database SQLite cloud)
- Bot Telegram + token dari [@BotFather](https://t.me/BotFather)
- Google [reCAPTCHA v2](https://www.google.com/recaptcha/admin/)
- Channel Group Telegram ID

---

## Setup bot

### 1. Clone & Install

```bash
git clone https://github.com/neveerlabs/CheyaVerse.git
cd CheyaVerse
```

### 2. Install dependen

```bash
pip install -r requirements.txt
```

### 3. Update isi file `.env`

```txt
BOT_TOKEN=
PUBLIC_URL=
MEDIA_TTL_DAYS=30
TURSO_URL=
TURSO_AUTH_TOKEN=
TELEGRAM_STORAGE_CHAT_ID=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@example.com
```

### 4. Running bot

```bash
python3 main.py
```

---

## Setup webapp

### 1. Masuk kedalam path project

```bash
cd dashboard
```

### 2. Install library

```bash
npm install
```

### 3. Create file `.env`

```txt
MEDIA_TTL_DAYS=30
BOT_USERNAME=CheyaVersebot
PUBLIC_URL=
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=
RECAPTCHA_SECRET_KEY=
TURSO_URL=
TURSO_AUTH_TOKEN=
TELEGRAM_BOT_TOKEN=
TELEGRAM_STORAGE_CHAT_ID=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@example.com
```

> **Login Telegram:** Isi `BOT_USERNAME` pada `.env` web dengan username bot (tanpa `@`). Pengguna membuka link sekali pakai ke bot dan memilih Setujui atau Tolak di chat pribadi. Bot harus online dan `.env` bot/web harus terhubung ke database Turso yang sama. Domain web tidak perlu didaftarkan dengan `/setdomain` untuk metode login ini.

Setiap permintaan login berlaku selama lima menit, hanya dapat digunakan sekali, dan bot mengambil ID Telegram dari update resmi Telegram—bukan dari browser. Setelah disetujui, session web ditandatangani dengan `TELEGRAM_BOT_TOKEN`; jangan membagikan token dan segera rotasi token jika pernah terekspos. Device ID dibuat setelah identitas Telegram berhasil diverifikasi. Tabel `telegram_login_challenges` dibuat otomatis; tidak perlu menghapus atau membuat ulang tabel database.

Untuk push saat bot menghapus media yang kedaluwarsa, isi `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, dan `VAPID_SUBJECT` di `.env` bot dengan pasangan yang sama seperti `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, dan `VAPID_SUBJECT` di `.env` web.

### 4. Buat tabel di Turso

```sql
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  owner_id INTEGER,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  storage_message_id INTEGER,
  content_type TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS telegram_users (
  uid INTEGER PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  photo_file_id TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS "akun-telegram" (
  uid INTEGER PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  photo_url TEXT,
  photo_file_id TEXT,
  auth_date INTEGER,
  allows_write_to_pm INTEGER,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_akun_telegram_name
  ON "akun-telegram"(first_name, last_name);
CREATE INDEX IF NOT EXISTS idx_akun_telegram_username
  ON "akun-telegram"(username);

CREATE TABLE IF NOT EXISTS direct_messages (
  id TEXT PRIMARY KEY,
  sender_uid INTEGER NOT NULL,
  recipient_uid INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  delivered_at TEXT,
  read_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_direct_messages_participants
  ON direct_messages(sender_uid, recipient_uid, created_at);
CREATE INDEX IF NOT EXISTS idx_direct_messages_recipient_unread
  ON direct_messages(recipient_uid, read_at, created_at);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  uid INTEGER NOT NULL,
  device_id TEXT,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  uid INTEGER NOT NULL,
  sender TEXT NOT NULL,
  sender_role TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  delivered_at TEXT,
  read_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_uid_created ON messages(uid, created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  uid INTEGER NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  ip TEXT,
  location TEXT,
  device TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_uid_created ON notifications(uid, created_at);

CREATE TABLE IF NOT EXISTS device_ids (
  device_id TEXT NOT NULL,
  uid INTEGER NOT NULL,
  fingerprint TEXT NOT NULL,
  device_type TEXT,
  os TEXT,
  brand TEXT,
  model TEXT,
  browser TEXT,
  cpu_cores INTEGER,
  ram_gb REAL,
  user_agent TEXT,
  language TEXT,
  timezone TEXT,
  platform TEXT,
  max_touch INTEGER,
  color_depth INTEGER,
  webgl_vendor TEXT,
  webgl_renderer TEXT,
  screen_w INTEGER,
  screen_h INTEGER,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  PRIMARY KEY (device_id, uid)
);

CREATE TABLE IF NOT EXISTS session_blacklist (
  device_id TEXT NOT NULL,
  uid INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (device_id, uid)
);

CREATE TABLE IF NOT EXISTS user_covers (
  uid INTEGER PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'color',
  color1 TEXT,
  color2 TEXT,
  icon TEXT,
  storage_path TEXT,
  storage_message_id INTEGER,
  content_type TEXT,
  bg_size REAL,
  bg_x REAL,
  bg_y REAL,
  updated_at TEXT
);
```
> **Pemberitahuan:** *Pastikan database sudah terbuat dengan nama `cheyaverse` di turso*
> Aplikasi menambahkan tabel akun `"akun-telegram"` dan `direct_messages` secara otomatis. Kolom fingerprint device yang baru juga dimigrasikan otomatis pada akses pertama. DDL di atas mencantumkan skema lengkap untuk instalasi baru.

### 5. Running server

```bash
npm run dev
```
> **Disclaimer:** *Biasakan setiap kali update server atau ingin running, folder `.next` sudah terhapus untuk mencegah adanya bug apapun saat deployment*

---

## Catatan & pemberitahuan
- Biasakan untuk sellau menghapus folder `.next` untuk kelancaran **running web**
- Untuk deploy, arahkan root project pada folder `dashboard` (bukan `root`). Dan untuk file `.env` nya, bukan diclone dari repo, emlainkan isi manual / upload di **dashboard UI** web hosting
- Pastikan `PUBLIC_URL` yg di `.env` **bot** & **web** isinya sama
- Login Telegram pada setiap domain memerlukan domain tersebut didaftarkan di BotFather; URL `trycloudflare.com` sementara perlu didaftarkan ulang saat hostname berubah
- Chat hanya mencari akun yang sudah login/register di CheyaVerse. Untuk akun yang belum ditemukan, tombol undangan membuka Telegram Share dengan pesan terisi; pemilik harus memilih penerima dan menekan kirim di Telegram
- Apabila webapp sudah **dideploy** tetapi saat percobaan unduh data media gagal karena reCAPTCHA tidak dapat muncul, itu bukan bug atau error kode! Lihat data di file `.env` nya dan pastikan di web hosting seluruh data file `.env` benar benar valid dan terisi
- Apabila file `.env` bot belum diisi, maka bot akan shutdown dengan sendirinya saat di running

<div align="center">

### Frontend / Webapp

![Next.js](https://img.shields.io/badge/Next.js_14-000000?style=for-the-badge&logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React_18-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Lucide](https://img.shields.io/badge/Lucide_Icons-F56565?style=for-the-badge&logo=lucide&logoColor=white)

### Backend / Runtime

![Node.js](https://img.shields.io/badge/Node.js_18+-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Next.js API](https://img.shields.io/badge/Next.js_API_Routes-000000?style=for-the-badge&logo=next.js&logoColor=white)
![Edge Runtime](https://img.shields.io/badge/Node_Runtime-5FA04E?style=for-the-badge&logo=nodedotjs&logoColor=white)

### Bot & Integrasi

![Telegram](https://img.shields.io/badge/Telegram_Bot_API-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![reCAPTCHA](https://img.shields.io/badge/reCAPTCHA_v2-4285F4?style=for-the-badge&logo=google&logoColor=white)

### Database & Storage

![Turso](https://img.shields.io/badge/Turso-4FF8D2?style=for-the-badge&logo=turso&logoColor=black)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white)
![Telegram Storage](https://img.shields.io/badge/Telegram_Storage-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)

### Deployment

![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)
![Suga](https://img.shields.io/badge/Suga-FF6B6B?style=for-the-badge&logo=vercel&logoColor=white)

### Tools & Utilities

![ESLint](https://img.shields.io/badge/ESLint-4B32C3?style=for-the-badge&logo=eslint&logoColor=white)
![PostCSS](https://img.shields.io/badge/PostCSS-DD3A0A?style=for-the-badge&logo=postcss&logoColor=white)
![npm](https://img.shields.io/badge/npm-CB3837?style=for-the-badge&logo=npm&logoColor=white)

</div>

---

### Penggunaan Stack Project

| Layer | Teknologi | Fungsi |
|---|---|---|
| **Framework Web** | Next.js 14 (App Router) | SSR, RSC, routing, API routes |
| **UI Library** | React 18 | Component rendering |
| **Bahasa** | TypeScript | Type-safe development |
| **Styling** | Tailwind CSS | Utility-first CSS |
| **Icons** | Lucide React | Icon set modern |
| **Bot Runtime** | Python + Telegram Bot API | Handler command `/web`, `/qr`, upload media |
| **Database** | Turso (libSQL) | Database SQLite cloud, low-latency |
| **Storage File** | Telegram Bot API | Penyimpanan file media |
| **Auth / Verification** | Google reCAPTCHA v2 | Proteksi endpoint download |
| **Realtime** | Adaptive HTTP Polling | Kompatibel dengan Vercel (serverless) |
| **Caching** | In-memory + IndexedDB | Cache media & thumbnail video di client |
| **Deployment** | Vercel / Suga | Serverless hosting |

---

### 🎨 Design System

<div align="center">

![Mobile-First](https://img.shields.io/badge/Mobile--First-4F46E5?style=flat-square)
![Responsive](https://img.shields.io/badge/Responsive-06B6D4?style=flat-square)
![Accessible](https://img.shields.io/badge/Accessible-10B981?style=flat-square)
![SSR](https://img.shields.io/badge/SSR_Compatible-FF6B6B?style=flat-square)
![PWA Ready](https://img.shields.io/badge/PWA_Ready-5A0FC8?style=flat-square)

</div>

<div align="center">

![Version](https://img.shields.io/badge/version-1.7.3-blue?style=for-the-badge)
![Status](https://img.shields.io/badge/status-active-success?style=for-the-badge)

</div>
