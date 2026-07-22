import sharp from 'sharp';
import jpeg from 'jpeg-js';

let classifier = null;

async function getClassifier() {
  if (!classifier) {
    const { pipeline, RawImage } = await import('@xenova/transformers');
    classifier = {
      fn: await pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32'),
      RawImage,
    };
  }
  return classifier;
}

const TARGET_CANDIDATES = ['dog', 'cat', 'no animal'];
const CONFIDENCE_THRESHOLD = 0.55;

async function imageToRawImage(base64Image) {
  const buffer = Buffer.from(base64Image, 'base64');
  const jpegBuf = await sharp(buffer).resize(224, 224, { fit: 'cover' }).jpeg({ quality: 85 }).toBuffer();
  const decoded = jpeg.decode(jpegBuf, { formatAsRGBA: false, useTArray: true });
  const { RawImage } = await getClassifier();
  const image = new RawImage(new Uint8ClampedArray(decoded.data), decoded.width, decoded.height, 3);
  image.resize = async () => image;
  image.center_crop = async () => image;
  return image;
}

export async function detectAnimal(base64Image, mimeType) {
  try {
    const { fn } = await getClassifier();
    const image = await imageToRawImage(base64Image);
    const results = await fn(image, TARGET_CANDIDATES);

    const top = results[0];
    if (!top) return { detected: false, species: null, confidence: 0, bbox: null, error: null };

    if (top.label === 'no animal' || top.score < CONFIDENCE_THRESHOLD) {
      return { detected: false, species: null, confidence: top.score, bbox: null, error: null };
    }

    return {
      detected: true,
      species: top.label === 'dog' ? 'dog' : 'cat',
      confidence: top.score,
      bbox: null,
      error: null,
    };
  } catch (err) {
    console.error('[animalDetector] Error:', err.message);
    return { detected: false, species: null, confidence: 0, bbox: null, error: err.message };
  }
}
