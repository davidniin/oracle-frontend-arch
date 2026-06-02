import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  server: {
    port: 4300,
    proxy: {
      '/api': { target: 'http://localhost:3300', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3300', changeOrigin: true },
    }
  }
})
