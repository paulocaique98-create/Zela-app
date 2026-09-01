/**
 * Utilitários para processamento de logs de check-in/out
 */

// Horas adicionais por aluno, por dia da semana (students.extra_hours) --
// desloca o horário de saída CONTRATADO efetivo naquele dia específico,
// então a tolerância/cobrança de hora extra passa a valer a partir do
// horário já ajustado, não do horário contratado fixo. Chaves em
// português sem acento (mesma convenção da coluna no banco).
const EXTRA_HOURS_DAY_KEYS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado']; // índice = Date.getUTCDay()

// Deriva o dia da semana de uma string "YYYY-MM-DD" de forma imune a fuso
// horário -- new Date(dateStr).getDay() usaria meia-noite UTC e converteria
// pro fuso LOCAL do dispositivo, podendo "virar o dia" errado; construir via
// Date.UTC(y,m,d) e ler getUTCDay() sempre dá o dia de semana daquela data
// específica, não importa onde o código rodar.
export function getDayKeyFromDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return EXTRA_HOURS_DAY_KEYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

// Horas extras configuradas pro aluno naquele dia específico (0 se não
// houver, se o valor não for número, ou se extraHours for null/undefined).
export function getExtraHoursForDay(extraHours, dayKey) {
  if (!extraHours || typeof extraHours !== 'object') return 0;
  const val = extraHours[dayKey];
  return typeof val === 'number' && val > 0 ? val : 0;
}

// Soma as horas extras do dia ao horário contratado ("HH:MM" ou "HH:MM:SS"),
// devolvendo o horário de saída EFETIVO daquele dia no mesmo formato "HH:MM".
export function applyExtraHoursToTime(contractedTime, extraHoursForDay) {
  if (!contractedTime) return contractedTime;
  const [h, m] = contractedTime.split(':').map(Number);
  const totalMinutes = h * 60 + m + Math.round(extraHoursForDay * 60);
  const eh = Math.floor(totalMinutes / 60) % 24;
  const em = totalMinutes % 60;
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
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

/**
 * Calcula as horas excedentes baseado no horário de saída real e o contratado.
 * 
 * Exemplos da Regra de Negócio:
 * Tolerância = 15 minutos. Valor da hora = R$ 30,00.
 * - 18:00 contratado + 15min tolerância = 18:15 é o limite.
 * - Check-out às 18:10 -> 10min -> tolerância não ultrapassada -> 0 excedente = R$ 0,00
 * - Check-out às 18:20 -> tolerância (18:15) ultrapassada. Calcula desde 18:15: 18:20 - 18:15 = 5 min excedentes -> 1 hora cheia = R$ 30,00
 * - Check-out às 19:00 -> tolerância ultrapassada. Calcula desde 18:15: 19:00 - 18:15 = 45 min excedentes -> 1 hora cheia = R$ 30,00
 * - Check-out às 19:16 -> tolerância ultrapassada. 19:16 - 18:15 = 61 min excedentes -> 2 horas cheias = R$ 60,00
 * 
 * @param {string|null} exitTimeIso - O horário real de saída em formato ISO.
 * @param {string|null} contractedExitTime - O horário contratado no formato "HH:MM".
 * @param {Object|null} extraHours - students.extra_hours (opcional) -- se o dia da
 *   saída tiver horas extras configuradas, o horário contratado usado no cálculo é
 *   deslocado por elas antes de aplicar a tolerância (ex.: contratado 15h + 2h de
 *   extra na segunda = tolerância conta a partir de 17h nesse dia específico).
 * @returns {Object} - { minutos_excedentes, valor, valorFormatado, dentro_tolerancia, sem_saida }
 */
export function calcularHorasExtras(exitTimeIso, contractedExitTime, extraHours = null) {
  if (!exitTimeIso) {
    return { minutos_excedentes: 0, valor: 0, valorFormatado: 'R$ 0,00', dentro_tolerancia: true, sem_saida: true };
  }

  if (!contractedExitTime) {
    // Se não houver horário contratado definido, não tem como calcular excedente
    return { minutos_excedentes: 0, valor: 0, valorFormatado: 'R$ 0,00', dentro_tolerancia: true, sem_saida: false };
  }

  const VALOR_POR_HORA = 30.00;
  const MINUTOS_TOLERANCIA = 15;

  const exitDate = new Date(exitTimeIso);

  // O horário contratado vem como "HH:MM" em horário de Brasília. Construímos o instante
  // equivalente fixando o offset -03:00 (Brasil não observa horário de verão atualmente),
  // em vez de usar setHours(), que interpretaria o horário no fuso do dispositivo local
  // e produziria cobranças erradas para admins fora do fuso de Brasília.
  const brasiliaDateStr = exitDate.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

  // Horário contratado EFETIVO daquele dia -- soma as horas extras do dia da
  // semana correspondente (se houver) antes de calcular a tolerância.
  const dayKey = getDayKeyFromDateStr(brasiliaDateStr);
  const extraForDay = getExtraHoursForDay(extraHours, dayKey);
  const effectiveExitTime = extraForDay > 0 ? applyExtraHoursToTime(contractedExitTime, extraForDay) : contractedExitTime;

  const [hours, minutes] = effectiveExitTime.split(':').map(Number);
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const contractedDate = new Date(`${brasiliaDateStr}T${hh}:${mm}:00-03:00`);

  const diffMs = exitDate.getTime() - contractedDate.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes <= MINUTOS_TOLERANCIA) {
    return { 
      minutos_excedentes: 0, 
      valor: 0, 
      valorFormatado: 'R$ 0,00', 
      dentro_tolerancia: true, 
      sem_saida: false 
    };
  }

  // Passou da tolerância: calcular os minutos excedentes APÓS a tolerância (ex: se saiu 18:20 e tolerância ia até 18:15, cobrar 5 minutos)
  const minutosExcedentesCobranca = diffMinutes - MINUTOS_TOLERANCIA;
  
  const horasCobradas = Math.ceil(minutosExcedentesCobranca / 60);
  const valor = horasCobradas * VALOR_POR_HORA;
  const valorFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);

  return {
    minutos_excedentes: minutosExcedentesCobranca,
    valor: valor,
    valorFormatado: valorFormatado,
    dentro_tolerancia: false,
    sem_saida: false
  };
}
