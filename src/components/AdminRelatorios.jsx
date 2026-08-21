import React, { useEffect, useState } from 'react';
import { FileText, Loader2, Plus, X, Check, ArrowLeft, Send, Archive, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { notifyFamilies } from '../lib/notifyFamilies';
import { REPORT_STATUS } from '../lib/constants';
import ConfirmModal from './ConfirmModal';

const STATUS_INFO = Object.fromEntries(REPORT_STATUS.map(s => [s.value, s]));
const STATUS_BADGE = {
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
  green: 'bg-green-50 text-green-700 border-green-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
};

export default function AdminRelatorios({ currentUser, currentSchool }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;

  const [reports, setReports] = useState([]);
  const [students, setStudents] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ student_id: '', template_id: '', title: '', reference_period: '' });
  const [isCreating, setIsCreating] = useState(false);

  const [activeReport, setActiveReport] = useState(null);
  const [sections, setSections] = useState([]);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [confirmArchiveId, setConfirmArchiveId] = useState(null);

  const studentsById = new Map(students.map(s => [s.id, s]));

  const fetchAll = async () => {
    if (!schoolId) return;
    setIsLoading(true);
    setError('');
    try {
      const [reportsRes, studentsRes, templatesRes] = await Promise.all([
        supabase.from('reports').select('*').eq('school_id', schoolId).order('updated_at', { ascending: false }).limit(300),
        supabase.from('students').select('id, name, turma').eq('school_id', schoolId).order('name', { ascending: true }),
        supabase.from('report_templates').select('*').eq('school_id', schoolId).eq('is_active', true).order('is_default', { ascending: false }),
      ]);
      if (reportsRes.error) throw reportsRes.error;
      if (studentsRes.error) throw studentsRes.error;
      if (templatesRes.error) throw templatesRes.error;
      setReports(reportsRes.data || []);
      setStudents(studentsRes.data || []);
      setTemplates(templatesRes.data || []);
    } catch (err) {
      console.error('[AdminRelatorios] Erro ao buscar dados:', err);
      setError('Não foi possível carregar os relatórios.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [schoolId]);

  const defaultTemplateId = templates.find(t => t.is_default)?.id || templates[0]?.id || '';

  const openCreateForm = () => {
    setCreateForm({ student_id: '', template_id: defaultTemplateId, title: '', reference_period: '' });
    setShowCreateForm(true);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!createForm.student_id || !createForm.template_id || !createForm.title.trim()) return;

    setIsCreating(true);
    setError('');
    try {
      const { data: templateSections, error: tsError } = await supabase
        .from('report_template_sections')
        .select('*')
        .eq('template_id', createForm.template_id)
        .order('sort_order', { ascending: true });
      if (tsError) throw tsError;

      const template = templates.find(t => t.id === createForm.template_id);

      const { data: newReport, error: insertError } = await supabase
        .from('reports')
        .insert({
          school_id: schoolId,
          student_id: createForm.student_id,
          template_id: createForm.template_id,
          template_version: template?.version || 1,
          title: createForm.title.trim(),
          reference_period: createForm.reference_period.trim() || null,
          author_id: currentUser.id,
          status: 'RASCUNHO',
        })
        .select()
        .single();
      if (insertError) throw insertError;

      const sectionsToInsert = (templateSections || []).map((s, i) => ({
        report_id: newReport.id,
        section_type: s.section_type,
        title: s.title,
        content: '',
        sort_order: i,
      }));
      if (sectionsToInsert.length > 0) {
        const { error: sectionsError } = await supabase.from('report_sections').insert(sectionsToInsert);
        if (sectionsError) throw sectionsError;
      }

      setShowCreateForm(false);
      await fetchAll();
      await openReport(newReport.id);
    } catch (err) {
      console.error('[AdminRelatorios] Erro ao criar relatório:', err);
      setError('Não foi possível criar o relatório.');
    } finally {
      setIsCreating(false);
    }
  };

  const openReport = async (reportId) => {
    setIsLoadingReport(true);
    setError('');
    try {
      const { data: report, error: reportError } = await supabase.from('reports').select('*').eq('id', reportId).single();
      if (reportError) throw reportError;
      const { data: reportSections, error: sectionsError } = await supabase
        .from('report_sections')
        .select('*')
        .eq('report_id', reportId)
        .order('sort_order', { ascending: true });
      if (sectionsError) throw sectionsError;
      setActiveReport(report);
      setSections(reportSections || []);
    } catch (err) {
      console.error('[AdminRelatorios] Erro ao abrir relatório:', err);
      setError('Não foi possível abrir este relatório.');
    } finally {
      setIsLoadingReport(false);
    }
  };

  const closeReport = () => {
    setActiveReport(null);
    setSections([]);
    fetchAll();
  };

  const updateSectionContent = (id, content) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, content } : s));
  };

  const saveReport = async (extra = {}) => {
    if (!activeReport) return;
    setIsSaving(true);
    setError('');
    try {
      for (const s of sections) {
        const { error: updateError } = await supabase.from('report_sections').update({ content: s.content }).eq('id', s.id);
        if (updateError) throw updateError;
      }
      const { error: reportError } = await supabase
        .from('reports')
        .update({ updated_at: new Date().toISOString(), ...extra })
        .eq('id', activeReport.id);
      if (reportError) throw reportError;
      setActiveReport(prev => ({ ...prev, ...extra }));
      return true;
    } catch (err) {
      console.error('[AdminRelatorios] Erro ao salvar:', err);
      setError('Não foi possível salvar o relatório.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    const ok = await saveReport({ status: 'PUBLICADO', published_at: new Date().toISOString() });
    if (!ok) return;
    const student = studentsById.get(activeReport.student_id);
    const { data: guardianLinks } = await supabase.from('student_guardians').select('guardian_id').eq('student_id', activeReport.student_id);
    const { data: directStudent } = await supabase.from('students').select('family_id').eq('id', activeReport.student_id).single();
    const familyIds = [...new Set([...(guardianLinks || []).map(g => g.guardian_id), directStudent?.family_id].filter(Boolean))];
    notifyFamilies({
      type: 'relatorio',
      title: 'Novo relatório disponível',
      message: `${activeReport.title}${student ? ` — ${student.name}` : ''}`,
      url: '/?tab=relatorios',
      familyIds,
    });
    closeReport();
  };

  const handleArchive = (id) => setConfirmArchiveId(id);

  const confirmArchive = async () => {
    try {
      const { error: updateError } = await supabase.from('reports').update({ status: 'ARQUIVADO' }).eq('id', confirmArchiveId);
      if (updateError) throw updateError;
      if (activeReport?.id === confirmArchiveId) closeReport();
      else await fetchAll();
    } catch (err) {
      console.error('[AdminRelatorios] Erro ao arquivar:', err);
    } finally {
      setConfirmArchiveId(null);
    }
  };

  const formatDate = (dateStr) => dateStr ? new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

  const filteredReports = reports.filter(r => {
    if (!searchTerm.trim()) return true;
    const student = studentsById.get(r.student_id);
    const term = searchTerm.toLowerCase();
    return r.title.toLowerCase().includes(term) || student?.name?.toLowerCase().includes(term);
  });

  // ── Detalhe de um relatório (preencher seções + publicar/arquivar) ──
  if (activeReport) {
    const student = studentsById.get(activeReport.student_id);
    const canEdit = activeReport.status === 'RASCUNHO';
    return (
      <div className="h-full flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 p-4 sm:p-5 border-b border-slate-100 shrink-0">
          <button onClick={closeReport} className="p-2 -ml-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition shrink-0">
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-slate-800 truncate">{activeReport.title}</h2>
            <p className="text-xs text-slate-400">{student?.name}{activeReport.reference_period ? ` · ${activeReport.reference_period}` : ''}</p>
          </div>
          <span className={`text-[10px] font-extrabold uppercase px-2 py-1 rounded-md border shrink-0 ${STATUS_BADGE[STATUS_INFO[activeReport.status]?.color]}`}>
            {STATUS_INFO[activeReport.status]?.label}
          </span>
        </div>

        {!canEdit && (
          <div className="bg-slate-50 border-b border-slate-100 text-slate-500 px-4 sm:px-5 py-2 text-xs font-semibold shrink-0">
            {activeReport.status === 'PUBLICADO' ? 'Relatório publicado — não pode mais ser editado.' : 'Relatório arquivado — não pode mais ser editado.'}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {isLoadingReport ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
          ) : (
            sections.map(s => (
              <div key={s.id}>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">{s.title}</label>
                <textarea
                  value={s.content || ''}
                  onChange={e => updateSectionContent(s.id, e.target.value)}
                  disabled={!canEdit}
                  rows={5}
                  placeholder="Observação qualitativa..."
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 text-sm resize-none disabled:opacity-70"
                />
              </div>
            ))
          )}
        </div>

        {error && (
          <div className="px-4 sm:px-5 pb-2">
            <div className="bg-red-50 border border-red-100 text-red-600 p-2.5 rounded-xl text-xs font-medium">{error}</div>
          </div>
        )}

        {canEdit && (
          <div className="flex flex-col sm:flex-row gap-2 p-4 sm:p-5 border-t border-slate-100 shrink-0">
            <button
              onClick={() => saveReport()}
              disabled={isSaving}
              className="flex-1 flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition text-sm disabled:opacity-60"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Salvar Rascunho
            </button>
            <button
              onClick={handlePublish}
              disabled={isSaving}
              className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition text-sm disabled:opacity-60"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              Publicar para a Família
            </button>
          </div>
        )}
        {activeReport.status === 'PUBLICADO' && (
          <div className="p-4 sm:p-5 border-t border-slate-100 shrink-0">
            <button
              onClick={() => handleArchive(activeReport.id)}
              className="flex items-center gap-2 text-slate-400 hover:text-amber-600 font-bold text-sm transition"
            >
              <Archive size={16} /> Arquivar
            </button>
          </div>
        )}

        {confirmArchiveId && (
          <ConfirmModal
            title="Arquivar relatório"
            message="Arquivar este relatório? Ele deixa de ficar disponível para a família."
            danger={false}
            onConfirm={confirmArchive}
            onCancel={() => setConfirmArchiveId(null)}
          />
        )}
      </div>
    );
  }

  // ── Formulário de criação ──
  if (showCreateForm) {
    return (
      <div className="h-full flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 p-5 sm:p-6 border-b border-slate-100 shrink-0">
          <button onClick={() => setShowCreateForm(false)} className="p-2 -ml-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition shrink-0">
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-lg font-bold text-slate-800">Novo Relatório</h2>
        </div>
        <form onSubmit={handleCreate} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-3">
          {templates.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 p-4 rounded-xl text-sm font-medium">
              Nenhum modelo de relatório ativo. Crie um em "Modelos de Relatórios" antes de continuar.
            </div>
          ) : (
            <>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Aluno *</label>
                <select
                  required
                  value={createForm.student_id}
                  onChange={e => setCreateForm({ ...createForm, student_id: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                >
                  <option value="">Selecionar...</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.turma})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Modelo *</label>
                <select
                  required
                  value={createForm.template_id}
                  onChange={e => setCreateForm({ ...createForm, template_id: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                >
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Título *</label>
                <input
                  type="text"
                  required
                  value={createForm.title}
                  onChange={e => setCreateForm({ ...createForm, title: e.target.value })}
                  placeholder="Ex: Relatório de Desenvolvimento — 1º Semestre"
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Período de referência</label>
                <input
                  type="text"
                  value={createForm.reference_period}
                  onChange={e => setCreateForm({ ...createForm, reference_period: e.target.value })}
                  placeholder="Ex: Fevereiro a Junho de 2026"
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={isCreating || !createForm.student_id || !createForm.template_id || !createForm.title.trim()}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 text-white px-5 py-2.5 rounded-xl font-bold transition-all active:scale-95 text-sm"
              >
                {isCreating ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Criar e continuar preenchendo
              </button>
            </>
          )}
        </form>
      </div>
    );
  }

  // ── Lista ──
  return (
    <div className="h-full flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 sm:p-6 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-50 p-2.5 rounded-xl text-indigo-600">
            <FileText size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Relatórios</h2>
            <p className="text-slate-500 text-sm hidden sm:block">Relatórios de Desempenho e Evolução dos alunos.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {reports.length > 0 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por aluno ou título..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm w-full sm:w-64"
              />
            </div>
          )}
          <button
            onClick={openCreateForm}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-bold transition-all active:scale-95 text-sm shrink-0"
          >
            <Plus size={18} /> <span className="hidden sm:inline">Novo Relatório</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-2">
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-sm font-medium mb-2">{error}</div>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <FileText className="mx-auto h-12 w-12 text-slate-300 mb-3" />
            <p className="text-sm font-semibold text-slate-600">
              {reports.length === 0 ? 'Nenhum relatório criado ainda.' : 'Nenhum relatório encontrado.'}
            </p>
          </div>
        ) : (
          filteredReports.map(r => {
            const student = studentsById.get(r.student_id);
            const statusInfo = STATUS_INFO[r.status];
            return (
              <button
                key={r.id}
                onClick={() => openReport(r.id)}
                className="w-full flex items-center gap-3 p-4 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 rounded-2xl transition text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-bold text-slate-800 text-sm truncate">{r.title}</p>
                    <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md border shrink-0 ${STATUS_BADGE[statusInfo?.color]}`}>
                      {statusInfo?.label}
                    </span>
                  </div>
                  <p className="text-slate-400 text-xs mt-0.5">{student?.name || 'Aluno removido'} · Atualizado em {formatDate(r.updated_at)}</p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
