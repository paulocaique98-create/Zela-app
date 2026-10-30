import { describe, it, expect } from 'vitest';
import { buildInvoiceSettings } from '../../supabase/functions/_shared/nfseSettings.ts';

const base = {
  ativo: true,
  municipal_service_id: '1.01',
  municipal_service_name: 'Ensino regular',
  observacoes: null,
  iss_percent: 2,
  retain_iss: false,
  pis_percent: 0,
  cofins_percent: 0,
  csll_percent: 0,
  inss_percent: 0,
  ir_percent: 0,
  aliquotas_confirmadas_em: '2026-11-26T12:00:00Z',
};

describe('buildInvoiceSettings', () => {
  it('monta o corpo com emissão na confirmação do pagamento', () => {
    const r = buildInvoiceSettings(base);
    expect(r.ok).toBe(true);
    expect(r.body.effectiveDatePeriod).toBe('ON_PAYMENT_CONFIRMATION');
    expect(r.body.taxes.iss).toBe(2);
    expect(r.body.observations).toBe('Mensalidade escolar');
  });

  it('recusa sem configuração, inativa, sem serviço, sem ISS, sem confirmação ou alíquota inválida', () => {
    expect(buildInvoiceSettings(null).ok).toBe(false);
    expect(buildInvoiceSettings({ ...base, ativo: false }).ok).toBe(false);
    expect(buildInvoiceSettings({ ...base, municipal_service_id: ' ' }).ok).toBe(false);
    expect(buildInvoiceSettings({ ...base, iss_percent: null }).ok).toBe(false);
    expect(buildInvoiceSettings({ ...base, aliquotas_confirmadas_em: null }).ok).toBe(false);
    expect(buildInvoiceSettings({ ...base, ir_percent: 101 }).ok).toBe(false);
  });

  it('usa a observação da escola quando existe', () => {
    expect(buildInvoiceSettings({ ...base, observacoes: ' Ensino fundamental ' }).body.observations).toBe('Ensino fundamental');
  });
});
