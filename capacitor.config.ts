import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sihuella.app',
  appName: 'Sigo tu Huella',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    url: process.env.VITE_CAPACITOR_SERVER_URL || '',
    cleartext: true,
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
    LiveUpdate: {
      appId: 'com.sihuella.app',
    },
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#fdfcf7',
  },
};

export default config;
