// Agrupamento da tela Gerenciamento › Usuários (29/09/2026): um cartão por
// FAMÍLIA REAL, isto é, todos os responsáveis ligados às mesmas crianças,
// mesmo quando são dois titulares (caso real: pai titular e financeiro de um
// filho, mãe titular e financeira do outro, cada um 2º responsável do filho
// do outro). Antes era um cartão por conta titular, e a família aparecia
// partida em dois.

/**
 * users: [{ id, name, students: [{id, name, family_id}], vinculos: [{ student_id, relationship, is_financial }] }]
 * alunosPorId: Map studentId -> { id, name, family_id }
 * Devolve [{ key, students, guardians }], cada usuário em exatamente um grupo.
 */
export function agruparFamilias(users, alunosPorId) {
  const pai = new Map(users.map(u => [u.id, u.id]));
  const raiz = (id) => {
    let r = id;
    while (pai.get(r) !== r) r = pai.get(r);
    pai.set(id, r);
    return r;
  };
  const unir = (a, b) => { const ra = raiz(a); const rb = raiz(b); if (ra !== rb) pai.set(rb, ra); };

  const alunosDoUsuario = new Map();
  const donoPorAluno = new Map();
  for (const u of users) {
    const ids = new Set([
      ...(u.students || []).map(s => s.id),
      ...(u.vinculos || []).map(v => v.student_id),
    ]);
    alunosDoUsuario.set(u.id, ids);
    for (const sid of ids) {
      if (donoPorAluno.has(sid)) unir(donoPorAluno.get(sid), u.id);
      else donoPorAluno.set(sid, u.id);
    }
  }

  const grupos = new Map();
  for (const u of users) {
    const r = raiz(u.id);
    if (!grupos.has(r)) grupos.set(r, { key: r, studentIds: new Set(), guardians: [] });
    const g = grupos.get(r);
    g.guardians.push(u);
    for (const sid of alunosDoUsuario.get(u.id)) g.studentIds.add(sid);
  }

  return [...grupos.values()].map(g => {
    const students = [...g.studentIds].map(id => alunosPorId.get(id)).filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    // Titulares primeiro, depois 2º responsáveis; por nome.
    const guardians = [...g.guardians].sort((a, b) =>
      ((b.students?.length > 0) - (a.students?.length > 0)) || a.name.localeCompare(b.name, 'pt-BR'));
    return { key: g.key, students, guardians };
  });
}

const primeiroNome = (nome) => String(nome || '').trim().split(/\s+/)[0] || nome;

// "Davi: titular e financeiro · Joana: Pai" (só as crianças da pessoa).
export function papeisNaFamilia(user, alunosPorId) {
  const porAluno = new Map();
  for (const s of user.students || []) porAluno.set(s.id, { titular: true, financeiro: false, rel: null });
  for (const v of user.vinculos || []) {
    const atual = porAluno.get(v.student_id) || { titular: false, financeiro: false, rel: null };
    atual.financeiro = atual.financeiro || !!v.is_financial;
    if (!atual.titular) atual.rel = v.relationship || atual.rel;
    porAluno.set(v.student_id, atual);
  }
  return [...porAluno.entries()]
    .map(([sid, p]) => {
      const aluno = alunosPorId.get(sid);
      if (!aluno) return null;
      const partes = [];
      if (p.titular) partes.push('titular');
      else partes.push((p.rel || 'responsável').toLowerCase());
      if (p.financeiro) partes.push('financeiro');
      return { nome: aluno.name, texto: `${primeiroNome(aluno.name)}: ${partes.join(' e ')}` };
    })
    .filter(Boolean)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .map(x => x.texto)
    .join(' · ');
}
