// Quem fez a entrada ou a saída (30/09/2026): o nome de quem foi reconhecido
// no autoatendimento (rosto ou PIN) fica em attendance_logs.performed_by_name
// desde 17/09/2026. Sem nome e com o horário lançado ou ajustado pela escola
// (entrada manual, correção), mostra que foi a escola. Registros antigos,
// de antes de o nome ser guardado, ficam sem texto (não dá para afirmar).
export function textoQuemRegistrou(nome, lancadoPelaEscola = false) {
  const n = String(nome ?? '').trim();
  if (n) return `Registrado por ${n}`;
  return lancadoPelaEscola ? 'Lançado pela escola' : null;
}

// A partir de uma linha de attendance_logs.
export function quemRegistrouDoLog(log) {
  if (!log) return null;
  return textoQuemRegistrou(log.performed_by_name, Boolean(log.corrected));
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
