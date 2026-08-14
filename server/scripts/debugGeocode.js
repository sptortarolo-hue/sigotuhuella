import { parseLaPlataAddress, geocodeAddress } from '../services/geocoding.js';
import pool from '../db.js';

const TEST_ADDRESSES = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : ['672 y 20 bis', '15 y 662', '137 y 90', '12 entre 52 y 53'];

async function main() {
  for (const addr of TEST_ADDRESSES) {
    console.log(`\n========================================`);
    console.log(`Testing: "${addr}"`);
    console.log(`========================================`);

    // Paso 1: Parser
    const lp = parseLaPlataAddress(addr);
    console.log(`1. parseLaPlataAddress:`, lp);

    if (!lp) {
      console.log(`   → No matchea formato La Plata`);
      const result = await geocodeAddress(addr).catch(e => `ERROR: ${e.message}`);
      console.log(`   geocodeAddress final:`, result);
      continue;
    }

    // Paso 2: Determinar estrategia
    const roadNum = parseInt(lp.road);
    const useGrid = !isNaN(roadNum) && roadNum <= 122;
    console.log(`2. roadNum=${roadNum}, useGrid=${useGrid}`);

    if (useGrid) {
      console.log(`   → Usara grid fallback (casco 1-122)`);
    } else {
      console.log(`   → Usara Overpass (numeracion externa)`);
    }

    // Paso 3: Resultado final
    const result = await geocodeAddress(addr).catch(e => `ERROR: ${e.message}`);
    console.log(`3. geocodeAddress final:`, result);

    // Paso 4: Verificar si hay pets con esta direccion en la BD
    try {
      const pets = await pool.query(
        `SELECT id, location, latitude, longitude FROM pets WHERE location ILIKE $1 LIMIT 5`,
        [`%${addr}%`]
      );
      if (pets.rows.length > 0) {
        console.log(`4. Pets en BD con esta direccion:`);
        for (const p of pets.rows) {
          const dist = result && typeof result === 'object'
            ? haversine(p.latitude, p.longitude, result.lat, result.lng)
            : 'N/A';
          console.log(`   ${p.id}: lat=${p.latitude}, lng=${p.longitude} | location="${p.location}" | diff=${dist}m`);
        }
      } else {
        console.log(`4. No hay pets en BD con esta direccion`);
      }
    } catch (e) {
      console.log(`4. Error querying BD: ${e.message}`);
    }
  }
  process.exit(0);
}

function haversine(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return 'N/A';
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

main().catch(e => { console.error(e); process.exit(1); });
