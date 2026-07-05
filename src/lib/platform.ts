declare global {
  interface Window {
    Capacitor?: { isNative: boolean; platform: string };
  }
}

export const isNative = (): boolean => !!window.Capacitor?.isNative;
export const isAndroid = (): boolean => isNative() && window.Capacitor?.platform === 'android';
export const isIOS = (): boolean => isNative() && window.Capacitor?.platform === 'ios';
export const isWeb = (): boolean => !isNative();
