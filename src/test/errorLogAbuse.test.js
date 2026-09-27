import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { hasIntegrationCredentials, SUPABASE_URL, ANON_KEY } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Auditoria 27/09/2026 · item 12. log_error aceitava de qualquer um (até
// sem login) severidade 'critical' -- que dispara push pros
// desenvolvedores -- e escola/usuário arbitrários (dava pra "sujar" o
// Portal do Dev de qualquer escola).
const runIf = hasIntegrationCredentials ? describe : describe.skip;
const anon = hasIntegrationCredentials ? createClient(SUPABASE_URL, ANON_KEY) : null;

const uniqueMsg = (tag) => `vitest-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function readLog(id) {
  const { data } = await adminClient.from('error_logs').select('severity, school_id, user_id, role').eq('id', id).single();
  return data;
}

runIf('log_error · sem alerta crítico falso nem escola forjada', () => {
  it('sem login: "critical" vira "error" e a escola informada é ignorada', async () => {
    const schoolId = await createTestSchool();
    try {
      const { data: id, error } = await anon.rpc('log_error', {
        p_source: 'client', p_category: 'vitest', p_message: uniqueMsg('anon'), p_severity: 'critical', p_school_id: schoolId,
      });
      expect(error).toBeNull();
      const row = await readLog(id);
      expect(row.severity).toBe('error');
      expect(row.school_id).toBeNull();
      await adminClient.from('error_logs').delete().eq('id', id);
    } finally {
      await deleteTestSchool(schoolId);
    }
  }, 20000);

  it('família: "critical" vira "error"; escola e usuário vêm da sessão, não da chamada', async () => {
    const schoolId = await createTestSchool();
    const otherSchool = await createTestSchool();
    const family = await createTestUser({ role: 'family', schoolId });
    try {
      const { data: id } = await family.client.rpc('log_error', {
        p_source: 'business', p_category: 'vitest', p_message: uniqueMsg('family'), p_severity: 'critical',
        p_school_id: otherSchool, p_user_id: '00000000-0000-0000-0000-000000000000', p_role: 'developer',
      });
      const row = await readLog(id);
      expect(row.severity).toBe('error');
      expect(row.school_id).toBe(schoolId);
      expect(row.user_id).toBe(family.id);
      expect(row.role).toBe('family');
      await adminClient.from('error_logs').delete().eq('id', id);
    } finally {
      await deleteTestUser(family.id);
      await deleteTestSchool(schoolId);
      await deleteTestSchool(otherSchool);
    }
  }, 25000);

  it('equipe da escola (admin) continua podendo registrar "critical" (falha ao gravar presença no check-in)', async () => {
    const schoolId = await createTestSchool();
    const admin = await createTestUser({ role: 'admin', schoolId });
    try {
      const { data: id } = await admin.client.rpc('log_error', {
        p_source: 'business', p_category: 'vitest', p_message: uniqueMsg('admin'), p_severity: 'critical',
      });
      const row = await readLog(id);
      expect(row.severity).toBe('critical');
      expect(row.school_id).toBe(schoolId);
      await adminClient.from('error_logs').delete().eq('id', id);
    } finally {
      await deleteTestUser(admin.id);
      await deleteTestSchool(schoolId);
    }
  }, 25000);
});
