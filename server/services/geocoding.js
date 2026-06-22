const NEIGHBORHOOD_CENTERS = {
  'la plata': { lat: -34.9155, lng: -57.9480 },
  'tolosa': { lat: -34.8918, lng: -57.9742 },
  'los hornos': { lat: -34.9594, lng: -57.9807 },
  'ringuelet': { lat: -34.8848, lng: -57.9915 },
  'gonnet': { lat: -34.8819, lng: -58.0103 },
  'city bell': { lat: -34.8675, lng: -58.0474 },
  'villa elisa': { lat: -34.8515, lng: -58.0854 },
  'villa elvira': { lat: -34.9394, lng: -57.9208 },
  'abasto': { lat: -34.9868, lng: -58.0909 },
  'san carlos': { lat: -34.933, lng: -58.000 },
  'altos de san lorenzo': { lat: -34.954, lng: -57.931 },
  'lisandro olmos': { lat: -34.9991, lng: -58.0486 },
  'melchor romero': { lat: -34.9457, lng: -58.0365 },
  'gorina': { lat: -34.9054, lng: -58.0436 },
  'arana': { lat: -34.9996, lng: -57.8925 },
  'etcheverry': { lat: -35.0245, lng: -58.0781 },
  'segui': { lat: -34.8913, lng: -58.1319 },
  'el peligro': { lat: -34.9333, lng: -58.1667 },
  'jose hernandez': { lat: -34.8989, lng: -58.0106 },
  'parque sicardi': { lat: -34.9875, lng: -57.8598 },
  'villa garibaldi': { lat: -34.9990, lng: -57.8584 },
  'ignacio correas': { lat: -35.0489, lng: -57.8500 },
  'barrio aeropuerto': { lat: -34.968, lng: -57.893 },
};

export async function geocodeAddress(address) {
  if (!address || address.trim().length < 3) return null;
  const tryGeocode = async (q) => {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'SigoTuHuella/1.0 (whatsapp bot)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data || data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  };
  try {
    let coords = await tryGeocode(address + ', Argentina');
    if (coords) return coords;
    coords = await tryGeocode(address);
    if (coords) return coords;
    const lower = address.toLowerCase();
    for (const [keyword, center] of Object.entries(NEIGHBORHOOD_CENTERS)) {
      if (lower.includes(keyword)) return center;
    }
    return null;
  } catch {
    return null;
  }
}
