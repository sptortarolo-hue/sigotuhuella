import { isNative } from '@/src/lib/platform';

const API_BASE = '/api/push';

function getApiBase(): string {
  if (isNative()) {
    return `${import.meta.env.VITE_API_URL || 'https://sigotuhuella.online'}/api/push`;
  }
  return API_BASE;
}

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getVapidKey(): Promise<string> {
  const res = await fetch(`${getApiBase()}/vapid-key`);
  const data = await res.json();
  return data.publicKey;
}

export async function subscribe(): Promise<boolean> {
  if (isNative()) {
    return subscribeNative();
  }
  return subscribeWeb();
}

async function subscribeWeb(): Promise<boolean> {
  try {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return false;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const registration = await navigator.serviceWorker.ready;
    const vapidKey = await getVapidKey();

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKey,
    });

    const res = await fetch(`${getApiBase()}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: subscription.toJSON().keys,
      }),
    });

    return res.ok;
  } catch (err) {
    console.error('Push subscribe error:', err);
    return false;
  }
}

async function subscribeNative(): Promise<boolean> {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') return false;

    await PushNotifications.register();

    return new Promise((resolve) => {
      PushNotifications.addListener('registration', async (token) => {
        try {
          const res = await fetch(`${getApiBase()}/register-device`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: JSON.stringify({
              fcm_token: token.value,
              platform: 'android',
            }),
          });
          resolve(res.ok);
        } catch {
          resolve(false);
        }
      });

      PushNotifications.addListener('registrationError', () => {
        resolve(false);
      });

      setTimeout(() => resolve(false), 10000);
    });
  } catch (err) {
    console.error('Native push subscribe error:', err);
    return false;
  }
}

export async function unsubscribe(): Promise<boolean> {
  if (isNative()) {
    return unsubscribeNative();
  }
  return unsubscribeWeb();
}

async function unsubscribeWeb(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return true;

    await fetch(`${getApiBase()}/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });

    await subscription.unsubscribe();
    return true;
  } catch (err) {
    console.error('Push unsubscribe error:', err);
    return false;
  }
}

async function unsubscribeNative(): Promise<boolean> {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await PushNotifications.unregister();
    return true;
  } catch (err) {
    console.error('Native push unsubscribe error:', err);
    return false;
  }
}

export async function isSubscribed(): Promise<boolean> {
  if (isNative()) return isSubscribedNative();
  try {
    if (!('serviceWorker' in navigator)) return false;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return !!subscription;
  } catch {
    return false;
  }
}

async function isSubscribedNative(): Promise<boolean> {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const perm = await PushNotifications.checkPermissions();
    return perm.receive === 'granted';
  } catch {
    return false;
  }
}

export async function isSupported(): Promise<boolean> {
  if (isNative()) return true;
  return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}
