declare global {
  interface Window {
    Capacitor?: {
      isNative?: boolean;
      platform?: string;
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
    };
  }
}

export const isNative = (): boolean => {
  if (!window.Capacitor) return false;
  if (typeof window.Capacitor.isNativePlatform === 'function') {
    return window.Capacitor.isNativePlatform();
  }
  return !!window.Capacitor.isNative;
};

const platform = (): string | undefined => {
  if (!window.Capacitor) return undefined;
  if (typeof window.Capacitor.getPlatform === 'function') {
    return window.Capacitor.getPlatform();
  }
  return window.Capacitor.platform;
};

export const isAndroid = (): boolean => isNative() && platform() === 'android';
export const isIOS = (): boolean => isNative() && platform() === 'ios';
export const isWeb = (): boolean => !isNative();
