import React, { useEffect, useState } from 'react';
import { ClipboardCheck, Loader2, Check, X as XIcon, Clock, FileWarning } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSchoolConfig } from '../lib/schoolConfig';

const STATUS_LABEL = {
  presente: { label: 'Presente', icon: Check, cls: 'text-emerald-600 bg-emerald-50' },
  ausente: { label: 'Ausente', icon: XIcon, cls: 'text-red-600 bg-red-50' },
  atrasado: { label: 'Atrasado', icon: Clock, cls: 'text-amber-600 bg-amber-50' },
  justificado: { label: 'Justificado', icon: FileWarning, cls: 'text-slate-600 bg-slate-100' },
};

const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

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
    <div className="h-full flex flex-col bg-white rounded-zela-xl border border-outline-variant shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-5 sm:p-6 border-b border-outline-variant shrink-0 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-primary/10 p-2.5 rounded-zela-md text-primary shrink-0">
            <ClipboardCheck size={22} />
          </div>
          <h2 className="text-h3 text-on-surface">Frequência</h2>
        </div>
        <div className="flex items-center gap-2">
          <select value={selectedTurma} onChange={e => setSelectedTurma(e.target.value)} className="p-2 border border-outline-variant rounded-zela-md text-sm bg-white">
            <option value="">Todas as {terminology.class.toLowerCase()}s</option>
            {schoolTurmas.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} max={todayStr()} className="p-2 border border-outline-variant rounded-zela-md text-sm" />
        </div>
      </div>

      {error && (
        <div className="px-5 sm:px-6 pt-4">
          <div className="bg-red-50 border border-red-100 text-red-600 p-2.5 rounded-zela-md text-xs font-medium">{error}</div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant/70 text-sm font-semibold">Nenhum registro de frequência nesta data.</div>
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
                <span className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full shrink-0 ${info.cls}`}>
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
