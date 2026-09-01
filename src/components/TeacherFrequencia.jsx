import React, { useEffect, useState } from 'react';
import { ClipboardCheck, Loader2, Check, X as XIcon, Clock, FileWarning } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSchoolConfig } from '../lib/schoolConfig';

const STATUS_OPTIONS = [
  { value: 'presente', label: 'Presente', icon: Check, cls: 'bg-emerald-500 text-white border-emerald-500' },
  { value: 'ausente', label: 'Ausente', icon: XIcon, cls: 'bg-red-500 text-white border-red-500' },
  { value: 'atrasado', label: 'Atrasado', icon: Clock, cls: 'bg-amber-500 text-white border-amber-500' },
  { value: 'justificado', label: 'Justificado', icon: FileWarning, cls: 'bg-slate-500 text-white border-slate-500' },
];

const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

// Frequência formal (chamada letiva) — distinta do check-in/out de
// segurança (Monitor/Totem). É o professor marcando presença de cada
// aluno da própria turma, por dia, pro histórico pedagógico/boletim.
export default function TeacherFrequencia({ currentUser, currentSchool }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;
  const turmas = currentUser?.turmas || [];
  const { terminology } = useSchoolConfig(schoolId);

  const [date, setDate] = useState(todayStr());
  const [selectedTurma, setSelectedTurma] = useState(turmas[0] || '');
  const [students, setStudents] = useState([]);
  const [records, setRecords] = useState(new Map()); // student_id -> row de class_attendance
  const [pending, setPending] = useState(new Map()); // student_id -> status ainda não salvo
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');

  const fetchData = async () => {
    if (!schoolId || !selectedTurma) { setIsLoading(false); return; }
    setIsLoading(true);
    setError('');
    try {
      const { data: studentsData, error: studentsError } = await supabase
        .from('students')
        .select('id, name')
        .eq('school_id', schoolId)
        .eq('turma', selectedTurma)
        .order('name', { ascending: true });
      if (studentsError) throw studentsError;
      setStudents(studentsData || []);

      const { data: attData, error: attError } = await supabase
        .from('class_attendance')
        .select('*')
        .eq('school_id', schoolId)
        .eq('class_name', selectedTurma)
        .eq('date', date);
      if (attError) throw attError;
      setRecords(new Map((attData || []).map(r => [r.student_id, r])));
      setPending(new Map());
    } catch (err) {
      console.error('[TeacherFrequencia] Erro ao carregar:', err);
      setError('Não foi possível carregar a frequência.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [schoolId, selectedTurma, date]);

  const markStatus = async (studentId, status) => {
    setSavingId(studentId);
    setError('');
    try {
      const existing = records.get(studentId);
      const { data, error: upsertError } = await supabase
        .from('class_attendance')
        .upsert(
          { school_id: schoolId, student_id: studentId, class_name: selectedTurma, date, status, recorded_by: currentUser.id },
          { onConflict: 'student_id,date' }
        )
        .select()
        .single();
      if (upsertError) throw upsertError;
      setRecords(prev => new Map(prev).set(studentId, data));
      void existing; // só documenta a intenção -- upsert já cobre criar/atualizar
    } catch (err) {
      console.error('[TeacherFrequencia] Erro ao marcar presença:', err);
      setError('Não foi possível salvar. Tente novamente.');
    } finally {
      setSavingId(null);
    }
  };

  if (turmas.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-center text-on-surface-variant">
        Você não tem nenhuma {terminology.class.toLowerCase()} atribuída ainda.
      </div>
    );
  }

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
          {turmas.length > 1 && (
            <select value={selectedTurma} onChange={e => setSelectedTurma(e.target.value)} className="p-2 border border-outline-variant rounded-zela-md text-sm bg-white">
              {turmas.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
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
        ) : students.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant/70 text-sm font-semibold">Nenhum aluno nesta {terminology.class.toLowerCase()}.</div>
        ) : (
          students.map(s => {
            const current = pending.get(s.id) || records.get(s.id)?.status;
            return (
              <div key={s.id} className="flex items-center justify-between gap-3 p-3 bg-surface-container-low border border-outline-variant rounded-zela-lg">
                <p className="font-bold text-on-surface text-sm truncate">{s.name}</p>
                <div className="flex items-center gap-1.5 shrink-0">
                  {savingId === s.id ? (
                    <Loader2 size={16} className="animate-spin text-primary" />
                  ) : (
                    STATUS_OPTIONS.map(opt => {
                      const Icon = opt.icon;
                      const active = current === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          title={opt.label}
                          onClick={() => markStatus(s.id, opt.value)}
                          className={`p-1.5 rounded-lg border transition ${active ? opt.cls : 'bg-white text-on-surface-variant/50 border-outline-variant hover:border-primary/40'}`}
                        >
                          <Icon size={14} />
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
