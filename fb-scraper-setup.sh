#!/bin/bash
# fb-scraper-setup.sh — Setup de Facebook Scraper en Termux
# Ejecutar una vez después de clonar el repo

set -e

echo "=== FB Scraper Setup ==="

# 1. Dependencias del sistema
echo "[1/4] Instalando dependencias..."
pkg update -y && pkg upgrade -y
pkg install -y x11-repo chromium nodejs python termux-api pm2

# 2. Dependencias npm
echo "[2/4] Instalando dependencias npm..."
npm install puppeteer-extra puppeteer-extra-plugin-stealth 2>/dev/null || true

# 3. Variables de entorno
echo "[3/4] Configurando variables de entorno..."
ENV_FILE="$HOME/.fb-scraper-env"
cat > "$ENV_FILE" << 'EOF'
export SCRAPER_TOKEN=sihuella
export FB_SCRAPER_HEADED=false
export FB_SCRAPER_INTERVAL=4
export FB_SCRAPER_MAX_POSTS=20
export CHROMIUM_PATH=/data/data/com.termux/files/usr/bin/chromium-browser
EOF

if ! grep -q "fb-scraper-env" "$HOME/.bashrc" 2>/dev/null; then
  echo "source $ENV_FILE" >> "$HOME/.bashrc"
fi
source "$ENV_FILE"

# 4. Test rápido
echo "[4/4] Verificando..."
echo "  Chromium: $(which chromium-browser 2>/dev/null || echo 'NO ENCONTRADO')"
echo "  Node: $(node --version)"
echo "  PM2: $(pm2 --version 2>/dev/null || echo 'NO ENCONTRADO')"
echo "  Token: $SCRAPER_TOKEN"
echo "  Intervalo: ${FB_SCRAPER_INTERVAL}h"
echo ""
echo "=== Setup completo ==="
echo ""
echo "Próximos pasos:"
echo "  1. Login manual:  FB_SCRAPER_HEADED=true node fb-scraper.js --login"
echo "  2. Test:          FB_SCRAPER_HEADED=true node fb-scraper.js --test"
echo "  3. Production:    pm2 start fb-scraper.js --name fb-scraper"
echo "  4. Logs:          pm2 logs fb-scraper"
echo "  5. Save:          pm2 save"
