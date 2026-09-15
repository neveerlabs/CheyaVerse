# CheyaVerse — Setup

Panduan setup CheyaVerse untuk Linux, Windows, Termux (Android), dan macOS.

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
└── requirements.txt
```

Folder `assets/` **wajib** ada dua file gambar ini:
- `background.png` — template QR
- `cheyaverse.jpg` — logo QR

## Setup — Linux (Debian/Ubuntu/Kali/Arch)

### 1. Update package manager

```bash
sudo apt update && sudo apt upgrade -y
```

**Arch**
```bash
sudo pacman -Syu
```

### 2. Install Python & pip
```bash
sudo apt install -y python3 python3-pip python3-venv
```

**Arch**
```bash
sudo pacman -S python python-pip
```

### 3. Verifikasi python
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

### 4. Clone repository
```bash
git clone https://github.com/neveerlabs/CheyaVerse.git
cd CheyaVerse
```

### 5. Install dependency
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 6. Setup file `.env`
```txt
BOT_TOKEN=tokenbot
```

### 7. Running bot
```bash
python3 main.py
```
> *Pastikan environment aktif dan `.env` sudah diisi dengan token bot*

## Log console yg benar
```bash
[HH:MM:SS] [INFO] CheyaVerse is running...
[HH:MM:SS] [INFO] QR assets verified.
[HH:MM:SS] [INFO] Bot active: @username | Name | ID: 123456
[HH:MM:SS] [INFO] Polling engaged. Press CTRL+C to stop.
```
