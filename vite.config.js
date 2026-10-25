import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
  optimizeDeps: {
    exclude: ['pdfjs-dist', 'tesseract.js'],
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
});
