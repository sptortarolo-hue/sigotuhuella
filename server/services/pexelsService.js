import pool from '../db.js';

const PEXELS_API = 'https://api.pexels.com';
const QUERIES = ['dog', 'cat', 'pet family', 'animal', 'dog park', 'cat playing', 'puppy', 'kitten'];

async function getApiKey() {
  const result = await pool.query("SELECT value FROM settings WHERE key = 'pexels_api_key'");
  if (result.rows.length > 0 && result.rows[0].value) return result.rows[0].value;
  const envKey = process.env.PEXELS_API_KEY;
  if (envKey) {
    await pool.query(
      "INSERT INTO settings (key, value) VALUES ('pexels_api_key', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
      [envKey]
    );
    return envKey;
  }
  return null;
}

export async function getPetPhotos(count) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    console.warn('[Pexels] No API key found, falling back to empty');
    return [];
  }

  const photos = [];
  const perPage = Math.min(count, 15);

  const shuffled = [...QUERIES].sort(() => Math.random() - 0.5);
  const usedQueries = shuffled.slice(0, Math.ceil(count / perPage) + 1);

  for (const query of usedQueries) {
    if (photos.length >= count) break;
    try {
      const res = await fetch(`${PEXELS_API}/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=portrait`, {
        headers: { Authorization: apiKey },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        console.warn(`[Pexels] API error ${res.status} for query '${query}'`);
        continue;
      }
      const data = await res.json();
      for (const photo of data.photos || []) {
        if (photos.length >= count) break;
        const imgUrl = photo.src?.portrait || photo.src?.medium;
        if (!imgUrl) continue;
        try {
          const imgRes = await fetch(imgUrl, { signal: AbortSignal.timeout(10000) });
          if (imgRes.ok) {
            const buf = Buffer.from(await imgRes.arrayBuffer());
            photos.push(buf.toString('base64'));
          }
        } catch { /* skip failed download */ }
      }
    } catch (err) {
      console.warn(`[Pexels] Request failed for query '${query}':`, err.message);
    }
  }

  for (let i = photos.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [photos[i], photos[j]] = [photos[j], photos[i]];
  }

  console.log('[Pexels] fetched', photos.length, '/', count, 'photos');
  return photos;
}
