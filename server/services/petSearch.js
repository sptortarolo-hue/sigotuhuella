import pool from '../db.js';
import { strip, SIZE_ALIASES, COLOR_ALIASES } from './taxonomy.js';

// Motor de búsqueda facetada por niveles:
//   Nivel 0 — igualdad exacta sobre columna normalizada (canónico).
//   Nivel 1 — triggers ILIKE sobre la columna raw (rescata no-normalizados
//             y multicolores: "marrón" matchea "marrón con blanco").
//   Nivel 2 — similitud trigram sobre raw (typos: "canniche"). Requiere
//             extensión pg_trgm; si no existe, el nivel se omite.
// Devuelve { conditions, rankExpr }: rankExpr suma el nivel por faceta
// (0 = mejor) para ORDER BY.

let trigramOk = null;
export async function trigramAvailable() {
  if (trigramOk === null) {
    try {
      const r = await pool.query(
        `SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') AS ok`
      );
      trigramOk = !!r.rows[0]?.ok;
    } catch {
      trigramOk = false;
    }
  }
  return trigramOk;
}

function escLike(s) {
  return s.replace(/[%_\\]/g, (m) => `\\${m}`);
}

// Palabras gatillo (ES, sin tildes) para un valor canónico.
function triggersFromAliases(canonical, aliasMap) {
  const canon = strip(canonical);
  const aliases = aliasMap[canon] || aliasMap[canonical] || [];
  const words = new Set([canon, ...aliases.map(strip)]);
  return [...words].filter((w) => w && w.length >= 3).map((w) => `%${escLike(w)}%`);
}

let breedTriggerCache = null;
let breedTriggerTs = 0;
async function breedTriggers() {
  const now = Date.now();
  if (breedTriggerCache && now - breedTriggerTs < 60000) return breedTriggerCache;
  const map = {};
  try {
    const res = await pool.query('SELECT name, aliases FROM breeds');
    for (const r of res.rows) {
      const words = new Set([strip(r.name), ...((r.aliases || []).map(strip))]);
      map[r.name] = [...words].filter((w) => w && w.length >= 3).map((w) => `%${escLike(w)}%`);
    }
  } catch {
    // sin tabla: solo trigram/exacto
  }
  breedTriggerCache = map;
  breedTriggerTs = now;
  return map;
}

const COAT_TRIGGERS = {
  'corto': ['%corto%', '%corta%', '%short%', '%pelo corto%'],
  'medio': ['%medio%', '%media%', '%medium%', '%semi%'],
  'largo': ['%largo%', '%larga%', '%long%', '%pelo largo%', '%peludo%', '%melena%'],
  'desconocido': [],
};

// Edad: los triggers salen de los mismos patrones que el normalizador.
const AGE_TRIGGERS = {
  'cachorro': ['%cachorr%', '%gatit%', '%bebe%', '%joven%', '%jovencit%', '%mes%', '%puppy%', '%kitten%', '%nacido%', '%lactante%'],
  'adulto': ['%adulto%', '%adulta%'],
  'senior': ['%viejo%', '%vieja%', '%viejit%', '%ancian%', '%senior%', '%mayor%', '%geronte%'],
  'desconocido': [],
};

// Palabras (len>=4) del nombre canónico + alias para el nivel trigram.
async function breedTrigramWords(canonical) {
  const map = await breedTriggers();
  const words = new Set([strip(canonical)]);
  for (const p of map[canonical] || []) {
    for (const w of String(p).replace(/[%\\]/g, '').split(/[^a-z0-9]+/)) words.add(w);
  }
  return [...words];
}

function rawColFor(facet) {
  return { breed: 'p.breed', size: 'p.size', color: 'p.color', age_group: 'p.age', coat: null }[facet] || null;
}

// Comparación sin tildes ni mayúsculas (los triggers van normalizados).
const rawNorm = (col) => `translate(lower(${col}), 'áéíóúüñ', 'aeiouun')`;

export async function buildFacetConditions(query, params) {
  const conditions = [];
  const rankParts = [];
  const useTrigram = await trigramAvailable();

  const push = (cond) => conditions.push(cond);
  const pushRank = (expr) => rankParts.push(expr);
  const nextParam = (v) => {
    params.push(v);
    return `$${params.length}`;
  };

  // ── Especie (+ fallback IA cuando species es NULL) ──
  const species = query.species;
  if (species && species !== 'all') {
    const p = nextParam(species);
    push(`(p.species = ${p} OR (p.species IS NULL AND p.animal_species = ${p}))`);
    pushRank(`(CASE WHEN p.species = ${p} THEN 0 ELSE 1 END)`);
  }

  // ── Facetas normalizadas con fallback raw ──
  const facets = [
    { key: 'breed', norm: 'p.breed_normalized', triggers: async (v) => (await breedTriggers())[v] || [`%${escLike(strip(v))}%`] },
    { key: 'size', norm: 'p.size_normalized', triggers: async (v) => triggersFromAliases(v, SIZE_ALIASES) },
    {
      key: 'color', norm: 'p.color_normalized',
      // Componentes guardados: "marrón" matchea bicolores con marrón (nivel 0).
      extraOr: (p) => `${p} = ANY(p.color_tokens)`,
      triggers: async (v) => triggersFromAliases(v, COLOR_ALIASES),
    },
    { key: 'age_group', norm: 'p.age_group', rawCol: 'p.age', triggers: async (v) => AGE_TRIGGERS[strip(v)] || [] },
    { key: 'coat', norm: 'p.coat_length', rawCol: null, triggers: async (v) => COAT_TRIGGERS[strip(v)] || [] },
  ];

  for (const f of facets) {
    const value = query[f.key];
    if (!value || value === 'all') continue;
    const exactP = nextParam(value);
    const rawCol = f.rawCol !== undefined ? f.rawCol : rawColFor(f.key);
    const patterns = await f.triggers(value);
    const ors = [`${f.norm} = ${exactP}`];
    let rankExpr = `(CASE WHEN ${f.norm} = ${exactP} THEN 0`;
    if (f.extraOr) {
      const extraP = nextParam(value);
      ors.push(f.extraOr(extraP));
      rankExpr += ` WHEN ${f.extraOr(extraP)} THEN 0`;
    }
    if (rawCol && patterns.length > 0) {
      const patP = nextParam(patterns);
      ors.push(`${rawNorm(rawCol)} ILIKE ANY (${patP})`);
      rankExpr += ` WHEN ${rawNorm(rawCol)} ILIKE ANY (${patP}) THEN 1`;
    }
    if (useTrigram && rawCol) {
      // Comparación sin tildes ni mayúsculas; en razas se prueba cada
      // palabra del catálogo (typos: "labrdor" → "labrador").
      const normSql = rawNorm(`coalesce(${rawCol}, '')`);
      const words = f.key === 'breed'
        ? await breedTrigramWords(value)
        : [strip(value)];
      const triConds = [];
      for (const w of words.filter((w) => w && w.length >= 4)) {
        const triP = nextParam(w);
        triConds.push(`(similarity(${normSql}, ${triP}) > 0.2)`);
      }
      if (triConds.length > 0) {
        ors.push(`(${triConds.join(' OR ')})`);
        rankExpr += ` WHEN ${triConds.join(' OR ')} THEN 2`;
      }
    }
    rankExpr += ` ELSE 3 END)`;
    push(`(${ors.join(' OR ')})`);
    pushRank(rankExpr);
  }

  // ── Estado (en servidor: for_adoption_simple abarca for_adoption) ──
  const status = query.status;
  if (status && status !== 'all') {
    if (status === 'for_adoption_simple') {
      push(`(p.status = 'for_adoption' OR p.status = 'for_adoption_simple')`);
    } else {
      const p = nextParam(status);
      push(`p.status = ${p}`);
    }
  }

  return {
    conditions,
    rankExpr: rankParts.length > 0 ? `(${rankParts.join(' + ')})` : null,
  };
}
