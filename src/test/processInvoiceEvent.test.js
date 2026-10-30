import { describe, it, expect, vi } from 'vitest';

vi.mock('../../supabase/functions/_shared/notifyAdmins.ts', () => ({ notifyAdmins: vi.fn().mockResolvedValue(undefined) }));
const asaasInvoices = new Map();
vi.mock('../../supabase/functions/_shared/asaas.ts', () => ({
  createAsaasClient: () => ({ getInvoice: async (id) => asaasInvoices.get(id) }),
}));

const { statusDaNota, ehEventoFiscal, motivoDoErro, processInvoiceEvent } =
  await import('../../supabase/functions/_shared/processInvoiceEvent.ts');
const { notifyAdmins } = await import('../../supabase/functions/_shared/notifyAdmins.ts');

describe('eventos fiscais', () => {
  it('reconhece só eventos INVOICE_', () => {
    expect(ehEventoFiscal('INVOICE_ERROR')).toBe(true);
    expect(ehEventoFiscal('PAYMENT_RECEIVED')).toBe(false);
  });

  it('o status vem do Asaas quando conhecido, senão do evento; erro sempre vence', () => {
    expect(statusDaNota('INVOICE_UPDATED', 'AUTHORIZED')).toBe('AUTHORIZED');
    expect(statusDaNota('INVOICE_AUTHORIZED', 'PENDING')).toBe('AUTHORIZED');
    expect(statusDaNota('INVOICE_ERROR', 'SCHEDULED')).toBe('ERROR');
  });

  it('acha o motivo do erro em nomes prováveis', () => {
    expect(motivoDoErro({ statusDescription: ' Cadastro incompleto ' })).toBe('Cadastro incompleto');
    expect(motivoDoErro({ error: { message: 'x' } })).toBe('x');
    expect(motivoDoErro({})).toBeNull();
  });
});

function fakeClient({ anterior = null } = {}) {
  const gravado = {};
  const tabela = (nome) => {
    const b = {
      select: () => b, eq: () => b,
      maybeSingle: async () => ({ data: nome === 'financial_charges' ? { id: 'c1', contract_id: 'k1' } : anterior }),
      upsert: async (row) => { gravado[nome] = row; return { error: null }; },
      insert: async (row) => { gravado[`${nome}_ins`] = row; return { error: null }; },
    };
    return b;
  };
  return { gravado, rpc: async () => ({ data: 'chave', error: null }), from: tabela };
}

describe('processInvoiceEvent', () => {
  it('grava a nota com os dados do Asaas, ligada à cobrança, ignorando o conteúdo do evento', async () => {
    asaasInvoices.set('inv_12345', { status: 'AUTHORIZED', number: '99', pdfUrl: 'https://x/p.pdf', xmlUrl: 'javascript:1', value: 450.5, payment: 'pay_1' });
    const db = fakeClient();
    const r = await processInvoiceEvent(db, { id: 'e1', school_id: 's1', event_type: 'INVOICE_AUTHORIZED', payload: { invoice: { id: 'inv_12345', status: 'ERROR', number: 'forjado' } } });
    expect(r.processed).toBe(true);
    expect(db.gravado.financial_invoices).toMatchObject({ school_id: 's1', charge_id: 'c1', contract_id: 'k1', status: 'AUTHORIZED', invoice_number: '99', value_cents: 45050, xml_url: null });
    expect(db.gravado.financial_charge_events_ins.event_type).toBe('nfse_authorized');
  });

  it('avisa a Gestão uma vez ao entrar em erro', async () => {
    asaasInvoices.set('inv_err01', { status: 'ERROR', statusDescription: 'Inscrição inválida', payment: 'pay_1' });
    notifyAdmins.mockClear();
    const ev = { id: 'e2', school_id: 's1', event_type: 'INVOICE_ERROR', payload: { invoice: { id: 'inv_err01' } } };
    const db = fakeClient();
    await processInvoiceEvent(db, ev);
    expect(db.gravado.financial_invoices.error_reason).toBe('Inscrição inválida');
    expect(notifyAdmins).toHaveBeenCalledTimes(1);
    await processInvoiceEvent(fakeClient({ anterior: { status: 'ERROR' } }), ev);
    expect(notifyAdmins).toHaveBeenCalledTimes(1);
  });

  it('rejeita evento sem id da nota', async () => {
    const r = await processInvoiceEvent(fakeClient(), { school_id: 's1', event_type: 'INVOICE_ERROR', payload: {} });
    expect(r.processed).toBe(false);
  });
});
