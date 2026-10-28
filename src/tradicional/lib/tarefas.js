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

// BNCC (Fase 5C). Catálogo global somente leitura; vínculo por tarefa.
export const COMPONENTES_BNCC = ['Língua Portuguesa', 'Matemática', 'Ciências', 'História', 'Geografia'];
export const LIMITE_HABILIDADES = 10;

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// "3º ano" -> 3; fora de 1 a 5 (ex.: "Infantil", "6º ano") -> null.
export function anoDaSerie(nome) {
  const m = String(nome || '').match(/\d+/);
  const ano = m ? Number(m[0]) : null;
  return ano >= 1 && ano <= 5 ? ano : null;
}

// Palpite do componente a partir do nome da disciplina cadastrada pela escola.
export function componenteDaDisciplina(nome) {
  const n = semAcento(nome);
  if (/portugu|leitura|redac|escrita/.test(n)) return 'Língua Portuguesa';
  if (/matem/.test(n)) return 'Matemática';
  if (/cienc/.test(n)) return 'Ciências';
  if (/histor/.test(n)) return 'História';
  if (/geograf/.test(n)) return 'Geografia';
  return '';
}

export function filtrarHabilidades(catalogo, { ano, componente }) {
  return (catalogo || []).filter(h => (!ano || h.ano === ano) && (!componente || h.componente === componente));
}

export async function listarHabilidades() {
  const { data, error } = await supabase
    .from('bncc_habilidades').select('codigo, componente, ano, descricao')
    .order('codigo').limit(1000);
  if (error) throw error;
  return data || [];
}

// Devolve { [tarefa_id]: [codigo, ...] }.
export async function listarHabilidadesDasTarefas(schoolId, tarefaIds) {
  if (!schoolId || !tarefaIds?.length) return {};
  const { data, error } = await supabase
    .from('trad_tarefa_habilidades').select('tarefa_id, codigo')
    .eq('school_id', schoolId).in('tarefa_id', tarefaIds).limit(5000);
  if (error) throw error;
  const mapa = {};
  for (const r of data || []) (mapa[r.tarefa_id] ||= []).push(r.codigo);
  return mapa;
}

// Troca o conjunto de habilidades da tarefa: remove só o que saiu, insere só o que entrou.
export async function salvarHabilidadesDaTarefa(schoolId, tarefaId, codigos, anteriores = []) {
  const novos = [...new Set(codigos || [])].slice(0, LIMITE_HABILIDADES);
  const remover = anteriores.filter(c => !novos.includes(c));
  const inserir = novos.filter(c => !anteriores.includes(c));
  if (remover.length) {
    const { error } = await supabase.from('trad_tarefa_habilidades').delete()
      .eq('school_id', schoolId).eq('tarefa_id', tarefaId).in('codigo', remover);
    if (error) throw error;
  }
  if (inserir.length) {
    const { error } = await supabase.from('trad_tarefa_habilidades')
      .insert(inserir.map(codigo => ({ school_id: schoolId, tarefa_id: tarefaId, codigo })));
    if (error) throw error;
  }
  return novos;
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
