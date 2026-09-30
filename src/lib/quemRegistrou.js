// Quem fez a entrada ou a saída (30/09/2026): o nome de quem foi reconhecido
// no autoatendimento (rosto ou PIN) fica em attendance_logs.performed_by_name
// desde 17/09/2026. Sem nome e com o horário lançado ou ajustado pela escola
// (entrada manual, correção), mostra que foi a escola; sem nome e marcado
// direto pela Recepção, "Registrado pela escola". Registros antigos, de
// antes de o nome ser guardado, ficam sem texto (não dá para afirmar).
export function textoQuemRegistrou(nome, lancadoPelaEscola = false) {
  const n = String(nome ?? '').trim();
  if (n) return `Registrado por ${n}`;
  return lancadoPelaEscola ? 'Lançado pela escola' : null;
}

// A partir de quando o nome de quem fez passou a ser guardado (primeiro
// registro com nome na produção: 17/09/2026 21:15). Depois disso, registro
// sem nome e sem ajuste foi marcado direto pela Recepção, sem ninguém
// reconhecido no autoatendimento (até 27/09 isso ainda era possível; em
// 24 e 25/09 aconteceu com a tela do totem travada depois de uma
// publicação).
export const INICIO_NOME_DE_QUEM_FEZ = '2026-09-17T21:00:00-03:00';

// A partir de uma linha de attendance_logs (precisa de event_time).
export function quemRegistrouDoLog(log) {
  if (!log) return null;
  const texto = textoQuemRegistrou(log.performed_by_name, Boolean(log.corrected));
  if (texto) return texto;
  if (log.event_time && new Date(log.event_time) >= new Date(INICIO_NOME_DE_QUEM_FEZ)) return 'Registrado pela escola';
  return null;
}

// Acompanhamento de hoje: para cada aluno, quem fez a última entrada e a
// última saída do dia ({ [studentId]: { entrada, saida } }).
export function quemFezHoje(logs) {
  const porAluno = {};
  const ordenados = [...(logs || [])].sort((a, b) => new Date(a.event_time) - new Date(b.event_time));
  for (const log of ordenados) {
    const atual = porAluno[log.student_id] || { entrada: null, saida: null };
    if (log.event_type === 'entry') atual.entrada = quemRegistrouDoLog(log);
    if (log.event_type === 'exit') atual.saida = quemRegistrouDoLog(log);
    porAluno[log.student_id] = atual;
  }
  return porAluno;
}
