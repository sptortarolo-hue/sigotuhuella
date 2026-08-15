// Backfill: marca como is_celebration los posts de celebración (reencuentro/adopción)
// que ya existen en la DB, para que las métricas de impacto sigan mostrando el posteo original.
// Corre desde server/: node scripts/markCelebrationPosts.js
// Idempotente: solo actualiza filas aún no marcadas.
import 'dotenv/config';
import pool from '../db.js';

const IG_PHRASES = [
  '¡Qué alegría!',
  '¡Final feliz!',
  '¡Buenas noticias!',
  '¡Nuevo hogar!',
  '¡Feliz adopción!',
  '¡Un final feliz más!',
];

const FB_STATUS_LABELS = ['🎉 REENCUENTRO', '✅ ADOPTADO'];
const FB_PATTERNS = [...IG_PHRASES, ...FB_STATUS_LABELS];

async function main() {
  const igUpdated = await pool.query(
    `UPDATE instagram_posts
     SET is_celebration = TRUE
     WHERE is_celebration IS NOT TRUE AND status = 'published'
       AND (${IG_PHRASES.map((_, i) => `caption ILIKE '%' || $${i + 1} || '%'`).join(' OR ')})
     RETURNING id`,
    IG_PHRASES
  );

  const fbUpdated = await pool.query(
    `UPDATE facebook_page_posts
     SET is_celebration = TRUE
     WHERE is_celebration IS NOT TRUE AND status = 'published'
       AND (${FB_PATTERNS.map((_, i) => `message ILIKE '%' || $${i + 1} || '%'`).join(' OR ')})
     RETURNING id`,
    FB_PATTERNS
  );

  console.log(`Instagram posts marcados como celebración: ${igUpdated.rowCount}`);
  console.log(`Facebook posts marcados como celebración: ${fbUpdated.rowCount}`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });