import React, { useEffect, useState } from 'react';
import { Download, Printer, BarChart3 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { centsToBRL, monthRange, downloadCSV } from '../lib/gestaoUtils';
import { PageShell, Loading, Notice, SecondaryButton, StatCard, EmptyState } from './GestaoShared';

// Relatórios consolidados da Gestão. Cada visão devolve { cards, table }:
// os cards resumem, a tabela é o que vai pra planilha e pra impressão.
// view: 'gestao' | 'financeiro' | 'academico' | 'operacional'
const DESCRIPTIONS = {
  gestao: 'Retrato da escola: alunos, turmas, ocupação e movimentação do ano.',
  financeiro: 'Receita prevista e recebida, inadimplência e despesas dos últimos 12 meses.',
  academico: 'Frequência em aula por turma e relatórios pedagógicos publicados no mês.',
  operacional: 'Entradas e saídas registradas, correções de presença e horas extras no mês.',
};

export default function GestaoRelatorios({ currentUser, currentSchool, view = 'gestao' }) {
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const range = monthRange(offset);
  const monthly = view === 'academico' || view === 'operacional';

  useEffect(() => {
    let active = true;
    setData(null);
    setError('');
    const loaders = { gestao: loadGestao, financeiro: loadFinanceiro, academico: loadAcademico, operacional: loadOperacional };
    loaders[view](currentUser.school_id, currentSchool, range)
      .then(result => { if (active) setData(result); })
      .catch(err => {
        console.error('[GestaoRelatorios]', err);
        if (active) { setError(err?.code === '42501' || /permission|permiss/i.test(err?.message || '') ? 'Você não tem permissão para ver este relatório.' : 'Não foi possível montar o relatório.'); setData({ cards: [], table: null }); }
      });
    return () => { active = false; };
  }, [view, currentUser.school_id, currentSchool, range.start, range.end]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportCSV = () => downloadCSV(`relatorio-${view}${monthly ? `-${range.start.slice(0, 7)}` : ''}.csv`, data.table.rows,
    data.table.columns.map((c, i) => ({ label: c, value: r => r[i] })));

  const print = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório</title>
      <style>body{font-family:system-ui,sans-serif;margin:24px;color:#111}h1{font-size:18px;margin:0}p{color:#555;font-size:12px}
      .cards{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}.c{border:1px solid #ccc;padding:8px 12px;border-radius:6px}.c b{display:block;font-size:16px}
      table{border-collapse:collapse;width:100%;font-size:12px}th,td{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left}th{background:#f3f3f3}</style></head><body>
      <h1>${esc(currentSchool?.name || '')} · ${esc(data.title || 'Relatório')}</h1>
      <p>${monthly ? esc(range.label) + ' · ' : ''}Gerado em ${esc(new Date().toLocaleString('pt-BR'))}</p>
      <div class="cards">${data.cards.map(c => `<div class="c">${esc(c.label)}<b>${esc(c.value)}</b></div>`).join('')}</div>
      ${data.table ? `<table><thead><tr>${data.table.columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${data.table.rows.map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : ''}
      </body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 400);
  };

  return (
    <PageShell
      description={DESCRIPTIONS[view]}
      actions={data?.table?.rows?.length > 0 && <>
        <SecondaryButton onClick={exportCSV}><Download size={15} /> Planilha</SecondaryButton>
        <SecondaryButton onClick={print}><Printer size={15} /> Imprimir</SecondaryButton>
      </>}
    >
      <div className="space-y-4">
        {monthly && (
          <div className="flex items-center gap-2">
            <SecondaryButton onClick={() => setOffset(o => o - 1)} aria-label="Mês anterior">‹</SecondaryButton>
            <span className="text-sm font-bold text-on-surface capitalize w-24 text-center">{range.label}</span>
            <SecondaryButton onClick={() => setOffset(o => Math.min(0, o + 1))} disabled={offset === 0} aria-label="Próximo mês">›</SecondaryButton>
          </div>
        )}
        <Notice>{error}</Notice>
        {data === null ? <Loading /> : (
          <>
            {data.cards.length > 0 && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {data.cards.map(c => <StatCard key={c.label} label={c.label} value={c.value} hint={c.hint} tone={c.tone} />)}
              </div>
            )}
            {data.table && (data.table.rows.length === 0 ? <EmptyState icon={BarChart3} text="Sem dados no período." /> : (
              <section className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4 overflow-x-auto">
                {data.table.title && <h3 className="font-bold text-sm text-on-surface mb-2">{data.table.title}</h3>}
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs font-bold text-on-surface-variant uppercase border-b border-outline-variant">
                    {data.table.columns.map(c => <th key={c} className="py-2 pr-3">{c}</th>)}
                  </tr></thead>
                  <tbody>
                    {data.table.rows.map((r, i) => (
                      <tr key={i} className="border-b border-outline-variant/50">
                        {r.map((v, j) => <td key={j} className={`py-2 pr-3 ${j > 0 ? 'tabular-nums' : 'font-medium text-on-surface'}`}>{v}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </>
        )}
      </div>
    </PageShell>
  );
}

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '·');

function check(...results) {
  const failed = results.find(r => r.error);
  if (failed) throw failed.error;
}

async function loadGestao(schoolId, school) {
  const [students, users, year] = await Promise.all([
    supabase.from('students').select('id, turma, enrollment_status').eq('school_id', schoolId),
    supabase.from('users').select('id, role, status').eq('school_id', schoolId),
    supabase.from('school_years').select('id, name').eq('school_id', schoolId).eq('status', 'aberto').maybeSingle(),
  ]);
  check(students, users, year);
  const all = students.data || [];
  const active = all.filter(s => (s.enrollment_status || 'ativo') === 'ativo');
  const byTurma = {};
  all.forEach(s => {
    const k = s.turma || 'Sem turma';
    byTurma[k] = byTurma[k] || { ativos: 0, saidas: 0 };
    if ((s.enrollment_status || 'ativo') === 'ativo') byTurma[k].ativos += 1; else byTurma[k].saidas += 1;
  });
  const u = users.data || [];
  const count = (role) => u.filter(x => x.role === role && x.status !== 'pending').length;
  const max = school?.max_students;
  return {
    title: 'Relatório de Gestão',
    cards: [
      { label: 'Alunos ativos', value: active.length, hint: max ? `Ocupação ${pct(active.length, max)} de ${max}` : '' },
      { label: 'Saídas e trancamentos', value: all.length - active.length, tone: 'warn' },
      { label: 'Famílias', value: count('family') },
      { label: 'Equipe', value: count('admin') + count('teacher'), hint: `${count('teacher')} professoras · ${count('admin')} administrativo` },
    ],
    table: {
      title: `Alunos por turma${year.data ? ` · ano letivo ${year.data.name}` : ''}`,
      columns: ['Turma', 'Ativos', 'Saídas', 'Participação'],
      rows: Object.entries(byTurma).sort((a, b) => a[0].localeCompare(b[0])).map(([t, v]) => [t, v.ativos, v.saidas, pct(v.ativos, active.length)]),
    },
  };
}

async function loadFinanceiro(schoolId) {
  const months = Array.from({ length: 12 }, (_, i) => monthRange(i - 11));
  const [charges, expenses] = await Promise.all([
    supabase.from('financial_charges').select('amount_cents, status, due_date').eq('school_id', schoolId).gte('due_date', months[0].start).lte('due_date', months[11].end),
    supabase.from('expenses').select('amount_cents, status, due_date, category').eq('school_id', schoolId).gte('due_date', months[0].start).lte('due_date', months[11].end),
  ]);
  check(charges, expenses);
  const inM = (d, m) => d >= m.start && d <= m.end;
  const rows = months.map(m => {
    const c = (charges.data || []).filter(x => inM(x.due_date, m) && x.status !== 'CANCELLED');
    const previsto = c.reduce((s, x) => s + x.amount_cents, 0);
    const recebido = c.filter(x => x.status === 'PAID').reduce((s, x) => s + x.amount_cents, 0);
    const atraso = c.filter(x => x.status === 'OVERDUE').reduce((s, x) => s + x.amount_cents, 0);
    const despesas = (expenses.data || []).filter(x => inM(x.due_date, m) && x.status === 'pago').reduce((s, x) => s + x.amount_cents, 0);
    return { label: m.label, previsto, recebido, atraso, despesas };
  });
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
  return {
    title: 'Relatório Financeiro',
    cards: [
      { label: 'Recebido em 12 meses', value: centsToBRL(sum('recebido')), tone: 'good', hint: `${pct(sum('recebido'), sum('previsto'))} do previsto` },
      { label: 'Em atraso', value: centsToBRL(sum('atraso')), tone: sum('atraso') ? 'bad' : 'good', hint: `Inadimplência ${pct(sum('atraso'), sum('previsto'))}` },
      { label: 'Despesas pagas', value: centsToBRL(sum('despesas')), tone: 'warn' },
      { label: 'Resultado', value: centsToBRL(sum('recebido') - sum('despesas')), tone: sum('recebido') >= sum('despesas') ? 'good' : 'bad' },
    ],
    table: {
      title: 'Mês a mês (por vencimento)',
      columns: ['Mês', 'Previsto', 'Recebido', 'Em atraso', 'Despesas pagas', 'Resultado'],
      rows: rows.map(r => [r.label, centsToBRL(r.previsto), centsToBRL(r.recebido), centsToBRL(r.atraso), centsToBRL(r.despesas), centsToBRL(r.recebido - r.despesas)]),
    },
  };
}

async function loadAcademico(schoolId, _school, range) {
  const [att, reports, mitig] = await Promise.all([
    supabase.from('class_attendance').select('status, students:student_id(turma)').eq('school_id', schoolId).gte('date', range.start).lte('date', range.end),
    supabase.from('reports').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'PUBLICADO').gte('published_at', `${range.start}T00:00:00`).lte('published_at', `${range.end}T23:59:59`),
    supabase.from('mitigacao_reports').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'PUBLICADO').gte('published_at', `${range.start}T00:00:00`).lte('published_at', `${range.end}T23:59:59`),
  ]);
  check(att, reports, mitig);
  const byTurma = {};
  (att.data || []).forEach(a => {
    const k = a.students?.turma || 'Sem turma';
    byTurma[k] = byTurma[k] || { total: 0, presente: 0, ausente: 0, atrasado: 0, justificado: 0 };
    byTurma[k].total += 1;
    byTurma[k][a.status] = (byTurma[k][a.status] || 0) + 1;
  });
  const total = (att.data || []).length;
  const presentes = (att.data || []).filter(a => a.status === 'presente' || a.status === 'atrasado').length;
  return {
    title: 'Relatório Acadêmico',
    cards: [
      { label: 'Frequência em aula', value: pct(presentes, total), hint: `${total} chamadas registradas` },
      { label: 'Faltas', value: (att.data || []).filter(a => a.status === 'ausente').length, tone: 'warn' },
      { label: 'Relatórios publicados', value: reports.count || 0 },
      { label: 'Mitigações publicadas', value: mitig.count || 0 },
    ],
    table: {
      title: 'Frequência por turma',
      columns: ['Turma', 'Chamadas', 'Presenças', 'Atrasos', 'Faltas', 'Justificadas', 'Frequência'],
      rows: Object.entries(byTurma).sort((a, b) => a[0].localeCompare(b[0])).map(([t, v]) => [t, v.total, v.presente, v.atrasado, v.ausente, v.justificado, pct(v.presente + v.atrasado, v.total)]),
    },
  };
}

async function loadOperacional(schoolId, _school, range) {
  const [logs, corrections] = await Promise.all([
    supabase.from('attendance_logs').select('event_type, event_time').eq('school_id', schoolId).gte('event_time', `${range.start}T00:00:00-03:00`).lte('event_time', `${range.end}T23:59:59-03:00`),
    supabase.from('attendance_corrections').select('status, increases_billing').eq('school_id', schoolId).gte('requested_at', `${range.start}T00:00:00-03:00`).lte('requested_at', `${range.end}T23:59:59-03:00`),
  ]);
  check(logs, corrections);
  const byDay = {};
  (logs.data || []).forEach(l => {
    const day = new Date(l.event_time).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    byDay[day] = byDay[day] || { entry: 0, exit: 0 };
    byDay[day][l.event_type] += 1;
  });
  const c = corrections.data || [];
  const entries = (logs.data || []).filter(l => l.event_type === 'entry').length;
  const days = Object.keys(byDay).length;
  return {
    title: 'Relatório Operacional',
    cards: [
      { label: 'Entradas registradas', value: entries, hint: days ? `Média de ${Math.round(entries / days)} por dia` : '' },
      { label: 'Dias com movimento', value: days },
      { label: 'Correções pedidas', value: c.length, hint: `${c.filter(x => x.status === 'approved').length} aprovadas · ${c.filter(x => x.status === 'rejected').length} recusadas` },
      { label: 'Correções que mudam cobrança', value: c.filter(x => x.increases_billing).length, tone: 'warn' },
    ],
    table: {
      title: 'Movimento por dia',
      columns: ['Dia', 'Entradas', 'Saídas'],
      rows: Object.entries(byDay).sort((a, b) => a[0].split('/').reverse().join('').localeCompare(b[0].split('/').reverse().join(''))).map(([d, v]) => [d, v.entry, v.exit]),
    },
  };
}
