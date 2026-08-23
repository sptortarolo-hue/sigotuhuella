// Matching tolerante de barrios entre mascotas, agrupaciones y suscripciones.
// normalizeNb() (JS) y nbNormSql() (SQL) implementan EXACTAMENTE la misma cadena
// de normalización para garantizar paridad entre ambos lados.
//
// Cadena de normalización (en orden):
// 1. lowercase + trim
// 2. guiones bajos/guiones → espacios (ids frontend 'villa_elisa' == 'villa elisa')
// 3. acentos → letra plana (NB_MAP)
// 4. aliases entre catálogo frontend y server (ver NB_ALIASES)
const NB_MAP = {
  'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ü': 'u',
  'à': 'a', 'è': 'e', 'ì': 'i', 'ò': 'o', 'ù': 'u',
  'ä': 'a', 'ë': 'e', 'ï': 'i', 'ö': 'o',
  'â': 'a', 'ê': 'e', 'î': 'i', 'ô': 'o', 'û': 'u',
  'ã': 'a', 'õ': 'o', 'ç': 'c', 'ñ': 'n',
};

const FROM_CHARS = Object.keys(NB_MAP).join('');
const TO_CHARS = Object.values(NB_MAP).join('');

export function normalizeNb(name) {
  if (!name) return '';
  let base = String(name)
    .toLowerCase()
    .trim()
    .replace(/[_\-]+/g, ' ')
    .replace(/[áéíóúüàèìòùäëïöâêîôûãõçñ]/g, ch => NB_MAP[ch]);
  base = base.split('lisandro olmos').join('\x01');
  base = base.split('olmos').join('lisandro olmos');
  base = base.split('\x01').join('lisandro olmos');
  base = base.split('altos san lorenzo').join('altos de san lorenzo');
  base = base.split('arturo segui').join('segui');
  return base;
}

export function nbNormSql(expr) {
  const base = `translate(lower(btrim(replace(replace(${expr}, '_', ' '), '-', ' '))), '${FROM_CHARS}', '${TO_CHARS}')`;
  const step1 = `replace(${base}, 'lisandro olmos', chr(1))`;
  const step2 = `replace(${step1}, 'olmos', 'lisandro olmos')`;
  const step3 = `replace(${step2}, chr(1), 'lisandro olmos')`;
  const step4 = `replace(${step3}, 'altos san lorenzo', 'altos de san lorenzo')`;
  return `replace(${step4}, 'arturo segui', 'segui')`;
}

// Overlap tolerante entre el array jsonb de una columna y un param jsonb ($1::jsonb).
// petCol puede requerir cast explícito cuando la columna es TEXT (ej: pets.neighborhoods).
// NULLIF protege contra strings vacíos en columnas TEXT (''::jsonb es JSON inválido).
export function nbOverlapSql(param, petCol = "(NULLIF(neighborhoods, '')::jsonb)") {
  return `EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(${petCol}) pet_nb
    JOIN jsonb_array_elements_text(${param}::jsonb) sub_nb
      ON ${nbNormSql('pet_nb')} = ${nbNormSql('sub_nb')}
  )`;
}
