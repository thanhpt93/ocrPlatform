import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const backendPort = process.env.BACKEND_PORT || '8001';
const frontendPort = parseInt(process.env.PORT || '3000', 10);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: frontendPort,
    open: false,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${backendPort}`,
        changeOrigin: true,
      },
    },
  },
});
