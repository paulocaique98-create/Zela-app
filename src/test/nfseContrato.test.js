import { describe, it, expect, vi } from 'vitest';
import { configurarNotaDoContrato } from '../../supabase/functions/_shared/nfseContrato.ts';

const CONFIG_OK = {
  ativo: true, municipal_service_id: '1.01', municipal_service_name: 'Ensino', observacoes: null, iss_percent: 2, retain_iss: false,
  pis_percent: 0, cofins_percent: 0, csll_percent: 0, inss_percent: 0, ir_percent: 0, aliquotas_confirmadas_em: '2026-11-26T12:00:00Z',
};

function fakeDb({ features = { nfse: true }, config = CONFIG_OK } = {}) {
  const updates = [];
  const from = (tabela) => {
    const b = {
      select: () => b, eq: () => b,
      maybeSingle: async () => ({ data: tabela === 'schools' ? { features_enabled: features } : config, error: null }),
      update: (patch) => { updates.push(patch); return b; },
    };
    return b;
  };
  return { from, updates };
}

describe('configurarNotaDoContrato', () => {
  it('módulo desligado: não chama o Asaas', async () => {
    const asaas = { setInvoiceSettings: vi.fn() };
    const r = await configurarNotaDoContrato(fakeDb({ features: {} }), asaas, 's1', 'k1', 'sub_1');
    expect(r.configurada).toBe(false);
    expect(asaas.setInvoiceSettings).not.toHaveBeenCalled();
  });

  it('sem configuração ativa e confirmada: não chama o Asaas', async () => {
    const asaas = { setInvoiceSettings: vi.fn() };
    const r = await configurarNotaDoContrato(fakeDb({ config: { ...CONFIG_OK, aliquotas_confirmadas_em: null } }), asaas, 's1', 'k1', 'sub_1');
    expect(r.configurada).toBe(false);
    expect(asaas.setInvoiceSettings).not.toHaveBeenCalled();
  });

  it('sucesso: envia o corpo da escola e marca o contrato', async () => {
    const asaas = { setInvoiceSettings: vi.fn().mockResolvedValue({}) };
    const db = fakeDb();
    const r = await configurarNotaDoContrato(db, asaas, 's1', 'k1', 'sub_1');
    expect(r.configurada).toBe(true);
    expect(asaas.setInvoiceSettings).toHaveBeenCalledWith('sub_1', expect.objectContaining({ effectiveDatePeriod: 'ON_PAYMENT_CONFIRMATION' }));
    expect(db.updates[0]).toMatchObject({ nfse_erro: null });
  });

  it('falha do Asaas: não lança, guarda o motivo no contrato', async () => {
    const asaas = { setInvoiceSettings: vi.fn().mockRejectedValue(new Error('Certificado digital ausente')) };
    const db = fakeDb();
    const r = await configurarNotaDoContrato(db, asaas, 's1', 'k1', 'sub_1');
    expect(r).toEqual({ configurada: false, motivo: 'Certificado digital ausente' });
    expect(db.updates[0]).toEqual({ nfse_erro: 'Certificado digital ausente' });
  });
});
