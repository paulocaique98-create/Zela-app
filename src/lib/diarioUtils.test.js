import { describe, it, expect } from 'vitest';
import {
  splitCardapioItens,
  joinWithE,
  mealAsksComeuTudo,
  normalizeItemServido,
  formatRefeicaoTexto,
  formatSonoTexto,
  formatEvacuacaoTexto,
} from './diarioUtils';

describe('splitCardapioItens', () => {
  it('retorna [] pra entrada vazia/nula', () => {
    expect(splitCardapioItens('')).toEqual([]);
    expect(splitCardapioItens(null)).toEqual([]);
    expect(splitCardapioItens(undefined)).toEqual([]);
  });

  it('separa por vírgula e "e" no fim (caso mais comum)', () => {
    expect(splitCardapioItens('Arroz, feijão e repolho')).toEqual(['Arroz', 'feijão', 'repolho']);
  });

  it('separa por "+" — bug real relatado pelo usuário', () => {
    expect(splitCardapioItens('Maçã + Pãozinho caseiro com pastinha de grão de bico'))
      .toEqual(['Maçã', 'Pãozinho caseiro com pastinha de grão de bico']);
  });

  it('separa por "/" — variação real usada no cardápio da escola', () => {
    expect(splitCardapioItens('Arroz branco / Feijão')).toEqual(['Arroz branco', 'Feijão']);
  });

  it('separa "e" mesmo quando não é o último pedaço da frase', () => {
    expect(splitCardapioItens('Arroz branco / Feijão, Filé de Frango Acebolado, Brócolis e Chuchu Cozidos/ Alface'))
      .toEqual(['Arroz branco', 'Feijão', 'Filé de Frango Acebolado', 'Brócolis', 'Chuchu Cozidos', 'Alface']);
  });

  it('não separa "de" (dentro de uma palavra) como se fosse o conectivo "e"', () => {
    expect(splitCardapioItens('Filé de Frango')).toEqual(['Filé de Frango']);
  });

  it('ignora espaços em branco e itens vazios entre separadores', () => {
    expect(splitCardapioItens('Arroz,  , feijão')).toEqual(['Arroz', 'feijão']);
  });
});

describe('joinWithE', () => {
  it('retorna string vazia pra lista vazia/nula', () => {
    expect(joinWithE([])).toBe('');
    expect(joinWithE(null)).toBe('');
  });

  it('retorna o item único sem conectivo', () => {
    expect(joinWithE(['Arroz'])).toBe('Arroz');
  });

  it('junta 2 itens com "e"', () => {
    expect(joinWithE(['Arroz', 'Feijão'])).toBe('Arroz e Feijão');
  });

  it('junta 3+ itens com vírgula e "e" antes do último', () => {
    expect(joinWithE(['Arroz', 'Feijão', 'Salada'])).toBe('Arroz, Feijão e Salada');
  });
});

describe('mealAsksComeuTudo', () => {
  it('Almoço e Jantar pedem "comeu tudo"', () => {
    expect(mealAsksComeuTudo('Almoço')).toBe(true);
    expect(mealAsksComeuTudo('Jantar')).toBe(true);
  });

  it('Desjejum e Lanche NÃO pedem "comeu tudo"', () => {
    expect(mealAsksComeuTudo('Desjejum')).toBe(false);
    expect(mealAsksComeuTudo('Lanche')).toBe(false);
  });
});

describe('normalizeItemServido', () => {
  it('converte string simples (formato antigo) pra { nome, quantidade: "" }', () => {
    expect(normalizeItemServido('Arroz')).toEqual({ nome: 'Arroz', quantidade: '' });
  });

  it('mantém objeto já no formato atual', () => {
    expect(normalizeItemServido({ nome: 'Arroz', quantidade: '1 xícara' })).toEqual({ nome: 'Arroz', quantidade: '1 xícara' });
  });

  it('preenche quantidade vazia quando ausente no objeto', () => {
    expect(normalizeItemServido({ nome: 'Arroz' })).toEqual({ nome: 'Arroz', quantidade: '' });
  });
});

describe('formatRefeicaoTexto', () => {
  it('retorna string vazia pra entrada nula', () => {
    expect(formatRefeicaoTexto(null)).toBe('');
  });

  it('Desjejum/Lanche usa "Comeu X." numa linha só, sem "comeu tudo"', () => {
    const texto = formatRefeicaoTexto({
      refeicao: 'Desjejum',
      itens_servidos: [{ nome: 'Laranja', quantidade: '' }, { nome: 'Pãozinho de batata doce', quantidade: '' }],
      comeu_tudo: null,
      repetiu: false,
    });
    expect(texto).toBe('Comeu Laranja e Pãozinho de batata doce.');
  });

  it('Almoço/Jantar usa "Serviu-se com X." com observações DENTRO da frase e cada frase em uma linha', () => {
    const texto = formatRefeicaoTexto({
      refeicao: 'Almoço',
      itens_servidos: [
        { nome: 'Arroz branco', quantidade: '' },
        { nome: 'Almondegas bovina', quantidade: '' },
        { nome: 'Lentilha', quantidade: '' },
        { nome: 'Purê de Abóbora', quantidade: '' },
        { nome: 'Salada de Pepino com tomate', quantidade: '' },
      ],
      comeu_tudo: false,
      observacao_recusa: 'Lentilha e salada de pepino com tomate',
      repetiu: true,
      vezes_repetiu: 1,
      observacao_repeticao: 'Arroz, almondegas e Purê de Abobora',
    });
    expect(texto).toBe(
      'Serviu-se com Arroz branco, Almondegas bovina, Lentilha, Purê de Abóbora e Salada de Pepino com tomate.\n' +
      'Não comeu tudo o que serviu (Lentilha e salada de pepino com tomate).\n' +
      'Repetiu 1x (Arroz, almondegas e Purê de Abobora).'
    );
  });

  it('mostra quantidade entre parênteses quando informada', () => {
    const texto = formatRefeicaoTexto({
      refeicao: 'Lanche',
      itens_servidos: [{ nome: 'Milho cozido', quantidade: '2 colheres' }],
      repetiu: false,
    });
    expect(texto).toBe('Comeu Milho cozido (2 colheres).');
  });

  it('sem itens lançados, mostra o aviso padrão', () => {
    const texto = formatRefeicaoTexto({ refeicao: 'Almoço', itens_servidos: [], comeu_tudo: null, repetiu: false });
    expect(texto).toBe('Sem lançamento de itens.');
  });

  it('aceita itens no formato antigo (string simples), sem quebrar', () => {
    const texto = formatRefeicaoTexto({ refeicao: 'Desjejum', itens_servidos: ['Maçã', 'Pão'], repetiu: false });
    expect(texto).toBe('Comeu Maçã e Pão.');
  });
});

describe('formatSonoTexto', () => {
  it('retorna null se faltar início ou fim', () => {
    expect(formatSonoTexto(null, '14:00:00')).toBeNull();
    expect(formatSonoTexto('13:00:00', null)).toBeNull();
  });

  it('formata o intervalo cortando os segundos', () => {
    expect(formatSonoTexto('13:00:00', '14:30:00')).toBe('Dormiu de 13:00 a 14:30');
  });
});

describe('formatEvacuacaoTexto', () => {
  it('retorna null quando não informado (null)', () => {
    expect(formatEvacuacaoTexto(null)).toBeNull();
  });

  it('"Não evacuou." quando false', () => {
    expect(formatEvacuacaoTexto(false)).toBe('Não evacuou.');
  });

  it('"Evacuou." sem aparência quando true e aparência ausente', () => {
    expect(formatEvacuacaoTexto(true)).toBe('Evacuou.');
  });

  it('inclui a aparência quando informada', () => {
    expect(formatEvacuacaoTexto(true, 'Normal')).toBe('Evacuou. Aparência: Normal');
  });
});
