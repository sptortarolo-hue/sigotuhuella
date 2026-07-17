import sharp from 'sharp';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';

const CONFIDENCE_THRESHOLD = 0.5;

let model = null;
let modelLoadAttempted = false;

async function getModel() {
  if (model) return model;
  if (modelLoadAttempted) return null;

  modelLoadAttempted = true;
  try {
    console.log('[animalDetector] Loading COCO-SSD model...');
    model = await cocoSsd.load();
    console.log('[animalDetector] Model loaded');
    return model;
  } catch (err) {
    console.warn('[animalDetector] Could not load model:', err.message);
    return null;
  }
}

const TARGET_CLASSES = ['dog', 'cat'];

export async function detectAnimal(base64Image, mimeType) {
  try {
    const m = await getModel();
    if (!m) {
      return { detected: false, species: null, confidence: 0, bbox: null, error: null };
    }

    const buffer = Buffer.from(base64Image, 'base64');
    const inputImage = sharp(buffer);

    const { width, height } = await inputImage.metadata();

    const rawBuf = await inputImage
      .resize(640, 640, { fit: 'inside' })
      .removeAlpha()
      .raw()
      .toBuffer();

    const canvas = {
      width: 640,
      height: 640,
      data: new Uint8Array(rawBuf.buffer, rawBuf.byteOffset, rawBuf.byteLength),
    };

    const predictions = await m.detect(canvas, 5, 0.3);

    let best = null;
    for (const pred of predictions) {
      if (TARGET_CLASSES.includes(pred.class) && pred.score >= CONFIDENCE_THRESHOLD) {
        if (!best || pred.score > best.score) {
          best = {
            class: pred.class,
            score: pred.score,
            bbox: pred.bbox,
          };
        }
      }
    }

    if (best) {
      return {
        detected: true,
        species: best.class === 'dog' ? 'dog' : 'cat',
        confidence: best.score,
        bbox: best.bbox,
        error: null,
      };
    }

    return { detected: false, species: null, confidence: 0, bbox: null, error: null };
  } catch (err) {
    console.error('[animalDetector] Error:', err.message);
    return { detected: false, species: null, confidence: 0, bbox: null, error: err.message };
  }
}
