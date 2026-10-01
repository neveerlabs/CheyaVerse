<div align="center">
    <h1>CheyaVerse</h1>
    <p>Panduan setup bot & webapp CheyaVerse</p>
</div>

---

## Requirements

- Node.js 20+
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
ADMIN_TELEGRAM_IDS=
BROADCAST_WEB_SECRET=
```

`TURSO_URL` dan `TURSO_AUTH_TOKEN` harus diambil dari **database Turso yang sama** dengan yang dipakai web. URL database Turso bisa ditampilkan sebagai `turso://...` atau `libsql://...`; keduanya didukung aplikasi ini. Contoh URL yang ada di konfigurasi lokal saat panduan ini diperbarui adalah `libsql://cheyaverse-neverlabs.aws-ap-northeast-1.turso.io`. Jangan mengisi URL dengan nama database saja, dan jangan menaruh auth token di URL.

`ADMIN_TELEGRAM_IDS` hanya untuk bot (bukan web): isi ID numerik akun admin, pisahkan dengan koma, dan biarkan key ini tetap di `.env` yang tidak di-commit. Bot mencatat ID numerik setiap akun Telegram yang mengirim pesan atau command ke bot dalam tabel `telegram_bot_user_ids`; ID unik dan trigger database menolak operasi update/delete. Saat tabel pertama kali dibuat, bot juga memasukkan ID akun yang sudah tercatat di tabel akun web. Interaksi Telegram lama yang tidak pernah masuk database akun tidak dapat dipulihkan oleh Bot API; ID pengirim baru akan tercatat setelah bot diperbarui dan dijalankan.

`BROADCAST_WEB_SECRET` harus memakai nilai rahasia acak yang sama di `.env` bot dan environment web (local dan deployment). Jangan commit atau membagikan nilainya. Bot memakai key ini untuk memanggil endpoint internal web saat broadcast.

Admin dapat mengirim pengumuman ke semua ID user client bot yang tercatat dengan `/pesan isi pengumuman`, atau mengirim media dengan caption `/pesan isi pengumuman`. ID admin dikecualikan dari penerima Telegram dan web. Pengumuman juga disimpan sebagai notifikasi dan pesan sistem untuk semua akun web aktif, dikirim ke koneksi realtime yang sedang terbuka, dan diteruskan sebagai web push jika tersedia. Bot mengirim laporan pribadi ke admin bila salah satu jalur broadcast mengalami error atau tidak ada penerima.

Isi pengumuman mendukung `**bold**`, `*bold*`, `_italic_`, `__underline__`, baris kutipan `> ...`, daftar `- ...`, `&nbsp;`, dan fenced code block dengan label bahasa. Isi teks di-escape sebelum ditafsirkan sebagai format agar markup tidak menjadi HTML aktif. Garis pemisah dibuat pendek agar tetap konsisten pada layar sempit; Bot API tidak memberi tahu apakah penerima membaca pesan di perangkat mobile atau desktop, jadi format tidak dapat dipilih per perangkat.

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
BROADCAST_WEB_SECRET=
TELEGRAM_BOT_TOKEN=
TELEGRAM_STORAGE_CHAT_ID=
ADMIN_TELEGRAM_IDS=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@example.com
GITHUB_TOKEN_ENCRYPTION_KEY=
```

### 4. Buat database dan tabel Turso melalui web

1. Buka [Turso Dashboard](https://app.turso.tech/) lalu masuk ke akun Turso.
2. Dari menu **Databases**, pilih **Create Database**. Masukkan nama database (contoh: `cheyaverse`) dan pilih lokasi/region yang tersedia. Tunggu sampai database selesai dibuat.
3. Buka database yang baru dibuat, masuk ke **Shell** atau **SQL** (nama menu dapat berubah mengikuti versi dashboard).
4. Salin seluruh blok SQL pada bagian [SQL skema awal](#sql-skema-awal) di bawah, tempel ke editor, lalu jalankan. Blok ini membuat tabel dasar dan index dengan `IF NOT EXISTS`, sehingga aman dijalankan ulang.
5. Pada halaman database, buka **Connect** atau detail koneksi. Salin **Database URL** dan buat/salin **Auth Token**. URL dapat diawali `turso://` pada dashboard baru atau `libsql://` pada tampilan/akun lama; jangan mengubah hostname-nya. Aplikasi menerima kedua prefix tersebut.
6. Isi `TURSO_URL` dan `TURSO_AUTH_TOKEN` di `.env` dashboard **dan** `.env` bot dengan URL/token dari database yang sama. Jangan commit atau membagikan token. Untuk deployment, isi kedua variabel itu di Environment Variables hosting web dan di environment tempat bot dijalankan.
7. Restart bot dan web. Aplikasi membuat tabel tambahan serta kolom migrasi yang diperlukan secara otomatis saat fitur terkait pertama kali digunakan.

> Pada konfigurasi dashboard lokal saat ini, URL yang terbaca adalah `libsql://cheyaverse-neverlabs.aws-ap-northeast-1.turso.io`. Jika detail koneksi database baru menampilkan `turso://cheyaverse-neverlabs.aws-ap-northeast-1.turso.io`, gunakan URL yang diberikan untuk database baru tersebut dan pastikan URL identik dipasang di konfigurasi bot serta web. Auth token lama tidak dapat dipakai untuk database baru.

`ADMIN_TELEGRAM_IDS` di `.env` dashboard berisi ID Telegram numerik admin, dipisahkan koma jika lebih dari satu. Akun-akun ini mendapat lencana admin terverifikasi di daftar pencarian/chat dan ruang chat.

> **Login Telegram:** Isi `BOT_USERNAME` pada `.env` web dengan username bot (tanpa `@`). Pengguna membuka link sekali pakai ke bot dan memilih Setujui atau Tolak di chat pribadi. Bot harus online dan `.env` bot/web harus terhubung ke database Turso yang sama. Domain web tidak perlu didaftarkan dengan `/setdomain` untuk metode login ini.

Isi `BROADCAST_WEB_SECRET` di environment web dengan nilai rahasia yang sama seperti di `.env` bot. Nilai ini melindungi endpoint internal penerima broadcast dan harus disetel juga pada environment deployment web.

Pesan `/start` yang membuka permintaan login dihapus otomatis. Setelah disetujui, bot menghapus kartu permintaan dan hanya menampilkan konfirmasi singkat di Telegram.

Setiap permintaan login berlaku selama lima menit, hanya dapat digunakan sekali, dan bot mengambil ID Telegram dari update resmi Telegram—bukan dari browser. Setelah disetujui, session web ditandatangani dengan `TELEGRAM_BOT_TOKEN`; jangan membagikan token dan segera rotasi token jika pernah terekspos. Device ID dibuat setelah identitas Telegram berhasil diverifikasi. Tabel `telegram_login_challenges` dibuat otomatis; tidak perlu menghapus atau membuat ulang tabel database.

### Integrasi GitHub Projects

Tab **Projects** pada navigasi bawah menampilkan repositori yang dapat diakses akun GitHub yang ditautkan, dengan pencarian berdasarkan nama/deskripsi dan pagination. Beranda menampilkan proyek milik akun, grafik aktivitas commit mingguan, serta ringkasan jumlah repo, stars, forks, dan repo aktif. Grid menampilkan statistik commit 12 bulan dan 5 minggu, commit terbaru, bahasa, branch, dan fork. Untuk menjaga permintaan GitHub tetap terbatas, statistik riwayat rinci di Beranda dihitung pada maksimal 12 repo terbaru yang memiliki push; ringkasan repo dan stars/forks mencakup maksimal 100 repo pertama yang dikembalikan GitHub. Jika token belum tersambung, Beranda menampilkan keadaan kosong tanpa mengungkap data proyek. Setiap proyek di tab Projects menampilkan deskripsi, status publik/private, branch, bahasa, statistik repo, struktur default branch, statistik file dan baris per commit, workflow GitHub Actions, deployment GitHub, dan statistik trafik agregat jika GitHub mengizinkannya.

Daftar dan ringkasan GitHub diminta ulang saat halamannya dibuka kembali atau tab kembali aktif; navigasi Back/Forward juga meminta data route terbaru tanpa memuat ulang seluruh dokumen atau menjalankan polling berkala.

Sebelum token bisa disimpan, buat key enkripsi server 32 byte:

```bash
openssl rand -base64 32
```

Masukkan hasilnya sebagai `GITHUB_TOKEN_ENCRYPTION_KEY` pada `.env` lokal dashboard serta Environment Variables deployment, lalu restart/redeploy aplikasi. Gunakan nilai key yang sama untuk seluruh instance yang membaca database yang sama. Jika key hilang atau diganti, token GitHub terenkripsi yang tersimpan tidak dapat dibuka lagi; sambungkan ulang akun GitHub setelah key dipulihkan.

Tabel `github_credentials` dibuat otomatis di Turso saat pengaturan GitHub pertama kali dibuka; tidak perlu menambahkan SQL manual.

Masuk ke **Profile → Settings → GitHub** dan masukkan Personal Access Token (classic atau fine-grained). **Fine-grained token read-only** lebih disarankan: batasi token ke repositori yang diperlukan dan aktifkan metadata, contents, Actions, serta deployments dengan akses read-only. Classic PAT dapat membawa izin yang lebih luas daripada yang dibutuhkan dashboard; kode aplikasi hanya melakukan permintaan baca. Statistik traffic bersifat opsional, tersedia untuk repo tempat pemilik token memiliki akses tulis, dan hanya meliputi 14 hari terakhir. Token diverifikasi ke GitHub, lalu disimpan per akun CheyaVerse dengan enkripsi AES-256-GCM di Turso; nilainya tidak ditampilkan kembali ke browser. Tombol **Disconnect** menghapus token dari database aplikasi.

Riwayat commit dimuat tiga commit per halaman agar tidak menghabiskan GitHub API rate limit; tombol **Load more history** memuat halaman berikutnya. Statistik penambahan/penghapusan baris serta file dihitung dari data detail setiap commit yang telah dimuat. GitHub hanya menyediakan trafik agregat untuk periode terbaru (maksimal 14 hari) dan tidak memberikan identitas pengunjung. Status production di halaman ini hanya mencakup deployment yang tercatat lewat GitHub Deployments; deployment dari hosting provider lain tidak dapat dideteksi otomatis.

Di chat pribadi, bot juga dapat menampilkan JSON update Telegram untuk pesan yang diteruskan. Output ditujukan hanya kepada pengirim forward; update panjang dikirim sebagai file JSON. Field update di-escape sebelum ditampilkan sebagai code block, dan pesan biasa/command tidak diproses oleh fitur ini.

Pengaturan **Devices & Security** menampilkan perangkat terdaftar, waktu aktivitas terakhir, dan aksi untuk menghentikan sesi. Logout hanya mengakhiri sesi di perangkat ini. Penghapusan akun web memerlukan konfirmasi teks `HAPUS AKUN`; profil dianonimkan menjadi **Deleted account** pada salinan percakapan akun lain agar riwayat mereka tetap ada. Sesi lama dicabut lewat versi sesi akun. Media milik akun di database dihapus; penghapusan file dari Telegram Storage dilakukan sebaik mungkin dan kegagalan eksternal akan ditampilkan setelah proses.

Halaman login memulihkan sesi hanya jika cookie sesi, Device ID di browser, dan data perangkat di database masih cocok. Sesi yang tidak valid harus melewati login Telegram kembali. Dari menu profil, **Link a device** membuat QR atau link undangan sekali pakai yang kedaluwarsa dalam 60 detik; perangkat baru akan masuk otomatis setelah membuka undangan. Token undangan hanya disimpan sebagai hash di tabel `device_link_tokens`, yang dibuat otomatis. **Log out** menghapus sesi pada browser saat ini.

Untuk push saat bot menghapus media yang kedaluwarsa, isi `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, dan `VAPID_SUBJECT` di `.env` bot dengan pasangan yang sama seperti `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, dan `VAPID_SUBJECT` di `.env` web.

Push dari CheyaVerse web ditandai **Web** dan setiap pesan memakai tag unik agar browser tidak mengganti pesan sebelumnya. Browser atau OS dapat mengelompokkan notifikasi secara visual sesuai dukungannya. Suara dan getar push mengikuti dukungan serta pengaturan notifikasi browser/OS; halaman web memakai audio lokal ketika browser mengizinkan pemutaran. QR cadangan di viewer media dibuat dan dikustomisasi di browser, tanpa menyimpan desainnya di server.

Beranda web menyediakan **Library** virtual pada path `/home/{username}`. Path ini hanya struktur data aplikasi di Turso, bukan akses ke filesystem server. Pengguna dapat mengelola folder, file teks (maksimal 1 MB), dan file gambar/video (maksimal 4 MiB per file); media disimpan di Telegram Storage melalui `TELEGRAM_BOT_TOKEN` dan `TELEGRAM_STORAGE_CHAT_ID`, sementara metadata/path disimpan di Turso. Vercel Blob tidak digunakan dan `BLOB_READ_WRITE_TOKEN` tidak diperlukan. Penghapusan folder menghapus seluruh isinya; data library dibatasi pada akun pemilik dan ikut dihapus saat akun web dihapus. Halaman Statistik telah dihapus.

### SQL skema awal

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
> **Pemberitahuan:** Database dibuat terlebih dahulu dari menu **Create Database** di dashboard Turso; blok SQL di atas dijalankan pada Shell/SQL milik database tersebut. Sesuaikan nama database jika tidak memakai `cheyaverse`.
> Aplikasi membuat/memigrasikan tabel akun `"akun-telegram"`, `direct_messages`, challenge login, presence, pin, dan penghapusan pesan secara otomatis. Kolom tambahan untuk edit/hapus/forward, balasan, dan pesan suara juga dimigrasikan saat akses pertama. Kolom fingerprint device yang baru juga dimigrasikan otomatis. Jangan drop tabel atau reset database untuk menerapkan pembaruan ini.

Chat langsung menyinkronkan pesan dan tanda dibaca saat room terbuka. Status online didasarkan pada heartbeat web aktif; untuk penerima offline, pesan tetap tersimpan di web dan bot mengirim notifikasi Telegram dengan tombol **Dibaca** serta **Balas**. Pesan dari kontak tidak memicu notifikasi browser atau web-push; notifikasi browser hanya digunakan untuk pemberitahuan CheyaVerse. Balasan Telegram masuk ke room web yang sama.

Laporan login baru mencoba menentukan kota dan negara dari IP publik melalui layanan geolokasi IP; IP proxy privat/lokal tidak dikirim untuk lookup. Lokasi berbasis IP hanya perkiraan jaringan (bukan GPS), dan dapat berbeda atau tidak tersedia jika ISP memakai gateway/VPN atau layanan lookup sedang tidak tersedia.

Pesan suara direkam di browser, dapat diputar ulang sebelum dikirim, lalu disimpan ke chat penyimpanan Telegram yang dikonfigurasi oleh `TELEGRAM_STORAGE_CHAT_ID`. Room membatasi rekaman hingga dua menit dan unggahan hingga 3 MiB. Kolom media dan balasan pada `direct_messages` dimigrasikan otomatis; tidak perlu menjalankan `DROP TABLE` atau mengubah secret environment baru.

### 5. Periksa kualitas dan build

```bash
npm run lint
npm run build
```

ESLint memeriksa pola Next.js, React, dan aksesibilitas tanpa mengubah kode aplikasi.

### 6. Running server

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
