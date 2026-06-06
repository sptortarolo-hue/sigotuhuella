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

echo "=== Creando config.json ==="
if [ ! -f config.json ]; then
  cp config.json.example config.json
  echo "¡EDITÁ config.json con tus grupos y token!"
  echo "  - webhook_token: el mismo que configuraste en Admin > Facebook > Configuración"
  echo "  - groups: los URLs de los grupos de Facebook a scrapear"
fi

echo "=== Instalando servicio systemd ==="
SERVICE_FILE=/etc/systemd/system/sihuella-scraper.service
sudo tee "$SERVICE_FILE" > /dev/null <<'SERVICEEOF'
[Unit]
Description=Sigo Tu Huella — Facebook Scraper
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/sihuella/scraper
ExecStart=/opt/sihuella/scraper/venv/bin/python scraper.py --daemon
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
echo "  Probar:  python scraper.py"
echo ""
echo "⚠  No olvides editar config.json con los grupos correctos"
echo "   y el webhook_token que configuraste en el admin."
