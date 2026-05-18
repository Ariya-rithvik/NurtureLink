import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Bind on all interfaces so both IPv4 (127.0.0.1) and IPv6 ([::1])
    // resolve. WebGazer's HTTPS check still passes because the user
    // accesses via the literal hostname `localhost`.
    host: true,
    port: 5173,
    strictPort: true,
  },
})
