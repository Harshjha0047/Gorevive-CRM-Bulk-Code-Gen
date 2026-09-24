import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // JS/CSS minification is already on by default in production builds —
    // left as the default (fastest available minifier for this Vite
    // version) rather than pinned, to avoid depending on a specific
    // minifier package being installed separately.
    // Split large, rarely-changing vendor libraries into their own chunks
    // so browsers can cache them separately from app code that changes
    // often — a deploy that only touches app logic won't invalidate the
    // React/xlsx/etc. vendor chunk cache for returning users.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react') || id.includes('react-dom')) return 'vendor-react';
          if (id.includes('xlsx')) return 'vendor-xlsx';
          if (id.includes('axios') || id.includes('zustand') || id.includes('zod')) return 'vendor-utils';
          return 'vendor';
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://gorevive.jbbs.in',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Referer', 'http://gorevive.jbbs.in/');
          });
        },
      },
    },
  },
});