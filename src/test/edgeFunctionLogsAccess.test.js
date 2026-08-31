import { describe, it, expect } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// P1.5 (Prompt Mestre de Evolução) — edge_function_logs é dado
// operacional interno (mesmo padrão de cron_job_logs/payment_webhook_events):
// só developer lê, ninguém client-side grava direto (só via RPC
// log_edge_function_error, e mesmo essa só service_role/postgres).
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('edge_function_logs — acesso restrito a developer', () => {
  it('admin não lê edge_function_logs', async () => {
    const school = await createTestSchool();
    const admin = await createTestUser({ role: 'admin', schoolId: school });
    try {
      const { data } = await admin.client.from('edge_function_logs').select('id').limit(1);
      expect(data).toEqual([]);
    } finally {
      await deleteTestUser(admin.id);
      await deleteTestSchool(school);
    }
  });

  it('admin não consegue chamar log_edge_function_error diretamente (só service_role, via Edge Function)', async () => {
    const school = await createTestSchool();
    const admin = await createTestUser({ role: 'admin', schoolId: school });
    try {
      const { error } = await admin.client.rpc('log_edge_function_error', {
        p_function_name: 'forjado', p_level: 'error', p_message: 'tentativa de poluir o log', p_context: {}, p_school_id: null,
      });
      expect(error).not.toBeNull();
    } finally {
      await deleteTestUser(admin.id);
      await deleteTestSchool(school);
    }
  });
});
