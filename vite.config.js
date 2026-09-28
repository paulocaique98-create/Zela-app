import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import compression from 'vite-plugin-compression'

// Identificador desta publicação: o app aberto compara com /version.json
// e avisa quando existe versão nova (src/hooks/useAppUpdate.js).
const BUILD_ID = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 12) || Date.now().toString(36)

function versionFilePlugin() {
  return {
    name: 'zela-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_BUILD__: JSON.stringify(BUILD_ID),
  },
  plugins: [
    react(),
    tailwindcss(),
    versionFilePlugin(),
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
    // "Worker exited unexpectedly" (Windows, 28/09/2026): o processo filho
    // de um arquivo às vezes morre sem aviso, em arquivos diferentes a cada
    // rodada. Testado pool 'threads': pior, a queda derruba a suíte inteira
    // (saída 127 sem resultado). Mantido 'forks' (padrão), que isola a queda
    // num arquivo só: se aparecer, rodar a suíte de novo antes de concluir.
  },
})
