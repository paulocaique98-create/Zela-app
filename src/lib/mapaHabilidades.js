import { idadeEmMeses } from './sugestaoTurma';

// Mapa de Habilidades: regras puras (sem tela, sem banco), para a professora,
// a coordenação e os testes usarem as mesmas contas.

export const SITUACOES = [
  { value: 'sem_interesse', label: 'Sem interesse' },
  { value: 'adquirindo', label: 'Adquirindo' },
  { value: 'adquirido', label: 'Adquirido' },
];
export const SITUACAO_LABEL = Object.fromEntries(SITUACOES.map(s => [s.value, s.label]));

// Sugestões para o cadastro; a escola pode digitar qualquer outra área.
export const AREAS_SUGERIDAS = ['Linguagem', 'Matemática', 'Vida Prática', 'Sensorial'];

export const TODAS_AREAS = 'todas';

// Semestre do dia do preenchimento: janeiro a junho = 1, julho a dezembro = 2.
export function periodoAtual(hoje = new Date()) {
  return { ano: hoje.getFullYear(), semestre: hoje.getMonth() < 6 ? 1 : 2 };
}

export function periodoLabel({ ano, semestre }) {
  return `${semestre}º Semestre ${ano}`;
}

function periodoNumero(ano, semestre) {
  return Number(ano) * 2 + Number(semestre);
}

export function ehPeriodoAnterior(registro, periodo) {
  return periodoNumero(registro.ano, registro.semestre) < periodoNumero(periodo.ano, periodo.semestre);
}

export function ehMesmoPeriodo(registro, periodo) {
  return Number(registro.ano) === Number(periodo.ano) && Number(registro.semestre) === Number(periodo.semestre);
}

// "de 1 ano a 1 ano e 6 meses". Sem hífen: texto voltado ao usuário.
function textoIdade(meses) {
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  const partes = [];
  if (anos > 0) partes.push(`${anos} ${anos === 1 ? 'ano' : 'anos'}`);
  if (resto > 0) partes.push(`${resto} ${resto === 1 ? 'mês' : 'meses'}`);
  return partes.length ? partes.join(' e ') : '0 meses';
}

export function formatFaixa(minMeses, maxMeses) {
  return `de ${textoIdade(minMeses)} a ${textoIdade(maxMeses)}`;
}

// Regra de quem vê a habilidade (por aluno):
//  1. já adquirida em semestre anterior: nunca mais volta;
//  2. já tem registro neste semestre: continua na lista (para poder corrigir);
//  3. idade no dia do preenchimento dentro da faixa: entra;
//  4. passou da idade máxima, mas ficou "Sem interesse" ou "Adquirindo" antes:
//     continua até chegar em "Adquirido".
// registros: todos os registros do aluno para esta habilidade, de qualquer semestre.
export function situacaoDoAluno({ habilidade, aluno, registros, periodo, hoje = new Date() }) {
  const doAluno = registros.filter(r => r.student_id === aluno.id && r.habilidade_id === habilidade.id);
  if (doAluno.some(r => r.situacao === 'adquirido' && ehPeriodoAnterior(r, periodo))) {
    return { elegivel: false, registro: null };
  }
  const atual = doAluno.find(r => ehMesmoPeriodo(r, periodo)) || null;
  if (atual) return { elegivel: true, registro: atual };

  const meses = idadeEmMeses(aluno.birth_date, hoje);
  if (meses === null) return { elegivel: false, registro: null };
  const pendenteAnterior = doAluno.some(r => ehPeriodoAnterior(r, periodo));
  const naFaixa = meses >= habilidade.idade_min_meses && meses <= habilidade.idade_max_meses;
  const passouDaFaixa = meses > habilidade.idade_max_meses && pendenteAnterior;
  return { elegivel: naFaixa || passouDaFaixa, registro: null };
}

// Sorteio com semente: a mesma professora vê a mesma ordem "aleatória" ao
// recarregar a página, no mesmo semestre.
function hashTexto(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function geradorComSemente(semente) {
  let a = hashTexto(String(semente));
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function embaralharComSemente(lista, semente) {
  const copia = [...lista];
  const rand = geradorComSemente(semente);
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

export function ordenarHabilidades(habilidades) {
  return [...habilidades].sort((a, b) =>
    (a.ordem - b.ordem)
    || (a.idade_min_meses - b.idade_min_meses)
    || String(a.descricao).localeCompare(String(b.descricao), 'pt-BR'));
}

// Monta a fila da professora: uma habilidade por vez, só com quem está na
// faixa, sem as habilidades que ninguém da turma precisa preencher.
export function montarFila({ habilidades, alunos, registros, periodo, area = TODAS_AREAS, semente = '', hoje = new Date() }) {
  const ativas = habilidades.filter(h => h.ativa !== false);
  const daArea = area === TODAS_AREAS ? ativas : ativas.filter(h => h.area === area);
  const ordenadas = area === TODAS_AREAS
    ? embaralharComSemente(ordenarHabilidades(daArea), `${semente}|${periodo.ano}|${periodo.semestre}`)
    : ordenarHabilidades(daArea);

  const fila = [];
  for (const habilidade of ordenadas) {
    const itens = [];
    for (const aluno of alunos) {
      const { elegivel, registro } = situacaoDoAluno({ habilidade, aluno, registros, periodo, hoje });
      if (elegivel) itens.push({ aluno, registro });
    }
    if (itens.length === 0) continue;
    itens.sort((a, b) => String(a.aluno.name).localeCompare(String(b.aluno.name), 'pt-BR'));
    fila.push({ habilidade, itens, completa: itens.every(i => i.registro) });
  }
  return fila;
}

export function progressoDaFila(fila) {
  let total = 0;
  let preenchidos = 0;
  for (const passo of fila) {
    total += passo.itens.length;
    preenchidos += passo.itens.filter(i => i.registro).length;
  }
  return { total, preenchidos, percentual: total === 0 ? 0 : Math.round((preenchidos / total) * 100) };
}

// Abre na primeira habilidade que ainda falta; tudo pronto abre na última.
export function indiceInicial(fila) {
  const i = fila.findIndex(p => !p.completa);
  return i === -1 ? Math.max(fila.length - 1, 0) : i;
}

// A seta só avança quando a habilidade da tela está toda preenchida.
export function podeAvancar(fila, indice) {
  return Boolean(fila[indice]) && fila[indice].completa && indice < fila.length - 1;
}

// ── Importação do catálogo (CSV colado ou arquivo) ─────────────────────────

function semAcento(texto) {
  return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function dividirLinha(linha, separador) {
  const campos = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < linha.length; i += 1) {
    const c = linha[i];
    if (c === '"') {
      if (aspas && linha[i + 1] === '"') { atual += '"'; i += 1; } else { aspas = !aspas; }
    } else if (c === separador && !aspas) {
      campos.push(atual.trim());
      atual = '';
    } else {
      atual += c;
    }
  }
  campos.push(atual.trim());
  return campos;
}

function numero(texto) {
  const n = Number(String(texto).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// Cabeçalho aceito (qualquer ordem): area; habilidade (ou descricao);
// idade_min_meses e idade_max_meses (ou idade_min_anos e idade_max_anos,
// aceita 1,5 = 18 meses); ordem (opcional).
export function lerCsvHabilidades(texto) {
  const linhas = String(texto || '').split(/\r?\n/).filter(l => l.trim() !== '');
  if (linhas.length < 2) return { itens: [], erros: [{ linha: 1, msg: 'Cole o cabeçalho e ao menos uma habilidade.' }] };

  const cab = linhas[0];
  const separador = [';', '\t', ','].reduce((melhor, s) => (cab.split(s).length > cab.split(melhor).length ? s : melhor), ';');
  const nomes = dividirLinha(cab, separador).map(semAcento);
  const col = (...opcoes) => nomes.findIndex(n => opcoes.includes(n));
  const iArea = col('area');
  const iDesc = col('habilidade', 'descricao');
  const iMinM = col('idade_min_meses');
  const iMaxM = col('idade_max_meses');
  const iMinA = col('idade_min_anos');
  const iMaxA = col('idade_max_anos');
  const iOrdem = col('ordem');
  const usaMeses = iMinM >= 0 && iMaxM >= 0;
  const usaAnos = iMinA >= 0 && iMaxA >= 0;

  if (iArea < 0 || iDesc < 0 || (!usaMeses && !usaAnos)) {
    return {
      itens: [],
      erros: [{ linha: 1, msg: 'Cabeçalho precisa de: area, habilidade e idade_min_meses/idade_max_meses (ou idade_min_anos/idade_max_anos).' }],
    };
  }

  const itens = [];
  const erros = [];
  const vistos = new Set();
  linhas.slice(1).forEach((linha, idx) => {
    const n = idx + 2;
    const c = dividirLinha(linha, separador);
    const area = (c[iArea] || '').trim();
    const descricao = (c[iDesc] || '').trim();
    const min = usaMeses ? numero(c[iMinM]) : (numero(c[iMinA]) === null ? null : Math.round(numero(c[iMinA]) * 12));
    const max = usaMeses ? numero(c[iMaxM]) : (numero(c[iMaxA]) === null ? null : Math.round(numero(c[iMaxA]) * 12));
    const ordem = iOrdem >= 0 && numero(c[iOrdem]) !== null ? Math.round(numero(c[iOrdem])) : idx + 1;

    if (!area || area.length > 80) return erros.push({ linha: n, msg: 'Área vazia ou muito longa.' });
    if (!descricao || descricao.length > 400) return erros.push({ linha: n, msg: 'Habilidade vazia ou muito longa.' });
    if (min === null || max === null) return erros.push({ linha: n, msg: 'Idade mínima e máxima precisam ser números.' });
    if (min < 0 || max > 240 || min > max) return erros.push({ linha: n, msg: 'Faixa de idade inválida (mínima maior que a máxima).' });
    const chave = `${semAcento(area)}|${semAcento(descricao)}`;
    if (vistos.has(chave)) return erros.push({ linha: n, msg: 'Habilidade repetida na lista.' });
    vistos.add(chave);
    return itens.push({ area, descricao, idade_min_meses: Math.round(min), idade_max_meses: Math.round(max), ordem });
  });
  return { itens, erros };
}

// Valida o formulário "Adicionar habilidade". Devolve a mensagem de erro ou ''.
export function validarHabilidade({ area, descricao, idade_min_meses: min, idade_max_meses: max }) {
  if (!String(area || '').trim()) return 'Informe a área de conhecimento.';
  if (!String(descricao || '').trim()) return 'Descreva a habilidade.';
  if (String(descricao).trim().length > 400) return 'A descrição passa de 400 caracteres.';
  if (!Number.isInteger(min) || !Number.isInteger(max)) return 'Informe a idade mínima e a máxima.';
  if (min < 0 || max > 240) return 'Idade fora do limite.';
  if (min > max) return 'A idade mínima não pode ser maior que a máxima.';
  return '';
}

// Tabela ainda não criada no banco (migration pendente): PostgREST devolve
// PGRST205, o Postgres 42P01. Mensagem própria para não parecer falha de rede.
export function mapaIndisponivel(erro) {
  return erro?.code === 'PGRST205' || erro?.code === '42P01';
}

export function mensagemErroMapa(erro, padrao) {
  return mapaIndisponivel(erro)
    ? 'O Mapa de Habilidades ainda não foi ativado no banco de dados. Avise o suporte do Zela Escola.'
    : padrao;
}
