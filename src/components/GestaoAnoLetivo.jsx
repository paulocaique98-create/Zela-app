import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarRange, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDateBR } from '../lib/gestaoUtils';
import { PageShell, Loading, EmptyState, Notice, Modal, Field, inputCls, PrimaryButton, SecondaryButton, StatCard } from './GestaoShared';

// Acadêmico, Ano Letivo. Cada ano guarda o retrato das matrículas (turma,
// turno, período, horas); o do ano aberto acompanha o cadastro do aluno
// automaticamente. Virar o ano encerra o atual e abre o próximo com os
// alunos ativos.
export default function GestaoAnoLetivo({ currentUser }) {
  const [years, setYears] = useState(null);
  const [selected, setSelected] = useState(null);
  const [enrollments, setEnrollments] = useState(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const isGestao = currentUser.role === 'gestao';

  const loadYears = useCallback(async () => {
    const { data, error: e } = await supabase.from('school_years').select('*').eq('school_id', currentUser.school_id).order('starts_on', { ascending: false });
    if (e) { setError('Não foi possível carregar os anos letivos.'); setYears([]); return; }
    setYears(data || []);
    setSelected(prev => prev && data?.some(y => y.id === prev) ? prev : (data?.find(y => y.status === 'aberto') || data?.[0])?.id || null);
  }, [currentUser.school_id]);
  useEffect(() => { loadYears(); }, [loadYears]);

  useEffect(() => {
    if (!selected) { setEnrollments([]); return; }
    setEnrollments(null);
    supabase.from('enrollments').select('id, turma, turno, periodo, contracted_hours, enrollment_status, students:student_id(name)')
      .eq('school_year_id', selected)
      .then(({ data, error: e }) => {
        if (e) setError('Não foi possível carregar as matrículas.');
        setEnrollments((data || []).sort((a, b) => (a.students?.name || '').localeCompare(b.students?.name || '')));
      });
  }, [selected]);

  const byTurma = useMemo(() => {
    const map = {};
    (enrollments || []).forEach(e => { const k = e.turma || 'Sem turma'; map[k] = (map[k] || 0) + 1; });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [enrollments]);

  const activeCount = (enrollments || []).filter(e => (e.enrollment_status || 'ativo') === 'ativo').length;
  const year = years?.find(y => y.id === selected);

  return (
    <PageShell
      description="Anos letivos da escola e as matrículas de cada ano."
      infoOnMobile
      actions={isGestao && <PrimaryButton onClick={() => setOpening(true)}><Plus size={16} /> Iniciar novo ano letivo</PrimaryButton>}
    >
      <div className="space-y-4">
        {isGestao && (
          <PrimaryButton onClick={() => setOpening(true)} className="sm:hidden w-full justify-center h-11"><Plus size={16} /> Iniciar novo ano letivo</PrimaryButton>
        )}
        <Notice>{error}</Notice>
        <Notice type="success">{success}</Notice>
        {years === null ? <Loading /> : years.length === 0 ? <EmptyState icon={CalendarRange} text="Nenhum ano letivo cadastrado." /> : (
          <>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {years.map(y => (
                <button key={y.id} onClick={() => setSelected(y.id)}
                  className={`shrink-0 h-10 flex items-center gap-2 px-4 rounded-zela-md text-sm font-bold border transition ${selected === y.id ? 'bg-primary text-white border-primary shadow-sm' : 'bg-surface-container-lowest border-outline-variant text-on-surface-variant hover:border-primary/40'}`}>
                  {y.name}
                  {y.status === 'aberto' && <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${selected === y.id ? 'bg-white/20 text-white' : 'bg-success/10 text-success'}`}>Aberto</span>}
                </button>
              ))}
            </div>
            {year && (
              <div className="flex items-center gap-2 text-sm text-on-surface-variant bg-surface-container-low rounded-zela-md px-3 py-2">
                <CalendarRange size={16} className="shrink-0 text-primary" />
                <span>{formatDateBR(year.starts_on)} a {formatDateBR(year.ends_on)}</span>
                <span className={`ml-auto shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${year.status === 'aberto' ? 'bg-success/10 text-success' : 'bg-surface-container text-on-surface-variant'}`}>
                  {year.status === 'aberto' ? 'Em andamento' : `Encerrado em ${formatDateBR(year.closed_at)}`}
                </span>
              </div>
            )}
            {enrollments === null ? <Loading /> : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <StatCard label="Matrículas no ano" value={enrollments.length} />
                  <StatCard label="Ativas" value={activeCount} tone="good" />
                  <StatCard label="Turmas" value={byTurma.length} />
                  <StatCard label="Saídas e trancamentos" value={enrollments.length - activeCount} tone={enrollments.length - activeCount ? 'warn' : 'default'} />
                </div>
                <section className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-sm text-on-surface">Alunos por turma</h3>
                  </div>
                  {byTurma.length === 0 ? <p className="text-sm text-on-surface-variant">Nenhuma matrícula neste ano.</p> : (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {byTurma.map(([turma, count]) => (
                        <div key={turma} className="flex items-center justify-between gap-2 px-3 py-2.5 bg-surface-container-low rounded-zela-md text-sm">
                          <span className="text-on-surface font-medium truncate">{turma}</span>
                          <span className="shrink-0 min-w-7 text-center text-xs font-bold tabular-nums text-primary bg-primary/10 rounded-full px-2 py-0.5">{count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </div>
      {opening && (
        <NovoAnoModal currentYear={years?.find(y => y.status === 'aberto')} onClose={() => setOpening(false)}
          onDone={(name) => { setOpening(false); setSuccess(`Ano letivo ${name} aberto com os alunos ativos.`); loadYears(); }} />
      )}
    </PageShell>
  );
}

function NovoAnoModal({ currentYear, onClose, onDone }) {
  const next = String(new Date().getFullYear() + 1);
  const [name, setName] = useState(next);
  const [startsOn, setStartsOn] = useState(`${next}-01-01`);
  const [endsOn, setEndsOn] = useState(`${next}-12-31`);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const save = async () => {
    setIsSaving(true);
    setError('');
    const { error: e } = await supabase.rpc('open_school_year', { p_name: name.trim(), p_starts_on: startsOn, p_ends_on: endsOn });
    setIsSaving(false);
    if (e) { setError(e.message); return; }
    onDone(name.trim());
  };

  return (
    <Modal title="Iniciar novo ano letivo" onClose={onClose}
      footer={<><SecondaryButton onClick={onClose}>Cancelar</SecondaryButton><PrimaryButton onClick={save} disabled={!confirm || isSaving}>Abrir ano letivo</PrimaryButton></>}>
      <Notice>{error}</Notice>
      <Field label="Nome" id="year-name"><input id="year-name" value={name} onChange={e => setName(e.target.value)} className={inputCls} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Início" id="year-start"><input id="year-start" type="date" value={startsOn} onChange={e => setStartsOn(e.target.value)} className={inputCls} /></Field>
        <Field label="Fim" id="year-end"><input id="year-end" type="date" value={endsOn} onChange={e => setEndsOn(e.target.value)} className={inputCls} /></Field>
      </div>
      <label htmlFor="year-confirm" className="flex items-start gap-2 text-sm text-on-surface">
        <input id="year-confirm" type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} className="mt-1" />
        <span>{currentYear ? `O ano ${currentYear.name} será encerrado (o histórico dele continua disponível) e ` : ''}o novo ano começa com todos os alunos ativos, nas turmas atuais. Mudanças de turma para o novo ano são feitas depois, em Secretaria.</span>
      </label>
    </Modal>
  );
}
