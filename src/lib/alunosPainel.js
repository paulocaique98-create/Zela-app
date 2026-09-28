// Regras da tela Secretaria · Alunos (Modelo 2 · Painel por turma, aprovado
// em 28/09/2026): o que precisa de atenção em cada aluno e o resumo por turma.
// Funções puras, testáveis sem banco.

// Documentos que todo aluno ativo precisa ter na pasta (mesma lista de
// Secretaria · Documentos pendentes).
export const DOCUMENTOS_OBRIGATORIOS = [
  { key: 'certidao_nascimento', label: 'Certidão de Nascimento' },
  { key: 'cartao_vacina', label: 'Cartão de Vacina' },
  { key: 'comprovante_residencia', label: 'Comprovante de Residência' },
];

export const SEM_TURMA = 'Sem turma';

// Matrículas criadas até este tempo depois da abertura do ano são a carga
// inicial (alunos que já estavam na escola), não entradas novas.
const MARGEM_CARGA_INICIAL_MS = 10 * 60 * 1000;

const ORDEM_TURNOS = ['Manhã', 'Tarde', 'Integral'];

const brl = (cents) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100);

// tone: 'bad' (vermelho, dinheiro em atraso) ou 'warn' (âmbar).
export function motivosDeAtencao({ enrollmentStatus, documentCategories = [], hasFichaMedica, overdueCount = 0, overdueCents = 0 }) {
  const motivos = [];
  if ((enrollmentStatus || 'ativo') !== 'ativo') return motivos;

  const presentes = new Set(documentCategories);
  const faltando = DOCUMENTOS_OBRIGATORIOS.filter(d => !presentes.has(d.key));
  if (faltando.length === 1) {
    motivos.push({ key: 'documentos', tone: 'warn', text: `Falta ${faltando[0].label.toLowerCase()}` });
  } else if (faltando.length > 1) {
    motivos.push({ key: 'documentos', tone: 'warn', text: `Faltam ${faltando.length} documentos`, detail: faltando.map(d => d.label).join(', ') });
  }
  if (!hasFichaMedica) {
    motivos.push({ key: 'ficha', tone: 'warn', text: 'Sem ficha médica' });
  }
  if (overdueCount > 0) {
    motivos.push({ key: 'financeiro', tone: 'bad', text: `${overdueCount} ${overdueCount === 1 ? 'cobrança' : 'cobranças'} em atraso`, detail: brl(overdueCents) });
  }
  return motivos;
}

// Tom mais grave entre os motivos.
export function tomDaAtencao(motivos) {
  if (motivos.some(m => m.tone === 'bad')) return 'bad';
  if (motivos.length) return 'warn';
  return null;
}

// Frase curta para a linha do aluno: o motivo mais grave e quantos mais.
export function resumoDosMotivos(motivos) {
  if (!motivos.length) return 'em dia';
  const ordenados = [...motivos].sort((a, b) => (a.tone === 'bad' ? -1 : 0) - (b.tone === 'bad' ? -1 : 0));
  const primeiro = ordenados[0].text.charAt(0).toLowerCase() + ordenados[0].text.slice(1);
  return ordenados.length > 1 ? `${primeiro} +${ordenados.length - 1}` : primeiro;
}

function ordenarTurnos(contagem) {
  return Object.entries(contagem)
    .sort(([a], [b]) => {
      const ia = ORDEM_TURNOS.indexOf(a); const ib = ORDEM_TURNOS.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b, 'pt-BR');
    })
    .map(([turno, total]) => ({ turno, total }));
}

/**
 * students: [{ id, name, turma, turno, enrollment_status }]
 * documentos: [{ student_id, category }]
 * fichaStudentIds: [student_id]
 * overdueCharges: [{ student_id, amount_cents }]
 * anoLetivo: { created_at } do ano aberto, ou null
 * enrollments: [{ student_id, created_at, updated_at }] do ano aberto
 * saidasExternas: [{ student_id, transferred_at }]
 * turmasConfig: ordem das turmas configurada pela escola
 */
export function buildPainelAlunos({
  students = [], documentos = [], fichaStudentIds = [], overdueCharges = [],
  anoLetivo = null, enrollments = [], saidasExternas = [], turmasConfig = [],
}) {
  const docsPorAluno = new Map();
  for (const d of documentos) {
    if (!docsPorAluno.has(d.student_id)) docsPorAluno.set(d.student_id, []);
    docsPorAluno.get(d.student_id).push(d.category);
  }
  const comFicha = new Set(fichaStudentIds);
  const atraso = new Map();
  for (const c of overdueCharges) {
    const a = atraso.get(c.student_id) || { count: 0, cents: 0 };
    a.count += 1; a.cents += c.amount_cents || 0;
    atraso.set(c.student_id, a);
  }

  const motivosPorAluno = new Map();
  for (const s of students) {
    const a = atraso.get(s.id) || { count: 0, cents: 0 };
    motivosPorAluno.set(s.id, motivosDeAtencao({
      enrollmentStatus: s.enrollment_status,
      documentCategories: docsPorAluno.get(s.id) || [],
      hasFichaMedica: comFicha.has(s.id),
      overdueCount: a.count,
      overdueCents: a.cents,
    }));
  }

  const ativos = students.filter(s => (s.enrollment_status || 'ativo') === 'ativo');

  // Turmas: primeiro na ordem configurada pela escola, depois as que só
  // aparecem nos alunos, e "Sem turma" por último. Só turmas com alunos.
  const porTurma = new Map();
  for (const s of ativos) {
    const nome = s.turma || SEM_TURMA;
    if (!porTurma.has(nome)) porTurma.set(nome, []);
    porTurma.get(nome).push(s);
  }
  const extras = [...porTurma.keys()].filter(n => n !== SEM_TURMA && !turmasConfig.includes(n)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const ordem = [...turmasConfig.filter(n => porTurma.has(n)), ...extras, ...(porTurma.has(SEM_TURMA) ? [SEM_TURMA] : [])];

  const turmas = ordem.map(nome => {
    const alunos = porTurma.get(nome);
    const turnos = {};
    for (const s of alunos) {
      const t = s.turno || 'Sem turno';
      turnos[t] = (turnos[t] || 0) + 1;
    }
    const linhas = alunos.map(s => {
      const motivos = motivosPorAluno.get(s.id);
      return { id: s.id, name: s.name, tone: tomDaAtencao(motivos), resumo: resumoDosMotivos(motivos) };
    });
    const atencao = linhas
      .filter(l => l.tone)
      .sort((a, b) => (a.tone === 'bad' ? 0 : 1) - (b.tone === 'bad' ? 0 : 1) || a.name.localeCompare(b.name, 'pt-BR'));
    const emDia = linhas.filter(l => !l.tone).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return {
      nome,
      total: alunos.length,
      emDia: emDia.length,
      turnos: ordenarTurnos(turnos),
      atencao,
      tone: atencao.some(l => l.tone === 'bad') ? 'bad' : atencao.length ? 'warn' : null,
      // Até 3 nomes no cartão: quem precisa de atenção primeiro.
      destaque: [...atencao, ...emDia].slice(0, 3),
    };
  });

  const atencaoIds = ativos.filter(s => motivosPorAluno.get(s.id).length).map(s => s.id);
  const atencaoPorTipo = { documentos: 0, ficha: 0, financeiro: 0 };
  for (const id of atencaoIds) {
    for (const m of motivosPorAluno.get(id)) atencaoPorTipo[m.key] += 1;
  }

  // Entradas e saídas contam só o ano letivo aberto.
  let entradas = 0;
  const saidas = [];
  if (anoLetivo?.created_at) {
    const limite = new Date(anoLetivo.created_at).getTime() + MARGEM_CARGA_INICIAL_MS;
    const statusPorAluno = new Map(students.map(s => [s.id, s]));
    const dataSaidaExterna = new Map(saidasExternas.map(t => [t.student_id, t.transferred_at]));
    for (const e of enrollments) {
      if (new Date(e.created_at).getTime() > limite) entradas += 1;
      const s = statusPorAluno.get(e.student_id);
      if (s && (s.enrollment_status || 'ativo') !== 'ativo') {
        saidas.push({ id: s.id, name: s.name, status: s.enrollment_status, em: dataSaidaExterna.get(s.id) || e.updated_at });
      }
    }
    saidas.sort((a, b) => new Date(b.em) - new Date(a.em));
  }
  const saidasPorStatus = {};
  for (const s of saidas) saidasPorStatus[s.status] = (saidasPorStatus[s.status] || 0) + 1;

  return {
    kpis: { ativos: ativos.length, turmas: turmas.length, atencao: atencaoIds.length, entradas, saidas: saidas.length },
    turmas,
    atencaoIds,
    atencaoPorTipo,
    saidas,
    saidasPorStatus,
  };
}
