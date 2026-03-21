import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const DEV_PORT = Number(process.env.VITE_PORT ?? '3765')

export default defineConfig({
  plugins: [react()],
  server: {
    port: DEV_PORT,
    host: '127.0.0.1',
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
