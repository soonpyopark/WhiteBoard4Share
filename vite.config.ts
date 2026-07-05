import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { ALLOWED_HOSTS, HOSTNAME, PORT } from './config/ports.ts'
import { apiPlugin } from './vite-plugin-api.ts'

export default defineConfig({
  base: './',
  plugins: [react(), apiPlugin()],
  optimizeDeps: {
    include: ['yjs', 'y-websocket', 'xlsx-js-style'],
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        embed: path.resolve(__dirname, 'embed.html'),
      },
    },
  },
  server: {
    host: HOSTNAME,
    port: PORT,
    strictPort: true,
    allowedHosts: ALLOWED_HOSTS,
    watch: {
      ignored: ['**/exe/**', '**/electron-dist/**'],
    },
  },
})
