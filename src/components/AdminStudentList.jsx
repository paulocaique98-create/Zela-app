import React, { useState, useEffect, useCallback } from 'react';
import { GraduationCap, Search, X, Users, Loader2, ArrowRightLeft, Check, History, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSchoolConfig } from '../lib/schoolConfig';
import { formatIdade, idadeEmMeses } from '../lib/sugestaoTurma';

const PAGE_SIZE = 30;

export default function AdminStudentList({ currentUser }) {
  const { turmas: schoolTurmas } = useSchoolConfig(currentUser?.school_id);
  const turmaOptions = ['Todas as Turmas', ...schoolTurmas];

  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTurma, setSelectedTurma] = useState('Todas as Turmas');
  const [turmaMenuOpen, setTurmaMenuOpen] = useState(false);

  // Fecha o menu de turmas ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!turmaMenuOpen) return;
    const onDown = e => { if (!e.target.closest('[data-turma-menu]')) setTurmaMenuOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setTurmaMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [turmaMenuOpen]);

  // Contagem por turma é uma query separada e leve (só a coluna `turma`,
  // sem os outros campos) pra alimentar os badges dos filtros sem precisar
  // carregar a lista inteira de alunos — evita que o "Alunos matriculados"
  // e os contadores por turma dependam da paginação da tabela abaixo.
  const [turmaCounts, setTurmaCounts] = useState({});
  const [totalCount, setTotalCount] = useState(0);

  // Transferência de turma
  const [transferTarget, setTransferTarget] = useState(null); // student row
  const [transferTurma, setTransferTurma] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferError, setTransferError] = useState('');
  const [historyTarget, setHistoryTarget] = useState(null); // student row
  const [history, setHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const openTransfer = (student) => {
    setTransferTarget(student);
    setTransferTurma('');
    setTransferReason('');
    setTransferError('');
  };

  const handleTransfer = async (e) => {
    e.preventDefault();
    if (!transferTurma) return;
    setIsTransferring(true);
    setTransferError('');
    try {
      const { error } = await supabase.rpc('transfer_student_class', {
        p_student_id: transferTarget.id, p_new_turma: transferTurma, p_reason: transferReason.trim() || null,
      });
      if (error) throw error;
      setTransferTarget(null);
      fetchCounts();
      fetchPage(0);
    } catch (err) {
      console.error('[AdminStudentList] Erro ao transferir:', err);
      setTransferError(err.message || 'Não foi possível transferir o aluno.');
    } finally {
      setIsTransferring(false);
    }
  };

  const openHistory = async (student) => {
    setHistoryTarget(student);
    setIsLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('student_transfers')
        .select('from_class_name, to_class_name, reason, transferred_at')
        .eq('student_id', student.id)
        .order('transferred_at', { ascending: false });
      if (error) throw error;
      setHistory(data || []);
    } catch (err) {
      console.error('[AdminStudentList] Erro ao buscar histórico:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

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
        .select('id, name, turma, birth_date, contracted_hours, contracted_entry_time, isento_hora_extra, status, family_id, users:family_id(name, email, phone)')
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

  const handleLoadMore = () => fetchPage(students.length, { append: true });

  const renderTurmaMenu = visibilidade => (
    <div data-turma-menu className={`relative ${visibilidade}`}>
      <button
        type="button"
        onClick={() => setTurmaMenuOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={turmaMenuOpen}
        className="w-full md:w-auto flex items-center gap-2 px-4 py-2.5 bg-surface-container-low border border-outline-variant rounded-zela-md text-sm font-semibold text-on-surface hover:bg-surface-container transition"
      >
        <Users size={15} className="text-on-surface-variant/70" />
        <span className="truncate flex-1 text-left">{selectedTurma}</span>
        <ChevronDown size={15} className={`text-on-surface-variant/70 transition-transform ${turmaMenuOpen ? 'rotate-180' : ''}`} />
      </button>
      {turmaMenuOpen && (
        <ul role="listbox" className="absolute right-0 top-full mt-1.5 z-30 min-w-full w-max max-h-80 overflow-y-auto p-1 bg-surface-container-lowest border border-outline-variant rounded-zela-lg shadow-lg">
          {turmaOptions.map(turma => (
            <li key={turma} role="option" aria-selected={selectedTurma === turma}>
              <button
                type="button"
                onClick={() => { setSelectedTurma(turma); setTurmaMenuOpen(false); }}
                className={`w-full flex items-center justify-between gap-6 px-3 py-2 rounded-lg text-sm text-left transition ${selectedTurma === turma ? 'bg-primary/10 text-primary font-bold' : 'text-on-surface hover:bg-surface-container-low'}`}
              >
                <span>{turma}</span>
                <span className="flex items-center gap-1.5">
                  {turma !== 'Todas as Turmas' && <span className="text-xs text-on-surface-variant/70">{turmaCounts[turma] || 0}</span>}
                  {selectedTurma === turma && <Check size={14} />}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-surface-container-lowest -m-3 sm:m-0 p-2.5 sm:p-5 md:p-6 rounded-none sm:rounded-zela-xl shadow-none sm:shadow-sm border-0 sm:border sm:border-outline-variant md:rounded-none md:shadow-none md:border-0 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-400">
      {/* Header -- título "Lista de Alunos" removido (o Header do app já
          mostra o nome da tela dinamicamente), ícone + contador numa linha
          só, mais compacta. */}
      <div className="flex items-center gap-4 mb-4 sm:mb-6 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="bg-primary/10 p-2 rounded-zela-md text-primary shrink-0">
            <GraduationCap size={18} />
          </div>
          <p className="text-small text-on-surface-variant">
            {totalCount} aluno{totalCount !== 1 ? 's' : ''} matriculado{totalCount !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Filtros: Busca + Turma */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4 sm:mb-6 shrink-0">
        <div className="relative w-full lg:w-auto lg:flex-1 min-w-0">
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

        {renderTurmaMenu('shrink-0 w-full md:w-auto md:self-end lg:self-auto')}
      </div>

      {/* Tabela - Scrollable Container */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        {isLoading ? (
          <div className="flex justify-center items-center h-full py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
          </div>
        ) : students.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 bg-surface-container-low rounded-zela-lg border border-dashed border-outline-variant">
            <Users className="h-10 w-10 text-on-surface-variant/50 mb-3" />
            <p className="text-on-surface-variant font-medium text-small">Nenhum aluno encontrado.</p>
          </div>
        ) : (
          <div>
            <ul className="md:hidden space-y-2.5">
              {students.map(student => (
                <li key={student.id} className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center shrink-0 border border-primary/10">
                      <span className="text-primary font-black text-sm">{(student.name || '?').charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-on-surface text-sm leading-tight break-words">{student.name || 'Sem nome'}</p>
                      <p className="text-xs text-on-surface-variant/70 mt-0.5">
                        {student.birth_date ? formatIdade(idadeEmMeses(student.birth_date)) : 'Idade não informada'}
                      </p>
                    </div>
                    <div className="flex items-center shrink-0 -mr-1 -mt-1">
                      <button onClick={() => openTransfer(student)} title="Transferir de turma" aria-label="Transferir de turma" className="p-2.5 text-on-surface-variant/70 active:text-primary active:bg-primary/10 rounded-lg transition">
                        <ArrowRightLeft size={17} />
                      </button>
                      <button onClick={() => openHistory(student)} title="Histórico de transferências" aria-label="Histórico de transferências" className="p-2.5 text-on-surface-variant/70 active:text-primary active:bg-primary/10 rounded-lg transition">
                        <History size={17} />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                    <span className="text-xs bg-primary/10 text-primary font-bold px-2 py-1 rounded-md">{student.turma || 'Sem turma'}</span>
                    <span className="text-xs font-bold text-on-surface bg-surface-container px-2 py-1 rounded-md">{student.contracted_hours}h</span>
                    {student.isento_hora_extra && (
                      <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-1 rounded-md">Bolsista</span>
                    )}
                    {student.contracted_entry_time == null && (
                      <span className="text-[10px] font-bold text-warning bg-brass-50 px-2 py-1 rounded-md">Sem período</span>
                    )}
                  </div>
                  {(student.users?.name || student.users?.phone) && (
                    <p className="text-xs text-on-surface-variant mt-2 break-words">
                      {student.users?.name || ''}{student.users?.name && (student.users?.phone || student.users?.email) ? ' · ' : ''}{student.users?.phone || student.users?.email || ''}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <table className="w-full text-sm hidden md:table">
              <thead>
                <tr className="text-left border-b border-outline-variant">
                  <th className="pb-3 pr-4 text-xs font-semibold text-on-surface-variant/70">Aluno</th>
                  <th className="pb-3 pr-4 text-xs font-semibold text-on-surface-variant/70">Turma</th>
                  <th className="pb-3 pr-4 text-xs font-semibold text-on-surface-variant/70 hidden lg:table-cell">Responsável</th>
                  <th className="pb-3 pr-4 text-xs font-semibold text-on-surface-variant/70 hidden xl:table-cell">Contato</th>
                  <th className="pb-3 pr-4 text-xs font-semibold text-on-surface-variant/70">Horas/Dia</th>
                  <th className="pb-3 text-xs font-semibold text-on-surface-variant/70">Ações</th>
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
                          <span className="font-semibold text-on-surface flex items-center gap-1.5">
                            {student.name || 'Sem nome'}
                            {student.isento_hora_extra && (
                              <span title="Isento de hora extra" className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                                Bolsista
                              </span>
                            )}
                          </span>
                          <span className="text-xs text-on-surface-variant/70">
                            {student.birth_date ? formatIdade(idadeEmMeses(student.birth_date)) : 'Idade não informada'}
                          </span>
                          {student.contracted_entry_time == null && (
                            <span className="text-[10px] font-bold text-warning bg-brass-50 px-2 py-0.5 rounded w-max mt-0.5">
                              Sem período
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Turma */}
                    <td className="py-3 pr-4">
                      {student.turma ? (
                        <span className="text-xs bg-primary/10 text-primary font-bold px-2 py-1 rounded-md">
                          {student.turma}
                        </span>
                      ) : (
                        <span className="text-xs text-on-surface-variant/70">Não definida</span>
                      )}
                    </td>

                    {/* Responsável */}
                    <td className="py-3 pr-4 hidden lg:table-cell">
                      <span className="text-sm text-on-surface font-medium">
                        {student.users?.name || '—'}
                      </span>
                    </td>

                    {/* Contato */}
                    <td className="py-3 pr-4 hidden xl:table-cell">
                      <span className="text-xs text-on-surface-variant">
                        {student.users?.phone || student.users?.email || '—'}
                      </span>
                    </td>

                    {/* Horas contratadas */}
                    <td className="py-3 pr-4">
                      <span className="text-xs font-bold text-on-surface bg-surface-container px-2 py-1 rounded-md">
                        {student.contracted_hours}h
                      </span>
                    </td>

                    {/* Ações */}
                    <td className="py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openTransfer(student)} title="Transferir de turma" className="p-1.5 text-on-surface-variant/70 hover:text-primary hover:bg-primary/10 rounded-lg transition">
                          <ArrowRightLeft size={15} />
                        </button>
                        <button onClick={() => openHistory(student)} title="Histórico de transferências" className="p-1.5 text-on-surface-variant/70 hover:text-primary hover:bg-primary/10 rounded-lg transition">
                          <History size={15} />
                        </button>
                      </div>
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

      {transferTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setTransferTarget(null)}>
          <form onSubmit={handleTransfer} onClick={e => e.stopPropagation()} className="bg-white rounded-zela-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-outline-variant">
              <h3 className="text-h3 text-on-surface">Transferir de turma</h3>
              <button type="button" onClick={() => setTransferTarget(null)} className="p-1.5 text-on-surface-variant/70 hover:text-on-surface rounded-lg"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-on-surface-variant">
                <strong className="text-on-surface">{transferTarget.name}</strong> · turma atual: <strong className="text-on-surface">{transferTarget.turma || 'não definida'}</strong>
              </p>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-1">Nova turma *</label>
                <select required value={transferTurma} onChange={e => setTransferTurma(e.target.value)} className="w-full p-2.5 border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary bg-white">
                  <option value="">Selecionar...</option>
                  {schoolTurmas.filter(t => t !== transferTarget.turma).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-1">Motivo (opcional)</label>
                <input type="text" value={transferReason} onChange={e => setTransferReason(e.target.value)} placeholder="Ex: Progressão de idade" className="w-full p-2.5 border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary" />
              </div>
              {transferError && <div className="bg-error/10 border border-error/30 text-error p-2.5 rounded-zela-md text-xs font-medium">{transferError}</div>}
            </div>
            <div className="flex items-center justify-end gap-2 p-5 border-t border-outline-variant">
              <button type="button" onClick={() => setTransferTarget(null)} className="px-4 py-2 text-sm font-bold text-on-surface-variant hover:bg-surface-container rounded-zela-md transition">Cancelar</button>
              <button type="submit" disabled={isTransferring || !transferTurma} className="flex items-center gap-1.5 bg-primary hover:bg-primary-container text-white px-4 py-2 rounded-zela-md font-bold transition-all active:scale-95 disabled:opacity-60">
                {isTransferring ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Transferir
              </button>
            </div>
          </form>
        </div>
      )}

      {historyTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setHistoryTarget(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-zela-xl shadow-xl w-full max-w-sm max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-outline-variant">
              <h3 className="text-h3 text-on-surface">Histórico · {historyTarget.name}</h3>
              <button onClick={() => setHistoryTarget(null)} className="p-1.5 text-on-surface-variant/70 hover:text-on-surface rounded-lg"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-2">
              {isLoadingHistory ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" size={24} /></div>
              ) : history.length === 0 ? (
                <p className="text-sm text-on-surface-variant/70 text-center py-8">Nenhuma transferência registrada.</p>
              ) : (
                history.map((h, i) => (
                  <div key={i} className="p-3 bg-surface-container-low border border-outline-variant rounded-zela-lg text-sm">
                    <p className="font-semibold text-on-surface">{h.from_class_name || '(sem turma)'} → {h.to_class_name}</p>
                    {h.reason && <p className="text-xs text-on-surface-variant mt-0.5">{h.reason}</p>}
                    <p className="text-[11px] text-on-surface-variant/70 mt-1">{new Date(h.transferred_at).toLocaleString('pt-BR')}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
