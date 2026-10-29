import { supabase } from './supabase';

// Avaliação institucional (módulo `avaliacao_institucional`, item 8 do plano de
// expansão da Gestão). Lógica pura (testada em pesquisas.test.js) e as chamadas
// às funções do banco. Toda escrita e todo resultado passam por RPC: o banco
// garante o anonimato e a regra dos 5 ou mais.

export const MIN_RESPOSTAS = 5;
export const MAX_PERGUNTAS = 50;

export const TIPOS_PERGUNTA = {
  nps: 'NPS de 0 a 10',
  escala5: 'Escala de 1 a 5',
  multipla: 'Múltipla escolha',
  texto: 'Texto livre',
};

export const PUBLICOS = {
  familias: 'Todas as famílias',
  turmas: 'Famílias de turmas escolhidas',
  equipe: 'Equipe (professoras)',
};

export const ROTULO_STATUS = {
  rascunho: 'Rascunho',
  agendada: 'Agendada',
  aberta: 'Aberta',
  encerrada: 'Encerrada',
};

export const ROTULO_ESCALA = { 1: 'Muito ruim', 2: 'Ruim', 3: 'Regular', 4: 'Bom', 5: 'Muito bom' };

// Situação que a Gestão vê: publicada vira Agendada, Aberta ou Encerrada pelo prazo.
export function statusEfetivo(pesquisa, agora = new Date()) {
  if (pesquisa.status !== 'publicada') return pesquisa.status;
  const t = agora.getTime();
  if (new Date(pesquisa.fecha_em).getTime() <= t) return 'encerrada';
  if (new Date(pesquisa.abre_em).getTime() > t) return 'agendada';
  return 'aberta';
}

export function perguntaVazia(tipo = 'nps') {
  return { tipo, enunciado: '', opcoes: tipo === 'multipla' ? ['', ''] : [], obrigatoria: true };
}

export function formularioVazio(base = new Date()) {
  const fecha = new Date(base.getTime() + 14 * 86_400_000);
  return {
    titulo: '', descricao: '', publico: 'familias', turmas: [], anonima: false,
    abre_em: base.toISOString(), fecha_em: fecha.toISOString(), perguntas: [perguntaVazia('nps')],
  };
}

// <input type="datetime-local"> trabalha em hora local, sem fuso.
export function paraInputLocal(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function deInputLocal(valor) {
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

// Erros de preenchimento para mostrar antes de enviar (o banco confere de novo).
export function validarFormulario(f) {
  const erros = [];
  if ((f.titulo || '').trim().length < 3) erros.push('Informe o título da pesquisa.');
  if (f.publico === 'turmas' && !(f.turmas || []).length) erros.push('Escolha ao menos uma turma.');
  if (!f.fecha_em || !f.abre_em || new Date(f.fecha_em) <= new Date(f.abre_em)) {
    erros.push('A data de encerramento deve ser depois da abertura.');
  }
  const ps = f.perguntas || [];
  if (ps.length > MAX_PERGUNTAS) erros.push(`Use no máximo ${MAX_PERGUNTAS} perguntas.`);
  ps.forEach((p, i) => {
    if ((p.enunciado || '').trim().length < 3) erros.push(`Escreva o enunciado da pergunta ${i + 1}.`);
    if (p.tipo === 'multipla') {
      const ops = (p.opcoes || []).map(o => o.trim()).filter(Boolean);
      if (ops.length < 2) erros.push(`A pergunta ${i + 1} precisa de ao menos 2 opções.`);
      if (ops.length > 10) erros.push(`A pergunta ${i + 1} aceita no máximo 10 opções.`);
      if (new Set(ops).size !== ops.length) erros.push(`A pergunta ${i + 1} tem opções repetidas.`);
    }
  });
  return erros;
}

// Para publicar também precisa de ao menos uma pergunta.
export function validarParaPublicar(f) {
  const erros = validarFormulario(f);
  if (!(f.perguntas || []).length) erros.push('Adicione ao menos uma pergunta.');
  return erros;
}

// Quem responde: ids das obrigatórias ainda sem valor.
export function obrigatoriasFaltando(perguntas, respostas) {
  return perguntas
    .filter(p => p.obrigatoria && !String(respostas[p.id] ?? '').trim())
    .map(p => p.id);
}

export function montarRespostas(perguntas, respostas) {
  return perguntas
    .filter(p => String(respostas[p.id] ?? '').trim() !== '')
    .map(p => ({ question_id: p.id, valor: String(respostas[p.id]).trim() }));
}

// distribuicao: { "0": 2, "9": 5, ... } (chave = nota, valor = quantas vezes).
export function calcularNps(distribuicao = {}) {
  let promotores = 0; let neutros = 0; let detratores = 0;
  Object.entries(distribuicao).forEach(([nota, qtd]) => {
    const n = Number(nota); const c = Number(qtd);
    if (n >= 9) promotores += c; else if (n >= 7) neutros += c; else detratores += c;
  });
  const total = promotores + neutros + detratores;
  return {
    total, promotores, neutros, detratores,
    nps: total ? Math.round(((promotores - detratores) / total) * 100) : null,
  };
}

export function mediaDe(distribuicao = {}) {
  let soma = 0; let total = 0;
  Object.entries(distribuicao).forEach(([nota, qtd]) => { soma += Number(nota) * Number(qtd); total += Number(qtd); });
  return total ? soma / total : null;
}

export function taxaResposta(respostas, elegiveis) {
  if (!elegiveis) return null;
  return Math.min(100, Math.round((respostas / elegiveis) * 100));
}

// Série para o gráfico de barras (BarrasH): uma barra por nota ou opção.
export function serieDaPergunta(pergunta) {
  const d = pergunta.distribuicao || {};
  if (pergunta.tipo === 'nps') return Array.from({ length: 11 }, (_, i) => ({ nome: String(i), valor: Number(d[i] || 0) }));
  if (pergunta.tipo === 'escala5') return [1, 2, 3, 4, 5].map(i => ({ nome: `${i} ${ROTULO_ESCALA[i]}`, valor: Number(d[i] || 0) }));
  if (pergunta.tipo === 'multipla') return (pergunta.opcoes || []).map(o => ({ nome: o, valor: Number(d[o] || 0) }));
  return [];
}

// Linhas da exportação (uma por pergunta, com os números principais).
export function linhasExportacao(resultado) {
  return (resultado.perguntas || []).map(p => {
    if (p.oculto) return { ordem: p.ordem, pergunta: p.enunciado, tipo: TIPOS_PERGUNTA[p.tipo], respostas: '', resumo: `Oculto: menos de ${MIN_RESPOSTAS} respostas` };
    let resumo = '';
    if (p.tipo === 'nps') {
      const n = calcularNps(p.distribuicao);
      resumo = n.total ? `NPS ${n.nps} (promotores ${n.promotores}, neutros ${n.neutros}, detratores ${n.detratores})` : '';
    } else if (p.tipo === 'escala5') {
      const m = mediaDe(p.distribuicao);
      resumo = m === null ? '' : `Média ${m.toFixed(2).replace('.', ',')}`;
    } else if (p.tipo === 'multipla') {
      resumo = serieDaPergunta(p).map(s => `${s.nome}: ${s.valor}`).join(' | ');
    }
    return { ordem: p.ordem, pergunta: p.enunciado, tipo: TIPOS_PERGUNTA[p.tipo], respostas: p.respostas ?? 0, resumo };
  });
}

export const COLUNAS_EXPORTACAO = [
  { label: 'Ordem', value: 'ordem' },
  { label: 'Pergunta', value: 'pergunta' },
  { label: 'Tipo', value: 'tipo' },
  { label: 'Respostas', value: 'respostas' },
  { label: 'Resumo', value: 'resumo' },
];

// ── Banco ──
const COLUNAS_PESQUISA = 'id, titulo, descricao, publico, turmas, anonima, abre_em, fecha_em, status, created_at';
const COLUNAS_PERGUNTA = 'id, ordem, tipo, enunciado, opcoes, obrigatoria';

function falha(error, padrao) {
  throw new Error(error?.message && !/^(Failed|TypeError|NetworkError)/.test(error.message) ? error.message : padrao);
}

export async function listarPesquisas(schoolId) {
  const { data, error } = await supabase.from('surveys').select(COLUNAS_PESQUISA)
    .eq('school_id', schoolId).order('created_at', { ascending: false }).limit(200);
  if (error) falha(error, 'Não foi possível carregar as pesquisas.');
  return data || [];
}

export async function carregarPerguntas(schoolId, surveyId) {
  const { data, error } = await supabase.from('survey_questions').select(COLUNAS_PERGUNTA)
    .eq('school_id', schoolId).eq('survey_id', surveyId).order('ordem').limit(60);
  if (error) falha(error, 'Não foi possível carregar as perguntas.');
  return data || [];
}

export async function salvarPesquisa(id, f) {
  const { data, error } = await supabase.rpc('pesquisa_salvar', {
    p_id: id || null,
    p_dados: {
      titulo: f.titulo.trim(), descricao: (f.descricao || '').trim(), publico: f.publico,
      turmas: f.publico === 'turmas' ? f.turmas : [], anonima: Boolean(f.anonima),
      abre_em: f.abre_em, fecha_em: f.fecha_em,
    },
    p_perguntas: f.perguntas.map(p => ({
      tipo: p.tipo, enunciado: p.enunciado.trim(), obrigatoria: Boolean(p.obrigatoria),
      opcoes: p.tipo === 'multipla' ? p.opcoes.map(o => o.trim()).filter(Boolean) : [],
    })),
  });
  if (error) falha(error, 'Não foi possível salvar a pesquisa.');
  return data;
}

export async function publicarPesquisa(id) {
  const { error } = await supabase.rpc('pesquisa_publicar', { p_id: id });
  if (error) falha(error, 'Não foi possível publicar a pesquisa.');
}

export async function encerrarPesquisa(id) {
  const { error } = await supabase.rpc('pesquisa_encerrar', { p_id: id });
  if (error) falha(error, 'Não foi possível encerrar a pesquisa.');
}

export async function excluirPesquisa(id) {
  const { error } = await supabase.rpc('pesquisa_excluir', { p_id: id });
  if (error) falha(error, 'Não foi possível excluir a pesquisa.');
}

export async function resultadosPesquisa(id) {
  const { data, error } = await supabase.rpc('pesquisa_resultados', { p_id: id });
  if (error) falha(error, 'Não foi possível carregar os resultados.');
  return data;
}

export async function textosPesquisa(id, perguntaId) {
  const { data, error } = await supabase.rpc('pesquisa_textos', { p_id: id, p_question_id: perguntaId });
  if (error) falha(error, 'Não foi possível carregar os comentários.');
  return data || [];
}

export async function pesquisasAbertas() {
  const { data, error } = await supabase.rpc('pesquisas_abertas');
  if (error) falha(error, 'Não foi possível carregar as pesquisas.');
  return data || [];
}

export async function pesquisaParaResponder(id) {
  const { data, error } = await supabase.rpc('pesquisa_para_responder', { p_id: id });
  if (error) falha(error, 'Não foi possível abrir a pesquisa.');
  return data;
}

export async function responderPesquisa(id, perguntas, respostas) {
  const { error } = await supabase.rpc('pesquisa_responder', { p_id: id, p_respostas: montarRespostas(perguntas, respostas) });
  if (error) falha(error, 'Não foi possível enviar suas respostas.');
}

// Push ao publicar. Melhor esforço: falha aqui não desfaz a publicação.
export async function notificarPesquisa(surveyId) {
  try {
    const { error } = await supabase.functions.invoke('notify-pesquisa', { body: { survey_id: surveyId } });
    if (error) console.warn('[notificarPesquisa] Falha ao notificar:', error.message);
  } catch (err) {
    console.warn('[notificarPesquisa] Falha ao notificar:', err);
  }
}
