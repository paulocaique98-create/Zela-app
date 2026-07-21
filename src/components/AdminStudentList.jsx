import React, { useState, useEffect } from 'react';
import { GraduationCap, Search, X, Users, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { TURMAS } from '../lib/constants';

export default function AdminStudentList({ currentUser }) {
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTurma, setSelectedTurma] = useState('Todas as Turmas');

  const fetchStudents = async () => {
    setIsLoading(true);
    try {
      // Busca alunos com dados da família vinculada
      const { data, error } = await supabase
        .from('students')
        .select('id, name, turma, contracted_hours, status, family_id, users:family_id(name, email, phone)')
        .eq('school_id', currentUser.school_id)
        .order('name', { ascending: true });

      if (error) throw error;
      setStudents(data || []);
    } catch (err) {
      console.error('Erro ao buscar alunos:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchStudents(); }, []);

  const turmaOptions = TURMAS;

  const filtered = students.filter(s => {
    const term = searchTerm.toLowerCase().trim();
    const matchesSearch = !term || (s.name && s.name.toLowerCase().includes(term));
    const matchesTurma = selectedTurma === 'Todas as Turmas' || s.turma === selectedTurma;
    return matchesSearch && matchesTurma;
  });

  const countPerTurma = (turma) =>
    students.filter(s => s.turma === turma).length;

  return (
    <div className="h-full flex flex-col bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-400">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-100 p-2.5 rounded-xl text-indigo-600">
            <GraduationCap size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Lista de Alunos</h2>
            <p className="text-sm text-slate-500">
              {students.length} aluno{students.length !== 1 ? 's' : ''} matriculado{students.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <button
          onClick={fetchStudents}
          disabled={isLoading}
          className="flex items-center gap-2 text-sm font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-4 py-2 rounded-xl transition disabled:opacity-50 shrink-0"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      {/* Filtros: Busca + Turma */}
      <div className="flex flex-col md:flex-row gap-3 mb-6 shrink-0">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            placeholder="Buscar aluno por nome..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl overflow-x-auto shrink-0 max-w-full">
          {turmaOptions.map(turma => (
            <button
              key={turma}
              onClick={() => setSelectedTurma(turma)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${selectedTurma === turma
                  ? 'bg-white shadow-sm text-indigo-900'
                  : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              {turma}
              {turma !== 'Todas as Turmas' && (
                <span className="ml-1 text-[9px] bg-slate-200 text-slate-600 rounded-full px-1.5 py-0.5">
                  {countPerTurma(turma)}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela - Scrollable Container */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        {isLoading ? (
          <div className="flex justify-center items-center h-full py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
            <Users className="h-10 w-10 text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium text-sm">Nenhum aluno encontrado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-100">
                  <th className="pb-3 pr-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Aluno</th>
                  <th className="pb-3 pr-4 text-xs font-bold text-slate-400 uppercase tracking-wider hidden sm:table-cell">Turma</th>
                  <th className="pb-3 pr-4 text-xs font-bold text-slate-400 uppercase tracking-wider hidden md:table-cell">Responsável</th>
                  <th className="pb-3 pr-4 text-xs font-bold text-slate-400 uppercase tracking-wider hidden lg:table-cell">Contato</th>
                  <th className="pb-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Horas/Dia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(student => (
                  <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                    {/* Nome */}
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-gradient-to-br from-indigo-100 to-indigo-200 rounded-full flex items-center justify-center shrink-0 border border-indigo-100">
                          <span className="text-indigo-700 font-black text-xs">
                            {(student.name || '?').charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span className="font-semibold text-slate-800">{student.name || 'Sem nome'}</span>
                      </div>
                    </td>

                    {/* Turma */}
                    <td className="py-3 pr-4 hidden sm:table-cell">
                      {student.turma ? (
                        <span className="text-xs bg-indigo-50 text-indigo-700 font-bold px-2 py-1 rounded-md">
                          {student.turma}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Não definida</span>
                      )}
                    </td>

                    {/* Responsável */}
                    <td className="py-3 pr-4 hidden md:table-cell">
                      <span className="text-sm text-slate-700 font-medium">
                        {student.users?.name || '—'}
                      </span>
                    </td>

                    {/* Contato */}
                    <td className="py-3 pr-4 hidden lg:table-cell">
                      <span className="text-xs text-slate-500">
                        {student.users?.phone || student.users?.email || '—'}
                      </span>
                    </td>

                    {/* Horas contratadas */}
                    <td className="py-3">
                      <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-md">
                        {student.contracted_hours}h
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

