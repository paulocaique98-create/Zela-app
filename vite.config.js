import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import compression from 'vite-plugin-compression'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    compression({
      algorithm: 'gzip',
      ext: '.gz',
    })
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    // P2.4: com o crescimento da suíte de integração, rodar todo arquivo
    // de teste em paralelo passou a estourar rate limit real da Auth
    // Admin API do Supabase (createTestUser chama
    // auth.admin.createUser/signInWithPassword em cada teste) --
    // flakiness já documentada, mas que virou recorrente o suficiente
    // pra doer de verdade (3 suítes falhando na mesma rodada). Roda os
    // arquivos em sequência: mais lento, mas sem corrida real contra o
    // rate limit do Supabase.
    fileParallelism: false,
  },
})
