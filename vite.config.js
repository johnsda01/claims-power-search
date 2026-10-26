import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    host: '127.0.0.1',
    // Reject cross-origin and non-local Host headers so a page on another site
    // cannot read dev-server responses or reach the project through DNS rebinding.
    cors: false,
    strictPort: true,
    fs: {
      strict: true,
      allow: ['.'],
      deny: ['.env', '.env.*', '*.{crt,pem,key}', '.git/**'],
    },
  },
  preview: {
    host: '127.0.0.1',
    cors: false,
  },
  optimizeDeps: {
    exclude: ['pdfjs-dist', 'tesseract.js'],
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
});
