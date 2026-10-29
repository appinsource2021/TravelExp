import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 8055 docker nginx'te; dev sunucu ayrı portta çalışır
    port: 5173,
    host: '0.0.0.0',
    // reisekosten.appinsource.eu konteynerdeki nginx üzerinden proxy'leniyor;
    // Vite yabancı Host başlıklarını varsayılan olarak 403 ile reddediyor.
    allowedHosts: ['reisekosten.appinsource.eu'],
    // Prod'da nginx'in yaptığı yönlendirmenin aynısı: API ve WebSocket docker'daki node'a
    proxy: {
      '/api': 'http://localhost:3007',
      '/socket': { target: 'ws://localhost:3007', ws: true },
    },
  },
})
