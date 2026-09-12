import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueJsx(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  // Base path under a reverse proxy. Defaults to local testing (served at root).
  // To deploy under a different domain/path, set VITE_BASE_PATH — either as a
  // build arg in Dockerfile/docker-compose.yaml, or in a .env.local (see .env.example).
  base: process.env.VITE_BASE_PATH || '/',

})
