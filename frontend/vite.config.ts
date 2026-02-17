import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// PHASE 3 — CONNEXION FRONT ↔ BACK
// Le proxy Vite évite les problèmes CORS en développement :
// Le navigateur croit parler à localhost:3000 (même origine),
// mais Vite reroutte silencieusement vers localhost:8080 (Rust).
// En production, ce serait un reverse proxy Nginx ou Caddy.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      // Toute requête vers /api/** est redirigée vers le backend Rust
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        // rewrite: (path) => path  ← on garde le préfixe /api (pas de rewrite)
      },
    },
  },
})
