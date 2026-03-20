import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://rocket-bot-production.up.railway.app',
        changeOrigin: true,
        ws: true,
      },
      '/ws': {
        target: 'wss://rocket-bot-production.up.railway.app',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
