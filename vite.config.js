import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Respect an assigned port (e.g. from the preview harness); fall back to Vite's default
    port: Number(process.env.PORT) || 5173,
  },
  preview: {
    port: Number(process.env.PORT) || 4173,
  },
  build: {
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
