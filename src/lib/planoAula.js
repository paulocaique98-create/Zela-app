import { supabase } from './supabase';
import { uploadFile, removeFile, getSignedUrl } from './storage';

// Plano de aula (item 2 do PLANO_EXPANSAO_GESTAO). Valem os dois métodos:
// Montessori guarda só a turma (texto); Tradicional também guarda a atribuição.
export const BUCKET_PLANOS = 'lesson-plans';
export const LIMITE_TEXTO = 4000;
export const LIMITE_HABILIDADES = 2000;
export const LIMITE_ANEXO_BYTES = 10 * 1024 * 1024;
export const TIPOS_ANEXO = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];

export const STATUS_PLANO = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  aprovado: 'Aprovado',
  devolvido: 'Devolvido',
};

const COLUNAS = 'id, school_id, teacher_id, turma, atribuicao_id, periodo_inicio, periodo_fim, objetivos, conteudo, metodologia, recursos, avaliacao, habilidades, status, comentario_coordenacao, revisado_em, created_at, updated_at';
const CAMPOS_TEXTO = ['objetivos', 'conteudo', 'metodologia', 'recursos', 'avaliacao'];

export const planoVazio = (periodoInicio, periodoFim) => ({
  turma: '', atribuicao_id: null, periodo_inicio: periodoInicio, periodo_fim: periodoFim,
  objetivos: '', conteudo: '', metodologia: '', recursos: '', avaliacao: '', habilidades: '',
});

// Só rascunho e devolvido aceitam edição (a RLS e o trigger repetem a regra).
export const podeEditar = (plano) => !plano || plano.status === 'rascunho' || plano.status === 'devolvido';

// Datas ISO (YYYY-MM-DD) tratadas ao meio-dia para não sofrer com fuso.
const paraData = (iso) => new Date(`${iso}T12:00:00`);
const paraIso = (d) => d.toLocaleDateString('en-CA');
export const somarDias = (iso, n) => { const d = paraData(iso); d.setDate(d.getDate() + n); return paraIso(d); };
export const segundaDaSemana = (iso) => {
  const d = paraData(iso);
  const dia = d.getDay(); // 0 = domingo
  d.setDate(d.getDate() - (dia === 0 ? 6 : dia - 1));
  return paraIso(d);
};
export const semanaAtual = (hojeIso) => {
  const segunda = segundaDaSemana(hojeIso);
  return { inicio: segunda, fim: somarDias(segunda, 4) };
};
export const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

// Rascunho aceita plano incompleto; enviar exige o essencial preenchido.
export function validarPlano(plano, { envio = false } = {}) {
  if (!plano.turma?.trim()) return 'Escolha a turma.';
  if (!plano.periodo_inicio || !plano.periodo_fim) return 'Informe o período do plano.';
  if (plano.periodo_fim < plano.periodo_inicio) return 'O fim do período não pode ser antes do início.';
  for (const c of CAMPOS_TEXTO) {
    if ((plano[c] || '').length > LIMITE_TEXTO) return `O campo ${c} passou de ${LIMITE_TEXTO} caracteres.`;
  }
  if ((plano.habilidades || '').length > LIMITE_HABILIDADES) return `As habilidades passaram de ${LIMITE_HABILIDADES} caracteres.`;
  if (envio && !(plano.objetivos || '').trim()) return 'Preencha os objetivos antes de enviar.';
  if (envio && !(plano.conteudo || '').trim()) return 'Preencha o conteúdo antes de enviar.';
  return '';
}

export function validarAnexo(file) {
  if (!file) return 'Escolha um arquivo.';
  if (!TIPOS_ANEXO.includes(file.type)) return 'Anexe imagem (PNG, JPG, WEBP) ou PDF.';
  if (file.size > LIMITE_ANEXO_BYTES) return 'O arquivo passa de 10 MB.';
  return '';
}

// Agrupa por semana (segunda-feira do início do período), mais recente primeiro.
export function agruparPorSemana(planos) {
  const grupos = new Map();
  for (const p of planos) {
    const chave = segundaDaSemana(p.periodo_inicio);
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(p);
  }
  return [...grupos.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([segunda, itens]) => ({
      segunda,
      itens: itens.sort((a, b) => a.turma.localeCompare(b.turma, 'pt-BR')),
    }));
}

// Plano novo a partir de um anterior: copia o conteúdo, avança 7 dias e volta a rascunho.
export function duplicarPlano(plano) {
  return {
    ...planoVazio(somarDias(plano.periodo_inicio, 7), somarDias(plano.periodo_fim, 7)),
    turma: plano.turma, atribuicao_id: plano.atribuicao_id,
    objetivos: plano.objetivos, conteudo: plano.conteudo, metodologia: plano.metodologia,
    recursos: plano.recursos, avaliacao: plano.avaliacao, habilidades: plano.habilidades,
  };
}

const corpo = (plano) => ({
  turma: plano.turma.trim(),
  atribuicao_id: plano.atribuicao_id || null,
  periodo_inicio: plano.periodo_inicio,
  periodo_fim: plano.periodo_fim,
  objetivos: plano.objetivos || '',
  conteudo: plano.conteudo || '',
  metodologia: plano.metodologia || '',
  recursos: plano.recursos || '',
  avaliacao: plano.avaliacao || '',
  habilidades: plano.habilidades || '',
});

export async function listarMeusPlanos(schoolId, userId) {
  if (!schoolId || !userId) return [];
  const { data, error } = await supabase
    .from('lesson_plans').select(COLUNAS)
    .eq('school_id', schoolId).eq('teacher_id', userId)
    .order('periodo_inicio', { ascending: false }).limit(300);
  if (error) throw error;
  return data || [];
}

export const SECOES_PLANO = [
  ['objetivos', 'Objetivos'],
  ['conteudo', 'Conteúdo'],
  ['metodologia', 'Metodologia'],
  ['recursos', 'Recursos'],
  ['avaliacao', 'Avaliação'],
];

// Gestão: planos já enviados à revisão (rascunho da professora nunca aparece).
export async function listarPlanosDaEscola(schoolId) {
  if (!schoolId) return [];
  const { data, error } = await supabase
    .from('lesson_plans').select(COLUNAS)
    .eq('school_id', schoolId).neq('status', 'rascunho')
    .order('periodo_inicio', { ascending: false }).limit(500);
  if (error) throw error;
  return data || [];
}

// A Gestão só muda status e comentário; o trigger carimba revisado_por e revisado_em.
export async function revisarPlano(schoolId, id, status, comentario) {
  const { data, error } = await supabase
    .from('lesson_plans')
    .update({ status, comentario_coordenacao: comentario || null })
    .eq('id', id).eq('school_id', schoolId)
    .select(COLUNAS).single();
  if (error) throw error;
  return data;
}

// `enviar` grava direto como enviado; a RLS só deixa rascunho ou enviado.
export async function criarPlano(schoolId, userId, plano, { enviar = false } = {}) {
  const { data, error } = await supabase
    .from('lesson_plans')
    .insert({ ...corpo(plano), school_id: schoolId, teacher_id: userId, status: enviar ? 'enviado' : 'rascunho' })
    .select(COLUNAS).single();
  if (error) throw error;
  return data;
}

export async function atualizarPlano(schoolId, id, plano, { enviar = false } = {}) {
  const { data, error } = await supabase
    .from('lesson_plans')
    .update({ ...corpo(plano), status: enviar ? 'enviado' : 'rascunho' })
    .eq('id', id).eq('school_id', schoolId)
    .select(COLUNAS).single();
  if (error) throw error;
  return data;
}

export async function removerPlano(schoolId, id) {
  const { error } = await supabase.from('lesson_plans').delete().eq('id', id).eq('school_id', schoolId);
  if (error) throw error;
}

// Anexos ficam em lesson-plans/<school_id>/<plan_id>/<arquivo>.
const pasta = (schoolId, planoId) => `${schoolId}/${planoId}`;
const nomeSeguro = (nome) => nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);

export async function listarAnexos(schoolId, planoId) {
  const { data, error } = await supabase.storage.from(BUCKET_PLANOS).list(pasta(schoolId, planoId), { limit: 50 });
  if (error) throw error;
  return (data || []).filter(a => a.name && !a.name.startsWith('.')).map(a => ({ nome: a.name, caminho: `${pasta(schoolId, planoId)}/${a.name}` }));
}

export async function enviarAnexo(schoolId, planoId, file) {
  const problema = validarAnexo(file);
  if (problema) throw new Error(problema);
  return uploadFile(BUCKET_PLANOS, `${pasta(schoolId, planoId)}/${Date.now()}-${nomeSeguro(file.name)}`, file);
}

export const removerAnexo = (caminho) => removeFile(BUCKET_PLANOS, caminho);
export const linkDoAnexo = (caminho) => getSignedUrl(BUCKET_PLANOS, caminho, 300);
