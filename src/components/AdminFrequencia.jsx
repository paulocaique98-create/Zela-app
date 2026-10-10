import React, { useEffect, useState } from 'react';
import { Loader2, Check, X as XIcon, Clock, FileWarning, ListFilter, ChevronDown, ChevronLeft, ChevronRight, CalendarCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSchoolConfig } from '../lib/schoolConfig';
import { SecondaryButton } from './GestaoShared';

const STATUS_LABEL = {
  presente: { label: 'Presente', icon: Check, cls: 'text-success bg-success/10' },
  ausente: { label: 'Ausente', icon: XIcon, cls: 'text-error bg-error/10' },
  atrasado: { label: 'Atrasado', icon: Clock, cls: 'text-warning bg-brass-50' },
  justificado: { label: 'Justificado', icon: FileWarning, cls: 'text-on-surface-variant bg-surface-container' },
};

const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

const shiftDay = (str, n) => { const d = new Date(`${str}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Visão do admin — só leitura (mesmo padrão de pedagogical_records: o
// registro de frequência é do professor, admin acompanha mas não edita).
export default function AdminFrequencia({ currentUser, currentSchool }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;
  const { turmas: schoolTurmas, terminology } = useSchoolConfig(schoolId);

  const [date, setDate] = useState(todayStr());
  const [selectedTurma, setSelectedTurma] = useState('');
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = async () => {
    if (!schoolId) return;
    setIsLoading(true);
    setError('');
    try {
      let query = supabase
        .from('class_attendance')
        .select('id, status, notes, class_name, students:student_id(name)')
        .eq('school_id', schoolId)
        .eq('date', date)
        .order('class_name');
      if (selectedTurma) query = query.eq('class_name', selectedTurma);
      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;
      setRows(data || []);
    } catch (err) {
      console.error('[AdminFrequencia] Erro ao buscar:', err);
      setError('Não foi possível carregar a frequência.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [schoolId, date, selectedTurma]);

  return (
    <div className="h-full flex flex-col bg-white -m-3 sm:m-0 rounded-none sm:rounded-zela-xl border-0 sm:border sm:border-outline-variant md:rounded-none md:shadow-none md:border-0 shadow-none sm:shadow-sm overflow-hidden">
      {/* Título "Frequência" e ícone removidos (o Header do app já mostra o
          nome da tela dinamicamente) -- não sobrava nenhuma descrição pra
          ficar no lugar, então a linha vai direto pros filtros. */}
      <div className="flex flex-col sm:flex-row sm:justify-end sm:items-center gap-2 px-4 py-3 sm:p-6 border-b border-outline-variant shrink-0">
        <div className="flex items-center gap-2">
          <SecondaryButton onClick={() => setDate(d => shiftDay(d, -1))} aria-label="Dia anterior"><ChevronLeft size={18} aria-hidden="true" /></SecondaryButton>
          <label className="relative flex-1 sm:flex-none sm:w-36 text-sm font-bold text-on-surface text-center cursor-pointer">
            {date.split('-').reverse().join('/')}
            <input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} max={todayStr()} aria-label="Escolher data" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
          </label>
          <SecondaryButton onClick={() => setDate(d => shiftDay(d, 1))} disabled={date >= todayStr()} aria-label="Próximo dia"><ChevronRight size={18} aria-hidden="true" /></SecondaryButton>
        </div>
        <div className="relative min-w-0 sm:w-64">
          <ListFilter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
          <select value={selectedTurma} onChange={e => setSelectedTurma(e.target.value)} className="w-full h-10 pl-9 pr-8 appearance-none border border-outline-variant rounded-zela-md text-sm bg-surface-container-lowest text-on-surface truncate focus:outline-none focus:ring-2 focus:ring-primary">
            <option value="">Todas as {terminology.class.toLowerCase()}s</option>
            {schoolTurmas.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
        </div>
      </div>

      {error && (
        <div className="px-5 sm:px-6 pt-4">
          <div className="bg-error/10 border border-error/30 text-error p-2.5 rounded-zela-md text-xs font-medium">{error}</div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3 sm:p-6 space-y-2">
        {!isLoading && rows.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pb-1">
            {Object.entries(STATUS_LABEL).map(([k, v]) => {
              const n = rows.filter(r => r.status === k).length;
              return n > 0 ? <span key={k} className={`text-xs font-bold px-2.5 py-1 rounded-sm ${v.cls}`}>{n} {v.label.toLowerCase()}</span> : null;
            })}
          </div>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center text-center py-14 bg-surface-container-lowest rounded-zela-xl border border-dashed border-outline-variant">
            <CalendarCheck size={30} className="text-outline-variant mb-2" />
            <p className="text-sm font-semibold text-on-surface-variant">Nenhum registro de frequência nesta data.</p>
            <p className="text-xs text-on-surface-variant/70 mt-1">Escolha outra data ou outra turma.</p>
          </div>
        ) : (
          rows.map(r => {
            const info = STATUS_LABEL[r.status] || STATUS_LABEL.presente;
            const Icon = info.icon;
            return (
              <div key={r.id} className="flex items-center justify-between gap-3 p-3 bg-surface-container-low border border-outline-variant rounded-zela-lg">
                <div className="min-w-0">
                  <p className="font-bold text-on-surface text-sm truncate">{r.students?.name || 'Aluno'}</p>
                  <p className="text-[11px] text-on-surface-variant/70">{r.class_name}</p>
                </div>
                <span className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-sm shrink-0 ${info.cls}`}>
                  <Icon size={12} /> {info.label}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
