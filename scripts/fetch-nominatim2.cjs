const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TMP = 'C:\\Users\\IPS\\AppData\\Local\\Temp\\opencode';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&featuretype=settlement&dedupe=1';

const NEIGHBORHOODS = [
  ['la_plata', 'La Plata'],
  ['tolosa', 'Tolosa'],
  ['los_hornos', 'Los Hornos'],
  ['ringuelet', 'Ringuelet'],
  ['gonnet', 'Gonnet, Manuel B. Gonnet'],
  ['city_bell', 'City Bell'],
  ['villa_elisa', 'Villa Elisa'],
  ['villa_elvira', 'Villa Elvira'],
  ['abasto', 'Abasto'],
  ['san_carlos', 'San Carlos'],
  ['altos_san_lorenzo', 'Altos de San Lorenzo'],
  ['olmos', 'Lisandro Olmos'],
  ['melchor_romero', 'Melchor Romero'],
  ['gorina', 'Joaquín Gorina'],
  ['arana', 'Eduardo Arana'],
  ['etcheverry', 'Ángel Etcheverry'],
  ['arturo_segui', 'Arturo Seguí'],
  ['el_peligro', 'El Peligro'],
  ['jose_hernandez', 'José Hernández'],
  ['garibaldi_sicardi', 'Villa Garibaldi'],
  ['ignacio_correas', 'Ignacio Correas'],
];

const COLORS = [
  '#EC4899', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6',
  '#14B8A6', '#EF4444', '#6366F1', '#F43F5E', '#06B6D4',
  '#D97706', '#65A30D', '#0284C7', '#7C3AED', '#059669',
  '#D946EF', '#CA8A04', '#EC4899', '#3B82F6', '#10B981',
  '#F59E0B',
];

function fetchNominatim(query) {
  const url = `${NOMINATIM}&q=${encodeURIComponent(query)}`;
  const outFile = path.join(TMP, 'nom_out.json');
  const cmd = `curl.exe -s -m 15 "${url}" -H "User-Agent: SigoTuHuella/1.0" -o "${outFile}" 2>nul`;
  execSync(cmd, { timeout: 20000, stdio: 'pipe' });
  if (!fs.existsSync(outFile)) return null;
  const raw = fs.readFileSync(outFile, 'utf8');
  try {
    const data = JSON.parse(raw);
    return data[0] || null;
  } catch { return null; }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const results = {};
  let idx = 0;

  for (const [id, name] of NEIGHBORHOODS) {
    const query = `${name}, Partido de La Plata, Buenos Aires, Argentina`;
    process.stdout.write(`${id} (${name})... `);
    const r = fetchNominatim(query);
    if (r && r.boundingbox) {
      const bb = r.boundingbox;
      results[id] = {
        name: results[id]?.name || r.display_name.split(',')[0].trim() || name,
        color: COLORS[idx % COLORS.length],
        bounds: {
          south: parseFloat(bb[0]),
          west: parseFloat(bb[2]),
          north: parseFloat(bb[1]),
          east: parseFloat(bb[3]),
        },
        // Always expand to at least 0.03° span
        _expanded: false,
      };
      // Expand tiny bounding boxes (POI-level)
      const latSpan = results[id].bounds.north - results[id].bounds.south;
      const lonSpan = results[id].bounds.east - results[id].bounds.west;
      if (latSpan < 0.02 || lonSpan < 0.02) {
        const centerLat = (results[id].bounds.north + results[id].bounds.south) / 2;
        const centerLon = (results[id].bounds.east + results[id].bounds.west) / 2;
        const expand = Math.max(0.015, 0.02 - Math.min(latSpan, lonSpan));
        results[id].bounds.south = centerLat - expand;
        results[id].bounds.north = centerLat + expand;
        results[id].bounds.west = centerLon - expand;
        results[id].bounds.east = centerLon + expand;
        results[id]._expanded = true;
      }
      console.log(`OK ${r.display_name.split(',')[0].trim()} → ${results[id].bounds.south.toFixed(4)}/${results[id].bounds.north.toFixed(4)} ${results[id].bounds.west.toFixed(4)}/${results[id].bounds.east.toFixed(4)}${results[id]._expanded ? ' (expanded)' : ''}`);
    } else {
      console.log('NOT FOUND');
    }
    idx++;
    await sleep(1100); // Nominatim rate limit
  }

  // Output TypeScript
  console.log('\n=== GENERATED DATA ===\n');
  console.log('export const NEIGHBORHOODS: Neighborhood[] = [');
  for (const [id, data] of Object.entries(results)) {
    if (!data) continue;
    console.log(`  {`);
    console.log(`    id: '${id}',`);
    console.log(`    name: '${data.name.replace(/'/g, "\\'")}',`);
    console.log(`    color: '${data.color}',`);
    console.log(`    bounds: { south: ${data.bounds.south.toFixed(6)}, west: ${data.bounds.west.toFixed(6)}, north: ${data.bounds.north.toFixed(6)}, east: ${data.bounds.east.toFixed(6)} },`);
    console.log(`  },`);
  }
  console.log('];');
}

main().catch(console.error);
