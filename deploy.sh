#!/bin/bash
cd /var/www/sigotuhuella
git pull
npm install
npm run build
pm2 restart sigotuhuella
