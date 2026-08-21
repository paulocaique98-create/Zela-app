import React, { useEffect, useState } from 'react';
import { FileText, Loader2, Plus, X, Check, Pencil, Trash2, GripVertical, Star, Copy } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { REPORT_SECTION_TYPES } from '../lib/constants';
import ConfirmModal from './ConfirmModal';

const SUGGESTED_SECTIONS = [
  { title: 'Desenvolvimento da Vida Prática', section_type: 'PRACTICAL_LIFE', instructions: 'Autonomia, independência, coordenação, organização, autorregulação.' },
  { title: 'Desenvolvimento Cognitivo e Acadêmico', section_type: 'COGNITIVE_ACADEMIC', instructions: 'Linguagem, escrita, leitura, matemática, exploração de materiais, compreensão de conceitos.' },
  { title: 'Desenvolvimento Socioemocional', section_type: 'SOCIOEMOTIONAL', instructions: 'Autoconfiança, iniciativa, empatia, colaboração, relacionamento social, autonomia.' },
  { title: 'Considerações Finais', section_type: 'CUSTOM', instructions: '' },
];

const emptyTemplateForm = { name: '', sections: SUGGESTED_SECTIONS.map((s, i) => ({ ...s, id: `new-${i}`, sort_order: i })) };

export default function AdminReportTemplates({ currentUser, currentSchool }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;

  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyTemplateForm);
  const [isSaving, setIsSaving] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const fetchTemplates = async () => {
    if (!schoolId) return;
    setIsLoading(true);
    setError('');
    try {
      const { data, error: fetchError } = await supabase
        .from('report_templates')
        .select('*, report_template_sections(*)')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false });
      if (fetchError) throw fetchError;
      setTemplates((data || []).map(t => ({
        ...t,
        report_template_sections: (t.report_template_sections || []).sort((a, b) => a.sort_order - b.sort_order),
      })));
    } catch (err) {
      console.error('[AdminReportTemplates] Erro ao buscar:', err);
      setError('Não foi possível carregar os modelos.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [schoolId]);

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyTemplateForm);
  };

  const handleEdit = (t) => {
    setEditingId(t.id);
    setForm({
      name: t.name,
      sections: (t.report_template_sections.length > 0 ? t.report_template_sections : SUGGESTED_SECTIONS).map((s, i) => ({
        id: s.id || `new-${i}`,
        title: s.title,
        section_type: s.section_type,
        instructions: s.instructions || '',
        sort_order: i,
      })),
    });
    setShowForm(true);
  };

  const handleDuplicate = (t) => {
    setEditingId(null);
    setForm({
      name: `${t.name} (cópia)`,
      sections: t.report_template_sections.map((s, i) => ({
        id: `new-${i}`,
        title: s.title,
        section_type: s.section_type,
        instructions: s.instructions || '',
        sort_order: i,
      })),
    });
    setShowForm(true);
  };

  const addSection = () => {
    setForm(prev => ({
      ...prev,
      sections: [...prev.sections, { id: `new-${Date.now()}`, title: '', section_type: 'CUSTOM', instructions: '', sort_order: prev.sections.length }],
    }));
  };

  const updateSection = (id, patch) => {
    setForm(prev => ({ ...prev, sections: prev.sections.map(s => s.id === id ? { ...s, ...patch } : s) }));
  };

  const removeSection = (id) => {
    setForm(prev => ({ ...prev, sections: prev.sections.filter(s => s.id !== id) }));
  };

  const moveSection = (index, direction) => {
    setForm(prev => {
      const sections = [...prev.sections];
      const target = index + direction;
      if (target < 0 || target >= sections.length) return prev;
      [sections[index], sections[target]] = [sections[target], sections[index]];
      return { ...prev, sections: sections.map((s, i) => ({ ...s, sort_order: i })) };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || form.sections.length === 0 || !schoolId) return;

    setIsSaving(true);
    setError('');
    try {
      let templateId = editingId;

      if (editingId) {
        // Editar não cria novo modelo — só incrementa a versão (rastreabilidade).
        // Relatórios já criados nunca são afetados, porque suas seções já foram
        // copiadas (materializadas) no momento em que foram criados.
        const { data: current } = await supabase.from('report_templates').select('version').eq('id', editingId).single();
        const { error: updateError } = await supabase
          .from('report_templates')
          .update({ name: form.name.trim(), version: (current?.version || 1) + 1, updated_at: new Date().toISOString() })
          .eq('id', editingId);
        if (updateError) throw updateError;

        // Substitui as seções (mais simples e seguro que fazer diff) — seguro
        // porque report_sections é uma cópia independente, não referencia isso.
        await supabase.from('report_template_sections').delete().eq('template_id', editingId);
      } else {
        const { data: newTemplate, error: insertError } = await supabase
          .from('report_templates')
          .insert({ school_id: schoolId, name: form.name.trim(), created_by: currentUser.id })
          .select()
          .single();
        if (insertError) throw insertError;
        templateId = newTemplate.id;
      }

      const sectionsToInsert = form.sections.map((s, i) => ({
        template_id: templateId,
        title: s.title.trim() || `Seção ${i + 1}`,
        section_type: s.section_type,
        instructions: s.instructions?.trim() || null,
        sort_order: i,
      }));
      const { error: sectionsError } = await supabase.from('report_template_sections').insert(sectionsToInsert);
      if (sectionsError) throw sectionsError;

      resetForm();
      await fetchTemplates();
    } catch (err) {
      console.error('[AdminReportTemplates] Erro ao salvar:', err);
      setError('Não foi possível salvar o modelo.');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActive = async (t) => {
    try {
      const { error: updateError } = await supabase.from('report_templates').update({ is_active: !t.is_active }).eq('id', t.id);
      if (updateError) throw updateError;
      setTemplates(prev => prev.map(x => x.id === t.id ? { ...x, is_active: !t.is_active } : x));
    } catch (err) {
      console.error('[AdminReportTemplates] Erro ao ativar/desativar:', err);
    }
  };

  const setAsDefault = async (t) => {
    try {
      await supabase.from('report_templates').update({ is_default: false }).eq('school_id', schoolId);
      const { error: updateError } = await supabase.from('report_templates').update({ is_default: true }).eq('id', t.id);
      if (updateError) throw updateError;
      await fetchTemplates();
    } catch (err) {
      console.error('[AdminReportTemplates] Erro ao definir padrão:', err);
    }
  };

  const handleDelete = (id) => setConfirmDeleteId(id);

  const confirmDelete = async () => {
    const id = confirmDeleteId;
    setDeletingId(id);
    try {
      // Não excluímos de fato se já foi usado em algum relatório — arquivamos
      // (desativamos) pra preservar o histórico, conforme o documento pede.
      const { count } = await supabase.from('reports').select('id', { count: 'exact', head: true }).eq('template_id', id);
      if (count && count > 0) {
        await supabase.from('report_templates').update({ is_active: false }).eq('id', id);
      } else {
        const { error: deleteError } = await supabase.from('report_templates').delete().eq('id', id);
        if (deleteError) throw deleteError;
      }
      await fetchTemplates();
    } catch (err) {
      console.error('[AdminReportTemplates] Erro ao excluir:', err);
      setError('Não foi possível excluir o modelo.');
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 sm:p-6 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-50 p-2.5 rounded-xl text-indigo-600">
            <FileText size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Modelos de Relatórios</h2>
            <p className="text-slate-500 text-sm hidden sm:block">Defina a estrutura dos Relatórios de Desempenho e Evolução.</p>
          </div>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-bold transition-all active:scale-95 text-sm shrink-0"
          >
            <Plus size={18} /> Novo Modelo
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-sm">{editingId ? 'Editar modelo' : 'Novo modelo'}</h3>
              <button type="button" onClick={resetForm} className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition">
                <X size={18} />
              </button>
            </div>

            <input
              type="text"
              placeholder="Nome do modelo (ex: Relatório Semestral)"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              required
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-sm"
            />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Seções</label>
                <button type="button" onClick={addSection} className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition">
                  <Plus size={14} /> Adicionar seção
                </button>
              </div>

              {form.sections.map((s, i) => (
                <div key={s.id} className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col shrink-0">
                      <button type="button" onClick={() => moveSection(i, -1)} disabled={i === 0} className="text-slate-300 hover:text-slate-600 disabled:opacity-30">▲</button>
                      <button type="button" onClick={() => moveSection(i, 1)} disabled={i === form.sections.length - 1} className="text-slate-300 hover:text-slate-600 disabled:opacity-30">▼</button>
                    </div>
                    <input
                      type="text"
                      placeholder="Título da seção"
                      value={s.title}
                      onChange={e => updateSection(s.id, { title: e.target.value })}
                      className="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold"
                    />
                    <select
                      value={s.section_type}
                      onChange={e => updateSection(s.id, { section_type: e.target.value })}
                      className="px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs shrink-0"
                    >
                      {REPORT_SECTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <button type="button" onClick={() => removeSection(s.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition shrink-0">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Texto orientativo pro professor (opcional)"
                    value={s.instructions}
                    onChange={e => updateSection(s.id, { instructions: e.target.value })}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500"
                  />
                </div>
              ))}
            </div>

            <button
              type="submit"
              disabled={isSaving || !form.name.trim() || form.sections.length === 0}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 text-white px-5 py-2.5 rounded-xl font-bold transition-all active:scale-95 text-sm"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {editingId ? 'Salvar alterações' : 'Criar modelo'}
            </button>
          </form>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-sm font-medium">{error}</div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <FileText className="mx-auto h-12 w-12 text-slate-300 mb-3" />
            <p className="text-sm font-semibold text-slate-600">Nenhum modelo criado ainda.</p>
            <p className="text-xs text-slate-400 mt-1">Crie o primeiro modelo — já vem com uma sugestão de estrutura pronta.</p>
          </div>
        ) : (
          templates.map(t => (
            <div key={t.id} className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm">
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h4 className="font-bold text-slate-800">{t.name}</h4>
                    {t.is_default && (
                      <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md border bg-indigo-50 text-indigo-700 border-indigo-200 flex items-center gap-0.5">
                        <Star size={9} /> Padrão
                      </span>
                    )}
                    <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md border ${t.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                      {t.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <p className="text-slate-400 text-xs mt-0.5">{t.report_template_sections.length} seção(ões) · v{t.version}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  {!t.is_default && (
                    <button onClick={() => setAsDefault(t)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition" title="Definir como padrão">
                      <Star size={16} />
                    </button>
                  )}
                  <button onClick={() => handleDuplicate(t)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition" title="Duplicar">
                    <Copy size={16} />
                  </button>
                  <button onClick={() => handleEdit(t)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition" title="Editar">
                    <Pencil size={16} />
                  </button>
                  <button onClick={() => handleDelete(t.id)} disabled={deletingId === t.id} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="Excluir">
                    {deletingId === t.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {t.report_template_sections.map(s => (
                  <span key={s.id} className="text-[10px] font-semibold bg-slate-50 text-slate-600 border border-slate-200 px-2 py-1 rounded-lg">{s.title}</span>
                ))}
              </div>
              <button
                onClick={() => toggleActive(t)}
                className="text-[11px] font-bold text-slate-400 hover:text-slate-700 transition mt-3"
              >
                {t.is_active ? 'Desativar modelo' : 'Reativar modelo'}
              </button>
            </div>
          ))
        )}
      </div>

      {confirmDeleteId && (
        <ConfirmModal
          title="Excluir modelo"
          message="Excluir este modelo? Se ele já foi usado em algum relatório, será arquivado em vez de excluído, pra preservar o histórico."
          isLoading={deletingId === confirmDeleteId}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}
