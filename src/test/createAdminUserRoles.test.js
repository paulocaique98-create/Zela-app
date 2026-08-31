import { describe, it, expect } from 'vitest';
import { SUPABASE_URL, ANON_KEY, hasIntegrationCredentials } from './envForTests.js';
import { createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Regressão de um bug real encontrado em produção (ZL001, cadastro da
// "Lorena Pereira Alves de Azevedo" falhando com "Edge Function returned a
// non-2xx status code"): a correção de segurança da Fase 17 restringiu
// create-admin-user a só aceitar role IN ('admin','teacher') — mas
// AdminUserRegistration.jsx usa essa MESMA function pra cadastrar
// responsável (family) também. A trava quebrou cadastro de família em
// produção no mesmo dia da correção.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

async function callCreateAdminUser(token, body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/create-admin-user`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

runIf('create-admin-user — role deve aceitar admin/teacher/family, nunca developer', () => {
  it('cadastra role=family com sucesso (regressão do bug real em produção)', async () => {
    const school = await createTestSchool();
    const admin = await createTestUser({ role: 'admin', schoolId: school });
    let createdId = null;
    try {
      const { status, body } = await callCreateAdminUser(admin.token, {
        email: `vitest.family.${Date.now()}@zela-teste.com`,
        password: 'SenhaTeste123!',
        name: 'Família Teste Regressão',
        role: 'family',
        school_id: school,
      });
      expect(status).toBe(200);
      expect(body.role).toBe('family');
      createdId = body.id;
    } finally {
      if (createdId) await deleteTestUser(createdId);
      await deleteTestUser(admin.id);
      await deleteTestSchool(school);
    }
  }, 15000);

  it('cadastra role=teacher com sucesso', async () => {
    const school = await createTestSchool();
    const admin = await createTestUser({ role: 'admin', schoolId: school });
    let createdId = null;
    try {
      const { status, body } = await callCreateAdminUser(admin.token, {
        email: `vitest.teacher.${Date.now()}@zela-teste.com`,
        password: 'SenhaTeste123!',
        name: 'Professor Teste Regressão',
        role: 'teacher',
        school_id: school,
      });
      expect(status).toBe(200);
      expect(body.role).toBe('teacher');
      createdId = body.id;
    } finally {
      if (createdId) await deleteTestUser(createdId);
      await deleteTestUser(admin.id);
      await deleteTestSchool(school);
    }
  }, 15000);

  it('continua bloqueando role=developer (regressão do achado de segurança da Fase 17)', async () => {
    const school = await createTestSchool();
    const admin = await createTestUser({ role: 'admin', schoolId: school });
    try {
      const { status, body } = await callCreateAdminUser(admin.token, {
        email: `vitest.hacker.${Date.now()}@zela-teste.com`,
        password: 'SenhaTeste123!',
        name: 'Tentativa de escalada',
        role: 'developer',
      });
      expect(status).not.toBe(200);
      expect(body.error).toMatch(/admin.*teacher.*family/i);
    } finally {
      await deleteTestUser(admin.id);
      await deleteTestSchool(school);
    }
  }, 15000);
});
