export async function geocodeAddress(address) {
  if (!address || address.trim().length < 3) return null;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=ar`;
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'SigoTuHuella/1.0 (whatsapp bot)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data || data.length === 0) return null;
    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
    };
  } catch {
    return null;
  }
}
