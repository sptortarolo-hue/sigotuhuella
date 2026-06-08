const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TMP = 'C:\\Users\\IPS\\AppData\\Local\\Temp\\opencode';

async function overpass(query) {
  const outFile = path.join(TMP, 'overpass_out.json');
  // Use curl.exe which we know works from this network
  const cmd = `curl.exe -s -m 30 --data-urlencode "data=${query}" "https://overpass-api.de/api/interpreter" -H "User-Agent: Mozilla/5.0" -o "${outFile}" 2>nul`;
  execSync(cmd, { timeout: 35000 });
  const raw = fs.readFileSync(outFile, 'utf8');
  if (raw.startsWith('<?xml')) {
    // Parse error XML
    const errMatch = raw.match(/Error: (.+?)</);
    throw new Error(errMatch ? errMatch[1] : 'XML error: ' + raw.slice(0, 200));
  }
  return JSON.parse(raw);
}

const PLACE_TYPES = {
  // These are the OSM place types for each neighborhood
  'la_plata': 'city',
  'tolosa': 'suburb',
  'los_hornos': 'suburb', 
  'ringuelet': 'suburb',
  'gonnet': 'town',
  'city_bell': 'town',
  'villa_elisa': 'town',
  'villa_elvira': 'suburb',
  'abasto': 'village',
  'san_carlos': 'suburb',
  'altos_san_lorenzo': 'suburb',
  'olmos': 'village',
  'melchor_romero': 'village',
  'gorina': 'village',
  'arana': 'village',
  'etcheverry': 'village',
  'arturo_segui': 'village',
  'el_peligro': 'village',
  'jose_hernandez': 'village',
  'garibaldi_sicardi': ['Villa Garibaldi', 'Parque Sicardi'],
  'ignacio_correas': 'village',
};

const SEARCH_NAMES = {
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
  'arturo_segui': ['Arturo Seguí', 'Seguí'],
  'el_peligro': ['El Peligro'],
  'jose_hernandez': ['José Hernández'],
  'garibaldi_sicardi': ['Villa Garibaldi', 'Parque Sicardi', 'Garibaldi', 'Sicardi'],
  'ignacio_correas': ['Ignacio Correas'],
};

async function main() {
  const results = {};
  const allNames = [...new Set(Object.values(SEARCH_NAMES).flat())];

  // Batch query all at once using name regex
  const namesRegex = allNames.map(n => 
    n.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  ).join('|');
  
  console.log(`Querying ${allNames.length} names via Overpass...`);

  // Query nodes with place tag
  const q = `[out:json];node["place"]["name"~"${namesRegex}"](-35.1,-58.3,-34.8,-57.7);out center bb tags(10);`;
  
  let data;
  try {
    data = await overpass(q);
  } catch (e) {
    console.error('Query failed:', e.message);
    // Try individual queries
    for (const [id, names] of Object.entries(SEARCH_NAMES)) {
      for (const name of names) {
        console.log(`  Trying ${name}...`);
        const q2 = `[out:json];node["place"]["name"="${name}"](-35.1,-58.3,-34.8,-57.7);out center bb;`;
        try {
          const d = await overpass(q2);
          if (d.elements?.length > 0) {
            if (!results[id]) results[id] = { nodes: [] };
            for (const el of d.elements) {
              if (el.lat && el.lon) {
                results[id].nodes.push({ lat: el.lat, lon: el.lon, place: el.tags?.place, name: el.tags?.name });
              }
            }
          }
        } catch (e2) {
          console.log(`    Error: ${e2.message}`);
        }
      }
    }
    console.log('\n=== RESULTS FROM SINGLE QUERIES ===');
    for (const [id, data] of Object.entries(results)) {
      console.log(`\n${id}:`);
      for (const n of data.nodes) {
        console.log(`  place=${n.place} name=${n.name} @ ${n.lat}, ${n.lon}`);
      }
    }
    return;
  }

  // Process the batch results
  const elements = data.elements || [];
  console.log(`Got ${elements.length} elements`);

  // Group by our ID
  for (const [id, names] of Object.entries(SEARCH_NAMES)) {
    const lowerNames = names.map(n => n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    
    const matching = elements.filter(el => {
      const elName = (el.tags?.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return lowerNames.some(n => elName.includes(n) || n.includes(elName));
    });

    if (matching.length === 0) {
      console.log(`  ${id}: NOT FOUND`);
      continue;
    }

    for (const el of matching) {
      const t = el.tags || {};
      if (!results[id]) results[id] = { nodes: [] };
      if (el.lat && el.lon && t.place) {
        results[id].nodes.push({ lat: el.lat, lon: el.lon, place: t.place, name: t.name });
      }
    }
  }

  // Output
  console.log('\n=== RESULTS ===\n');
  for (const [id, data] of Object.entries(results)) {
    // Pick the best node (prefer town > suburb > village > other)
    const sorted = data.nodes.sort((a, b) => {
      const rank = { city: 0, town: 1, suburb: 2, village: 3, locality: 4, neighbourhood: 5, hamlet: 6 };
      return (rank[a.place] ?? 99) - (rank[b.place] ?? 99);
    });
    const best = sorted[0];
    if (best) {
      console.log(`${id}: place=${best.place} name="${best.name}" @ ${best.lat.toFixed(6)}, ${best.lon.toFixed(6)}`);
    } else {
      console.log(`${id}: found but no place tag`);
    }
  }
}

main().catch(console.error);
