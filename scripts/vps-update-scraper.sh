#!/bin/bash
set -e

echo "============================================"
echo "  Sigo Tu Huella — Scraper VPS Update"
echo "============================================"
echo ""

SCRAPER_DIR="/opt/sihuella/scraper"

# 1. Pull latest code
echo "[1/6] Pulling latest code..."
cd "$SCRAPER_DIR"
git pull

# 2. Activate venv and install deps
echo "[2/6] Installing dependencies (Selenium, webdriver-manager)..."
source venv/bin/activate
pip install -r requirements.txt

# 3. Remove pyppeteer and its Chromium cache (~150MB)
echo "[3/6] Removing old pyppeteer + Chromium cache..."
pip uninstall pyppeteer -y 2>/dev/null || echo "  pyppeteer not installed, skipping"
PYPPETEER_DIR="$HOME/.local/share/pyppeteer"
if [ -d "$PYPPETEER_DIR" ]; then
    rm -rf "$PYPPETEER_DIR"
    echo "  Chromium cache removed ($PYPPETEER_DIR)"
fi
# Also check alternative location
if [ -d "$HOME/.pyppeteer" ]; then
    rm -rf "$HOME/.pyppeteer"
    echo "  Chromium cache removed ($HOME/.pyppeteer)"
fi

# 4. Verify Chrome is available
echo "[4/6] Verifying Chrome installation..."
if command -v google-chrome &> /dev/null; then
    echo "  Chrome found: $(google-chrome --version)"
elif command -v google-chrome-stable &> /dev/null; then
    echo "  Chrome found: $(google-chrome-stable --version)"
elif command -v chromium-browser &> /dev/null; then
    echo "  Chromium found: $(chromium-browser --version)"
else
    echo "  Chrome not installed — webdriver-manager will download it automatically"
fi

# 5. Restart service
echo "[5/6] Restarting sihuella-scraper service..."
systemctl restart sihuella-scraper
sleep 2

# 6. Verify
echo "[6/6] Checking service status..."
systemctl status sihuella-scraper --no-pager -l | head -15

echo ""
echo "============================================"
echo "  Update complete!"
echo "  Logs: journalctl -u sihuella-scraper -f"
echo "============================================"
