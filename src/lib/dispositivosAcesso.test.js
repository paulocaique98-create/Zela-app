import { describe, it, expect } from 'vitest';
import { conexaoDoDispositivo, tempoDesde, validarNovoDispositivo } from './dispositivosAcesso.js';

const agora = new Date('2026-11-11T12:00:00Z').getTime();
const ha = (s) => new Date(agora - s * 1000).toISOString();

describe('conexaoDoDispositivo', () => {
  it('sem last_seen_at: nunca conectou', () => {
    expect(conexaoDoDispositivo(null, agora)).toBe('nunca');
    expect(conexaoDoDispositivo('lixo', agora)).toBe('nunca');
  });
  it('até 2 min: online; depois: offline', () => {
    expect(conexaoDoDispositivo(ha(30), agora)).toBe('online');
    expect(conexaoDoDispositivo(ha(120), agora)).toBe('online');
    expect(conexaoDoDispositivo(ha(121), agora)).toBe('offline');
  });
});

describe('tempoDesde', () => {
  it('formata', () => {
    expect(tempoDesde(null, agora)).toBe('—');
    expect(tempoDesde(ha(10), agora)).toBe('agora há pouco');
    expect(tempoDesde(ha(300), agora)).toBe('há 5 min');
    expect(tempoDesde(ha(7200), agora)).toBe('há 2 h');
    expect(tempoDesde(ha(172800), agora)).toBe('há 2 d');
  });
});

describe('validarNovoDispositivo', () => {
  it('exige nome de 1 a 80 caracteres', () => {
    expect(validarNovoDispositivo({ name: '  ', model: 'iDFace' })).not.toBe('');
    expect(validarNovoDispositivo({ name: 'a'.repeat(81), model: 'iDFace' })).not.toBe('');
    expect(validarNovoDispositivo({ name: 'Portaria', model: 'iDFace' })).toBe('');
  });
  it('exige modelo da lista', () => {
    expect(validarNovoDispositivo({ name: 'Portaria', model: '' })).not.toBe('');
    expect(validarNovoDispositivo({ name: 'Portaria', model: 'Outro' })).not.toBe('');
  });
});
