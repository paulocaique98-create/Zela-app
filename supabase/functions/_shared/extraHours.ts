// Horas adicionais por aluno, por dia da semana (students.extra_hours) --
// desloca o horário de saída CONTRATADO efetivo naquele dia específico.
// Mesma lógica de src/utils/attendanceUtils.js (frontend), duplicada aqui
// porque Deno (Edge Functions) e o bundle do Vite não compartilham módulo
// -- mesmo padrão já aceito no projeto pra essa dupla implementação (ver
// calcularHorasExtras/check-attendance-delays, já duplicadas antes desta
// mudança). Qualquer ajuste na regra de negócio precisa ser espelhado nos
// dois lugares.

const EXTRA_HOURS_DAY_KEYS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'] as const;

// Deriva o dia da semana de uma string "YYYY-MM-DD" de forma imune a fuso
// horário (Date.UTC + getUTCDay, nunca setHours/getDay locais).
export function getDayKeyFromDateStr(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return EXTRA_HOURS_DAY_KEYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function getExtraHoursForDay(extraHours: Record<string, number> | null | undefined, dayKey: string): number {
  if (!extraHours || typeof extraHours !== 'object') return 0;
  const val = extraHours[dayKey];
  return typeof val === 'number' && val > 0 ? val : 0;
}

// Soma as horas extras do dia ao horário contratado ("HH:MM" ou "HH:MM:SS"),
// devolvendo o horário de saída EFETIVO daquele dia no formato "HH:MM".
export function applyExtraHoursToTime(contractedTime: string, extraHoursForDay: number): string {
  if (!contractedTime) return contractedTime;
  const [h, m] = contractedTime.split(':').map(Number);
  const totalMinutes = h * 60 + m + Math.round(extraHoursForDay * 60);
  const eh = Math.floor(totalMinutes / 60) % 24;
  const em = totalMinutes % 60;
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
}

// Atalho: horário contratado + extras do dia -> horário efetivo daquele dia.
export function getEffectiveExitTime(contractedTime: string | null, todayStr: string, extraHours: Record<string, number> | null | undefined): string | null {
  if (!contractedTime) return contractedTime;
  const dayKey = getDayKeyFromDateStr(todayStr);
  const extraForDay = getExtraHoursForDay(extraHours, dayKey);
  return extraForDay > 0 ? applyExtraHoursToTime(contractedTime, extraForDay) : contractedTime;
}
