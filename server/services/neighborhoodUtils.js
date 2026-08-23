// Matching tolerante de barrios entre mascotas, agrupaciones y suscripciones.
// normalizeNb() (JS) y nbNormSql() (SQL translate) usan el MISMO mapa de reemplazo,
// garantizando paridad exacta entre ambos lados.
const NB_MAP = {
  'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ü': 'u',
  'à': 'a', 'è': 'e', 'ì': 'i', 'ò': 'o', 'ù': 'u',
  'ä': 'a', 'ë': 'e', 'ï': 'i', 'ö': 'o',
  'â': 'a', 'ê': 'e', 'î': 'i', 'ô': 'o', 'û': 'u',
  'ã': 'a', 'õ': 'o', 'ç': 'c', 'ñ': 'n',
};

export function normalizeNb(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[áéíóúüàèìòùäëïöâêîôûãõçñ]/g, ch => NB_MAP[ch]);
}

const FROM_CHARS = Object.keys(NB_MAP).join('');
const TO_CHARS = Object.values(NB_MAP).join('');

export function nbNormSql(expr) {
  return `translate(lower(btrim(${expr})), '${FROM_CHARS}', '${TO_CHARS}')`;
}

// Overlap tolerante entre el array jsonb de una columna y un param jsonb ($1::jsonb).
// petCol puede requerir cast explícito cuando la columna es TEXT (ej: pets.neighborhoods).
export function nbOverlapSql(param, petCol = '(neighborhoods)::jsonb') {
  return `EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(${petCol}) pet_nb
    JOIN jsonb_array_elements_text(${param}::jsonb) sub_nb
      ON ${nbNormSql('pet_nb')} = ${nbNormSql('sub_nb')}
  )`;
}
