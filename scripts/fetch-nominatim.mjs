const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';

const NEIGHBORHOOD_QUERIES = [
  ['la_plata', 'La Plata, Buenos Aires, Argentina'],
  ['tolosa', 'Tolosa, La Plata, Buenos Aires, Argentina'],
  ['los_hornos', 'Los Hornos, La Plata, Buenos Aires, Argentina'],
  ['ringuelet', 'Ringuelet, La Plata, Buenos Aires, Argentina'],
  ['gonnet', 'Manuel B. Gonnet, La Plata, Buenos Aires, Argentina'],
  ['city_bell', 'City Bell, La Plata, Buenos Aires, Argentina'],
  ['villa_elisa', 'Villa Elisa, La Plata, Buenos Aires, Argentina'],
  ['villa_elvira', 'Villa Elvira, La Plata, Buenos Aires, Argentina'],
  ['abasto', 'Abasto, La Plata, Buenos Aires, Argentina'],
  ['san_carlos', 'San Carlos, La Plata, Buenos Aires, Argentina'],
  ['altos_san_lorenzo', 'Altos de San Lorenzo, La Plata, Buenos Aires, Argentina'],
  ['olmos', 'Lisandro Olmos, La Plata, Buenos Aires, Argentina'],
  ['melchor_romero', 'Melchor Romero, La Plata, Buenos Aires, Argentina'],
  ['gorina', 'Joaquín Gorina, La Plata, Buenos Aires, Argentina'],
  ['arana', 'Eduardo Arana, La Plata, Buenos Aires, Argentina'],
  ['etcheverry', 'Ángel Etcheverry, La Plata, Buenos Aires, Argentina'],
  ['arturo_segui', 'Arturo Seguí, La Plata, Buenos Aires, Argentina'],
  ['el_peligro', 'El Peligro, La Plata, Buenos Aires, Argentina'],
  ['jose_hernandez', 'José Hernández, La Plata, Buenos Aires, Argentina'],
  ['garibaldi_sicardi', 'Villa Garibaldi, La Plata, Buenos Aires, Argentina'],
  ['garibaldi_sicardi', 'Parque Sicardi, La Plata, Buenos Aires, Argentina'],
  ['ignacio_correas', 'Ignacio Correas, La Plata, Buenos Aires, Argentina'],
];

const COLORS = [
  '#EC4899', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6',
  '#14B8A6', '#EF4444', '#6366F1', '#F43F5E', '#06B6D4',
  '#D97706', '#65A30D', '#0284C7', '#7C3AED', '#059669',
  '#D946EF', '#CA8A04', '#EC4899', '#3B82F6', '#10B981',
  '#F59E0B',
];

async function fetchNominatim(query) {
  const url = `${NOMINATIM_URL}/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'SigoTuHuella/1.0 (neighborhood-bounds-fetcher)',
    },
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`);
  }
  const data = await resp.json();
  return data[0] || null;
}

async function main() {
  const results = {};
  let colorIdx = 0;

  for (const [id, query] of NEIGHBORHOOD_QUERIES) {
    process.stdout.write(`  ${id}... `);
    try {
      const result = await fetchNominatim(query);
      if (result && result.boundingbox) {
        const bb = result.boundingbox; // [lat_min, lat_max, lon_min, lon_max]
        const name = result.display_name?.split(',')[0] || query;
        if (!results[id]) {
          results[id] = { name, color: COLORS[colorIdx++ % COLORS.length], bounds: { lat_min: parseFloat(bb[0]), lat_max: parseFloat(bb[1]), lon_min: parseFloat(bb[2]), lon_max: parseFloat(bb[3]) } };
          console.log(`OK: ${name}`);
        } else {
          // Merge bounds for garibaldi_sicardi (two queries)
          const r = results[id];
          r.bounds.lat_min = Math.min(r.bounds.lat_min, parseFloat(bb[0]));
          r.bounds.lat_max = Math.max(r.bounds.lat_max, parseFloat(bb[1]));
          r.bounds.lon_min = Math.min(r.bounds.lon_min, parseFloat(bb[2]));
          r.bounds.lon_max = Math.max(r.bounds.lon_max, parseFloat(bb[3]));
          r.name = 'Villa Garibaldi - P. Sicardi';
          console.log(`Merged: ${r.name}`);
        }
      } else {
        console.log(`NOT FOUND`);
      }
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
    }
    // Nominatim rate limit: 1 req/sec
    await new Promise(r => setTimeout(r, 1100));
  }

  // Output results
  console.log('\n=== RESULTS ===');
  for (const [id, data] of Object.entries(results)) {
    const bb = data.bounds;
    console.log(`\n  '${id}': {`);
    console.log(`    name: '${data.name}',`);
    console.log(`    color: '${data.color}',`);
    console.log(`    bounds: { south: ${bb.lat_min}, west: ${bb.lon_min}, north: ${bb.lat_max}, east: ${bb.lon_max} },`);
    console.log(`  },`);
  }

  // Check missing
  const expectedIds = [...new Set(NEIGHBORHOOD_QUERIES.map(([id]) => id))];
  for (const id of expectedIds) {
    if (!results[id]) {
      console.error(`\nMISSING: ${id}`);
    }
  }
}

main().catch(console.error);
