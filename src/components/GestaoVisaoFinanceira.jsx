import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { centsToBRL, formatDateBR, monthRange, todayISO } from '../lib/gestaoUtils';
import { PageShell, StatCard, Loading, Notice } from './GestaoShared';

// Financeiro · Visão Financeira: o mês em números e os últimos 6 meses
// (previsto x recebido x despesas pagas).
export default function GestaoVisaoFinanceira({ currentUser, setGestaoTab }) {
  const schoolId = currentUser.school_id;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const first = monthRange(-5).start;
        const last = monthRange(0).end;
        const [{ data: charges, error: e1 }, { data: expenses, error: e2 }, { data: upcoming, error: e3 }] = await Promise.all([
          supabase.from('financial_charges').select('amount_cents, status, due_date, paid_at').eq('school_id', schoolId).gte('due_date', first).lte('due_date', last),
          supabase.from('expenses').select('amount_cents, status, due_date, paid_on').eq('school_id', schoolId).gte('due_date', first).lte('due_date', last),
          supabase.from('financial_charges').select('id, amount_cents, due_date, students:student_id(name)').eq('school_id', schoolId).in('status', ['PENDING', 'AWAITING_PAYMENT']).gte('due_date', todayISO()).order('due_date').limit(8),
        ]);
        if (e1 || e2 || e3) throw (e1 || e2 || e3);
        const { data: overdue } = await supabase.from('financial_charges').select('amount_cents').eq('school_id', schoolId).eq('status', 'OVERDUE');

        const months = [-5, -4, -3, -2, -1, 0].map(o => monthRange(o));
        const inMonth = (dateStr, m) => dateStr && dateStr.slice(0, 10) >= m.start && dateStr.slice(0, 10) <= m.end;
        const series = months.map(m => ({
          label: m.label,
          previsto: (charges || []).filter(c => c.status !== 'CANCELLED' && inMonth(c.due_date, m)).reduce((s, c) => s + c.amount_cents, 0),
          recebido: (charges || []).filter(c => c.status === 'PAID' && inMonth(c.due_date, m)).reduce((s, c) => s + c.amount_cents, 0),
          despesas: (expenses || []).filter(e => e.status === 'pago' && inMonth(e.due_date, m)).reduce((s, e) => s + e.amount_cents, 0),
        }));
        setData({ series, current: series[series.length - 1], overdue: (overdue || []).reduce((s, c) => s + c.amount_cents, 0), overdueCount: (overdue || []).length, upcoming: upcoming || [] });
      } catch (err) {
        console.error('[GestaoVisaoFinanceira]', err);
        setError('Não foi possível carregar os números financeiros.');
      }
    })();
  }, [schoolId]);

  const max = data ? Math.max(1, ...data.series.flatMap(m => [m.previsto, m.recebido, m.despesas])) : 1;

  return (
    <PageShell description="O mês em números e a evolução dos últimos 6 meses.">
      <Notice>{error}</Notice>
      {!data ? (!error && <Loading />) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Previsto no mês" value={centsToBRL(data.current.previsto)} />
            <StatCard label="Recebido no mês" value={centsToBRL(data.current.recebido)} tone="good"
              hint={data.current.previsto ? `${Math.round((data.current.recebido / data.current.previsto) * 100)}% do previsto` : ''} />
            <StatCard label="Em atraso (total)" value={centsToBRL(data.overdue)} tone={data.overdue ? 'bad' : 'good'} hint={`${data.overdueCount} cobrança(s)`} onClick={() => setGestaoTab('financeiro-inadimplencia')} />
            <StatCard label="Despesas pagas no mês" value={centsToBRL(data.current.despesas)} tone="warn"
              hint={`Resultado: ${centsToBRL(data.current.recebido - data.current.despesas)}`} onClick={() => setGestaoTab('financeiro-despesas')} />
          </div>

          <section className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h3 className="font-bold text-on-surface text-sm">Últimos 6 meses</h3>
              <div className="flex gap-3 text-xs text-on-surface-variant">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-slate-300" /> Previsto</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-500" /> Recebido</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-500" /> Despesas</span>
              </div>
            </div>
            <div className="grid grid-cols-6 gap-3 items-end h-48" role="img" aria-label="Gráfico de previsto, recebido e despesas dos últimos 6 meses">
              {data.series.map(m => (
                <div key={m.label} className="flex flex-col items-center justify-end h-full gap-1">
                  <div className="flex items-end gap-0.5 h-full w-full justify-center">
                    <div className="w-1/4 bg-slate-300 rounded-t" style={{ height: `${(m.previsto / max) * 100}%` }} title={`Previsto ${centsToBRL(m.previsto)}`} />
                    <div className="w-1/4 bg-emerald-500 rounded-t" style={{ height: `${(m.recebido / max) * 100}%` }} title={`Recebido ${centsToBRL(m.recebido)}`} />
                    <div className="w-1/4 bg-amber-500 rounded-t" style={{ height: `${(m.despesas / max) * 100}%` }} title={`Despesas ${centsToBRL(m.despesas)}`} />
                  </div>
                  <span className="text-[11px] text-on-surface-variant capitalize">{m.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4">
            <h3 className="font-bold text-on-surface text-sm mb-2">Próximos vencimentos</h3>
            {data.upcoming.length === 0 ? <p className="text-sm text-on-surface-variant">Nenhuma cobrança a vencer.</p> : (
              <ul className="divide-y divide-outline-variant/60">
                {data.upcoming.map(c => (
                  <li key={c.id} className="py-2 flex items-center justify-between text-sm gap-2">
                    <span className="text-on-surface truncate">{c.students?.name || 'Aluno'}</span>
                    <span className="text-on-surface-variant shrink-0">{formatDateBR(c.due_date)} · <strong className="text-on-surface">{centsToBRL(c.amount_cents)}</strong></span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </PageShell>
  );
}
