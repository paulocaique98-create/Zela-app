import { describe, it, expect, vi } from 'vitest';
import { buildInvoiceAvulsa } from '../../supabase/functions/_shared/nfseSettings.ts';
import { agendarNotaAvulsa } from '../../supabase/functions/_shared/nfseAvulsa.ts';

const CONFIG = {
  ativo: true, municipal_service_id: '73766', municipal_service_name: '08.01.01 Ensino', observacoes: null, iss_percent: 5, retain_iss: false,
  pis_percent: 0, cofins_percent: 0, csll_percent: 0, inss_percent: 0, ir_percent: 0, aliquotas_confirmadas_em: '2026-11-26T12:00:00Z', emitir_avulsas: true,
};
const ENTRADA = { paymentId: 'pay_1', dueDate: '2026-12-10', descricao: 'Taxa de matrícula' };

function fakeDb({ features = { nfse: true }, config = CONFIG } = {}) {
  const gravado = {};
  const from = (tabela) => {
    const b = {
      select: () => b, eq: () => b,
      maybeSingle: async () => ({ data: tabela === 'schools' ? { features_enabled: features } : config, error: null }),
      upsert: async (row) => { gravado[`${tabela}_upsert`] = row; return { error: null }; },
      insert: async (row) => { gravado[`${tabela}_insert`] = row; return { error: null }; },
    };
    return b;
  };
  return { from, gravado };
}

describe('buildInvoiceAvulsa', () => {
  it('monta o corpo com data literal igual ao vencimento', () => {
    const r = buildInvoiceAvulsa(CONFIG, ENTRADA);
    expect(r.ok).toBe(true);
    expect(r.body).toMatchObject({ payment: 'pay_1', effectiveDate: '2026-12-10', municipalServiceId: '73766' });
  });
  it('recusa com a opção desligada, data inválida ou configuração incompleta', () => {
    expect(buildInvoiceAvulsa({ ...CONFIG, emitir_avulsas: false }, ENTRADA).ok).toBe(false);
    expect(buildInvoiceAvulsa(CONFIG, { ...ENTRADA, dueDate: '10/12/2026' }).ok).toBe(false);
    expect(buildInvoiceAvulsa({ ...CONFIG, aliquotas_confirmadas_em: null }, ENTRADA).ok).toBe(false);
  });
});

describe('agendarNotaAvulsa', () => {
  const p = { schoolId: 's1', chargeId: 'c1', paymentId: 'pay_1', dueDate: '2026-12-10', descricao: 'Taxa' };

  it('sucesso: agenda no Asaas e grava a nota como SCHEDULED', async () => {
    const asaas = { createInvoice: vi.fn().mockResolvedValue({ id: 'inv_abcde' }) };
    const db = fakeDb();
    const r = await agendarNotaAvulsa(db, asaas, p);
    expect(r.agendada).toBe(true);
    expect(db.gravado.financial_invoices_upsert).toMatchObject({ school_id: 's1', charge_id: 'c1', gateway_invoice_id: 'inv_abcde', status: 'SCHEDULED' });
  });

  it('módulo ou opção desligados: não chama o Asaas', async () => {
    const asaas = { createInvoice: vi.fn() };
    expect((await agendarNotaAvulsa(fakeDb({ features: {} }), asaas, p)).agendada).toBe(false);
    expect((await agendarNotaAvulsa(fakeDb({ config: { ...CONFIG, emitir_avulsas: false } }), asaas, p)).agendada).toBe(false);
    expect(asaas.createInvoice).not.toHaveBeenCalled();
  });

  it('falha do Asaas: não lança e registra o motivo na trilha da cobrança', async () => {
    const asaas = { createInvoice: vi.fn().mockRejectedValue(new Error('Você precisa informar suas informações fiscais')) };
    const db = fakeDb();
    const r = await agendarNotaAvulsa(db, asaas, p);
    expect(r.agendada).toBe(false);
    expect(db.gravado.financial_charge_events_insert).toMatchObject({ charge_id: 'c1', event_type: 'nfse_agendamento_falhou' });
  });
});
