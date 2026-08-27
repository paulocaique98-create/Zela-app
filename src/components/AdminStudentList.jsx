import React, { useState, useEffect, useCallback } from 'react';
import { GraduationCap, Search, X, Users, RefreshCw, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { TURMAS } from '../lib/constants';

const PAGE_SIZE = 30;

export default function AdminStudentList({ currentUser }) {
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTurma, setSelectedTurma] = useState('Todas as Turmas');

  // Contagem por turma é uma query separada e leve (só a coluna `turma`,
  // sem os outros campos) pra alimentar os badges dos filtros sem precisar
  // carregar a lista inteira de alunos — evita que o "Alunos matriculados"
  // e os contadores por turma dependam da paginação da tabela abaixo.
  const [turmaCounts, setTurmaCounts] = useState({});
  const [totalCount, setTotalCount] = useState(0);

  const fetchCounts = useCallback(async () => {
    if (!currentUser?.school_id) return;
    const { data, error } = await supabase
      .from('students')
      .select('turma')
      .eq('school_id', currentUser.school_id);
    if (error) {
      console.error('Erro ao buscar contagem de alunos:', error);
      return;
    }
    const counts = {};
    (data || []).forEach(s => { counts[s.turma] = (counts[s.turma] || 0) + 1; });
    setTurmaCounts(counts);
    setTotalCount((data || []).length);
  }, [currentUser?.school_id]);

  // Busca uma página de alunos já filtrada no servidor por turma/nome — só
  // os PAGE_SIZE primeiros resultados trafegam, em vez da escola inteira.
  const fetchPage = useCallback(async (offset, { append } = { append: false }) => {
    if (!currentUser?.school_id) return;
    if (append) setIsLoadingMore(true); else setIsLoading(true);
    try {
      let query = supabase
        .from('students')
        .select('id, name, turma, contracted_hours, contracted_entry_time, status, family_id, users:family_id(name, email, phone)')
        .eq('school_id', currentUser.school_id)
        .order('name', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (selectedTurma !== 'Todas as Turmas') query = query.eq('turma', selectedTurma);
      if (searchTerm.trim()) query = query.ilike('name', `%${searchTerm.trim()}%`);

      const { data, error } = await query;
      if (error) throw error;

      setStudents(prev => (append ? [...prev, ...(data || [])] : (data || [])));
      setHasMore((data || []).length === PAGE_SIZE);
    } catch (err) {
      console.error('Erro ao buscar alunos:', err);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [currentUser?.school_id, selectedTurma, searchTerm]);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);

  // Refaz a primeira página sempre que o filtro de turma ou a busca muda —
  // debounce simples na busca pra não disparar uma query a cada tecla.
  useEffect(() => {
    const timer = setTimeout(() => fetchPage(0), searchTerm ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchPage, searchTerm, selectedTurma]);

  const handleRefresh = () => {
    fetchCounts();
    fetchPage(0);
  };

  const handleLoadMore = () => fetchPage(students.length, { append: true });

  return (
    <div className="h-full flex flex-col bg-surface-container-lowest p-5 md:p-6 rounded-zela-xl shadow-sm border border-outline-variant overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-400">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2.5 rounded-zela-md text-primary">
            <GraduationCap size={22} />
          </div>
          <div>
            <h2 className="text-h3 text-on-surface">Lista de Alunos</h2>
            <p className="text-small text-on-surface-variant">
              {totalCount} aluno{totalCount !== 1 ? 's' : ''} matriculado{totalCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="flex items-center gap-2 text-small font-bold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 px-4 py-2 rounded-zela-md transition disabled:opacity-50 shrink-0"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      {/* Filtros: Busca + Turma */}
      <div className="flex flex-col md:flex-row gap-3 mb-6 shrink-0">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-on-surface-variant/70" />
          </div>
          <input
            type="text"
            placeholder="Buscar aluno por nome..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-8 py-2.5 bg-surface-container-low border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary outline-none text-sm"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-on-surface-variant/70 hover:text-on-surface-variant">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex gap-2 p-1 bg-surface-container rounded-zela-lg overflow-x-auto shrink-0 max-w-full">
          {TURMAS.map(turma => (
            <button
              key={turma}
              onClick={() => setSelectedTurma(turma)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${selectedTurma === turma
                  ? 'bg-surface-container-lowest shadow-sm text-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
                }`}
            >
              {turma}
              {turma !== 'Todas as Turmas' && (
                <span className="ml-1 text-[9px] bg-surface-container-high text-on-surface-variant rounded-full px-1.5 py-0.5">
                  {turmaCounts[turma] || 0}
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
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
          </div>
        ) : students.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 bg-surface-container-low rounded-zela-lg border border-dashed border-outline-variant">
            <Users className="h-10 w-10 text-slate-300 mb-3" />
            <p className="text-on-surface-variant font-medium text-small">Nenhum aluno encontrado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-outline-variant">
                  <th className="pb-3 pr-4 text-xs font-bold text-on-surface-variant/70 uppercase tracking-wider">Aluno</th>
                  <th className="pb-3 pr-4 text-xs font-bold text-on-surface-variant/70 uppercase tracking-wider hidden sm:table-cell">Turma</th>
                  <th className="pb-3 pr-4 text-xs font-bold text-on-surface-variant/70 uppercase tracking-wider hidden md:table-cell">Responsável</th>
                  <th className="pb-3 pr-4 text-xs font-bold text-on-surface-variant/70 uppercase tracking-wider hidden lg:table-cell">Contato</th>
                  <th className="pb-3 text-xs font-bold text-on-surface-variant/70 uppercase tracking-wider">Horas/Dia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {students.map(student => (
                  <tr key={student.id} className="hover:bg-surface-container-low transition-colors">
                    {/* Nome */}
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-gradient-to-br from-primary/20 to-primary/10 rounded-full flex items-center justify-center shrink-0 border border-primary/10">
                          <span className="text-primary font-black text-xs">
                            {(student.name || '?').charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="font-semibold text-on-surface">{student.name || 'Sem nome'}</span>
                          {student.contracted_entry_time == null && (
                            <span className="text-[10px] font-bold text-warning bg-amber-100 px-2 py-0.5 rounded w-max mt-0.5">
                              Sem período
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Turma */}
                    <td className="py-3 pr-4 hidden sm:table-cell">
                      {student.turma ? (
                        <span className="text-xs bg-primary/10 text-primary font-bold px-2 py-1 rounded-md">
                          {student.turma}
                        </span>
                      ) : (
                        <span className="text-xs text-on-surface-variant/70">Não definida</span>
                      )}
                    </td>

                    {/* Responsável */}
                    <td className="py-3 pr-4 hidden md:table-cell">
                      <span className="text-sm text-on-surface font-medium">
                        {student.users?.name || '—'}
                      </span>
                    </td>

                    {/* Contato */}
                    <td className="py-3 pr-4 hidden lg:table-cell">
                      <span className="text-xs text-on-surface-variant">
                        {student.users?.phone || student.users?.email || '—'}
                      </span>
                    </td>

                    {/* Horas contratadas */}
                    <td className="py-3">
                      <span className="text-xs font-bold text-on-surface bg-surface-container px-2 py-1 rounded-md">
                        {student.contracted_hours}h
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hasMore && (
              <div className="flex justify-center py-4">
                <button
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className="flex items-center gap-2 text-sm font-bold text-primary bg-primary/10 hover:bg-primary/20 px-5 py-2.5 rounded-zela-md transition disabled:opacity-60"
                >
                  {isLoadingMore ? <Loader2 size={14} className="animate-spin" /> : null}
                  {isLoadingMore ? 'Carregando...' : 'Carregar mais alunos'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
