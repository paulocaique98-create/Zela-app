import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { logEdgeError } from '../_shared/logEdgeError.ts';
import { sendFamilyNotification } from '../_shared/sendFamilyNotification.ts';
import { brl, calcularAcordo, dataBR, preencherTermo, TERMO_PADRAO } from '../_shared/debtAgreement.ts';

// Item 10 do plano de expansão da Gestão: cria o acordo de dívida (só a Gestão).
// Nada muda no Asaas aqui. O acordo nasce "aguardando_assinatura" com o termo enviado à
// família; as parcelas só viram cobranças em activate-debt-agreement, depois da assinatura.
// Valores e parcelas são recalculados no servidor; school_id nunca vem do client.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

  let adminClient: ReturnType<typeof createClient> | null = null;
  let documentoCriado: string | null = null;
  try {
    adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Sem token de autorização');
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user: caller }, error: callerError } = await adminClient.auth.getUser(token);
    if (callerError || !caller) throw new Error('Token inválido ou expirado');

    const { data: callerData, error: dbCallerError } = await adminClient
      .from('users').select('role, school_id').eq('id', caller.id).single();
    if (dbCallerError || !callerData || callerData.role !== 'gestao') {
      throw new Error('Acesso negado: apenas a Gestão pode negociar dívidas.');
    }
    const schoolId = callerData.school_id;

    const { data: rateLimitOk, error: rateLimitError } = await adminClient.rpc('check_rate_limit', {
      p_key: `edge:create-debt-agreement:${caller.id}`,
      p_limit: 20,
      p_window_seconds: 300,
    });
    if (rateLimitError) throw rateLimitError;
    if (!rateLimitOk) return json({ error: 'Muitos acordos em pouco tempo. Aguarde alguns minutos.' }, 429);

    const { charge_ids, desconto_cents, parcelas, primeiro_vencimento, motivo } = await req.json();
    if (!Array.isArray(charge_ids) || charge_ids.length === 0 || charge_ids.length > 60
      || !charge_ids.every((id) => UUID.test(String(id)))) {
      throw new Error('Selecione as cobranças atrasadas do acordo.');
    }
    const ids = [...new Set(charge_ids.map(String))];

    // Nunca confia em school_id vindo do client: as cobranças têm que ser da escola de quem chama.
    const { data: charges, error: chargesError } = await adminClient
      .from('financial_charges')
      .select('id, status, amount_cents, due_date, student_id, family_id')
      .in('id', ids)
      .eq('school_id', schoolId);
    if (chargesError) throw chargesError;
    if (!charges || charges.length !== ids.length) throw new Error('Alguma cobrança não foi encontrada nesta escola.');
    if (charges.some((c) => c.status !== 'OVERDUE')) throw new Error('Só cobranças atrasadas entram em um acordo.');
    if (new Set(charges.map((c) => c.student_id)).size !== 1 || new Set(charges.map((c) => c.family_id)).size !== 1) {
      throw new Error('Um acordo vale para um aluno e um responsável financeiro. Faça um acordo por aluno.');
    }
    const { student_id: studentId, family_id: guardianId } = charges[0];

    const { data: jaEmAcordo, error: vigenteError } = await adminClient
      .from('debt_agreement_charges').select('charge_id').in('charge_id', ids).eq('ativa', true).limit(1);
    if (vigenteError) throw vigenteError;
    if (jaEmAcordo && jaEmAcordo.length > 0) throw new Error('Alguma cobrança já faz parte de um acordo vigente.');

    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const valorOriginalCents = charges.reduce((s, c) => s + c.amount_cents, 0);
    const calculo = calcularAcordo({
      valorOriginalCents,
      descontoCents: Number.isInteger(desconto_cents) ? desconto_cents : Number(desconto_cents) || 0,
      parcelas: Number(parcelas),
      primeiroVencimento: String(primeiro_vencimento || ''),
      hoje,
    });
    const descontoCents = valorOriginalCents - calculo.valorAcordadoCents;
    const justificativa = String(motivo || '').trim().slice(0, 500) || null;

    const [{ data: student }, { data: guardian }, { data: school }] = await Promise.all([
      adminClient.from('students').select('id, name').eq('id', studentId).eq('school_id', schoolId).single(),
      adminClient.from('users').select('id, name').eq('id', guardianId).eq('school_id', schoolId).single(),
      adminClient.from('schools').select('name, razao_social').eq('id', schoolId).single(),
    ]);
    if (!student || !guardian) throw new Error('Aluno ou responsável não encontrado nesta escola.');

    const { data: modelo } = await adminClient
      .from('contract_templates').select('body').eq('school_id', schoolId).eq('active', true)
      .eq('name', 'Acordo de dívida').maybeSingle();
    const ordenadas = [...charges].sort((a, b) => a.due_date.localeCompare(b.due_date));
    const termo = preencherTermo(modelo?.body || TERMO_PADRAO, {
      escola_nome: school?.razao_social || school?.name || '',
      responsavel_nome: guardian.name,
      aluno_nome: student.name,
      valor_original: brl(valorOriginalCents),
      desconto: brl(descontoCents),
      valor_acordado: brl(calculo.valorAcordadoCents),
      parcelas: String(calculo.parcelas.length),
      cobrancas: ordenadas.map((c) => `${dataBR(c.due_date)} (${brl(c.amount_cents)})`).join(', '),
      quadro_parcelas: calculo.parcelas.map((p) => `Parcela ${p.numero}: ${brl(p.amountCents)}, vencimento ${dataBR(p.dueDate)}`).join('\n'),
    });

    const agora = new Date().toISOString();
    const { data: documento, error: docError } = await adminClient
      .from('contract_documents')
      .insert({
        school_id: schoolId, student_id: studentId, kind: 'contrato',
        title: `Acordo de dívida, ${student.name}`, body: termo,
        status: 'enviado', sent_at: agora, created_by: caller.id,
      })
      .select('id').single();
    if (docError) throw docError;
    documentoCriado = documento.id;

    const { data: acordo, error: acordoError } = await adminClient
      .from('debt_agreements')
      .insert({
        school_id: schoolId, guardian_id: guardianId, student_id: studentId,
        valor_original_cents: valorOriginalCents, desconto_cents: descontoCents,
        valor_acordado_cents: calculo.valorAcordadoCents, parcelas: calculo.parcelas.length,
        primeiro_vencimento: calculo.parcelas[0].dueDate, status: 'aguardando_assinatura',
        contract_id: documento.id, motivo: justificativa, created_by: caller.id,
      })
      .select('id').single();
    if (acordoError) throw acordoError;

    const { error: vinculoError } = await adminClient.from('debt_agreement_charges').insert(
      charges.map((c) => ({
        agreement_id: acordo.id, school_id: schoolId, charge_id: c.id, amount_cents: c.amount_cents, status_anterior: c.status,
      })),
    );
    if (vinculoError) { await adminClient.from('debt_agreements').delete().eq('id', acordo.id); throw vinculoError; }

    const { error: parcelasError } = await adminClient.from('debt_agreement_installments').insert(
      calculo.parcelas.map((p) => ({
        agreement_id: acordo.id, school_id: schoolId, numero: p.numero, amount_cents: p.amountCents, due_date: p.dueDate,
      })),
    );
    if (parcelasError) { await adminClient.from('debt_agreements').delete().eq('id', acordo.id); throw parcelasError; }

    await adminClient.from('audit_logs').insert({
      school_id: schoolId, actor_id: caller.id, action: 'create_debt_agreement',
      entity_type: 'debt_agreement', entity_id: acordo.id,
      details: {
        student_id: studentId, guardian_id: guardianId, charges: ids,
        valor_original_cents: valorOriginalCents, desconto_cents: descontoCents,
        valor_acordado_cents: calculo.valorAcordadoCents, parcelas: calculo.parcelas.length, motivo: justificativa,
      },
    });

    try {
      await sendFamilyNotification(adminClient, {
        schoolId, familyId: guardianId, studentId, type: 'contrato',
        message: `Proposta de acordo de dívida, ${student.name}: ${calculo.parcelas.length}x, total ${brl(calculo.valorAcordadoCents)}. Leia e assine pelo app.`,
        url: '/?tab=contratos',
        pushTitle: 'Proposta de acordo para assinar',
        pushBody: `${calculo.parcelas.length}x, total ${brl(calculo.valorAcordadoCents)}`,
        pushTag: 'financeiro-acordo',
      });
    } catch (notifyErr) {
      console.error('[create-debt-agreement] Erro ao notificar família:', notifyErr);
    }

    return json({
      agreement_id: acordo.id, contract_id: documento.id,
      valor_acordado_cents: calculo.valorAcordadoCents, parcelas: calculo.parcelas.length,
    });
  } catch (err) {
    if (adminClient && documentoCriado) {
      // Acordo não chegou a existir: o termo enviado não pode ficar solto para a família assinar.
      await adminClient.from('contract_documents').update({ status: 'cancelado' }).eq('id', documentoCriado);
    }
    if (adminClient) await logEdgeError(adminClient, 'create-debt-agreement', (err as Error).message || String(err), {}, null, 'warn');
    return json({ error: (err as Error).message }, 400);
  }
});
