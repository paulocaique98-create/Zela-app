// Estrutura acadêmica do Método Tradicional (Fase 1). Consultas sempre com
// colunas explícitas e filtradas por school_id (a RLS é a barreira real).
import { supabase } from '../../lib/supabase';

export const SEGMENTOS_PADRAO = ['Fundamental I'];
export const SERIES_FUNDAMENTAL_I = ['1º ano', '2º ano', '3º ano', '4º ano', '5º ano'];
export const DISCIPLINAS_FUNDAMENTAL_I = [
  ['Língua Portuguesa', 'LP'], ['Matemática', 'MAT'], ['Ciências', 'CIE'],
  ['História', 'HIS'], ['Geografia', 'GEO'], ['Arte', 'ART'],
  ['Educação Física', 'EF'], ['Língua Inglesa', 'ING'],
];
export const TURNOS = [
  { value: 'manha', label: 'Manhã' },
  { value: 'tarde', label: 'Tarde' },
  { value: 'integral', label: 'Integral' },
  { value: 'noite', label: 'Noite' },
];
export const DIAS_SEMANA = [
  { value: 1, label: 'Segunda' }, { value: 2, label: 'Terça' }, { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' }, { value: 5, label: 'Sexta' },
];

const COLUNAS = {
  trad_segmentos: 'id, nome, ordem, ativo',
  trad_series: 'id, segmento_id, nome, ordem, ativo',
  trad_turmas: 'id, school_year_id, serie_id, nome, turno, ativo',
  trad_disciplinas: 'id, nome, sigla, ativo',
  trad_grade: 'id, serie_id, disciplina_id, carga_semanal',
  trad_atribuicoes: 'id, turma_id, disciplina_id, professor_id',
  trad_horarios: 'id, turma_id, atribuicao_id, dia_semana, ordem, inicio, fim',
};

export async function listar(tabela, schoolId, { ordenarPor = 'created_at', limite = 500 } = {}) {
  if (!schoolId || !COLUNAS[tabela]) return [];
  const { data, error } = await supabase
    .from(tabela).select(COLUNAS[tabela]).eq('school_id', schoolId)
    .order(ordenarPor, { ascending: true }).limit(limite);
  if (error) throw error;
  return data || [];
}

export async function inserir(tabela, schoolId, valores) {
  const linhas = (Array.isArray(valores) ? valores : [valores]).map(v => ({ ...v, school_id: schoolId }));
  const { data, error } = await supabase.from(tabela).insert(linhas).select(COLUNAS[tabela]);
  if (error) throw error;
  return data || [];
}

export async function atualizar(tabela, schoolId, id, valores) {
  const { error } = await supabase.from(tabela).update(valores).eq('id', id).eq('school_id', schoolId);
  if (error) throw error;
}

export async function remover(tabela, schoolId, id) {
  const { error } = await supabase.from(tabela).delete().eq('id', id).eq('school_id', schoolId);
  if (error) throw error;
}

export async function listarProfessores(schoolId) {
  if (!schoolId) return [];
  const { data, error } = await supabase
    .from('users').select('id, name').eq('school_id', schoolId).eq('role', 'teacher')
    .order('name', { ascending: true }).limit(200);
  if (error) throw error;
  return data || [];
}

// Traduz erros comuns do banco para texto de tela.
export function mensagemDeErro(error) {
  const code = error?.code;
  if (code === '23505') return 'Já existe um registro com esse nome.';
  if (code === '23503') return 'Este item está em uso por outro cadastro. Remova ou ajuste os vínculos antes.';
  if (code === '42501') return 'Sem permissão para esta ação.';
  return error?.message || 'Não foi possível concluir a ação.';
}

// Disciplinas da grade de uma série que ainda não têm professor na turma.
export function disciplinasSemProfessor({ turma, grade, atribuicoes }) {
  if (!turma) return [];
  const atribuidas = new Set(atribuicoes.filter(a => a.turma_id === turma.id).map(a => a.disciplina_id));
  return grade.filter(g => g.serie_id === turma.serie_id && !atribuidas.has(g.disciplina_id)).map(g => g.disciplina_id);
}

// Choque de horário: mesmo professor em duas turmas no mesmo dia e horário.
export function professorOcupado({ horarios, atribuicoes, professorId, dia, ordem, ignorarHorarioId = null }) {
  const doProfessor = new Set(atribuicoes.filter(a => a.professor_id === professorId).map(a => a.id));
  return horarios.some(h => h.id !== ignorarHorarioId && h.dia_semana === dia && h.ordem === ordem && doProfessor.has(h.atribuicao_id));
}

const hhmm = (t) => String(t || '').slice(0, 5);

// Outro horário da mesma turma e dia que cruza o intervalo [inicio, fim). Aulas coladas
// (uma termina quando a outra começa) não contam como choque. Compara "HH:MM" como texto.
export function horarioSobreposto({ horarios, turmaId, dia, inicio, fim, ignorarHorarioId = null }) {
  const ini = hhmm(inicio); const f = hhmm(fim);
  return horarios.find(h => h.id !== ignorarHorarioId && h.turma_id === turmaId && h.dia_semana === dia
    && hhmm(h.inicio) < f && ini < hhmm(h.fim)) || null;
}

// A turma já tem aula com esse número no dia (o banco só aceita um por turma, dia e número).
export function ordemRepetida({ horarios, turmaId, dia, ordem, ignorarHorarioId = null }) {
  return horarios.some(h => h.id !== ignorarHorarioId && h.turma_id === turmaId && h.dia_semana === dia && h.ordem === ordem);
}

// O intervalo não usa "Nº da aula": ocupa o maior número livre do dia, para não entrar
// na contagem das aulas (1ª, 2ª, 3ª...).
export function ordemLivreParaIntervalo({ horarios, turmaId, dia, ignorarHorarioId = null }) {
  const usadas = new Set(horarios.filter(h => h.id !== ignorarHorarioId && h.turma_id === turmaId && h.dia_semana === dia).map(h => h.ordem));
  for (let o = 12; o >= 1; o--) if (!usadas.has(o)) return o;
  return 12;
}
