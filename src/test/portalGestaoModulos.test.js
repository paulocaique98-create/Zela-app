import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { SUPABASE_URL, ANON_KEY, hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Módulos novos do Portal da Gestão (PLANO_PORTAL_GESTAO.md): permissões
// configuráveis, despesas/fornecedores, baixa manual, ano letivo, contratos
// com assinatura eletrônica, exigir troca de senha e leitura acadêmica.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

async function createStudent(schoolId, extra = {}) {
  const { data, error } = await adminClient.from('students').insert({ school_id: schoolId, name: 'Vitest Aluno Gestão', turma: 'Nido', ...extra }).select('id').single();
  if (error) throw error;
  return data.id;
}

async function callFn(name, token, body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json, message: json.error || '' };
}

runIf('Portal da Gestão · permissões configuráveis', () => {
  it('Gestão sempre pode; admin segue o padrão do catálogo até a Gestão liberar; admin não altera permissões', async () => {
    const schoolId = await createTestSchool();
    const gestao = await createTestUser({ role: 'gestao', schoolId });
    const admin = await createTestUser({ role: 'admin', schoolId });
    try {
      const { data: gDesp } = await gestao.client.rpc('has_permission', { p_permission: 'despesas.gerenciar' });
      expect(gDesp).toBe(true);
      const { data: aDesp } = await admin.client.rpc('has_permission', { p_permission: 'despesas.gerenciar' });
      expect(aDesp).toBe(false);
      const { data: aContratos } = await admin.client.rpc('has_permission', { p_permission: 'contratos.ver' });
      expect(aContratos).toBe(true);

      const { error: selfGrant } = await admin.client.from('school_role_permissions').upsert({ school_id: schoolId, role: 'admin', permission: 'despesas.gerenciar', granted: true });
      expect(selfGrant).not.toBeNull();

      const { error: grant } = await gestao.client.from('school_role_permissions').upsert({ school_id: schoolId, role: 'admin', permission: 'despesas.gerenciar', granted: true });
      expect(grant).toBeNull();
      const { data: aDesp2 } = await admin.client.rpc('has_permission', { p_permission: 'despesas.gerenciar' });
      expect(aDesp2).toBe(true);

      const { error: revoke } = await gestao.client.from('school_role_permissions').upsert({ school_id: schoolId, role: 'admin', permission: 'contratos.ver', granted: false });
      expect(revoke).toBeNull();
      const { data: aContratos2 } = await admin.client.rpc('has_permission', { p_permission: 'contratos.ver' });
      expect(aContratos2).toBe(false);
    } finally {
      await adminClient.from('school_role_permissions').delete().eq('school_id', schoolId);
      await deleteTestUser(gestao.id);
      await deleteTestUser(admin.id);
      await deleteTestSchool(schoolId);
    }
  }, 30000);
});

runIf('Portal da Gestão · despesas e fornecedores', () => {
  it('Gestão cadastra fornecedor e despesa; admin sem permissão não vê; outra escola não vê; pago exige data', async () => {
    const schoolA = await createTestSchool();
    const schoolB = await createTestSchool();
    const gestao = await createTestUser({ role: 'gestao', schoolId: schoolA });
    const admin = await createTestUser({ role: 'admin', schoolId: schoolA });
    const gestaoB = await createTestUser({ role: 'gestao', schoolId: schoolB });
    try {
      const { data: sup, error: supErr } = await gestao.client.from('suppliers').insert({ school_id: schoolA, name: 'Padaria Vitest' }).select('id').single();
      expect(supErr).toBeNull();
      const { data: exp, error: expErr } = await gestao.client.from('expenses').insert({
        school_id: schoolA, supplier_id: sup.id, description: 'Pães', category: 'Alimentação', amount_cents: 12000, due_date: '2026-10-05',
      }).select('id').single();
      expect(expErr).toBeNull();

      const { error: badPaid } = await gestao.client.from('expenses').update({ status: 'pago' }).eq('id', exp.id);
      expect(badPaid).not.toBeNull();
      const { error: paid } = await gestao.client.from('expenses').update({ status: 'pago', paid_on: '2026-10-04' }).eq('id', exp.id);
      expect(paid).toBeNull();

      const { data: adminSees } = await admin.client.from('expenses').select('id').eq('school_id', schoolA);
      expect(adminSees).toEqual([]);
      const { error: adminInsert } = await admin.client.from('expenses').insert({ school_id: schoolA, description: 'X', category: 'Outros', amount_cents: 100, due_date: '2026-10-05' });
      expect(adminInsert).not.toBeNull();

      const { data: otherSees } = await gestaoB.client.from('expenses').select('id').eq('school_id', schoolA);
      expect(otherSees).toEqual([]);
      const { data: otherSup } = await gestaoB.client.from('suppliers').select('id').eq('school_id', schoolA);
      expect(otherSup).toEqual([]);
    } finally {
      await adminClient.from('expenses').delete().eq('school_id', schoolA);
      await adminClient.from('suppliers').delete().eq('school_id', schoolA);
      for (const u of [gestao, admin, gestaoB]) await deleteTestUser(u.id);
      await deleteTestSchool(schoolA);
      await deleteTestSchool(schoolB);
    }
  }, 30000);
});

runIf('Portal da Gestão · baixa manual de cobrança', () => {
  it('admin sem permissão é barrado; Gestão dá baixa numa cobrança fora do Asaas e fica registrado', async () => {
    const schoolId = await createTestSchool();
    const gestao = await createTestUser({ role: 'gestao', schoolId });
    const admin = await createTestUser({ role: 'admin', schoolId });
    const family = await createTestUser({ role: 'family', schoolId });
    const studentId = await createStudent(schoolId, { family_id: family.id });
    const { data: charge, error: chargeErr } = await adminClient.from('financial_charges').insert({
      school_id: schoolId, student_id: studentId, family_id: family.id, due_date: '2026-10-10', available_from: '2026-10-01', amount_cents: 50000, status: 'OVERDUE',
    }).select('id').single();
    if (chargeErr) throw chargeErr;
    try {
      const body = { charge_id: charge.id, payment_date: '2026-10-11', amount_cents: 50000, method: 'cash' };
      const asAdmin = await callFn('register-manual-payment', admin.token, body);
      expect(asAdmin.status).not.toBe(200);
      expect(asAdmin.message).toMatch(/Acesso negado/);

      const asGestao = await callFn('register-manual-payment', gestao.token, body);
      expect(asGestao.message).toBe('');
      expect(asGestao.status).toBe(200);

      const { data: after } = await adminClient.from('financial_charges').select('status, payment_method, paid_at').eq('id', charge.id).single();
      expect(after.status).toBe('PAID');
      expect(after.payment_method).toBe('cash');
      expect(after.paid_at.slice(0, 10)).toBe('2026-10-11');

      const { data: events } = await adminClient.from('financial_charge_events').select('event_type').eq('charge_id', charge.id);
      expect(events.map(e => e.event_type)).toContain('MANUAL_RECEIPT');

      const again = await callFn('register-manual-payment', gestao.token, body);
      expect(again.message).toMatch(/não está em aberto/);
    } finally {
      await adminClient.from('financial_charge_events').delete().eq('charge_id', charge.id);
      await adminClient.from('financial_charges').delete().eq('id', charge.id);
      await adminClient.from('audit_logs').delete().eq('school_id', schoolId);
      await adminClient.from('notifications').delete().eq('school_id', schoolId);
      await adminClient.from('students').delete().eq('id', studentId);
      for (const u of [gestao, admin, family]) await deleteTestUser(u.id);
      await deleteTestSchool(schoolId);
    }
  }, 45000);
});

runIf('Portal da Gestão · ano letivo', () => {
  it('escola nova nasce com ano aberto; matrícula do ano acompanha o aluno; só a Gestão vira o ano', async () => {
    const schoolId = await createTestSchool();
    const gestao = await createTestUser({ role: 'gestao', schoolId });
    const admin = await createTestUser({ role: 'admin', schoolId });
    const studentId = await createStudent(schoolId, { enrollment_status: 'ativo' });
    try {
      const { data: years } = await gestao.client.from('school_years').select('id, status').eq('school_id', schoolId);
      expect(years.filter(y => y.status === 'aberto')).toHaveLength(1);
      const openId = years.find(y => y.status === 'aberto').id;

      await adminClient.from('students').update({ turma: 'Casa dos Bambini' }).eq('id', studentId);
      const { data: enr } = await gestao.client.from('enrollments').select('turma').eq('school_year_id', openId).eq('student_id', studentId).single();
      expect(enr.turma).toBe('Casa dos Bambini');

      const { error: adminErr } = await admin.client.rpc('open_school_year', { p_name: '2099', p_starts_on: '2099-01-01', p_ends_on: '2099-12-31' });
      expect(adminErr).not.toBeNull();

      const { data: newId, error: openErr } = await gestao.client.rpc('open_school_year', { p_name: '2099', p_starts_on: '2099-01-01', p_ends_on: '2099-12-31' });
      expect(openErr).toBeNull();
      const { data: after } = await gestao.client.from('school_years').select('id, status').eq('school_id', schoolId);
      expect(after.find(y => y.id === openId).status).toBe('encerrado');
      expect(after.find(y => y.id === newId).status).toBe('aberto');
      const { data: newEnr } = await gestao.client.from('enrollments').select('turma').eq('school_year_id', newId).eq('student_id', studentId).single();
      expect(newEnr.turma).toBe('Casa dos Bambini');

      const { error: writeErr } = await gestao.client.from('enrollments').update({ turma: 'Hackeada' }).eq('school_year_id', newId);
      const { data: still } = await adminClient.from('enrollments').select('turma').eq('school_year_id', newId).eq('student_id', studentId).single();
      expect(writeErr === null ? still.turma : 'Casa dos Bambini').toBe('Casa dos Bambini');
    } finally {
      await adminClient.from('audit_logs').delete().eq('school_id', schoolId);
      await adminClient.from('students').delete().eq('id', studentId);
      await deleteTestUser(gestao.id);
      await deleteTestUser(admin.id);
      await deleteTestSchool(schoolId);
    }
  }, 30000);
});

runIf('Portal da Gestão · contratos e assinatura eletrônica', () => {
  it('Gestão gera e envia; texto trava após envio; só o responsável do aluno assina e só com o texto certo', async () => {
    const schoolId = await createTestSchool();
    const gestao = await createTestUser({ role: 'gestao', schoolId });
    const family = await createTestUser({ role: 'family', schoolId });
    const stranger = await createTestUser({ role: 'family', schoolId });
    const studentId = await createStudent(schoolId, { family_id: family.id });
    const body = 'CONTRATO Vitest\nMensalidade de R$ 1.500,00 · ação educacional';
    try {
      const { data: doc, error: insErr } = await gestao.client.from('contract_documents').insert({
        school_id: schoolId, student_id: studentId, title: 'Contrato Vitest', body,
      }).select('id, content_hash, status').single();
      expect(insErr).toBeNull();
      expect(doc.content_hash).toBe(sha256(body));

      const { data: hidden } = await family.client.from('contract_documents').select('id').eq('id', doc.id);
      expect(hidden).toEqual([]);

      const { error: sendErr } = await gestao.client.from('contract_documents').update({ status: 'enviado', sent_at: new Date().toISOString() }).eq('id', doc.id);
      expect(sendErr).toBeNull();

      const { error: editErr } = await gestao.client.from('contract_documents').update({ body: `${body} alterado` }).eq('id', doc.id);
      expect(editErr?.message).toMatch(/não pode ser alterado/);

      const { data: visible } = await family.client.from('contract_documents').select('id, body').eq('id', doc.id);
      expect(visible).toHaveLength(1);
      const { data: strangerSees } = await stranger.client.from('contract_documents').select('id').eq('id', doc.id);
      expect(strangerSees).toEqual([]);

      const { error: strangerSign } = await stranger.client.rpc('sign_contract_document', { p_document_id: doc.id, p_signer_name: 'Estranho', p_content_hash: sha256(body) });
      expect(strangerSign).not.toBeNull();
      const { error: gestaoSign } = await gestao.client.rpc('sign_contract_document', { p_document_id: doc.id, p_signer_name: 'Gestão', p_content_hash: sha256(body) });
      expect(gestaoSign).not.toBeNull();
      const { error: wrongHash } = await family.client.rpc('sign_contract_document', { p_document_id: doc.id, p_signer_name: 'Mãe Vitest', p_content_hash: sha256('outro texto') });
      expect(wrongHash?.message).toMatch(/texto do contrato mudou/);

      const { error: signErr } = await family.client.rpc('sign_contract_document', { p_document_id: doc.id, p_signer_name: 'Mãe Vitest', p_content_hash: sha256(body) });
      expect(signErr).toBeNull();
      const { data: signed } = await adminClient.from('contract_documents').select('status, signer_name, signed_by, signature_meta').eq('id', doc.id).single();
      expect(signed.status).toBe('assinado');
      expect(signed.signer_name).toBe('Mãe Vitest');
      expect(signed.signed_by).toBe(family.id);
      expect(signed.signature_meta.content_hash).toBe(sha256(body));

      const { error: again } = await family.client.rpc('sign_contract_document', { p_document_id: doc.id, p_signer_name: 'Mãe Vitest', p_content_hash: sha256(body) });
      expect(again).not.toBeNull();
      const { error: backToDraft } = await gestao.client.from('contract_documents').update({ status: 'rascunho' }).eq('id', doc.id);
      expect(backToDraft).not.toBeNull();

      const { error: noParent } = await gestao.client.from('contract_documents').insert({ school_id: schoolId, student_id: studentId, kind: 'aditivo', title: 'Aditivo', body: 'x' });
      expect(noParent).not.toBeNull();
      const { error: aditivo } = await gestao.client.from('contract_documents').insert({ school_id: schoolId, student_id: studentId, kind: 'aditivo', parent_id: doc.id, title: 'Aditivo', body: 'x' });
      expect(aditivo).toBeNull();
    } finally {
      await adminClient.from('contract_documents').delete().eq('school_id', schoolId).eq('kind', 'aditivo');
      await adminClient.from('contract_documents').delete().eq('school_id', schoolId);
      await adminClient.from('audit_logs').delete().eq('school_id', schoolId);
      await adminClient.from('students').delete().eq('id', studentId);
      for (const u of [gestao, family, stranger]) await deleteTestUser(u.id);
      await deleteTestSchool(schoolId);
    }
  }, 45000);
});

runIf('Portal da Gestão · segurança e leitura', () => {
  it('só a Gestão exige troca de senha, sem afetar a própria conta', async () => {
    const schoolId = await createTestSchool();
    const gestao = await createTestUser({ role: 'gestao', schoolId });
    const admin = await createTestUser({ role: 'admin', schoolId });
    const teacher = await createTestUser({ role: 'teacher', schoolId });
    try {
      const { error: adminErr } = await admin.client.rpc('require_password_change_school', { p_roles: ['teacher'] });
      expect(adminErr).not.toBeNull();

      const { data: count, error } = await gestao.client.rpc('require_password_change_school', { p_roles: ['admin', 'teacher', 'gestao'] });
      expect(error).toBeNull();
      expect(count).toBe(2);
      const { data: rows } = await adminClient.from('users').select('id, must_change_password').in('id', [gestao.id, admin.id, teacher.id]);
      const byId = Object.fromEntries(rows.map(r => [r.id, r.must_change_password]));
      expect(byId[admin.id]).toBe(true);
      expect(byId[teacher.id]).toBe(true);
      expect(byId[gestao.id]).toBe(false);
    } finally {
      await adminClient.from('audit_logs').delete().eq('school_id', schoolId);
      for (const u of [gestao, admin, teacher]) await deleteTestUser(u.id);
      await deleteTestSchool(schoolId);
    }
  }, 30000);

  it('Gestão lê registros acadêmicos da própria escola e não os de outra', async () => {
    const schoolA = await createTestSchool();
    const schoolB = await createTestSchool();
    const gestao = await createTestUser({ role: 'gestao', schoolId: schoolA });
    const studentA = await createStudent(schoolA);
    const studentB = await createStudent(schoolB);
    try {
      await adminClient.from('pedagogical_records').insert([
        { school_id: schoolA, student_id: studentA, record_type: 'DAILY_OBSERVATION', record_date: '2026-09-27', content: 'Registro A' },
        { school_id: schoolB, student_id: studentB, record_type: 'DAILY_OBSERVATION', record_date: '2026-09-27', content: 'Registro B' },
      ]);
      const { data } = await gestao.client.from('pedagogical_records').select('content');
      expect(data.map(r => r.content)).toEqual(['Registro A']);
    } finally {
      await adminClient.from('pedagogical_records').delete().in('school_id', [schoolA, schoolB]);
      await adminClient.from('students').delete().in('id', [studentA, studentB]);
      await deleteTestUser(gestao.id);
      await deleteTestSchool(schoolA);
      await deleteTestSchool(schoolB);
    }
  }, 30000);

  it('Gestão pode notificar famílias (notify-families); família não', async () => {
    const schoolId = await createTestSchool();
    const gestao = await createTestUser({ role: 'gestao', schoolId });
    const family = await createTestUser({ role: 'family', schoolId });
    try {
      const payload = { type: 'contrato', title: 'Teste', message: 'Teste', url: '/?tab=contratos', family_ids: [family.id] };
      const asFamily = await callFn('notify-families', family.token, payload);
      expect(asFamily.message).toMatch(/Acesso negado/);
      const asGestao = await callFn('notify-families', gestao.token, payload);
      expect(asGestao.message).not.toMatch(/Acesso negado/);
    } finally {
      await adminClient.from('notifications').delete().eq('school_id', schoolId);
      await deleteTestUser(gestao.id);
      await deleteTestUser(family.id);
      await deleteTestSchool(schoolId);
    }
  }, 30000);
});
