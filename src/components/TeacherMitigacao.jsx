import React, { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Plus, ArrowLeft, Check, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import MitigacaoReportEditor from './MitigacaoReportEditor';

const STATUS_BADGE = {
  RASCUNHO: 'bg-surface-container text-on-surface-variant border-outline-variant',
  PUBLICADO: 'bg-green-50 text-green-700 border-green-200',
  ARQUIVADO: 'bg-amber-50 text-amber-700 border-amber-200',
};
const STATUS_LABEL = { RASCUNHO: 'Rascunho', PUBLICADO: 'Publicado', ARQUIVADO: 'Arquivado' };

const PERIODOS = [
  { value: '1', label: '1º Semestre' },
  { value: '2', label: '2º Semestre' },
];
const currentYear = new Date().getFullYear();
const ANOS = [currentYear - 1, currentYear, currentYear + 1];

export default function TeacherMitigacao({ currentUser, currentSchool }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;
  const turmas = currentUser?.turmas || [];

  const [reports, setReports] = useState([]);
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ student_id: '', ano: currentYear, periodo: '1', guia_responsavel: currentUser?.name || '' });
  const [isCreating, setIsCreating] = useState(false);
  const [selectedTurma, setSelectedTurma] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [isStudentDropdownOpen, setIsStudentDropdownOpen] = useState(false);
  const studentComboRef = useRef(null);

  const [activeReport, setActiveReport] = useState(null);

  const studentsById = new Map(students.map(s => [s.id, s]));

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (studentComboRef.current && !studentComboRef.current.contains(e.target)) setIsStudentDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchAll = async () => {
    if (!schoolId || turmas.length === 0) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const [reportsRes, studentsRes] = await Promise.all([
        supabase.from('mitigacao_reports').select('*').eq('school_id', schoolId).eq('author_id', currentUser.id).order('updated_at', { ascending: false }),
        supabase.from('students').select('id, name, turma, birth_date').eq('school_id', schoolId).in('turma', turmas).order('name', { ascending: true }),
      ]);
      if (reportsRes.error) throw reportsRes.error;
      if (studentsRes.error) throw studentsRes.error;
      setReports(reportsRes.data || []);
      setStudents(studentsRes.data || []);
    } catch (err) {
      console.error('[TeacherMitigacao] Erro ao buscar dados:', err);
      setError('Não foi possível carregar os relatórios.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [schoolId, JSON.stringify(turmas)]);

  const openCreateForm = () => {
    setCreateForm({ student_id: '', ano: currentYear, periodo: '1', guia_responsavel: currentUser?.name || '' });
    setSelectedTurma(turmas.length === 1 ? turmas[0] : '');
    setStudentSearch('');
    setShowCreateForm(true);
  };

  const selectStudent = (s) => {
    setCreateForm(prev => ({ ...prev, student_id: s.id }));
    setStudentSearch(s.name);
    setIsStudentDropdownOpen(false);
  };

  const studentsForTurma = students.filter(s => !selectedTurma || s.turma === selectedTurma);
  const filteredStudents = studentsForTurma.filter(s => s.name.toLowerCase().includes(studentSearch.toLowerCase()));

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!createForm.student_id) return;
    setIsCreating(true);
    setError('');
    try {
      const { data: newReport, error: insertError } = await supabase
        .from('mitigacao_reports')
        .insert({
          school_id: schoolId,
          student_id: createForm.student_id,
          author_id: currentUser.id,
          reference_period: `${PERIODOS.find(p => p.value === createForm.periodo)?.label} ${createForm.ano}`,
          guia_responsavel: createForm.guia_responsavel.trim() || currentUser?.name,
          status: 'RASCUNHO',
        })
        .select()
        .single();
      if (insertError) throw insertError;

      setShowCreateForm(false);
      await fetchAll();
      setActiveReport(newReport);
    } catch (err) {
      console.error('[TeacherMitigacao] Erro ao criar relatório:', err);
      setError('Não foi possível criar o relatório.');
    } finally {
      setIsCreating(false);
    }
  };

  const closeReport = () => {
    setActiveReport(null);
    fetchAll();
  };

  const formatDate = (dateStr) => dateStr ? new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

  if (turmas.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-white rounded-zela-xl border border-outline-variant shadow-sm p-8 text-center">
        <FileText className="text-outline-variant w-12 h-12 mb-3" />
        <h2 className="text-h3 text-on-surface mb-1">Nenhuma turma vinculada</h2>
        <p className="text-on-surface-variant text-small max-w-sm">
          Peça à administração da escola para vincular sua(s) turma(s) no seu cadastro, para começar a criar relatórios.
        </p>
      </div>
    );
  }

  if (activeReport) {
    const student = studentsById.get(activeReport.student_id);
    return (
      <MitigacaoReportEditor
        report={activeReport}
        student={student}
        onBack={closeReport}
        canEdit={true}
        canPublish={false}
      />
    );
  }

  if (showCreateForm) {
    return (
      <div className="h-full flex flex-col bg-white rounded-zela-xl border border-outline-variant shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-5 sm:p-6 border-b border-outline-variant shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setShowCreateForm(false)} className="p-2 -ml-1 text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container rounded-zela-md transition shrink-0">
              <ArrowLeft size={20} />
            </button>
            <h2 className="text-h3 text-on-surface">Novo Relatório de Mitigação</h2>
          </div>
          {turmas.length > 1 && (
            <select
              value={selectedTurma}
              onChange={e => { setSelectedTurma(e.target.value); setCreateForm(prev => ({ ...prev, student_id: '' })); setStudentSearch(''); }}
              className="px-3 py-2 bg-surface-container-low border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-xs font-bold text-on-surface shrink-0"
            >
              <option value="">Todas as turmas</option>
              {turmas.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>
        <form onSubmit={handleCreate} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-3">
          <div ref={studentComboRef} className="relative">
            <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-1">Aluno *</label>
            <div className="relative">
              <input
                type="text"
                required
                value={studentSearch}
                disabled={!selectedTurma}
                onChange={e => {
                  setStudentSearch(e.target.value);
                  setCreateForm(prev => ({ ...prev, student_id: '' }));
                  setIsStudentDropdownOpen(true);
                }}
                onFocus={() => selectedTurma && setIsStudentDropdownOpen(true)}
                placeholder={selectedTurma ? `Buscar aluno da turma ${selectedTurma}...` : 'Selecione uma turma primeiro'}
                className="w-full px-4 py-2.5 pr-9 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-sm disabled:bg-surface-container disabled:text-on-surface-variant/70 disabled:cursor-not-allowed"
              />
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-outline-variant pointer-events-none" />
            </div>
            {isStudentDropdownOpen && selectedTurma && (
              <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-outline-variant rounded-zela-md shadow-lg py-1">
                {filteredStudents.length === 0 ? (
                  <p className="px-4 py-2.5 text-sm text-on-surface-variant/70">Nenhum aluno encontrado.</p>
                ) : (
                  filteredStudents.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => selectStudent(s)}
                      className="w-full text-left px-4 py-2.5 text-sm text-on-surface hover:bg-primary/10 hover:text-primary transition"
                    >
                      {s.name} <span className="text-on-surface-variant/70 text-xs">({s.turma})</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-1">Período</label>
              <select
                value={createForm.periodo}
                onChange={e => setCreateForm({ ...createForm, periodo: e.target.value })}
                className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              >
                {PERIODOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-1">Ano</label>
              <select
                value={createForm.ano}
                onChange={e => setCreateForm({ ...createForm, ano: Number(e.target.value) })}
                className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              >
                {ANOS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-1">Guia Responsável</label>
            <input
              type="text"
              value={createForm.guia_responsavel}
              disabled
              className="w-full px-4 py-2.5 bg-surface-container border border-outline-variant rounded-zela-md text-sm text-on-surface-variant cursor-not-allowed"
            />
          </div>
          <button
            type="submit"
            disabled={isCreating || !createForm.student_id}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-primary hover:bg-primary-container disabled:bg-slate-300 disabled:text-on-surface-variant text-white px-5 py-2.5 rounded-zela-md font-bold transition-all active:scale-95 text-sm"
          >
            {isCreating ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            Criar e começar a preencher
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white rounded-zela-xl border border-outline-variant shadow-sm overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 sm:p-6 border-b border-outline-variant shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2.5 rounded-zela-md text-primary">
            <FileText size={22} />
          </div>
          <div>
            <h2 className="text-h3 text-on-surface">Mitigação</h2>
            <p className="text-on-surface-variant text-small hidden sm:block">Relatórios de Mitigação dos seus alunos.</p>
          </div>
        </div>
        <button
          onClick={openCreateForm}
          className="flex items-center gap-2 bg-primary hover:bg-primary-container text-white px-4 py-2.5 rounded-zela-md font-bold transition-all active:scale-95 text-sm shrink-0"
        >
          <Plus size={18} /> Novo Relatório
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-2">
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-zela-md text-sm font-medium mb-2">{error}</div>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant/70">
            <FileText className="mx-auto h-12 w-12 text-outline-variant mb-3" />
            <p className="text-sm font-semibold text-on-surface-variant">Nenhum relatório criado ainda.</p>
          </div>
        ) : (
          reports.map(r => {
            const student = studentsById.get(r.student_id);
            return (
              <button
                key={r.id}
                onClick={() => setActiveReport(r)}
                className="w-full flex items-center gap-3 p-4 bg-white border border-outline-variant hover:border-primary/40 hover:bg-primary/5 rounded-zela-lg transition text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-bold text-on-surface text-sm">{student?.name || 'Aluno removido'}</p>
                    <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md border shrink-0 ${STATUS_BADGE[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </div>
                  <p className="text-on-surface-variant/70 text-xs mt-0.5">Etapa {r.current_step}/8 · Atualizado em {formatDate(r.updated_at)}</p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
