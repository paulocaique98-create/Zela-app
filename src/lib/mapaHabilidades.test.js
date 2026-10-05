import { describe, it, expect } from 'vitest';
import {
  periodoAtual, situacaoDoAluno, montarFila, progressoDaFila, indiceInicial, podeAvancar,
  embaralharComSemente, lerCsvHabilidades, validarHabilidade, formatFaixa, TODAS_AREAS,
} from './mapaHabilidades';

const HOJE = new Date('2026-10-05T12:00:00');
const P2 = { ano: 2026, semestre: 2 };

// Nascimentos que, em 05/10/2026, dão 14, 20 e 30 meses.
const bebe14 = { id: 'a1', name: 'Ana', birth_date: '2025-08-05' };
const bebe20 = { id: 'a2', name: 'Bia', birth_date: '2025-02-05' };
const crianca30 = { id: 'a3', name: 'Caio', birth_date: '2024-04-05' };
const semData = { id: 'a4', name: 'Duda', birth_date: null };

const chinelo = { id: 'h1', area: 'Vida Prática', descricao: 'Colocar o chinelo', idade_min_meses: 12, idade_max_meses: 18, ordem: 1, ativa: true };
const amarrar = { id: 'h2', area: 'Vida Prática', descricao: 'Amarrar o sapato', idade_min_meses: 24, idade_max_meses: 36, ordem: 2, ativa: true };
const letras = { id: 'h3', area: 'Linguagem', descricao: 'Reconhecer letras', idade_min_meses: 12, idade_max_meses: 36, ordem: 1, ativa: true };

const reg = (student_id, habilidade_id, situacao, ano = 2026, semestre = 2) => ({ student_id, habilidade_id, situacao, ano, semestre });

describe('periodoAtual', () => {
  it('janeiro a junho é 1º semestre, julho a dezembro é 2º', () => {
    expect(periodoAtual(new Date('2026-06-30T10:00:00'))).toEqual({ ano: 2026, semestre: 1 });
    expect(periodoAtual(new Date('2026-07-01T10:00:00'))).toEqual({ ano: 2026, semestre: 2 });
  });
});

describe('situacaoDoAluno', () => {
  const base = (aluno, registros = []) => situacaoDoAluno({ habilidade: chinelo, aluno, registros, periodo: P2, hoje: HOJE });

  it('entra quem está na faixa de idade e fica de fora quem não está', () => {
    expect(base(bebe14).elegivel).toBe(true);
    expect(base(bebe20).elegivel).toBe(false);
    expect(base(crianca30).elegivel).toBe(false);
  });

  it('sem data de nascimento não entra', () => {
    expect(base(semData).elegivel).toBe(false);
  });

  it('adquirido em semestre anterior nunca volta', () => {
    const r = base(bebe14, [reg('a1', 'h1', 'adquirido', 2026, 1)]);
    expect(r.elegivel).toBe(false);
  });

  it('adquirido no mesmo semestre continua na lista para correção', () => {
    const r = base(bebe14, [reg('a1', 'h1', 'adquirido')]);
    expect(r.elegivel).toBe(true);
    expect(r.registro.situacao).toBe('adquirido');
  });

  it('passou da idade máxima mas ficou adquirindo antes: continua até adquirir', () => {
    const r = base(bebe20, [reg('a2', 'h1', 'adquirindo', 2026, 1)]);
    expect(r.elegivel).toBe(true);
    expect(r.registro).toBeNull();
  });

  it('passou da idade máxima sem registro anterior: não entra', () => {
    expect(base(bebe20, []).elegivel).toBe(false);
  });

  it('ignora registro de outra criança ou de outra habilidade', () => {
    const r = base(bebe14, [reg('a9', 'h1', 'adquirido', 2026, 1), reg('a1', 'h9', 'adquirido', 2026, 1)]);
    expect(r.elegivel).toBe(true);
  });
});

describe('montarFila', () => {
  const alunos = [bebe14, bebe20, crianca30];
  const montar = (extra = {}) => montarFila({
    habilidades: [chinelo, amarrar, letras], alunos, registros: [], periodo: P2, hoje: HOJE, semente: 'prof1', ...extra,
  });

  it('mostra só quem está na faixa e pula habilidade sem ninguém', () => {
    const fila = montar({ area: 'Vida Prática' });
    expect(fila.map(p => p.habilidade.id)).toEqual(['h1', 'h2']);
    expect(fila[0].itens.map(i => i.aluno.id)).toEqual(['a1']);
    expect(fila[1].itens.map(i => i.aluno.id)).toEqual(['a3']);
  });

  it('filtra por área', () => {
    const fila = montar({ area: 'Linguagem' });
    expect(fila.map(p => p.habilidade.id)).toEqual(['h3']);
    expect(fila[0].itens.map(i => i.aluno.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('desconsidera habilidade desativada', () => {
    const fila = montar({ habilidades: [{ ...chinelo, ativa: false }, letras] });
    expect(fila.some(p => p.habilidade.id === 'h1')).toBe(false);
  });

  it('todas as áreas: ordem sorteada, mas igual a cada recarga', () => {
    const a = montar({ area: TODAS_AREAS }).map(p => p.habilidade.id);
    const b = montar({ area: TODAS_AREAS }).map(p => p.habilidade.id);
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual(['h1', 'h2', 'h3']);
  });

  it('marca como completa quando todos da habilidade têm registro', () => {
    const fila = montar({ area: 'Vida Prática', registros: [reg('a1', 'h1', 'adquirindo')] });
    expect(fila[0].completa).toBe(true);
    expect(fila[1].completa).toBe(false);
  });
});

describe('progresso e navegação', () => {
  const alunos = [bebe14, bebe20, crianca30];
  const fila = (registros) => montarFila({
    habilidades: [chinelo, amarrar, letras], alunos, registros, periodo: P2, area: 'Linguagem', hoje: HOJE,
  });
  const filaVP = (registros) => montarFila({
    habilidades: [chinelo, amarrar], alunos, registros, periodo: P2, area: 'Vida Prática', hoje: HOJE,
  });

  it('calcula total, preenchidos e percentual', () => {
    const f = fila([reg('a1', 'h3', 'adquirindo')]);
    expect(progressoDaFila(f)).toEqual({ total: 3, preenchidos: 1, percentual: 33 });
  });

  it('fila vazia dá 0 por cento sem dividir por zero', () => {
    expect(progressoDaFila([])).toEqual({ total: 0, preenchidos: 0, percentual: 0 });
  });

  it('a seta fica bloqueada até preencher todos da habilidade', () => {
    const vazia = filaVP([]);
    expect(podeAvancar(vazia, 0)).toBe(false);
    const feita = filaVP([reg('a1', 'h1', 'adquirindo')]);
    expect(podeAvancar(feita, 0)).toBe(true);
    expect(podeAvancar(feita, 1)).toBe(false);
  });

  it('abre na primeira habilidade que falta, ou na última se tudo pronto', () => {
    expect(indiceInicial(filaVP([reg('a1', 'h1', 'adquirindo')]))).toBe(1);
    expect(indiceInicial(filaVP([reg('a1', 'h1', 'adquirindo'), reg('a3', 'h2', 'adquirido')]))).toBe(1);
    expect(indiceInicial([])).toBe(0);
  });
});

describe('embaralharComSemente', () => {
  it('não altera a lista original e é estável', () => {
    const lista = [1, 2, 3, 4, 5, 6];
    const a = embaralharComSemente(lista, 'x');
    expect(lista).toEqual([1, 2, 3, 4, 5, 6]);
    expect(a).toEqual(embaralharComSemente(lista, 'x'));
    expect([...a].sort()).toEqual(lista);
  });
});

describe('lerCsvHabilidades', () => {
  it('lê meses com ponto e vírgula', () => {
    const { itens, erros } = lerCsvHabilidades('area;habilidade;idade_min_meses;idade_max_meses\nVida Prática;Colocar o chinelo;12;18');
    expect(erros).toEqual([]);
    expect(itens).toEqual([{ area: 'Vida Prática', descricao: 'Colocar o chinelo', idade_min_meses: 12, idade_max_meses: 18, ordem: 1 }]);
  });

  it('lê anos com vírgula decimal e cabeçalho com acento', () => {
    const { itens } = lerCsvHabilidades('Área;Habilidade;idade_min_anos;idade_max_anos\nSensorial;"Encaixar, com cuidado";1,5;2');
    expect(itens[0]).toMatchObject({ descricao: 'Encaixar, com cuidado', idade_min_meses: 18, idade_max_meses: 24 });
  });

  it('aponta a linha de cada erro e aproveita as linhas boas', () => {
    const csv = [
      'area;habilidade;idade_min_meses;idade_max_meses',
      'Linguagem;Ok;12;24',
      ';Sem área;12;24',
      'Linguagem;Faixa invertida;30;24',
      'Linguagem;Ok;12;24',
      'Linguagem;Idade texto;abc;24',
    ].join('\n');
    const { itens, erros } = lerCsvHabilidades(csv);
    expect(itens).toHaveLength(1);
    expect(erros.map(e => e.linha)).toEqual([3, 4, 5, 6]);
  });

  it('rejeita cabeçalho incompleto', () => {
    const { itens, erros } = lerCsvHabilidades('area;habilidade\nLinguagem;x');
    expect(itens).toEqual([]);
    expect(erros[0].linha).toBe(1);
  });

  it('pede cabeçalho e uma linha', () => {
    expect(lerCsvHabilidades('').erros).toHaveLength(1);
  });
});

describe('validarHabilidade e formatFaixa', () => {
  const ok = { area: 'Linguagem', descricao: 'x', idade_min_meses: 12, idade_max_meses: 18 };
  it('aceita dados válidos', () => expect(validarHabilidade(ok)).toBe(''));
  it('recusa faixa invertida, área vazia e idade ausente', () => {
    expect(validarHabilidade({ ...ok, idade_min_meses: 20 })).not.toBe('');
    expect(validarHabilidade({ ...ok, area: ' ' })).not.toBe('');
    expect(validarHabilidade({ ...ok, idade_max_meses: NaN })).not.toBe('');
  });
  it('escreve a faixa sem hífen', () => {
    expect(formatFaixa(12, 18)).toBe('de 1 ano a 1 ano e 6 meses');
    expect(formatFaixa(6, 24)).toBe('de 6 meses a 2 anos');
  });
});

describe('mensagemErroMapa', () => {
  it('avisa que o banco ainda não tem as tabelas', async () => {
    const { mensagemErroMapa, mapaIndisponivel } = await import('./mapaHabilidades');
    expect(mapaIndisponivel({ code: 'PGRST205' })).toBe(true);
    expect(mapaIndisponivel({ code: '42P01' })).toBe(true);
    expect(mapaIndisponivel({ code: '42501' })).toBe(false);
    expect(mensagemErroMapa({ code: 'PGRST205' }, 'padrão')).toMatch(/ainda não foi ativado/);
    expect(mensagemErroMapa(new Error('rede'), 'padrão')).toBe('padrão');
    expect(mensagemErroMapa(null, 'padrão')).toBe('padrão');
  });
});
