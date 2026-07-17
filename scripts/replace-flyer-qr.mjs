import QRCode from 'qrcode';
import sharp from 'sharp';

const FLYER_PATH = 'flyers/difusion.jpeg';
const OUTPUT_PATH = 'public/difusion.jpeg';

const APP_URL = 'https://sigotuhuella.online';
const WA_URL = 'https://wa.me/5492212025190?text=Hola%21+Quiero+reportar+una+mascota';

const QR_SIZE = 280;

// Measured from pixel analysis of the original flyer (1024x1536)
const LEFT_QR_CONTENT = { x: 155, y: 670, w: 290, h: 360 };
const RIGHT_QR_CONTENT = { x: 600, y: 670, w: 270, h: 360 };

// New QR positions: centered in the cleared areas
const APP_QR = { left: 155, top: 680 };
const WA_QR = { left: 600, top: 680 };

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

  console.log('White-out old QR areas...');

  // Create white rectangles to cover old QR content
  const leftWhiteSvg = Buffer.from(
    `<svg width="${LEFT_QR_CONTENT.w}" height="${LEFT_QR_CONTENT.h}"><rect width="100%" height="100%" fill="white"/></svg>`
  );
  const rightWhiteSvg = Buffer.from(
    `<svg width="${RIGHT_QR_CONTENT.w}" height="${RIGHT_QR_CONTENT.h}"><rect width="100%" height="100%" fill="white"/></svg>`
  );

  console.log('Compositing new QR codes...');

  await sharp(FLYER_PATH)
    .composite([
      // Step 1: White-out old QR areas
      { input: leftWhiteSvg, left: LEFT_QR_CONTENT.x, top: LEFT_QR_CONTENT.y },
      { input: rightWhiteSvg, left: RIGHT_QR_CONTENT.x, top: RIGHT_QR_CONTENT.y },
      // Step 2: Place new QR codes centered
      { input: appQrBuffer, left: APP_QR.left, top: APP_QR.top, width: QR_SIZE, height: QR_SIZE },
      { input: waQrBuffer, left: WA_QR.left, top: WA_QR.top, width: QR_SIZE, height: QR_SIZE },
    ])
    .jpeg({ quality: 95 })
    .toFile(OUTPUT_PATH);

  console.log(`Done! Output: ${OUTPUT_PATH}`);
}

main().catch(err => { console.error(err); process.exit(1); });
