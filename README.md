# CheyaVerse — Setup

Panduan lengkap untuk meng setup bot CheyaVerse

## Requirements

| Item | Keterangan |
|---|---|
| Python | 3.11 – 3.14 |
| Telegram Bot Token | Dari [@BotFather](https://t.me/BotFather) |
| Koneksi internet | Wajib |
| RAM minimum | 256 MB |
| Storage minimum | 150 MB |

## Struktur Folder Setelah Setup
```
CheyaVerse/
├── assets/
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
├── web.py
└── requirements.txt
```

Folder `assets/` **wajib** ada 2 file gambar:
- `background.png` — template QR
- `cheyaverse.jpg` — logo profile CheyaVerse
> Karena untuk penggunaan generate barcode

## Setup — Linux (Debian/Ubuntu/Kali/Arch)

### 1. Update package manager

```bash
sudo apt update && sudo apt upgrade -y
```

**Arch**
```bash
sudo pacman -Syu
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
PUBLIC_URL=http://{ip_local}:8080
WEB_HOST=0.0.0.0
WEB_PORT=8080
```
> **Disclaimer**: _Ganti `{ip_local}` dengan IP lokal mesin lo. Cek pakai:_
```bash
ip addr show | grep "inet " | grep -v 127.0.0.1
```

### 6. Running bot
```bash
python3 main.py
```

### Log yg benar harus seperti ini
```bash
[HH:MM:SS] [INFO] CheyaVerse is running...
[HH:MM:SS] [INFO] QR assets verified.
[HH:MM:SS] [INFO] Public viewer base: http://{ip_local}:8080
[HH:MM:SS] [INFO] Bot active: @username | Name | ID: 123456
[HH:MM:SS] [INFO] Web viewer listening on http://0.0.0.0:8080
[HH:MM:SS] [INFO] Polling engaged. Press CTRL+C to stop.
```

---

### Catatan & pemberitahuan
- barcode yg dihasilkan dari input teks, berfungsi secara permanen
- barcode yg dihasolkan dari media (gambar/video), berfungsi permanen, namun... tidak akan berfungsi lama, hanya 24h saja dikarenakan data medianya disimpan didalam server `LitterBox`
- webapp view nya untuk menampilkan isi file file foto/video dari barcode yg di scan, hanya dapat di akses di lokal, karena tidak di publish. Jika anda bersedia dan ingin membantu saya atau pun itu memberi, tolonglah, saya ingin webapp nya di deploy, tapi ini membutuhkan `aiohttp` dan tidak statis datanya karena datanya diambil dari url barcode!
- server bot dan juga server webapp nya berjalan dari lokal, hanya satu kali command kedua server itu sudah daat berjalan dengan baik
- Data media untuk upload generate barcode max 10 MB
- Gka bisa generate barcode dari beberapa file sekaligus (setiap satu barcode yg dibuat harus satu file yg diupload, jika nggak bakal gagal)
