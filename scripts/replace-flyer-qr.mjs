import QRCode from 'qrcode';
import sharp from 'sharp';

const FLYER_PATH = 'flyers/difusion.jpeg';
const OUTPUT_PATH = 'public/difusion.jpeg';

const APP_URL = 'https://sigotuhuella.com.ar';
const WA_URL = 'https://wa.me/5492212025190?text=Hola%21+Quiero+reportar+una+mascota';

const QR_SIZE = 270;

// Exact box interiors measured from pixel analysis
const LEFT_BOX = { x: 135, y: 665, w: 300, h: 380 };
const RIGHT_BOX = { x: 575, y: 665, w: 320, h: 380 };

// Background color sampled from inside the boxes
const BG_COLOR = '#f4eae1';

// New QR positioned at bottom of box interior, with padding from bottom edge
const BOTTOM_PAD = 5;
const APP_QR = { left: LEFT_BOX.x + Math.round((LEFT_BOX.w - QR_SIZE) / 2), top: LEFT_BOX.y + LEFT_BOX.h - QR_SIZE - BOTTOM_PAD };
const WA_QR = { left: RIGHT_BOX.x + Math.round((RIGHT_BOX.w - QR_SIZE) / 2), top: RIGHT_BOX.y + RIGHT_BOX.h - QR_SIZE - BOTTOM_PAD };

async function main() {
  console.log('Generating QR codes...');

  const appQrBuffer = await QRCode.toBuffer(APP_URL, {
    width: QR_SIZE,
    margin: 1,
    color: { dark: '#1a1a1a', light: '#ffffff' },
    errorCorrectionLevel: 'H',
  });

  const waQrBuffer = await QRCode.toBuffer(WA_URL, {
    width: QR_SIZE,
    margin: 1,
    color: { dark: '#1a1a1a', light: '#ffffff' },
    errorCorrectionLevel: 'H',
  });

  console.log('Covering old QR areas with matching background...');

  const qrMargin = 10;
  const leftBg = Buffer.from(
    `<svg width="${QR_SIZE + qrMargin * 2}" height="${QR_SIZE + qrMargin * 2}"><rect width="100%" height="100%" fill="${BG_COLOR}"/></svg>`
  );
  const rightBg = Buffer.from(
    `<svg width="${QR_SIZE + qrMargin * 2}" height="${QR_SIZE + qrMargin * 2}"><rect width="100%" height="100%" fill="${BG_COLOR}"/></svg>`
  );

  console.log(`Left QR at (${APP_QR.left}, ${APP_QR.top}), Right QR at (${WA_QR.left}, ${WA_QR.top})`);

  await sharp(FLYER_PATH)
    .composite([
      { input: leftBg, left: APP_QR.left - qrMargin, top: APP_QR.top - qrMargin },
      { input: rightBg, left: WA_QR.left - qrMargin, top: WA_QR.top - qrMargin },
      { input: appQrBuffer, left: APP_QR.left, top: APP_QR.top, width: QR_SIZE, height: QR_SIZE },
      { input: waQrBuffer, left: WA_QR.left, top: WA_QR.top, width: QR_SIZE, height: QR_SIZE },
    ])
    .jpeg({ quality: 95 })
    .toFile(OUTPUT_PATH);

  console.log(`Done! Output: ${OUTPUT_PATH}`);
}

main().catch(err => { console.error(err); process.exit(1); });
