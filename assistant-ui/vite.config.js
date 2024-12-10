import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  root: './demo',
  css: {
    postcss: './demo/postcss.config.js',
  },
  resolve: {
    preserveSymlinks: true,
  },
  server: {
    port: 3000
  }
})
