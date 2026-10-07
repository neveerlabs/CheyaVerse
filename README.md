<div align="center">
    <h1>CheyaVerse</h1>
    <p>Panduan setup bot & webapp CheyaVerse</p>
</div>

---

## Persiapan

- Python 3.10 atau lebih baru dan `pip`
- Node.js 20 atau lebih baru dan `npm`
- Akun [Supabase](https://supabase.com/) dengan project baru
- Bot Telegram dan token dari [@BotFather](https://t.me/BotFather)
- Google [reCAPTCHA v2](https://www.google.com/recaptcha/admin/) untuk mengaktifkan unduhan terlindungi

## Setup dari awal

### 1. Ambil source code

```bash
git clone https://github.com/neveerlabs/CheyaVerse.git
cd CheyaVerse
```

### 2. Buat project Supabase kosong dan siapkan database

1. Buat project baru di Supabase. Pilih region yang dekat dengan server aplikasi, atur password database, dan tunggu sampai status project siap.
2. Dari **Project Settings → Database → Connect**, salin connection string **Session pooler** untuk PostgreSQL. Isi password database yang diminta. Gunakan string ini sebagai `SUPABASE_DB_URL` untuk bot dan web; jangan gunakan URL SQLite/Turso. Session pooler direkomendasikan untuk aplikasi Node/Python yang berjalan lama. Pertahankan opsi TLS/SSL seperti `sslmode=require` yang diberikan Supabase dan URL-encode password jika mengandung karakter khusus.
3. Buka **SQL Editor → New query** di Supabase. Salin seluruh isi [dashboard/sql/bootstrap.sql](./dashboard/sql/bootstrap.sql) ke editor, lalu klik **Run**. Jalankan sekali pada project kosong. Skrip membuat skema aplikasi, kebijakan akses realtime, publication, serta private Storage bucket `user-media`. Skrip tidak menyalin data Turso lama.
4. Dari **Project Settings → API**, salin Project URL, anon/publishable key, dan legacy `service_role` JWT key untuk pemanggilan Supabase Storage server-side. Ambil juga legacy HS256 JWT secret project dari pengaturan JWT/API; simpan sebagai `SUPABASE_JWT_SECRET` (ini bukan anon key maupun service-role key). Service-role key dan JWT secret adalah rahasia server: jangan taruh dengan prefix `NEXT_PUBLIC_`, jangan bagikan, dan jangan commit.
5. Di **Storage**, pastikan bucket private `user-media` dibuat oleh bootstrap dengan batas upload 50 MiB. Batas efektif tetap tunduk pada batas plan dan konfigurasi Supabase Storage.

Bootstrap adalah satu-satunya skema PostgreSQL yang dipakai aplikasi web dan bot. Jalankan ulang setelah pembaruan yang mengubah skema. Ia memakai `IF NOT EXISTS` dan memperbarui kebijakan/pengaturan Storage milik CheyaVerse; ia tidak mengosongkan tabel maupun menghapus data. Skrip juga memasang pencatat aktivitas database dan tabel sementara keepalive. Jangan jalankan perintah reset/drop kecuali memang ingin menghapus seluruh data project.

Jika `psql` sudah terpasang dan `SUPABASE_DB_URL` telah diekspor ke environment terminal, alternatif SQL Editor adalah:

```bash
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=on --file dashboard/sql/bootstrap.sql
psql "$SUPABASE_DB_URL" --command "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
```

Kedua perintah itu dijalankan dari root repository. Yang pertama berhenti pada error SQL; yang kedua menampilkan tabel aplikasi yang berhasil dibuat.

### 3. Siapkan dan jalankan bot

Buat file `.env` di folder utama project (selevel dengan `main.py`):

```dotenv
BOT_TOKEN=token_dari_BotFather
SUPABASE_DB_URL=postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=service_role_key_rahasia
PUBLIC_URL=http://localhost:8080
MEDIA_TTL_DAYS=30
# Opsional untuk memori AI grup: gunakan secret acak yang sama di bot dan web
TELEGRAM_GROUP_AI_SECRET=secret_acak_yang_sama_di_bot_dan_web
```

Ganti semua nilai contoh dengan nilai project Supabase dan Telegram milik sendiri. `SUPABASE_DB_URL` harus connection string PostgreSQL Session pooler yang sama dengan web. Bot membutuhkan `SUPABASE_URL` serta `SUPABASE_SERVICE_ROLE_KEY` untuk mengunggah dan menghapus berkas di bucket private. Jangan gunakan service-role key sebagai anon key atau kirim ke browser. Isi `PUBLIC_URL` dengan alamat web yang dapat dibuka pengguna; gunakan HTTPS untuk deployment.

Pasang dependensi dan jalankan bot dari folder utama:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python main.py
```

Di Windows PowerShell:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python main.py
```

Bot memakai long polling; jalankan hanya satu instance bot untuk satu token. Saat startup, bot membuang update Telegram yang masih tertunda.

### 4. Siapkan dan jalankan web

Buka terminal kedua:

```bash
cd dashboard
npm ci
```

Buat file `dashboard/.env.local`:

```dotenv
SUPABASE_DB_URL=postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=anon_key_atau_publishable_key
SUPABASE_JWT_SECRET=jwt_signing_secret_rahasia
SUPABASE_SERVICE_ROLE_KEY=service_role_key_rahasia
CRON_SECRET=secret_acak_panjang_untuk_cron_vercel
TELEGRAM_BOT_TOKEN=token_yang_sama_dengan_BOT_TOKEN
SESSION_SECRET=rahasia_acak_panjang_yang_stabil
BOT_USERNAME=username_bot_tanpa_at
PUBLIC_URL=http://localhost:8080
# Opsional untuk memori AI grup: gunakan secret acak yang sama di bot dan web
TELEGRAM_GROUP_AI_SECRET=secret_acak_yang_sama_di_bot_dan_web
```

`SUPABASE_DB_URL`, Project URL, JWT secret, dan service-role key harus berasal dari project yang sama dengan konfigurasi bot. Hanya URL dan anon/publishable key yang memang bersifat publik; key server lainnya tetap rahasia. `TELEGRAM_BOT_TOKEN` harus sama dengan `BOT_TOKEN`, sedangkan `BOT_USERNAME` diisi tanpa `@`. Atur `SESSION_SECRET` ke nilai acak yang sama pada semua instance web dan pertahankan nilainya saat restart/deploy agar sesi tidak bergantung pada rotasi token Telegram. Token sesi lama yang ditandatangani dengan bot token masih diterima untuk migrasi; sesi baru menggunakan `SESSION_SECRET`.

Jalankan web:

```bash
npm run dev
```

Buka <http://localhost:8080>. Untuk login Telegram, pastikan bot aktif dan kedua aplikasi terhubung ke database Supabase yang sama; metode login ini tidak memerlukan `/setdomain` di BotFather.

### Pengaturan opsional

Tambahkan nilai berikut pada file environment yang disebutkan hanya jika fitur terkait diperlukan:

| Fitur | Variabel | Catatan |
|---|---|---|
| Login/tautan web | `PUBLIC_URL` (bot dan web), `BOT_USERNAME` (web) | Gunakan alamat web yang sama; username bot tanpa `@`. |
| Broadcast admin | `ADMIN_TELEGRAM_IDS`, `BROADCAST_WEB_SECRET` (bot dan web) | ID numerik admin, pisahkan dengan koma. Buat satu secret acak dan gunakan nilai yang sama di kedua aplikasi. |
| Memori AI grup Telegram | `TELEGRAM_GROUP_AI_SECRET` (bot dan web), `ADMIN_TELEGRAM_IDS` (bot dan web) | Buat secret acak panjang dan gunakan nilai yang sama pada kedua aplikasi. `PUBLIC_URL` bot harus menunjuk ke dashboard yang dapat dijangkau bot. |
| Akses Telegram API dari web | `TELEGRAM_BOT_API_URL` (web, opsional) | Default `https://api.telegram.org`. Jika host web tidak dapat membuat koneksi keluar ke Telegram karena firewall/routing, arahkan ke Bot API proxy HTTPS yang Anda kelola atau Local Bot API Server yang dapat dijangkau web. HTTP hanya diterima untuk `localhost`/loopback, misalnya `http://127.0.0.1:8081`. Pastikan endpoint benar-benar dapat dijangkau dari proses Next.js; ini tidak memperbaiki outage Telegram atau firewall provider dengan sendirinya. |
| Pencarian web AI | `BRAVE_SEARCH_API_KEY` (opsional) | Jika diatur, pencarian memakai Brave Search; tanpa key, server memakai hasil HTML publik DuckDuckGo. Provider publik dapat membatasi permintaan. Pencarian hanya untuk riset umum, bukan untuk melacak atau mengidentifikasi orang privat. |
| Supabase keepalive | `CRON_SECRET` (web/deployment) | Buat nilai acak panjang, misalnya `openssl rand -hex 32`. Vercel Cron mengirimkannya untuk mengamankan endpoint keepalive. Atur pada environment deployment Vercel; cron dijadwalkan sekali sehari dan hanya menulis lalu menghapus baris sementara bila tidak ada perubahan data aplikasi selama lima hari. |
| Push notification | Bot: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`; web: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Gunakan pasangan key yang sama. `VAPID_SUBJECT` opsional dan sudah memiliki nilai default. |
| Barcode media hingga 50 MiB | `TELEGRAM_BOT_API_URL` (bot, opsional) | Bot API Telegram hosted membatasi download file ke 20 MiB. Untuk memakai batas aplikasi 50 MiB, jalankan Local Bot API Server dan arahkan variabel ini ke base URL server tersebut, misalnya `http://127.0.0.1:8081`. Pastikan bot dan server API dapat saling menjangkau; tanpa konfigurasi ini, file di atas 20 MiB ditolak dengan pesan yang menjelaskan batasnya. |
| Verifikasi unduhan | `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY` (web) | Buat pasangan key reCAPTCHA v2 untuk domain web. |
| GitHub Projects dan API key AI | `GITHUB_TOKEN_ENCRYPTION_KEY` atau `AI_PROVIDER_ENCRYPTION_KEY` (web) | Buat key base64 32-byte dengan `openssl rand -base64 32`. Jika keduanya diatur, `AI_PROVIDER_ENCRYPTION_KEY` digunakan untuk API key AI dan `GITHUB_TOKEN_ENCRYPTION_KEY` untuk token GitHub. Simpan key tetap sama; mengganti/menghilangkannya membuat kredensial tersimpan tidak dapat dibaca. |
| Masa simpan media | `MEDIA_TTL_DAYS` (bot dan web) | Opsional; default 30 hari. |

#### Memori AI grup Telegram

Setelah bot dan dashboard hidup, fitur otomatis mulai saat admin yang ID-nya terdaftar pada `ADMIN_TELEGRAM_IDS` mengirim pesan baru ke grup/supergrup tempat bot menjadi admin. Pesan admin diverifikasi via Telegram; pesan anggota lain tidak disimpan atau diteruskan. Untuk channel broadcast, bot harus menjadi admin dan channel harus memiliki tepat satu admin manusia terdaftar pada `ADMIN_TELEGRAM_IDS`. Tidak perlu command setup: AI membaca pesan admin baru, membuat ringkasan memori, dan tetap diam. `/send` memberi izin untuk balasan yang jarang dan hanya saat admin jelas mengajukan pertanyaan/tugas kepada AI; `/up` mencabut izin dan membuat AI diam kembali. Keduanya hanya tersedia di grup/channel, tidak di chat pribadi atau web. Atur `TELEGRAM_GROUP_AI_SECRET` sama di environment bot dan dashboard, dan pastikan `PUBLIC_URL` bot dapat menjangkau dashboard.

Pesan teks asli tidak disimpan; yang disimpan di PostgreSQL adalah catatan ringkas hasil pencernaan AI, agar konteks penting seperti topik, peristiwa, preferensi, dan perasaan yang disampaikan dapat dicari/dipakai kembali. AI mengambil konteks dari ringkasan relevan dan pesan terbaru. Bot tidak mengimpor riwayat sebelum fitur berjalan dan tidak menjalankan AI tools untuk pesan grup. Teks memakai provider AI aktif milik admin. Analisis media memakai Gemini aktif dengan model multimodal. File dibatasi total 14 MiB per pesan; jenis file yang didukung adalah gambar, audio/video yang dikenali Gemini, PDF, TXT, CSV, dan JSON. Balasan AI dikirim ke chat sehingga terlihat oleh anggota grup/channel. Post baru dari channel dicerna otomatis; saat post channel diedit, Cheya memperbarui ringkasan milik post tersebut tanpa mengirim balasan baru. Data ringkasan tersimpan sampai dihapus langsung dari database.

Jangan commit `.env` atau `.env.local`. Untuk deployment, tambahkan variabel yang sama melalui pengaturan environment hosting dan restart/redeploy setelah mengubahnya. Atur `PUBLIC_URL` ke URL publik HTTPS. Buat `BROADCAST_WEB_SECRET` sebagai string acak yang panjang (misalnya `openssl rand -hex 32`), lalu gunakan nilai yang sama di bot dan web. Token Telegram, kredensial PostgreSQL, JWT secret Supabase, service-role key, secret broadcast, dan private key VAPID jangan dibagikan.

Jika log menunjukkan `UND_ERR_CONNECT_TIMEOUT` atau `ETIMEDOUT` saat mengakses Telegram, itu berarti proses web tidak berhasil membuat koneksi keluar ke endpoint Bot API. Pastikan DNS dan port 443 dari host web tidak diblokir. Pada server yang dikelola sendiri, `TELEGRAM_BOT_API_URL` dapat menunjuk ke proxy/Bot API server yang memang dapat dijangkau. Jangan memakai alamat `localhost` pada deployment kecuali Bot API berjalan di host/container network yang sama. Perubahan konfigurasi perlu diikuti restart/redeploy.

Setiap permintaan login berlaku lima menit dan hanya dapat digunakan sekali. Persetujuan dilakukan di chat pribadi dengan bot. Command `/unblock` di chat pribadi menampilkan sesi yang diblokir pada akun Telegram pemanggil; pemilihan dan konfirmasi selalu divalidasi ulang terhadap akun tersebut.

Fitur `/qr` menerima media sampai 50 MiB per file ketika bot menggunakan Local Bot API Server. Dengan Bot API hosted standar, aplikasi membatasi file ke 20 MiB karena server tersebut tidak menyediakan unduhan file yang lebih besar.

### Integrasi GitHub Projects

Tab **Projects** pada navigasi bawah menampilkan repositori yang dapat diakses akun GitHub yang ditautkan, dengan pencarian berdasarkan nama/deskripsi dan pagination. Beranda menampilkan proyek milik akun, grafik aktivitas commit mingguan, serta ringkasan jumlah repo, stars, forks, dan repo aktif. Grid menampilkan statistik commit 12 bulan dan 5 minggu, commit terbaru, bahasa, branch, dan fork. Untuk menjaga permintaan GitHub tetap terbatas, statistik riwayat rinci di Beranda dihitung pada maksimal 12 repo terbaru yang memiliki push; ringkasan repo dan stars/forks mencakup maksimal 100 repo pertama yang dikembalikan GitHub. Jika token belum tersambung, Beranda menampilkan keadaan kosong tanpa mengungkap data proyek. Setiap proyek di tab Projects menampilkan deskripsi, status publik/private, branch, bahasa, statistik repo, struktur default branch, statistik file dan baris per commit, workflow GitHub Actions, deployment GitHub, dan statistik trafik agregat jika GitHub mengizinkannya.

Daftar dan ringkasan GitHub diminta ulang saat halaman/tab navigasi dibuka, termasuk saat tab yang sedang aktif ditekan lagi; navigasi Back/Forward juga meminta data route terbaru tanpa memuat ulang seluruh dokumen atau menjalankan polling berkala. Perubahan pesan, notifikasi, media, cover, library, dan pemblokiran sesi dikirim ke browser melalui Supabase Realtime WebSocket; perubahan route tetap meminta data terbaru dari server. Detail repository menampilkan hingga 10 GitHub Releases terbaru, termasuk tag versi, catatan rilis, prerelease, aset unduhan, ukuran, dan jumlah unduhan. Beranda menampilkan tag release terbaru untuk repository yang memilikinya dan memakai tanggal release sebagai pemecah peringkat jika aktivitas commit sama.

Sebelum token bisa disimpan, buat key enkripsi server 32 byte:

```bash
openssl rand -base64 32
```

Masukkan hasilnya sebagai `GITHUB_TOKEN_ENCRYPTION_KEY` pada `.env` lokal dashboard serta Environment Variables deployment, lalu restart/redeploy aplikasi. Gunakan nilai key yang sama untuk seluruh instance yang membaca database yang sama. Jika key hilang atau diganti, token GitHub terenkripsi yang tersimpan tidak dapat dibuka lagi; sambungkan ulang akun GitHub setelah key dipulihkan.

Tabel `github_credentials` disiapkan oleh bootstrap database dan juga diperiksa aplikasi saat pengaturan GitHub dibuka.

Masuk ke **Profile → Settings → GitHub** dan masukkan Personal Access Token (classic atau fine-grained). **Fine-grained token read-only** lebih disarankan: batasi token ke repositori yang diperlukan dan aktifkan metadata, contents, Actions, serta deployments dengan akses read-only. Classic PAT dapat membawa izin yang lebih luas daripada yang dibutuhkan dashboard; kode aplikasi hanya melakukan permintaan baca. Statistik traffic bersifat opsional, tersedia untuk repo tempat pemilik token memiliki akses tulis, dan hanya meliputi 14 hari terakhir. Token diverifikasi ke GitHub, lalu disimpan per akun CheyaVerse dengan enkripsi AES-256-GCM di Supabase PostgreSQL; nilainya tidak ditampilkan kembali ke browser. Tombol **Disconnect** menghapus token dari database aplikasi.

Riwayat commit dimuat tiga commit per halaman agar tidak menghabiskan GitHub API rate limit; tombol **Load more history** memuat halaman berikutnya. Statistik penambahan/penghapusan baris serta file dihitung dari data detail setiap commit yang telah dimuat. GitHub hanya menyediakan trafik agregat untuk periode terbaru (maksimal 14 hari) dan tidak memberikan identitas pengunjung. Status production di halaman ini hanya mencakup deployment yang tercatat lewat GitHub Deployments; deployment dari hosting provider lain tidak dapat dideteksi otomatis.

Di chat pribadi, bot juga dapat menampilkan JSON update Telegram untuk pesan yang diteruskan. Output ditujukan hanya kepada pengirim forward; update panjang dikirim sebagai file JSON. Field update di-escape sebelum ditampilkan sebagai code block, dan pesan biasa/command tidak diproses oleh fitur ini.

Pengaturan **Devices & Security** menampilkan perangkat terdaftar, waktu aktivitas terakhir, dan aksi untuk menghentikan sesi. Logout hanya mengakhiri sesi di perangkat ini. Penghapusan akun web memerlukan konfirmasi teks `HAPUS AKUN`; profil dianonimkan menjadi **Deleted account** pada salinan percakapan akun lain agar riwayat mereka tetap ada. Sesi lama dicabut lewat versi sesi akun. Media milik akun di database dihapus; berkas miliknya di Supabase Storage juga dihapus dan kegagalan eksternal akan ditampilkan setelah proses.

DeviceID perangkat disimpan di `localStorage` (`cheya_device_id`) dan divalidasi ulang dengan ID pada cookie sesi server. Logout mengakhiri cookie sesi tetapi mempertahankan DeviceID lokal agar login berikutnya dan pergantian akun tetap memakai identitas perangkat yang sama. Tabel `device_account_state` mencatat akun aktif untuk DeviceID tersebut; setelah logout, `current_uid` menjadi `NULL` (akun tidak diketahui/tidak sedang login). Tabel ini memiliki RLS aktif dan tidak dapat dibaca langsung browser. Data relasi perangkat-akun pada `device_ids` tetap tersedia agar **Switch account** bisa menampilkan akun yang memang pernah terhubung; server memeriksa relasi dan blacklist sebelum menerbitkan sesi baru. Jika cookie sesi yang valid masih ada tetapi ID lokal hilang atau tidak cocok, server memulihkan DeviceID dari cookie bertanda tangan, bukan membuat identitas baru.

Dari menu profil, **Link a device** membuat QR atau link undangan sekali pakai yang kedaluwarsa dalam 60 detik; perangkat baru akan masuk otomatis setelah membuka undangan. Jika browser penerima sudah memiliki DeviceID tersimpan, proses link memakai ID yang sama. Token undangan hanya disimpan sebagai hash di tabel `device_link_tokens`, yang dibuat otomatis. **Log out** mengakhiri sesi pada browser saat ini tanpa menghapus DeviceID.

Pesan AI menampilkan URL sebagai chip sumber berbentuk kapsul dengan favicon/domain yang dapat dibuka. Preview tautan mencoba memakai gambar Open Graph/Twitter dari situs; jika situs tidak menyediakan gambar, favicon situs ditampilkan sebagai visual pengganti. Gambar preview dapat diklik untuk membuka sumber.

Untuk push saat bot menghapus media yang kedaluwarsa, isi `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, dan `VAPID_SUBJECT` di `.env` bot dengan pasangan yang sama seperti `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, dan `VAPID_SUBJECT` di `.env` web.

Push dari CheyaVerse web ditandai **Web** dan setiap pesan memakai tag unik agar browser tidak mengganti pesan sebelumnya. Browser atau OS dapat mengelompokkan notifikasi secara visual sesuai dukungannya. Suara dan getar push mengikuti dukungan serta pengaturan notifikasi browser/OS; halaman web memakai audio lokal ketika browser mengizinkan pemutaran. QR cadangan di viewer media dibuat dan dikustomisasi di browser, tanpa menyimpan desainnya di server.

Beranda web menyediakan **Library** virtual pada path `/home/{username}`. Path ini hanya struktur data aplikasi di Supabase PostgreSQL, bukan akses ke filesystem server. Pengguna dapat mengelola folder, file teks (maksimal 1 MB), dan file gambar/video (maksimal 4 MiB per file); media disimpan di private Supabase Storage bucket `user-media`, sementara metadata/path disimpan di Supabase PostgreSQL. Berkas media Telegram yang dibuat oleh bot juga disimpan di bucket yang sama. Vercel Blob tidak digunakan dan `BLOB_READ_WRITE_TOKEN` tidak diperlukan. Penghapusan folder menghapus seluruh isinya; data library dibatasi pada akun pemilik dan ikut dihapus saat akun web dihapus. Halaman Statistik telah dihapus.

### Reset project Supabase

CheyaVerse menggunakan **Supabase PostgreSQL** dan Supabase Storage; skrip database tidak berisi perintah `DROP TABLE`. Untuk mulai benar-benar kosong, buat project Supabase baru, jalankan [dashboard/sql/bootstrap.sql](./dashboard/sql/bootstrap.sql) di SQL Editor project tersebut, lalu ganti konfigurasi `SUPABASE_DB_URL`, URL/key Supabase, dan rahasia JWT untuk bot, dashboard, dan deployment. Menghapus project dari Supabase menghapus seluruh isi database dan bucket secara permanen, termasuk data lain yang mungkin menggunakan project itu; pastikan project yang benar dipilih dan ekspor/backup dahulu jika data ingin dipertahankan. Database Turso lama tidak dimigrasikan oleh aplikasi ini dan dapat dipensiunkan terpisah setelah dipastikan tidak lagi digunakan.

Bootstrap menyiapkan seluruh skema PostgreSQL untuk bot dan web serta kebijakan realtime dan bucket privat. Untuk memperbarui skema pada project yang sudah berjalan, jalankan skrip tersebut lagi di Supabase SQL Editor; jangan gunakan perintah SQLite/Turso seperti `sqlite_master` atau `turso db shell`.

Tabel lama `ai_context_preferences`, jika masih tersisa dari versi sebelumnya, akan dimigrasikan otomatis saat koneksi PostgreSQL pertama agar kolom `uid` memakai `BIGINT` dan mendukung ID Telegram yang lebih besar dari batas `INTEGER`. Migrasi yang sama dapat dijalankan manual di SQL Editor:

```sql
DO $migration$
BEGIN
  IF to_regclass('public.ai_context_preferences') IS NOT NULL THEN
    ALTER TABLE public.ai_context_preferences
      ALTER COLUMN uid TYPE BIGINT USING uid::BIGINT;
  END IF;
END;
$migration$;
```

Chat langsung menyinkronkan pesan dan tanda dibaca saat room terbuka. Status online didasarkan pada heartbeat web aktif; untuk penerima offline, pesan tetap tersimpan di web dan bot mengirim notifikasi Telegram dengan tombol **Dibaca** serta **Balas**. Pesan dari kontak tidak memicu notifikasi browser atau web-push; notifikasi browser hanya digunakan untuk pemberitahuan CheyaVerse. Balasan Telegram masuk ke room web yang sama.

AI mencari history chat di seluruh pesan yang masih tersimpan menggunakan indeks full-text PostgreSQL, bukan hanya 500 pesan awal/terbaru. Setiap permintaan AI hanya mengirim hingga 24 pesan yang cocok dengan kata kunci beserta pesan reply terkait, ditambah hingga 8 pesan terbaru, dengan anggaran 22.000 karakter. Pesan yang dihapus atau disembunyikan dari akun tidak dipakai; seluruh transcript tidak dikirim ke provider AI, tetapi pesan asli tetap tersimpan sesuai kebijakan retensi sampai dihapus. Pencarian menggunakan kata kunci literal, jadi pertanyaan yang menyebut topik/nama/istilah dari obrolan lama paling mudah ditemukan; follow-up pendek juga memakai konteks pertanyaan user terbaru sebagai kata kunci tambahan. Setelah update, bootstrap menambahkan indeks `idx_messages_ai_memory_search`; aplikasi juga mencoba membuatnya otomatis ketika fitur chat dijalankan.

Detail identitas/role atau hingga 25 DeviceID dibaca hanya saat ditanya tentang akun/perangkat. Data perangkat dapat mencakup browser, sistem operasi, model, spesifikasi, layar, jaringan, dan WebGL; fingerprint mentah serta user-agent mentah tidak dikirim. Lokasi IP hanya dicari saat pengguna menanyakan lokasinya saat ini: IP publik diteruskan ke ipapi.co/ipwho.is untuk perkiraan kota/wilayah/negara/kode pos, bukan lokasi GPS atau kecamatan yang terjamin; alamat IP mentah hanya dikirim ke AI jika pengguna secara khusus menanyakan IP-nya. Untuk pertanyaan repo/kode, server menggunakan token GitHub terenkripsi dan memilih satu repo milik akun; repo publik atau repo lain yang tokennya dapat baca juga bisa dipilih jika pengguna menyebut `owner/repo` atau URL GitHub secara eksplisit. Jika tree repo lengkap dan maksimal 400 file teks/source masing-masing berukuran paling besar 1 MiB serta total 8 MiB, semua file yang memenuhi filter dibaca untuk permintaan itu lalu cuplikan relevan dibatasi hingga 14 file/55.000 karakter (file yang disebut langsung hingga 30.000 karakter); repo lebih besar atau tree terpotong dibatasi ke 80 file kandidat. Pola kredensial umum disamarkan, tetapi tidak ada pemindai secret yang dapat menjamin semua kredensial tertutup; tinjau repo sebelum menghubungkannya. Source tidak disimpan sebagai snapshot oleh CheyaVerse, tetapi konteks yang dikirim dapat diproses oleh provider AI sesuai kebijakannya. AI boleh memberi saran, tetapi tidak dapat memblokir atau mencabut sesi; tindakan tetap memerlukan admin.

Pengambilan ini berjalan ulang pada setiap permintaan AI dan context packet mencatat command data yang benar-benar dieksekusi (misalnya `/account.profile`, `/device.sessions`, `/network.location`, `/github.repository`, dan `/chat.history`). Command yang tidak relevan tidak dijalankan; riwayat tindakan pengguna tidak direkam atau dibuat-buat.

Provider/model AI dikonfigurasi di **Settings → GitHub → AI assistants**. Daftar model diminta langsung dari endpoint masing-masing provider setelah API key (jika diperlukan) diberikan. Provider yang didukung: OpenRouter, OpenAI, Gemini, Anthropic/Claude, DeepSeek, Qwen/DashScope, dan Groq (termasuk model Llama yang tersedia melalui Groq). **Local (OpenAI-compatible)** mendukung server seperti Ollama melalui base URL loopback, misalnya `http://localhost:11434/v1`; endpoint lokal dipanggil dari server CheyaVerse dan dibatasi ke localhost/loopback, sehingga deployment publik tidak dapat menjangkau localhost di perangkat pengguna. Untuk model lokal, jalankan dashboard sendiri pada mesin yang dapat mengakses model. Atur `AI_PROVIDER_ENCRYPTION_KEY` atau `GITHUB_TOKEN_ENCRYPTION_KEY` sebagai key base64 32-byte di environment web agar API key AI tersimpan terenkripsi; jangan commit atau membagikan key ini.

AI juga dapat mencari history akun yang sedang login, menjalankan command Linux, dan mengetes kode Python, JavaScript/Node.js, atau Bash. Tool dipanggil oleh AI hanya bila relevan dengan permintaan; tidak ada tombol **Run** pada code block. Setiap eksekusi berjalan di Vercel Sandbox sementara, terpisah dari server aplikasi, dengan network dinonaktifkan dan batas waktu; file sandbox dibuang setelah selesai. Eksekusi tidak dapat membaca file host atau mengakses database/provider key. Fitur ini memerlukan autentikasi Vercel Sandbox: di deployment Vercel gunakan OIDC deployment; untuk lokal, jalankan perintah berikut dari folder `dashboard`:

```bash
vercel link
vercel env pull .env.local
```

Token `VERCEL_OIDC_TOKEN` lokal kedaluwarsa dan perlu ditarik ulang dengan `vercel env pull .env.local`. Di CI/non-Vercel, konfigurasi `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, dan `VERCEL_PROJECT_ID`. Jika autentikasi gagal, tool mengembalikan instruksi setup tanpa membocorkan credential. Jangan kirim token tersebut ke browser atau ke dalam kode yang dijalankan.

Status web aktif memakai heartbeat terautentikasi setiap 20 detik; heartbeat kedaluwarsa setelah 55 detik. Data disimpan di tabel `web_presence` dengan RLS aktif dan tanpa akses browser langsung. AI hanya membaca status akun yang sedang login dan jumlah admin terkonfigurasi yang baru aktif, saat pertanyaan memang memerlukan status. Pesan yang secara eksplisit dimulai dengan `sampaikan ke admin: ` atau `forward to admin: ` dapat diteruskan verbatim ke chat web admin; AI tidak boleh mengubah isi atau mengirimkannya ke Telegram.

Laporan login baru mencoba menentukan kota dan negara dari IP publik melalui layanan geolokasi IP; IP proxy privat/lokal tidak dikirim untuk lookup. Lokasi berbasis IP hanya perkiraan jaringan (bukan GPS), dan dapat berbeda atau tidak tersedia jika ISP memakai gateway/VPN atau layanan lookup sedang tidak tersedia.

### Pemeriksaan dan production

Jalankan dari folder `dashboard`:

```bash
npm run lint
npm run build
```

Untuk menjalankan hasil build production secara lokal:

```bash
npm start
```

---

## Catatan & pemberitahuan
- Untuk deploy web, atur root project hosting ke folder `dashboard` dan isi environment variable di pengaturan hosting, bukan dengan mengunggah file `.env` ke repository.
- Vercel Cron untuk keepalive diatur oleh [dashboard/vercel.json](./dashboard/vercel.json). Pastikan `CRON_SECRET` tersedia di environment deployment. Setelah mengubah skema, jalankan ulang [dashboard/sql/bootstrap.sql](./dashboard/sql/bootstrap.sql) di Supabase SQL Editor.
- Pastikan `PUBLIC_URL` pada environment bot dan web mengarah ke URL web yang sama.
- Login Telegram CheyaVerse tidak memerlukan pendaftaran domain dengan `/setdomain` di BotFather. Untuk alamat tunnel sementara, perbarui `PUBLIC_URL` jika alamat tunnel berubah.
- Chat hanya mencari akun yang sudah login/register di CheyaVerse. Untuk akun yang belum ditemukan, tombol undangan membuka Telegram Share dengan pesan terisi; pemilik harus memilih penerima dan menekan kirim di Telegram
- Jika verifikasi unduhan tidak tersedia, periksa bahwa kedua key reCAPTCHA untuk domain tersebut telah diisi di environment web dan aplikasi sudah di-restart/redeploy.
- Jangan hapus `.next` sebagai langkah rutin; Next.js mengelola folder build tersebut.

<div align="center">

### Frontend / Webapp

![Next.js](https://img.shields.io/badge/Next.js_14-000000?style=for-the-badge&logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React_18-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Lucide](https://img.shields.io/badge/Lucide_Icons-F56565?style=for-the-badge&logo=lucide&logoColor=white)

### Backend / Runtime

![Node.js](https://img.shields.io/badge/Node.js_20+-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Next.js API](https://img.shields.io/badge/Next.js_API_Routes-000000?style=for-the-badge&logo=next.js&logoColor=white)
![Edge Runtime](https://img.shields.io/badge/Node_Runtime-5FA04E?style=for-the-badge&logo=nodedotjs&logoColor=white)

### Bot & Integrasi

![Telegram](https://img.shields.io/badge/Telegram_Bot_API-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![reCAPTCHA](https://img.shields.io/badge/reCAPTCHA_v2-4285F4?style=for-the-badge&logo=google&logoColor=white)

### Database & Storage

![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Supabase Storage](https://img.shields.io/badge/Supabase_Storage-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)

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
| **Database** | Supabase PostgreSQL | Database terkelola untuk dashboard dan bot |
| **Storage File** | Supabase Storage | Bucket privat untuk berkas media |
| **Auth / Verification** | Google reCAPTCHA v2 | Proteksi endpoint download |
| **Realtime** | Supabase Realtime (WebSocket) | Perubahan database dikirim ke klien melalui Postgres Changes |
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
