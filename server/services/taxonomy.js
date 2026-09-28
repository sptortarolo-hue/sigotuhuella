import pool from '../db.js';

export function strip(text) {
  if (!text) return '';
  return String(text).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// Vocabulario único en DB: dog/cat/other. La UI habla español;
// todo lo que entra se traduce con mapSpeciesToEn() antes del INSERT.
const SPECIES_ES_EN = {
  'perro': 'dog', 'perra': 'dog', 'dog': 'dog', 'can': 'dog', 'canino': 'dog',
  'gato': 'cat', 'gata': 'cat', 'cat': 'cat', 'felino': 'cat', 'michi': 'cat', 'mishi': 'cat',
  'otro': 'other', 'otra': 'other', 'other': 'other', 'ave': 'other', 'pajaro': 'other',
  'conejo': 'other', 'hamster': 'other', 'tortuga': 'other',
};

export function mapSpeciesToEn(species) {
  const s = strip(species);
  if (!s) return null;
  if (SPECIES_ES_EN[s]) return SPECIES_ES_EN[s];
  // plural obvio ("perros", "gatos") → singular
  const singular = s.endsWith('s') ? s.slice(0, -1) : s;
  return SPECIES_ES_EN[singular] || null;
}

export function speciesLabelEs(species) {
  const s = mapSpeciesToEn(species);
  return s === 'dog' ? 'perro' : s === 'cat' ? 'gato' : s === 'other' ? 'otro' : (species || 'mascota');
}

export const SIZE_ALIASES = {
  'pequeño': ['pequeño', 'pequeno', 'chico', 'small', 'mini', 'toy', 'portatil'],
  'mediano': ['mediano', 'medium', 'media'],
  'grande': ['grande', 'large', 'gigante', 'giant'],
};

export const COLOR_ALIASES = {
  'negro': ['negro', 'negra', 'azabache', 'oscuro'],
  'blanco': ['blanco', 'blanca', 'nieve'],
  'marrón': ['marron', 'marrón', 'cafe', 'café', 'chocolate', 'castano', 'castaño', 'canela'],
  'gris': ['gris', 'grisaceo', 'grisáceo', 'plomo', 'ceniza', 'plateado'],
  'dorado': ['dorado', 'dorada', 'amarillo', 'amarilla', 'rubio', 'rubia', 'leonado', 'miel'],
  'crema': ['crema', 'beige', 'marfil', 'manteca', 'arena'],
  'atigrado': ['atigrado', 'atigrada', 'tabby', 'barcino'],
  'bicolor': ['bicolor', 'dos colores', '2 colores'],
  'tricolor': ['tricolor', 'tres colores', '3 colores', 'carey', 'calico', 'cálico'],
  'naranja': ['naranja', 'naranjo', 'anaranjado', 'rojo', 'rojizo', 'colorado', 'pelirrojo', 'zanahoria'],
  'manchado': ['manchado', 'manchada', 'manchas', 'pinto', 'pintado', 'pintas', 'moteado', 'lunar'],
};

const COLOR_SPLIT_RE = /\s+(?:y|e|con|mas|\+|\/|,|;)\s+|\s*\/\s*|,\s*/;

const AGE_PATTERNS = [
  { group: 'cachorro', re: /(cachorr|gatit|bebe|puppy|kitten|peludito|joven|cachorro joven|jovencit|nacido|neonato|lactante)/i },
  { group: 'cachorro', re: /\b(\d{1,2})\s*(meses|mes|m\.?s\.?)\b/i, ageCheck: (m) => parseInt(m[1]) < 12 },
  { group: 'senior', re: /(viejo|viejit|ancian|senior|geronte|mayorcito)/i },
  { group: 'senior', re: /\bmayor\b/i },
  { group: 'adulto', re: /\badulto\b/i },
  // "3 años" → adulto salvo 7+ (senior); "1 año" → adulto
  { group: 'years', re: /\b(\d{1,2})\s*a[ñn]os?\b/i, ageCheck: (m) => parseInt(m[1]) >= 7 ? 'senior' : 'adulto' },
];

export function normalizeSize(sizeText) {
  const s = strip(sizeText);
  if (!s || s.includes('desconoc') || s.includes('no se')) return 'desconocido';
  for (const [name, aliases] of Object.entries(SIZE_ALIASES)) {
    for (const a of aliases) {
      if (s.includes(a)) return name;
    }
  }
  return 'desconocido';
}

function canonicalColorOf(token) {
  for (const [name, aliases] of Object.entries(COLOR_ALIASES)) {
    for (const a of aliases) {
      if (token === a || token.includes(a) || a.includes(token)) return name;
    }
  }
  return null;
}

export function normalizeColor(colorText) {
  return analyzeColor(colorText).canonical;
}

// Análisis de color con componentes: "blanco y negro" →
// { canonical: 'bicolor', components: ['blanco','negro'] }.
// Los componentes se guardan (color_tokens) para que el filtro "marrón"
// encuentre bicolores que contienen marrón sin falsos positivos.
export function analyzeColor(colorText) {
  const s = strip(colorText);
  if (!s) return { canonical: 'desconocido', components: [] };
  if (s.includes('desconoc') || s.includes('no se') || s.includes('sin dato')) {
    return { canonical: 'desconocido', components: [] };
  }
  const tokens = s.split(COLOR_SPLIT_RE).map(t => (t || '').trim()).filter(t => t.length >= 3);
  const found = [];
  for (const t of tokens) {
    const c = canonicalColorOf(t);
    if (c && c !== 'desconocido' && !found.includes(c)) found.push(c);
  }
  if (found.length >= 3) return { canonical: 'tricolor', components: found };
  if (found.length === 2) return { canonical: 'bicolor', components: found };
  if (found.length === 1) return { canonical: found[0], components: found };
  // sin separadores: match directo sobre el texto completo
  const direct = canonicalColorOf(s);
  if (direct) return { canonical: direct, components: [direct] };
  return { canonical: 'desconocido', components: [] };
}

export function normalizeAgeGroup(ageText) {
  const s = strip(ageText);
  if (!s) return 'desconocido';
  if (s.includes('desconoc') || s.includes('no se') || s.includes('sin dato')) return 'desconocido';
  for (const { group, re, ageCheck } of AGE_PATTERNS) {
    const m = s.match(re);
    if (m) {
      if (group === 'years') return ageCheck(m);
      if (ageCheck && !ageCheck(m)) continue;
      return group;
    }
  }
  return 'desconocido';
}

export function normalizeCoatLength(breedNormalized) {
  if (!breedNormalized) return 'desconocido';
  const longHair = ['Persa', 'Maine Coon', 'Shih Tzu', 'Yorkshire Terrier', 'Golden Retriever', 'Poodle', 'Fold Escocés', 'Galgo', 'Cocker', 'Border Collie'];
  if (longHair.includes(breedNormalized)) return 'largo';
  const shortHair = ['Beagle', 'Rottweiler', 'Doberman', 'Pitbull', 'Dogo', 'Bóxer', 'Bulldog', 'Dachshund', 'Sphynx', 'Bengala', 'Siames', 'British Shorthair'];
  if (shortHair.includes(breedNormalized)) return 'corto';
  return 'medio';
}

// Pelo declarado por el humano (columna coat) tiene prioridad sobre el derivado.
export function normalizeCoatExplicit(coatText) {
  const s = strip(coatText);
  if (!s) return null;
  if (s.includes('cort')) return 'corto';
  if (s.includes('larg')) return 'largo';
  if (s.includes('medi') || s.includes('medio') || s.includes('semi')) return 'medio';
  if (s.includes('desconoc') || s.includes('no s')) return 'desconocido';
  return null;
}

let breedCache = null;
async function loadBreeds() {
  if (breedCache) return breedCache;
  const res = await pool.query('SELECT species, name, aliases FROM breeds');
  const bySpecies = { dog: [], cat: [], other: [] };
  for (const r of res.rows) {
    const list = bySpecies[r.species] || (bySpecies[r.species] = []);
    list.push({ name: r.name, aliases: (r.aliases || []).map(a => strip(a)) });
  }
  breedCache = bySpecies;
  return breedCache;
}

export async function normalizeBreed(species, breedText) {
  const b = strip(breedText);
  if (!b) return null;
  const speciesEn = mapSpeciesToEn(species) || species;
  const bySpecies = await loadBreeds();
  const list = (bySpecies[speciesEn] || []).concat(bySpecies['other'] || []);
  for (const entry of list) {
    if (strip(entry.name) === b) return entry.name;
    for (const a of entry.aliases || []) {
      if (!a) continue;
      if (a === b) return entry.name;
      // includes() solo con 4+ letras de ambos lados (evita que alias
      // cortos como "lab" matcheen cualquier texto que empiece igual).
      if (a.length >= 4 && b.length >= 4 && (b.includes(a) || a.includes(b))) return entry.name;
    }
  }
  return null;
}

// Versión estricta para texto libre (descripción): solo nombre canónico
// como frase ("pastor alemán") o alias de una palabra como token exacto
// ("caniche"). Evita falsos positivos del includes() sobre prosa.
export async function normalizeBreedStrict(species, freeText) {
  const s = strip(freeText);
  if (!s) return null;
  const speciesEn = mapSpeciesToEn(species) || species;
  const bySpecies = await loadBreeds();
  const list = (bySpecies[speciesEn] || []).concat(bySpecies['other'] || []);
  const tokens = new Set(s.split(/[^a-z0-9]+/).filter(t => t.length >= 3));
  for (const entry of list) {
    const name = strip(entry.name);
    if (name && s.includes(name)) return entry.name;
    for (const a of entry.aliases || []) {
      if (a && !a.includes(' ') && tokens.has(a)) return entry.name;
    }
  }
  return null;
}

export async function applyPetTaxonomy(petId) {
  try {
    const res = await pool.query(
      `SELECT id, species, breed, color, size, age, coat, description FROM pets WHERE id = $1`,
      [petId]
    );
    const pet = res.rows[0];
    if (!pet) return;

    // Self-heal de especie: perro/gato/otro → dog/cat/other
    const speciesEn = mapSpeciesToEn(pet.species) || pet.species;
    // Si el campo dedicado está vacío, se rescata de la descripción libre
    // (avistajes rápidos y reportes con todo en el texto).
    const colorRaw = pet.color || pet.description;
    const sizeRaw = pet.size || pet.description;
    const ageRaw = pet.age || pet.description;
    const breedNormalized = pet.breed
      ? (await normalizeBreedStrict(speciesEn, pet.breed) || await normalizeBreed(speciesEn, pet.breed))
      : await normalizeBreedStrict(speciesEn, pet.description);
    const { canonical: colorNormalized, components: colorTokens } = analyzeColor(colorRaw);
    const sizeNormalized = normalizeSize(sizeRaw);
    const coat = normalizeCoatExplicit(pet.coat) || normalizeCoatLength(breedNormalized);
    const ageGroup = normalizeAgeGroup(ageRaw);

    await pool.query(
      `UPDATE pets SET species = $1, breed_normalized = $2, color_normalized = $3, color_tokens = $4, size_normalized = $5,
              coat_length = $6, age_group = $7
       WHERE id = $8`,
      [speciesEn, breedNormalized, colorNormalized, colorTokens, sizeNormalized, coat, ageGroup, petId]
    );
  } catch (err) {
    console.warn('[taxonomy] applyPetTaxonomy error:', err.message);
  }
}

export async function getTaxonomy() {
  const [breeds, sizes, colors, coats, ages] = await Promise.all([
    pool.query('SELECT species, name FROM breeds ORDER BY species, name'),
    pool.query('SELECT name FROM pet_sizes ORDER BY name'),
    pool.query('SELECT name FROM pet_colors ORDER BY name'),
    pool.query('SELECT name FROM pet_coat_lengths ORDER BY name'),
    pool.query('SELECT name FROM pet_age_groups ORDER BY name'),
  ]);
  const bySpecies = { dog: [], cat: [], other: [] };
  for (const r of breeds.rows) {
    (bySpecies[r.species] || (bySpecies[r.species] = [])).push(r.name);
  }
  return {
    breeds: bySpecies,
    sizes: sizes.rows.map(r => r.name),
    colors: colors.rows.map(r => r.name),
    coat_lengths: coats.rows.map(r => r.name),
    age_groups: ages.rows.map(r => r.name),
  };
}

// Backfill: normaliza todo lo pendiente (OR, no AND: incluye parciales).
// Devuelve conteo para el endpoint admin y el script manual.
export async function backfillTaxonomy(limit = 2000, onProgress = null) {
  const rows = await pool.query(
    `SELECT id FROM pets
     WHERE breed_normalized IS NULL OR size_normalized IS NULL OR color_normalized IS NULL
        OR coat_length IS NULL OR age_group IS NULL
        OR color_tokens IS NULL OR color_tokens = '{}'
        OR species IN ('perro', 'perra', 'gato', 'gata', 'otro', 'otra')
     ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  let ok = 0;
  for (const r of rows.rows) {
    await applyPetTaxonomy(r.id);
    ok++;
    if (onProgress && ok % 100 === 0) onProgress(ok, rows.rows.length);
  }
  return { total: rows.rows.length, normalized: ok };
}