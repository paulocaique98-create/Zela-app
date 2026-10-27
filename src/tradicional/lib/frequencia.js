// Diário de classe do Método Tradicional (Fase 3). Cálculo puro (sem banco) e
// consultas com colunas explícitas, sempre filtradas por school_id.
import { supabase } from '../../lib/supabase';

// LDB art. 24: mínimo de 75% de frequência. Acima do limite, mas perto dele,
// vira atenção.
export const LIMITE_FREQUENCIA = 75;
export const MARGEM_ATENCAO = 80;

export const STATUS_FREQUENCIA = [
  { value: 'presente', label: 'Presente', sigla: 'P' },
  { value: 'falta', label: 'Falta', sigla: 'F' },
  { value: 'justificada', label: 'Falta justificada', sigla: 'J' },
];

const arredondar = (n) => Math.round((n + Number.EPSILON) * 10) / 10;

// aulas: [{ id, qtd_aulas }]; registros: [{ aula_id, student_id, status }].
// Falta justificada conta como ausência no percentual (a LDB mede presença).
// Aula sem registro do aluno não entra na conta.
export function calcularFrequencia({ aulas, registros, studentId }) {
  const qtdPorAula = new Map((aulas || []).map(a => [a.id, Number(a.qtd_aulas) || 1]));
  let total = 0;
  let faltas = 0;
  let justificadas = 0;
  for (const r of registros || []) {
    if (r.student_id !== studentId || !qtdPorAula.has(r.aula_id)) continue;
    const qtd = qtdPorAula.get(r.aula_id);
    total += qtd;
    if (r.status === 'falta') faltas += qtd;
    if (r.status === 'justificada') { faltas += qtd; justificadas += qtd; }
  }
  if (total === 0) return { total: 0, faltas: 0, justificadas: 0, percentual: null, situacao: 'sem_dados' };
  const percentual = arredondar(((total - faltas) / total) * 100);
  const situacao = percentual < LIMITE_FREQUENCIA ? 'abaixo' : percentual < MARGEM_ATENCAO ? 'atencao' : 'ok';
  return { total, faltas, justificadas, percentual, situacao };
}

const COLUNAS_AULA = 'id, atribuicao_id, data, conteudo, qtd_aulas';
const COLUNAS_FREQUENCIA = 'aula_id, student_id, status';

export async function listarAulas(schoolId, atribuicaoIds) {
  if (!schoolId || !atribuicaoIds?.length) return [];
  const { data, error } = await supabase
    .from('trad_aulas').select(COLUNAS_AULA)
    .eq('school_id', schoolId).in('atribuicao_id', atribuicaoIds)
    .order('data', { ascending: false }).limit(1000);
  if (error) throw error;
  return data || [];
}

export async function criarAula(schoolId, { atribuicao_id, data, conteudo, qtd_aulas, userId }) {
  const { data: criada, error } = await supabase.from('trad_aulas')
    .insert({ school_id: schoolId, atribuicao_id, data, conteudo, qtd_aulas, registrado_por: userId })
    .select(COLUNAS_AULA).single();
  if (error) throw error;
  return criada;
}

export async function atualizarAula(schoolId, id, valores) {
  const { error } = await supabase.from('trad_aulas').update(valores).eq('id', id).eq('school_id', schoolId);
  if (error) throw error;
}

export async function removerAula(schoolId, id) {
  const { error } = await supabase.from('trad_aulas').delete().eq('id', id).eq('school_id', schoolId);
  if (error) throw error;
}

export async function listarFrequencia(schoolId, aulaIds) {
  if (!schoolId || !aulaIds?.length) return [];
  const { data, error } = await supabase
    .from('trad_frequencia').select(COLUNAS_FREQUENCIA)
    .eq('school_id', schoolId).in('aula_id', aulaIds).limit(10000);
  if (error) throw error;
  return data || [];
}

export async function salvarFrequencia(schoolId, aulaId, linhas) {
  if (!linhas.length) return;
  const { error } = await supabase.from('trad_frequencia').upsert(
    linhas.map(l => ({ school_id: schoolId, aula_id: aulaId, student_id: l.studentId, status: l.status })),
    { onConflict: 'aula_id,student_id' },
  );
  if (error) throw error;
}
