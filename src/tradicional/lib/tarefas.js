// Tarefas do Método Tradicional (Fase 5B). Lógica pura (sem banco) e consultas
// com colunas explícitas, sempre filtradas por school_id.
import { supabase } from '../../lib/supabase';

export const LIMITE_TITULO = 120;
export const LIMITE_DESCRICAO = 2000;

const COLUNAS = 'id, atribuicao_id, titulo, descricao, data_entrega, disciplina_nome, turma_nome';

// Devolve o texto do erro ou '' quando a tarefa é válida.
export function validarTarefa({ titulo, descricao, data_entrega }) {
  if (!String(titulo || '').trim()) return 'Informe o título da tarefa.';
  if (String(titulo).trim().length > LIMITE_TITULO) return `O título aceita até ${LIMITE_TITULO} caracteres.`;
  if (String(descricao || '').length > LIMITE_DESCRICAO) return `A descrição aceita até ${LIMITE_DESCRICAO} caracteres.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data_entrega || '')) return 'Informe a data de entrega.';
  return '';
}

// Entregas futuras primeiro (da mais próxima), depois as vencidas (da mais recente).
export function ordenarTarefas(tarefas, hoje) {
  const futuras = (tarefas || []).filter(t => t.data_entrega >= hoje)
    .sort((a, b) => a.data_entrega.localeCompare(b.data_entrega));
  const vencidas = (tarefas || []).filter(t => t.data_entrega < hoje)
    .sort((a, b) => b.data_entrega.localeCompare(a.data_entrega));
  return [...futuras, ...vencidas];
}

export const estaVencida = (tarefa, hoje) => tarefa.data_entrega < hoje;

export async function listarTarefas(schoolId, atribuicaoIds) {
  if (!schoolId || !atribuicaoIds?.length) return [];
  const { data, error } = await supabase
    .from('trad_tarefas').select(COLUNAS)
    .eq('school_id', schoolId).in('atribuicao_id', atribuicaoIds)
    .order('data_entrega', { ascending: false }).limit(500);
  if (error) throw error;
  return data || [];
}

export async function criarTarefa(schoolId, { atribuicao_id, titulo, descricao, data_entrega, userId }) {
  const { data, error } = await supabase.from('trad_tarefas')
    .insert({ school_id: schoolId, atribuicao_id, titulo: titulo.trim(), descricao: descricao || '', data_entrega, criado_por: userId })
    .select(COLUNAS).single();
  if (error) throw error;
  return data;
}

export async function atualizarTarefa(schoolId, id, { titulo, descricao, data_entrega }) {
  const { data, error } = await supabase.from('trad_tarefas')
    .update({ titulo: titulo.trim(), descricao: descricao || '', data_entrega })
    .eq('id', id).eq('school_id', schoolId).select(COLUNAS).single();
  if (error) throw error;
  return data;
}

export async function removerTarefa(schoolId, id) {
  const { error } = await supabase.from('trad_tarefas').delete().eq('id', id).eq('school_id', schoolId);
  if (error) throw error;
}

// Família: a RLS entrega só as tarefas da turma do próprio filho.
export async function listarTarefasDaFamilia(schoolId) {
  if (!schoolId) return [];
  const { data, error } = await supabase
    .from('trad_tarefas').select(COLUNAS)
    .eq('school_id', schoolId)
    .order('data_entrega', { ascending: true }).limit(500);
  if (error) throw error;
  return data || [];
}
