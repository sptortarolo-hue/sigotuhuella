import { isNative } from '@/src/lib/platform';

interface GeoCoords {
  latitude: number;
  longitude: number;
}

interface GeoPosition {
  coords: GeoCoords;
}

export async function getCurrentPosition(
  options?: { enableHighAccuracy?: boolean; timeout?: number }
): Promise<GeoPosition> {
  if (isNative()) {
    return getCurrentPositionNative(options);
  }
  return getCurrentPositionWeb(options);
}

function getCurrentPositionWeb(
  options?: { enableHighAccuracy?: boolean; timeout?: number }
): Promise<GeoPosition> {
  return new Promise((resolve, reject) => {
    if (!('navigator' in globalThis) || !navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ coords: { latitude: pos.coords.latitude, longitude: pos.coords.longitude } }),
      (err) => reject(err),
      {
        enableHighAccuracy: options?.enableHighAccuracy ?? true,
        timeout: options?.timeout ?? 15000,
      }
    );
  });
}

async function getCurrentPositionNative(
  options?: { enableHighAccuracy?: boolean; timeout?: number }
): Promise<GeoPosition> {
  const { Geolocation } = await import('@capacitor/geolocation');

  const permission = await Geolocation.requestPermissions();
  if (permission.location !== 'granted') {
    throw new Error('Permission denied');
  }

  const position = await Geolocation.getCurrentPosition({
    enableHighAccuracy: options?.enableHighAccuracy ?? true,
    timeout: options?.timeout ?? 15000,
  });

  return {
    coords: {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    },
  };
}
