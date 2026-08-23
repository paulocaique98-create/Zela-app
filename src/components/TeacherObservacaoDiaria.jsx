import React, { useEffect, useState } from 'react';
import { ClipboardList, Loader2, Plus, X, Check, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { NIVEL_CONCENTRACAO, NIVEL_AUTONOMIA } from '../lib/constants';
import ConfirmModal from './ConfirmModal';

const emptyForm = {
  student_id: '',
  record_date: new Date().toISOString().slice(0, 10),
  atividade: '',
  material: '',
  concentracao: '',
  foco: '',
  autonomia: '',
  necessitou_orientacao: false,
  observacoes: '',
};

export default function TeacherObservacaoDiaria({ currentUser, currentSchool }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;
  const turmas = currentUser?.turmas || [];

  const [students, setStudents] = useState([]);
  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const studentsById = new Map(students.map(s => [s.id, s]));

  const fetchData = async () => {
    if (!schoolId || turmas.length === 0) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const { data: studentsData, error: studentsError } = await supabase
        .from('students')
        .select('id, name, turma')
        .eq('school_id', schoolId)
        .in('turma', turmas)
        .order('name', { ascending: true });
      if (studentsError) throw studentsError;
      setStudents(studentsData || []);

      const { data: recordsData, error: recordsError } = await supabase
        .from('pedagogical_records')
        .select('*')
        .eq('school_id', schoolId)
        .eq('record_type', 'DAILY_OBSERVATION')
        .order('record_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(300);
      if (recordsError) throw recordsError;
      setRecords(recordsData || []);
    } catch (err) {
      console.error('[TeacherObservacaoDiaria] Erro ao buscar dados:', err);
      setError('Não foi possível carregar os registros.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [schoolId, JSON.stringify(turmas)]);

  const resetForm = () => {
    setShowForm(false);
    setForm(emptyForm);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.student_id || !form.record_date) return;

    setIsSaving(true);
    setError('');
    try {
      const { atividade, material, concentracao, foco, autonomia, necessitou_orientacao, observacoes } = form;
      const { error: insertError } = await supabase
        .from('pedagogical_records')
        .insert({
          school_id: schoolId,
          student_id: form.student_id,
          record_type: 'DAILY_OBSERVATION',
          author_id: currentUser.id,
          record_date: form.record_date,
          content: {
            atividade: atividade.trim().toUpperCase(),
            material: material.trim().toUpperCase(),
            concentracao,
            foco: foco.trim().toUpperCase(),
            autonomia,
            necessitou_orientacao,
            observacoes,
          },
        });
      if (insertError) throw insertError;
      resetForm();
      await fetchData();
    } catch (err) {
      console.error('[TeacherObservacaoDiaria] Erro ao salvar:', err);
      setError('Não foi possível salvar a observação.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (id) => setConfirmDeleteId(id);

  const confirmDelete = async () => {
    const id = confirmDeleteId;
    setDeletingId(id);
    try {
      const { error: deleteError } = await supabase.from('pedagogical_records').delete().eq('id', id);
      if (deleteError) throw deleteError;
      setRecords(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      console.error('[TeacherObservacaoDiaria] Erro ao excluir:', err);
      setError('Não foi possível excluir o registro.');
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  const filteredRecords = records.filter(r => {
    if (!searchTerm.trim()) return true;
    const student = studentsById.get(r.student_id);
    return student?.name?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const formatDate = (dateStr) => {
    const d = new Date(`${dateStr}T12:00:00`);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  if (turmas.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-white rounded-zela-xl border border-outline-variant shadow-sm p-8 text-center">
        <ClipboardList className="text-outline-variant w-12 h-12 mb-3" />
        <h2 className="text-h3 text-on-surface mb-1">Nenhuma turma vinculada</h2>
        <p className="text-on-surface-variant text-small max-w-sm">
          Peça à administração da escola para vincular sua(s) turma(s) no seu cadastro, para começar a registrar observações.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white rounded-zela-xl border border-outline-variant shadow-sm overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 sm:p-6 border-b border-outline-variant shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2.5 rounded-zela-md text-primary">
            <ClipboardList size={22} />
          </div>
          <div>
            <h2 className="text-h3 text-on-surface">Observação Diária</h2>
            <p className="text-on-surface-variant text-small hidden sm:block">Registre observações pedagógicas sobre seus alunos.</p>
          </div>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-primary hover:bg-primary-container text-white px-4 py-2.5 rounded-zela-md font-bold transition-all active:scale-95 text-sm shrink-0"
          >
            <Plus size={18} /> Nova Observação
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-surface-container-low border border-outline-variant rounded-zela-lg p-4 sm:p-5 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-on-surface text-sm">Nova observação</h3>
              <button type="button" onClick={resetForm} className="p-1 text-on-surface-variant/70 hover:text-on-surface hover:bg-slate-200 rounded-lg transition">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-1">Aluno *</label>
                <select
                  required
                  value={form.student_id}
                  onChange={e => setForm({ ...form, student_id: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-sm uppercase"
                >
                  <option value="">Selecionar...</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.turma})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-1">Data *</label>
                <input
                  type="date"
                  required
                  value={form.record_date}
                  onChange={e => setForm({ ...form, record_date: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-1">Atividade escolhida</label>
                <input
                  type="text"
                  value={form.atividade}
                  onChange={e => setForm({ ...form, atividade: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-sm uppercase placeholder:normal-case"
                  placeholder="Ex: Torre Rosa"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-1">Material utilizado</label>
                <input
                  type="text"
                  value={form.material}
                  onChange={e => setForm({ ...form, material: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-sm uppercase placeholder:normal-case"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-1">Nível de concentração</label>
                <select
                  value={form.concentracao}
                  onChange={e => setForm({ ...form, concentracao: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-sm uppercase"
                >
                  <option value="">Selecionar...</option>
                  {NIVEL_CONCENTRACAO.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-1">Autonomia</label>
                <select
                  value={form.autonomia}
                  onChange={e => setForm({ ...form, autonomia: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-sm uppercase"
                >
                  <option value="">Selecionar...</option>
                  {NIVEL_AUTONOMIA.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-1">Foco observado</label>
              <input
                type="text"
                value={form.foco}
                onChange={e => setForm({ ...form, foco: e.target.value })}
                className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-sm uppercase placeholder:normal-case"
                placeholder="Ex: manteve o foco na atividade por 20 minutos"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.necessitou_orientacao}
                onChange={e => setForm({ ...form, necessitou_orientacao: e.target.checked })}
                className="w-4 h-4 accent-indigo-600"
              />
              <span className="text-xs font-semibold text-on-surface">Necessitou de orientação do guia</span>
            </label>

            <div>
              <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-1">Observações</label>
              <textarea
                value={form.observacoes}
                onChange={e => setForm({ ...form, observacoes: e.target.value })}
                rows={4}
                className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-on-surface text-sm resize-none"
                placeholder="Descrição livre da observação..."
              />
            </div>

            <button
              type="submit"
              disabled={isSaving || !form.student_id || !form.record_date}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-primary hover:bg-primary-container disabled:bg-slate-300 disabled:text-on-surface-variant text-white px-5 py-2.5 rounded-zela-md font-bold transition-all active:scale-95 text-sm"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Salvar
            </button>
          </form>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-zela-md text-sm font-medium">{error}</div>
        )}

        {!showForm && records.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant/70" />
            <input
              type="text"
              placeholder="Buscar por aluno..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 bg-surface-container-low border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            />
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant/70">
            <ClipboardList className="mx-auto h-12 w-12 text-outline-variant mb-3" />
            <p className="text-sm font-semibold text-on-surface-variant">
              {records.length === 0 ? 'Nenhuma observação registrada ainda.' : 'Nenhum registro encontrado.'}
            </p>
          </div>
        ) : (
          filteredRecords.map(r => {
            const student = studentsById.get(r.student_id);
            const c = r.content || {};
            return (
              <div key={r.id} className="bg-white border border-outline-variant rounded-zela-lg p-4 sm:p-5 shadow-sm">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <h4 className="font-bold text-on-surface">{student?.name || 'Aluno removido'}</h4>
                    <p className="text-on-surface-variant text-xs mt-0.5">{formatDate(r.record_date)}{student?.turma ? ` — ${student.turma}` : ''}</p>
                  </div>
                  {r.author_id === currentUser.id && (
                    <button
                      onClick={() => handleDelete(r.id)}
                      disabled={deletingId === r.id}
                      className="p-2 text-on-surface-variant/70 hover:text-red-500 hover:bg-red-50 rounded-lg transition shrink-0"
                      title="Excluir"
                    >
                      {deletingId === r.id ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {c.atividade && <span className="text-[11px] font-semibold bg-primary/10 text-primary px-2 py-1 rounded-lg">Atividade: {c.atividade}</span>}
                  {c.material && <span className="text-[11px] font-semibold bg-surface-container-low text-on-surface-variant px-2 py-1 rounded-lg">Material: {c.material}</span>}
                  {c.concentracao && <span className="text-[11px] font-semibold bg-surface-container-low text-on-surface-variant px-2 py-1 rounded-lg">Concentração: {NIVEL_CONCENTRACAO.find(n => n.value === c.concentracao)?.label || c.concentracao}</span>}
                  {c.autonomia && <span className="text-[11px] font-semibold bg-surface-container-low text-on-surface-variant px-2 py-1 rounded-lg">Autonomia: {NIVEL_AUTONOMIA.find(n => n.value === c.autonomia)?.label || c.autonomia}</span>}
                  {c.necessitou_orientacao && <span className="text-[11px] font-semibold bg-amber-50 text-amber-700 px-2 py-1 rounded-lg">Necessitou orientação</span>}
                </div>
                {c.foco && <p className="text-on-surface-variant text-sm mt-2"><strong className="font-semibold text-on-surface">Foco:</strong> {c.foco}</p>}
                {c.observacoes && <p className="text-on-surface-variant text-sm mt-2 whitespace-pre-wrap">{c.observacoes}</p>}
              </div>
            );
          })
        )}
      </div>

      {confirmDeleteId && (
        <ConfirmModal
          title="Excluir observação"
          message="Excluir este registro de observação? Essa ação não pode ser desfeita."
          isLoading={deletingId === confirmDeleteId}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}
