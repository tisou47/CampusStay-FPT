import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      // In development the app calls /api on the Vite server, which forwards to the backend.
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://localhost:8080',
          changeOrigin: true,
        },
      },
    },
    build: {
      rolldownOptions: {
        output: {
          // One chunk for libraries and one per role, so no single file passes the 500 kB warning.
          codeSplitting: {
            groups: [
              { name: 'vendor', test: /node_modules/ },
              { name: 'student', test: /src[\\/]pages[\\/]student/ },
              { name: 'staff', test: /src[\\/]pages[\\/]staff/ },
              { name: 'manager', test: /src[\\/]pages[\\/]manager/ },
              { name: 'admin', test: /src[\\/]pages[\\/]admin/ },
            ],
          },
        },
      },
    },
  }
})
