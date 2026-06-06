import pool from '../db.js';

const SPECIES_KEYWORDS = {
  dog: ['perro', 'perra', 'cachorro', 'cachorra', 'canino', 'dog', 'perrito', 'perrita', 'can', 'sabueso'],
  cat: ['gato', 'gata', 'gatito', 'gatita', 'felino', 'cat', 'minino', 'michi', 'misha', 'felix'],
};

const COMMON_COLORS = [
  'negro', 'blanco', 'marron', 'marrón', 'gris', 'dorado', 'crema',
  'atigrado', 'carey', 'bicolor', 'tricolor', 'overo', 'pardo',
  'albaricoque', 'cafe', 'café', 'canela', 'rojizo', 'rubio',
  'chocolate', 'beige', 'ceniza', 'atigrada',
];

const CLASSIFICATION_KEYWORDS = {
  lost: [
    'se perdió', 'se perdio', 'se busca', 'lo busco', 'la busco',
    'perdido', 'perdida', 'extraviado', 'extraviada', 'desapareció',
    'desaparecio', 'desaparecido', 'se fue', 'no vuelve', 'no aparece',
    'urgente', 'ayuda', 'rosario',
  ],
  found: [
    'encontré', 'encontre', 'encontrado', 'encontrada', 'apareció',
    'aparecio', 'apareció', 'hallé', 'halle', 'hallado', 'hallada',
    'recogí', 'recogi', 'rescaté', 'rescate', 'rescatado',
    'anda suelto', 'anda suelta', 'vaga por', 'deambula',
    'se refugió', 'se refugio',
  ],
  adoption: [
    'adopción', 'adopcion', 'en adopción', 'en adopcion', 'adoptar',
    'se entrega', 'regalan', 'regalo', 'busca hogar', 'necesita hogar',
    'dar en adopción', 'dar en adopcion', 'adoptame', 'adóptame',
  ],
};

const LOCATION_PATTERNS = [
  /(?:en|zona|barrio|localidad|partido|ciudad|calle|esquina)\s+([\w\sáéíóúñÁÉÍÓÚ,.-]{3,60})/i,
  /([\w\sáéíóúñÁÉÍÓÚ,.-]{3,60})\s*(?:zona|barrio|localidad|partido)/i,
];

const ARGENTINE_PHONE_PATTERNS = [
  /(\+?54\s?)?(?:11|15|2\d{2}|3\d{2}|4\d{2}|5\d{2}|6\d{2}|7\d{2}|8\d{2}|9\d{2})[\s-]?\d{2,4}[\s-]?\d{2,4}[\s-]?\d{2,4}/g,
  /(15|11)\s?\d{3,4}\s?\d{3,4}/g,
  /(\d{2,3}[-.\s]?){3,4}\d{2,3}/g,
];

export function extractSpecies(text) {
  const lower = text.toLowerCase();
  for (const [species, keywords] of Object.entries(SPECIES_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return species;
  }
  return null;
}

export function extractColors(text) {
  const lower = text.toLowerCase();
  const found = [];
  for (const color of COMMON_COLORS) {
    if (lower.includes(color)) found.push(color);
  }
  return found;
}

export function extractPhone(text) {
  for (const pattern of ARGENTINE_PHONE_PATTERNS) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      const cleaned = matches[0].replace(/[^+\d\s]/g, '').trim();
      if (cleaned.replace(/\D/g, '').length >= 7) return cleaned;
    }
  }
  return null;
}

export function extractLocation(text) {
  const lower = text.toLowerCase();
  for (const pattern of LOCATION_PATTERNS) {
    const match = lower.match(pattern);
    if (match && match[1].trim().length >= 3) {
      return match[1].trim().replace(/^[,\s]+|[,\s]+$/g, '');
    }
  }
  return null;
}

export function classifyPost(text) {
  const lower = text.toLowerCase();
  let classification = 'other';
  let maxScore = 0;

  for (const [type, keywords] of Object.entries(CLASSIFICATION_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        const count = (lower.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        score += count;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      classification = type;
    }
  }

  return classification;
}

export function isPointInPolygon(lat, lng, vertices) {
  if (!vertices || vertices.length < 3) return false;

  let inside = false;
  const n = vertices.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = vertices[i].lng || vertices[i].lng;
    const yi = vertices[i].lat || vertices[i].lat;
    const xj = vertices[j].lng || vertices[j].lng;
    const yj = vertices[j].lat || vertices[j].lat;

    if ((yi > lng) !== (yj > lng) && lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }

  return inside;
}

export function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function getCenteroid(vertices) {
  if (!vertices || vertices.length === 0) return null;
  const sum = vertices.reduce(
    (acc, v) => ({
      lat: acc.lat + v.lat,
      lng: acc.lng + v.lng,
    }),
    { lat: 0, lng: 0 }
  );
  return { lat: sum.lat / vertices.length, lng: sum.lng / vertices.length };
}

export function scalePolygon(vertices, amplitudePercent) {
  const center = getCenteroid(vertices);
  if (!center) return vertices;
  const factor = amplitudePercent / 100;
  return vertices.map(v => ({
    lat: center.lat + (v.lat - center.lat) * factor,
    lng: center.lng + (v.lng - center.lng) * factor,
  }));
}

export async function classifyAndExtract(text, imageUrls = []) {
  const species = extractSpecies(text);
  const colors = extractColors(text);
  const phone = extractPhone(text);
  const locationHint = extractLocation(text);
  const classification = classifyPost(text);

  let confidence = 0;
  if (classification !== 'other') confidence += 30;
  if (species) confidence += 25;
  if (colors.length > 0) confidence += 20;
  if (phone) confidence += 15;
  if (locationHint) confidence += 10;

  return {
    classification,
    species,
    colors,
    color: colors.length > 0 ? colors.join(', ') : null,
    phone,
    location_hint: locationHint,
    confidence,
    image_count: imageUrls.length,
  };
}

export async function getPolygonSettings() {
  const result = await pool.query(
    "SELECT key, value FROM settings WHERE key IN ('fb_polygon_vertices', 'fb_polygon_amplitude')"
  );
  const map = {};
  result.rows.forEach(r => (map[r.key] = r.value));

  let vertices = [];
  let amplitude = 100;

  try {
    if (map.fb_polygon_vertices) vertices = JSON.parse(map.fb_polygon_vertices);
  } catch {}
  if (map.fb_polygon_amplitude) amplitude = parseFloat(map.fb_polygon_amplitude) || 100;

  return { vertices, amplitude };
}
