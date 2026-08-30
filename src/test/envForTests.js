import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Carrega o .env local (sem depender de nenhuma lib extra) só pros testes de
// integração — não é usado em nenhum código de produção, só aqui. Testes
// de integração precisam de URL/chaves reais do projeto Supabase pra
// exercitar RLS/Edge Functions de verdade (mesmo espírito da Fase 17: só
// leitura de código nunca prova que uma policy bloqueia de verdade).
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '..', '.env');

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
      const value = trimmed.slice(eq + 1).trim();
      vars[key] = value;
    }
  } catch {
    // .env ausente (ex: ambiente de CI sem segredos) — testes de integração
    // que dependem disso devem pular graciosamente, não quebrar a suíte.
  }
  return vars;
}

export const testEnv = loadEnv();

export const SUPABASE_URL = testEnv.VITE_SUPABASE_URL;
export const ANON_KEY = testEnv.VITE_SUPABASE_ANON_KEY;
export const SERVICE_ROLE_KEY = testEnv.SERVICE_ROLE_KEY;

export const hasIntegrationCredentials = !!(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY);
