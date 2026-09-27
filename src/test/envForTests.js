import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Testes de integração rodam SÓ contra o Supabase local (Docker), nunca
// contra a produção (auditoria de 27/09/2026, item 8). Antes, este arquivo
// lia o .env de produção -- com a service_role real -- e os testes criavam
// e apagavam escolas/usuários no mesmo banco das escolas de verdade.
//
// Como rodar:
//   1. export PATH="/c/Users/User/AppData/Local/Programs/DockerDesktop/resources/bin:$PATH"
//   2. npx supabase start          (sobe o Supabase local a partir da linha de base)
//   3. npx vitest run
// O arquivo .env.test.local (fora do git, regra *.local) guarda a URL e as
// chaves do Supabase LOCAL -- padrões públicos do ambiente de
// desenvolvimento, que não dão acesso à produção. Para recriar:
//   npx supabase status -o env  (API_URL, ANON_KEY, SERVICE_ROLE_KEY ->
//   TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, TEST_SUPABASE_SERVICE_ROLE_KEY)
//
// Sem o arquivo (ex: CI), os testes de integração pulam sozinhos e só os
// unitários rodam.
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '..', '.env.test.local');

function loadEnv() {
  const vars = {};
  try {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^"(.*)"$/, '$1');
      vars[key] = value;
    }
  } catch {
    console.warn('[envForTests] .env.test.local não encontrado: testes de integração vão PULAR. Suba o Supabase local (npx supabase start) e crie o arquivo.');
  }
  return vars;
}

export const testEnv = loadEnv();

const url = testEnv.TEST_SUPABASE_URL;
const isLocal = !!url && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url);
if (url && !isLocal) {
  throw new Error(`[envForTests] TEST_SUPABASE_URL aponta pra fora da máquina (${url}). Testes de integração só rodam contra o Supabase local.`);
}

export const SUPABASE_URL = url;
export const ANON_KEY = testEnv.TEST_SUPABASE_ANON_KEY;
export const SERVICE_ROLE_KEY = testEnv.TEST_SUPABASE_SERVICE_ROLE_KEY;

export const hasIntegrationCredentials = !!(isLocal && ANON_KEY && SERVICE_ROLE_KEY);
