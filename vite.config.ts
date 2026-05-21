import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json,webmanifest}'],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
      },
      manifest: {
        name: 'Sigo tu huella - Sicardi/Garibaldi',
        short_name: 'SigoTuHuella',
        description: 'Comunidad de rescate y reporte de mascotas en Sicardi y Garibaldi',
        theme_color: '#fdfcf7',
        background_color: '#fdfcf7',
        display: 'standalone',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
        share_target: {
          action: '/reportar-rapido',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            files: [{ name: 'image', accept: ['image/*'] }],
          },
        },
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
