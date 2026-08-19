import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isNative } from '@/src/lib/platform';

// Convierte la URL de destino (relativa o absoluta) a un path navegable
// con react-router dentro de la app nativa (base https://localhost).
function toAppPath(url: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, 'https://localhost');
    const path = parsed.pathname + parsed.search + parsed.hash;
    return path === '/' ? null : path;
  } catch {
    return url.startsWith('/') ? url : null;
  }
}

export default function PushClickHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isNative()) return;
    let cancelled = false;

    (async () => {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');

        const handler = PushNotifications.addListener(
          'pushNotificationActionPerformed',
          (res) => {
            if (cancelled) return;
            const data = res.notification?.data as Record<string, string> | undefined;
            const url = data?.url || data?.link;
            const path = toAppPath(url || '');
            if (path) navigate(path);
          }
        );

        const cold = await PushNotifications.getDeliveredNotifications?.();
        if (cold?.notifications && !cancelled) {
          for (const n of cold.notifications) {
            const data = n.data as Record<string, string> | undefined;
            const url = data?.url || data?.link;
            const path = toAppPath(url || '');
            if (path) { navigate(path); break; }
          }
        }
      } catch (e) {
        console.error('Push click handler error:', e);
      }
    })();

    return () => { cancelled = true; };
  }, [navigate]);

  return null;
}
