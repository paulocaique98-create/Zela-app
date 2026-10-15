import { supabase } from './supabase';
import { logAction } from './auditLog';

// Quem pode LANÇAR a saída (o servidor confere de novo). Professora só vê.
export function podeLancarSaida(role) {
  return ['admin', 'gestao', 'gestao_pedagogica'].includes(role);
}

// "YYYY-MM-DD" de ontem no fuso de Brasília (dia padrão da tela).
export function ontemBrasilia(agora = new Date()) {
  const hoje = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const [y, m, d] = hoje.split('-').map(Number);
  const ontem = new Date(Date.UTC(y, m - 1, d - 1));
  return ontem.toISOString().slice(0, 10);
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
