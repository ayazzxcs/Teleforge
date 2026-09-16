import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { telegramMiddleware } from './server/telegramMiddleware.js';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'telegram-mtproto-api',
      configureServer(server) {
        server.middlewares.use(telegramMiddleware());
      },
      configurePreviewServer(server) {
        server.middlewares.use(telegramMiddleware());
      },
    },
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    watch: {
      ignored: [
        '**/app/**',
        '**/.gradle/**',
        '**/dist/**',
        '**/.git/**',
        '**/.cache/**',
        '**/*.apk',
        '**/*.jks',
        '**/*.keystore',
      ],
    },
  },
});
