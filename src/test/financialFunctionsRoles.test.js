import { describe, it, expect } from 'vitest';
import { SUPABASE_URL, ANON_KEY, hasIntegrationCredentials } from './envForTests.js';
import { createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Regressão de bug real (27/09/2026): o Financeiro virou exclusivo da
// Gestão na Fase 5 (RLS), mas as Edge Functions que a tela Financeiro usa
// continuavam aceitando só 'admin' -- a Gestão recebia "apenas
// administradores podem criar cobranças" e o admin (que nem tem mais a
// tela) ainda conseguia criar pelo servidor. Nenhum teste cobria isso.
//
// Corpo vazio de propósito: a Gestão deve passar da checagem de permissão e
// parar na validação dos dados, sem criar nada.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

const FINANCIAL_FUNCTIONS = [
  'create-avulsa-charge',
  'create-financial-contract',
  'create-financial-contracts-batch',
  'adjust-charge',
  'readjust-contracts',
  'create-payment',
  'set-school-gateway-key',
  'process-payment-webhook',
];

async function callFn(name, token) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, message: body.error || '' };
}

runIf('Funções financeiras · exclusivas da Gestão', () => {
  it.each(FINANCIAL_FUNCTIONS)('%s: admin recebe acesso negado; Gestão passa da checagem de permissão', async (name) => {
    const schoolId = await createTestSchool();
    const admin = await createTestUser({ role: 'admin', schoolId });
    const gestao = await createTestUser({ role: 'gestao', schoolId });
    try {
      const asAdmin = await callFn(name, admin.token);
      expect(asAdmin.status).not.toBe(200);
      expect(asAdmin.message).toMatch(/Acesso negado/);

      const asGestao = await callFn(name, gestao.token);
      expect(asGestao.message).not.toMatch(/Acesso negado|Permiss/);
    } finally {
      await deleteTestUser(admin.id);
      await deleteTestUser(gestao.id);
      await deleteTestSchool(schoolId);
    }
  }, 30000);
});
