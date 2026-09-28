// Protótipo do assistente de mudança de turma (28/09/2026).
//
// Hoje a sugestão usa SÓ a idade: compara a idade da criança com a idade das
// crianças de cada turma (a própria escola, sem configurar nada). A mesma
// turma em turnos diferentes ("Kids I · Matutino" e "Kids I · Vespertino") é
// um nível só; o nível seguinte é o de idade típica logo acima, e a turma
// sugerida é a desse nível no mesmo turno da criança.
//
// Ideia para o assistente completo (ainda não feito, registrado aqui para não
// esquecer): somar à idade os dados dos relatórios (Semestral, Mitigação),
// marcos de desenvolvimento e a avaliação da professora, e só então dizer à
// escola se está na hora de evoluir o aluno de turma.

// Um nível só conta como "seguinte" se a idade típica for ao menos isso maior.
export const MESMO_NIVEL_MESES = 6;
// Idade típica de um nível calculada só com pelo menos esta quantidade de crianças.
export const MIN_ALUNOS_POR_NIVEL = 3;

const PALAVRAS_DE_TURNO = /\b(matutino|vespertino|noturno|integral|manha|tarde|noite)\b/g;

// Nome do nível: o nome da turma sem o turno, sem acento e sem pontuação.
export function nivelDaTurma(nome) {
  return String(nome || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(PALAVRAS_DE_TURNO, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
// Mais novo que a idade típica da turma por esta margem: conferir o cadastro.
export const CONFERIR_ABAIXO_MESES = 18;

export function idadeEmMeses(birthDate, hoje = new Date()) {
  if (!birthDate) return null;
  const nasc = new Date(`${String(birthDate).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(nasc.getTime())) return null;
  let meses = (hoje.getFullYear() - nasc.getFullYear()) * 12 + (hoje.getMonth() - nasc.getMonth());
  if (hoje.getDate() < nasc.getDate()) meses -= 1;
  return meses >= 0 ? meses : null;
}

export function formatIdade(meses) {
  if (meses === null || meses === undefined) return 'idade não informada';
  if (meses < 12) return `${meses} ${meses === 1 ? 'mês' : 'meses'}`;
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  const a = `${anos} ${anos === 1 ? 'ano' : 'anos'}`;
  return resto ? `${a} e ${resto} ${resto === 1 ? 'mês' : 'meses'}` : a;
}

function quantil(ordenados, q) {
  if (!ordenados.length) return null;
  const pos = (ordenados.length - 1) * q;
  const base = Math.floor(pos);
  const resto = pos - base;
  const prox = ordenados[base + 1] ?? ordenados[base];
  return ordenados[base] + resto * (prox - ordenados[base]);
}

// Idade típica de cada nível (e as turmas dele), a partir dos alunos ativos
// com data de nascimento. Devolve { turmas: Map turma → perfil, niveis: Map }.
export function perfilDasTurmas(students, hoje = new Date()) {
  const turmas = new Map();
  for (const s of students) {
    if ((s.enrollment_status || 'ativo') !== 'ativo' || !s.turma) continue;
    const idade = idadeEmMeses(s.birth_date, hoje);
    if (idade === null) continue;
    if (!turmas.has(s.turma)) turmas.set(s.turma, { turma: s.turma, nivel: nivelDaTurma(s.turma), idades: [], turnos: {} });
    const t = turmas.get(s.turma);
    t.idades.push(idade);
    if (s.turno) t.turnos[s.turno] = (t.turnos[s.turno] || 0) + 1;
  }
  for (const t of turmas.values()) {
    t.turnoComum = Object.entries(t.turnos).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  }

  const niveis = new Map();
  for (const t of turmas.values()) {
    if (!niveis.has(t.nivel)) niveis.set(t.nivel, { nivel: t.nivel, turmas: [], idades: [] });
    const n = niveis.get(t.nivel);
    n.turmas.push(t);
    n.idades.push(...t.idades);
  }
  for (const [nome, n] of niveis) {
    if (n.idades.length < MIN_ALUNOS_POR_NIVEL) { niveis.delete(nome); continue; }
    n.idades.sort((a, b) => a - b);
    n.mediana = quantil(n.idades, 0.5);
    n.p25 = quantil(n.idades, 0.25);
  }
  return { turmas, niveis };
}

/**
 * Sugestão para um aluno, ou null.
 * { tipo: 'evoluir', turma, idadeMeses, medianaAtual, medianaDestino }
 *   a criança já tem a idade das crianças mais novas da turma seguinte;
 * { tipo: 'conferir', idadeMeses, medianaAtual }
 *   muito mais nova que a turma: vale conferir a data de nascimento.
 */
export function sugerirTurma(aluno, perfis, hoje = new Date()) {
  if ((aluno.enrollment_status || 'ativo') !== 'ativo' || !aluno.turma) return null;
  const atual = perfis.niveis.get(nivelDaTurma(aluno.turma));
  const idade = idadeEmMeses(aluno.birth_date, hoje);
  if (!atual || idade === null) return null;

  if (idade < atual.mediana - CONFERIR_ABAIXO_MESES) {
    return { tipo: 'conferir', idadeMeses: idade, medianaAtual: atual.mediana };
  }

  const seguinte = [...perfis.niveis.values()]
    .filter(n => n.mediana >= atual.mediana + MESMO_NIVEL_MESES)
    .sort((a, b) => a.mediana - b.mediana)[0];
  if (!seguinte || idade < seguinte.p25) return null;

  // Turma do nível seguinte no mesmo turno da criança; senão, a maior.
  const turno = String(aluno.turno || '').toLowerCase();
  const destino = seguinte.turmas.find(t => turno && String(t.turnoComum || '').toLowerCase() === turno)
    || [...seguinte.turmas].sort((a, b) => b.idades.length - a.idades.length)[0];
  return { tipo: 'evoluir', turma: destino.turma, idadeMeses: idade, medianaAtual: atual.mediana, medianaDestino: seguinte.mediana };
}

export function sugestoesDaEscola(students, hoje = new Date()) {
  const perfis = perfilDasTurmas(students, hoje);
  const out = [];
  for (const s of students) {
    const sug = sugerirTurma(s, perfis, hoje);
    if (sug) out.push({ id: s.id, name: s.name, turmaAtual: s.turma, ...sug });
  }
  // Evoluir primeiro (mais velhos antes), depois os cadastros para conferir.
  return out.sort((a, b) => (a.tipo === b.tipo ? b.idadeMeses - a.idadeMeses : a.tipo === 'evoluir' ? -1 : 1));
}

export const MOTIVOS_MUDANCA_TURMA = [
  'Progressão por idade',
  'Progressão por desenvolvimento',
  'Ajuste de turno',
  'Pedido da família',
];
