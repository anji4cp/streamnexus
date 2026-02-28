# Panduan Instalasi VPS (Docker)

Instalasi menggunakan Docker adalah cara termudah dan paling aman untuk menjalankan StreamNexus di VPS yang sudah memiliki aplikasi lain.

## 1. Persiapan Terminal
Masuk ke VPS kamu via SSH dan pastikan Docker sudah terinstall:
```bash
docker --version
docker-compose --version
```

## 2. Download Source Code
Clone repository ke folder pilihan kamu di VPS:
```bash
git clone https://github.com/anji4cp/streamnexus.git
cd streamnexus
```

## 3. Konfigurasi Environment
Salin file `.env.example` menjadi `.env`:
```bash
cp .env.example .env
```
Edit file `.env` dan masukkan secret key serta sesuaikan port jika perlu:
```bash
nano .env
```
*Ganti `your_random_secret_here` dengan string acak yang panjang.*

## 4. Jalankan Aplikasi
Jalankan perintah berikut untuk membangun image dan menjalankan container di background:
```bash
docker-compose up -d --build
```

## 5. Tips untuk VPS yang Sudah Ada Aplikasi Lain
- **Port Conflict**: Jika port `7575` sudah dipakai, buka `docker-compose.yml` dan ubah bagian `ports` dari `"7575:7575"` menjadi `"PORT_BARU:7575"`.
- **Nginx Proxy Manager**: Jika kamu menggunakan NPM, arahkan domain ke IP VPS kamu dengan port `7575`.
- **Firewall**: Pastikan port `7575` diizinkan di firewall VPS (misal: `ufw allow 7575`).

Aplikasi sekarang bisa diakses melalui `http://IP_VPS_KAMU:7575`.
