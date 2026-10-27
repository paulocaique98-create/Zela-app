// Histórico escolar e ata do conselho do Método Tradicional (Fase 4B). O
// histórico não tem tabela própria: sai dos resultados FECHADOS (trad_resultados),
// agrupados por aluno e ano letivo. Consultas com colunas explícitas e school_id.
import { supabase } from '../../lib/supabase';

// Ano do resultado: o gravado no fechamento; senão o ano de fechado_em.
export function anoDoResultado(r) {
  if (r?.ano_letivo) return r.ano_letivo;
  const d = r?.fechado_em ? new Date(r.fechado_em) : null;
  return d && !Number.isNaN(d.getTime()) ? String(d.getFullYear()) : 'Sem ano';
}

// [{ studentId, anos: [{ ano, turma, situacao, frequencia, boletim, observacao }] }]
// com os anos do mais recente para o mais antigo.
export function montarHistorico(resultados) {
  const porAluno = new Map();
  for (const r of resultados || []) {
    if (!porAluno.has(r.student_id)) porAluno.set(r.student_id, []);
    porAluno.get(r.student_id).push({
      id: r.id,
      ano: anoDoResultado(r),
      turma: r.turma_nome || '',
      situacao: r.situacao,
      frequencia: r.frequencia === null || r.frequencia === undefined ? null : Number(r.frequencia),
      boletim: r.boletim || [],
      observacao: r.observacao || '',
      fechadoEm: r.fechado_em,
    });
  }
  return [...porAluno.entries()].map(([studentId, anos]) => ({
    studentId,
    anos: anos.sort((a, b) => b.ano.localeCompare(a.ano, 'pt-BR', { numeric: true })),
  }));
}

const COLUNAS_HISTORICO = 'id, student_id, turma_id, situacao, frequencia, boletim, observacao, fechado_em, ano_letivo, turma_nome';

// A RLS devolve só o que a pessoa pode ver (família: o próprio filho).
export async function listarHistoricoDoAluno(schoolId, studentId) {
  if (!schoolId || !studentId) return [];
  const { data, error } = await supabase
    .from('trad_resultados').select(COLUNAS_HISTORICO)
    .eq('school_id', schoolId).eq('student_id', studentId).limit(50);
  if (error) throw error;
  return montarHistorico(data || [])[0]?.anos || [];
}

export const ATA_VAZIA = { data_reuniao: '', participantes: '', pauta: '', deliberacoes: '', encaminhamentos: '' };

// Ata válida: data e ao menos um campo de conteúdo preenchido.
export function validarAta(ata) {
  if (!ata?.data_reuniao) return 'Informe a data da reunião.';
  const tem = ['participantes', 'pauta', 'deliberacoes', 'encaminhamentos'].some(c => (ata[c] || '').trim());
  return tem ? '' : 'Preencha ao menos um campo da ata.';
}

const COLUNAS_ATA = 'id, turma_id, periodo, data_reuniao, participantes, pauta, deliberacoes, encaminhamentos';

export async function listarAtas(schoolId, turmaId) {
  if (!schoolId || !turmaId) return [];
  const { data, error } = await supabase
    .from('trad_atas_conselho').select(COLUNAS_ATA)
    .eq('school_id', schoolId).eq('turma_id', turmaId).order('periodo', { ascending: true }).limit(12);
  if (error) throw error;
  return data || [];
}

export async function salvarAta(schoolId, { turmaId, periodo, ata, userId }) {
  const erro = validarAta(ata);
  if (erro) throw new Error(erro);
  const { error } = await supabase.from('trad_atas_conselho').upsert({
    school_id: schoolId, turma_id: turmaId, periodo,
    data_reuniao: ata.data_reuniao,
    participantes: (ata.participantes || '').trim(), pauta: (ata.pauta || '').trim(),
    deliberacoes: (ata.deliberacoes || '').trim(), encaminhamentos: (ata.encaminhamentos || '').trim(),
    registrado_por: userId, updated_at: new Date().toISOString(),
  }, { onConflict: 'school_id,turma_id,periodo' });
  if (error) throw error;
}
