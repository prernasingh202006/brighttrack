import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      port: 5173,
      // Same-origin in dev, so cookies just work. Override with DEV_API_TARGET if the API is elsewhere.
      proxy: { '/api': { target: env.DEV_API_TARGET || 'http://localhost:5000', changeOrigin: true } },
    },
    test: { environment: 'node' },
  };
});
