const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

const QUERY = `
[out:json];
area["name"="La Plata"]["admin_level"="8"]->.a;
rel["admin_level"="10"](area.a);
out center bb;
`;

const NAME_MAP = {
  'la_plata': ['La Plata', 'Casco Urbano', 'La Plata Centro'],
  'tolosa': ['Tolosa'],
  'los_hornos': ['Los Hornos'],
  'ringuelet': ['Ringuelet'],
  'gonnet': ['Manuel B. Gonnet', 'Gonnet'],
  'city_bell': ['City Bell'],
  'villa_elisa': ['Villa Elisa'],
  'villa_elvira': ['Villa Elvira'],
  'abasto': ['Abasto'],
  'san_carlos': ['San Carlos'],
  'altos_san_lorenzo': ['Altos de San Lorenzo', 'San Lorenzo'],
  'olmos': ['Lisandro Olmos', 'Olmos'],
  'melchor_romero': ['Melchor Romero', 'Romero'],
  'gorina': ['Joaquín Gorina', 'Gorina'],
  'arana': ['Eduardo Arana', 'Arana'],
  'etcheverry': ['Ángel Etcheverry', 'Etcheverry'],
  'arturo_segui': ['Arturo Seguí', 'Seguí'],
  'el_peligro': ['El Peligro'],
  'jose_hernandez': ['José Hernández'],
  'garibaldi_sicardi': ['Villa Garibaldi', 'Parque Sicardi', 'Garibaldi', 'Sicardi'],
  'ignacio_correas': ['Ignacio Correas', 'Correas'],
};

async function fetchOverpass() {
  const resp = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'SigoTuHuella/1.0 (neighborhood-bounds-fetcher)',
    },
    body: `data=${encodeURIComponent(QUERY)}`,
  });
  if (!resp.ok) {
    const text = await resp.text();
    console.error(`HTTP ${resp.status}:`, text.slice(0, 500));
    process.exit(1);
  }
  return await resp.json();
}

function matchName(osmName, ourNames) {
  const lower = osmName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return ourNames.some(name =>
    lower.includes(name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
  );
}

async function main() {
  const data = await fetchOverpass();
  const elements = data.elements || [];

  const results = {};

  for (const el of elements) {
    const tags = el.tags || {};
    const name = tags.name || '';
    if (!name) continue;

    for (const [id, names] of Object.entries(NAME_MAP)) {
      if (matchName(name, names)) {
        const bb = el.bounds || el.box || el.boundingbox;
        if (bb) {
          results[id] = {
            name: tags.name,
            bounds: {
              lat_min: bb.minlat ?? parseFloat(bb[0]),
              lat_max: bb.maxlat ?? parseFloat(bb[2]),
              lng_min: bb.minlon ?? parseFloat(bb[1]),
              lng_max: bb.maxlon ?? parseFloat(bb[3]),
            },
          };
        } else {
          results[id] = {
            name: tags.name,
            center: el.center || tags.center,
          };
        }
        break;
      }
    }
  }

  // Print missing
  for (const id of Object.keys(NAME_MAP)) {
    if (!results[id]) {
      console.error(`No match found for: ${id}`);
    }
  }

  console.log(JSON.stringify(results, null, 2));
  return results;
}

main().catch(console.error);
