import { describe, it, expect } from 'vitest';
import {
  calcularIntervalo, deveEntrarEmRepouso, foraDoHorario, normalizarConfig,
  avaliarSobrecarga, registrarInferencia, JANELA_INFERENCIAS,
  INTERVALO_ATIVO_MS, INTERVALO_OCIOSO_MS, FATOR_SOBRECARGA, CONFIG_PADRAO,
} from './energiaDoTotem';

describe('calcularIntervalo', () => {
  it('rosto recente = rápido; sem rosto há >5s = lento', () => {
    expect(calcularIntervalo({ agora: 1000, ultimoRostoEm: 900 })).toBe(INTERVALO_ATIVO_MS);
    expect(calcularIntervalo({ agora: 10000, ultimoRostoEm: 1000 })).toBe(INTERVALO_OCIOSO_MS);
    expect(calcularIntervalo({ agora: 10000, ultimoRostoEm: null })).toBe(INTERVALO_OCIOSO_MS);
  });
  it('sobrecarga multiplica o intervalo', () => {
    expect(calcularIntervalo({ agora: 1000, ultimoRostoEm: 900, sobrecarregado: true })).toBe(INTERVALO_ATIVO_MS * FATOR_SOBRECARGA);
  });
});

describe('avaliarSobrecarga', () => {
  const cheia = (ms) => Array(JANELA_INFERENCIAS).fill(ms);
  it('ignora amostra incompleta', () => {
    expect(avaliarSobrecarga([900, 900], false)).toBe(false);
  });
  it('liga acima do limiar e só desliga com histerese', () => {
    expect(avaliarSobrecarga(cheia(500), false)).toBe(true);
    expect(avaliarSobrecarga(cheia(350), true)).toBe(true);
    expect(avaliarSobrecarga(cheia(250), true)).toBe(false);
  });
  it('registrarInferencia mantém só a janela', () => {
    let d = [];
    for (let i = 0; i < 20; i++) d = registrarInferencia(d, i);
    expect(d).toHaveLength(JANELA_INFERENCIAS);
    expect(d[d.length - 1]).toBe(19);
  });
});

describe('deveEntrarEmRepouso', () => {
  const config = { ...CONFIG_PADRAO, repousoMin: 3 };
  it('só após o tempo configurado', () => {
    expect(deveEntrarEmRepouso({ agora: 170000, ultimaAtividadeEm: 0, config })).toBe(false);
    expect(deveEntrarEmRepouso({ agora: 180000, ultimaAtividadeEm: 0, config })).toBe(true);
  });
  it('sobrecarga antecipa para 1 min', () => {
    expect(deveEntrarEmRepouso({ agora: 60000, ultimaAtividadeEm: 0, config, sobrecarregado: true })).toBe(true);
  });
  it('ocupado ou desativado (0) nunca entra', () => {
    expect(deveEntrarEmRepouso({ agora: 9e6, ultimaAtividadeEm: 0, config, ocupado: true })).toBe(false);
    expect(deveEntrarEmRepouso({ agora: 9e6, ultimaAtividadeEm: 0, config: { repousoMin: 0 } })).toBe(false);
  });
});

describe('foraDoHorario', () => {
  const cfg = { horarioInicio: '06:00', horarioFim: '19:00' };
  const h = (hh, mm = 0) => new Date(2026, 10, 12, hh, mm);
  it('janela normal', () => {
    expect(foraDoHorario(cfg, h(5, 59))).toBe(true);
    expect(foraDoHorario(cfg, h(6))).toBe(false);
    expect(foraDoHorario(cfg, h(18, 59))).toBe(false);
    expect(foraDoHorario(cfg, h(19))).toBe(true);
  });
  it('janela que vira a meia-noite', () => {
    const noite = { horarioInicio: '22:00', horarioFim: '05:00' };
    expect(foraDoHorario(noite, h(23))).toBe(false);
    expect(foraDoHorario(noite, h(12))).toBe(true);
  });
  it('sem horário = nunca fora', () => {
    expect(foraDoHorario(CONFIG_PADRAO, h(3))).toBe(false);
  });
});

describe('normalizarConfig', () => {
  it('descarta valores inválidos', () => {
    expect(normalizarConfig({ repousoMin: -5, horarioInicio: '25:00', horarioFim: '19:00' })).toEqual(CONFIG_PADRAO);
    expect(normalizarConfig('lixo')).toEqual(CONFIG_PADRAO);
  });
  it('aceita valores válidos', () => {
    expect(normalizarConfig({ repousoMin: 5, horarioInicio: '06:00', horarioFim: '19:00' }))
      .toEqual({ repousoMin: 5, horarioInicio: '06:00', horarioFim: '19:00' });
  });
});
