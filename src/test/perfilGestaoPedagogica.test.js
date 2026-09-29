import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SUPABASE_URL, ANON_KEY, hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Perfil Gestão Pedagógica (Coordenação e Direção) · PLANO_PERFIL_GESTAO_PEDAGOGICA.md
// Tudo aqui roda contra o banco local de verdade, com contas reais logadas
// em cada tipo de conta. Três garantias:
//   1. FECHADO: nada exclusivo da Gestão (financeiro, contratos, notas,
//      horas extras, permissões, configurações, LGPD) é lido ou alterado.
//   2. SEM PROMOÇÃO: a conta não vira Gestão nem mexe em contas da equipe.
//   3. FUNCIONA: tudo que foi liberado (secretaria, cadastros, acadêmico,
//      comunicação, correções que não geram hora extra) funciona.
// E a lista de regras do perfil é exatamente a aprovada (nasce fechado).
const runIf = hasIntegrationCredentials ? describe : describe.skip;

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);

async function chamarFuncao(nome, token, body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${nome}`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// Regras que deixam a Gestão Pedagógica passar (migração perfil_gestao_pedagogica).
// Qualquer regra nova para este perfil precisa ser acrescentada aqui DE PROPÓSITO.
const REGRAS_APROVADAS = [
  'public.attendance_corrections|Gestao pedagogica le correcoes de presenca',
  'public.attendance_corrections|Gestao pedagogica registra correcao que nao gera cobranca',
  'public.attendance_logs|Gestao pedagogica le presenca',
  'public.audit_logs|Gestao pedagogica le historico do aluno',
  'public.aulas_especiais|Gestao pedagogica gerencia aulas especiais',
  'public.authorized_persons|Gestao pedagogica gerencia autorizados',
  'public.cardapio_itens|Gestao pedagogica gerencia itens de cardapio',
  'public.cardapios|Gestao pedagogica gerencia cardapios',
  'public.chat_messages|Gestao pedagogica envia mensagens em horario comercial',
  'public.chat_messages|Gestao pedagogica escreve na propria conversa de suporte',
  'public.chat_messages|Gestao pedagogica le a propria conversa de suporte',
  'public.chat_messages|Gestao pedagogica le mensagens do proprio setor',
  'public.chat_threads|Gestao pedagogica acessa conversas do proprio setor',
  'public.chat_threads|Gestao pedagogica gerencia a propria conversa de suporte',
  'public.class_attendance|Gestao pedagogica le frequencia',
  'public.class_subjects|Gestao pedagogica gerencia materias por turma',
  'public.classes|Gestao pedagogica le turmas normalizadas',
  'public.comunicados|Gestao pedagogica gerencia comunicados',
  'public.daily_attendance_status|Gestao pedagogica le status diario',
  'public.diario_entries|Gestao pedagogica gerencia diario',
  'public.enrollments|Gestao pedagogica le matriculas por ano',
  'public.eventos_calendario|Gestao pedagogica gerencia calendario',
  'public.fichas_medicas|Gestao pedagogica le ficha medica',
  'public.matricula_solicitacoes|Gestao pedagogica gerencia matriculas',
  'public.mitigacao_reports|Gestao pedagogica edita relatorios de mitigacao',
  'public.mitigacao_reports|Gestao pedagogica exclui relatorios de mitigacao',
  'public.mitigacao_reports|Gestao pedagogica le relatorios de mitigacao',
  'public.mural_fotos|Gestao pedagogica gerencia mural',
  'public.pedagogical_records|Gestao pedagogica le registros pedagogicos',
  'public.reports|Gestao pedagogica le relatorios pedagogicos',
  'public.school_years|Gestao pedagogica le anos letivos',
  'public.schools|Gestao pedagogica ajusta alerta de faltas',
  'public.student_documents|Gestao pedagogica gerencia documentos do aluno',
  'public.student_guardians|Gestao pedagogica gerencia vinculos',
  'public.student_transfers|Gestao pedagogica le transferencias',
  'public.students|Gestao pedagogica cria alunos',
  'public.students|Gestao pedagogica edita alunos',
  'public.students|Gestao pedagogica le alunos da escola',
  'public.subjects|Gestao pedagogica gerencia materias',
  'public.users|Gestao pedagogica cria familias e professoras',
  'public.users|Gestao pedagogica edita familias e professoras',
  'public.users|Gestao pedagogica le usuarios da escola',
  'storage.objects|Gestao pedagogica e Gestao leem documentos de matricula',
  'storage.objects|Gestao pedagogica gerencia anexos de comunicados',
  'storage.objects|Gestao pedagogica gerencia arquivos de documentos do aluno',
  'storage.objects|Gestao pedagogica gerencia fotos de autorizados',
  'storage.objects|Gestao pedagogica gerencia fotos do mural',
].sort();

// Tabelas que NUNCA podem ter regra para este perfil.
const TABELAS_EXCLUSIVAS_DA_GESTAO = [
  'financial_charges', 'financial_contracts', 'financial_billing_discounts', 'school_gateway_accounts', 'payment_webhook_events',
  'expenses', 'suppliers', 'contract_documents', 'contract_templates', 'school_role_permissions', 'account_deletion_requests',
  'funcionarios', 'kiosk_devices', 'cron_secrets', 'financial_invoices',
];

runIf('Perfil Gestão Pedagógica (Coordenação e Direção)', () => {
  const ctx = {};

  beforeAll(async () => {
    ctx.schoolId = await createTestSchool();
    ctx.outraEscola = await createTestSchool();
    ctx.coord = await createTestUser({ role: 'gestao_pedagogica', schoolId: ctx.schoolId, extra: { departamento: 'coordenacao', name: 'Vitest Coordenadora' } });
    ctx.gestao = await createTestUser({ role: 'gestao', schoolId: ctx.schoolId });
    ctx.recepcao = await createTestUser({ role: 'admin', schoolId: ctx.schoolId, extra: { departamento: 'recepcao' } });
    ctx.familia = await createTestUser({ role: 'family', schoolId: ctx.schoolId, extra: { doc_number: '11122233344' } });
    ctx.familiaOutra = await createTestUser({ role: 'family', schoolId: ctx.outraEscola });

    const { data: alunos, error } = await adminClient.from('students').insert([
      { school_id: ctx.schoolId, name: 'Vitest Aluno Davi', family_id: ctx.familia.id, turma: 'Kids I' },
      { school_id: ctx.outraEscola, name: 'Vitest Aluno Outra Escola', family_id: ctx.familiaOutra.id },
    ]).select('id, name');
    if (error) throw error;
    ctx.aluno = alunos.find(a => a.name === 'Vitest Aluno Davi').id;
    ctx.alunoOutra = alunos.find(a => a.name === 'Vitest Aluno Outra Escola').id;
    await adminClient.from('student_guardians').insert({ student_id: ctx.aluno, guardian_id: ctx.familia.id, school_id: ctx.schoolId, is_primary: true, is_financial: true });

    // Dados exclusivos da Gestão, que a Coordenação nunca pode ver.
    const { data: contrato } = await adminClient.from('financial_contracts').insert({
      school_id: ctx.schoolId, student_id: ctx.aluno, financial_guardian_id: ctx.familia.id, billing_cycle: 'MONTHLY',
      base_monthly_amount_cents: 90000, amount_cents: 90000, first_due_date: '2026-10-10', status: 'active',
    }).select('id').single();
    ctx.contrato = contrato.id;
    await adminClient.from('financial_charges').insert({
      school_id: ctx.schoolId, contract_id: ctx.contrato, student_id: ctx.aluno, family_id: ctx.familia.id,
      due_date: '2026-09-10', available_from: '2026-09-01', amount_cents: 90000, status: 'OVERDUE',
    });
    await adminClient.from('financial_billing_discounts').insert({ school_id: ctx.schoolId, guardian_id: ctx.familia.id, billing_cycle: 'MONTHLY', discount_percent: 50 });
    await adminClient.from('expenses').insert({ school_id: ctx.schoolId, description: 'Aluguel Vitest', category: 'Outros', amount_cents: 500000, due_date: '2026-10-05' });
    await adminClient.from('contract_documents').insert({ school_id: ctx.schoolId, student_id: ctx.aluno, title: 'Contrato Vitest', body: 'Texto do contrato' });
    await adminClient.from('account_deletion_requests').insert({ school_id: ctx.schoolId, user_id: ctx.familia.id, user_name: 'Vitest Familia', user_role: 'family' });
    await adminClient.from('audit_logs').insert([
      { school_id: ctx.schoolId, action: 'update_student_profile', entity_type: 'student', entity_id: ctx.aluno, details: { name: 'Vitest' } },
      { school_id: ctx.schoolId, action: 'set_student_financial_guardian', entity_type: 'student', entity_id: ctx.aluno, details: { nome: 'x' } },
      { school_id: ctx.schoolId, action: 'purge_biometria', entity_type: 'authorized_person', details: {} },
    ]);
  }, 60000);

  afterAll(async () => {
    for (const s of [ctx.schoolId, ctx.outraEscola]) {
      if (!s) continue;
      for (const t of ['financial_charges', 'financial_contracts', 'financial_billing_discounts', 'expenses', 'contract_documents', 'account_deletion_requests',
        'audit_logs', 'attendance_corrections', 'attendance_logs', 'mitigacao_reports', 'comunicados', 'chat_threads', 'student_documents',
        'authorized_persons', 'student_guardians', 'matricula_solicitacoes', 'cardapios', 'student_transfers']) {
        await adminClient.from(t).delete().eq('school_id', s);
      }
      await adminClient.from('students').delete().eq('school_id', s);
    }
    for (const u of [ctx.coord, ctx.gestao, ctx.recepcao, ctx.familia, ctx.familiaOutra, ...(ctx.extras || [])]) {
      if (u?.id) await deleteTestUser(u.id);
    }
    await deleteTestSchool(ctx.schoolId);
    await deleteTestSchool(ctx.outraEscola);
  }, 60000);

  // ─── 1. Fechado: nada exclusivo da Gestão ────────────────────────────────
  it('não lê nada financeiro, de contrato, despesa, desconto nem LGPD (mesmo existindo dados)', async () => {
    const c = ctx.coord.client;
    for (const tabela of ['financial_charges', 'financial_contracts', 'financial_billing_discounts', 'expenses', 'contract_documents', 'account_deletion_requests', 'school_gateway_accounts', 'payment_webhook_events']) {
      const { data } = await c.from(tabela).select('id').eq('school_id', ctx.schoolId);
      expect([tabela, data]).toEqual([tabela, []]);
    }
    // A própria Gestão continua lendo (o dado existe de verdade).
    const { data: gestaoVe } = await ctx.gestao.client.from('financial_charges').select('id').eq('school_id', ctx.schoolId);
    expect(gestaoVe).toHaveLength(1);
    const { data: lerFin } = await c.rpc('can_read_financeiro');
    expect(lerFin).toBe(false);
  });

  it('não grava nada financeiro, de contrato, despesa, fornecedor, permissão ou equipe', async () => {
    const c = ctx.coord.client;
    const tentativas = [
      ['expenses', { school_id: ctx.schoolId, description: 'X', category: 'Outros', amount_cents: 100, due_date: '2026-10-05' }],
      ['suppliers', { school_id: ctx.schoolId, name: 'Fornecedor X' }],
      ['financial_billing_discounts', { school_id: ctx.schoolId, guardian_id: ctx.familia.id, billing_cycle: 'YEARLY', discount_percent: 99 }],
      ['contract_documents', { school_id: ctx.schoolId, student_id: ctx.aluno, title: 'Forjado', body: 'x' }],
      ['contract_templates', { school_id: ctx.schoolId, name: 'Modelo', body: 'x' }],
      ['school_role_permissions', { school_id: ctx.schoolId, role: 'admin', permission: 'despesas.ver', granted: true }],
      ['funcionarios', { school_id: ctx.schoolId, name: 'Funcionario X', cargo: 'Porteiro' }],
    ];
    for (const [tabela, linha] of tentativas) {
      const { error } = await c.from(tabela).insert(linha);
      expect([tabela, !!error]).toEqual([tabela, true]);
    }
    const { data: mudou } = await c.from('financial_contracts').update({ status: 'cancelled' }).eq('id', ctx.contrato).select();
    expect(mudou || []).toEqual([]);
    const { error: anexo } = await c.storage.from('expense-attachments').upload(`${ctx.schoolId}/x.png`, new Blob([PNG], { type: 'image/png' }));
    expect(anexo).not.toBeNull();
  });

  it('funções exclusivas da Gestão recusam: aprovar correção, LGPD, ano letivo, responsável financeiro, senhas, tipo de acesso', async () => {
    const c = ctx.coord.client;
    const chamadas = [
      ['list_biometria_para_limpar', {}],
      ['purge_biometria', { p_person_ids: [] }],
      ['list_fotos_soltas', {}],
      ['confirmar_fotos_soltas', { p_paths: [] }],
      ['list_unificar_responsaveis', {}],
      ['apply_unificar_responsaveis', { p_legacy_ids: [] }],
      ['open_school_year', { p_name: '2027', p_starts_on: '2027-01-01', p_ends_on: '2027-12-31' }],
      ['set_student_financial_guardian', { p_student_id: ctx.aluno, p_guardian_id: ctx.familia.id }],
      ['require_password_change_school', { p_roles: ['family'] }],
      ['set_staff_access_type', { p_user_id: ctx.recepcao.id, p_role: 'gestao_pedagogica' }],
    ];
    for (const [fn, args] of chamadas) {
      const { error } = await c.rpc(fn, args);
      expect([fn, !!error]).toEqual([fn, true]);
    }
  });

  it('configurações da escola: só o alerta de faltas e as turmas', async () => {
    const c = ctx.coord.client;
    for (const campo of [{ login_image_url: 'https://x/y.png' }, { billing_config: { valor: 1 } }, { communication_config: { a: 1 } }, { name: 'Escola Renomeada' }, { features_enabled: { financeiro: true } }]) {
      const { error } = await c.from('schools').update(campo).eq('id', ctx.schoolId);
      expect([Object.keys(campo)[0], !!error]).toEqual([Object.keys(campo)[0], true]);
    }
    const { error: faltas } = await c.from('schools').update({ absence_alert_config: { enabled: true, days: 4 } }).eq('id', ctx.schoolId);
    expect(faltas).toBeNull();
    const { error: turmas } = await c.rpc('update_school_turmas', { p_turmas: ['Kids I', 'Kids II'] });
    expect(turmas).toBeNull();
    const { data: escola } = await adminClient.from('schools').select('absence_alert_config, turmas, name').eq('id', ctx.schoolId).single();
    expect(escola.absence_alert_config).toMatchObject({ days: 4 });
    expect(escola.turmas).toEqual(['Kids I', 'Kids II']);
    expect(escola.name).not.toBe('Escola Renomeada');
  });

  it('histórico do aluno: só ações não financeiras', async () => {
    const { data } = await ctx.coord.client.from('audit_logs').select('action').eq('school_id', ctx.schoolId);
    expect(data.map(r => r.action)).toEqual(['update_student_profile']);
  });

  // ─── 2. Sem promoção ────────────────────────────────────────────────────
  it('não muda o próprio tipo, departamento, status nem o chat de todos; não mexe em contas da equipe', async () => {
    const c = ctx.coord.client;
    for (const campo of [{ role: 'gestao' }, { departamento: 'recepcao' }, { status: 'inactive' }, { chat_visibilidade_total: true }, { school_id: ctx.outraEscola }]) {
      const { error } = await c.from('users').update(campo).eq('id', ctx.coord.id);
      expect([Object.keys(campo)[0], !!error]).toEqual([Object.keys(campo)[0], true]);
    }
    // Contas da equipe: nenhuma linha alterada.
    for (const alvo of [ctx.gestao, ctx.recepcao]) {
      const { data } = await c.from('users').update({ name: 'Invadido' }).eq('id', alvo.id).select();
      expect(data || []).toEqual([]);
    }
    const { data: gestaoDepois } = await adminClient.from('users').select('name, role').eq('id', ctx.gestao.id).single();
    expect(gestaoDepois.name).not.toBe('Invadido');
    // Família não vira equipe.
    const { error: promover } = await c.from('users').update({ role: 'admin' }).eq('id', ctx.familia.id);
    expect(promover).not.toBeNull();
    // Não cria conta da equipe nem exclui ninguém.
    const { error: criaEquipe } = await c.from('users').insert({ id: crypto.randomUUID(), email: 'x@y.z', name: 'X', role: 'admin', school_id: ctx.schoolId });
    expect(criaEquipe).not.toBeNull();
    const { data: excluiu } = await c.from('users').delete().eq('id', ctx.familia.id).select();
    expect(excluiu || []).toEqual([]);
  });

  it('servidor: só a Gestão cria Coordenação/Direção; a Coordenação cria professoras e famílias', async () => {
    ctx.extras = ctx.extras || [];
    const email = (p) => `vitest.${p}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@zela-teste.com`;
    const nova = { password: 'SenhaTeste123!', name: 'Vitest Diretora', role: 'gestao_pedagogica', school_id: ctx.schoolId, extra_fields: { departamento: 'diretoria_pedagogica' } };

    const pelaRecepcao = await chamarFuncao('create-admin-user', ctx.recepcao.token, { ...nova, email: email('rec') });
    expect(pelaRecepcao.status).toBe(400);
    const pelaCoord = await chamarFuncao('create-admin-user', ctx.coord.token, { ...nova, email: email('coord') });
    expect(pelaCoord.status).toBe(400);
    const semDepartamento = await chamarFuncao('create-admin-user', ctx.gestao.token, { ...nova, email: email('semdep'), extra_fields: { departamento: 'recepcao' } });
    expect(semDepartamento.status).toBe(400);

    const pelaGestao = await chamarFuncao('create-admin-user', ctx.gestao.token, { ...nova, email: email('gest') });
    expect(pelaGestao.status).toBe(200);
    ctx.extras.push({ id: pelaGestao.body.id });
    expect(pelaGestao.body).toMatchObject({ role: 'gestao_pedagogica', departamento: 'diretoria_pedagogica', must_change_password: true, school_id: ctx.schoolId });

    const equipePelaCoord = await chamarFuncao('create-admin-user', ctx.coord.token, { email: email('adm'), password: 'SenhaTeste123!', name: 'X', role: 'admin', school_id: ctx.schoolId, extra_fields: { departamento: 'recepcao' } });
    expect(equipePelaCoord.status).toBe(400);
    const professora = await chamarFuncao('create-admin-user', ctx.coord.token, { email: email('prof'), password: 'SenhaTeste123!', name: 'Vitest Professora', role: 'teacher', school_id: ctx.schoolId, extra_fields: { turmas: ['Kids I'] } });
    expect(professora.status).toBe(200);
    ctx.extras.push({ id: professora.body.id });
    expect(professora.body).toMatchObject({ role: 'teacher', school_id: ctx.schoolId });
    expect(professora.body.status).not.toBe('pending');
  }, 30000);

  // ─── 3. Funciona: o que foi liberado ────────────────────────────────────
  it('secretaria: lê só a própria escola, cadastra e edita aluno, muda de turma, envia documento', async () => {
    const c = ctx.coord.client;
    const { data: alunos } = await c.from('students').select('id');
    expect(alunos.map(a => a.id)).toContain(ctx.aluno);
    expect(alunos.map(a => a.id)).not.toContain(ctx.alunoOutra);

    const { data: novo, error: insErr } = await c.from('students').insert({ school_id: ctx.schoolId, name: 'Vitest Aluno Novo', family_id: ctx.familia.id }).select('id').single();
    expect(insErr).toBeNull();
    const { error: updErr } = await c.from('students').update({ name: 'Vitest Aluno Novo Editado', birth_date: '2023-05-01' }).eq('id', novo.id);
    expect(updErr).toBeNull();
    const { error: turmaErr } = await c.rpc('transfer_student_class', { p_student_id: ctx.aluno, p_new_turma: 'Kids II', p_reason: 'Progressão por idade' });
    expect(turmaErr).toBeNull();
    const { data: transf } = await c.from('student_transfers').select('to_class_name').eq('student_id', ctx.aluno);
    expect(transf.map(t => t.to_class_name)).toContain('Kids II');

    const caminho = `${ctx.schoolId}/${ctx.aluno}/vitest.png`;
    const { error: upErr } = await c.storage.from('student-documents').upload(caminho, new Blob([PNG], { type: 'image/png' }), { upsert: true });
    expect(upErr).toBeNull();
    const { error: docErr } = await c.from('student_documents').insert({ school_id: ctx.schoolId, student_id: ctx.aluno, category: 'cartao_vacina', file_name: 'vitest.png', storage_path: caminho });
    expect(docErr).toBeNull();
    await adminClient.storage.from('student-documents').remove([caminho]);
  });

  it('cadastros: aprova conta pendente de família e aprova matrícula (cria aluno e autorizado)', async () => {
    ctx.extras = ctx.extras || [];
    const pendente = await createTestUser({ role: 'family', schoolId: ctx.schoolId, extra: { status: 'pending' } });
    ctx.extras.push(pendente);
    const { error: aprovaErr } = await ctx.coord.client.from('users').update({ status: 'active' }).eq('id', pendente.id);
    expect(aprovaErr).toBeNull();
    const { data: aprovada } = await adminClient.from('users').select('status').eq('id', pendente.id).single();
    expect(aprovada.status).toBe('active');

    const familiaMatricula = await createTestUser({ role: 'family', schoolId: ctx.schoolId, extra: { status: 'pending' } });
    ctx.extras.push(familiaMatricula);
    const { data: sol, error: solErr } = await adminClient.from('matricula_solicitacoes').insert({
      school_id: ctx.schoolId, family_id: familiaMatricula.id, status: 'pending',
      responsavel_financeiro: { telefone: '27999990000', cpf: '99988877766' },
      criancas: [{ nome: 'Vitest Crianca Matriculada', nascimento: '2023-02-01', ciclo: '6', turno: 'Matutino', periodo: '07:00 às 13:00' }],
      autorizados: [{ nome: 'Vitest Avo Matricula', parentesco: 'Avó' }],
    }).select('id').single();
    expect(solErr).toBeNull();
    const { error: rpcErr } = await ctx.coord.client.rpc('approve_matricula', { p_solicitacao_id: sol.id });
    expect(rpcErr).toBeNull();
    const { data: criado } = await adminClient.from('students').select('id, family_id').eq('name', 'Vitest Crianca Matriculada').single();
    expect(criado.family_id).toBe(familiaMatricula.id);
    const { data: autorizado } = await adminClient.from('authorized_persons').select('relation').eq('family_id', familiaMatricula.id);
    expect(autorizado.map(a => a.relation)).toContain('Avó');
    const { data: solDepois } = await adminClient.from('matricula_solicitacoes').select('status').eq('id', sol.id).single();
    expect(solDepois.status).toBe('approved');
  }, 30000);

  it('presença: corrige sem hora extra (aplica na hora), com hora extra fica para a Gestão, lança e remove marcação indevida', async () => {
    const c = ctx.coord.client;
    const hoje = new Date();
    const entrada = new Date(hoje.getTime() - 3 * 3600 * 1000).toISOString();
    const { data: log, error: logErr } = await adminClient.from('attendance_logs').insert({
      school_id: ctx.schoolId, student_id: ctx.aluno, family_id: ctx.familia.id, event_type: 'entry', event_time: entrada,
    }).select('id').single();
    expect(logErr).toBeNull();

    const semHoraExtra = await c.rpc('request_attendance_correction', {
      p_log_id: log.id, p_new_event_time: new Date(Date.parse(entrada) + 10 * 60000).toISOString(),
      p_reason_code: 'erro_de_marcacao', p_reason_detail: 'Vitest', p_minutes_delta: -10, p_increases_billing: false,
    });
    expect(semHoraExtra.error).toBeNull();
    expect(semHoraExtra.data.status).toBe('applied');

    const comHoraExtra = await c.rpc('request_attendance_correction', {
      p_log_id: log.id, p_new_event_time: new Date(Date.parse(entrada) - 60 * 60000).toISOString(),
      p_reason_code: 'erro_de_marcacao', p_reason_detail: 'Vitest', p_minutes_delta: 60, p_increases_billing: true,
    });
    expect(comHoraExtra.error).toBeNull();
    expect(comHoraExtra.data.status).toBe('pending');
    // A Coordenação não aprova; a Gestão aprova.
    const naoAprova = await c.rpc('approve_attendance_correction', { p_correction_id: comHoraExtra.data.correction_id, p_approve: true });
    expect(naoAprova.error).not.toBeNull();
    const gestaoAprova = await ctx.gestao.client.rpc('approve_attendance_correction', { p_correction_id: comHoraExtra.data.correction_id, p_approve: true });
    expect(gestaoAprova.error).toBeNull();

    // Lançamento manual de saída (sem hora extra) e remoção de marcação indevida de hoje.
    const manual = await c.rpc('request_attendance_manual_entry', {
      p_student_id: ctx.aluno, p_event_type: 'exit', p_new_event_time: new Date().toISOString(),
      p_reason_code: 'esqueceu_de_marcar', p_reason_detail: 'Vitest', p_minutes_delta: 0, p_increases_billing: false,
    });
    expect(manual.error).toBeNull();

    const { data: outro } = await adminClient.from('students').insert({ school_id: ctx.schoolId, name: 'Vitest Aluno Fantasma', family_id: ctx.familia.id, today_exit_at: new Date().toISOString() }).select('id').single();
    const remove = await c.rpc('delete_stale_attendance_marking', { p_student_id: outro.id, p_event_type: 'exit', p_reason_code: 'marcacao_indevida', p_reason_detail: 'Vitest' });
    expect(remove.error).toBeNull();
    const { data: depois } = await adminClient.from('students').select('today_exit_at').eq('id', outro.id).single();
    expect(depois.today_exit_at).toBeNull();

    // Direto no banco, só consegue registrar correção aplicada e sem cobrança.
    const { error: forjada } = await c.from('attendance_corrections').insert({
      school_id: ctx.schoolId, student_id: ctx.aluno, event_type: 'exit', new_event_time: new Date().toISOString(),
      reason_code: 'x', increases_billing: true, requested_by: ctx.coord.id, status: 'approved',
    });
    expect(forjada).not.toBeNull();
  }, 30000);

  it('acadêmico e comunicação: revisa Mitigação, cardápio, comunicado, chat do próprio setor', async () => {
    const c = ctx.coord.client;
    const { data: rel } = await adminClient.from('mitigacao_reports').insert({ school_id: ctx.schoolId, student_id: ctx.aluno }).select('id').single();
    const { data: editou, error: mitErr } = await c.from('mitigacao_reports').update({ current_step: 2 }).eq('id', rel.id).select('current_step');
    expect(mitErr).toBeNull();
    expect(editou).toEqual([{ current_step: 2 }]);

    const { error: cardErr } = await c.from('cardapios').insert({ school_id: ctx.schoolId, titulo: 'Cardápio Vitest' });
    expect(cardErr).toBeNull();
    const { error: comErr } = await c.from('comunicados').insert({ school_id: ctx.schoolId, title: 'Aviso Vitest', body: 'Texto', created_by: ctx.coord.id });
    expect(comErr).toBeNull();

    await adminClient.from('chat_threads').insert([
      { school_id: ctx.schoolId, family_id: ctx.familia.id, setor: 'coordenacao' },
      { school_id: ctx.schoolId, family_id: ctx.familia.id, setor: 'recepcao' },
    ]);
    const { data: conversas } = await c.from('chat_threads').select('setor');
    expect(conversas.map(t => t.setor)).toEqual(['coordenacao']);
  });

  it('a Recepção continua sem ver financeiro sem permissão e sem aprovar correção', async () => {
    const { data } = await ctx.recepcao.client.from('financial_charges').select('id').eq('school_id', ctx.schoolId);
    expect(data).toEqual([]);
  });

  it('a Gestão troca a Recepção de Coordenação para o perfil novo e volta; ninguém mais consegue', async () => {
    const coordAntiga = await createTestUser({ role: 'admin', schoolId: ctx.schoolId, extra: { departamento: 'coordenacao' } });
    ctx.extras = ctx.extras || [];
    ctx.extras.push(coordAntiga);
    const { error: recErr } = await ctx.recepcao.client.rpc('set_staff_access_type', { p_user_id: coordAntiga.id, p_role: 'gestao_pedagogica' });
    expect(recErr).not.toBeNull();
    const { error: recepcaoDepto } = await ctx.gestao.client.rpc('set_staff_access_type', { p_user_id: ctx.recepcao.id, p_role: 'gestao_pedagogica' });
    expect(recepcaoDepto).not.toBeNull(); // departamento recepção não vira Gestão Pedagógica
    const { error: ida } = await ctx.gestao.client.rpc('set_staff_access_type', { p_user_id: coordAntiga.id, p_role: 'gestao_pedagogica' });
    expect(ida).toBeNull();
    const { data: agora } = await adminClient.from('users').select('role').eq('id', coordAntiga.id).single();
    expect(agora.role).toBe('gestao_pedagogica');
    const { error: volta } = await ctx.gestao.client.rpc('set_staff_access_type', { p_user_id: coordAntiga.id, p_role: 'admin' });
    expect(volta).toBeNull();
    // A Gestão não usa a troca para criar outra Gestão.
    const { error: virarGestao } = await ctx.gestao.client.from('users').update({ role: 'gestao' }).eq('id', coordAntiga.id);
    expect(virarGestao).not.toBeNull();
  });

  // ─── Nasce fechado ───────────────────────────────────────────────────────
  it('a lista de regras do perfil é exatamente a aprovada, e nenhuma toca tabela exclusiva da Gestão', async () => {
    const { data, error } = await adminClient.rpc('list_policies_for_role', { p_role: 'gestao_pedagogica' });
    expect(error).toBeNull();
    const atuais = data.map(r => `${r.schemaname}.${r.tablename}|${r.policyname}`).sort();
    expect(atuais).toEqual(REGRAS_APROVADAS);
    for (const r of data) expect(TABELAS_EXCLUSIVAS_DA_GESTAO).not.toContain(r.tablename);
  });
});
