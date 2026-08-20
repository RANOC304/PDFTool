import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
  assetsInclude: ['**/*.wasm'],
  server: {
    // Respect an assigned port (e.g. from the preview harness); fall back to Vite's default
    port: Number(process.env.PORT) || 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    port: Number(process.env.PORT) || 4173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    outDir: 'dist',
    // Keep production assets away from the old /assets namespace. A previous
    // catch-all Vercel rewrite could cache index.html at missing asset URLs.
    assetsDir: 'static',
    rollupOptions: {
      output: {
        // Split the heavy PDF libraries into their own long-cacheable chunks
        manualChunks: {
          react: ['react', 'react-dom'],
          pdfjs: ['pdfjs-dist'],
          pdflib: ['pdf-lib', 'fflate'],
        },
      },
    },
  },
})
