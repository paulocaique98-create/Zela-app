import { describe, it, expect } from 'vitest';
import {
  validarPlano, validarAnexo, segundaDaSemana, semanaAtual, somarDias, agruparPorSemana,
  duplicarPlano, podeEditar, planoVazio,
} from './planoAula';

const plano = (extra = {}) => ({ ...planoVazio('2026-11-02', '2026-11-06'), turma: 'Nido', ...extra });

describe('datas do plano de aula', () => {
  it('acha a segunda-feira da semana, inclusive no domingo', () => {
    expect(segundaDaSemana('2026-11-04')).toBe('2026-11-02');
    expect(segundaDaSemana('2026-11-08')).toBe('2026-11-02');
    expect(segundaDaSemana('2026-11-02')).toBe('2026-11-02');
  });
  it('semana atual vai de segunda a sexta', () => {
    expect(semanaAtual('2026-11-05')).toEqual({ inicio: '2026-11-02', fim: '2026-11-06' });
  });
  it('soma dias atravessando o mês', () => {
    expect(somarDias('2026-11-28', 7)).toBe('2026-12-05');
  });
});

describe('validarPlano', () => {
  it('rascunho aceita plano incompleto', () => {
    expect(validarPlano(plano())).toBe('');
  });
  it('exige turma e período coerente', () => {
    expect(validarPlano(plano({ turma: ' ' }))).toMatch(/turma/i);
    expect(validarPlano(plano({ periodo_fim: '2026-11-01' }))).toMatch(/antes do início/);
  });
  it('envio exige objetivos e conteúdo', () => {
    expect(validarPlano(plano(), { envio: true })).toMatch(/objetivos/);
    expect(validarPlano(plano({ objetivos: 'a' }), { envio: true })).toMatch(/conteúdo/);
    expect(validarPlano(plano({ objetivos: 'a', conteudo: 'b' }), { envio: true })).toBe('');
  });
  it('recusa texto acima do limite', () => {
    expect(validarPlano(plano({ conteudo: 'x'.repeat(4001) }))).toMatch(/4000/);
  });
});

describe('anexos', () => {
  it('aceita pdf e imagem pequenos, recusa o resto', () => {
    expect(validarAnexo({ type: 'application/pdf', size: 1000 })).toBe('');
    expect(validarAnexo({ type: 'application/zip', size: 1000 })).not.toBe('');
    expect(validarAnexo({ type: 'image/png', size: 11 * 1024 * 1024 })).not.toBe('');
    expect(validarAnexo(null)).not.toBe('');
  });
});

describe('lista e duplicação', () => {
  it('agrupa por semana, mais recente primeiro', () => {
    const g = agruparPorSemana([
      { id: 1, turma: 'B', periodo_inicio: '2026-10-26' },
      { id: 2, turma: 'A', periodo_inicio: '2026-11-03' },
      { id: 3, turma: 'A', periodo_inicio: '2026-11-04' },
    ]);
    expect(g.map(x => x.segunda)).toEqual(['2026-11-02', '2026-10-26']);
    expect(g[0].itens).toHaveLength(2);
  });
  it('duplicar avança 7 dias, copia o conteúdo e não leva status nem comentário', () => {
    const copia = duplicarPlano({ ...plano({ objetivos: 'o', atribuicao_id: 'x' }), id: 'p', status: 'aprovado', comentario_coordenacao: 'ok' });
    expect(copia.periodo_inicio).toBe('2026-11-09');
    expect(copia.periodo_fim).toBe('2026-11-13');
    expect(copia.objetivos).toBe('o');
    expect(copia.atribuicao_id).toBe('x');
    expect(copia.id).toBeUndefined();
    expect(copia.status).toBeUndefined();
    expect(copia.comentario_coordenacao).toBeUndefined();
  });
  it('só rascunho e devolvido editam', () => {
    expect(podeEditar({ status: 'rascunho' })).toBe(true);
    expect(podeEditar({ status: 'devolvido' })).toBe(true);
    expect(podeEditar({ status: 'enviado' })).toBe(false);
    expect(podeEditar({ status: 'aprovado' })).toBe(false);
  });
});
