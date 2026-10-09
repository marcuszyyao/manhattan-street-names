import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: './',
  plugins: [vue()],
  optimizeDeps: {
    // MapLibre's module worker must remain a real file in development.
    exclude: ['maplibre-gl'],
  },
  build: {
    sourcemap: false,
  },
})
