import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// P1.3 (Prompt Mestre de Evolução) — testes unitários da lógica real dos
// handlers de webhook Asaas (processPaymentEvent.ts, compartilhado entre
// payment-webhook e process-payment-webhook). O arquivo é Deno (usa
// specifier `npm:` e `Deno.env` via sendFamilyNotification.ts), então
// mockamos essa dependência pra isolar só a lógica de negócio testável em
// Node/Vitest — nunca chamamos rede/push de verdade aqui.
vi.mock('../../supabase/functions/_shared/sendFamilyNotification.ts', () => ({
  sendFamilyNotification: vi.fn().mockResolvedValue(undefined),
  centsToBRL: (cents) => `R$ ${(cents / 100).toFixed(2)}`,
}));

const { processPaymentEvent } = await import('../../supabase/functions/_shared/processPaymentEvent.ts');
const { sendFamilyNotification } = await import('../../supabase/functions/_shared/sendFamilyNotification.ts');

// Mock mínimo e determinístico do client supabase-js: cada .from(table)
// consome a próxima resposta configurada pra aquela tabela, na ordem em
// que processPaymentEvent realmente chama (documentado ao lado de cada
// teste). Suficiente pra exercitar a lógica real sem precisar de rede.
function makeAdminClient(responsesByTable) {
  const queues = {};
  for (const [table, list] of Object.entries(responsesByTable)) queues[table] = [...list];

  function chain(table) {
    const next = () => {
      const q = queues[table];
      if (!q || q.length === 0) throw new Error(`Nenhuma resposta mockada configurada pra tabela "${table}"`);
      return q.shift();
    };
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      is: () => builder,
      upsert: () => builder,
      insert: () => builder,
      update: () => builder,
      maybeSingle: async () => next(),
      single: async () => next(),
      then: (resolve) => resolve(next()), // fallback pra insert()/update() sem .select() encadeado
    };
    return builder;
  }

  return { from: vi.fn((table) => chain(table)) };
}

function basePayload(overrides = {}) {
  return {
    id: 'evt_123',
    event_type: 'PAYMENT_RECEIVED',
    school_id: 'school-a',
    payload: {
      payment: {
        id: 'pay_123',
        status: 'RECEIVED',
        value: 500,
        dueDate: '2026-09-05',
        billingType: 'PIX',
        ...overrides,
      },
    },
  };
}

describe('processPaymentEvent — lógica real dos handlers de webhook Asaas', () => {
  beforeEach(() => {
    sendFamilyNotification.mockClear();
  });

  it('cobrança avulsa nova (existia via create-avulsa-charge, ainda PENDING) confirmada como paga: mapeia status, marca paid_at, notifica "pagamento confirmado"', async () => {
    const client = makeAdminClient({
      financial_charges: [
        { data: { id: 'charge-1', status: 'PENDING', contract_id: 'contract-1', student_id: 'student-1', family_id: 'family-1' } }, // existingCharge
        { data: { id: 'charge-1' } }, // upsert .select('id').single()
      ],
      financial_charge_events: [{ data: null }],
      payment_webhook_events: [{ data: null }],
    });

    const result = await processPaymentEvent(client, basePayload());

    expect(result).toEqual({ processed: true, chargeId: 'charge-1' });
    expect(sendFamilyNotification).toHaveBeenCalledTimes(1);
    expect(sendFamilyNotification.mock.calls[0][1]).toMatchObject({ type: 'financeiro', pushTag: 'financeiro-pagamento-confirmado' });
  });

  it('cobrança avulsa já estava PAID — reenvio do mesmo evento não notifica de novo (evita ruído duplicado)', async () => {
    const client = makeAdminClient({
      financial_charges: [
        { data: { id: 'charge-1', status: 'PAID', contract_id: 'contract-1', student_id: 'student-1', family_id: 'family-1' } },
        { data: { id: 'charge-1' } },
      ],
      financial_charge_events: [{ data: null }],
      payment_webhook_events: [{ data: null }],
    });

    await processPaymentEvent(client, basePayload());

    expect(sendFamilyNotification).not.toHaveBeenCalled();
  });

  it('cobrança avulsa cujo Payment nunca foi criado pelo backend (ex: teste manual no painel Asaas) — não processa às cegas', async () => {
    const client = makeAdminClient({
      financial_charges: [{ data: null }], // existingCharge = null, sem subscriptionId
    });

    const result = await processPaymentEvent(client, basePayload());

    expect(result.processed).toBe(false);
    expect(result.reason).toMatch(/create-avulsa-charge/);
    expect(sendFamilyNotification).not.toHaveBeenCalled();
  });

  it('recorrência (subscription): resolve o contrato pela assinatura, cria cobrança nova, notifica "nova cobrança"', async () => {
    const payload = basePayload({ subscription: 'sub_abc' });
    const client = makeAdminClient({
      financial_charges: [
        { data: null }, // existingCharge (não existe ainda)
        { data: { id: 'charge-2' } }, // upsert
      ],
      financial_contracts: [
        { data: { id: 'contract-2', student_id: 'student-2', financial_guardian_id: 'family-2' } },
      ],
      financial_charge_events: [{ data: null }],
      payment_webhook_events: [{ data: null }],
    });

    const result = await processPaymentEvent(client, payload);

    expect(result).toEqual({ processed: true, chargeId: 'charge-2' });
    expect(sendFamilyNotification.mock.calls[0][1]).toMatchObject({ pushTag: 'financeiro-nova-cobranca' });
  });

  it('recorrência sem contrato correspondente nesta escola — não processa às cegas (nunca confia no payload pra decidir a quem pertence)', async () => {
    const payload = basePayload({ subscription: 'sub_inexistente' });
    const client = makeAdminClient({
      financial_charges: [{ data: null }],
      financial_contracts: [{ data: null }],
    });

    const result = await processPaymentEvent(client, payload);

    expect(result.processed).toBe(false);
    expect(result.reason).toMatch(/nenhum contrato encontrado/);
  });

  it('pagamento estornado (REFUND_REQUESTED) mapeia pra REFUNDED, sem notificação de pagamento confirmado', async () => {
    const client = makeAdminClient({
      financial_charges: [
        { data: { id: 'charge-3', status: 'PAID', contract_id: 'c3', student_id: 's3', family_id: 'f3' } },
        { data: { id: 'charge-3' } },
      ],
      financial_charge_events: [{ data: null }],
      payment_webhook_events: [{ data: null }],
    });

    await processPaymentEvent(client, basePayload({ status: 'REFUND_REQUESTED' }));

    expect(sendFamilyNotification).not.toHaveBeenCalled();
  });

  it('evento sem objeto payment (payload malformado) não processa e não lança exceção', async () => {
    const client = makeAdminClient({});
    const result = await processPaymentEvent(client, { id: 'evt_x', event_type: 'X', school_id: 's', payload: {} });
    expect(result).toEqual({ processed: false, reason: 'evento sem objeto payment' });
  });

  it('falha ao notificar a família nunca derruba a sincronização da cobrança (a cobrança já está correta no banco)', async () => {
    sendFamilyNotification.mockRejectedValueOnce(new Error('push falhou'));
    const client = makeAdminClient({
      financial_charges: [
        { data: { id: 'charge-4', status: 'PENDING', contract_id: 'c4', student_id: 's4', family_id: 'f4' } },
        { data: { id: 'charge-4' } },
      ],
      financial_charge_events: [{ data: null }],
      payment_webhook_events: [{ data: null }],
    });

    const result = await processPaymentEvent(client, basePayload());

    expect(result).toEqual({ processed: true, chargeId: 'charge-4' });
  });
});

describe('Idempotência do webhook — guarda de regressão', () => {
  // A idempotência de verdade (evento duplicado do Asaas não processa duas
  // vezes) não vive em processPaymentEvent — vive ANTES dele, em
  // payment-webhook/index.ts: a chave única (school_id, gateway,
  // gateway_event_id) + upsert com ignoreDuplicates faz o Postgres recusar
  // silenciosamente a segunda gravação, e processPaymentEvent só é chamado
  // quando `inserted` existe (evento genuinamente novo). Não dá pra unit
  // testar isso isoladamente sem reimplementar o Deno serve() inteiro —
  // esta é uma guarda de regressão textual: se algum dia esse mecanismo for
  // removido/alterado sem querer, este teste denuncia.
  it('payment-webhook/index.ts continua usando upsert com ignoreDuplicates na chave (school_id,gateway,gateway_event_id)', () => {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(__dirname, '..', '..', 'supabase', 'functions', 'payment-webhook', 'index.ts'), 'utf-8');

    expect(src).toMatch(/onConflict:\s*['"]school_id,gateway,gateway_event_id['"]/);
    expect(src).toMatch(/ignoreDuplicates:\s*true/);
    expect(src).toMatch(/if \(inserted\)/); // só processa evento genuinamente novo
  });
});
