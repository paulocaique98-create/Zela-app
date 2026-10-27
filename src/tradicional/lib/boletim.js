// Boletim e resultado final do Método Tradicional (Fase 4A). Cálculo puro (sem
// banco) e consultas com colunas explícitas, sempre filtradas por school_id.
import { supabase } from '../../lib/supabase';
import { arredondar, calcularPeriodo, periodosDaConfig, CONFIG_PADRAO } from './avaliacao';
import { calcularFrequencia } from './frequencia';

export const SITUACOES_FINAIS = [
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'recuperacao', label: 'Em recuperação final' },
  { value: 'reprovado', label: 'Reprovado' },
  { value: 'reprovado_frequencia', label: 'Reprovado por frequência' },
];
export const rotuloSituacao = (v) =>
  SITUACOES_FINAIS.find(s => s.value === v)?.label || (v === 'incompleto' ? 'Notas incompletas' : '');

// Situação de uma disciplina pela média anual, com a regra da escola.
export function situacaoDaDisciplina(mediaAnual, config = CONFIG_PADRAO) {
  if (!Number.isFinite(mediaAnual)) return 'sem_nota';
  if (mediaAnual >= config.media_minima) return 'aprovado';
  const usaRec = config.recuperacao_final !== false && Number.isFinite(config.media_recuperacao);
  return usaRec && mediaAnual >= config.media_recuperacao ? 'recuperacao' : 'reprovado';
}

// Boletim de um aluno. atribuicoes: as da turma, com `disciplina` (nome);
// avaliacoes: [{ id, atribuicao_id, periodo, tipo, peso }]; notas: [{ avaliacao_id,
// student_id, nota }]; aulas/registros: do diário. Retorna linhas por disciplina,
// a frequência geral e a situação calculada.
export function calcularBoletim({ studentId, atribuicoes, avaliacoes, notas, aulas, registros, config = CONFIG_PADRAO }) {
  const periodos = periodosDaConfig(config.periodo_tipo);
  const notasDoAluno = {};
  for (const n of notas || []) if (n.student_id === studentId) notasDoAluno[n.avaliacao_id] = n.nota;

  const linhas = (atribuicoes || []).map(at => {
    const avs = (avaliacoes || []).filter(a => a.atribuicao_id === at.id);
    const medias = periodos.map(p => calcularPeriodo({
      avaliacoes: avs, notas: notasDoAluno, periodo: p.numero, mediaMinima: config.media_minima,
    }).nota);
    const lancadas = medias.filter(Number.isFinite);
    const mediaAnual = lancadas.length
      ? arredondar(lancadas.reduce((s, n) => s + n, 0) / lancadas.length) : null;
    return {
      disciplina: at.disciplina, medias, media_anual: mediaAnual,
      completo: lancadas.length === periodos.length,
      situacao: situacaoDaDisciplina(mediaAnual, config),
    };
  });

  const freq = calcularFrequencia({ aulas: aulas || [], registros: registros || [], studentId });
  const incompleto = linhas.length === 0 || linhas.some(l => !l.completo);
  return {
    linhas, frequencia: freq.percentual, faltas: freq.faltas, totalAulas: freq.total,
    situacao: situacaoFinal({ linhas, frequencia: freq.percentual, incompleto, config }),
  };
}

// Regra: frequência abaixo do mínimo reprova por frequência; senão, qualquer
// disciplina reprovada reprova; qualquer em recuperação leva à recuperação
// final; o resto aprova. Faltando nota (ou sem frequência registrada) o sistema
// não decide: 'incompleto', e a Coordenação fecha com justificativa.
export function situacaoFinal({ linhas, frequencia, incompleto, config = CONFIG_PADRAO }) {
  if (incompleto || !Number.isFinite(frequencia)) return 'incompleto';
  if (frequencia < config.freq_minima) return 'reprovado_frequencia';
  if (linhas.some(l => l.situacao === 'reprovado')) return 'reprovado';
  if (linhas.some(l => l.situacao === 'recuperacao')) return 'recuperacao';
  return 'aprovado';
}

// Fotografia guardada no fechamento (a família lê só isto, sem acesso às notas).
export const fotografiaDoBoletim = (linhas) =>
  linhas.map(l => ({ disciplina: l.disciplina, medias: l.medias, media_anual: l.media_anual, situacao: l.situacao }));

const COLUNAS_RESULTADO = 'id, student_id, turma_id, situacao, situacao_calculada, frequencia, boletim, observacao, fechado_em, ano_letivo, turma_nome';

export async function listarResultados(schoolId, turmaId) {
  if (!schoolId || !turmaId) return [];
  const { data, error } = await supabase
    .from('trad_resultados').select(COLUNAS_RESULTADO)
    .eq('school_id', schoolId).eq('turma_id', turmaId).limit(500);
  if (error) throw error;
  return (data || []).map(r => ({ ...r, frequencia: r.frequencia === null ? null : Number(r.frequencia) }));
}

// Resultados fechados dos filhos (a RLS só devolve os do próprio filho).
export async function listarResultadosDaFamilia(schoolId, studentIds) {
  if (!schoolId || !studentIds?.length) return [];
  const { data, error } = await supabase
    .from('trad_resultados').select(COLUNAS_RESULTADO)
    .eq('school_id', schoolId).in('student_id', studentIds).limit(100);
  if (error) throw error;
  return data || [];
}

export async function fecharResultado(schoolId, { studentId, turmaId, situacao, situacaoCalculada, frequencia, linhas, observacao, userId, anoLetivo = null, turmaNome = null }) {
  const { error } = await supabase.from('trad_resultados').upsert({
    school_id: schoolId, student_id: studentId, turma_id: turmaId,
    situacao, situacao_calculada: situacaoCalculada,
    frequencia: Number.isFinite(frequencia) ? frequencia : null,
    boletim: fotografiaDoBoletim(linhas), observacao: (observacao || '').trim(),
    ano_letivo: anoLetivo, turma_nome: turmaNome,
    fechado_por: userId, fechado_em: new Date().toISOString(),
  }, { onConflict: 'school_id,student_id,turma_id' });
  if (error) throw error;
}

export async function reabrirResultado(schoolId, id) {
  const { error } = await supabase.from('trad_resultados').delete().eq('id', id).eq('school_id', schoolId);
  if (error) throw error;
}
