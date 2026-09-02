// Horários personalizados por dia da semana (students.weekly_schedule) +
// config de cobrança por escola (schools.billing_config). Mesma lógica de
// src/utils/attendanceUtils.js (frontend), duplicada aqui porque Deno
// (Edge Functions) e o bundle do Vite não compartilham módulo -- mesmo
// padrão já aceito no projeto pra essa dupla implementação. Qualquer
// ajuste na regra de negócio precisa ser espelhado nos dois lugares.

const WEEK_DAY_KEYS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'] as const;

export interface DaySchedule {
  entry: string;
  exit: string;
}

export interface BillingConfig {
  early_checkin_tolerance_min: number;
  late_checkout_tolerance_min: number;
  hourly_rate_cents: number;
  charge_early_checkin: boolean;
}

export const DEFAULT_BILLING_CONFIG: BillingConfig = {
  early_checkin_tolerance_min: 5,
  late_checkout_tolerance_min: 15,
  hourly_rate_cents: 3000,
  charge_early_checkin: true,
}

export function mergeBillingConfig(schoolBillingConfig: Partial<BillingConfig> | null | undefined): BillingConfig {
  return { ...DEFAULT_BILLING_CONFIG, ...(schoolBillingConfig || {}) }
}

// Deriva o dia da semana de uma string "YYYY-MM-DD" de forma imune a fuso
// horário (Date.UTC + getUTCDay, nunca setHours/getDay locais).
export function getDayKeyFromDateStr(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return WEEK_DAY_KEYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

function normalizeTime(t: string | null | undefined): string | null {
  return t ? t.slice(0, 5) : (t ?? null)
}

// Horário efetivo (entrada, saída) do dia -- override de
// weeklySchedule[dayKey] se existir e válido, senão o horário-base.
export function getEffectiveSchedule(
  weeklySchedule: Record<string, DaySchedule> | null | undefined,
  dayKey: string,
  baseEntry: string | null,
  baseExit: string | null,
): { entry: string | null; exit: string | null } {
  const override = weeklySchedule && typeof weeklySchedule === 'object' ? weeklySchedule[dayKey] : null
  if (override && override.entry && override.exit) {
    return { entry: normalizeTime(override.entry), exit: normalizeTime(override.exit) }
  }
  return { entry: normalizeTime(baseEntry), exit: normalizeTime(baseExit) }
}

// Atalho: horário-base + weekly_schedule do dia -> horário de SAÍDA efetivo daquele dia.
export function getEffectiveExitTime(contractedExitTime: string | null, todayStr: string, weeklySchedule: Record<string, DaySchedule> | null | undefined): string | null {
  if (!contractedExitTime) return contractedExitTime
  const dayKey = getDayKeyFromDateStr(todayStr)
  return getEffectiveSchedule(weeklySchedule, dayKey, null, contractedExitTime).exit
}

// Atalho: horário-base + weekly_schedule do dia -> horário de ENTRADA efetivo daquele dia.
export function getEffectiveEntryTime(contractedEntryTime: string | null, todayStr: string, weeklySchedule: Record<string, DaySchedule> | null | undefined): string | null {
  if (!contractedEntryTime) return contractedEntryTime
  const dayKey = getDayKeyFromDateStr(todayStr)
  return getEffectiveSchedule(weeklySchedule, dayKey, contractedEntryTime, null).entry
}
