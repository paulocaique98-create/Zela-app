import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, ListFilter, Search, NotebookPen, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDateBR, monthRange, downloadCSV } from '../lib/gestaoUtils';
import { PageShell, Loading, EmptyState, Notice, SecondaryButton } from './GestaoShared';

const TYPE_TONE = {
  DAILY_OBSERVATION: 'bg-primary/10 text-primary',
  SENSITIVE_PERIOD: 'bg-success/10 text-success',
  SOCIAL_INTERACTION: 'bg-surface-container text-on-surface-variant',
  diario: 'bg-primary/10 text-primary',
  falta: 'bg-warning/15 text-warning',
};

const TYPE_LABELS = {
  DAILY_OBSERVATION: 'Observação do dia',
  SENSITIVE_PERIOD: 'Período sensível',
  SOCIAL_INTERACTION: 'Interação social',
  diario: 'Diário',
  falta: 'Falta ou atraso em aula',
};

// Acadêmico, Ocorrências (consulta). Junta num só lugar o que as
// professoras registram: observações pedagógicas, observações do diário e
// faltas em aula. Só leitura; quem registra continua sendo a equipe.
export default function GestaoOcorrencias({ currentUser }) {
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState(null);
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const range = monthRange(offset);

  useEffect(() => {
    setRows(null);
    const sid = currentUser.school_id;
    Promise.all([
      supabase.from('pedagogical_records').select('id, record_type, record_date, content, students:student_id(name, turma)').eq('school_id', sid).gte('record_date', range.start).lte('record_date', range.end),
      supabase.from('diario_entries').select('id, entry_date, observacoes, students:student_id(name, turma)').eq('school_id', sid).gte('entry_date', range.start).lte('entry_date', range.end).not('observacoes', 'is', null),
      supabase.from('class_attendance').select('id, date, status, notes, class_name, students:student_id(name, turma)').eq('school_id', sid).gte('date', range.start).lte('date', range.end).neq('status', 'presente'),
    ]).then(([p, d, a]) => {
      if (p.error || d.error || a.error) setError('Parte dos registros não pôde ser carregada.');
      const all = [
        ...(p.data || []).map(r => ({ id: `p${r.id}`, date: r.record_date, type: r.record_type, text: r.content, student: r.students })),
        ...(d.data || []).filter(r => r.observacoes?.trim()).map(r => ({ id: `d${r.id}`, date: r.entry_date, type: 'diario', text: r.observacoes, student: r.students })),
        ...(a.data || []).map(r => ({ id: `a${r.id}`, date: r.date, type: 'falta', text: [r.class_name, r.status, r.notes].filter(Boolean).join(', '), student: r.students })),
      ].sort((x, y) => String(y.date).localeCompare(String(x.date)));
      setRows(all);
    });
  }, [currentUser.school_id, range.start, range.end]);

  const filtered = useMemo(() => (rows || [])
    .filter(r => !type || r.type === type)
    .filter(r => !search || `${r.student?.name || ''} ${r.student?.turma || ''} ${r.text || ''}`.toLowerCase().includes(search.toLowerCase())), [rows, type, search]);

  const exportar = () => downloadCSV(`ocorrencias-${range.start.slice(0, 7)}.csv`, filtered, [
    { label: 'Data', value: r => formatDateBR(r.date) }, { label: 'Aluno', value: r => r.student?.name || '' },
    { label: 'Turma', value: r => r.student?.turma || '' }, { label: 'Tipo', value: r => TYPE_LABELS[r.type] || r.type }, { label: 'Registro', value: 'text' },
  ]);

  return (
    <PageShell
      description="Observações pedagógicas, do diário e faltas em aula registradas pela equipe."
      infoOnMobile
      actions={filtered.length > 0 && <SecondaryButton onClick={exportar}><Download size={15} /> Planilha</SecondaryButton>}
    >
      <div className="space-y-3">
        <Notice>{error}</Notice>
        <div className="flex items-center gap-2">
          <SecondaryButton onClick={() => setOffset(o => o - 1)} aria-label="Mês anterior"><ChevronLeft size={18} aria-hidden="true" /></SecondaryButton>
          <span className="flex-1 sm:flex-none text-sm font-bold text-on-surface first-letter:uppercase sm:w-24 text-center">{range.label}</span>
          <SecondaryButton onClick={() => setOffset(o => Math.min(0, o + 1))} disabled={offset === 0} aria-label="Próximo mês"><ChevronRight size={18} aria-hidden="true" /></SecondaryButton>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex gap-2 order-2 sm:order-1 sm:flex-1">
            <div className="relative flex-1 min-w-0">
              <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input id="occ-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar aluno, turma ou texto"
                className="w-full h-10 pl-9 pr-3 bg-surface-container-lowest border border-outline-variant rounded-zela-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            {filtered.length > 0 && (
              <SecondaryButton onClick={exportar} aria-label="Baixar planilha" title="Baixar planilha" className="sm:hidden h-10 justify-center"><Download size={16} /></SecondaryButton>
            )}
          </div>
          <div className="relative order-1 sm:order-2 sm:w-64 sm:shrink-0">
            <ListFilter size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <select id="occ-type" value={type} onChange={e => setType(e.target.value)} aria-label="Tipo"
              className={`w-full h-10 pl-9 pr-8 appearance-none truncate border rounded-zela-md text-sm focus:outline-none focus:ring-2 focus:ring-primary ${type ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-outline-variant bg-surface-container-lowest text-on-surface'}`}>
              <option value="">Todos os tipos</option>
              {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          </div>
        </div>
        {rows === null ? <Loading /> : filtered.length === 0 ? <EmptyState icon={NotebookPen} text="Nenhum registro neste mês." hint="Mude o mês, o tipo ou a busca." /> : (
          <ul className="grid gap-2 lg:grid-cols-2 items-start">
            {filtered.map(r => (
              <li key={r.id} className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-on-surface truncate">{r.student?.name || 'Aluno'}</p>
                    {r.student?.turma && <p className="text-xs text-on-surface-variant mt-0.5 truncate">{r.student.turma}</p>}
                  </div>
                  <span className="text-xs font-semibold text-on-surface-variant shrink-0 tabular-nums">{formatDateBR(r.date)}</span>
                </div>
                <span className={`inline-block mt-2 text-[11px] font-semibold px-2 py-0.5 rounded-full ${TYPE_TONE[r.type] || 'bg-surface-container text-on-surface-variant'}`}>{TYPE_LABELS[r.type] || r.type}</span>
                <p className="text-sm text-on-surface mt-2 whitespace-pre-wrap break-words">{r.text}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageShell>
  );
}
