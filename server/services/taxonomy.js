import pool from '../db.js';

function strip(text) {
  if (!text) return '';
  return String(text).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim();
}

const SIZE_ALIASES = {
  'pequeño': ['pequeño', 'pequeno', 'chico', 'small', 'mini', 'toy', 'portatil'],
  'mediano': ['mediano', 'medium', 'media'],
  'grande': ['grande', 'large', 'gigante', 'giant'],
};

const COLOR_ALIASES = {
  'negro': ['negro', 'negra'],
  'blanco': ['blanco', 'blanca'],
  'marrón': ['marron', 'marrón', 'cafe', 'café', 'chocolate', 'castano', 'castaño'],
  'gris': ['gris', 'grisaceo', 'grisáceo', 'plomo', 'ceniza'],
  'dorado': ['dorado', 'dorada', 'amarillo', 'amarilla', 'rubio', 'rubia'],
  'crema': ['crema', 'beige', 'marfil'],
  'atigrado': ['atigrado', 'atigrada', 'tabby', 'barcino'],
  'bicolor': ['bicolor', 'dos colores', '2 colores'],
  'tricolor': ['tricolor', 'tres colores', '3 colores'],
  'naranja': ['naranja', 'naranjo', 'anaranjado', 'rojo', 'colorado'],
  'manchado': ['manchado', 'manchada', 'pinto', 'pintado'],
};

const AGE_PATTERNS = [
  { group: 'cachorro', re: /(cachorr|gatit|bebe|bebé|puppy|kitten|peludito|mes(es)?\b|m\.?s\b)/i },
  { group: 'senior', re: /(viejo|viejit|ancian|senior|mayorcito|\d{1,2}\+?\s*a[ñn]os?\b)/i },
];

export function normalizeSize(sizeText) {
  const s = strip(sizeText);
  if (!s) return null;
  if (s.includes('desconoc') || s.includes('no se') || s === '') return 'desconocido';
  for (const [name, aliases] of Object.entries(SIZE_ALIASES)) {
    for (const a of aliases) {
      if (s.includes(a)) return name;
    }
  }
  return null;
}

export function normalizeColor(colorText) {
  const s = strip(colorText);
  if (!s) return null;
  if (s.includes('desconoc') || s.includes('no se') || s.includes('varios') || s.includes('sin dato')) return 'desconocido';
  for (const [name, aliases] of Object.entries(COLOR_ALIASES)) {
    for (const a of aliases) {
      if (s.includes(a)) return name;
    }
  }
  return null;
}

export function normalizeAgeGroup(ageText) {
  const s = strip(ageText);
  if (!s) return null;
  if (s.includes('desconoc') || s.includes('no se')) return 'desconocido';
  for (const { group, re } of AGE_PATTERNS) {
    if (re.test(s)) return group;
  }
  return null;
}

export function normalizeCoatLength(breedNormalized) {
  if (!breedNormalized) return null;
  const longHair = ['Persa', 'Maine Coon', 'Shih Tzu', 'Yorkshire Terrier', 'Golden Retriever', 'Poodle', 'Fold Escocés', 'Galgo', 'Cocker', 'Border Collie'];
  if (longHair.includes(breedNormalized)) return 'largo';
  const shortHair = ['Beagle', 'Rottweiler', 'Doberman', 'Pitbull', 'Dogo', 'Bóxer', 'Bulldog', 'Dachshund', 'Sphynx', 'Bengala', 'Siames', 'British Shorthair'];
  if (shortHair.includes(breedNormalized)) return 'corto';
  return 'medio';
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
  const bySpecies = await loadBreeds();
  const list = (bySpecies[species] || []).concat(bySpecies['other'] || []);
  for (const entry of list) {
    if (strip(entry.name) === b) return entry.name;
    for (const a of entry.aliases || []) {
      if (a && (a === b || b.includes(a) || a.includes(b))) return entry.name;
    }
  }
  return null;
}

export async function applyPetTaxonomy(petId) {
  try {
    const res = await pool.query(
      `SELECT id, species, breed, color, size, age FROM pets WHERE id = $1`,
      [petId]
    );
    const pet = res.rows[0];
    if (!pet) return;

    const breedNormalized = await normalizeBreed(pet.species, pet.breed);
    const colorNormalized = normalizeColor(pet.color);
    const sizeNormalized = normalizeSize(pet.size);
    const coat = normalizeCoatLength(breedNormalized);
    const ageGroup = normalizeAgeGroup(pet.age);

    await pool.query(
      `UPDATE pets SET breed_normalized = $1, color_normalized = $2, size_normalized = $3,
              coat_length = $4, age_group = $5
       WHERE id = $6`,
      [breedNormalized, colorNormalized, sizeNormalized, coat, ageGroup, petId]
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