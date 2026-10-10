import React, { useEffect, useState } from 'react';
import { Loader2, Check, X as XIcon, Clock, FileWarning, ChevronLeft, ChevronRight, ChevronDown, CalendarDays } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSchoolConfig } from '../lib/schoolConfig';

const STATUS_OPTIONS = [
  { value: 'presente', label: 'Presente', icon: Check, cls: 'bg-success text-white border-success' },
  { value: 'ausente', label: 'Ausente', icon: XIcon, cls: 'bg-error text-white border-error' },
  { value: 'atrasado', label: 'Atrasado', icon: Clock, cls: 'bg-warning text-white border-warning' },
  { value: 'justificado', label: 'Justificado', icon: FileWarning, cls: 'bg-on-surface-variant text-white border-on-surface-variant' },
];

// Só Presente e Ausente são marcados na tela; Atrasado e Justificado ficam
// em STATUS_OPTIONS para exibir registros antigos que já existam.
const MARK_OPTIONS = STATUS_OPTIONS.slice(0, 2);

const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

// Soma dias a uma data AAAA-MM-DD sem mexer em fuso (meio-dia evita virada).
const shiftDate = (str, days) => {
  const d = new Date(`${str}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA');
};

// "Sexta, 9 de outubro de 2026" (sem o "-feira", que traria hífen no texto).
const formatDateLong = (str) => {
  const txt = new Date(`${str}T12:00:00`)
    .toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .replace('-feira', '');
  return txt.charAt(0).toUpperCase() + txt.slice(1);
};

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
  const [expandedId, setExpandedId] = useState(null); // um aluno aberto por vez; começa fechado
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

  useEffect(() => { setExpandedId(null); fetchData(); }, [schoolId, selectedTurma, date]);

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
    <div className="h-full flex flex-col bg-surface-container-lowest -m-3 sm:m-0 rounded-none sm:rounded-zela-lg border-0 sm:border sm:border-outline-variant md:rounded-none md:border-0 overflow-hidden">
      {/* Título "Frequência" e ícone removidos (o Header do app já mostra o
          nome da tela dinamicamente) -- não sobrava nenhuma descrição pra
          ficar no lugar, então a linha vai direto pros filtros. */}
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-2 sm:px-6 sm:py-2.5 border-b border-outline-variant shrink-0">
        {/* Seletor de data: dia anterior, data por extenso (abre o calendário
            do aparelho) e dia seguinte. Nunca passa de hoje. */}
        <div className="flex items-stretch justify-center gap-2 w-full sm:w-auto">
          <div className="flex flex-1 sm:flex-none items-stretch border border-outline-variant rounded-zela-md bg-surface-container-lowest overflow-hidden">
            <button
              type="button"
              onClick={() => setDate(shiftDate(date, -1))}
              aria-label="Dia anterior"
              className="w-10 sm:w-9 min-h-[40px] sm:min-h-[36px] flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low hover:text-primary transition-colors"
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <label className="relative flex-1 sm:w-72 min-h-[40px] sm:min-h-[36px] px-3 flex items-center justify-center gap-2 border-x border-outline-variant cursor-pointer hover:bg-surface-container-low transition-colors focus-within:ring-2 focus-within:ring-primary">
              <CalendarDays size={16} className="text-primary shrink-0" aria-hidden="true" />
              <span className="text-sm font-semibold text-on-surface text-center leading-tight">{formatDateLong(date)}</span>
              <input
                type="date"
                value={date}
                max={todayStr()}
                aria-label="Escolher data"
                onChange={e => e.target.value && setDate(e.target.value)}
                onClick={e => { try { e.currentTarget.showPicker?.(); } catch { /* navegador sem showPicker */ } }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </label>
            <button
              type="button"
              onClick={() => setDate(shiftDate(date, 1))}
              disabled={date >= todayStr()}
              aria-label="Próximo dia"
              className="w-10 sm:w-9 min-h-[40px] sm:min-h-[36px] flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low hover:text-primary transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-on-surface-variant disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
          {date !== todayStr() && (
            <button
              type="button"
              onClick={() => setDate(todayStr())}
              className="min-h-[40px] sm:min-h-[36px] px-4 rounded-zela-md border border-primary text-primary text-sm font-semibold hover:bg-primary/10 transition-colors"
            >
              Hoje
            </button>
          )}
        </div>
        {turmas.length > 1 && (
          <select value={selectedTurma} onChange={e => setSelectedTurma(e.target.value)} aria-label="Turma" className="min-h-[40px] sm:min-h-[36px] px-3 border border-outline-variant rounded-zela-md text-base sm:text-sm bg-surface-container-lowest">
            {turmas.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
      </div>

      {error && (
        <div className="px-5 sm:px-6 pt-4">
          <div className="bg-error/10 border-l-4 border-error text-error p-2.5 rounded-zela-md text-xs font-medium">{error}</div>
        </div>
      )}

      {!isLoading && students.length > 0 && (
        <div className="px-5 sm:px-6 pt-4 shrink-0" role="row">
          <div className="flex items-center justify-between pl-3 pr-3 sm:pr-0 pb-2 border-b border-outline-variant text-xs font-semibold text-on-surface-variant">
            <span role="columnheader">Aluno</span>
            <span role="columnheader" className="hidden sm:block sm:w-[16rem] sm:text-center">Situação</span>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 text-primary motion-safe:animate-spin" aria-hidden="true" /></div>
        ) : students.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant/70 text-sm font-semibold">Nenhum aluno nesta {terminology.class.toLowerCase()}.</div>
        ) : (
          students.map(s => {
            const current = pending.get(s.id) || records.get(s.id)?.status;
            const isOpen = expandedId === s.id;
            const currentOpt = STATUS_OPTIONS.find(o => o.value === current);
            return (
              <div key={s.id} className="bg-surface-container-low border border-outline-variant rounded-zela-lg sm:flex sm:items-center sm:justify-between">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setExpandedId(isOpen ? null : s.id)}
                  className="w-full sm:flex-1 min-h-[52px] p-3 flex items-center justify-between gap-3 text-left sm:cursor-default sm:pointer-events-none"
                >
                  <span className="font-bold text-on-surface text-sm break-words min-w-0">{s.name}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    {currentOpt && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-sm ${currentOpt.cls} ${MARK_OPTIONS.includes(currentOpt) ? 'sm:hidden' : ''}`}>{currentOpt.label}</span>
                    )}
                    <ChevronDown size={18} className={`sm:hidden text-on-surface-variant transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </span>
                </button>
                <div className={`${isOpen ? 'grid' : 'hidden'} sm:grid grid-cols-2 gap-2 px-3 pb-3 sm:pb-0 sm:pr-3 min-h-12 sm:w-[16rem] sm:shrink-0`}>
                    {savingId === s.id ? (
                      <div className="col-span-2 flex items-center justify-center h-12">
                        <Loader2 size={18} className="motion-safe:animate-spin text-primary" aria-hidden="true" />
                      </div>
                    ) : (
                      MARK_OPTIONS.map(opt => {
                        const Icon = opt.icon;
                        const active = current === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            aria-pressed={active}
                            onClick={() => markStatus(s.id, opt.value)}
                            className={`h-12 flex flex-col items-center justify-center gap-0.5 rounded-zela-md border transition-colors ${active ? opt.cls : 'bg-surface-container-lowest text-on-surface-variant border-outline-variant hover:border-primary'}`}
                          >
                            <Icon size={18} aria-hidden="true" />
                            <span className="text-[11px] leading-none font-semibold">{opt.label}</span>
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
