#!/bin/bash
set -e

DIR="$HOME/fb-scraper"
mkdir -p "$DIR"
cd "$DIR"

echo '{"name":"fb-scraper","type":"module","dependencies":{}}' > package.json
npm install puppeteer-extra puppeteer-extra-plugin-stealth axios --silent 2>/dev/null

if [ ! -f fb-scraper.js ]; then
  scp -P 5905 root@138.36.236.69:/var/www/sigotuhuella/fb-scraper.js "$DIR/"
fi

chmod +x fb-scraper.js

echo ""
echo "=== Listo ==="
echo "Login:  FB_SCRAPER_HEADED=true node fb-scraper.js --login"
echo "Test:   FB_SCRAPER_HEADED=true node fb-scraper.js --test"
echo "Daemon: pm2 start fb-scraper.js --name fb-scraper"
