import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://34.56.64.103:3001',
        changeOrigin: true,
      },
      '/sim': {
        target: 'http://34.56.64.103:3001',
        changeOrigin: true,
      },
    },
  },
  define: {
    global: 'globalThis',
  },
});
