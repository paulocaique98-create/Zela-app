// Promoção de série do Método Tradicional (Fase 5A). Cálculo puro e a gravação
// do novo students.turma, sempre filtrados por school_id. A decisão parte do
// resultado FECHADO (trad_resultados): em recuperação final o aluno só entra na
// promoção depois que a Coordenação fecha como aprovado ou reprovado.
import { supabase } from '../../lib/supabase';

export const ACOES = {
  sobe: 'Sobe de série',
  repete: 'Repete a série',
  concluinte: 'Concluiu a última série',
  pendente: 'Aguardando recuperação final',
  sem_resultado: 'Resultado ainda não fechado',
};

const porOrdem = (a, b) => (a.ordem - b.ordem) || String(a.nome).localeCompare(String(b.nome));

// Série seguinte: próxima do mesmo segmento; na última, a primeira do próximo
// segmento; sem próxima, null (concluinte).
export function serieSeguinte(serieId, series = [], segmentos = []) {
  const atual = series.find(s => s.id === serieId);
  if (!atual) return null;
  const mesmoSeg = series.filter(s => s.segmento_id === atual.segmento_id && s.ativo !== false).sort(porOrdem);
  const i = mesmoSeg.findIndex(s => s.id === serieId);
  if (i >= 0 && mesmoSeg[i + 1]) return mesmoSeg[i + 1];
  const segsOrdenados = [...segmentos].filter(s => s.ativo !== false).sort(porOrdem);
  const j = segsOrdenados.findIndex(s => s.id === atual.segmento_id);
  for (const seg of segsOrdenados.slice(j + 1)) {
    const primeira = series.filter(s => s.segmento_id === seg.id && s.ativo !== false).sort(porOrdem)[0];
    if (primeira) return primeira;
  }
  return null;
}

// Proposta para um aluno. Retorna { acao, serieDestino, turmasDestino } e a
// turma sugerida (mesmo turno da origem, senão a primeira por nome).
export function proporPromocao({ resultado, turmaOrigem, series, segmentos, turmasDestinoAno }) {
  if (!resultado) return { acao: 'sem_resultado', serieDestino: null, turmasDestino: [], turmaSugerida: null };
  if (resultado.situacao === 'recuperacao') return { acao: 'pendente', serieDestino: null, turmasDestino: [], turmaSugerida: null };

  let acao = 'repete';
  let serieDestino = series.find(s => s.id === turmaOrigem.serie_id) || null;
  if (resultado.situacao === 'aprovado') {
    serieDestino = serieSeguinte(turmaOrigem.serie_id, series, segmentos);
    acao = serieDestino ? 'sobe' : 'concluinte';
  }
  if (!serieDestino || acao === 'concluinte') return { acao, serieDestino: null, turmasDestino: [], turmaSugerida: null };

  const turmasDestino = (turmasDestinoAno || [])
    .filter(t => t.serie_id === serieDestino.id && t.ativo !== false)
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
  const turmaSugerida = turmasDestino.find(t => t.turno === turmaOrigem.turno) || turmasDestino[0] || null;
  return { acao, serieDestino, turmasDestino, turmaSugerida };
}

// Move o aluno para a turma nova. O filtro por turma de origem evita mover
// quem já foi promovido (repetir o clique não faz nada) e quem trocou de turma.
export async function promoverAluno(schoolId, { studentId, turmaOrigemNome, turmaDestinoNome }) {
  if (!schoolId || !studentId || !turmaOrigemNome || !turmaDestinoNome) throw new Error('Dados da promoção incompletos.');
  const { data, error } = await supabase
    .from('students').update({ turma: turmaDestinoNome })
    .eq('id', studentId).eq('school_id', schoolId).eq('turma', turmaOrigemNome)
    .select('id');
  if (error) throw error;
  return (data || []).length === 1;
}
