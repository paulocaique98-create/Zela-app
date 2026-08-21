import React, { useEffect, useState } from 'react';
import { Users, ClipboardList, ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function TeacherInicio({ currentUser, currentSchool, setTeacherTab }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;
  const turmas = currentUser?.turmas || [];
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!schoolId || turmas.length === 0) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('students')
        .select('id, name, turma')
        .eq('school_id', schoolId)
        .in('turma', turmas)
        .order('name', { ascending: true });
      if (!cancelled) {
        if (!error) setStudents(data || []);
        setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [schoolId, JSON.stringify(turmas)]);

  const studentsByTurma = turmas.map(t => ({
    turma: t,
    students: students.filter(s => s.turma === t),
  }));

  return (
    <div className="h-full bg-slate-50 p-4 md:p-6 lg:p-8 rounded-3xl overflow-y-auto flex flex-col">
      <div className="max-w-4xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-lg md:text-xl font-medium text-slate-500">
            Olá, {currentUser?.name?.split(' ')[0] || 'Professor(a)'}
          </h1>
        </div>

        {turmas.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center text-slate-400">
            <Users className="mx-auto h-10 w-10 text-slate-300 mb-3" />
            <p className="text-sm font-semibold text-slate-600">Nenhuma turma vinculada ainda.</p>
            <p className="text-xs text-slate-400 mt-1">Peça à administração da escola para vincular sua(s) turma(s) no seu cadastro.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <button
              onClick={() => setTeacherTab('observacao-diaria')}
              className="w-full flex items-center gap-3 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 rounded-2xl p-4 sm:p-5 transition text-left"
            >
              <div className="bg-indigo-50 p-2.5 rounded-xl text-indigo-600 shrink-0">
                <ClipboardList size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-800">Registrar Observação Diária</p>
                <p className="text-slate-400 text-xs">Documente o que você observou hoje com um aluno.</p>
              </div>
              <ArrowRight size={16} className="text-slate-300 shrink-0" />
            </button>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
              </div>
            ) : (
              studentsByTurma.map(({ turma, students: turmaStudents }) => (
                <div key={turma} className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
                  <p className="text-[11px] font-black text-indigo-600 uppercase tracking-wide mb-3">
                    {turma} <span className="text-slate-400 font-semibold normal-case">— {turmaStudents.length} aluno{turmaStudents.length !== 1 ? 's' : ''}</span>
                  </p>
                  {turmaStudents.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Nenhum aluno cadastrado nesta turma ainda.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {turmaStudents.map(s => (
                        <span key={s.id} className="text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                          {s.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
