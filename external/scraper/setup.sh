#!/bin/bash
set -e

# ============================================================
# Scraper Facebook — Sigo Tu Huella
# Setup script for Ubuntu VPS (tested on 24.04)
# ============================================================

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "=== Instalando dependencias Python ==="
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Install Playwright browsers (chromium only to save space)
playwright install chromium

# Read APP_URL and APP_TOKEN from arguments or .env
APP_URL="${1:-https://sigotuhuella.online}"
APP_TOKEN="${2}"

if [ -z "$APP_TOKEN" ]; then
  if [ -f .env ]; then
    set -a; source .env; set +a
  fi
  APP_TOKEN="${APP_TOKEN:-${API_TOKEN:-}}"
fi

# FB_EMAIL / FB_PASSWORD opcionales para login automático
if [ -f .env ]; then
  set -a; source .env; set +a
fi

echo "=== Instalando servicio systemd ==="
SERVICE_FILE=/etc/systemd/system/sihuella-scraper.service
sudo tee "$SERVICE_FILE" > /dev/null <<SERVICEEOF
[Unit]
Description=Sigo Tu Huella — Facebook Scraper
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/sihuella/scraper
ExecStart=/opt/sihuella/scraper/venv/bin/python scraper.py --daemon
Environment=API_TOKEN=${APP_TOKEN}
Environment=FB_EMAIL=${FB_EMAIL:-}
Environment=FB_PASSWORD=${FB_PASSWORD:-}
Restart=on-failure
RestartSec=30
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICEEOF

echo "=== Habilitando e iniciando servicio ==="
sudo systemctl daemon-reload
sudo systemctl enable sihuella-scraper
sudo systemctl start sihuella-scraper

echo ""
echo "=== Listo ==="
echo "  Estado:  systemctl status sihuella-scraper"
echo "  Logs:    journalctl -u sihuella-scraper -f"
echo "  Probar:  python scraper.py --api-base-url=${APP_URL}"
echo ""
echo "  El scraper se autoconfigura desde ${APP_URL}/api/facebook/scraper-config"
echo "  Grupos y token se gestionan desde el panel admin."
