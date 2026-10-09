#!/bin/bash
# Install AnimeAPI (kuramanime scraper) di Oracle Cloud.
# Cara pakai: bash install-animeapi-oracle.sh
set -e

APP_DIR="$HOME/app/animeapi"
SERVICE="animeapi"

echo "== 1. Clone / update repo =="
mkdir -p "$HOME/app"
if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR" && git pull
else
  git clone https://github.com/eboot/animeapi.git "$APP_DIR"
  cd "$APP_DIR"
fi

echo "== 2. Install dependencies =="
npm install

echo "== 3. Systemd service (port 3002) =="
sudo tee /etc/systemd/system/${SERVICE}.service > /dev/null <<EOF
[Unit]
Description=AnimeAPI Kurama Scraper
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3002

[Install]
WantedBy=multi-user.target
EOF

echo "== 4. Start service =="
sudo systemctl daemon-reload
sudo systemctl enable --now $SERVICE
sleep 2
sudo systemctl is-active --quiet $SERVICE && echo "OK: $SERVICE jalan" || {
  echo "GAGAL: cek log:"; sudo journalctl -u $SERVICE --no-pager -n 20; exit 1
}

echo "== 5. Tes API =="
curl -s localhost:3002/api/stats && echo && echo "SELESAI: http://$(curl -s ifconfig.me 2>/dev/null || echo <ip-oracle>):3002/api/stats"
