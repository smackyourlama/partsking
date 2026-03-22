import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const DEV_PORT = Number(process.env.VITE_PORT ?? '3765')
const extraAllowed = (process.env.VITE_ALLOWED_HOSTS ?? '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)
const defaultTunnelHosts = ['.lhr.life', '.loca.lt', '.trycloudflare.com']
const allowedHosts = [...defaultTunnelHosts, ...extraAllowed]
const basePath = process.env.VITE_BASE_PATH ?? './'

export default defineConfig({
  plugins: [react()],
  base: basePath,
  server: {
    port: DEV_PORT,
    host: '127.0.0.1',
    strictPort: true,
    allowedHosts,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
