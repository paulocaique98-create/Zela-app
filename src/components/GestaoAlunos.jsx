import React, { useState, useEffect, useCallback } from 'react';
import { Search, GraduationCap, ChevronRight, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSchoolConfig } from '../lib/schoolConfig';

const PAGE_SIZE = 30;

const ENROLLMENT_STATUS_LABELS = {
  ativo: 'Ativo',
  inativo: 'Inativo',
  transferido: 'Transferido',
  cancelado: 'Cancelado',
};

const ENROLLMENT_STATUS_STYLES = {
  ativo: 'bg-green-50 text-green-700 border-green-200',
  inativo: 'bg-slate-100 text-slate-600 border-slate-200',
  transferido: 'bg-amber-50 text-amber-700 border-amber-200',
  cancelado: 'bg-red-50 text-red-600 border-red-200',
};

// Secretaria > Alunos — listagem só leitura (Fase 3 do módulo Secretaria).
// Editar cadastro continua sendo feito pelo Admin/Recepção (AdminUserRegistration.jsx);
// esta tela é o ponto de entrada pro perfil unificado (GestaoAlunoPerfil.jsx),
// que não existia em lugar nenhum do Zela antes desta fase.
export default function GestaoAlunos({ currentUser, onOpenAluno }) {
  const { turmas: schoolTurmas } = useSchoolConfig(currentUser?.school_id);
  const turmaOptions = ['Todas as turmas', ...schoolTurmas];

  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTurma, setSelectedTurma] = useState('Todas as turmas');
  const [selectedStatus, setSelectedStatus] = useState('todos');

  const fetchPage = useCallback(async (offset, { append } = { append: false }) => {
    if (!currentUser?.school_id) return;
    if (append) setIsLoadingMore(true); else setIsLoading(true);
    try {
      let query = supabase
        .from('students')
        .select('id, name, turma, turno, enrollment_status, family_id, users:family_id(name)')
        .eq('school_id', currentUser.school_id)
        .order('name', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (selectedTurma !== 'Todas as turmas') query = query.eq('turma', selectedTurma);
      if (selectedStatus !== 'todos') query = query.eq('enrollment_status', selectedStatus);
      if (searchTerm.trim()) query = query.ilike('name', `%${searchTerm.trim()}%`);

      const { data, error } = await query;
      if (error) throw error;

      setStudents(prev => (append ? [...prev, ...(data || [])] : (data || [])));
      setHasMore((data || []).length === PAGE_SIZE);
    } catch (err) {
      console.error('[GestaoAlunos] Erro ao buscar alunos:', err);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [currentUser?.school_id, selectedTurma, selectedStatus, searchTerm]);

  useEffect(() => {
    const timeout = setTimeout(() => fetchPage(0), searchTerm ? 300 : 0);
    return () => clearTimeout(timeout);
  }, [fetchPage, searchTerm]);

  return (
    <div className="h-full flex flex-col bg-white -m-3 sm:m-0 rounded-none border-0 shadow-none overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 sm:p-5 border-b border-outline-variant shrink-0">
        <div className="relative flex-1 min-w-0">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <select
          value={selectedTurma}
          onChange={e => setSelectedTurma(e.target.value)}
          className="text-sm border border-outline-variant rounded-zela-md px-3 py-2 bg-white shrink-0"
        >
          {turmaOptions.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={selectedStatus}
          onChange={e => setSelectedStatus(e.target.value)}
          className="text-sm border border-outline-variant rounded-zela-md px-3 py-2 bg-white shrink-0"
        >
          <option value="todos">Todas as situações</option>
          {Object.entries(ENROLLMENT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : students.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant/70">
            <GraduationCap className="mx-auto h-12 w-12 text-outline-variant mb-3" />
            <p className="text-sm font-semibold text-on-surface-variant">Nenhum aluno encontrado.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {students.map(student => (
              <button
                key={student.id}
                onClick={() => onOpenAluno(student.id)}
                className="w-full flex items-center gap-3 p-3.5 bg-white border border-outline-variant hover:border-primary/40 hover:bg-primary/5 rounded-zela-lg transition text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-on-surface text-sm truncate">{student.name}</p>
                  <p className="text-on-surface-variant/70 text-xs truncate">
                    {student.turma || '—'}{student.turno ? ` · ${student.turno}` : ''} · Responsável: {student.users?.name || '—'}
                  </p>
                </div>
                <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full border ${ENROLLMENT_STATUS_STYLES[student.enrollment_status] || ENROLLMENT_STATUS_STYLES.ativo}`}>
                  {ENROLLMENT_STATUS_LABELS[student.enrollment_status] || student.enrollment_status}
                </span>
                <ChevronRight size={16} className="text-on-surface-variant/50 shrink-0" />
              </button>
            ))}
            {hasMore && (
              <button
                onClick={() => fetchPage(students.length, { append: true })}
                disabled={isLoadingMore}
                className="mt-2 text-sm font-bold text-primary hover:bg-primary/5 py-2.5 rounded-zela-md transition disabled:opacity-60"
              >
                {isLoadingMore ? 'Carregando...' : 'Carregar mais'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
