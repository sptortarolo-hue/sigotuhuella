import QRCode from 'qrcode';
import sharp from 'sharp';

const FLYER_PATH = 'flyers/difusion.jpeg';
const OUTPUT_PATH = 'public/difusion.jpeg';

const APP_URL = 'https://sigotuhuella.online';
const WA_URL = 'https://wa.me/5492212025190?text=Hola%21+Quiero+reportar+una+mascota';

const QR_SIZE = 200;
const APP_QR = { left: 168, top: 740 };
const WA_QR = { left: 668, top: 740 };

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

  console.log('Compositing onto flyer...');

  await sharp(FLYER_PATH)
    .composite([
      { input: appQrBuffer, left: APP_QR.left, top: APP_QR.top, width: QR_SIZE, height: QR_SIZE },
      { input: waQrBuffer, left: WA_QR.left, top: WA_QR.top, width: QR_SIZE, height: QR_SIZE },
    ])
    .jpeg({ quality: 95 })
    .toFile(OUTPUT_PATH);

  console.log(`Done! Output: ${OUTPUT_PATH}`);
}

main().catch(err => { console.error(err); process.exit(1); });
