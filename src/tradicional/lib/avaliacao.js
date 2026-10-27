// Avaliação do Método Tradicional (Fase 2). Cálculo puro (sem banco) e
// consultas com colunas explícitas, sempre filtradas por school_id.
import { supabase } from '../../lib/supabase';

export const MEDIA_MINIMA_PADRAO = 7;
export const TIPOS_PERIODO = [
  { value: 'bimestre', label: 'Bimestre', quantidade: 4 },
  { value: 'trimestre', label: 'Trimestre', quantidade: 3 },
];
export const TIPOS_AVALIACAO = [
  { value: 'prova', label: 'Prova' },
  { value: 'trabalho', label: 'Trabalho' },
  { value: 'recuperacao', label: 'Recuperação' },
];

// Regra de situação final (Fase 4A), personalizável pela escola: frequência
// mínima, média mínima, média de recuperação final (null = sem recuperação final).
export const CONFIG_PADRAO = {
  periodo_tipo: 'bimestre', media_minima: MEDIA_MINIMA_PADRAO,
  freq_minima: 75, media_recuperacao: 5, recuperacao_final: true,
};

export function periodosDaConfig(periodoTipo) {
  const tipo = TIPOS_PERIODO.find(t => t.value === periodoTipo) || TIPOS_PERIODO[0];
  return Array.from({ length: tipo.quantidade }, (_, i) => ({
    numero: i + 1,
    label: `${i + 1}º ${tipo.label}`,
  }));
}

// Uma casa decimal, arredondando meio para cima (7,25 vira 7,3).
export const arredondar = (n) => Math.round((n + Number.EPSILON) * 10) / 10;

// Aceita "7,5" ou "7.5". Retorna { ok, valor } com 0 a 10.
export function lerNota(texto) {
  const limpo = String(texto ?? '').trim().replace(',', '.');
  if (limpo === '') return { ok: false, vazio: true };
  const valor = Number(limpo);
  if (!Number.isFinite(valor) || valor < 0 || valor > 10) return { ok: false, vazio: false };
  return { ok: true, valor: Math.round(valor * 100) / 100 };
}

// Média ponderada de [{ nota, peso }]. Sem notas: null.
export function mediaPonderada(itens) {
  const validos = (itens || []).filter(i => Number.isFinite(i.nota) && Number(i.peso) > 0);
  if (validos.length === 0) return null;
  const pesos = validos.reduce((s, i) => s + Number(i.peso), 0);
  const soma = validos.reduce((s, i) => s + i.nota * Number(i.peso), 0);
  return arredondar(soma / pesos);
}

// Nota do período: média das provas e trabalhos. Se existe nota de
// recuperação, ela SUBSTITUI a nota do período (regra definida pela escola).
export function notaDoPeriodo({ regulares, recuperacao }) {
  if (Number.isFinite(recuperacao)) return { nota: arredondar(recuperacao), recuperada: true };
  return { nota: mediaPonderada(regulares), recuperada: false };
}

export function situacaoDoPeriodo(nota, mediaMinima = MEDIA_MINIMA_PADRAO) {
  if (!Number.isFinite(nota)) return 'sem_nota';
  return nota >= mediaMinima ? 'acima' : 'abaixo';
}

// Notas lançadas de um aluno em uma atribuição e período.
// avaliacoes: [{ id, tipo, peso, periodo }]; notas: { [avaliacaoId]: number }.
export function calcularPeriodo({ avaliacoes, notas, periodo, mediaMinima }) {
  const doPeriodo = avaliacoes.filter(a => a.periodo === periodo);
  const regulares = doPeriodo
    .filter(a => a.tipo !== 'recuperacao' && Number.isFinite(notas[a.id]))
    .map(a => ({ nota: notas[a.id], peso: a.peso }));
  const rec = doPeriodo.find(a => a.tipo === 'recuperacao');
  const { nota, recuperada } = notaDoPeriodo({
    regulares,
    recuperacao: rec ? notas[rec.id] : undefined,
  });
  return { nota, recuperada, situacao: situacaoDoPeriodo(nota, mediaMinima) };
}

const COLUNAS = {
  trad_config_avaliacao: 'school_id, periodo_tipo, media_minima, freq_minima, media_recuperacao, recuperacao_final',
  trad_avaliacoes: 'id, atribuicao_id, periodo, nome, tipo, peso',
  trad_notas: 'id, avaliacao_id, student_id, nota',
};

export async function carregarConfig(schoolId) {
  if (!schoolId) return { ...CONFIG_PADRAO };
  const { data, error } = await supabase
    .from('trad_config_avaliacao').select(COLUNAS.trad_config_avaliacao)
    .eq('school_id', schoolId).maybeSingle();
  if (error) throw error;
  if (!data) return { ...CONFIG_PADRAO };
  return {
    periodo_tipo: data.periodo_tipo,
    media_minima: Number(data.media_minima),
    freq_minima: Number(data.freq_minima),
    media_recuperacao: data.media_recuperacao === null ? null : Number(data.media_recuperacao),
    recuperacao_final: data.recuperacao_final !== false,
  };
}

export async function salvarConfig(schoolId, { periodo_tipo, media_minima, freq_minima, media_recuperacao, recuperacao_final }) {
  const { error } = await supabase.from('trad_config_avaliacao')
    .upsert({ school_id: schoolId, periodo_tipo, media_minima, freq_minima, media_recuperacao, recuperacao_final, updated_at: new Date().toISOString() }, { onConflict: 'school_id' });
  if (error) throw error;
}

export async function listarAvaliacoes(schoolId, atribuicaoId) {
  if (!schoolId || !atribuicaoId) return [];
  const { data, error } = await supabase
    .from('trad_avaliacoes').select(COLUNAS.trad_avaliacoes)
    .eq('school_id', schoolId).eq('atribuicao_id', atribuicaoId)
    .order('periodo', { ascending: true }).order('created_at', { ascending: true }).limit(200);
  if (error) throw error;
  return (data || []).map(a => ({ ...a, peso: Number(a.peso) }));
}

export async function criarAvaliacao(schoolId, valores) {
  const { error } = await supabase.from('trad_avaliacoes').insert({ ...valores, school_id: schoolId });
  if (error) throw error;
}

export async function removerAvaliacao(schoolId, id) {
  const { error } = await supabase.from('trad_avaliacoes').delete().eq('id', id).eq('school_id', schoolId);
  if (error) throw error;
}

export async function listarNotas(schoolId, avaliacaoIds) {
  if (!schoolId || !avaliacaoIds?.length) return [];
  const { data, error } = await supabase
    .from('trad_notas').select(COLUNAS.trad_notas)
    .eq('school_id', schoolId).in('avaliacao_id', avaliacaoIds).limit(5000);
  if (error) throw error;
  return (data || []).map(n => ({ ...n, nota: Number(n.nota) }));
}

export async function salvarNota(schoolId, { avaliacaoId, studentId, nota, userId }) {
  const { error } = await supabase.from('trad_notas').upsert(
    { school_id: schoolId, avaliacao_id: avaliacaoId, student_id: studentId, nota, lancado_por: userId },
    { onConflict: 'avaliacao_id,student_id' },
  );
  if (error) throw error;
}

export async function limparNota(schoolId, avaliacaoId, studentId) {
  const { error } = await supabase.from('trad_notas').delete()
    .eq('school_id', schoolId).eq('avaliacao_id', avaliacaoId).eq('student_id', studentId);
  if (error) throw error;
}
