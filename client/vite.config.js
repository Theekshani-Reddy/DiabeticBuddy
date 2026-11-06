import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => {
  const rootDir = fileURLToPath(new URL('../', import.meta.url));
  const env = loadEnv(mode, rootDir, '');

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': `http://localhost:${env.PORT || 3001}`,
      },
    },
  };
});
