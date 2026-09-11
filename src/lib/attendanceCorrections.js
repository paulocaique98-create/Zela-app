import { supabase } from './supabase';
import { calcularHorasExtras, calcularEntradaAntecipada, mergeBillingConfig } from '../utils/attendanceUtils';
import { logAction } from './auditLog';

// Compara o valor cobrado ANTES e DEPOIS do novo horário, usando as MESMAS
// funções do relatório de horas extras (attendanceUtils.js) — nunca uma
// lógica de cobrança paralela. Retorna o suficiente pro modal mostrar a
// prévia e pra RPC decidir se precisa de aprovação de outro admin.
export function evaluateCorrectionImpact({ eventType, originalIso, newIso, student, billingConfig }) {
  const config = mergeBillingConfig(billingConfig);
  const weeklySchedule = student?.weekly_schedule || null;

  if (eventType === 'exit') {
    const before = calcularHorasExtras(originalIso, student?.contracted_exit_time, weeklySchedule, config);
    const after = calcularHorasExtras(newIso, student?.contracted_exit_time, weeklySchedule, config);
    return {
      valorAntes: before.valor,
      valorDepois: after.valor,
      minutosAntes: before.minutos_excedentes,
      minutosDepois: after.minutos_excedentes,
      minutesDelta: after.minutos_excedentes - before.minutos_excedentes,
      increasesBilling: after.valor > before.valor,
    };
  }

  const before = calcularEntradaAntecipada(originalIso, student?.contracted_entry_time, weeklySchedule, config);
  const after = calcularEntradaAntecipada(newIso, student?.contracted_entry_time, weeklySchedule, config);
  return {
    valorAntes: before.valor,
    valorDepois: after.valor,
    minutosAntes: before.minutos_antecipados,
    minutosDepois: after.minutos_antecipados,
    minutesDelta: after.minutos_antecipados - before.minutos_antecipados,
    increasesBilling: after.valor > before.valor,
  };
}

// Solicita a correção de um registro de attendance_logs já existente. Se
// `impact.increasesBilling` for false, a RPC já aplica na hora; se for true,
// fica pendente até outro admin aprovar (ver approveAttendanceCorrection).
export async function requestAttendanceCorrection({ logId, newEventTime, newEventType, reasonCode, reasonDetail, impact, schoolId, actorId }) {
  const { data, error } = await supabase.rpc('request_attendance_correction', {
    p_log_id: logId,
    p_new_event_time: newEventTime,
    p_reason_code: reasonCode,
    p_reason_detail: reasonDetail || null,
    p_minutes_delta: impact.minutesDelta,
    p_increases_billing: impact.increasesBilling,
    p_new_event_type: newEventType || null,
  });
  if (error) throw error;

  // Best-effort: entra também no log de auditoria genérico (AdminAuditLog.jsx),
  // sem duplicar a lógica de exibição — não bloqueia se falhar.
  if (schoolId && actorId) {
    logAction({
      actorId,
      schoolId,
      action: 'correct_attendance',
      entityType: 'attendance_log',
      entityId: logId,
      details: { reason_code: reasonCode, status: data?.status, minutes_delta: impact.minutesDelta },
    });
  }

  return data;
}

// Remove uma marcação de entrada/saída "fantasma" — gravada em
// students.today_entry/today_exit no momento de uma solicitação que depois
// foi cancelada (ou qualquer outra causa de horário órfão), sem log
// correspondente em attendance_logs. Aplica na hora (nunca precisa de
// aprovação: só reduz o que aparece, nunca aumenta cobrança), mas fica
// registrada em attendance_corrections igual às demais correções.
export async function deleteStaleAttendanceMarking({ studentId, eventType, reasonCode, reasonDetail, schoolId, actorId }) {
  const { data, error } = await supabase.rpc('delete_stale_attendance_marking', {
    p_student_id: studentId,
    p_event_type: eventType,
    p_reason_code: reasonCode,
    p_reason_detail: reasonDetail || null,
  });
  if (error) throw error;

  if (schoolId && actorId) {
    logAction({
      actorId,
      schoolId,
      action: 'delete_stale_attendance_marking',
      entityType: 'attendance_log',
      entityId: null,
      details: { student_id: studentId, event_type: eventType, reason_code: reasonCode },
    });
  }

  return data;
}

// Aprova ou rejeita uma correção pendente (outro admin da escola, ou o
// developer — nunca quem solicitou).
export async function approveAttendanceCorrection(correctionId, approve) {
  const { data, error } = await supabase.rpc('approve_attendance_correction', {
    p_correction_id: correctionId,
    p_approve: approve,
  });
  if (error) throw error;
  return data;
}
