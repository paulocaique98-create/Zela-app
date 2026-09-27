import React, { useEffect, useMemo, useState } from 'react';
import { NotebookPen, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDateBR, monthRange, downloadCSV } from '../lib/gestaoUtils';
import { PageShell, Loading, EmptyState, Notice, SecondaryButton, inputCls } from './GestaoShared';

const TYPE_LABELS = {
  DAILY_OBSERVATION: 'Observação do dia',
  SENSITIVE_PERIOD: 'Período sensível',
  SOCIAL_INTERACTION: 'Interação social',
  diario: 'Diário',
  falta: 'Falta ou atraso em aula',
};

// Acadêmico · Ocorrências (consulta). Junta num só lugar o que as
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
        ...(a.data || []).map(r => ({ id: `a${r.id}`, date: r.date, type: 'falta', text: [r.class_name, r.status, r.notes].filter(Boolean).join(' · '), student: r.students })),
      ].sort((x, y) => String(y.date).localeCompare(String(x.date)));
      setRows(all);
    });
  }, [currentUser.school_id, range.start, range.end]);

  const filtered = useMemo(() => (rows || [])
    .filter(r => !type || r.type === type)
    .filter(r => !search || `${r.student?.name || ''} ${r.student?.turma || ''} ${r.text || ''}`.toLowerCase().includes(search.toLowerCase())), [rows, type, search]);

  return (
    <PageShell
      description="Observações pedagógicas, do diário e faltas em aula registradas pela equipe."
      actions={filtered.length > 0 && (
        <SecondaryButton onClick={() => downloadCSV(`ocorrencias-${range.start.slice(0, 7)}.csv`, filtered, [
          { label: 'Data', value: r => formatDateBR(r.date) }, { label: 'Aluno', value: r => r.student?.name || '' },
          { label: 'Turma', value: r => r.student?.turma || '' }, { label: 'Tipo', value: r => TYPE_LABELS[r.type] || r.type }, { label: 'Registro', value: 'text' },
        ])}><Download size={15} /> Planilha</SecondaryButton>
      )}
    >
      <div className="space-y-3">
        <Notice>{error}</Notice>
        <div className="flex flex-wrap items-center gap-2">
          <SecondaryButton onClick={() => setOffset(o => o - 1)} aria-label="Mês anterior">‹</SecondaryButton>
          <span className="text-sm font-bold text-on-surface capitalize w-24 text-center">{range.label}</span>
          <SecondaryButton onClick={() => setOffset(o => Math.min(0, o + 1))} disabled={offset === 0} aria-label="Próximo mês">›</SecondaryButton>
          <select id="occ-type" value={type} onChange={e => setType(e.target.value)} className="p-2 bg-white border border-outline-variant rounded-zela-md text-sm" aria-label="Tipo">
            <option value="">Todos os tipos</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input id="occ-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar aluno, turma ou texto" className={`${inputCls} max-w-xs`} />
        </div>
        {rows === null ? <Loading /> : filtered.length === 0 ? <EmptyState icon={NotebookPen} text="Nenhum registro neste mês." /> : (
          <ul className="space-y-2">
            {filtered.map(r => (
              <li key={r.id} className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-bold text-on-surface">{r.student?.name || 'Aluno'}</span>
                  {r.student?.turma && <span className="text-on-surface-variant">{r.student.turma}</span>}
                  <span className="px-2 py-0.5 rounded-full bg-surface-container-low border border-outline-variant font-bold text-on-surface-variant">{TYPE_LABELS[r.type] || r.type}</span>
                  <span className="text-on-surface-variant ml-auto">{formatDateBR(r.date)}</span>
                </div>
                <p className="text-sm text-on-surface mt-1 whitespace-pre-wrap">{r.text}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageShell>
  );
}
