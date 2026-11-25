import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const apiPort = Number(process.env.PORT ?? 3000);

// Dev: Vite serves the UI on :5173 and proxies the game socket to the Node server on :3000 (or $PORT).
// Prod: `npm run build` emits dist/client, which the Node server serves itself.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/ws': { target: `ws://localhost:${apiPort}`, ws: true },
      '/api': { target: `http://localhost:${apiPort}` },
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    sourcemap: false,
  },
});
