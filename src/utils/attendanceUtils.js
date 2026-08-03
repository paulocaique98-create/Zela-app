/**
 * Utilitários para processamento de logs de check-in/out
 */

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
    // Extrai a data no fuso local para garantir agrupamento correto
    const dateObj = new Date(log.event_time);
    const dateStr = dateObj.toLocaleDateString('en-CA'); // Formato YYYY-MM-DD local

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
 * @returns {Object} - { minutos_excedentes, valor, valorFormatado, dentro_tolerancia, sem_saida }
 */
export function calcularHorasExtras(exitTimeIso, contractedExitTime) {
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
  
  // O horário contratado vem como "HH:MM". Precisamos criar um Date equivalente no mesmo dia da saída.
  const contractedDate = new Date(exitTimeIso);
  const [hours, minutes] = contractedExitTime.split(':').map(Number);
  contractedDate.setHours(hours, minutes, 0, 0);

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
