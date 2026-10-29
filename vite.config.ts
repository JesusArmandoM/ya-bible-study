import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = Number(process.env.API_PORT ?? 3001);
const devPort = Number(process.env.VITE_PORT ?? 5173);

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: devPort,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `ws://127.0.0.1:${apiPort}`,
        ws: true,
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: true,
    allowedHosts: true,
  },
});
