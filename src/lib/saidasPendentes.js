import { supabase } from './supabase';
import { logAction } from './auditLog';

// Quem pode LANÇAR a saída (o servidor confere de novo). Professora só vê.
export function podeLancarSaida(role) {
  return ['recepcao', 'gestao', 'gestao_pedagogica'].includes(role);
}

// "YYYY-MM-DD" de ontem no fuso de Brasília (dia padrão da tela).
export function ontemBrasilia(agora = new Date()) {
  const hoje = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const [y, m, d] = hoje.split('-').map(Number);
  const ontem = new Date(Date.UTC(y, m - 1, d - 1));
  return ontem.toISOString().slice(0, 10);
}

// "HH:MM[:SS]" -> minutos desde 00:00 (ou null).
function minutosDoDia(hhmm) {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

// Limite de entrada do aluno em minutos: horário contratado + N horas; sem
// horário contratado, usa o horário fixo da escola. Sem regra: null.
// Espelha public._limite_entrada (o servidor é quem decide de verdade).
export function limiteEntradaMin(contractedEntry, rules) {
  if (!rules) return null;
  const contratado = minutosDoDia(contractedEntry);
  if (rules.entry_limit_hours != null && contratado != null) {
    return Math.min(contratado + Math.round(Number(rules.entry_limit_hours) * 60), 1439);
  }
  return minutosDoDia(rules.entry_limit_fixed);
}

// Um único registro 'entry' feito a partir do limite é, na prática, a saída:
// o que falta é a ENTRADA. Espelha list_pendencias_ponto.
export function classificarPendencia({ totalRegistros, horaRegistro, contractedEntry, rules }) {
  const limite = limiteEntradaMin(contractedEntry, rules);
  const hora = minutosDoDia(horaRegistro);
  if (totalRegistros === 1 && limite != null && hora != null && hora >= limite) return 'entrada';
  return 'saida';
}

const DIAS_SEMANA = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

// Período contratado do aluno no dia "YYYY-MM-DD": usa o horário do dia da
// semana (weekly_schedule) quando tem entrada e saída; senão o geral.
export function horarioContratadoDoDia(student, dateStr) {
  if (!student || !dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dia = DIAS_SEMANA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const ov = student.weekly_schedule && typeof student.weekly_schedule === 'object' ? student.weekly_schedule[dia] : null;
  const usaDia = ov && ov.entry && ov.exit;
  const entry = (usaDia ? ov.entry : student.contracted_entry_time) || null;
  const exit = (usaDia ? ov.exit : student.contracted_exit_time) || null;
  if (!entry && !exit) return null;
  return { entry: entry ? String(entry).slice(0, 5) : null, exit: exit ? String(exit).slice(0, 5) : null };
}

// Pendências do dia (kind = 'saida' | 'entrada'). Filtro de escola/turma é do servidor.
export async function listPendenciasPonto(dateStr) {
  const { data, error } = await supabase.rpc('list_pendencias_ponto', { p_date: dateStr || null });
  if (error) throw error;
  return data || [];
}

// Pendências de um período "YYYY-MM-DD" a "YYYY-MM-DD" (máx. 31 dias, até ontem).
export async function listPendenciasPeriodo(de, ate) {
  const { data, error } = await supabase.rpc('list_pendencias_ponto_periodo', { p_from: de, p_to: ate });
  if (error) throw error;
  return data || [];
}

// Lança a entrada que faltou; o registro único do dia vira a saída.
export async function lancarEntradaPendente({ studentId, entryIso, reasonCode, reasonDetail, minutesDelta, schoolId, actorId }) {
  const { data, error } = await supabase.rpc('lancar_entrada_pendente', {
    p_student_id: studentId,
    p_entry_time: entryIso,
    p_reason_code: reasonCode,
    p_reason_detail: reasonDetail || null,
    p_minutes_delta: minutesDelta || 0,
  });
  if (error) throw error;
  if (schoolId && actorId) {
    logAction({
      actorId, schoolId, action: 'correct_attendance', entityType: 'attendance_log', entityId: null,
      details: { student_id: studentId, event_type: 'entry', reason_code: reasonCode, status: data?.status, manual_entry: true, entrada_pendente: true },
    });
  }
  return data;
}

// Alunos com entrada no dia e sem saída. Filtro de escola/turma é do servidor.
export async function listSaidasPendentes(dateStr) {
  const { data, error } = await supabase.rpc('list_saidas_pendentes', { p_date: dateStr || null });
  if (error) throw error;
  return data || [];
}

// Lança a saída esquecida. O servidor decide se aplica na hora ou se fica
// pendente de aprovação da Gestão (quando gera hora extra).
export async function lancarSaidaPendente({ studentId, exitIso, reasonCode, reasonDetail, minutesDelta, schoolId, actorId }) {
  const { data, error } = await supabase.rpc('lancar_saida_pendente', {
    p_student_id: studentId,
    p_exit_time: exitIso,
    p_reason_code: reasonCode,
    p_reason_detail: reasonDetail || null,
    p_minutes_delta: minutesDelta || 0,
  });
  if (error) throw error;

  if (schoolId && actorId) {
    logAction({
      actorId,
      schoolId,
      action: 'correct_attendance',
      entityType: 'attendance_log',
      entityId: null,
      details: { student_id: studentId, event_type: 'exit', reason_code: reasonCode, status: data?.status, manual_entry: true, saida_pendente: true },
    });
  }
  return data;
}
