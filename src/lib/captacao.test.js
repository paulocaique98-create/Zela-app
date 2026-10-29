import { describe, it, expect } from 'vitest';
import { resumirFunil, filaPorTurma, linkWhatsapp, linkFormulario, diasSemContato, textoBusca, leadAberto } from './captacao';

describe('resumirFunil', () => {
  const linhas = [
    { origem: 'site', etapa: 'novo', total: 4 },
    { origem: 'site', etapa: 'visitou', total: 2 },
    { origem: 'indicacao', etapa: 'matriculado', total: 2 },
    { origem: 'indicacao', etapa: 'perdido', total: 1 },
    { origem: 'instagram', etapa: 'proposta', total: 1 },
  ];
  const r = resumirFunil(linhas);

  it('soma o total e a conversão sobre quem chegou', () => {
    expect(r.total).toBe(10);
    expect(r.matriculados).toBe(2);
    expect(r.conversao).toBe(20);
    expect(r.perdidos).toBe(1);
  });

  it('chegou ao menos até a etapa: perdido não conta como avanço', () => {
    const a = Object.fromEntries(r.alcancou.map(x => [x.id, x.total]));
    expect(a.novo).toBe(9);
    expect(a.visitou).toBe(5);
    expect(a.proposta).toBe(3);
    expect(a.matriculado).toBe(2);
  });

  it('agrupa por origem e ordena pela maior', () => {
    expect(r.porOrigem.map(o => o.origem)).toEqual(['site', 'indicacao', 'instagram']);
    expect(r.porOrigem[1]).toMatchObject({ total: 3, matriculados: 2, conversao: 66.7 });
  });

  it('sem leads, a conversão é nula e não divide por zero', () => {
    expect(resumirFunil([]).conversao).toBeNull();
    expect(resumirFunil(null).total).toBe(0);
  });
});

describe('filaPorTurma', () => {
  it('numera o lugar só de quem aguarda, na ordem da posição', () => {
    const f = filaPorTurma([
      { id: 'c', turma: 'Infantil 2', posicao: 3, status: 'aguardando' },
      { id: 'a', turma: 'Infantil 2', posicao: 1, status: 'chamada' },
      { id: 'b', turma: 'Infantil 2', posicao: 2, status: 'aguardando' },
      { id: 'd', turma: 'Infantil 10', posicao: 1, status: 'aguardando' },
    ]);
    expect(f.map(t => t.turma)).toEqual(['Infantil 2', 'Infantil 10']);
    expect(f[0].aguardando).toBe(2);
    expect(f[0].itens.map(i => [i.id, i.lugar])).toEqual([['a', null], ['b', 1], ['c', 2]]);
  });
});

describe('contato e link', () => {
  it('WhatsApp: acrescenta 55 e recusa número inválido', () => {
    expect(linkWhatsapp('(11) 99999-0000')).toBe('https://wa.me/5511999990000');
    expect(linkWhatsapp('+55 11 99999-0000')).toBe('https://wa.me/5511999990000');
    expect(linkWhatsapp('1234')).toBeNull();
    expect(linkWhatsapp(null)).toBeNull();
  });

  it('link do formulário leva o código e só marca a origem quando não é o site', () => {
    expect(linkFormulario('ZL001')).toContain('/quero-conhecer?codigo=ZL001');
    expect(linkFormulario('ZL001')).not.toContain('origem');
    expect(linkFormulario('ZL001', 'instagram')).toContain('origem=instagram');
  });

  it('dias sem contato usa a última interação, ou a chegada do lead', () => {
    const agora = new Date('2026-11-10T12:00:00Z').getTime();
    expect(diasSemContato({ created_at: '2026-11-01T12:00:00Z' }, null, agora)).toBe(9);
    expect(diasSemContato({ created_at: '2026-11-01T12:00:00Z' }, '2026-11-08T12:00:00Z', agora)).toBe(2);
  });

  it('busca ignora acento e caixa; lead fechado não está aberto', () => {
    expect(textoBusca('  João ')).toBe('joao');
    expect(leadAberto({ etapa: 'proposta' })).toBe(true);
    expect(leadAberto({ etapa: 'perdido' })).toBe(false);
    expect(leadAberto({ etapa: 'matriculado' })).toBe(false);
  });
});
