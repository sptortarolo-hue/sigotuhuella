#!/data/data/com.termux/files/usr/bin/bash
set -e

echo "=== Setup Scraper de Facebook para Termux ==="
echo ""
echo "Este scraper usa tls_client (TLS fingerprint real de Chrome)."
echo "Necesita proot-distro Ubuntu porque tls_client requiere glibc."
echo ""

echo "[1/6] Instalando proot-distro..."
pkg install -y proot-distro

echo ""
echo "[2/6] Instalando Ubuntu..."
proot-distro install ubuntu

echo ""
echo "[3/6] Instalando Python dentro de Ubuntu..."
proot-distro login ubuntu -- bash -c "apt update && apt install -y python3 python3-pip curl"

echo ""
echo "[4/6] Instalando dependencias Python (tls_client, requests)..."
proot-distro login ubuntu -- pip3 install tls_client requests

echo ""
echo "[5/6] Descargando scraper.py..."
echo "  Necesitás el token del scraper (Admin -> Scraper de Facebook)"
echo "  Reemplazá TU_TOKEN por el token real"
echo ""
echo "  proot-distro login ubuntu -- bash -c 'curl -o /root/scraper.py \"https://sigotuhuella.online/api/facebook/scraper-script?token=TU_TOKEN\"'"
echo ""

echo "[6/6] Listo! Para ejecutar:"
echo ""
echo "  Una vez:"
echo "    proot-distro login ubuntu -- python3 /root/scraper.py --token TU_TOKEN --once --debug"
echo ""
echo "  Daemon (cada 30 min):"
echo "    proot-distro login ubuntu -- python3 /root/scraper.py --token TU_TOKEN --daemon 30"
echo ""
echo "=== Setup completado ==="
