<div align="center">

![logo](public/images/logo_readme.svg)

# StreamNexus
### Premium Multi-Platform Streaming Solution

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**StreamNexus** is a powerful, web-based live streaming platform designed for stability and ease of use. Stream to YouTube, Facebook, Twitch, and custom RTMP destinations simultaneously from a single dashboard.

[🚀 Installation](#-installation) • [📖 Features](#-features) • [🐳 Docker](#-docker)

</div>

---

## ✨ Key Features

- **Multi-Platform Streaming** - Broadcast to multiple platforms simultaneously.
- **Video Management** - Upload, organize, and manage your video assets.
- **Smart Scheduler** - Schedule streams with precision and auto-start/stop capabilities.
- **Real-time Monitoring** - Live dashboard with stream health status.
- **Cloud Integration** - Import directly from Google Drive, MEGA, and more.
- **Secure** - Built-in role management and security headers.

## 💻 System Requirements

- **Node.js** v18+
- **FFmpeg** (Included/Required)
- **SQLite3**
- **1 CPU Core & 1GB RAM** (Minimum)

## ⚡ Installation

### 1. Requirements
Update your system and install Node.js + FFmpeg:
```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs ffmpeg git
```

### 2. Setup StreamNexus
Clone the repository and install dependencies:
```bash
git clone https://github.com/anji4cp/streamnexus.git
cd streamnexus
npm install
```

### 3. Configuration
Generate a secret key and start the server:
```bash
node generate-secret.js
# Optional: Edit .env for custom PORT
nano .env
```

### 4. Run Application
```bash
npm start
# OR for development
npm run dev
```

Visit `http://YOUR_SERVER_IP:7575`

## 🐳 Docker Deployment

```bash
docker-compose up -d --build
```

---
© 2026 - **streamnexus**
