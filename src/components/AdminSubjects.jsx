import React, { useEffect, useState } from 'react';
import { BookMarked, Loader2, Plus, Pencil, Trash2, X, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSchoolConfig } from '../lib/schoolConfig';
import ConfirmModal from './ConfirmModal';

const COLOR_OPTIONS = [
  { value: '#6366f1', label: 'Índigo' },
  { value: '#10b981', label: 'Verde' },
  { value: '#f59e0b', label: 'Âmbar' },
  { value: '#ef4444', label: 'Vermelho' },
  { value: '#0ea5e9', label: 'Azul' },
  { value: '#a855f7', label: 'Roxo' },
];

// P3.2 (núcleo acadêmico, destravado 2026-09-01) — primeiro módulo:
// cadastro de matérias/áreas de conhecimento por escola, associadas às
// turmas existentes (schools.turmas). Terminologia ("Matéria" vs "Área
// de Conhecimento") vem de useSchoolConfig — nunca hardcoded aqui.
export default function AdminSubjects({ currentUser, currentSchool }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;
  const { turmas: schoolTurmas, terminology } = useSchoolConfig(schoolId);
  const subjectLabel = terminology.subject;

  const [subjects, setSubjects] = useState([]);
  const [associations, setAssociations] = useState([]); // todas de class_subjects da escola
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(COLOR_OPTIONS[0].value);
  const [selectedTurmas, setSelectedTurmas] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const fetchAll = async () => {
    if (!schoolId) return;
    setIsLoading(true);
    setError('');
    try {
      const [subjectsRes, assocRes] = await Promise.all([
        supabase.from('subjects').select('*').eq('school_id', schoolId).order('name'),
        supabase.from('class_subjects').select('subject_id, class_name').eq('school_id', schoolId),
      ]);
      if (subjectsRes.error) throw subjectsRes.error;
      if (assocRes.error) throw assocRes.error;
      setSubjects(subjectsRes.data || []);
      setAssociations(assocRes.data || []);
    } catch (err) {
      console.error('[AdminSubjects] Erro ao buscar:', err);
      setError(`Não foi possível carregar as ${subjectLabel.toLowerCase()}s.`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [schoolId]);

  const turmasOf = (subjectId) => associations.filter(a => a.subject_id === subjectId).map(a => a.class_name);

  const openCreate = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setColor(COLOR_OPTIONS[0].value);
    setSelectedTurmas([]);
    setShowForm(true);
  };

  const openEdit = (subject) => {
    setEditingId(subject.id);
    setName(subject.name);
    setDescription(subject.description || '');
    setColor(subject.color || COLOR_OPTIONS[0].value);
    setSelectedTurmas(turmasOf(subject.id));
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSaving(true);
    setError('');
    try {
      let subjectId = editingId;
      if (editingId) {
        const { error: updateError } = await supabase
          .from('subjects')
          .update({ name: name.trim(), description: description.trim() || null, color })
          .eq('id', editingId);
        if (updateError) throw updateError;
      } else {
        const { data, error: insertError } = await supabase
          .from('subjects')
          .insert({ school_id: schoolId, name: name.trim(), description: description.trim() || null, color })
          .select('id')
          .single();
        if (insertError) throw insertError;
        subjectId = data.id;
      }

      // Ressincroniza as associações: apaga tudo dessa matéria e recria
      // com o conjunto atual de turmas marcadas — mais simples e seguro
      // que diffar, e o volume por matéria é sempre pequeno (poucas
      // dezenas de turmas no máximo).
      const { error: deleteError } = await supabase.from('class_subjects').delete().eq('subject_id', subjectId);
      if (deleteError) throw deleteError;
      if (selectedTurmas.length > 0) {
        const rows = selectedTurmas.map(class_name => ({ school_id: schoolId, subject_id: subjectId, class_name }));
        const { error: assocError } = await supabase.from('class_subjects').insert(rows);
        if (assocError) throw assocError;
      }

      setShowForm(false);
      fetchAll();
    } catch (err) {
      console.error('[AdminSubjects] Erro ao salvar:', err);
      setError(err.message?.includes('duplicate') || err.code === '23505'
        ? `Já existe uma ${subjectLabel.toLowerCase()} com esse nome nesta escola.`
        : `Não foi possível salvar a ${subjectLabel.toLowerCase()}.`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      const { error: deleteError } = await supabase.from('subjects').delete().eq('id', confirmDelete.id);
      if (deleteError) throw deleteError;
      setConfirmDelete(null);
      fetchAll();
    } catch (err) {
      console.error('[AdminSubjects] Erro ao excluir:', err);
      setError(`Não foi possível excluir a ${subjectLabel.toLowerCase()}.`);
      setConfirmDelete(null);
    }
  };

  const toggleTurma = (t) => {
    setSelectedTurmas(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-zela-xl border border-outline-variant shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-5 sm:p-6 border-b border-outline-variant shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-primary/10 p-2.5 rounded-zela-md text-primary shrink-0">
            <BookMarked size={22} />
          </div>
          <div className="min-w-0">
            <h2 className="text-h3 text-on-surface">{subjectLabel}s</h2>
            <p className="text-on-surface-variant text-small hidden sm:block truncate">Cadastre e associe {subjectLabel.toLowerCase()}s às {terminology.class.toLowerCase()}s da escola.</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 bg-primary hover:bg-primary-container text-white px-3 py-2 rounded-zela-md font-bold transition-all active:scale-95 text-xs shrink-0"
        >
          <Plus size={16} /> Nova {subjectLabel}
        </button>
      </div>

      {error && (
        <div className="px-5 sm:px-6 pt-4">
          <div className="bg-red-50 border border-red-100 text-red-600 p-2.5 rounded-zela-md text-xs font-medium">{error}</div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : subjects.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant/70">
            <BookMarked className="mx-auto h-12 w-12 text-outline-variant mb-3" />
            <p className="text-sm font-semibold text-on-surface-variant">Nenhuma {subjectLabel.toLowerCase()} cadastrada ainda.</p>
          </div>
        ) : (
          subjects.map(s => (
            <div key={s.id} className="flex items-center gap-3 p-4 bg-white border border-outline-variant rounded-zela-lg">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color || '#6366f1' }} />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-on-surface text-sm truncate">{s.name}</p>
                {s.description && <p className="text-on-surface-variant/70 text-xs truncate">{s.description}</p>}
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {turmasOf(s.id).length === 0 ? (
                    <span className="text-[10px] text-on-surface-variant/50 italic">Sem {terminology.class.toLowerCase()}s associadas</span>
                  ) : turmasOf(s.id).map(t => (
                    <span key={t} className="text-[10px] font-bold px-1.5 py-0.5 bg-surface-container rounded text-on-surface-variant">{t}</span>
                  ))}
                </div>
              </div>
              <button onClick={() => openEdit(s)} className="p-2 text-on-surface-variant/70 hover:text-primary hover:bg-primary/10 rounded-zela-md transition shrink-0">
                <Pencil size={16} />
              </button>
              <button onClick={() => setConfirmDelete(s)} className="p-2 text-on-surface-variant/70 hover:text-red-600 hover:bg-red-50 rounded-zela-md transition shrink-0">
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <form onSubmit={handleSave} onClick={e => e.stopPropagation()} className="bg-white rounded-zela-xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-outline-variant">
              <h3 className="text-h3 text-on-surface">{editingId ? `Editar ${subjectLabel}` : `Nova ${subjectLabel}`}</h3>
              <button type="button" onClick={() => setShowForm(false)} className="p-1.5 text-on-surface-variant/70 hover:text-on-surface rounded-lg"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Nome *</label>
                <input required type="text" value={name} onChange={e => setName(e.target.value)} className="w-full p-2.5 border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary" placeholder={`Ex: ${terminology.subject === 'Matéria' ? 'Matemática' : 'Vida Prática'}`} />
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Descrição</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full p-2.5 border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Cor</label>
                <div className="flex gap-2">
                  {COLOR_OPTIONS.map(c => (
                    <button key={c.value} type="button" onClick={() => setColor(c.value)}
                      className={`w-7 h-7 rounded-full border-2 transition ${color === c.value ? 'border-on-surface scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c.value }} title={c.label} />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">{terminology.class}s</label>
                <div className="flex flex-wrap gap-2">
                  {schoolTurmas.map(t => {
                    const isSelected = selectedTurmas.includes(t);
                    return (
                      <button key={t} type="button" onClick={() => toggleTurma(t)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-bold border transition ${isSelected ? 'bg-primary text-white border-primary' : 'bg-white text-on-surface-variant border-outline-variant hover:border-primary/40'}`}>
                        {isSelected && <Check size={12} />} {t}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 p-5 border-t border-outline-variant">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-bold text-on-surface-variant hover:bg-surface-container rounded-zela-md transition">Cancelar</button>
              <button type="submit" disabled={isSaving} className="flex items-center gap-1.5 bg-primary hover:bg-primary-container text-white px-4 py-2 rounded-zela-md font-bold transition-all active:scale-95 disabled:opacity-60">
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Salvar
              </button>
            </div>
          </form>
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title={`Excluir ${subjectLabel.toLowerCase()}`}
          message={`Excluir "${confirmDelete.name}"? Isso também remove todas as associações com turmas.`}
          confirmLabel="Excluir"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
