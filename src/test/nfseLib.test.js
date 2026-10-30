import { describe, it, expect } from 'vitest';
import { lerPercentual, pendenciasDaEscola, montarConfigFiscal, rotuloDaNota, cepLimpo } from '../lib/nfse';

describe('nfse lib', () => {
  it('lê percentuais com vírgula e recusa valores inválidos', () => {
    expect(lerPercentual('2,5')).toBe(2.5);
    expect(lerPercentual('')).toBeNull();
    expect(lerPercentual('101')).toBeNaN();
    expect(lerPercentual('abc')).toBeNaN();
  });
  it('aponta o que falta no cadastro da escola', () => {
    expect(pendenciasDaEscola({ codigo_ibge: '3205309', inscricao_municipal: '123' })).toEqual([]);
    expect(pendenciasDaEscola({})).toHaveLength(2);
  });
  it('monta a configuração sem inventar ISS', () => {
    const base = { municipal_service_id: '1.01', municipal_service_name: 'Ensino', iss_percent: '', pis_percent: '' };
    expect(montarConfigFiscal(base, { confirmar: false, ativar: false }).iss_percent).toBeNull();
    expect(() => montarConfigFiscal(base, { confirmar: true, ativar: false })).toThrow(/ISS/);
    expect(montarConfigFiscal({ ...base, iss_percent: '2' }, { confirmar: true, ativar: true })).toMatchObject({ iss_percent: 2, pis_percent: 0 });
  });
  it('rotula notas', () => {
    expect(rotuloDaNota('ERROR').tom).toBe('alerta');
    expect(rotuloDaNota('X').texto).toBe('Em andamento');
    expect(cepLimpo('29.100-000')).toBe('29100000');
  });
});
