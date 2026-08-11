import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sihuella.app',
  appName: 'Sigo tu Huella',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    ...(process.env.VITE_CAPACITOR_SERVER_URL ? { url: process.env.VITE_CAPACITOR_SERVER_URL } : {}),
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#fdfcf7',
      androidScaleType: 'CENTER_CROP',
      showSpinner: true,
      spinnerColor: '#7c6f5b',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#fdfcf7',
  },
};

export default config;
