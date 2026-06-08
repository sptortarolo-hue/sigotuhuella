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
    throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  return await resp.json();
}

// Step 1: Discover what's in La Plata area
async function discover() {
  console.log('=== DISCOVERY: place=suburb/neighbourhood in La Plata ===\n');

  const q = `[out:json];
area["name"="La Plata"]["admin_level"="6"]["boundary"="administrative"]->.a;
(
  node["place"~"suburb|neighbourhood|village|hamlet"](area.a);
  way["place"~"suburb|neighbourhood|village|hamlet"](area.a);
  rel["place"~"suburb|neighbourhood|village|hamlet"](area.a);
);
out center bb tags(100);`;

  const data = await fetchOverpass(q);
  const elements = data.elements || [];
  console.log(`Found ${elements.length} elements:\n`);

  // Group by name
  const byName = {};
  for (const el of elements) {
    const name = (el.tags?.name || '').trim();
    if (!name) continue;
    if (!byName[name]) byName[name] = { nodes: 0, ways: 0, rels: 0, bounds: [], centers: [] };
    if (el.type === 'node') byName[name].nodes++;
    if (el.type === 'way') byName[name].ways++;
    if (el.type === 'relation') byName[name].rels++;
    if (el.bounds) byName[name].bounds.push(el.bounds);
    if (el.center || el.lat) byName[name].centers.push(el.center || { lat: el.lat, lon: el.lon });
  }

  for (const [name, info] of Object.entries(byName).sort()) {
    const types = [];
    if (info.nodes) types.push(`${info.nodes} nodes`);
    if (info.ways) types.push(`${info.ways} ways`);
    if (info.rels) types.push(`${info.rels} relations`);
    const hasBounds = info.bounds.length > 0 ? '✅ bounds' : '❌ no bounds';
    console.log(`  ${name.padEnd(32)} (${types.join(', ')}) ${hasBounds}`);
  }

  // Also try admin_level=9 (locality)
  console.log('\n=== DISCOVERY: admin_level=9 ===\n');
  const q9 = `[out:json];area["name"="La Plata"]["admin_level"="6"]->.a;rel["admin_level"="9"](area.a);out center bb tags(50);`;
  try {
    const d9 = await fetchOverpass(q9);
    for (const el of (d9.elements || [])) {
      const t = el.tags || {};
      console.log(`  ${t.name || '(unnamed)'} bounds=${!!el.bounds}`);
      if (el.bounds) {
        console.log(`    bounds:`, JSON.stringify(el.bounds));
      }
    }
  } catch (e) {
    console.log(`  Error: ${e.message}`);
  }

  // Also look for boundary=administrative with admin_level=8 and 9
  for (const level of [8, 9]) {
    console.log(`\n=== DISCOVERY: boundary=administrative admin_level=${level} ===\n`);
    const qb = `[out:json];area["name"="La Plata"]["admin_level"="6"]->.a;relation["boundary"="administrative"]["admin_level"="${level}"](area.a);out center bb tags(50);`;
    try {
      const db = await fetchOverpass(qb);
      for (const el of (db.elements || [])) {
        const t = el.tags || {};
        console.log(`  ${t.name || '(unnamed)'} bounds=${!!el.bounds}`);
        if (el.bounds) {
          console.log(`    bounds:`, JSON.stringify(el.bounds));
        }
      }
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }
  }

  return byName;
}

// Step 2: Fetch full data for our neighborhoods
async function fetchBounds() {
  const OUR_NAMES = {
    'la_plata': ['La Plata'],
    'tolosa': ['Tolosa'],
    'los_hornos': ['Los Hornos'],
    'ringuelet': ['Ringuelet'],
    'gonnet': ['Manuel B. Gonnet', 'Gonnet'],
    'city_bell': ['City Bell'],
    'villa_elisa': ['Villa Elisa'],
    'villa_elvira': ['Villa Elvira'],
    'abasto': ['Abasto'],
    'san_carlos': ['San Carlos'],
    'altos_san_lorenzo': ['Altos de San Lorenzo'],
    'olmos': ['Lisandro Olmos', 'Olmos'],
    'melchor_romero': ['Melchor Romero', 'Romero'],
    'gorina': ['Joaquín Gorina', 'Gorina'],
    'arana': ['Eduardo Arana', 'Arana'],
    'etcheverry': ['Ángel Etcheverry', 'Etcheverry'],
    'arturo_segui': ['Arturo Seguí', 'Segui'],
    'el_peligro': ['El Peligro'],
    'jose_hernandez': ['José Hernández'],
    'garibaldi_sicardi': ['Villa Garibaldi', 'Parque Sicardi', 'Garibaldi', 'Sicardi'],
    'ignacio_correas': ['Ignacio Correas', 'Correas'],
  };

  // Build union query for all our names
  const nameQueries = Object.values(OUR_NAMES).flat().map(n =>
    `node["place"~"suburb|neighbourhood|village|hamlet"]["name"="${n}"](area.a);`
  ).join('\n    ');
  const nameQueries2 = Object.values(OUR_NAMES).flat().map(n =>
    `way["place"~"suburb|neighbourhood|village|hamlet"]["name"="${n}"](area.a);`
  ).join('\n    ');
  const nameQueries3 = Object.values(OUR_NAMES).flat().map(n =>
    `rel["place"~"suburb|neighbourhood|village|hamlet"]["name"="${n}"](area.a);`
  ).join('\n    ');
  const nameQueries4 = Object.values(OUR_NAMES).flat().map(n =>
    `rel["boundary"="administrative"]["name"="${n}"](area.a);`
  ).join('\n    ');

  const q = `[out:json];
area["name"="La Plata"]["admin_level"="6"]->.a;
(
    ${nameQueries}
    ${nameQueries2}
    ${nameQueries3}
    ${nameQueries4}
);
out center bb tags(50);`;

  console.log('\n=== FETCHING BOUNDS FOR OUR NEIGHBORHOODS ===\n');
  const data = await fetchOverpass(q);
  const elements = data.elements || [];
  console.log(`Found ${elements.length} elements\n`);

  // Group by our ID
  const results = {};
  for (const [id, names] of Object.entries(OUR_NAMES)) {
    const lowerNames = names.map(n => n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));

    const matching = elements.filter(el => {
      const name = (el.tags?.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return lowerNames.some(n => name.includes(n) || n.includes(name));
    });

    if (matching.length === 0) {
      console.log(`  ${id}: NO DATA`);
      results[id] = null;
      continue;
    }

    // Aggregate bounds
    let bounds = null;
    for (const el of matching) {
      if (el.bounds) {
        if (!bounds) bounds = { ...el.bounds };
        else {
          bounds.minlat = Math.min(bounds.minlat, el.bounds.minlat ?? el.bounds[0]);
          bounds.maxlat = Math.max(bounds.maxlat, el.bounds.maxlat ?? el.bounds[2]);
          bounds.minlon = Math.min(bounds.minlon, el.bounds.minlon ?? el.bounds[1]);
          bounds.maxlon = Math.max(bounds.maxlon, el.bounds.maxlon ?? el.bounds[3]);
        }
      } else if (el.lat && el.lon) {
        // Point only — use center + small radius
        if (!bounds) bounds = { minlat: el.lat, maxlat: el.lat, minlon: el.lon, maxlon: el.lon };
        bounds.minlat = Math.min(bounds.minlat, el.lat);
        bounds.maxlat = Math.max(bounds.maxlat, el.lat);
        bounds.minlon = Math.min(bounds.minlon, el.lon);
        bounds.maxlon = Math.max(bounds.maxlon, el.lon);
      }
    }

    if (bounds) {
      // Expand small bounds to at least 0.03° (~3.3km) for urban, 0.04° for others
      const latSpan = bounds.maxlat - bounds.minlat;
      const lonSpan = bounds.maxlon - bounds.minlon;
      const minSpan = id === 'la_plata' ? 0.035 : 0.025;
      if (latSpan < minSpan) {
        const expand = (minSpan - latSpan) / 2;
        bounds.minlat -= expand;
        bounds.maxlat += expand;
      }
      if (lonSpan < minSpan) {
        const expand = (minSpan - lonSpan) / 2;
        bounds.minlon -= expand;
        bounds.maxlon += expand;
      }

      const names = [...new Set(matching.map(el => el.tags?.name))].join(', ');
      console.log(`  ${id}: ${names}`);
      console.log(`    bounds: { south: ${bounds.minlat.toFixed(6)}, west: ${bounds.minlon.toFixed(6)}, north: ${bounds.maxlat.toFixed(6)}, east: ${bounds.maxlon.toFixed(6)} }`);
      results[id] = bounds;
    } else {
      console.log(`  ${id}: found but no bounds/coords`);
      results[id] = null;
    }
  }

  return results;
}

async function main() {
  await discover();
  const results = await fetchBounds();

  console.log('\n=== MISSING ===');
  for (const [id, data] of Object.entries(results)) {
    if (!data) console.log(`  ${id}`);
  }
}

main().catch(console.error);
