/**
 * Utilitários para processamento de logs de check-in/out
 */

// Data (YYYY-MM-DD) no fuso de Brasília, independente do fuso do
// dispositivo/servidor. new Date().toISOString().split('T')[0] pega a data em
// UTC, que já está "amanhã" entre 21h e 23h59 no horário de Brasília
// (UTC-3) — isso fazia o filtro "Hoje" de Horas Extras/Histórico virar um
// intervalo vazio (buscando um dia que ainda não tem registro nenhum)
// exatamente nesse horário. Mesma lógica de getBrasiliaDateStr em App.jsx,
// centralizada aqui pra ser reaproveitada por todas as telas com filtro de
// período.
export const getBrasiliaDateStr = (date = new Date()) =>
  date.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

// Extrai o horário curto "HH:mm" de forma segura de qualquer formato salvo
// em students.today_entry/today_exit — tanto o legado "YYYY-MM-DD|HH:mm:ss"
// quanto um horário solto. Movido de App.jsx pra ser reaproveitado também
// pelo hook useRealtimeMonitor (mesma formatação usada nos dois lugares).
export const parseShortTime = (timeStr, todayDate = null) => {
  if (!timeStr) return null;
  if (timeStr.includes('|')) {
    const parts = timeStr.split('|');
    const datePart = parts[0];
    const timePart = parts[1] || '';
    if (todayDate && datePart !== todayDate) return null;
    return timePart.substring(0, 5);
  }
  return timeStr.substring(0, 5);
};

// Horários personalizados por dia da semana (students.weekly_schedule) --
// substituiu a versão anterior (extra_hours, só somava minutos à saída):
// agora entrada E saída podem ser sobrescritas por dia específico. Um dia
// ausente da chave (ou o valor todo null/undefined) usa o horário-base do
// aluno (contracted_entry_time/contracted_exit_time), comportamento de
// sempre. Chaves em português sem acento (mesma convenção da coluna).
const WEEK_DAY_KEYS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado']; // índice = Date.getUTCDay()

// Config de cobrança de hora extra por escola (schools.billing_config) --
// esses eram valores fixos no código; viram configuráveis, com esses
// mesmos números como default (nenhuma escola muda de comportamento até
// o admin mexer explicitamente na tela de Configurações).
export const DEFAULT_BILLING_CONFIG = {
  early_checkin_tolerance_min: 5,
  late_checkout_tolerance_min: 15,
  hourly_rate_cents: 3000, // R$ 30,00
  charge_early_checkin: true,
};

export function mergeBillingConfig(schoolBillingConfig) {
  return { ...DEFAULT_BILLING_CONFIG, ...schoolBillingConfig };
}

// Item #35 do roadmap: alerta de ausência prolongada (schools.absence_alert_config).
// Mesmo par default/merge acima, espelhado também em
// supabase/functions/_shared/extraHours.ts (Deno não compartilha módulo com
// o bundle do Vite, mesmo padrão já aceito no projeto).
export const DEFAULT_ABSENCE_ALERT_CONFIG = {
  enabled: false,
  consecutive_days_threshold: 3,
};

export function mergeAbsenceAlertConfig(schoolConfig) {
  return { ...DEFAULT_ABSENCE_ALERT_CONFIG, ...schoolConfig };
}

// Deriva o dia da semana de uma string "YYYY-MM-DD" de forma imune a fuso
// horário -- new Date(dateStr).getDay() usaria meia-noite UTC e converteria
// pro fuso LOCAL do dispositivo, podendo "virar o dia" errado; construir via
// Date.UTC(y,m,d) e ler getUTCDay() sempre dá o dia de semana daquela data
// específica, não importa onde o código rodar.
export function getDayKeyFromDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return WEEK_DAY_KEYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

// Horário efetivo (entrada e saída) do aluno naquele dia -- override de
// weekly_schedule[dayKey] se existir e válido, senão o horário-base.
// baseEntry/baseExit podem vir como "HH:MM" ou "HH:MM:SS" (o banco grava
// contracted_*_time como time, retorna com segundos); normaliza pra "HH:MM".
function normalizeTime(t) {
  return t ? t.slice(0, 5) : t;
}

export function getEffectiveSchedule(weeklySchedule, dayKey, baseEntry, baseExit) {
  const override = weeklySchedule && typeof weeklySchedule === 'object' ? weeklySchedule[dayKey] : null;
  if (override && override.entry && override.exit) {
    return { entry: normalizeTime(override.entry), exit: normalizeTime(override.exit) };
  }
  return { entry: normalizeTime(baseEntry), exit: normalizeTime(baseExit) };
}

// Constrói o instante (Date) equivalente a um horário "HH:MM" na data
// (string "YYYY-MM-DD") informada, fixando o offset -03:00 (Brasil não
// observa horário de verão atualmente) -- nunca usar setHours(), que
// interpretaria o horário no fuso do dispositivo local e produziria
// cálculos errados pra admins fora do fuso de Brasília.
function instantFromBrasiliaTime(dateStr, timeHHMM) {
  return new Date(`${dateStr}T${timeHHMM}:00-03:00`);
}

/**
 * Agrupa os logs de frequência por dia e por aluno.
 * Regra de negócio:
 * - Usar sempre o PRIMEIRO evento de 'entry' do dia como entrada oficial.
 * - Usar sempre o ÚLTIMO evento de 'exit' do dia como saída oficial.
 *
 * @param {Array} logs - Array de objetos brutos retornados do supabase (attendance_logs).
 * @returns {Array} - Array de objetos agrupados: { student_id, date, studentData, entryLog, exitLog }
 */
export function agruparEventosPorDia(logs) {
  if (!logs || !logs.length) return [];

  const byStudentDate = {};

  logs.forEach(log => {
    // Extrai a data no fuso de Brasília (fixo) para garantir agrupamento correto
    // independente do fuso do dispositivo que está processando os logs.
    const dateObj = new Date(log.event_time);
    const dateStr = dateObj.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // Formato YYYY-MM-DD

    const key = `${log.student_id}_${dateStr}`;
    if (!byStudentDate[key]) {
      byStudentDate[key] = {
        student_id: log.student_id,
        dateStr: dateStr,
        studentData: log.students, // assume que o select fez join com students
        events: []
      };
    }
    byStudentDate[key].events.push(log);
  });

  const result = [];

  Object.values(byStudentDate).forEach(group => {
    // Ordenar os eventos por horário crescente
    group.events.sort((a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime());

    const entries = group.events.filter(e => e.event_type === 'entry');
    const exits = group.events.filter(e => e.event_type === 'exit');

    // Pega o primeiro entry e o último exit
    const firstEntry = entries.length > 0 ? entries[0] : null;
    const lastExit = exits.length > 0 ? exits[exits.length - 1] : null;

    if (firstEntry || lastExit) {
      result.push({
        student_id: group.student_id,
        date: group.dateStr,
        studentData: group.studentData,
        entryLog: firstEntry,
        exitLog: lastExit
      });
    }
  });

  return result;
}

function formatCurrency(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

/**
 * Calcula as horas excedentes baseado no horário de saída real e o contratado.
 *
 * Exemplos da Regra de Negócio (com a tolerância/valor padrão):
 * Tolerância = 15 minutos. Valor da hora = R$ 30,00.
 * A tolerância só decide SE cobra (gatilho) -- uma vez ultrapassada em
 * qualquer minuto, a contagem de horas cheias volta pro horário ORIGINAL
 * contratado (18:00), não pro fim da tolerância (18:15). Passar 1 minuto
 * da tolerância já fecha a 1ª hora inteira; passar de 60 minutos totais
 * já abre a 2ª hora inteira, e assim por diante.
 * - 18:00 contratado + 15min tolerância = 18:15 é o limite.
 * - Check-out às 18:10 -> 10min -> tolerância não ultrapassada -> 0 excedente = R$ 0,00
 * - Check-out às 18:15 -> 15min -> ainda dentro da tolerância (limite inclusive) -> R$ 0,00
 * - Check-out às 18:16 -> 16min, passou 1 min da tolerância -> conta 1h cheia (desde 18:00) -> R$ 30,00
 * - Check-out às 19:00 -> 60min -> ainda dentro da 1ª hora cheia -> R$ 30,00
 * - Check-out às 19:01 -> 61min, passou de 60min -> abre a 2ª hora cheia -> R$ 60,00
 * - Check-out às 21:16 -> 196min -> 4ª hora cheia (ceil(196/60)=4) -> R$ 120,00
 *
 * @param {string|null} exitTimeIso - O horário real de saída em formato ISO.
 * @param {string|null} contractedExitTime - O horário-base contratado ("HH:MM" ou "HH:MM:SS").
 * @param {Object|null} weeklySchedule - students.weekly_schedule (opcional) -- se o dia
 *   da saída tiver um horário próprio configurado, ele substitui o horário-base antes
 *   de aplicar a tolerância.
 * @param {Object|null} billingConfig - schools.billing_config (opcional, mesclado com
 *   DEFAULT_BILLING_CONFIG) -- tolerância e valor da hora configuráveis por escola.
 * @param {boolean} isentoHoraExtra - students.isento_hora_extra (aluno bolsista) --
 *   se true, nunca gera cobrança nem excedente, independente do horário.
 * @returns {Object} - { minutos_excedentes, valor, valorFormatado, dentro_tolerancia, sem_saida }
 */
export function calcularHorasExtras(exitTimeIso, contractedExitTime, weeklySchedule = null, billingConfig = null, isentoHoraExtra = false) {
  if (isentoHoraExtra) {
    return { minutos_excedentes: 0, valor: 0, valorFormatado: 'R$ 0,00', dentro_tolerancia: true, sem_saida: !exitTimeIso };
  }

  if (!exitTimeIso) {
    return { minutos_excedentes: 0, valor: 0, valorFormatado: 'R$ 0,00', dentro_tolerancia: true, sem_saida: true };
  }

  if (!contractedExitTime) {
    // Se não houver horário contratado definido, não tem como calcular excedente
    return { minutos_excedentes: 0, valor: 0, valorFormatado: 'R$ 0,00', dentro_tolerancia: true, sem_saida: false };
  }

  const config = mergeBillingConfig(billingConfig);
  const exitDate = new Date(exitTimeIso);
  const brasiliaDateStr = exitDate.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const dayKey = getDayKeyFromDateStr(brasiliaDateStr);

  const { exit: effectiveExitTime } = getEffectiveSchedule(weeklySchedule, dayKey, null, contractedExitTime);
  const contractedDate = instantFromBrasiliaTime(brasiliaDateStr, effectiveExitTime);

  const diffMs = exitDate.getTime() - contractedDate.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes <= config.late_checkout_tolerance_min) {
    return {
      minutos_excedentes: 0,
      valor: 0,
      valorFormatado: 'R$ 0,00',
      dentro_tolerancia: true,
      sem_saida: false
    };
  }

  // Passou da tolerância: a tolerância só decidiu QUE cobra -- a contagem de
  // horas cheias usa o tempo total desde o horário ORIGINAL contratado
  // (diffMinutes), não o tempo subtraído da tolerância. Ex: saiu 18:16
  // (16min, 1 min além da tolerância) já fecha 1h cheia; saiu 19:01 (61min)
  // já abre a 2ª hora -- mesma regra validada com o usuário (ver exemplos
  // no comentário da função).
  const horasCobradas = Math.ceil(diffMinutes / 60);
  const valor = horasCobradas * (config.hourly_rate_cents / 100);

  return {
    minutos_excedentes: diffMinutes,
    valor: valor,
    valorFormatado: formatCurrency(valor),
    dentro_tolerancia: false,
    sem_saida: false
  };
}

/**
 * Calcula a cobrança de check-in ANTECIPADO -- simétrico a calcularHorasExtras,
 * mas do lado da entrada: se o aluno chegar mais de `early_checkin_tolerance_min`
 * minutos ANTES do horário de entrada contratado/efetivo daquele dia, cobra a
 * partir desse ponto. Ativado por `billingConfig.charge_early_checkin` (a escola
 * pode desligar a cobrança desse lado sem desligar a de saída tardia).
 *
 * @param {string|null} entryTimeIso - O horário real de entrada em formato ISO.
 * @param {string|null} contractedEntryTime - O horário-base contratado ("HH:MM" ou "HH:MM:SS").
 * @param {Object|null} weeklySchedule - students.weekly_schedule (opcional).
 * @param {Object|null} billingConfig - schools.billing_config (opcional).
 * @param {boolean} isentoHoraExtra - students.isento_hora_extra (aluno bolsista) --
 *   se true, nunca gera cobrança nem excedente, independente do horário.
 * @returns {Object} - { minutos_antecipados, valor, valorFormatado, dentro_tolerancia, sem_entrada }
 */
export function calcularEntradaAntecipada(entryTimeIso, contractedEntryTime, weeklySchedule = null, billingConfig = null, isentoHoraExtra = false) {
  if (isentoHoraExtra) {
    return { minutos_antecipados: 0, valor: 0, valorFormatado: 'R$ 0,00', dentro_tolerancia: true, sem_entrada: !entryTimeIso };
  }

  if (!entryTimeIso) {
    return { minutos_antecipados: 0, valor: 0, valorFormatado: 'R$ 0,00', dentro_tolerancia: true, sem_entrada: true };
  }

  const config = mergeBillingConfig(billingConfig);

  if (!contractedEntryTime || !config.charge_early_checkin) {
    return { minutos_antecipados: 0, valor: 0, valorFormatado: 'R$ 0,00', dentro_tolerancia: true, sem_entrada: false };
  }

  const entryDate = new Date(entryTimeIso);
  const brasiliaDateStr = entryDate.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const dayKey = getDayKeyFromDateStr(brasiliaDateStr);

  const { entry: effectiveEntryTime } = getEffectiveSchedule(weeklySchedule, dayKey, contractedEntryTime, null);
  const contractedDate = instantFromBrasiliaTime(brasiliaDateStr, effectiveEntryTime);

  // Diferença em minutos de QUANTO ANTES o aluno chegou (positivo = chegou antes).
  const diffMinutes = Math.floor((contractedDate.getTime() - entryDate.getTime()) / 60000);

  if (diffMinutes <= config.early_checkin_tolerance_min) {
    return { minutos_antecipados: 0, valor: 0, valorFormatado: 'R$ 0,00', dentro_tolerancia: true, sem_entrada: false };
  }

  // Mesma regra de calcularHorasExtras: a tolerância só decide SE cobra --
  // a contagem de horas cheias usa o tempo total antes do horário
  // contratado (diffMinutes), não o tempo subtraído da tolerância.
  const horasCobradas = Math.ceil(diffMinutes / 60);
  const valor = horasCobradas * (config.hourly_rate_cents / 100);

  return {
    minutos_antecipados: diffMinutes,
    valor: valor,
    valorFormatado: formatCurrency(valor),
    dentro_tolerancia: false,
    sem_entrada: false
  };
}
