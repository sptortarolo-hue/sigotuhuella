import sharp from 'sharp';
import * as ort from 'onnxruntime-node';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODEL_PATH = join(__dirname, '..', 'models', 'yolov8n.onnx');
const INPUT_SIZE = 640;
const CONFIDENCE_THRESHOLD = 0.5;
const IOU_THRESHOLD = 0.45;
const COCO_CLASSES = {
  16: 'dog',
  17: 'cat',
};

let modelSession = null;
let modelLoadAttempted = false;

async function getSession() {
  if (modelSession) return modelSession;
  if (modelLoadAttempted) return null;

  modelLoadAttempted = true;
  try {
    modelSession = await ort.InferenceSession.create(MODEL_PATH);
    console.log('[animalDetector] Model loaded from', MODEL_PATH);
    return modelSession;
  } catch (err) {
    console.warn('[animalDetector] Could not load model:', err.message);
    return null;
  }
}

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

function iou(boxA, boxB) {
  const xA = Math.max(boxA[0], boxB[0]);
  const yA = Math.max(boxA[1], boxB[1]);
  const xB = Math.min(boxA[2], boxB[2]);
  const yB = Math.min(boxA[3], boxB[3]);
  const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
  if (interArea === 0) return 0;
  const boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1]);
  const boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1]);
  return interArea / (boxAArea + boxBArea - interArea);
}

function nms(detections, iouThreshold) {
  detections.sort((a, b) => b.confidence - a.confidence);
  const keep = [];
  for (let i = 0; i < detections.length; i++) {
    let suppressed = false;
    for (let j = 0; j < keep.length; j++) {
      if (iou(detections[i].bbox, keep[j].bbox) > iouThreshold) {
        suppressed = true;
        break;
      }
    }
    if (!suppressed) keep.push(detections[i]);
  }
  return keep;
}

function postprocess(output, imgW, imgH) {
  const numDetections = output[0][0].length;
  const scaleX = imgW / INPUT_SIZE;
  const scaleY = imgH / INPUT_SIZE;
  const results = [];

  for (let i = 0; i < numDetections; i++) {
    const cx = output[0][0][i];
    const cy = output[0][1][i];
    const w = output[0][2][i];
    const h = output[0][3][i];

    const x1 = (cx - w / 2) * scaleX;
    const y1 = (cy - h / 2) * scaleY;
    const x2 = (cx + w / 2) * scaleX;
    const y2 = (cy + h / 2) * scaleY;

    for (let classId = 0; classId < 80; classId++) {
      const confidence = sigmoid(output[0][4 + classId][i]);
      if (confidence < CONFIDENCE_THRESHOLD) continue;

      const className = COCO_CLASSES[classId];
      if (!className) continue;

      results.push({
        classId,
        className,
        confidence,
        bbox: [x1, y1, x2, y2],
      });
    }
  }

  return nms(results, IOU_THRESHOLD);
}

export async function detectAnimal(base64Image, mimeType) {
  try {
    const session = await getSession();
    if (!session) {
      return { detected: false, species: null, confidence: 0, bbox: null, error: null };
    }

    const buffer = Buffer.from(base64Image, 'base64');

    const { data, info } = await sharp(buffer)
      .resize(INPUT_SIZE, INPUT_SIZE, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const floatData = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
      floatData[i] = data[i] / 255.0;
    }

    const inputTensor = new ort.Tensor('float32', floatData, [1, 3, INPUT_SIZE, INPUT_SIZE]);

    const feeds = { [session.inputNames[0]]: inputTensor };
    const results = await session.run(feeds);
    const output = results[session.outputNames[0]].data;

    const outputArr = [];
    const rows = 84;
    const cols = 8400;
    for (let r = 0; r < rows; r++) {
      outputArr[r] = [];
      for (let c = 0; c < cols; c++) {
        outputArr[r][c] = output[r * cols + c];
      }
    }

    const detections = postprocess(outputArr, info.width, info.height);

    const bestDog = detections.find(d => d.className === 'dog');
    const bestCat = detections.find(d => d.className === 'cat');

    if (bestDog) {
      return {
        detected: true,
        species: 'dog',
        confidence: bestDog.confidence,
        bbox: bestDog.bbox,
        error: null,
      };
    }

    if (bestCat) {
      return {
        detected: true,
        species: 'cat',
        confidence: bestCat.confidence,
        bbox: bestCat.bbox,
        error: null,
      };
    }

    return { detected: false, species: null, confidence: 0, bbox: null, error: null };
  } catch (err) {
    console.error('[animalDetector] Error:', err.message);
    return { detected: false, species: null, confidence: 0, bbox: null, error: err.message };
  }
}
