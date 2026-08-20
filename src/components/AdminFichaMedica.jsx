import React, { useEffect, useState } from 'react';
import { Heart, Loader2, ChevronDown, ChevronUp, AlertTriangle, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';

const BLOCKS = [
  { flagKey: 'tem_restricao_alimentar', listKey: 'restricoes_alimentares', label: 'Restrição/Alergia Alimentar' },
  { flagKey: 'tem_restricao_saude', listKey: 'restricoes_saude', label: 'Restrição de Saúde' },
  { flagKey: 'consultou_especialista', listKey: 'especialistas', label: 'Especialistas Consultados' },
  { flagKey: 'faz_tratamento', listKey: 'tratamentos', label: 'Tratamentos' },
  { flagKey: 'usa_medicamento', listKey: 'medicamentos', label: 'Medicamentos em Uso' },
  { flagKey: 'tem_habito_importante', listKey: 'habitos_importantes', label: 'Hábitos Importantes' },
];

function FichaCard({ student, ficha }) {
  const [expanded, setExpanded] = useState(false);
  const hasAlerta = ficha?.tem_restricao_alimentar || ficha?.tem_restricao_saude || ficha?.usa_medicamento;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <button type="button" onClick={() => setExpanded(e => !e)} className="w-full flex items-center justify-between p-4 text-left">
        <div className="min-w-0 flex items-center gap-2.5">
          {hasAlerta && <AlertTriangle size={16} className="text-amber-500 shrink-0" />}
          <div className="min-w-0">
            <p className="font-bold text-slate-800 text-sm truncate">{student.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {ficha ? (
            <span className="text-[10px] font-extrabold uppercase px-2 py-1 rounded-lg border bg-green-50 text-green-700 border-green-200">Preenchida</span>
          ) : (
            <span className="text-[10px] font-extrabold uppercase px-2 py-1 rounded-lg border bg-slate-100 text-slate-500 border-slate-200">Não preenchida</span>
          )}
          {expanded ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 sm:px-5 pb-5 space-y-3 border-t border-slate-100 pt-4">
          {!ficha ? (
            <p className="text-sm text-slate-400">A família ainda não preencheu a ficha médica deste aluno.</p>
          ) : (
            <>
              {BLOCKS.map(b => (
                <div key={b.flagKey}>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">{b.label}</p>
                  {ficha[b.flagKey] && ficha[b.listKey]?.length > 0 ? (
                    <ul className="space-y-1">
                      {ficha[b.listKey].map((item, i) => (
                        <li key={i} className="text-sm text-slate-700 font-medium bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-400">NÃO</p>
                  )}
                </div>
              ))}
              <p className="text-[11px] text-slate-400 pt-1">
                Última atualização: {new Date(ficha.updated_at).toLocaleString('pt-BR')}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminFichaMedica({ currentUser, currentSchool, students }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;
  const [fichas, setFichas] = useState(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!schoolId) return;
      setIsLoading(true);
      setError('');
      try {
        const { data, error: fetchError } = await supabase
          .from('fichas_medicas')
          .select('*')
          .eq('school_id', schoolId);
        if (fetchError) throw fetchError;
        const map = new Map();
        (data || []).forEach(f => map.set(f.student_id, f));
        setFichas(map);
      } catch (err) {
        console.error('[AdminFichaMedica] Erro ao buscar fichas:', err);
        setError('Não foi possível carregar as fichas médicas.');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [schoolId]);

  const filteredStudents = (students || []).filter(s => s.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="h-full flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 p-5 sm:p-6 border-b border-slate-100 shrink-0">
        <div className="bg-indigo-50 p-2.5 rounded-xl text-indigo-600">
          <Heart size={22} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Ficha Médica</h2>
          <p className="text-slate-500 text-sm hidden sm:block">Visualize as fichas médicas preenchidas pelos responsáveis dos alunos.</p>
        </div>
      </div>

      <div className="px-5 sm:px-6 pt-4 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Buscar aluno..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-3">
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-sm font-medium">{error}</div>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Heart className="mx-auto h-12 w-12 text-slate-300 mb-3" />
            <p className="text-sm font-semibold text-slate-600">Nenhum aluno encontrado.</p>
          </div>
        ) : (
          filteredStudents.map(s => (
            <FichaCard key={s.id} student={s} ficha={fichas.get(s.id)} />
          ))
        )}
      </div>
    </div>
  );
}
