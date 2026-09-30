import { describe, it, expect } from 'vitest';
import { montarDadosEscola } from './escolaForm';
import { pacoteAtual } from './modulosCatalogo';

const base = {
  formData: { name: 'Escola Teste', cnpj: '', razao_social: '', inscricao_municipal: '', email: 'a@b.com', phone: '', zip_code: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '', codigo_ibge: '', plan: 'basic', is_active: true, notes: '' },
  limits: { autorizados_por_responsavel: 2, autorizados_transporte: 1 },
  pedagogicalMethod: 'montessori',
  customClassLabel: '',
};

describe('Editar/Nova Escola (Portal do Dev) · o que é salvo', () => {
  it('editar nunca envia turmas nem módulos (senão apagaria as turmas e os módulos da escola)', () => {
    const dados = montarDadosEscola({ ...base, isNew: false });
    expect(dados).not.toHaveProperty('turmas');
    expect(dados).not.toHaveProperty('features_enabled');
    expect(dados).toMatchObject({ name: 'Escola Teste', pedagogical_method: 'montessori', custom_config: {}, limits: base.limits });
  });

  it('escola nova: sem turmas (a Gestão cadastra) e só com o plano base', () => {
    const dados = montarDadosEscola({ ...base, isNew: true });
    expect(dados).not.toHaveProperty('turmas');
    expect(pacoteAtual(dados.features_enabled)).toBe('essencial');
  });

  it('nome personalizado para "Turma" continua sendo salvo', () => {
    const dados = montarDadosEscola({ ...base, pedagogicalMethod: 'personalizado', customClassLabel: '  Agrupamento ', isNew: false });
    expect(dados.custom_config).toEqual({ terminology: { class: 'Agrupamento' } });
  });
});
