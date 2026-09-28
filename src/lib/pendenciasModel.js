import { centsToBRL, formatDateBR } from './gestaoUtils';

// Regras da tela Pendências da Gestão (Modelo 4, aprovado em 28/09/2026:
// os quatro números e as áreas do "Painel por área" + a fila do "Fila por
// prioridade"). Função pura: recebe o que useGestaoPendencias trouxe e
// devolve as linhas da fila, os números do topo e as áreas (filtro).

export const EXCLUSAO_PRAZO_DIAS = 30;

export const AREAS = [
  { key: 'lgpd', label: 'LGPD' },
  { key: 'financeiro', label: 'Financeiro' },
  { key: 'presenca', label: 'Presença' },
  { key: 'cadastros', label: 'Cadastros' },
  { key: 'secretaria', label: 'Secretaria' },
  { key: 'contratos', label: 'Contratos' },
];

export const PRIORIDADES = [
  { key: 'urgente', label: 'Urgente' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'acompanhar', label: 'Acompanhar' },
];

const PRIORITY_RANK = { urgente: 0, semana: 1, acompanhar: 2 };

function daysBetween(fromISO, toISO) {
  const a = new Date(`${String(fromISO).slice(0, 10)}T00:00:00`);
  const b = new Date(`${String(toISO).slice(0, 10)}T00:00:00`);
  return Math.round((b - a) / 86400000);
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

function listNames(names, max = 2) {
  const clean = names.filter(Boolean);
  if (clean.length > max) return `${clean.slice(0, max).join(', ')} e mais ${clean.length - max}`;
  if (clean.length <= 1) return clean.join('');
  return `${clean.slice(0, -1).join(', ')} e ${clean[clean.length - 1]}`;
}

// today: 'YYYY-MM-DD' (fuso de Brasília, ver todayISO()).
export function buildPendencias(data, today) {
  const rows = [];
  if (!data) return { rows, kpis: null, areas: [] };

  // ─── LGPD ─────────────────────────────────────────────────────────────
  for (const r of data.exclusoes || []) {
    const restantes = EXCLUSAO_PRAZO_DIAS - daysBetween(r.requested_at, today);
    rows.push({
      key: `exclusao-${r.id}`, area: 'lgpd', priority: 'urgente', icon: 'exclusao',
      title: `Pedido de exclusão de conta · ${r.user_name}`,
      meta: `${r.user_role === 'teacher' ? 'Professora' : r.user_role === 'admin' ? 'Administrativo' : 'Responsável'} · pediu em ${formatDateBR(r.requested_at)}`,
      badge: restantes >= 0 ? `Faltam ${plural(restantes, 'dia', 'dias')}` : `Prazo vencido há ${plural(-restantes, 'dia', 'dias')}`,
      deadlineDays: restantes,
      action: 'Responder', tab: 'cadastros-exclusoes',
    });
  }
  const biometria = data.biometria || [];
  if (biometria.length) {
    rows.push({
      key: 'biometria', area: 'lgpd', priority: 'acompanhar', icon: 'biometria',
      title: `${plural(biometria.length, 'biometria', 'biometrias')} de famílias sem aluno ativo`,
      meta: 'Transferência ou saída da escola',
      action: 'Revisar', tab: 'cadastros-biometria',
    });
  }

  // ─── Financeiro ───────────────────────────────────────────────────────
  const vencidas = data.vencidas || [];
  if (vencidas.length) {
    const oldest = vencidas.map(c => c.due_date).filter(Boolean).sort()[0];
    const dias = oldest ? daysBetween(oldest, today) : null;
    rows.push({
      key: 'vencidas', area: 'financeiro', priority: 'urgente', icon: 'vencidas',
      title: `${plural(vencidas.length, 'cobrança vencida', 'cobranças vencidas')} · ${centsToBRL(data.vencidasTotal)}`,
      meta: dias !== null ? `A mais antiga venceu há ${plural(dias, 'dia', 'dias')}` : 'Cobranças em atraso',
      badge: 'Em atraso',
      action: 'Ver inadimplência', tab: 'financeiro-inadimplencia',
    });
  }
  const despesas = data.despesas || [];
  const atrasadas = despesas.filter(d => d.due_date < today);
  const aVencer = despesas.filter(d => d.due_date >= today);
  if (atrasadas.length) {
    rows.push({
      key: 'despesas-atrasadas', area: 'financeiro', priority: 'urgente', icon: 'despesas',
      title: `${plural(atrasadas.length, 'despesa vencida', 'despesas vencidas')} · ${centsToBRL(atrasadas.reduce((s, d) => s + d.amount_cents, 0))}`,
      meta: listNames(atrasadas.map(d => d.description)),
      badge: 'Em atraso',
      action: 'Ver despesas', tab: 'financeiro-despesas',
    });
  }
  if (aVencer.length) {
    const ultima = aVencer.map(d => d.due_date).sort().slice(-1)[0];
    rows.push({
      key: 'despesas', area: 'financeiro', priority: 'semana', icon: 'despesas',
      title: `${plural(aVencer.length, 'despesa vence', 'despesas vencem')} até ${formatDateBR(ultima)} · ${centsToBRL(aVencer.reduce((s, d) => s + d.amount_cents, 0))}`,
      meta: listNames(aVencer.map(d => d.description)),
      action: 'Ver despesas', tab: 'financeiro-despesas',
    });
  }

  // ─── Presença ─────────────────────────────────────────────────────────
  const correcoes = data.correcoes || [];
  if (correcoes.length) {
    const cobram = correcoes.filter(c => c.increases_billing).length;
    rows.push({
      key: 'correcoes', area: 'presenca', priority: 'urgente', icon: 'correcoes',
      title: `${plural(correcoes.length, 'correção de presença', 'correções de presença')} para aprovar`,
      meta: cobram ? `${cobram} ${cobram === 1 ? 'aumenta' : 'aumentam'} a cobrança de hora extra` : listNames(correcoes.map(c => c.students?.name)),
      action: 'Revisar', tab: 'attendance-corrections',
    });
  }

  // ─── Cadastros ────────────────────────────────────────────────────────
  const cadastros = data.cadastros || [];
  if (cadastros.length) {
    rows.push({
      key: 'cadastros', area: 'cadastros', priority: 'semana', icon: 'cadastros',
      title: `${plural(cadastros.length, 'cadastro aguardando', 'cadastros aguardando')} aprovação`,
      meta: listNames(cadastros.map(u => u.name)),
      action: 'Aprovar', tab: 'cadastros-usuarios',
    });
  }

  // ─── Secretaria ───────────────────────────────────────────────────────
  const matriculas = data.matriculas || [];
  if (matriculas.length) {
    rows.push({
      key: 'matriculas', area: 'secretaria', priority: 'semana', icon: 'matriculas',
      title: `${plural(matriculas.length, 'matrícula', 'matrículas')} para decidir`,
      meta: listNames(matriculas.map(m => {
        const nomes = (m.criancas || []).map(c => c.nome).filter(Boolean).join(', ');
        return nomes ? `${nomes}${m.tipo === 'rematricula' ? ' (rematrícula)' : ''}` : null;
      })),
      action: 'Decidir', tab: 'secretaria-matriculas',
    });
  }
  const documentos = data.documentos || [];
  if (documentos.length) {
    rows.push({
      key: 'documentos', area: 'secretaria', priority: 'acompanhar', icon: 'documentos',
      title: `${plural(documentos.length, 'aluno', 'alunos')} com documentos faltando`,
      meta: 'Certidão, cartão de vacina ou comprovante',
      action: 'Ver lista', tab: 'secretaria-documentos',
    });
  }

  // ─── Contratos ────────────────────────────────────────────────────────
  const contratos = data.contratos || [];
  if (contratos.length) {
    const antigos = contratos.filter(c => c.sent_at && daysBetween(c.sent_at, today) > 7).length;
    rows.push({
      key: 'contratos', area: 'contratos', priority: 'semana', icon: 'contratos',
      title: `${plural(contratos.length, 'contrato aguardando', 'contratos aguardando')} assinatura`,
      meta: antigos ? `${plural(antigos, 'enviado', 'enviados')} há mais de 7 dias` : 'Enviados para as famílias',
      action: 'Ver contratos', tab: 'contratos-assinaturas',
    });
  }

  rows.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);

  // ─── Números do topo ──────────────────────────────────────────────────
  const count = (p) => rows.filter(r => r.priority === p).length;
  const prazos = [];
  for (const r of rows) {
    if (typeof r.deadlineDays === 'number') prazos.push({ dias: r.deadlineDays, texto: 'pedido de exclusão de conta (LGPD)' });
  }
  for (const d of aVencer) prazos.push({ dias: daysBetween(today, d.due_date), texto: `despesa: ${d.description}` });
  prazos.sort((a, b) => a.dias - b.dias);

  const areaNames = (list) => Array.from(new Set(list.map(r => AREAS.find(a => a.key === r.area)?.label.toLowerCase())));
  const urgentes = areaNames(rows.filter(r => r.priority === 'urgente'));
  const semana = areaNames(rows.filter(r => r.priority === 'semana'));
  const kpis = {
    hoje: count('urgente'),
    hojeHint: urgentes.length ? listNames(urgentes, 3) : 'nada urgente',
    semana: count('semana'),
    semanaHint: semana.length ? listNames(semana, 3) : 'nada para esta semana',
    atrasoCents: data.vencidasTotal || 0,
    atrasoHint: vencidas.length ? plural(vencidas.length, 'cobrança vencida', 'cobranças vencidas') : 'nenhuma cobrança vencida',
    prazo: prazos[0] ? (prazos[0].dias <= 0 ? 'Hoje' : plural(prazos[0].dias, 'dia', 'dias')) : '·',
    prazoHint: prazos[0] ? prazos[0].texto : 'nenhum prazo em aberto',
  };

  // ─── Áreas (filtro) ───────────────────────────────────────────────────
  const resumo = {
    lgpd: () => {
      const ex = rows.find(r => r.area === 'lgpd' && typeof r.deadlineDays === 'number');
      return ex ? `exclusão em ${plural(Math.max(ex.deadlineDays, 0), 'dia', 'dias')}` : biometria.length ? 'biometria para revisar' : '';
    },
    financeiro: () => (vencidas.length ? `${centsToBRL(data.vencidasTotal)} em atraso` : despesas.length ? 'despesas a pagar' : ''),
    presenca: () => (correcoes.length ? plural(correcoes.length, 'correção', 'correções') : ''),
    cadastros: () => (cadastros.length ? `${cadastros.length} para aprovar` : ''),
    secretaria: () => [matriculas.length && plural(matriculas.length, 'matrícula', 'matrículas'), documentos.length && `${documentos.length} com documentos`].filter(Boolean).join(' · '),
    contratos: () => (contratos.length ? `${contratos.length} aguardando assinatura` : ''),
  };
  const areas = AREAS.map(a => {
    const areaRows = rows.filter(r => r.area === a.key);
    const worst = areaRows[0]?.priority || null;
    return { ...a, count: areaRows.length, worst, resumo: resumo[a.key]() };
  })
    .filter(a => a.count > 0)
    .sort((a, b) => PRIORITY_RANK[a.worst] - PRIORITY_RANK[b.worst]);

  return { rows, kpis, areas };
}
