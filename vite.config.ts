import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Dev-сервер проксирует /api на бэкенд Очага:
 *   /api/v1/chat        -> http://127.0.0.1:8000/v1/chat
 *   /api/v1/ws/voice    -> ws://127.0.0.1:8000/v1/ws/voice (upgrade, ws: true)
 * Браузер всегда ходит на тот же origin, поэтому нет CORS и mixed content.
 * Адрес бэкенда: OCHAG_BACKEND_URL (по умолчанию http://127.0.0.1:8000).
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backend = env.OCHAG_BACKEND_URL || 'http://127.0.0.1:8000';

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      // Live preview работает на https://<port>-<sandbox>.e2b.app
      allowedHosts: true,
      proxy: {
        '/api': {
          target: backend,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
          ws: true,
        },
      },
    },
    preview: {
      host: '0.0.0.0',
      allowedHosts: true,
      proxy: {
        '/api': {
          target: backend,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
          ws: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
  };
});
