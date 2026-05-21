import pool from '../db.js';
import { sendAdminNotificationEmail } from '../auth.js';

const SPECIES_KEYWORDS = {
  perro: ['perro', 'perra', 'cachorro', 'cachorra', 'canino', 'dog', 'perrito', 'perrita'],
  gato: ['gato', 'gata', 'gatito', 'gatita', 'felino', 'cat', 'minino', 'michi'],
};

const COMMON_COLORS = [
  'negro', 'blanco', 'marron', 'marrón', 'gris', 'dorado', 'crema',
  'atigrado', 'carey', 'bicolor', 'tricolor', 'overo', 'pardo',
  'albaricoque', 'cafe', 'café', 'canela', 'rojizo', 'rubio',
];

function extractSpecies(text) {
  const lower = text.toLowerCase();
  for (const [species, keywords] of Object.entries(SPECIES_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return species;
  }
  return null;
}

function extractColors(text) {
  const lower = text.toLowerCase();
  return COMMON_COLORS.filter(c => lower.includes(c));
}

function extractLocation(text) {
  const patterns = [
    /(?:en|zona|barrio|localidad|partido|ciudad)\s+([\w\sáéíóúñ,.-]{3,60})/i,
    /([\w\sáéíóúñ,.-]{3,60})\s*(?:zona|barrio|localidad)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  return null;
}

function calculateMatchScore(reported, lost) {
  let score = 0;
  const reasons = [];

  // Species (required for high score)
  if (reported.species === lost.species) {
    score += 30;
    reasons.push('misma especie');
  }

  // Color overlap
  if (reported.colors && lost.color) {
    const lostColors = lost.color.toLowerCase().split(/[\s,/\-]+/).filter(Boolean);
    const matchCount = reported.colors.filter(c => lostColors.some(lc => lc.includes(c) || c.includes(lc))).length;
    if (matchCount > 0) {
      score += matchCount * 15;
      reasons.push(`${matchCount} color(es) coincidente(s)`);
    }
  }

  // Sex
  if (reported.gender && lost.gender && reported.gender === lost.gender) {
    score += 10;
    reasons.push('mismo sexo');
  }

  // Location proximity (coarse — same word overlap in location strings)
  if (reported.location && lost.location) {
    const rWords = new Set(reported.location.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2));
    const lWords = lost.location.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2);
    let overlap = 0;
    for (const w of rWords) if (lWords.includes(w)) overlap++;
    if (overlap > 0) {
      score += Math.min(overlap * 10, 20);
      reasons.push(`${overlap} términno(s) de ubicación en común`);
    }
  }

  // Description word overlap
  if (reported.description && lost.description) {
    const rWords = new Set(reported.description.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const lWords = new Set(lost.description.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    let overlap = 0;
    for (const w of rWords) if (lWords.has(w)) overlap++;
    if (overlap > 0) {
      score += Math.min(overlap * 3, 15);
      reasons.push(`descripción similar`);
    }
  }

  return { score: Math.min(score, 100), reasons };
}

export async function findMatches(pet) {
  try {
    // Fetch lost pets of the same species
    const lostRes = await pool.query(
      `SELECT p.*, u.email as owner_email, u.display_name as owner_name
       FROM pets p
       LEFT JOIN users u ON p.created_by = u.id
       WHERE p.status = 'lost' AND p.id != $1
       ORDER BY p.created_at DESC`,
      [pet.id]
    );

    const matches = [];
    for (const lost of lostRes.rows) {
      const reported = {
        species: pet.species,
        colors: extractColors((pet.color || '') + ' ' + (pet.description || '')),
        gender: pet.gender,
        location: pet.location,
        description: pet.description,
      };
      const { score, reasons } = calculateMatchScore(reported, lost);
      if (score >= 50) {
        matches.push({ lost, score, reasons });
      }
    }

    // Sort by score descending
    matches.sort((a, b) => b.score - a.score);

    // Send alerts for top matches
    for (const match of matches.slice(0, 3)) {
      await sendAdminNotificationEmail(
        '🎯 Posible match detectado',
        `<p style="font-size:16px;margin-bottom:16px;">Se detectó un posible match entre un nuevo reporte y una mascota perdida.</p>
         <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
           <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Nuevo reporte</td>
               <td style="padding:8px;border:1px solid #e2e8f0;"><a href="${process.env.FRONTEND_URL || 'https://sigotuhuella.online'}/pet/${pet.id}">Ver publicación</a></td></tr>
           <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Match con</td>
               <td style="padding:8px;border:1px solid #e2e8f0;"><a href="${process.env.FRONTEND_URL || 'https://sigotuhuella.online'}/pet/${match.lost.id}">${match.lost.name || 'Sin nombre'}</a></td></tr>
           <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Score</td>
               <td style="padding:8px;border:1px solid #e2e8f0;">${match.score}%</td></tr>
           <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Razones</td>
               <td style="padding:8px;border:1px solid #e2e8f0;">${match.reasons.join(', ')}</td></tr>
         </table>`
      );
    }

    return matches;
  } catch (err) {
    console.error('Matching service error:', err);
    return [];
  }
}
