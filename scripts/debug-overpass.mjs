const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

async function fetchOverpass(query) {
  const resp = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'SigoTuHuella/1.0 (neighborhood-bounds-fetcher)',
    },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${text.slice(0, 300)}`);
  }
  return await resp.json();
}

const SEARCH_NAMES = [
  'Tolosa', 'Ringuelet', 'Manuel B. Gonnet', 'City Bell', 'Villa Elisa',
  'Villa Elvira', 'Abasto', 'San Carlos', 'Altos de San Lorenzo',
  'Lisandro Olmos', 'Melchor Romero', 'Joaquín Gorina', 'Eduardo Arana',
  'Ángel Etcheverry', 'Arturo Seguí', 'El Peligro', 'José Hernández',
  'Villa Garibaldi', 'Parque Sicardi', 'Ignacio Correas', 'La Plata',
  'Los Hornos',
];

async function main() {
  // Try different levels to find neighborhoods in La Plata area
  for (const level of [8, 9, 10]) {
    console.log(`\n=== admin_level=${level} in La Plata ===`);
    const q = `[out:json];area["name"="La Plata"]->.a;rel["admin_level"="${level}"](area.a);out center bb tags(50);`;
    try {
      const r = await fetchOverpass(q);
      for (const el of (r.elements || [])) {
        const t = el.tags || {};
        console.log(`  ${t.name || '(unnamed)'} (id=${el.id}) level=${t.admin_level} boundary=${t.boundary || '-'}`);
      }
    } catch (e) {
      console.error(`  Error:`, e.message);
    }
  }

  // Try to find if City Bell exists as relation
  console.log(`\n=== Searching specific names ===`);
  for (const name of SEARCH_NAMES) {
    // Try relation query
    const q = `[out:json];(rel["name"="${name}"]["boundary"="administrative"];);out center bb tags(10);`;
    try {
      const r = await fetchOverpass(q);
      if (r.elements?.length > 0) {
        for (const el of r.elements) {
          const t = el.tags || {};
          console.log(`  FOUND: ${t.name} (id=${el.id}) level=${t.admin_level} type=${el.type}`);
          if (el.bounds) console.log(`    bounds:`, JSON.stringify(el.bounds));
          if (el.center) console.log(`    center:`, JSON.stringify(el.center));
        }
      } else {
        // Try as node/place
        const q2 = `[out:json];node["name"="${name}"]["place"];out center bb tags(10);`;
        const r2 = await fetchOverpass(q2);
        if (r2.elements?.length > 0) {
          for (const el of r2.elements) {
            const t = el.tags || {};
            console.log(`  NODE: ${t.name} (id=${el.id}) place=${t.place || '-'} lat=${el.lat} lon=${el.lon}`);
          }
        }
      }
    } catch (e) {
      console.error(`  Error for ${name}:`, e.message);
    }
  }
}

main().catch(console.error);
