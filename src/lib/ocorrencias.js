// Ocorrências completas (módulo `ocorrencias`, PLANO_EXPANSAO_GESTAO.md item 7).
// Regras puras, acesso aos dados e anexos. Quem barra de verdade é o banco:
// RLS de student_incidents, RPCs ocorrencias_minhas, registrar_ciencia_ocorrencia
// e ocorrencias_alertas_saude, e o bucket privado incident-files.
import { supabase } from './supabase';
import { uploadFile, getSignedUrl } from './storage';

export const BUCKET_OCORRENCIAS = 'incident-files';
export const LIMITE_ANEXO_BYTES = 10 * 1024 * 1024;
export const TIPOS_ANEXO = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];

export const TIPOS = {
  comportamento: 'Comportamento',
  saude: 'Saúde',
  acidente: 'Acidente',
  disciplinar: 'Disciplinar',
  elogio: 'Elogio',
  outro: 'Outro',
};

export const GRAVIDADES = { leve: 'Leve', media: 'Média', grave: 'Grave' };
export const MEDIDAS = { advertencia: 'Advertência', suspensao: 'Suspensão' };

// Saúde e acidente mostram as restrições da ficha médica ao registrar.
export const TIPOS_COM_ALERTA_SAUDE = ['saude', 'acidente'];

export const GRAVIDADE_TOM = {
  leve: 'bg-surface-container text-on-surface-variant',
  media: 'bg-warning/15 text-warning',
  grave: 'bg-error/10 text-error',
};

export const COLUNAS_OCORRENCIA = 'id, student_id, tipo, gravidade, ocorrido_em, descricao, providencias, visivel_familia, exige_ciencia, ciencia_em, medida, medida_inicio, medida_fim, registrado_por, created_at, students:student_id(name, turma)';

export function hojeISO(base = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${base.getFullYear()}-${p(base.getMonth() + 1)}-${p(base.getDate())}`;
}

export function dataBR(iso) {
  if (!iso) return '';
  return String(iso).slice(0, 10).split('-').reverse().join('/');
}

export function formularioVazio() {
  return {
    student_id: '', tipo: 'comportamento', gravidade: 'leve', ocorrido_em: hojeISO(),
    descricao: '', providencias: '', visivel_familia: false, exige_ciencia: false,
    medida: '', medida_inicio: '', medida_fim: '',
  };
}

// Devolve a mensagem do primeiro problema, ou '' se estiver válido.
// `podeMedida` é só da Coordenação e da Direção (o banco repete a regra).
export function validarOcorrencia(f, { podeMedida = false } = {}) {
  if (!f.student_id) return 'Escolha o aluno.';
  if (!TIPOS[f.tipo]) return 'Escolha o tipo.';
  if (!GRAVIDADES[f.gravidade]) return 'Escolha a gravidade.';
  if (!f.ocorrido_em) return 'Informe a data.';
  if (f.ocorrido_em > hojeISO()) return 'A data não pode ser futura.';
  if (!String(f.descricao || '').trim()) return 'Descreva o que aconteceu.';
  if (f.descricao.length > 4000 || (f.providencias || '').length > 4000) return 'O texto passa de 4000 caracteres.';
  if (f.exige_ciencia && !f.visivel_familia) return 'Para pedir ciência, a família precisa ver a ocorrência.';
  if (f.medida) {
    if (!podeMedida) return 'Medida disciplinar é decisão da Coordenação.';
    if (!MEDIDAS[f.medida]) return 'Medida inválida.';
    if (f.medida_inicio && f.medida_fim && f.medida_fim < f.medida_inicio) return 'O fim da medida é antes do início.';
  }
  return '';
}

export function validarAnexo(file) {
  if (!file) return 'Escolha um arquivo.';
  if (!TIPOS_ANEXO.includes(file.type)) return 'Anexe imagem (PNG, JPG, WEBP) ou PDF.';
  if (file.size > LIMITE_ANEXO_BYTES) return 'O arquivo passa de 10 MB.';
  return '';
}

export function pendenteDeCiencia(o) {
  return Boolean(o.exige_ciencia) && !o.ciencia_em;
}

// Ordena do mais recente ao mais antigo (data da ocorrência, depois registro).
export function ordenarOcorrencias(lista) {
  return [...lista].sort((a, b) =>
    String(b.ocorrido_em).localeCompare(String(a.ocorrido_em))
    || String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

// Gravação: só o que o banco aceita, sem campos de ciência ou autoria.
export function montarPayload(f, { schoolId, userId, podeMedida = false }) {
  const base = {
    school_id: schoolId,
    registrado_por: userId,
    student_id: f.student_id,
    tipo: f.tipo,
    gravidade: f.gravidade,
    ocorrido_em: f.ocorrido_em,
    descricao: f.descricao.trim(),
    providencias: (f.providencias || '').trim(),
    visivel_familia: Boolean(f.visivel_familia),
    exige_ciencia: Boolean(f.visivel_familia && f.exige_ciencia),
  };
  if (podeMedida && f.medida) {
    base.medida = f.medida;
    base.medida_inicio = f.medida_inicio || null;
    base.medida_fim = f.medida_fim || null;
  }
  return base;
}

// ── Dados ──
export async function registrarOcorrencia(payload) {
  const { data, error } = await supabase.from('student_incidents').insert(payload).select('id').single();
  if (error) throw error;
  return data;
}

export async function listarOcorrencias(schoolId, { studentId, desde, ate, limite = 300 } = {}) {
  let q = supabase.from('student_incidents').select(COLUNAS_OCORRENCIA).eq('school_id', schoolId);
  if (studentId) q = q.eq('student_id', studentId);
  if (desde) q = q.gte('ocorrido_em', desde);
  if (ate) q = q.lte('ocorrido_em', ate);
  const { data, error } = await q.order('ocorrido_em', { ascending: false }).order('created_at', { ascending: false }).limit(limite);
  if (error) throw error;
  return data || [];
}

export async function listarVersoes(schoolId, incidentId) {
  const { data, error } = await supabase.from('student_incident_versions')
    .select('id, versao, snapshot, alterado_por, created_at')
    .eq('school_id', schoolId).eq('incident_id', incidentId).order('versao', { ascending: false }).limit(50);
  if (error) throw error;
  return data || [];
}

export async function atualizarOcorrencia(id, schoolId, f) {
  const { error } = await supabase.from('student_incidents').update({
    tipo: f.tipo, gravidade: f.gravidade, ocorrido_em: f.ocorrido_em,
    descricao: f.descricao.trim(), providencias: (f.providencias || '').trim(),
    visivel_familia: Boolean(f.visivel_familia), exige_ciencia: Boolean(f.visivel_familia && f.exige_ciencia),
    medida: f.medida || null, medida_inicio: f.medida ? (f.medida_inicio || null) : null, medida_fim: f.medida ? (f.medida_fim || null) : null,
  }).eq('id', id).eq('school_id', schoolId);
  if (error) throw error;
}

export async function alertasSaude(studentId) {
  const { data, error } = await supabase.rpc('ocorrencias_alertas_saude', { p_student_id: studentId });
  if (error) throw error;
  const f = Array.isArray(data) ? data[0] : data;
  if (!f) return [];
  return [...(f.restricoes_saude || []), ...(f.restricoes_alimentares || []).map(r => `Alimentar: ${r}`), ...(f.medicamentos || []).map(m => `Medicamento: ${m}`)]
    .filter(Boolean);
}

export async function minhasOcorrencias() {
  const { data, error } = await supabase.rpc('ocorrencias_minhas');
  if (error) throw error;
  return data || [];
}

export async function darCiencia(id) {
  const { error } = await supabase.rpc('registrar_ciencia_ocorrencia', { p_id: id });
  if (error) throw error;
}

// ── Anexos: incident-files/<school_id>/<incident_id>/<arquivo> ──
const pasta = (schoolId, id) => `${schoolId}/${id}`;
const nomeSeguro = (nome) => nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);

export async function listarAnexos(schoolId, id) {
  const { data, error } = await supabase.storage.from(BUCKET_OCORRENCIAS).list(pasta(schoolId, id), { limit: 50 });
  if (error) throw error;
  return (data || []).filter(a => a.name && !a.name.startsWith('.')).map(a => ({ nome: a.name, caminho: `${pasta(schoolId, id)}/${a.name}` }));
}

export async function enviarAnexo(schoolId, id, file) {
  const problema = validarAnexo(file);
  if (problema) throw new Error(problema);
  return uploadFile(BUCKET_OCORRENCIAS, `${pasta(schoolId, id)}/${Date.now()}-${nomeSeguro(file.name)}`, file);
}

export const linkDoAnexo = (caminho) => getSignedUrl(BUCKET_OCORRENCIAS, caminho, 300);

// Push: família (se visível) e Coordenação (se grave). Melhor esforço.
export async function notifyOcorrencia(incidentId) {
  try {
    const { error } = await supabase.functions.invoke('notify-ocorrencia', { body: { incident_id: incidentId } });
    if (error) console.warn('[notifyOcorrencia] Falha ao notificar:', error.message);
  } catch (err) {
    console.warn('[notifyOcorrencia] Falha ao notificar:', err);
  }
}
