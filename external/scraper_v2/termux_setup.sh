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
echo "[3/4] Instalando Playwright..."
pip install playwright

echo ""
echo "[4/4] Descargando scraper.py..."
curl -o scraper.py \
  https://raw.githubusercontent.com/sptortarolo-hue/sigotuhuella/main/external/scraper_v2/scraper.py

chmod +x scraper.py

echo ""
echo "=== Instalación completada ==="
echo ""
echo "Para probar:"
echo "  python3 scraper.py --token TU_TOKEN"
echo ""
echo "Para ejecutar cada 30 min:"
echo "  python3 scraper.py --token TU_TOKEN --daemon 30"
echo ""
echo "Para configurar job automático:"
echo "  termux-job-scheduler --interval 30 -- python3 scraper.py --token TU_TOKEN"
