import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
  ],
  server: {
    // Listen on all interfaces so Docker container is accessible
    host: '0.0.0.0',
    port: 5173,
    // Proxy API requests when running outside Docker
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
    watch: {
      // Bind-mounted source under a cloud-synced folder (e.g. OneDrive) or
      // some Docker Desktop backends don't reliably forward native file
      // change events into the container — edits silently stop hot-reloading.
      // Polling is slower but always works.
      usePolling: true,
    },
  },
})
