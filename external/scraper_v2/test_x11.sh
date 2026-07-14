#!/data/data/com.termux/files/usr/bin/bash
set -e

URL="${1:-https://www.facebook.com/groups/}"
SCREENSHOT_DIR="/sdcard/Download"

echo "=== Test Chromium X11 ==="
echo "URL: $URL"
echo ""

# Verificar que termux-x11 esta instalado
if ! command -v termux-x11 &>/dev/null; then
    echo "ERROR: termux-x11 no instalado. Correr:"
    echo "  bash setup_x11.sh"
    exit 1
fi

# Matar instancias previas
pkill -f "termux-x11" 2>/dev/null || true
pkill -f "chromium" 2>/dev/null || true
sleep 1

# Iniciar display X11
echo "[1/4] Iniciando display X11..."
termux-x11 :0 -xstartup "openbox" &
X11_PID=$!
sleep 3

export DISPLAY=:0

# Verificar que el display esta activo
if ! xdpyinfo &>/dev/null; then
    echo "ERROR: Display :0 no esta activo"
    echo "  Asegurate de tener la APK de Termux:X11 abierta"
    exit 1
fi

echo "  Display activo: $DISPLAY"

# Abrir Chromium
echo "[2/4] Abriendo Chromium..."
chromium --no-sandbox --disable-dev-shm-usage "$URL" &
CHROMIUM_PID=$!

echo ""
echo "=== Chromium abierto ==="
echo "  Abri la app Termux:X11 en tu celular para ver la pagina"
echo ""
echo "Para tomar screenshot (en otro terminal Termux):"
echo "  DISPLAY=:0 import -window root $SCREENSHOT_DIR/fb_test.png"
echo ""
echo "Para cerrar:"
echo "  kill $CHROMIUM_PID $X11_PID"
echo ""
echo "Presiona Ctrl+C para salir"
wait
