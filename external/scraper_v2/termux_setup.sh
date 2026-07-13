#!/data/data/com.termux/files/usr/bin/bash
set -e

echo "=== Instalando dependencias para el scraper de Facebook ==="

echo ""
echo "[1/4] Actualizando paquetes..."
pkg update -y && pkg upgrade -y

echo ""
echo "[2/4] Instalando Python y Chromium..."
pkg install -y python chromium-browser

echo ""
echo "[3/4] Instalando dependencias Python..."
pip install requests pyppeteer

echo ""
echo "[4/4] Descargando scraper.py desde el servidor..."
echo "  Necesitás el token del scraper (Admin → Scraper de Facebook)"
echo "  Reemplazá TU_TOKEN por el token real"
echo ""
echo "  curl -o scraper.py \"https://sigotuhuella.online/api/facebook/scraper-script?token=TU_TOKEN\""
echo ""
echo "Ejemplo:"
echo "  curl -o scraper.py \"https://sigotuhuella.online/api/facebook/scraper-script?token=sihuella-scraper-2024\""

chmod +x scraper.py

echo ""
echo "=== Instalación completada ==="
echo ""
echo "Para probar:"
echo "  python3 scraper.py --token TU_TOKEN"
echo ""
echo "Para ejecutar cada 30 min:"
echo "  python3 scraper.py --token TU_TOKEN --daemon 30"
