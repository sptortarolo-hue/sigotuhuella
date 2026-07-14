#!/data/data/com.termux/files/usr/bin/bash
set -e

echo "=== Setup Termux X11 + Chromium ==="
echo ""

echo "[1/3] Instalando dependencias..."
pkg update -y
pkg install -y x11-repo xorg-server-xvfb chromium

echo ""
echo "[2/3] Verificando chromium..."
if ! command -v chromium &>/dev/null; then
    echo "  Instalando chromium..."
    pkg install -y chromium
else
    echo "  Chromium ya instalado: $(which chromium)"
fi

echo ""
echo "[3/3] Verificando APK de Termux:X11..."
echo ""
echo "  IMPORTANTE: Necesitas instalar la APK de Termux:X11"
echo "  Descargala desde: https://github.com/termux/termux-x11/releases"
echo "  Busca: termux-x11-*-debug.apk"
echo ""
echo "=== Setup completado ==="
echo ""
echo "Para probar:"
echo "  bash test_x11.sh https://www.facebook.com/groups/TU_GRUPO/"
