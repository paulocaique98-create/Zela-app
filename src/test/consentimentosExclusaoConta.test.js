import { describe, it, expect } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Consentimentos com data carimbada pelo servidor e pedido de exclusão de
// conta (LGPD; exigência da Apple para o app). Regressão do bug real de
// 28/09/2026: a resposta de "uso de imagem" não era salva (coluna ausente).
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Consentimentos da família', () => {
  it('uso de imagem e aceite da LGPD são salvos, com data do servidor', async () => {
    const schoolId = await createTestSchool();
    const family = await createTestUser({ role: 'family', schoolId });
    try {
      const { error: imgErr } = await family.client.from('users').update({ image_usage_accepted: false }).eq('id', family.id);
      expect(imgErr).toBeNull();
      const { error: lgpdErr } = await family.client.from('users').update({ lgpd_accepted: true }).eq('id', family.id);
      expect(lgpdErr).toBeNull();

      const { data } = await adminClient.from('users').select('image_usage_accepted, image_usage_answered_at, lgpd_accepted, lgpd_accepted_at').eq('id', family.id).single();
      expect(data.image_usage_accepted).toBe(false);
      expect(data.image_usage_answered_at).not.toBeNull();
      expect(data.lgpd_accepted).toBe(true);
      expect(data.lgpd_accepted_at).not.toBeNull();

      // A data não pode ser forjada pelo aparelho.
      await family.client.from('users').update({ lgpd_accepted_at: '2000-01-01T00:00:00Z' }).eq('id', family.id);
      const { data: after } = await adminClient.from('users').select('lgpd_accepted_at').eq('id', family.id).single();
      expect(after.lgpd_accepted_at).toBe(data.lgpd_accepted_at);
    } finally {
      await deleteTestUser(family.id);
      await deleteTestSchool(schoolId);
    }
  }, 30000);
});

runIf('Pedido de exclusão de conta', () => {
  it('a própria pessoa pede e cancela; não duplica; ninguém de fora vê; Gestão da escola responde', async () => {
    const schoolA = await createTestSchool();
    const schoolB = await createTestSchool();
    const family = await createTestUser({ role: 'family', schoolId: schoolA });
    const otherFamily = await createTestUser({ role: 'family', schoolId: schoolA });
    const gestao = await createTestUser({ role: 'gestao', schoolId: schoolA });
    const gestaoB = await createTestUser({ role: 'gestao', schoolId: schoolB });
    const admin = await createTestUser({ role: 'admin', schoolId: schoolA });
    try {
      const { data: reqId, error } = await family.client.rpc('request_account_deletion', { p_reason: 'Mudei de escola' });
      expect(error).toBeNull();

      const { error: dup } = await family.client.rpc('request_account_deletion', { p_reason: 'de novo' });
      expect(dup?.message).toMatch(/já tem um pedido/);

      const { error: direct } = await otherFamily.client.from('account_deletion_requests').insert({ school_id: schoolA, user_id: family.id, user_name: 'Forjado', user_role: 'family' });
      expect(direct).not.toBeNull();

      const { data: own } = await family.client.from('account_deletion_requests').select('id, user_role, reason');
      expect(own).toEqual([{ id: reqId, user_role: 'family', reason: 'Mudei de escola' }]);
      for (const outsider of [otherFamily, gestaoB, admin]) {
        const { data } = await outsider.client.from('account_deletion_requests').select('id').eq('id', reqId);
        expect(data).toEqual([]);
      }

      const { data: seen } = await gestao.client.from('account_deletion_requests').select('id').eq('id', reqId);
      expect(seen).toHaveLength(1);

      const { error: cancelErr } = await family.client.rpc('cancel_account_deletion_request');
      expect(cancelErr).toBeNull();
      const { data: canceled } = await adminClient.from('account_deletion_requests').select('status').eq('id', reqId).single();
      expect(canceled.status).toBe('cancelada');

      const { data: req2 } = await family.client.rpc('request_account_deletion', { p_reason: null });
      const { error: refuseErr } = await gestao.client.from('account_deletion_requests').update({ status: 'recusada', response: 'Cobrança em aberto', handled_by: gestao.id, handled_at: new Date().toISOString() }).eq('id', req2);
      expect(refuseErr).toBeNull();
      const { data: refused } = await family.client.from('account_deletion_requests').select('status, response').eq('id', req2).single();
      expect(refused).toEqual({ status: 'recusada', response: 'Cobrança em aberto' });

      const { error: selfUpdate } = await family.client.from('account_deletion_requests').update({ status: 'concluida' }).eq('id', req2);
      const { data: still } = await adminClient.from('account_deletion_requests').select('status').eq('id', req2).single();
      expect(selfUpdate === null ? still.status : 'recusada').toBe('recusada');
    } finally {
      await adminClient.from('account_deletion_requests').delete().in('school_id', [schoolA, schoolB]);
      await adminClient.from('audit_logs').delete().eq('school_id', schoolA);
      for (const u of [family, otherFamily, gestao, gestaoB, admin]) await deleteTestUser(u.id);
      await deleteTestSchool(schoolA);
      await deleteTestSchool(schoolB);
    }
  }, 45000);

  it('conta da Gestão não pede exclusão por aqui; excluir a conta mantém o registro do pedido', async () => {
    const schoolId = await createTestSchool();
    const gestao = await createTestUser({ role: 'gestao', schoolId });
    const family = await createTestUser({ role: 'family', schoolId });
    try {
      const { error: gErr } = await gestao.client.rpc('request_account_deletion', { p_reason: null });
      expect(gErr?.message).toMatch(/suporte/);

      const { data: reqId } = await family.client.rpc('request_account_deletion', { p_reason: null });
      await deleteTestUser(family.id);
      const { data: kept } = await adminClient.from('account_deletion_requests').select('user_id, user_name').eq('id', reqId).single();
      expect(kept.user_id).toBeNull();
      expect(kept.user_name).toMatch(/Vitest/);
    } finally {
      await adminClient.from('account_deletion_requests').delete().eq('school_id', schoolId);
      await adminClient.from('audit_logs').delete().eq('school_id', schoolId);
      await deleteTestUser(gestao.id);
      await deleteTestUser(family.id);
      await deleteTestSchool(schoolId);
    }
  }, 30000);
});

runIf('Pendências da Gestão', () => {
  it('as consultas da tela de Pendências rodam sem erro para a Gestão', async () => {
    const schoolId = await createTestSchool();
    const gestao = await createTestUser({ role: 'gestao', schoolId });
    try {
      // Mesmas colunas de useGestaoPendencias.js: pega coluna inexistente
      // (bug real de 28/09/2026: users.created_at).
      const results = await Promise.all([
        gestao.client.from('users').select('id, name, role').eq('school_id', schoolId).eq('status', 'pending'),
        gestao.client.from('matricula_solicitacoes').select('id, tipo, criancas, submitted_at').eq('school_id', schoolId),
        gestao.client.from('attendance_corrections').select('id, requested_at, students:student_id(name)').eq('school_id', schoolId),
        gestao.client.from('account_deletion_requests').select('id, user_name, user_role, requested_at').eq('school_id', schoolId),
      ]);
      for (const r of results) expect(r.error).toBeNull();
    } finally {
      await deleteTestUser(gestao.id);
      await deleteTestSchool(schoolId);
    }
  }, 30000);
});
