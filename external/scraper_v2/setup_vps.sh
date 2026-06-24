#!/bin/bash
set -e

echo "=== Instalando Chromium ==="
apt install -y chromium-browser

echo ""
echo "=== Instalando dependencias Python ==="
source /opt/sihuella/venv/bin/activate
pip install pyppeteer

echo ""
echo "=== Setup listo ==="
echo "Para probar:"
echo "  source /opt/sihuella/venv/bin/activate && python3 /opt/sihuella/scrape_grupos.py"
