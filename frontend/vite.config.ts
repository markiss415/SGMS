import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  // During development every /api request is forwarded to the backend (default http://localhost:4000).
  const backend = env.BACKEND_URL || 'http://localhost:4000';
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      host: '127.0.0.1',
      proxy: {
        '/api': { target: backend, changeOrigin: true }
      }
    },
    preview: {
      port: 5173,
      host: '127.0.0.1',
      proxy: {
        '/api': { target: backend, changeOrigin: true }
      }
    }
  };
});
